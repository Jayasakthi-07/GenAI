/**
 * Deterministic stock-health analysis (the Stock Sentinel's number-crunching core).
 * Pure: takes positions and batches, returns findings with facts, severity and a rule-based explanation.
 */

export type Severity = 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type StockAlertType =
  'OUT_OF_STOCK' | 'LOW_STOCK' | 'PROJECTED_STOCKOUT' | 'OVERSTOCK' | 'EXPIRING_BATCH';

export interface PositionInput {
  productId: string;
  sku: string;
  productName: string;
  unit: string;
  warehouseId: string;
  warehouseCode: string;
  onHand: number;
  available: number;
  onOrder: number;
  reorderPoint: number | null;
  maxStock: number | null;
  avgDailyDemand: number;
  leadTimeDays: number;
  unitCost: number;
  /** Earliest expected date (YYYY-MM-DD) among open POs for this location, if any. */
  nextDelivery: { number: string; expectedDate: string | null } | null;
}

export interface BatchInput {
  batchId: string;
  batchNo: string;
  productId: string;
  sku: string;
  productName: string;
  unit: string;
  warehouseId: string;
  warehouseCode: string;
  quantity: number;
  expiryDate: string;
  unitCost: number;
  avgDailyDemand: number;
}

export interface Finding {
  type: StockAlertType;
  dedupeKey: string;
  severity: Severity;
  priority: number;
  title: string;
  message: string;
  explanation: string;
  productId: string;
  warehouseId: string;
  batchId?: string;
  data: Record<string, unknown>;
}

export interface AnalyzeOptions {
  today: string;
  expiryWarningDays: number;
  overstockDays: number;
  /** Ignore overstock below this value (₹). */
  overstockMinValue: number;
}

const SEVERITY_BASE: Record<Severity, number> = { CRITICAL: 90, HIGH: 72, MEDIUM: 52, LOW: 32, INFO: 12 };

const round1 = (n: number) => Math.round(n * 10) / 10;
const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
const units = (n: number, unit: string) => `${n.toLocaleString('en-IN')} ${unit}`;

/** Priority 0–100: severity first, then the rupee value of demand at stake, then urgency. */
function priority(severity: Severity, dailyValue: number, urgencyDays: number | null): number {
  const valueBoost = Math.min(12, Math.log10(1 + Math.max(0, dailyValue)) * 3);
  const urgencyBoost = urgencyDays === null ? 0 : Math.max(0, 6 - urgencyDays);
  return Math.max(0, Math.min(100, Math.round(SEVERITY_BASE[severity] + valueBoost + urgencyBoost)));
}

function deliveryNote(p: PositionInput, today: string): { text: string; lateBy: number | null } {
  if (!p.nextDelivery) return { text: 'No purchase order is open.', lateBy: null };
  if (!p.nextDelivery.expectedDate)
    return { text: `${p.nextDelivery.number} is open with no expected date.`, lateBy: null };
  const inDays = daysBetween(today, p.nextDelivery.expectedDate);
  if (inDays < 0) return { text: `${p.nextDelivery.number} is ${-inDays} day(s) overdue.`, lateBy: -inDays };
  return { text: `${p.nextDelivery.number} is due in ${inDays} day(s).`, lateBy: null };
}

