/**
 * Supplier performance scoring (pure). Used by the supplier scorecard and the Supplier Analyst.
 *
 * score = 35% on-time + 20% fill + 15% lead-time stability + 15% price + 15% quality, each 0–100.
 */

export interface PoRecord {
  id: string;
  number: string;
  orderDate: string; // YYYY-MM-DD
  expectedDate: string | null;
  status: string;
  lines: Array<{ productId: string; ordered: number; received: number; rejected: number; unitCost: number }>;
  receipts: Array<{ number: string; receivedDate: string; received: number; rejected: number }>;
}

export interface SupplierMetrics {
  orders: number;
  receipts: number;
  spend: number;
  onTimeRate: number | null;
  avgLeadTimeDays: number | null;
  leadTimeCv: number | null;
  fillRate: number | null;
  rejectionRate: number | null;
  priceChange: number | null;
  overdue: number;
}

export interface SupplierScore {
  metrics: SupplierMetrics;
  breakdown: {
    onTime: number | null;
    fill: number | null;
    leadTime: number | null;
    price: number | null;
    quality: number | null;
  };
  score: number | null;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | null;
  flags: string[];
}

const WEIGHTS = { onTime: 0.35, fill: 0.2, leadTime: 0.15, price: 0.15, quality: 0.15 };
/** Deliveries up to this many days after the expected date still count as on time. */
export const GRACE_DAYS = 1;

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const days = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
const pct = (x: number) => `${Math.round(x * 100)}%`;
const addDays = (day: string, n: number) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

