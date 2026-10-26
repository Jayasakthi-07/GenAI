/**
 * Replenishment planning (pure). The Replenishment Planner's numbers.
 *
 *   z            = Φ⁻¹(service level)
 *   safety stock = z · √(L·σd² + d̄²·σL²)
 *   reorder pt   = d̄·L + SS
 *   EOQ          = √(2·D·S / H), H = unit cost × holding rate
 *   order-up-to  = d̄·(L + R) + SS            (R = review period)
 *   quantity     = max(EOQ, order-up-to − position), capped by max stock, rounded up to MOQ / pack
 *   position     = available + on order
 */
import { clamp, inverseNormal, round } from './stats';

export interface SupplierOption {
  supplierId: string;
  supplierName: string;
  unitCost: number;
  moq: number;
  packSize: number;
  leadTimeDays: number;
  /** 0–100 from the Supplier Analyst; null = not scored yet. */
  score: number | null;
  isPreferred: boolean;
  /** Both the catalog link and the supplier are active. */
  isActive: boolean;
}

export interface PlanItemInput {
  productId: string;
  sku: string;
  name: string;
  unit: string;
  warehouseId: string;
  warehouseCode: string;
  available: number;
  onOrder: number;
  /** The configured policy (null = not set; the computed one is used). */
  reorderPoint: number | null;
  maxStock: number | null;
  /** Daily demand. */
  demandMean: number;
  demandStd: number;
  /** Where the demand numbers came from. */
  demandSource: 'forecast' | 'history';
  /** Product default when no supplier is linked. */
  leadTimeDays: number;
  /** Fallback unit cost when no supplier is linked. */
  unitCost: number;
  suppliers: SupplierOption[];
}

export interface PlanOptions {
  serviceLevel: number;
  orderCostInr: number;
  holdingRate: number;
  reviewPeriodDays: number;
  budgetInr: number;
  /** Lead-time variability as a share of the lead time (until supplier history refines it). */
  leadTimeCv: number;
}

export interface Computed {
  z: number;
  safetyStock: number;
  reorderPoint: number;
  orderUpTo: number;
  eoq: number;
}

export interface PlanLine extends Computed {
  productId: string;
  sku: string;
  name: string;
  unit: string;
  warehouseId: string;
  warehouseCode: string;
  supplierId: string | null;
  supplierName: string | null;
  supplierReason: string;
  unitCost: number;
  quantity: number;
  lineValue: number;
  available: number;
  onOrder: number;
  position: number;
  triggerPoint: number;
  demandMean: number;
  demandSource: 'forecast' | 'history';
  leadTimeDays: number;
  daysOfCover: number | null;
  coverAfter: number | null;
  /** Runs out before a new order could arrive. */
  urgent: boolean;
  priority: number;
  /** Judgment calls worth a person's (or the model's) attention. */
  flags: string[];
  rationale: string;
}

export interface Plan {
  lines: PlanLine[];
  /** Needed but over the budget. */
  deferred: PlanLine[];
  /** Below the trigger point but nothing can be ordered (no active supplier). */
  blocked: PlanLine[];
  totals: { value: number; lines: number; deferredValue: number; budget: number };
}

export function computePolicy(
  demandMean: number,
  demandStd: number,
  leadTimeDays: number,
  unitCost: number,
  opts: Pick<
    PlanOptions,
    'serviceLevel' | 'orderCostInr' | 'holdingRate' | 'reviewPeriodDays' | 'leadTimeCv'
  >,
): Computed {
  const z = inverseNormal(clamp(opts.serviceLevel, 0.5, 0.9999));
  const L = Math.max(0, leadTimeDays);
  const sigmaL = L * opts.leadTimeCv;
  const safetyStock = Math.ceil(z * Math.sqrt(L * demandStd ** 2 + demandMean ** 2 * sigmaL ** 2));
  const reorderPoint = Math.ceil(demandMean * L + safetyStock);
  const orderUpTo = Math.ceil(demandMean * (L + opts.reviewPeriodDays) + safetyStock);
  const holding = unitCost * opts.holdingRate;
  const annual = demandMean * 365;
  const eoq =
    holding > 0 && annual > 0 ? Math.ceil(Math.sqrt((2 * annual * opts.orderCostInr) / holding)) : 0;
  return { z: round(z, 3), safetyStock, reorderPoint, orderUpTo, eoq };
}