export function analyzePositions(positions: PositionInput[], opts: AnalyzeOptions): Finding[] {
  const findings: Finding[] = [];
  for (const p of positions) {
    const d = p.avgDailyDemand;
    const cover = d > 0 ? p.available / d : null;
    const dailyValue = d * p.unitCost;
    const where = `${p.productName} at ${p.warehouseCode}`;
    const base = {
      productId: p.productId,
      warehouseId: p.warehouseId,
      data: {
        sku: p.sku,
        warehouse: p.warehouseCode,
        onHand: p.onHand,
        available: p.available,
        onOrder: p.onOrder,
        reorderPoint: p.reorderPoint,
        maxStock: p.maxStock,
        avgDailyDemand: round1(d),
        daysOfCover: cover === null ? null : round1(cover),
        leadTimeDays: p.leadTimeDays,
        nextDelivery: p.nextDelivery,
      } as Record<string, unknown>,
    };
    const delivery = deliveryNote(p, opts.today);

    // Out of stock: nothing available and the item actually sells (or has a reorder point).
    if (p.available <= 0 && (d > 0 || (p.reorderPoint ?? 0) > 0)) {
      const severity: Severity = d >= 1 || delivery.lateBy !== null ? 'CRITICAL' : 'HIGH';
      findings.push({
        ...base,
        type: 'OUT_OF_STOCK',
        dedupeKey: `OUT_OF_STOCK:${p.productId}:${p.warehouseId}`,
        severity,
        priority: priority(severity, dailyValue, 0),
        title: `${p.productName} is out of stock at ${p.warehouseCode}`,
        message: `0 available (${units(p.onHand, p.unit)} on hand, ${units(p.onOrder, p.unit)} on order). Selling about ${round1(d)} ${p.unit}/day. ${delivery.text}`,
        explanation:
          p.onOrder > 0
            ? `Orders are going unfilled while stock is on order. ${delivery.lateBy ? 'Chase the supplier or buy from an alternate.' : 'Consider a faster alternate supplier until the delivery arrives.'}`
            : `Nothing is on order. Raise a purchase order now; lead time is ${p.leadTimeDays} day(s).`,
      });
      continue;
    }

    // Low: at or below the reorder point with not enough on order.
    if (p.reorderPoint !== null && p.available > 0 && p.available + p.onOrder <= p.reorderPoint) {
      const urgent = cover !== null && cover < p.leadTimeDays;
      const severity: Severity = urgent ? 'HIGH' : 'MEDIUM';
      findings.push({
        ...base,
        type: 'LOW_STOCK',
        dedupeKey: `LOW_STOCK:${p.productId}:${p.warehouseId}`,
        severity,
        priority: priority(severity, dailyValue, cover),
        title: `${where} is below its reorder point`,
        message: `${units(p.available, p.unit)} available + ${units(p.onOrder, p.unit)} on order vs reorder point ${p.reorderPoint}. ${cover !== null ? `About ${round1(cover)} days of cover` : 'No recent sales'}; lead time ${p.leadTimeDays} days.`,
        explanation: urgent
          ? `Stock will likely run out before a new order arrives (${round1(cover ?? 0)} days of cover vs ${p.leadTimeDays}-day lead time). Reorder today.`
          : `Reorder soon to stay above safety stock.`,
      });
      continue;
    }

    // Projected stockout: enough on order on paper, but it arrives after the shelf empties.
    if (cover !== null && p.available > 0 && cover < p.leadTimeDays) {
      const stockoutDay = Math.floor(cover);
      const due = p.nextDelivery?.expectedDate ? daysBetween(opts.today, p.nextDelivery.expectedDate) : null;
      if (p.onOrder === 0 || due === null || due > stockoutDay) {
        const severity: Severity = cover < 2 ? 'HIGH' : 'MEDIUM';
        findings.push({
          ...base,
          type: 'PROJECTED_STOCKOUT',
          dedupeKey: `PROJECTED_STOCKOUT:${p.productId}:${p.warehouseId}`,
          severity,
          priority: priority(severity, dailyValue, cover),
          title: `${where} may run out in ${round1(cover)} days`,
          message: `${units(p.available, p.unit)} available covers about ${round1(cover)} days at ${round1(d)} ${p.unit}/day. ${delivery.text}`,
          explanation:
            due !== null && due > stockoutDay
              ? `The next delivery lands about ${due - stockoutDay} day(s) after stock runs out. Expedite it or cover the gap.`
              : `Stock runs out before a new order could arrive (${p.leadTimeDays}-day lead time).`,
        });
        continue;
      }
    }

    // Overstock: far more than the item sells, with meaningful money tied up.
    const excessUnits = p.maxStock !== null ? p.onHand - p.maxStock : 0;
    const coverAll = d > 0 ? p.onHand / d : Number.POSITIVE_INFINITY;
    const excessValue = Math.max(0, excessUnits) * p.unitCost;
    if (
      p.maxStock !== null &&
      p.onHand > 2 * p.maxStock &&
      coverAll > opts.overstockDays &&
      excessValue >= opts.overstockMinValue
    ) {
      const severity: Severity = excessValue >= 50_000 ? 'MEDIUM' : 'LOW';
      findings.push({
        ...base,
        type: 'OVERSTOCK',
        dedupeKey: `OVERSTOCK:${p.productId}:${p.warehouseId}`,
        severity,
        priority: priority(severity, excessValue / 30, null),
        title: `${where} is overstocked`,
        message: `${units(p.onHand, p.unit)} on hand vs max ${p.maxStock}${Number.isFinite(coverAll) ? ` — about ${Math.round(coverAll)} days of demand` : ' with no recent sales'}. ${inr(excessValue)} above the maximum.`,
        explanation: `Pause reordering; consider moving stock to another warehouse or a promotion to free up ${inr(excessValue)}.`,
        data: { ...base.data, excessUnits, excessValue: Math.round(excessValue) },
      });
    }
  }
  return findings;
}

