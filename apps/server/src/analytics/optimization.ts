/**
 * Inventory optimization (pure). The Inventory Optimizer's numbers.
 *
 *   ABC        products by annual consumption value (cost of goods sold, last 365 days):
 *              A = first 80 % of value, B = next 15 %, C = the rest
 *   XYZ        coefficient of variation of weekly demand: X ≤ 0.5, Y ≤ 1.0, Z > 1.0 (or no demand)
 *   dead       on hand > 0 and no sale for `deadDays`
 *   slow       days of cover > `slowCoverDays`
 *   rebalance  source cover > 2× target and destination cover < its lead time; move enough to bring
 *              the destination to target without taking the source below target
 *   drift      configured reorder point differs from the computed one by more than 30 %
 */
import { cv, round } from './stats';

export type Abc = 'A' | 'B' | 'C';
export type Xyz = 'X' | 'Y' | 'Z';

export function abcClassify(
  items: Array<{ id: string; value: number }>,
  cuts = { a: 0.8, b: 0.95 },
): Map<string, Abc> {
  const total = items.reduce((s, i) => s + Math.max(0, i.value), 0);
  const out = new Map<string, Abc>();
  let running = 0;
  for (const i of [...items].sort((x, y) => y.value - x.value)) {
    if (total <= 0 || i.value <= 0) {
      out.set(i.id, 'C');
      continue;
    }
    // Classified by where the item starts, so the item that crosses 80 % is still an A.
    const share = running / total;
    out.set(i.id, share < cuts.a ? 'A' : share < cuts.b ? 'B' : 'C');
    running += i.value;
  }
  return out;
}

export function xyzClassify(weekly: readonly number[]): Xyz {
  const c = cv(weekly);
  if (c === null) return 'Z';
  return c <= 0.5 ? 'X' : c <= 1 ? 'Y' : 'Z';
}

export interface StockLine {
  productId: string;
  sku: string;
  name: string;
  warehouseId: string;
  warehouseCode: string;
  onHand: number;
  available: number;
  unitCost: number;
  sellingPrice: number;
  costPrice: number;
  avgDaily: number;
  daysSinceSale: number | null;
  leadTimeDays: number;
  configuredRop: number | null;
  computedRop: number | null;
  safetyStock: number | null;
  maxStock: number | null;
}

export interface DeadOrSlow {
  kind: 'dead' | 'slow';
  line: StockLine;
  value: number;
  coverDays: number | null;
  /** Suggested clearance price: halfway to cost, at least 10 % off, never below cost. */
  markdownPrice: number | null;
  markdownPct: number | null;
}

export function deadAndSlow(
  lines: StockLine[],
  opts = { deadDays: 90, slowCoverDays: 180, minValue: 2000 },
): DeadOrSlow[] {
  const out: DeadOrSlow[] = [];
  for (const l of lines) {
    if (l.onHand <= 0) continue;
    const value = l.onHand * l.unitCost;
    if (value < opts.minValue) continue;
    const cover = l.avgDaily > 0 ? l.available / l.avgDaily : null;
    const dead = l.daysSinceSale === null || l.daysSinceSale >= opts.deadDays;
    const slow = !dead && cover !== null && cover > opts.slowCoverDays;
    if (!dead && !slow) continue;
    let markdownPrice: number | null = null;
    let markdownPct: number | null = null;
    if (l.sellingPrice > l.costPrice) {
      const target = Math.max(
        l.costPrice,
        Math.min(l.sellingPrice * 0.9, (l.sellingPrice + l.costPrice) / 2),
      );
      markdownPrice = Math.floor(target * 100) / 100;
      markdownPct = round(1 - markdownPrice / l.sellingPrice, 3);
      if (markdownPct < 0.05) markdownPrice = markdownPct = null;
    }
    out.push({
      kind: dead ? 'dead' : 'slow',
      line: l,
      value: round(value, 2),
      coverDays: cover === null ? null : round(cover, 1),
      markdownPrice,
      markdownPct,
    });
  }
  return out.sort((a, b) => b.value - a.value);
}

export interface Rebalance {
  productId: string;
  sku: string;
  name: string;
  fromWarehouseId: string;
  fromCode: string;
  toWarehouseId: string;
  toCode: string;
  quantity: number;
  value: number;
  fromCoverBefore: number;
  fromCoverAfter: number;
  toCoverBefore: number;
  toCoverAfter: number;
}

/** One transfer per product at most: from the warehouse with the most excess to the one most short. */
export function rebalancing(
  lines: StockLine[],
  opts = { targetCoverDays: 30, excessFactor: 2, minUnits: 5 },
): Rebalance[] {
  const byProduct = new Map<string, StockLine[]>();
  for (const l of lines) byProduct.set(l.productId, [...(byProduct.get(l.productId) ?? []), l]);
  const out: Rebalance[] = [];
  for (const list of byProduct.values()) {
    if (list.length < 2) continue;
    const cover = (l: StockLine) =>
      l.avgDaily > 0 ? l.available / l.avgDaily : l.available > 0 ? Infinity : 0;
    const sources = list.filter(
      (l) => l.available > 0 && cover(l) > opts.excessFactor * opts.targetCoverDays,
    );
    const sinks = list.filter((l) => l.avgDaily > 0 && cover(l) < l.leadTimeDays);
    if (!sources.length || !sinks.length) continue;
    const from = sources.sort((a, b) => cover(b) - cover(a))[0] as StockLine;
    const to = sinks.sort((a, b) => cover(a) - cover(b))[0] as StockLine;
    // Keep the source at the target (or all of it if it doesn't sell there).
    const spare =
      from.avgDaily > 0 ? Math.floor(from.available - from.avgDaily * opts.targetCoverDays) : from.available;
    const need = Math.ceil(to.avgDaily * opts.targetCoverDays - to.available);
    const quantity = Math.min(spare, need);
    if (quantity < opts.minUnits) continue;
    out.push({
      productId: from.productId,
      sku: from.sku,
      name: from.name,
      fromWarehouseId: from.warehouseId,
      fromCode: from.warehouseCode,
      toWarehouseId: to.warehouseId,
      toCode: to.warehouseCode,
      quantity,
      value: round(quantity * from.unitCost, 2),
      fromCoverBefore: round(Math.min(cover(from), 9999), 1),
      fromCoverAfter: from.avgDaily > 0 ? round((from.available - quantity) / from.avgDaily, 1) : 9999,
      toCoverBefore: round(cover(to), 1),
      toCoverAfter: round((to.available + quantity) / to.avgDaily, 1),
    });
  }
  return out.sort((a, b) => b.value - a.value);
}

export interface Drift {
  line: StockLine;
  configured: number;
  computed: number;
  change: number;
}

export function reorderDrift(lines: StockLine[], threshold = 0.3): Drift[] {
  const out: Drift[] = [];
  for (const l of lines) {
    if (l.configuredRop === null || l.computedRop === null || l.avgDaily <= 0) continue;
    const base = Math.max(1, l.configuredRop);
    const change = (l.computedRop - l.configuredRop) / base;
    if (Math.abs(change) > threshold && Math.abs(l.computedRop - l.configuredRop) >= 3)
      out.push({ line: l, configured: l.configuredRop, computed: l.computedRop, change: round(change, 3) });
  }
  return out.sort(
    (a, b) =>
      Math.abs(b.change) * b.line.avgDaily * b.line.unitCost -
      Math.abs(a.change) * a.line.avgDaily * a.line.unitCost,
  );
}