/** Rounds up to whole packs and at least the MOQ. */
export function roundToPack(quantity: number, moq: number, packSize: number): number {
  const pack = Math.max(1, packSize);
  return Math.max(Math.max(1, moq), Math.ceil(Math.max(0, quantity) / pack) * pack);
}

/**
 * Picks a supplier by weighted landed cost (50 %), lead time (30 %) and score (20 %), with a
 * small bonus for the preferred supplier.
 */
export function chooseSupplier(options: SupplierOption[]): { option: SupplierOption; reason: string } | null {
  const active = options.filter((o) => o.isActive);
  if (!active.length) return null;
  if (active.length === 1) {
    const only = active[0] as SupplierOption;
    return { option: only, reason: `Only active supplier for this item` };
  }
  const minCost = Math.min(...active.map((o) => o.unitCost));
  const minLead = Math.min(...active.map((o) => Math.max(1, o.leadTimeDays)));
  const scored = active
    .map((o) => {
      const cost = minCost / Math.max(o.unitCost, 0.01);
      const lead = minLead / Math.max(1, o.leadTimeDays);
      const quality = (o.score ?? 60) / 100;
      return { o, total: 0.5 * cost + 0.3 * lead + 0.2 * quality + (o.isPreferred ? 0.05 : 0) };
    })
    .sort((a, b) => b.total - a.total);
  const best = scored[0] as { o: SupplierOption; total: number };
  const parts: string[] = [];
  if (best.o.unitCost === minCost) parts.push('lowest cost');
  if (Math.max(1, best.o.leadTimeDays) === minLead) parts.push('shortest lead time');
  if (best.o.isPreferred) parts.push('preferred');
  if (best.o.score !== null && best.o.score >= 80) parts.push(`score ${Math.round(best.o.score)}`);
  return {
    option: best.o,
    reason: parts.length
      ? `Best balance of ${parts.join(', ')} among ${active.length} suppliers`
      : `Best weighted cost, lead time and score among ${active.length} suppliers`,
  };
}

const fmt = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 1 });

/** One line for an item, or null when it doesn't need ordering. */
export function planItem(item: PlanItemInput, opts: PlanOptions): PlanLine | null {
  const choice = chooseSupplier(item.suppliers);
  const lead = choice?.option.leadTimeDays ?? item.leadTimeDays;
  const unitCost = choice?.option.unitCost ?? item.unitCost;
  const policy = computePolicy(item.demandMean, item.demandStd, lead, unitCost, opts);
  const position = item.available + item.onOrder;
  const triggerPoint = item.reorderPoint ?? policy.reorderPoint;
  const d = item.demandMean;
  const cover = d > 0 ? item.available / d : null;

  const below = position <= triggerPoint && triggerPoint > 0;
  // No recent demand: only restore a configured reorder point, never order speculatively.
  if (!below || (d <= 0 && item.reorderPoint === null)) return null;

  const flags: string[] = [];
  const target = d > 0 ? Math.max(policy.orderUpTo, triggerPoint + 1) : triggerPoint;
  let raw = Math.max(target - position, d > 0 ? policy.eoq : 0, 1);
  if (item.maxStock !== null && item.maxStock > 0 && position + raw > item.maxStock) {
    raw = Math.max(1, item.maxStock - position);
    flags.push(`Capped at max stock ${fmt(item.maxStock)}`);
  }
  const moq = choice?.option.moq ?? 1;
  const pack = choice?.option.packSize ?? 1;
  const quantity = roundToPack(raw, moq, pack);
  if (quantity >= raw * 2 && quantity - raw >= 2)
    flags.push(
      `MOQ/pack size forces ${fmt(quantity / Math.max(1, raw))}× the needed quantity (${fmt(raw)} → ${fmt(quantity)})`,
    );
  if (d <= 0) flags.push('No sales in the demand window; restoring the configured reorder point only');
  if (item.reorderPoint !== null && d > 0) {
    const drift = (item.reorderPoint - policy.reorderPoint) / Math.max(1, policy.reorderPoint);
    if (Math.abs(drift) > 0.3)
      flags.push(
        `Configured reorder point ${fmt(item.reorderPoint)} differs from the computed ${fmt(policy.reorderPoint)}`,
      );
  }
  const urgent = item.available <= 0 || (cover !== null && cover < lead);
  if (urgent && choice && item.suppliers.filter((s) => s.isActive).length > 1) {
    const fastest = Math.min(...item.suppliers.filter((s) => s.isActive).map((s) => s.leadTimeDays));
    if (fastest < lead) flags.push(`A supplier with a ${fastest}-day lead time exists`);
  }

  const shortfall = Math.max(0, triggerPoint - position) / Math.max(1, triggerPoint);
  const priority = round(
    shortfall + (urgent ? 1 : 0) + (item.available <= 0 ? 1 : 0) + Math.min(1, (d * unitCost) / 5000),
    3,
  );
  const coverAfter = d > 0 ? (position + quantity) / d : null;
  const rationale = [
    `${fmt(item.available)} available + ${fmt(item.onOrder)} on order vs reorder point ${fmt(triggerPoint)}`,
    d > 0
      ? `selling ${fmt(d)}/day (${item.demandSource}), ${cover === null ? '' : `${fmt(cover)} days of cover, `}lead time ${lead} days`
      : 'no recent sales',
    `order ${fmt(quantity)} to reach about ${coverAfter === null ? fmt(position + quantity) + ' units' : `${fmt(coverAfter)} days of cover`}`,
  ].join('; ');

  return {
    ...policy,
    productId: item.productId,
    sku: item.sku,
    name: item.name,
    unit: item.unit,
    warehouseId: item.warehouseId,
    warehouseCode: item.warehouseCode,
    supplierId: choice?.option.supplierId ?? null,
    supplierName: choice?.option.supplierName ?? null,
    supplierReason: choice?.reason ?? 'No active supplier is linked to this product',
    unitCost,
    quantity,
    lineValue: round(quantity * unitCost, 2),
    available: item.available,
    onOrder: item.onOrder,
    position,
    triggerPoint,
    demandMean: round(d, 2),
    demandSource: item.demandSource,
    leadTimeDays: lead,
    daysOfCover: cover === null ? null : round(cover, 1),
    coverAfter: coverAfter === null ? null : round(coverAfter, 1),
    urgent,
    priority,
    flags,
    rationale,
  };
}

