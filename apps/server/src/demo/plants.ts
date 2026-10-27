/**
 * Situations planted in the demo history so every agent finds something real on its first run.
 * Everything here is produced through the same simulated ledger, so balances stay consistent.
 * Offsets are in days relative to today (negative = in the past).
 */

/**
 * The buyer under-ordered at the last reorder in the final 60 days and then stopped reordering, so the
 * item ends at roughly `coverDays` of demand (negative = out of stock for that many days).
 * Sized from expected demand, so the outcome holds whatever date the demo is seeded on.
 */
export const LOW_STOCK_WINDOW_DAYS = 60;
export const LOW_STOCK: Array<{ key: string; wh: string; coverDays: number }> = [
  { key: 'tata-sampann-unpolished-toor-dal-1-kg', wh: 'CBE', coverDays: 1 },
  { key: 'aavin-ghee-1-l', wh: 'CHN', coverDays: -3 },
  { key: 'aavin-ghee-1-l', wh: 'CBE', coverDays: 0.5 },
  { key: 'maggi-2-minute-masala-noodles-4-x-70-g', wh: 'CHN', coverDays: 3 },
  { key: 'india-gate-feast-rozzana-basmati-rice-5-kg', wh: 'MDU', coverDays: -5 },
  { key: 'bru-green-label-filter-coffee-500-g', wh: 'CBE', coverDays: 0.5 },
  { key: 'surf-excel-easy-wash-detergent-powder-1-kg', wh: 'MDU', coverDays: 2 },
  { key: 'lay-s-classic-salted-48-g', wh: 'CHN', coverDays: -2 },
  { key: 'parle-g-original-glucose-biscuits-250-g', wh: 'CBE', coverDays: 1 },
];

/**
 * The item's first reorder between 25 and 8 days ago goes to a supplier who never delivers it
 * (forced 8 days ago if no reorder was due). Reordering then stops because the stock is "on order",
 * and the shelf drains behind an overdue PO.
 */
export const STUCK_WINDOW = { from: -25, force: -8 };
export const STUCK_ORDERS: Array<{ key: string; wh: string }> = [
  { key: 'fortune-sunlite-refined-sunflower-oil-1-l-pouch', wh: 'CHN' },
  { key: 'fortune-filtered-groundnut-oil-1-l', wh: 'CHN' },
  { key: 'tata-tea-premium-250-g', wh: 'MDU' },
  { key: 'nescafe-classic-instant-coffee-100-g', wh: 'MDU' },
];

/** Large one-off purchases that left excess stock. */
export const OVERSTOCK: Array<{ key: string; wh: string; days: number }> = [
  { key: 'kellogg-s-corn-flakes-original-475-g', wh: 'CHN', days: 170 },
  { key: 'dove-deeply-nourishing-body-wash-250-ml', wh: 'CBE', days: 220 },
  { key: 'lipton-green-tea-honey-lemon-25-bags', wh: 'CHN', days: 160 },
  { key: 'kellogg-s-muesli-fruit-nut-seeds-500-g', wh: 'MDU', days: 260 },
  { key: 'kissan-fresh-tomato-ketchup-950-g', wh: 'CBE', days: 150 },
];
export const OVERSTOCK_ORDER_OFFSET = -44;

/** Items whose demand disappeared (all warehouses unless one is given). */
export const DEAD_STOCK: Array<{ key: string; wh?: string; fromOffset: number }> = [
  { key: 'nivea-nourishing-body-milk-400-ml', fromOffset: -135 },
  { key: 'mtr-ready-to-eat-rajma-masala-300-g', fromOffset: -120 },
  { key: 'colin-glass-surface-cleaner-500-ml', wh: 'MDU', fromOffset: -150 },
  { key: 'mtr-badam-drink-mix-200-g', fromOffset: -125 },
];

