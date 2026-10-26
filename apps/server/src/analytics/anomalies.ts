/**
 * Anomaly detection (pure). The Anomaly Auditor's numbers.
 *
 *   robust z  = 0.6745 · (x − median) / MAD          (spike when z > 3.5 and at least 5× the median)
 *   shrinkage = ≥ 3 losses (adjustments or write-offs other than expiry) for one product × warehouse in 14 days
 *   counts    = |variance| > 5 % of the expected quantity, or its value > ₹1,000
 *   receipts  = received unit cost ≠ PO cost by > 5 %, or a PO closed more than 5 % short
 *   cost jump = latest unit cost > 15 % above the median of the previous 90 days
 */
import { median, round } from './stats';

export type Severity = 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface AnomalyFinding {
  type: 'DEMAND_SPIKE' | 'ANOMALY';
  kind: 'demand_spike' | 'shrinkage' | 'count_variance' | 'receipt_price' | 'receipt_short' | 'cost_jump';
  dedupeKey: string;
  severity: Severity;
  priority: number;
  title: string;
  message: string;
  explanation: string;
  productId: string;
  warehouseId: string | null;
  supplierId?: string | null;
  data: Record<string, unknown>;
  /** A cycle count would settle this (shrinkage, count variances). */
  countSuggested: boolean;
}

export const SPIKE_Z = 3.5;
const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
const pct = (x: number) => `${Math.round(x * 100)}%`;

/** 0.6745·(x − median)/MAD; falls back to the mean absolute deviation when MAD is 0. */
export function robustZ(history: readonly number[], x: number): number | null {
  if (history.length < 7) return null;
  const med = median(history);
  const mad = median(history.map((v) => Math.abs(v - med)));
  if (mad > 0) return round((0.6745 * (x - med)) / mad, 2);
  const meanAbs = history.reduce((a, v) => a + Math.abs(v - med), 0) / history.length;
  return meanAbs > 0 ? round((x - med) / (1.2533 * meanAbs), 2) : x > med ? Infinity : 0;
}

export interface DemandSeries {
  productId: string;
  sku: string;
  name: string;
  warehouseId: string;
  warehouseCode: string;
  /** Daily units, oldest first, ending today. */
  daily: number[];
  dates: string[];
}

/** Days in the last `recent` days whose demand is far above the preceding baseline. */
export function demandSpikes(
  series: DemandSeries[],
  opts = { recent: 7, baseline: 56, minUnits: 15, minRatio: 5 },
): AnomalyFinding[] {
  const out: AnomalyFinding[] = [];
  for (const s of series) {
    const n = s.daily.length;
    if (n < opts.recent + 14) continue;
    const base = s.daily.slice(Math.max(0, n - opts.recent - opts.baseline), n - opts.recent);
    let worst: { i: number; z: number } | null = null;
    for (let i = n - opts.recent; i < n; i++) {
      const x = s.daily[i] ?? 0;
      if (x < opts.minUnits) continue;
      const z = robustZ(base, x);
      const med = median(base);
      // Weekly peaks clear the z-score easily; a real spike is also a multiple of normal demand.
      if (med > 0 && x < med * opts.minRatio) continue;
      if (z !== null && z > SPIKE_Z && (!worst || z > worst.z)) worst = { i, z };
    }
    if (!worst) continue;
    const x = s.daily[worst.i] ?? 0;
    const med = median(base);
    const ratio = med > 0 ? x / med : null;
    const date = s.dates[worst.i] ?? '';
    const z = Number.isFinite(worst.z) ? worst.z : 99;
    const severity: Severity = z > 10 ? 'HIGH' : 'MEDIUM';
    out.push({
      type: 'DEMAND_SPIKE',
      kind: 'demand_spike',
      dedupeKey: `DEMAND_SPIKE:${s.productId}:${s.warehouseId}:${date}`,
      severity,
      priority: severity === 'HIGH' ? 70 : 55,
      title: `Demand spike: ${s.name} at ${s.warehouseCode}`,
      message: `${x.toLocaleString('en-IN')} units sold on ${date} against a typical ${round(med, 1)} a day${ratio ? ` (${round(ratio, 1)}×)` : ''}; robust z-score ${z}.`,
      explanation:
        'A one-off bulk order or a data-entry error. Confirm the order is genuine before it feeds forecasts and reorders.',
      productId: s.productId,
      warehouseId: s.warehouseId,
      data: {
        sku: s.sku,
        warehouse: s.warehouseCode,
        date,
        units: x,
        typicalDaily: round(med, 2),
        robustZ: z,
      },
      countSuggested: false,
    });
  }
  return out;
}

export interface Adjustment {
  productId: string;
  sku: string;
  name: string;
  warehouseId: string;
  warehouseCode: string;
  date: string;
  /** Negative for losses. */
  quantity: number;
  reason: string | null;
  unitCost: number;
}