/** All items that need ordering, filled greedily by priority up to the budget. */
export function planReplenishment(items: PlanItemInput[], opts: PlanOptions): Plan {
  const needed = items
    .map((i) => planItem(i, opts))
    .filter((l): l is PlanLine => l !== null)
    .sort((a, b) => b.priority - a.priority || b.lineValue - a.lineValue);
  const lines: PlanLine[] = [];
  const deferred: PlanLine[] = [];
  const blocked: PlanLine[] = [];
  let value = 0;
  for (const line of needed) {
    if (!line.supplierId) {
      blocked.push(line);
    } else if (opts.budgetInr > 0 && value + line.lineValue > opts.budgetInr && !line.urgent) {
      deferred.push(line);
    } else if (opts.budgetInr > 0 && value + line.lineValue > opts.budgetInr * 1.1) {
      // Urgent lines may exceed the budget by up to 10 %; beyond that a person decides.
      deferred.push(line);
    } else {
      lines.push(line);
      value += line.lineValue;
    }
  }
  return {
    lines,
    deferred,
    blocked,
    totals: {
      value: round(value, 2),
      lines: lines.length,
      deferredValue: round(
        deferred.reduce((a, l) => a + l.lineValue, 0),
        2,
      ),
      budget: opts.budgetInr,
    },
  };
}

/** Lines grouped into one purchase order per supplier and warehouse. */
export function groupIntoOrders(lines: PlanLine[]) {
  const groups = new Map<string, PlanLine[]>();
  for (const l of lines) {
    if (!l.supplierId) continue;
    const key = `${l.supplierId}|${l.warehouseId}`;
    groups.set(key, [...(groups.get(key) ?? []), l]);
  }
  return [...groups.values()].map((ls) => {
    const first = ls[0] as PlanLine;
    return {
      supplierId: first.supplierId as string,
      supplierName: first.supplierName ?? '',
      warehouseId: first.warehouseId,
      warehouseCode: first.warehouseCode,
      lines: ls,
      value: round(
        ls.reduce((a, l) => a + l.lineValue, 0),
        2,
      ),
      urgent: ls.some((l) => l.urgent),
    };
  });
}
