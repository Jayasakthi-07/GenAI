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
  { key: 'annapurna-harvest-toor-dal-1-kg', wh: 'BLR', coverDays: 1 },
  { key: 'himgiri-pure-cow-ghee-1-l', wh: 'CHN', coverDays: -3 },
  { key: 'himgiri-pure-cow-ghee-1-l', wh: 'BLR', coverDays: 0.5 },
  { key: 'tapti-masala-instant-noodles-4-pack', wh: 'CHN', coverDays: 3 },
  { key: 'kesar-farms-basmati-rice-5-kg', wh: 'HYD', coverDays: -5 },
  { key: 'nilgiri-estates-filter-coffee-powder-500-g', wh: 'BLR', coverDays: 0.5 },
  { key: 'sparkle-detergent-powder-1-kg', wh: 'HYD', coverDays: 2 },
  { key: 'crispo-potato-chips-classic-salted-52-g', wh: 'CHN', coverDays: -2 },
  { key: 'konkan-bakery-glucose-biscuits-200-g', wh: 'BLR', coverDays: 1 },
];

/**
 * The item's first reorder between 25 and 8 days ago goes to a supplier who never delivers it
 * (forced 8 days ago if no reorder was due). Reordering then stops because the stock is "on order",
 * and the shelf drains behind an overdue PO.
 */
export const STUCK_WINDOW = { from: -25, force: -8 };
export const STUCK_ORDERS: Array<{ key: string; wh: string }> = [
  { key: 'malabar-coast-sunflower-oil-1-l-pouch', wh: 'CHN' },
  { key: 'malabar-coast-groundnut-oil-1-l', wh: 'CHN' },
  { key: 'chai-bagan-assam-ctc-tea-250-g', wh: 'HYD' },
  { key: 'nilgiri-estates-instant-coffee-100-g', wh: 'HYD' },
];

/** Large one-off purchases that left excess stock. */
export const OVERSTOCK: Array<{ key: string; wh: string; days: number }> = [
  { key: 'sunmill-corn-flakes-475-g', wh: 'CHN', days: 170 },
  { key: 'tulsi-home-aloe-body-wash-250-ml', wh: 'BLR', days: 220 },
  { key: 'chai-bagan-green-tea-25-bags', wh: 'CHN', days: 160 },
  { key: 'sunmill-fruit-nut-muesli-500-g', wh: 'HYD', days: 260 },
  { key: 'tapti-tomato-ketchup-1-kg', wh: 'BLR', days: 150 },
];
export const OVERSTOCK_ORDER_OFFSET = -44;

/** Items whose demand disappeared (all warehouses unless one is given). */
export const DEAD_STOCK: Array<{ key: string; wh?: string; fromOffset: number }> = [
  { key: 'tulsi-home-moisturising-lotion-400-ml', fromOffset: -135 },
  { key: 'tapti-ready-to-eat-rajma-chawal-375-g', fromOffset: -120 },
  { key: 'nimbus-glass-cleaner-500-ml', wh: 'HYD', fromOffset: -150 },
  { key: 'aarogya-badam-drink-mix-200-g', fromOffset: -125 },
];

/** Batches that will expire soon (expiry moved to today + days after the simulation). */
export const EXPIRING: Array<{ key: string; wh: string; days: number }> = [
  { key: 'godavari-mixed-fruit-juice-1-l', wh: 'HYD', days: 9 },
  { key: 'himgiri-cheese-slices-200-g', wh: 'BLR', days: 12 },
  { key: 'himgiri-fresh-paneer-200-g', wh: 'BLR', days: 2 },
  { key: 'himgiri-fresh-curd-400-g', wh: 'CHN', days: 1 },
  { key: 'konkan-bakery-brown-bread-400-g', wh: 'CHN', days: 1 },
  { key: 'crispo-aloo-bhujia-1-kg', wh: 'HYD', days: 20 },
];

/** Demand spikes (a large one-off wholesale order). Stock is topped up beforehand so the spike is visible. */
export const SPIKES: Array<{ key: string; wh: string; offset: number; factor: number }> = [
  { key: 'crispo-aloo-bhujia-200-g', wh: 'CHN', offset: -1, factor: 6 },
  { key: 'nilgiri-springs-packaged-drinking-water-20-l', wh: 'BLR', offset: -2, factor: 5 },
];

/** Repeated negative adjustments (shrinkage pattern). */
export const SHRINKAGE: Array<{
  key: string;
  wh: string;
  events: Array<{ offset: number; qty: number; reason: 'SHRINKAGE' | 'DAMAGED' }>;
}> = [
  {
    key: 'kesar-farms-cashews-w320-250-g',
    wh: 'HYD',
    events: [
      { offset: -11, qty: 4, reason: 'SHRINKAGE' },
      { offset: -8, qty: 6, reason: 'DAMAGED' },
      { offset: -5, qty: 3, reason: 'SHRINKAGE' },
      { offset: -2, qty: 5, reason: 'SHRINKAGE' },
    ],
  },
  {
    key: 'kesar-farms-california-almonds-250-g',
    wh: 'HYD',
    events: [
      { offset: -9, qty: 3, reason: 'SHRINKAGE' },
      { offset: -6, qty: 4, reason: 'DAMAGED' },
      { offset: -3, qty: 2, reason: 'SHRINKAGE' },
    ],
  },
];

/** A recent cycle count at Hyderabad with notable variances (fraction of on-hand, or absolute units). */
export const COUNT_VARIANCE = {
  wh: 'HYD',
  offset: -5,
  lines: [
    { key: 'malabar-coast-green-cardamom-50-g', fraction: -0.14 },
    { key: 'malabar-coast-black-pepper-100-g', fraction: -0.09 },
    { key: 'aarogya-turmeric-powder-200-g', fraction: -0.02 },
    { key: 'aarogya-cumin-seeds-100-g', units: 1 },
    { key: 'malabar-coast-cloves-50-g', units: 0 },
    { key: 'aarogya-mustard-seeds-200-g', units: 0 },
  ],
};

/** A partial delivery invoiced above the PO price (receipt ≠ PO). */
export const RECEIPT_MISMATCH = {
  supplier: 'MST',
  wh: 'CHN',
  orderOffset: -10,
  receiptOffset: -3,
  lines: [
    { key: 'malabar-coast-green-cardamom-50-g', ordered: 120, received: 80, invoiceFactor: 1.12 },
    { key: 'malabar-coast-black-pepper-100-g', ordered: 100, received: 100, invoiceFactor: 1 },
    { key: 'malabar-coast-cloves-50-g', ordered: 60, received: 60, invoiceFactor: 1 },
  ],
};

/** Supplier price jump on one product. */
export const COST_JUMP = {
  supplier: 'MST',
  key: 'malabar-coast-black-pepper-100-g',
  fromOffset: -30,
  factor: 1.18,
};

/** Goods on the road between warehouses right now. */
export const IN_TRANSIT = {
  from: 'CHN',
  to: 'HYD',
  lines: [
    { key: 'sunmill-whole-wheat-atta-5-kg', qty: 32 },
    { key: 'sunmill-refined-sugar-1-kg', qty: 60 },
  ],
};