export function repeatedLosses(
  adjustments: Adjustment[],
  today: string,
  opts = { windowDays: 14, minCount: 3 },
): AnomalyFinding[] {
  const from = new Date(`${today}T00:00:00Z`);
  from.setUTCDate(from.getUTCDate() - opts.windowDays);
  const since = from.toISOString().slice(0, 10);
  const groups = new Map<string, Adjustment[]>();
  for (const a of adjustments) {
    // Writing off expired goods is routine for perishables; expiry has its own alerts.
    if (a.quantity >= 0 || a.date < since || a.reason === 'EXPIRED') continue;
    const k = `${a.productId}|${a.warehouseId}`;
    groups.set(k, [...(groups.get(k) ?? []), a]);
  }
  const out: AnomalyFinding[] = [];
  for (const list of groups.values()) {
    if (list.length < opts.minCount) continue;
    const first = list[0] as Adjustment;
    const units = -list.reduce((s, a) => s + a.quantity, 0);
    const value = -list.reduce((s, a) => s + a.quantity * a.unitCost, 0);
    const reasons = [...new Set(list.map((a) => a.reason ?? 'no reason'))];
    const severity: Severity = list.length >= 4 || value > 5000 ? 'HIGH' : 'MEDIUM';
    out.push({
      type: 'ANOMALY',
      kind: 'shrinkage',
      dedupeKey: `ANOMALY:shrinkage:${first.productId}:${first.warehouseId}`,
      severity,
      priority: severity === 'HIGH' ? 68 : 52,
      title: `Repeated stock losses: ${first.name} at ${first.warehouseCode}`,
      message: `${list.length} negative adjustments in ${opts.windowDays} days, ${units} units (${inr(value)}): ${reasons.join(', ').toLowerCase()}.`,
      explanation:
        'A pattern of losses on one item usually means theft, damage in handling or miscounts. Count it and check where it is stored.',
      productId: first.productId,
      warehouseId: first.warehouseId,
      data: {
        sku: first.sku,
        warehouse: first.warehouseCode,
        events: list.length,
        units,
        value: Math.round(value),
        reasons,
        dates: list.map((a) => a.date),
      },
      countSuggested: true,
    });
  }
  return out;
}

export interface CountLine {
  cycleCountId: string;
  countNumber: string;
  productId: string;
  sku: string;
  name: string;
  warehouseId: string;
  warehouseCode: string;
  expected: number;
  counted: number;
  unitCost: number;
  date: string;
}

export function countVariances(lines: CountLine[], opts = { pct: 0.05, valueInr: 1000 }): AnomalyFinding[] {
  const out: AnomalyFinding[] = [];
  for (const l of lines) {
    const variance = l.counted - l.expected;
    if (variance === 0) continue;
    const share = l.expected > 0 ? Math.abs(variance) / l.expected : 1;
    const value = Math.abs(variance) * l.unitCost;
    if (share <= opts.pct && value <= opts.valueInr) continue;
    const severity: Severity = share > 0.1 || value > 5000 ? 'HIGH' : 'MEDIUM';
    out.push({
      type: 'ANOMALY',
      kind: 'count_variance',
      dedupeKey: `ANOMALY:count:${l.cycleCountId}:${l.productId}`,
      severity,
      priority: severity === 'HIGH' ? 64 : 48,
      title: `Count variance: ${l.name} at ${l.warehouseCode}`,
      message: `${l.countNumber} counted ${l.counted} against ${l.expected} expected (${variance > 0 ? '+' : ''}${variance}, ${pct(share)}, ${inr(value)}).`,
      explanation:
        variance < 0
          ? 'Stock is missing compared with the records. Recount before writing off, and check recent receipts and transfers.'
          : 'More stock than recorded: a receipt or return may not have been booked.',
      productId: l.productId,
      warehouseId: l.warehouseId,
      data: {
        sku: l.sku,
        warehouse: l.warehouseCode,
        count: l.countNumber,
        expected: l.expected,
        counted: l.counted,
        variance,
        varianceShare: round(share, 3),
        value: Math.round(value),
      },
      countSuggested: true,
    });
  }
  return out;
}

export interface ReceiptLine {
  receiptNumber: string;
  poNumber: string;
  supplierId: string;
  supplierName: string;
  productId: string;
  sku: string;
  name: string;
  warehouseId: string;
  warehouseCode: string;
  ordered: number;
  poStatus: string;
  poExpectedDate: string | null;
  /** Everything received on this PO line so far. */
  receivedToDate: number;
  received: number;
  poUnitCost: number;
  receivedUnitCost: number;
  date: string;
}