function mean(xs: number[]): number | null {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

function stdev(xs: number[]): number | null {
  const m = mean(xs);
  if (m === null || xs.length < 2) return null;
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
}

/** Share of deliveries on time, counting open POs already past their expected date as late. */
function onTimeOf(pos: PoRecord[], today: string): { rate: number | null; overdue: number } {
  let onTime = 0;
  let total = 0;
  let overdue = 0;
  for (const po of pos) {
    if (!po.expectedDate) continue;
    const first = po.receipts.map((r) => r.receivedDate).sort()[0];
    if (first) {
      total++;
      if (days(po.expectedDate, first) <= GRACE_DAYS) onTime++;
    } else if (['APPROVED', 'SENT'].includes(po.status) && days(po.expectedDate, today) > GRACE_DAYS) {
      total++;
      overdue++;
    }
  }
  return { rate: total ? onTime / total : null, overdue };
}

/** Weighted change in unit cost: last 90 days vs the 90 before, per product, weighted by recent spend. */
function priceChangeOf(pos: PoRecord[], today: string): number | null {
  const recentFrom = addDays(today, -90);
  const priorFrom = addDays(today, -180);
  const byProduct = new Map<string, { recent: number[]; prior: number[]; spend: number }>();
  for (const po of pos) {
    const bucket = po.orderDate >= recentFrom ? 'recent' : po.orderDate >= priorFrom ? 'prior' : null;
    if (!bucket) continue;
    for (const l of po.lines) {
      const e = byProduct.get(l.productId) ?? { recent: [], prior: [], spend: 0 };
      e[bucket].push(l.unitCost);
      if (bucket === 'recent') e.spend += l.unitCost * l.ordered;
      byProduct.set(l.productId, e);
    }
  }
  let weighted = 0;
  let weight = 0;
  for (const e of byProduct.values()) {
    const r = mean(e.recent);
    const p = mean(e.prior);
    if (r === null || p === null || p <= 0) continue;
    weighted += (r / p - 1) * e.spend;
    weight += e.spend;
  }
  return weight > 0 ? weighted / weight : null;
}

export function scoreSupplier(pos: PoRecord[], today: string, recentDays = 60): SupplierScore {
  const active = pos.filter(
    (p) => p.status !== 'CANCELLED' && p.status !== 'DRAFT' && p.status !== 'PENDING_APPROVAL',
  );
  const { rate: onTimeRate, overdue } = onTimeOf(active, today);

  const leadTimes = active
    .map((po) => {
      const first = po.receipts.map((r) => r.receivedDate).sort()[0];
      return first ? days(po.orderDate, first) : null;
    })
    .filter((x): x is number => x !== null && x >= 0);
  const avgLead = mean(leadTimes);
  const sdLead = stdev(leadTimes);
  const cv = avgLead && sdLead !== null ? sdLead / avgLead : null;

  const settled = active.filter((p) => p.status === 'RECEIVED' || p.status === 'CLOSED');
  const ordered = settled.reduce((a, p) => a + p.lines.reduce((s, l) => s + l.ordered, 0), 0);
  const delivered = settled.reduce((a, p) => a + p.lines.reduce((s, l) => s + l.received + l.rejected, 0), 0);
  const fillRate = ordered > 0 ? delivered / ordered : null;

  const allDelivered = active.reduce(
    (a, p) => a + p.receipts.reduce((s, r) => s + r.received + r.rejected, 0),
    0,
  );
  const rejected = active.reduce((a, p) => a + p.receipts.reduce((s, r) => s + r.rejected, 0), 0);
  const rejectionRate = allDelivered > 0 ? rejected / allDelivered : null;
  const priceChange = priceChangeOf(active, today);
  const spend = active.reduce((a, p) => a + p.lines.reduce((s, l) => s + l.ordered * l.unitCost, 0), 0);

  const breakdown = {
    onTime: onTimeRate === null ? null : Math.round(onTimeRate * 100),
    fill: fillRate === null ? null : Math.round(clamp01((fillRate - 0.7) / 0.3) * 100),
    leadTime: cv === null ? null : Math.round(clamp01(1 - cv / 0.6) * 100),
    price: priceChange === null ? null : Math.round(clamp01(1 - Math.max(0, priceChange) / 0.2) * 100),
    quality: rejectionRate === null ? null : Math.round(clamp01(1 - rejectionRate / 0.05) * 100),
  };
  // Missing components are left out and the remaining weights re-normalised.
  let total = 0;
  let weight = 0;
  for (const [k, w] of Object.entries(WEIGHTS) as Array<[keyof typeof WEIGHTS, number]>) {
    const v = breakdown[k];
    if (v === null) continue;
    total += v * w;
    weight += w;
  }
  const score = weight >= 0.5 ? Math.round((total / weight) * 10) / 10 : null;

  // Recent reliability versus the earlier part of the window.
  const recentFrom = addDays(today, -recentDays);
  const recent = onTimeOf(
    active.filter((p) => (p.expectedDate ?? p.orderDate) >= recentFrom),
    today,
  ).rate;
  const earlier = onTimeOf(
    active.filter((p) => (p.expectedDate ?? p.orderDate) < recentFrom),
    today,
  ).rate;

  const flags: string[] = [];
  if (recent !== null && earlier !== null && earlier - recent >= 0.15) {
    flags.push(
      `On-time delivery fell to ${pct(recent)} in the last ${recentDays} days (was ${pct(earlier)}).`,
    );
  } else if (onTimeRate !== null && onTimeRate < 0.8) {
    flags.push(`Only ${pct(onTimeRate)} of deliveries arrive on time.`);
  }
  if (overdue > 0) flags.push(`${overdue} purchase order${overdue === 1 ? ' is' : 's are'} overdue.`);
  if (fillRate !== null && fillRate < 0.9)
    flags.push(`Delivers ${pct(fillRate)} of ordered quantities on average.`);
  if (cv !== null && cv > 0.35)
    flags.push(
      `Lead time is unpredictable (varies ±${Math.round(cv * 100)}% around ${Math.round(avgLead ?? 0)} days).`,
    );
  if (priceChange !== null && priceChange > 0.08)
    flags.push(`Unit costs up ${pct(priceChange)} over the last 90 days.`);
  if (rejectionRate !== null && rejectionRate > 0.02)
    flags.push(`${pct(rejectionRate)} of delivered units were rejected on inspection.`);

  let riskLevel: SupplierScore['riskLevel'] = null;
  if (score !== null) {
    riskLevel =
      score < 60 || (onTimeRate ?? 1) < 0.7 || overdue >= 2 || (recent !== null && recent < 0.6)
        ? 'HIGH'
        : score < 78 || (onTimeRate ?? 1) < 0.85 || (priceChange ?? 0) > 0.1 || overdue === 1
          ? 'MEDIUM'
          : 'LOW';
  }

  return {
    metrics: {
      orders: active.length,
      receipts: active.reduce((a, p) => a + p.receipts.length, 0),
      spend: Math.round(spend * 100) / 100,
      onTimeRate,
      avgLeadTimeDays: avgLead === null ? null : Math.round(avgLead * 10) / 10,
      leadTimeCv: cv === null ? null : Math.round(cv * 100) / 100,
      fillRate,
      rejectionRate,
      priceChange,
      overdue,
    },
    breakdown,
    score,
    riskLevel,
    flags,
  };
}