export function analyzeBatches(batches: BatchInput[], opts: AnalyzeOptions): Finding[] {
  const findings: Finding[] = [];
  for (const b of batches) {
    if (b.quantity <= 0) continue;
    const daysLeft = daysBetween(opts.today, b.expiryDate);
    if (daysLeft > opts.expiryWarningDays) continue;
    const sellable = Math.max(0, Math.floor(b.avgDailyDemand * Math.max(0, daysLeft)));
    const atRisk = daysLeft < 0 ? b.quantity : Math.max(0, b.quantity - sellable);
    if (daysLeft >= 0 && atRisk === 0) continue;
    const value = atRisk * b.unitCost;
    const severity: Severity = daysLeft < 0 ? 'HIGH' : daysLeft <= 3 || value >= 10_000 ? 'HIGH' : 'MEDIUM';
    findings.push({
      type: 'EXPIRING_BATCH',
      dedupeKey: `EXPIRING_BATCH:${b.batchId}`,
      severity,
      priority: priority(severity, value / Math.max(1, daysLeft), Math.max(0, daysLeft)),
      title:
        daysLeft < 0
          ? `Expired stock: ${b.productName} batch ${b.batchNo} at ${b.warehouseCode}`
          : `${b.productName} batch ${b.batchNo} expires in ${daysLeft} day(s)`,
      message:
        daysLeft < 0
          ? `${units(b.quantity, b.unit)} expired ${-daysLeft} day(s) ago and is still on hand (${inr(value)}).`
          : `${units(b.quantity, b.unit)} left; at ${round1(b.avgDailyDemand)} ${b.unit}/day about ${units(Math.min(b.quantity, sellable), b.unit)} will sell before ${b.expiryDate}, leaving ${units(atRisk, b.unit)} (${inr(value)}) at risk.`,
      explanation:
        daysLeft < 0
          ? 'Write it off and remove it from the shelf; it can no longer be sold.'
          : 'Sell this batch first (FEFO), move it to a faster-selling warehouse, or mark it down.',
      productId: b.productId,
      warehouseId: b.warehouseId,
      batchId: b.batchId,
      data: {
        sku: b.sku,
        warehouse: b.warehouseCode,
        batchNo: b.batchNo,
        expiryDate: b.expiryDate,
        daysToExpiry: daysLeft,
        quantity: b.quantity,
        expectedToSell: Math.min(b.quantity, sellable),
        atRiskUnits: atRisk,
        atRiskValue: Math.round(value),
        avgDailyDemand: round1(b.avgDailyDemand),
      },
    });
  }
  return findings;
}