export function receiptMismatches(
  lines: ReceiptLine[],
  opts = { priceTol: 0.05, qtyTol: 0.05 },
): AnomalyFinding[] {
  const out: AnomalyFinding[] = [];
  for (const l of lines) {
    const drift = l.poUnitCost > 0 ? (l.receivedUnitCost - l.poUnitCost) / l.poUnitCost : 0;
    if (Math.abs(drift) > opts.priceTol) {
      const extra = (l.receivedUnitCost - l.poUnitCost) * l.received;
      const severity: Severity = Math.abs(drift) > 0.1 ? 'HIGH' : 'MEDIUM';
      out.push({
        type: 'ANOMALY',
        kind: 'receipt_price',
        dedupeKey: `ANOMALY:receipt_price:${l.receiptNumber}:${l.productId}`,
        severity,
        priority: severity === 'HIGH' ? 66 : 50,
        title: `Invoiced above the PO price: ${l.name}`,
        message: `${l.receiptNumber} for ${l.poNumber} (${l.supplierName}) billed ${inr(l.receivedUnitCost)} vs ${inr(l.poUnitCost)} on the PO (${drift > 0 ? '+' : ''}${pct(drift)}, ${inr(extra)} on ${l.received} units).`,
        explanation:
          'Check the invoice against the agreed price before paying, and ask the supplier for a credit note if it is wrong.',
        productId: l.productId,
        warehouseId: l.warehouseId,
        supplierId: l.supplierId,
        data: {
          sku: l.sku,
          supplier: l.supplierName,
          receipt: l.receiptNumber,
          po: l.poNumber,
          poUnitCost: l.poUnitCost,
          invoicedUnitCost: l.receivedUnitCost,
          change: round(drift, 4),
          extra: Math.round(extra),
        },
        countSuggested: false,
      });
    }
    const short = l.ordered > 0 ? (l.ordered - l.receivedToDate) / l.ordered : 0;
    // Partial deliveries are normal while a PO is open (late ones are the Sentinel's overdue
    // POs); it's a mismatch when the PO was closed short.
    const settled = l.poStatus === 'RECEIVED' || l.poStatus === 'CLOSED';
    if (short > opts.qtyTol && l.receivedToDate > 0 && settled) {
      out.push({
        type: 'ANOMALY',
        kind: 'receipt_short',
        dedupeKey: `ANOMALY:receipt_short:${l.poNumber}:${l.productId}`,
        severity: 'LOW',
        priority: 36,
        title: `Short delivery: ${l.name}`,
        message: `${l.poNumber} (${l.supplierName}) was closed with ${l.receivedToDate} of ${l.ordered} received (${pct(short)} short).`,
        explanation:
          'Check whether you were invoiced for the full quantity, and factor the shortfall into this supplier’s score.',
        productId: l.productId,
        warehouseId: l.warehouseId,
        supplierId: l.supplierId,
        data: {
          sku: l.sku,
          supplier: l.supplierName,
          po: l.poNumber,
          ordered: l.ordered,
          received: l.receivedToDate,
        },
        countSuggested: false,
      });
    }
  }
  return out;
}

export interface CostPoint {
  productId: string;
  sku: string;
  name: string;
  supplierId: string;
  supplierName: string;
  date: string;
  unitCost: number;
}

export function costJumps(
  points: CostPoint[],
  today: string,
  opts = { windowDays: 90, threshold: 0.15 },
): AnomalyFinding[] {
  const groups = new Map<string, CostPoint[]>();
  for (const p of points) {
    const k = `${p.productId}|${p.supplierId}`;
    groups.set(k, [...(groups.get(k) ?? []), p]);
  }
  const start = new Date(`${today}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() - opts.windowDays);
  const since = start.toISOString().slice(0, 10);
  const out: AnomalyFinding[] = [];
  for (const list of groups.values()) {
    const sorted = [...list].sort((a, b) => a.date.localeCompare(b.date));
    const latest = sorted.at(-1);
    if (!latest) continue;
    const prior = sorted.slice(0, -1).filter((p) => p.date >= since && p.unitCost !== latest.unitCost);
    const all = sorted.slice(0, -1).filter((p) => p.date >= since);
    if (all.length < 2 || !prior.length) continue;
    const base = median(all.map((p) => p.unitCost));
    const jump = base > 0 ? (latest.unitCost - base) / base : 0;
    if (jump <= opts.threshold) continue;
    out.push({
      type: 'ANOMALY',
      kind: 'cost_jump',
      dedupeKey: `ANOMALY:cost_jump:${latest.productId}:${latest.supplierId}`,
      severity: jump > 0.25 ? 'HIGH' : 'MEDIUM',
      priority: jump > 0.25 ? 62 : 46,
      title: `Cost jump: ${latest.name} from ${latest.supplierName}`,
      message: `Latest unit cost ${inr(latest.unitCost)} on ${latest.date} vs a ${opts.windowDays}-day median of ${inr(base)} (+${pct(jump)}).`,
      explanation:
        'Compare with other suppliers of this product and renegotiate, or switch if the increase is not justified.',
      productId: latest.productId,
      warehouseId: null,
      supplierId: latest.supplierId,
      data: {
        sku: latest.sku,
        supplier: latest.supplierName,
        latestCost: latest.unitCost,
        medianCost: round(base, 2),
        change: round(jump, 4),
        orders: all.length + 1,
      },
      countSuggested: false,
    });
  }
  return out;
}