/** Batches that will expire soon (expiry moved to today + days after the simulation). */
export const EXPIRING: Array<{ key: string; wh: string; days: number }> = [
  { key: 'real-fruit-power-mixed-fruit-juice-1-l', wh: 'CBE', days: 9 },
  { key: 'amul-cheese-slices-200-g', wh: 'CBE', days: 12 },
  { key: 'milky-mist-paneer-200-g', wh: 'CBE', days: 2 },
  { key: 'aavin-curd-500-g', wh: 'CHN', days: 1 },
  { key: 'id-idly-dosa-batter-1-kg', wh: 'CHN', days: 1 },
  { key: 'haldiram-s-aloo-bhujia-1-kg', wh: 'MDU', days: 20 },
];

/** Demand spikes (a large one-off wholesale order). Stock is topped up beforehand so the spike is visible. */
export const SPIKES: Array<{ key: string; wh: string; offset: number; factor: number }> = [
  { key: 'haldiram-s-aloo-bhujia-200-g', wh: 'CHN', offset: -1, factor: 6 },
  { key: 'bisleri-packaged-drinking-water-20-l', wh: 'CBE', offset: -2, factor: 5 },
];

/** Repeated negative adjustments (shrinkage pattern). */
export const SHRINKAGE: Array<{
  key: string;
  wh: string;
  events: Array<{ offset: number; qty: number; reason: 'SHRINKAGE' | 'DAMAGED' }>;
}> = [
  {
    key: 'happilo-premium-whole-cashews-200-g',
    wh: 'MDU',
    events: [
      { offset: -11, qty: 4, reason: 'SHRINKAGE' },
      { offset: -8, qty: 6, reason: 'DAMAGED' },
      { offset: -5, qty: 3, reason: 'SHRINKAGE' },
      { offset: -2, qty: 5, reason: 'SHRINKAGE' },
    ],
  },
  {
    key: 'happilo-premium-california-almonds-200-g',
    wh: 'MDU',
    events: [
      { offset: -9, qty: 3, reason: 'SHRINKAGE' },
      { offset: -6, qty: 4, reason: 'DAMAGED' },
      { offset: -3, qty: 2, reason: 'SHRINKAGE' },
    ],
  },
];

/** A recent cycle count at Madurai with notable variances (fraction of on-hand, or absolute units). */
export const COUNT_VARIANCE = {
  wh: 'MDU',
  offset: -5,
  lines: [
    { key: 'catch-black-pepper-powder-100-g', fraction: -0.14 },
    { key: 'lg-compounded-asafoetida-50-g', fraction: -0.09 },
    { key: 'aachi-turmeric-powder-200-g', fraction: -0.02 },
    { key: 'everest-jeera-powder-100-g', units: 1 },
    { key: 'sakthi-coriander-powder-200-g', units: 0 },
    { key: 'aachi-chilli-powder-200-g', units: 0 },
  ],
};

/** A partial delivery invoiced above the PO price (receipt ≠ PO). */
export const RECEIPT_MISMATCH = {
  supplier: 'EST',
  wh: 'CHN',
  orderOffset: -10,
  receiptOffset: -3,
  lines: [
    { key: 'everest-kashmirilal-chilli-powder-100-g', ordered: 120, received: 80, invoiceFactor: 1.12 },
    { key: 'catch-black-pepper-powder-100-g', ordered: 100, received: 100, invoiceFactor: 1 },
    { key: 'lg-compounded-asafoetida-50-g', ordered: 60, received: 60, invoiceFactor: 1 },
  ],
};

/** Supplier price jump on one product. */
export const COST_JUMP = {
  supplier: 'EST',
  key: 'catch-black-pepper-powder-100-g',
  fromOffset: -30,
  factor: 1.18,
};

/** Goods on the road between warehouses right now. */
export const IN_TRANSIT = {
  from: 'CHN',
  to: 'MDU',
  lines: [
    { key: 'aashirvaad-shudh-chakki-atta-5-kg', qty: 32 },
    { key: 'madhur-pure-hygienic-sugar-1-kg', qty: 60 },
  ],
};
