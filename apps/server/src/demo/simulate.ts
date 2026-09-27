import { addDays, dayOfWeek, daysBetween, festiveMultiplier, istDay, istInstant, monthOf } from './calendar';
import { type CustomerDef, SUPPLIERS, type SupplierDef, WAREHOUSES, type WarehouseDef } from './catalog';
import * as plants from './plants';
import type { ProductSpec, SupplierLink } from './products';
import { type Rng, uuidv7 } from './random';

/** ~18 months of daily history ending yesterday. */
export const HISTORY_DAYS = 548;

type MovementType =
  | 'OPENING_BALANCE'
  | 'RECEIPT'
  | 'SALE'
  | 'RETURN'
  | 'ADJUSTMENT'
  | 'WRITE_OFF'
  | 'TRANSFER_OUT'
  | 'TRANSFER_IN'
  | 'COUNT_CORRECTION';
type ActorType = 'USER' | 'SYSTEM';

export interface MovementRow {
  id: string;
  productId: string;
  warehouseId: string;
  batchId: string | null;
  type: MovementType;
  quantity: number;
  balanceAfter: number;
  unitCost: string;
  reasonCodeId: string | null;
  reference: string | null;
  sourceType: string | null;
  sourceId: string | null;
  note: string | null;
  actorType: ActorType;
  actorUserId: string | null;
  occurredAt: Date;
}

export interface BatchRow {
  id: string;
  productId: string;
  warehouseId: string;
  batchNo: string;
  manufacturedOn: string;
  expiryDate: string;
  quantity: number;
  unitCost: string;
  receivedAt: Date;
}

export interface PoLineRow {
  id: string;
  purchaseOrderId: string;
  productId: string;
  quantityOrdered: number;
  quantityReceived: number;
  quantityRejected: number;
  unitCostPaise: number;
  taxRate: number;
  lineTotalPaise: number;
  rationale: string | null;
}

export interface PoRow {
  id: string;
  number: string;
  supplierId: string;
  warehouseId: string;
  status:
    | 'DRAFT'
    | 'PENDING_APPROVAL'
    | 'APPROVED'
    | 'SENT'
    | 'PARTIALLY_RECEIVED'
    | 'RECEIVED'
    | 'CLOSED'
    | 'CANCELLED';
  orderDate: Date;
  expectedDate: string;
  subtotalPaise: number;
  taxPaise: number;
  notes: string | null;
  createdById: string;
  submittedAt: Date | null;
  approvedById: string | null;
  approvedAt: Date | null;
  sentAt: Date | null;
  receivedAt: Date | null;
  closedAt: Date | null;
  lines: PoLineRow[];
  /** Simulation bookkeeping. */
  pendingDeliveries: number;
  lastReceiptAt: Date | null;
  shortClosed: boolean;
}

export interface GrnLineRow {
  id: string;
  goodsReceiptId: string;
  purchaseOrderLineId: string;
  productId: string;
  quantityReceived: number;
  quantityRejected: number;
  rejectReason: string | null;
  unitCostPaise: number;
  batchNo: string | null;
  expiryDate: string | null;
}

export interface GrnRow {
  id: string;
  number: string;
  purchaseOrderId: string;
  warehouseId: string;
  receivedAt: Date;
  receivedById: string;
  notes: string | null;
  lines: GrnLineRow[];
}

export interface SoLineRow {
  id: string;
  salesOrderId: string;
  productId: string;
  quantity: number;
  quantityFulfilled: number;
  unitPricePaise: number;
  discountPaise: number;
  taxRate: number;
  lineTotalPaise: number;
}

export interface SoRow {
  id: string;
  number: string;
  customerId: string;
  warehouseId: string;
  channel: 'STORE' | 'WHOLESALE' | 'ONLINE';
  status: 'DRAFT' | 'CONFIRMED' | 'FULFILLED';
  orderDate: Date;
  fulfilledAt: Date | null;
  createdById: string;
  notes: string | null;
  lines: SoLineRow[];
}

export interface TransferRow {
  id: string;
  number: string;
  fromWarehouseId: string;
  toWarehouseId: string;
  status: 'IN_TRANSIT' | 'RECEIVED';
  reason: string;
  createdById: string;
  shippedAt: Date;
  receivedAt: Date | null;
  createdAt: Date;
  lines: Array<{ id: string; productId: string; quantity: number }>;
}

export interface CycleCountRow {
  id: string;
  number: string;
  warehouseId: string;
  status: 'OPEN' | 'COMPLETED';
  reason: string;
  createdById: string;
  approvedById: string | null;
  createdAt: Date;
  submittedAt: Date | null;
  completedAt: Date | null;
  lines: Array<{
    id: string;
    productId: string;
    expectedQty: number;
    countedQty: number | null;
    variance: number | null;
    varianceValuePaise: number | null;
    status: 'PENDING' | 'ACCEPTED';
    countedAt: Date | null;
  }>;
}

export interface SalesDailyRow {
  productId: string;
  warehouseId: string;
  date: string;
  quantity: number;
  revenuePaise: number;
  cogsPaise: number;
  orders: number;
}

export interface SnapshotRow {
  date: string;
  warehouseId: string;
  totalUnits: number;
  totalValuePaise: number;
  skuCount: number;
  lowStockCount: number;
  outOfStockCount: number;
}

export interface StockLevelRow {
  id: string;
  productId: string;
  warehouseId: string;
  onHand: number;
  reserved: number;
  avgCost: string;
  reorderPoint: number;
  safetyStock: number;
  maxStock: number;
  lastMovementAt: Date | null;
}

export interface SimulationInput {
  rng: Rng;
  today: string;
  products: ProductSpec[];
  productIds: Map<string, string>;
  warehouseIds: Map<string, string>;
  supplierIds: Map<string, string>;
  customers: Array<CustomerDef & { id: string }>;
  reasonIds: Map<string, string>;
  users: { admin: string; manager: string; staff: string };
}

export interface SimulationResult {
  movements: MovementRow[];
  batches: BatchRow[];
  purchaseOrders: PoRow[];
  receipts: GrnRow[];
  salesOrders: SoRow[];
  salesDaily: SalesDailyRow[];
  snapshots: SnapshotRow[];
  transfers: TransferRow[];
  cycleCounts: CycleCountRow[];
  stockLevels: StockLevelRow[];
  /** Current unit cost (paise) per supplier|product after price drift and jumps. */
  supplierCosts: Map<string, number>;
  sequences: Map<string, number>;
  /** Planted-situation summary for the seed log. */
  notes: string[];
}

interface BatchState {
  row: BatchRow;
  qty: number;
  expiry: string;
}

interface Loc {
  key: string;
  p: ProductSpec;
  productId: string;
  wh: WarehouseDef;
  whId: string;
  share: number;
  onHand: number;
  avgCost: number;
  batches: BatchState[];
  rop: number;
  ss: number;
  max: number;
  storedRop: number;
  storedSs: number;
  storedMax: number;
  legacyParams: boolean;
  lt: number;
  cycle: number;
  onOrder: number;
  lastMovementAt: Date | null;
  demandEma: number;
  recentSales: Array<{ day: string; soId: string; soNumber: string; qty: number }>;
  /** Planted: stop reordering (after the planted last order). */
  blocked: boolean;
  /** Planted: target end cover in days for the LOW_STOCK plant. */
  lowTarget: number | null;
  /** Planted: next reorder is sent to a supplier who never delivers. */
  stuck: boolean;
  deadFrom: string | null;
  spikes: Map<string, number>;
}

const MIN = 60_000;

function roundUp(qty: number, pack: number): number {
  return Math.max(pack, Math.ceil(qty / pack) * pack);
}

function seasonal(season: ProductSpec['season'], month: number): number {
  if (season === 'summer') {
    if (month >= 3 && month <= 6) return 1.35;
    if (month >= 7 && month <= 9) return 0.95;
    if (month >= 11 || month <= 1) return 0.8;
    return 0.95;
  }
  if (season === 'winter') {
    if (month >= 11 || month <= 2) return 1.2;
    if (month >= 4 && month <= 6) return 0.85;
    return 1;
  }
  return 1;
}

/** Z for a 95% cycle service level. */
const Z95 = 1.645;

export function simulate(input: SimulationInput): SimulationResult {
  const { rng, today, products, productIds, warehouseIds, supplierIds, customers, reasonIds, users } = input;
  const start = addDays(today, -HISTORY_DAYS);
  const lastDay = addDays(today, -1);
  const off = (n: number) => addDays(today, n);

  const idRng = rng.fork('ids');
  const misc = rng.fork('misc');
  const newId = (at: Date) => uuidv7(at.getTime(), idRng);

  const sequences = new Map<string, number>();
  const nextNumber = (prefix: string, at: Date) => {
    const year = istDay(at).slice(0, 4);
    const k = `${prefix}|${year}`;
    const n = (sequences.get(k) ?? 0) + 1;
    sequences.set(k, n);
    return `${prefix}-${year}-${String(n).padStart(5, '0')}`;
  };

  const reason = (code: string) => reasonIds.get(code) ?? null;

  const movements: MovementRow[] = [];
  const batches: BatchRow[] = [];
  const purchaseOrders: PoRow[] = [];
  const receipts: GrnRow[] = [];
  const salesOrders: SoRow[] = [];
  const salesDaily: SalesDailyRow[] = [];
  const snapshots: SnapshotRow[] = [];
  const transfers: TransferRow[] = [];
  const cycleCounts: CycleCountRow[] = [];
  const notes: string[] = [];

  // ── Demand (precomputed per product per day; index 0 = PAD days before the start) ──
  const PAD = 90;
  const SPAN = PAD + HISTORY_DAYS + 90;
  const idx = (day: string) => daysBetween(start, day) + PAD;
  const promoOn = (p: ProductSpec, day: string) =>
    p.promos.find((pr) => day >= pr.start && day <= pr.end) ?? null;
  const baseDemand = new Map<string, Float64Array>();
  const festivePrefix = new Map<string, Float64Array>();
  for (const p of products) {
    const base = new Float64Array(SPAN);
    const prefix = new Float64Array(SPAN + 1);
    for (let i = 0; i < SPAN; i++) {
      const day = addDays(start, i - PAD);
      const fest = festiveMultiplier(day, p.groups);
      base[i] =
        p.v *
        Math.pow(1 + p.trend, daysBetween(today, day) / 365) *
        (p.weekly[dayOfWeek(day)] ?? 1) *
        seasonal(p.season, monthOf(day)) *
        fest *
        (promoOn(p, day)?.lift ?? 1);
      prefix[i + 1] = (prefix[i] ?? 0) + fest;
    }
    baseDemand.set(p.key, base);
    festivePrefix.set(p.key, prefix);
  }
  const expected = (l: Loc, day: string) => (baseDemand.get(l.p.key)?.[idx(day)] ?? 0) * l.share;
  /** Average festive multiplier over the next `days` days (buyers stock up ahead of festivals). */
  const festiveAhead = (p: ProductSpec, day: string, days: number) => {
    const prefix = festivePrefix.get(p.key);
    if (!prefix) return 1;
    const from = idx(day) + 1;
    const to = Math.min(SPAN, from + days);
    return ((prefix[to] ?? 0) - (prefix[from] ?? 0)) / Math.max(1, to - from);
  };

  // ── Prices over time ────────────────────────────────────────────────────────
  const costJumpKey = `${plants.COST_JUMP.supplier}|${plants.COST_JUMP.key}`;
  const supplierCostPaise = (link: SupplierLink, p: ProductSpec, day: string) => {
    const t = daysBetween(today, day);
    let cost = link.costPaise * Math.pow(1 + link.supplier.priceTrend, t / 365);
    if (`${link.supplier.code}|${p.key}` === costJumpKey && day < off(plants.COST_JUMP.fromOffset)) {
      cost /= plants.COST_JUMP.factor;
    }
    return Math.max(1, Math.round(cost));
  };
  const priceRatio = (p: ProductSpec, day: string) =>
    Math.pow(1 + (p.suppliers[0]?.supplier.priceTrend ?? 0.05), daysBetween(today, day) / 365);
  const sellingPaiseOn = (p: ProductSpec, day: string) => {
    const raw = p.sellingPaise * priceRatio(p, day);
    return raw >= 2000 ? Math.round(raw / 100) * 100 : Math.round(raw / 50) * 50;
  };

  // ── Locations (product × warehouse) ─────────────────────────────────────────
  const locs: Loc[] = [];
  const locByKey = new Map<string, Loc>();
  const locsByWh = new Map<string, Loc[]>();
  const locsByProduct = new Map<string, Loc[]>();

  for (const p of products) {
    const r = rng.fork(`loc|${p.key}`);
    const whs = WAREHOUSES.filter((w) => !(p.noHyd && w.code === 'HYD'));
    const raw = whs.map((w) => w.share * r.float(0.7, 1.3));
    const total = raw.reduce((a, b) => a + b, 0);
    whs.forEach((wh, i) => {
      const productId = productIds.get(p.key);
      const whId = warehouseIds.get(wh.code);
      if (!productId || !whId) throw new Error('missing id');
      const loc: Loc = {
        key: `${p.key}|${wh.code}`,
        p,
        productId,
        wh,
        whId,
        share: (raw[i] ?? 0) / total,
        onHand: 0,
        avgCost: 0,
        batches: [],
        rop: 0,
        ss: 0,
        max: 0,
        storedRop: 0,
        storedSs: 0,
        storedMax: 0,
        legacyParams: false,
        lt: p.leadTimeDays,
        cycle: 12,
        onOrder: 0,
        lastMovementAt: null,
        demandEma: 0,
        recentSales: [],
        blocked: false,
        lowTarget: null,
        stuck: false,
        deadFrom: null,
        spikes: new Map(),
      };
      locs.push(loc);
      locByKey.set(loc.key, loc);
      locsByWh.set(wh.code, [...(locsByWh.get(wh.code) ?? []), loc]);
      locsByProduct.set(p.key, [...(locsByProduct.get(p.key) ?? []), loc]);
    });
  }

  const loc = (key: string, wh: string): Loc => {
    const l = locByKey.get(`${key}|${wh}`);
    if (!l) throw new Error(`Planted product not found: ${key} @ ${wh}`);
    return l;
  };

  // Reorder policy from demand around a given day (what a buyer would compute).
  const computePolicy = (l: Loc, fromDay: string, days: number) => {
    let sum = 0;
    for (let i = 0; i < days; i++) sum += expected(l, addDays(fromDay, i));
    const d = Math.max(0.05, sum / days);
    const p = l.p;
    const sdDemand = Math.sqrt(d * (p.p ? 1 / p.p : 1) + (0.15 * d) ** 2);
    const sdLead = p.suppliers[0]?.supplier.leadTimeSd ?? 1;
    const ss = Math.ceil(Z95 * Math.sqrt(l.lt * sdDemand ** 2 + d ** 2 * sdLead ** 2));
    const rop = Math.max(1, Math.ceil(d * l.lt + ss));
    const cycle =
      p.shelfLifeDays !== null && p.shelfLifeDays <= 14
        ? Math.max(1, Math.min(3, Math.floor(p.shelfLifeDays / 3)))
        : p.shelfLifeDays !== null && p.shelfLifeDays <= 60
          ? Math.max(3, Math.floor(p.shelfLifeDays / 4))
          : d < 3
            ? 30
            : 18;
    const max = roundUp(rop + d * cycle, p.pack);
    return { d, ss, rop, max, cycle };
  };

  // Plant configuration.
  for (const b of plants.LOW_STOCK) loc(b.key, b.wh).lowTarget = b.coverDays;
  for (const s of plants.STUCK_ORDERS) loc(s.key, s.wh).stuck = true;
  for (const d of plants.DEAD_STOCK) {
    for (const l of locsByProduct.get(d.key) ?? [])
      if (!d.wh || l.wh.code === d.wh) l.deadFrom = off(d.fromOffset);
  }
  for (const s of plants.SPIKES) loc(s.key, s.wh).spikes.set(off(s.offset), s.factor);

  // Some products still carry their original reorder parameters (never reviewed) — the Optimizer should notice.
  const legacyRng = rng.fork('legacy');
  const trending = products.filter((p) => Math.abs(p.trend) >= 0.15);
  const legacyKeys = new Set(
    [...legacyRng.shuffle([...trending]).slice(0, 9), ...legacyRng.shuffle([...products]).slice(0, 5)].map(
      (p) => p.key,
    ),
  );

  // ── Batches / movements ─────────────────────────────────────────────────────
  const move = (
    l: Loc,
    type: MovementType,
    qty: number,
    at: Date,
    o: {
      batchId?: string | null;
      unitCost?: number;
      reasonCode?: string;
      reference?: string | null;
      sourceType?: string | null;
      sourceId?: string | null;
      note?: string | null;
      actor?: ActorType;
      userId?: string | null;
    } = {},
  ) => {
    if (qty === 0) return;
    l.onHand += qty;
    if (l.onHand < 0) throw new Error(`Negative stock for ${l.key} on ${istDay(at)}`);
    movements.push({
      id: newId(at),
      productId: l.productId,
      warehouseId: l.whId,
      batchId: o.batchId ?? null,
      type,
      quantity: qty,
      balanceAfter: l.onHand,
      unitCost: (o.unitCost ?? l.avgCost).toFixed(4),
      reasonCodeId: o.reasonCode ? reason(o.reasonCode) : null,
      reference: o.reference ?? null,
      sourceType: o.sourceType ?? null,
      sourceId: o.sourceId ?? null,
      note: o.note ?? null,
      actorType: o.actor ?? 'USER',
      actorUserId: (o.actor ?? 'USER') === 'USER' ? (o.userId ?? users.staff) : null,
      occurredAt: at,
    });
    l.lastMovementAt = at;
  };

  const sortBatches = (l: Loc) =>
    l.batches.sort(
      (a, b) => a.expiry.localeCompare(b.expiry) || a.row.receivedAt.getTime() - b.row.receivedAt.getTime(),
    );

  /** Removes stock (FEFO across batches for expiry-tracked items). Returns the quantity removed. */
  const consume = (l: Loc, qty: number, at: Date, type: MovementType, o: Parameters<typeof move>[4] = {}) => {
    const want = Math.min(qty, l.onHand);
    if (want <= 0) return 0;
    if (!l.p.trackExpiry) {
      move(l, type, -want, at, o);
      return want;
    }
    sortBatches(l);
    let remaining = want;
    let k = 0;
    for (const b of l.batches) {
      if (remaining <= 0) break;
      if (b.qty <= 0) continue;
      const take = Math.min(b.qty, remaining);
      b.qty -= take;
      b.row.quantity = b.qty;
      remaining -= take;
      move(l, type, -take, new Date(at.getTime() + k++ * 1000), { ...o, batchId: b.row.id });
    }
    l.batches = l.batches.filter((b) => b.qty > 0);
    return want - remaining;
  };

  const addBatch = (
    l: Loc,
    qty: number,
    unitCost: number,
    at: Date,
    batchNo: string,
    mfgDay: string,
  ): BatchState => {
    const shelf = l.p.shelfLifeDays ?? 365;
    const row: BatchRow = {
      id: newId(at),
      productId: l.productId,
      warehouseId: l.whId,
      batchNo,
      manufacturedOn: mfgDay,
      expiryDate: addDays(mfgDay, shelf),
      quantity: qty,
      unitCost: unitCost.toFixed(4),
      receivedAt: at,
    };
    batches.push(row);
    const state = { row, qty, expiry: row.expiryDate };
    l.batches.push(state);
    return state;
  };

  /** Adds received stock, updating moving-average cost and creating a batch when tracked. */
  const receive = (
    l: Loc,
    qty: number,
    unitCost: number,
    at: Date,
    o: Parameters<typeof move>[4] & { type?: MovementType },
  ) => {
    if (qty <= 0) return null;
    const total = l.onHand + qty;
    l.avgCost = total > 0 ? (l.onHand * l.avgCost + qty * unitCost) / total : unitCost;
    let batch: BatchState | null = null;
    if (l.p.trackExpiry) {
      const shelf = l.p.shelfLifeDays ?? 365;
      const day = istDay(at);
      const mfg = addDays(
        day,
        -(shelf <= 14 ? misc.int(0, 1) : misc.int(3, Math.max(3, Math.min(30, Math.floor(shelf / 6))))),
      );
      batch = addBatch(
        l,
        qty,
        unitCost,
        at,
        `B${day.replaceAll('-', '').slice(2)}-${l.wh.code}-${misc.int(100, 999)}`,
        mfg,
      );
    }
    const { type = 'RECEIPT', ...rest } = o;
    move(l, type, qty, at, { ...rest, unitCost, batchId: batch?.row.id ?? null });
    return batch;
  };

  // ── Opening balances ─────────────────────────────────────────────────────────
  for (const l of locs) {
    const pol = computePolicy(l, start, 28);
    Object.assign(l, { rop: pol.rop, ss: pol.ss, max: pol.max, cycle: pol.cycle });
    l.storedRop = pol.rop;
    l.storedSs = pol.ss;
    l.storedMax = pol.max;
    l.legacyParams = legacyKeys.has(l.p.key);
    l.demandEma = pol.d;
    const link = l.p.suppliers[0];
    if (!link) throw new Error(`No supplier for ${l.p.key}`);
    const cost = supplierCostPaise(link, l.p, start) / 100;
    const shortShelf = l.p.shelfLifeDays !== null && l.p.shelfLifeDays <= 14;
    const qty = shortShelf ? pol.rop + Math.ceil(pol.d) : misc.int(pol.rop, Math.max(pol.rop, pol.max));
    const at = istInstant(start, 6 * 60 + misc.int(0, 29));
    l.avgCost = cost;
    let batchId: string | null = null;
    if (l.p.trackExpiry) {
      const shelf = l.p.shelfLifeDays ?? 365;
      const b = addBatch(
        l,
        qty,
        cost,
        at,
        `OPEN-${l.wh.code}-${misc.int(1000, 9999)}`,
        addDays(start, -Math.floor(shelf * 0.25)),
      );
      batchId = b.row.id;
    }
    move(l, 'OPENING_BALANCE', qty, at, {
      unitCost: cost,
      batchId,
      note: 'Opening balance',
      actor: 'SYSTEM',
    });
  }

  // ── Purchasing ──────────────────────────────────────────────────────────────
  interface Delivery {
    po: PoRow;
    items: Array<{
      line: PoLineRow;
      loc: Loc;
      qty: number;
      final: boolean;
      remainderCancelled: number;
      invoiceFactor?: number;
    }>;
    minute: number;
  }
  const deliveries = new Map<string, Delivery[]>();
  const schedule = (day: string, d: Delivery) => deliveries.set(day, [...(deliveries.get(day) ?? []), d]);

  const createPo = (
    supplier: SupplierDef,
    wh: WarehouseDef,
    day: string,
    minute: number,
    items: Array<{ loc: Loc; qty: number; costPaise: number }>,
    leadTime: number,
  ): PoRow => {
    const at = istInstant(day, minute);
    const poId = newId(at);
    const lines: PoLineRow[] = items.map(({ loc: l, qty, costPaise }) => ({
      id: newId(at),
      purchaseOrderId: poId,
      productId: l.productId,
      quantityOrdered: qty,
      quantityReceived: 0,
      quantityRejected: 0,
      unitCostPaise: costPaise,
      taxRate: l.p.taxRate,
      lineTotalPaise: qty * costPaise,
      rationale: null,
    }));
    const subtotal = lines.reduce((a, l) => a + l.lineTotalPaise, 0);
    const tax = lines.reduce((a, l) => a + Math.round((l.lineTotalPaise * l.taxRate) / 100), 0);
    const supplierId = supplierIds.get(supplier.code);
    const whId = warehouseIds.get(wh.code);
    if (!supplierId || !whId) throw new Error('missing id');
    const po: PoRow = {
      id: poId,
      number: nextNumber('PO', at),
      supplierId,
      warehouseId: whId,
      status: 'SENT',
      orderDate: at,
      expectedDate: addDays(day, leadTime),
      subtotalPaise: subtotal,
      taxPaise: tax,
      notes: null,
      createdById: users.staff,
      submittedAt: new Date(at.getTime() + 5 * MIN),
      approvedById: users.manager,
      approvedAt: new Date(at.getTime() + 40 * MIN),
      sentAt: new Date(at.getTime() + 55 * MIN),
      receivedAt: null,
      closedAt: null,
      lines,
      pendingDeliveries: 0,
      lastReceiptAt: null,
      shortClosed: false,
    };
    purchaseOrders.push(po);
    for (const { loc: l, qty } of items) l.onOrder += qty;
    return po;
  };

  const placeOrder = (
    supplier: SupplierDef,
    wh: WarehouseDef,
    day: string,
    items: Array<{ loc: Loc; qty: number; link: SupplierLink }>,
  ) => {
    const r = rng.fork(`po|${supplier.code}|${wh.code}|${day}`);
    const leadTime = Math.max(...items.map((i) => i.link.leadTimeDays));
    const po = createPo(
      supplier,
      wh,
      day,
      17 * 60 + r.int(0, 50),
      items.map((i) => ({ loc: i.loc, qty: i.qty, costPaise: supplierCostPaise(i.link, i.loc.p, day) })),
      leadTime,
    );
    const recent =
      supplier.recent && daysBetween(day, today) <= supplier.recent.days ? supplier.recent : null;
    const onTime = r.bool(recent ? recent.onTime : supplier.onTime);
    const arrivalOffset = onTime
      ? Math.max(1, leadTime - (r.bool(0.25) ? 1 : 0))
      : leadTime +
        (recent
          ? r.int(recent.extraDelay[0], recent.extraDelay[1])
          : Math.max(1, Math.round(Math.abs(r.normal(0, supplier.leadTimeSd))) + r.int(0, 2)));
    const arrival = addDays(day, arrivalOffset);
    const first: Delivery = { po, items: [], minute: 9 * 60 + r.int(0, 90) };
    const second: Delivery = { po, items: [], minute: 9 * 60 + r.int(0, 90) };
    const secondDay = addDays(arrival, r.int(2, 6));
    po.lines.forEach((line, i) => {
      const it = items[i];
      if (!it) return;
      if (r.bool(supplier.fullFill) || line.quantityOrdered <= it.loc.p.pack) {
        first.items.push({
          line,
          loc: it.loc,
          qty: line.quantityOrdered,
          final: true,
          remainderCancelled: 0,
        });
        return;
      }
      const pack = it.loc.p.pack;
      const part = Math.min(
        line.quantityOrdered - pack,
        Math.max(pack, Math.floor((line.quantityOrdered * r.float(0.55, 0.92)) / pack) * pack),
      );
      const rest = line.quantityOrdered - part;
      if (r.bool(0.4)) {
        first.items.push({ line, loc: it.loc, qty: part, final: false, remainderCancelled: 0 });
        second.items.push({ line, loc: it.loc, qty: rest, final: true, remainderCancelled: 0 });
      } else {
        first.items.push({ line, loc: it.loc, qty: part, final: true, remainderCancelled: rest });
      }
    });
    schedule(arrival, first);
    po.pendingDeliveries++;
    if (second.items.length) {
      schedule(secondDay, second);
      po.pendingDeliveries++;
    }
  };

  /** Receipts are serialized through the morning so each product's ledger stays in time order. */
  let receivingCursor = 0;
  const processDelivery = (day: string, d: Delivery) => {
    const at = new Date(Math.max(istInstant(day, d.minute).getTime(), receivingCursor));
    receivingCursor = at.getTime() + (d.items.length + 1) * 10_000;
    const supplier = SUPPLIERS.find((s) => supplierIds.get(s.code) === d.po.supplierId);
    const r = rng.fork(`grn|${d.po.id}|${day}`);
    const grn: GrnRow = {
      id: newId(at),
      number: nextNumber('GRN', at),
      purchaseOrderId: d.po.id,
      warehouseId: d.po.warehouseId,
      receivedAt: at,
      receivedById: users.staff,
      notes: null,
      lines: [],
    };
    let k = 0;
    for (const item of d.items) {
      const rejectRate = supplier?.rejectRate ?? 0;
      const rejected =
        item.qty >= 10 ? Math.min(item.qty, Math.round(item.qty * rejectRate * r.float(0, 2.5))) : 0;
      const accepted = item.qty - rejected;
      const invoicePaise = Math.round(item.line.unitCostPaise * (item.invoiceFactor ?? 1));
      const t = new Date(at.getTime() + k++ * 10_000);
      const batch = receive(item.loc, accepted, invoicePaise / 100, t, {
        reference: d.po.number,
        sourceType: 'GoodsReceipt',
        sourceId: grn.id,
      });
      item.line.quantityReceived += accepted;
      item.line.quantityRejected += rejected;
      item.loc.onOrder -= item.qty + item.remainderCancelled;
      if (item.remainderCancelled > 0) d.po.shortClosed = true;
      grn.lines.push({
        id: newId(t),
        goodsReceiptId: grn.id,
        purchaseOrderLineId: item.line.id,
        productId: item.loc.productId,
        quantityReceived: accepted,
        quantityRejected: rejected,
        rejectReason: rejected ? 'Damaged packaging on arrival' : null,
        unitCostPaise: invoicePaise,
        batchNo: batch?.row.batchNo ?? null,
        expiryDate: batch?.row.expiryDate ?? null,
      });
    }
    receipts.push(grn);
    d.po.pendingDeliveries--;
    d.po.lastReceiptAt = at;
  };

  // ── Sales orders ────────────────────────────────────────────────────────────
  const customersByWh = new Map<string, Array<CustomerDef & { id: string }>>();
  for (const wh of WAREHOUSES) {
    customersByWh.set(
      wh.code,
      customers.filter((c) => c.warehouse === wh.code || c.warehouse === '*'),
    );
  }

  const newSalesOrder = (
    customer: CustomerDef & { id: string },
    whId: string,
    at: Date,
    status: SoRow['status'],
  ): SoRow => ({
    id: newId(at),
    number: nextNumber('SO', at),
    customerId: customer.id,
    warehouseId: whId,
    channel: customer.type === 'RETAIL' ? 'STORE' : customer.type,
    status,
    orderDate: at,
    fulfilledAt: status === 'FULFILLED' ? new Date(at.getTime() + 150 * MIN) : null,
    createdById: users.staff,
    notes: null,
    lines: [],
  });

  // ── Daily loop ──────────────────────────────────────────────────────────────
  const overstockDay = off(plants.OVERSTOCK_ORDER_OFFSET);
  const mismatchDay = off(plants.RECEIPT_MISMATCH.orderOffset);
  const countVarianceDay = off(plants.COUNT_VARIANCE.offset);
  const shrinkByDay = new Map<string, Array<{ loc: Loc; qty: number; reason: string }>>();
  for (const s of plants.SHRINKAGE) {
    for (const e of s.events) {
      const d = off(e.offset);
      shrinkByDay.set(d, [
        ...(shrinkByDay.get(d) ?? []),
        { loc: loc(s.key, s.wh), qty: e.qty, reason: e.reason },
      ]);
    }
  }
  const transfersIn = new Map<
    string,
    Array<{ transfer: TransferRow; items: Array<{ loc: Loc; qty: number; unitCost: number }> }>
  >();
  const lastOrderDay = new Map<string, string>();

  for (let dayIndex = 0; dayIndex < HISTORY_DAYS; dayIndex++) {
    const day = addDays(start, dayIndex);
    const dr = rng.fork(`day|${day}`);

    // Quarterly parameter review by the buyer (legacy items keep their original parameters on record).
    if (dayIndex > 0 && dayIndex % 91 === 0) {
      for (const l of locs) {
        const pol = computePolicy(l, addDays(day, -45), 60);
        Object.assign(l, { rop: pol.rop, ss: pol.ss, max: pol.max, cycle: pol.cycle });
        if (!l.legacyParams) {
          l.storedRop = pol.rop;
          l.storedSs = pol.ss;
          l.storedMax = pol.max;
        }
      }
    }

    // 06:30 — write off expired batches.
    for (const l of locs) {
      if (!l.p.trackExpiry) continue;
      for (const b of l.batches) {
        if (b.expiry < day && b.qty > 0) {
          const qty = b.qty;
          b.qty = 0;
          b.row.quantity = 0;
          move(l, 'WRITE_OFF', -qty, istInstant(day, 6 * 60 + 30), {
            batchId: b.row.id,
            reasonCode: 'EXPIRED',
            note: `Batch ${b.row.batchNo} expired on ${b.expiry}`,
            userId: users.manager,
          });
        }
      }
      l.batches = l.batches.filter((b) => b.qty > 0);
    }

    // 09:00 onwards — deliveries.
    receivingCursor = istInstant(day, 9 * 60).getTime();
    for (const d of (deliveries.get(day) ?? []).sort((a, b) => a.minute - b.minute)) processDelivery(day, d);
    deliveries.delete(day);

    // Transfers arriving (after the morning's receipts, before sales).
    for (const tin of transfersIn.get(day) ?? []) {
      const at = new Date(Math.max(istInstant(day, 10 * 60 + 45).getTime(), receivingCursor));
      receivingCursor = at.getTime() + 10_000;
      for (const it of tin.items) {
        receive(it.loc, it.qty, it.unitCost, at, {
          type: 'TRANSFER_IN',
          reference: tin.transfer.number,
          sourceType: 'Transfer',
          sourceId: tin.transfer.id,
        });
      }
      tin.transfer.status = 'RECEIVED';
      tin.transfer.receivedAt = at;
    }
    transfersIn.delete(day);

    // 10:00+ — the day's sales orders, one line per product sold at each warehouse.
    for (const wh of WAREHOUSES) {
      const pool = customersByWh.get(wh.code) ?? [];
      const wholesale = dr.shuffle(pool.filter((c) => c.type === 'WHOLESALE')).slice(0, 2);
      const retail = dr.shuffle(pool.filter((c) => c.type === 'RETAIL')).slice(0, 3);
      const online = dr.shuffle(pool.filter((c) => c.type === 'ONLINE')).slice(0, 1);
      const dayCustomers = [...wholesale, ...retail, ...online];
      const orders = dayCustomers.map((c, i) =>
        newSalesOrder(c, warehouseIds.get(wh.code) ?? '', istInstant(day, 10 * 60 + i * 9), 'FULFILLED'),
      );
      const weights = dayCustomers.map((c) =>
        c.type === 'WHOLESALE' ? 0.19 : c.type === 'RETAIL' ? 0.17 : 0.11,
      );
      const wholesaleIdx = dayCustomers
        .map((c, i) => (c.type === 'WHOLESALE' ? i : -1))
        .filter((i) => i >= 0);

      for (const l of locsByWh.get(wh.code) ?? []) {
        const lr = dr.fork(l.key);
        let lambda = expected(l, day) * Math.exp(lr.normal(0, 0.12));
        if (l.deadFrom && day >= l.deadFrom) lambda = 0;
        let demand: number;
        if (l.p.p) demand = lr.bool(l.p.p) ? Math.max(1, lr.poisson(lambda / l.p.p)) : 0;
        else demand = lr.poisson(lambda);
        const spike = l.spikes.get(day);
        if (spike) demand = Math.round(Math.max(demand, expected(l, day)) * spike);
        l.demandEma = 0.9 * l.demandEma + 0.1 * demand;
        if (demand <= 0) continue;

        const orderIdx =
          l.p.wholesaleOnly || spike
            ? wholesaleIdx.length
              ? lr.pick(wholesaleIdx)
              : 0
            : dayCustomers.indexOf(lr.weighted(dayCustomers, weights));
        const so = orders[Math.max(0, orderIdx)];
        if (!so) continue;
        const at = istInstant(day, 11 * 60 + lr.float(0, 540));
        const sold = consume(l, demand, at, 'SALE', {
          reference: so.number,
          sourceType: 'SalesOrder',
          sourceId: so.id,
        });
        const price = sellingPaiseOn(l.p, day);
        const promo = promoOn(l.p, day);
        const discount = promo ? Math.round(demand * price * promo.discount) : 0;
        const lineTotal = demand * price - discount;
        so.lines.push({
          id: newId(at),
          salesOrderId: so.id,
          productId: l.productId,
          quantity: demand,
          quantityFulfilled: sold,
          unitPricePaise: price,
          discountPaise: discount,
          taxRate: l.p.taxRate,
          lineTotalPaise: lineTotal,
        });
        if (sold > 0) {
          salesDaily.push({
            productId: l.productId,
            warehouseId: l.whId,
            date: day,
            quantity: sold,
            revenuePaise: Math.round((lineTotal * sold) / demand),
            cogsPaise: Math.round(sold * l.avgCost * 100),
            orders: 1,
          });
          l.recentSales.push({ day, soId: so.id, soNumber: so.number, qty: sold });
          if (l.recentSales.length > 12) l.recentSales.shift();
        }
      }
      for (const so of orders) if (so.lines.length) salesOrders.push(so);
    }

    // 20:15 — customer returns (non-perishable).
    for (const wh of WAREHOUSES) {
      if (!dr.bool(0.3)) continue;
      const candidates = (locsByWh.get(wh.code) ?? []).filter(
        (l) => !l.p.trackExpiry && l.recentSales.some((s) => daysBetween(s.day, day) <= 10),
      );
      if (!candidates.length) continue;
      const l = dr.pick(candidates);
      const sale = dr.pick(l.recentSales.filter((s) => daysBetween(s.day, day) <= 10));
      const qty = Math.min(sale.qty, sale.qty >= 10 ? 2 : 1);
      move(l, 'RETURN', qty, istInstant(day, 20 * 60 + 15), {
        reasonCode: 'CUSTOMER_RETURN',
        reference: sale.soNumber,
        sourceType: 'SalesOrder',
        sourceId: sale.soId,
        note: 'Customer return, resaleable',
      });
    }

    // 20:30 — adjustments (random small ones + planted shrinkage).
    for (const l of locs) {
      if (!dr.bool(0.0012) || l.onHand <= 3) continue;
      const at = istInstant(day, 20 * 60 + 30);
      if (l.p.trackExpiry || dr.bool(0.7)) {
        const code = dr.bool(0.7) ? 'DAMAGED' : 'DATA_ENTRY';
        consume(l, dr.int(1, 3), at, 'ADJUSTMENT', {
          reasonCode: code,
          note: code === 'DAMAGED' ? 'Damaged in storage' : 'Corrected mis-keyed receipt',
        });
      } else {
        move(l, 'ADJUSTMENT', dr.int(1, 2), at, { reasonCode: 'FOUND', note: 'Found during putaway' });
      }
    }
    for (const s of shrinkByDay.get(day) ?? []) {
      consume(s.loc, s.qty, istInstant(day, 20 * 60 + 40), 'ADJUSTMENT', {
        reasonCode: s.reason,
        note:
          s.reason === 'SHRINKAGE' ? 'Shortfall found during shelf check' : 'Damaged cartons found in aisle',
      });
    }

    // 21:00 — cycle counts (each warehouse roughly monthly, plus the planted variance count).
    WAREHOUSES.forEach((wh, wi) => {
      const planted = day === countVarianceDay && wh.code === plants.COUNT_VARIANCE.wh;
      if (!planted && (dayIndex + wi * 10) % 30 !== 15) return;
      const whId = warehouseIds.get(wh.code) ?? '';
      const created = istInstant(day, 9 * 60);
      const cc: CycleCountRow = {
        id: newId(created),
        number: nextNumber('CC', created),
        warehouseId: whId,
        status: 'COMPLETED',
        reason: planted ? 'Monthly count — spices aisle' : 'Routine monthly cycle count',
        createdById: users.manager,
        approvedById: users.manager,
        createdAt: created,
        submittedAt: istInstant(day, 18 * 60),
        completedAt: istInstant(day, 21 * 60),
        lines: [],
      };
      const chosen: Array<{ l: Loc; variance: number }> = [];
      if (planted) {
        for (const line of plants.COUNT_VARIANCE.lines) {
          const l = loc(line.key, wh.code);
          const variance =
            'fraction' in line ? Math.round(l.onHand * (line.fraction ?? 0)) : (line.units ?? 0);
          chosen.push({ l, variance: Math.max(-l.onHand, variance) });
        }
      } else {
        const pool = dr.shuffle((locsByWh.get(wh.code) ?? []).filter((l) => !l.p.trackExpiry)).slice(0, 12);
        for (const l of pool) {
          const variance = dr.bool(0.22) ? Math.max(-l.onHand, dr.pick([-3, -2, -2, -1, -1, 1])) : 0;
          chosen.push({ l, variance });
        }
      }
      let k = 0;
      for (const { l, variance } of chosen) {
        const at = istInstant(day, 21 * 60 + k++ * 0.5);
        const expectedQty = l.onHand;
        if (variance !== 0) {
          if (variance > 0)
            move(l, 'COUNT_CORRECTION', variance, at, {
              reasonCode: 'COUNT_VARIANCE',
              reference: cc.number,
              sourceType: 'CycleCount',
              sourceId: cc.id,
            });
          else
            consume(l, -variance, at, 'COUNT_CORRECTION', {
              reasonCode: 'COUNT_VARIANCE',
              reference: cc.number,
              sourceType: 'CycleCount',
              sourceId: cc.id,
            });
        }
        cc.lines.push({
          id: newId(at),
          productId: l.productId,
          expectedQty,
          countedQty: expectedQty + variance,
          variance,
          varianceValuePaise: Math.round(variance * l.avgCost * 100),
          status: 'ACCEPTED',
          countedAt: istInstant(day, 16 * 60 + k * 3),
        });
      }
      cycleCounts.push(cc);
    });

    // 21:30 — rebalancing transfers a few times a month (from the best-covered to the least-covered warehouse).
    if (dayIndex % 10 === 4) {
      let made = 0;
      for (const p of dr.shuffle([...products])) {
        if (made >= 2 || p.trackExpiry) continue;
        const ls = locsByProduct.get(p.key) ?? [];
        if (ls.length < 2) continue;
        const cover = (l: Loc) => (l.onHand + l.onOrder) / Math.max(0.2, l.demandEma);
        const sorted = [...ls].sort((a, b) => cover(b) - cover(a));
        const rich = sorted[0];
        const poor = sorted[sorted.length - 1];
        if (!rich || !poor || cover(rich) < 2 * cover(poor) || cover(rich) < 20) continue;
        const qty =
          Math.floor(Math.min(rich.onHand - rich.rop, Math.max(poor.demandEma * 7, p.pack)) / p.pack) *
          p.pack;
        if (qty < p.pack) continue;
        const at = istInstant(day, 21 * 60 + 30);
        const transfer: TransferRow = {
          id: newId(at),
          number: nextNumber('TRF', at),
          fromWarehouseId: rich.whId,
          toWarehouseId: poor.whId,
          status: 'IN_TRANSIT',
          reason: `Rebalance: ${rich.wh.city} holds excess while ${poor.wh.city} is below its reorder point`,
          createdById: users.manager,
          shippedAt: at,
          receivedAt: null,
          createdAt: new Date(at.getTime() - 60 * MIN),
          lines: [{ id: newId(at), productId: rich.productId, quantity: qty }],
        };
        const unitCost = rich.avgCost;
        consume(rich, qty, at, 'TRANSFER_OUT', {
          reference: transfer.number,
          sourceType: 'Transfer',
          sourceId: transfer.id,
        });
        const arrive = addDays(day, 1);
        transfersIn.set(arrive, [
          ...(transfersIn.get(arrive) ?? []),
          { transfer, items: [{ loc: poor, qty, unitCost }] },
        ]);
        transfers.push(transfer);
        made++;
      }
    }

    // 17:00–18:00 — replenishment decisions. Buyers consolidate: each supplier gets at most one PO per
    // warehouse every few days, except for urgent lines (at or below safety stock).
    const groups = new Map<
      string,
      { supplier: SupplierDef; wh: WarehouseDef; items: Array<{ loc: Loc; qty: number; link: SupplierLink }> }
    >();
    const stuckItems: Array<{ loc: Loc; qty: number; link: SupplierLink }> = [];
    const cutItems: Array<{ loc: Loc; qty: number; link: SupplierLink }> = [];
    const toEnd = daysBetween(day, today);
    for (const l of locs) {
      if (l.blocked) continue;
      if (l.deadFrom && day >= l.deadFrom) continue;
      const fAhead = Math.max(1, festiveAhead(l.p, day, Math.max(1, l.lt + l.cycle)));
      const rop = Math.ceil(l.rop * fAhead);
      const max = Math.ceil(l.max * fAhead);
      const position = l.onHand + l.onOrder;
      const stuckDue = l.stuck && toEnd <= -plants.STUCK_WINDOW.from;
      const forceStuck = stuckDue && toEnd <= -plants.STUCK_WINDOW.force;
      if (position > rop && !forceStuck) continue;
      const or = dr.fork(`order|${l.key}`);
      const links = l.p.suppliers;
      const planted = stuckDue || (l.lowTarget !== null && toEnd <= plants.LOW_STOCK_WINDOW_DAYS);
      const link =
        !planted && links.length > 1 && or.bool(0.12) ? (or.pick(links.slice(1)) ?? links[0]) : links[0];
      if (!link) continue;
      const qty = Math.max(roundUp(max - position, link.packSize), link.moq);
      if (stuckDue) {
        stuckItems.push({ loc: l, qty, link });
        l.blocked = true;
        continue;
      }
      if (l.lowTarget !== null && toEnd <= plants.LOW_STOCK_WINDOW_DAYS) {
        // The reorder whose normal quantity would carry the item past today is cut short: order only
        // enough to finish near the target cover, then stop reordering.
        let remaining = 0;
        for (let i = 1; i < toEnd; i++) remaining += expected(l, addDays(day, i));
        const shortfall = l.lowTarget * expected(l, lastDay) - (position - remaining);
        if (shortfall <= qty) {
          l.blocked = true;
          if (shortfall < l.p.pack) continue;
          // Delivered on time and in full, so supplier noise can't move the planted outcome.
          cutItems.push({
            loc: l,
            qty: Math.floor(shortfall / link.packSize) * link.packSize || link.packSize,
            link,
          });
          continue;
        }
      }
      const gapKey = `${link.supplier.code}|${l.wh.code}`;
      const gap =
        link.supplier.code === 'HDC' || link.supplier.code === 'KBK'
          ? 1
          : link.supplier.code === 'SWM'
            ? 2
            : 4;
      const last = lastOrderDay.get(gapKey);
      const urgent = l.onHand <= Math.ceil(l.ss * fAhead);
      if (last && daysBetween(last, day) < gap && !urgent) continue;
      const k = `${link.supplier.code}|${l.wh.code}`;
      const g = groups.get(k) ?? { supplier: link.supplier, wh: l.wh, items: [] };
      g.items.push({ loc: l, qty, link });
      groups.set(k, g);
    }

    // Planted: reorders sent to a supplier who never delivers them (they become overdue POs).
    const stuckGroups = new Map<string, typeof stuckItems>();
    for (const it of stuckItems) {
      const k = `${it.link.supplier.code}|${it.loc.wh.code}`;
      stuckGroups.set(k, [...(stuckGroups.get(k) ?? []), it]);
    }
    for (const items of stuckGroups.values()) {
      const first = items[0];
      if (!first) continue;
      const po = createPo(
        first.link.supplier,
        first.loc.wh,
        day,
        17 * 60 + 5,
        items.map((i) => ({ loc: i.loc, qty: i.qty, costPaise: supplierCostPaise(i.link, i.loc.p, day) })),
        Math.max(...items.map((i) => i.link.leadTimeDays)),
      );
      po.pendingDeliveries = 1; // never arrives within the history
      notes.push(
        `Overdue PO ${po.number} (${first.link.supplier.name} → ${first.loc.wh.city}), expected ${po.expectedDate}`,
      );
    }

    // Planted: one-off bulk buys that became overstock.
    if (day === overstockDay) {
      for (const o of plants.OVERSTOCK) {
        const l = loc(o.key, o.wh);
        const link = l.p.suppliers[0];
        if (!link) continue;
        const qty = roundUp(Math.max(l.demandEma, l.p.v * l.share) * o.days, l.p.pack);
        const po = createPo(
          link.supplier,
          l.wh,
          day,
          12 * 60,
          [{ loc: l, qty, costPaise: supplierCostPaise(link, l.p, day) }],
          link.leadTimeDays,
        );
        po.notes = 'Bulk buy ahead of an expected promotion';
        schedule(addDays(day, Math.min(4, link.leadTimeDays)), {
          po,
          items: [{ line: po.lines[0] as PoLineRow, loc: l, qty, final: true, remainderCancelled: 0 }],
          minute: 9 * 60 + 30,
        });
        po.pendingDeliveries = 1;
      }
    }

    // Planted: top up stock before a demand spike so the spike is visible.
    for (const s of plants.SPIKES) {
      if (addDays(off(s.offset), -3) !== day) continue;
      const l = loc(s.key, s.wh);
      const link = l.p.suppliers[0];
      if (!link) continue;
      const qty = roundUp(Math.max(l.demandEma, 1) * s.factor * 2, l.p.pack);
      const po = createPo(
        link.supplier,
        l.wh,
        day,
        10 * 60,
        [{ loc: l, qty, costPaise: supplierCostPaise(link, l.p, day) }],
        1,
      );
      schedule(addDays(day, 1), {
        po,
        items: [{ line: po.lines[0] as PoLineRow, loc: l, qty, final: true, remainderCancelled: 0 }],
        minute: 9 * 60 + 15,
      });
      po.pendingDeliveries = 1;
    }

    // Planted: partial, over-priced delivery from the spice trader.
    if (day === mismatchDay) {
      const m = plants.RECEIPT_MISMATCH;
      const supplier = SUPPLIERS.find((s) => s.code === m.supplier);
      const wh = WAREHOUSES.find((w) => w.code === m.wh);
      if (supplier && wh) {
        const items = m.lines.map((line) => {
          const l = loc(line.key, m.wh);
          const link = l.p.suppliers.find((s) => s.supplier.code === m.supplier) ?? l.p.suppliers[0];
          if (!link) throw new Error('no link');
          return { loc: l, qty: line.ordered, costPaise: supplierCostPaise(link, l.p, day) };
        });
        for (const it of items) groups.forEach((g) => (g.items = g.items.filter((x) => x.loc !== it.loc)));
        const po = createPo(supplier, wh, day, 16 * 60, items, 8);
        const delivery: Delivery = {
          po,
          minute: 10 * 60 + 5,
          items: m.lines.map((line, i) => ({
            line: po.lines[i] as PoLineRow,
            loc: loc(line.key, m.wh),
            qty: line.received,
            final: line.received === line.ordered,
            remainderCancelled: 0,
            invoiceFactor: line.invoiceFactor,
          })),
        };
        schedule(off(m.receiptOffset), delivery);
        // One delivery arrives; the balance of the short line is still awaited.
        po.pendingDeliveries = m.lines.some((l) => l.received < l.ordered) ? 2 : 1;
        notes.push(`Partial, over-invoiced receipt against ${po.number} (${supplier.name})`);
      }
    }

    // Planted: the short last order before a LOW_STOCK item stops being reordered.
    for (const it of cutItems) {
      const po = createPo(
        it.link.supplier,
        it.loc.wh,
        day,
        17 * 60 + 10,
        [{ loc: it.loc, qty: it.qty, costPaise: supplierCostPaise(it.link, it.loc.p, day) }],
        it.link.leadTimeDays,
      );
      const line = po.lines[0];
      if (!line) continue;
      schedule(addDays(day, Math.max(1, it.link.leadTimeDays)), {
        po,
        items: [{ line, loc: it.loc, qty: it.qty, final: true, remainderCancelled: 0 }],
        minute: 9 * 60 + 20,
      });
      po.pendingDeliveries = 1;
    }

    for (const g of groups.values()) {
      if (!g.items.length) continue;
      placeOrder(g.supplier, g.wh, day, g.items);
      lastOrderDay.set(`${g.supplier.code}|${g.wh.code}`, day);
    }

    // End of day — inventory snapshot per warehouse.
    for (const wh of WAREHOUSES) {
      const ls = locsByWh.get(wh.code) ?? [];
      let units = 0;
      let value = 0;
      let skus = 0;
      let low = 0;
      let out = 0;
      for (const l of ls) {
        units += l.onHand;
        value += l.onHand * l.avgCost;
        if (l.onHand > 0) skus++;
        // "Low" means it needs action: nothing on order covers the reorder point.
        if (l.onHand === 0) out++;
        else if (l.onHand + l.onOrder <= l.storedRop) low++;
      }
      snapshots.push({
        date: day,
        warehouseId: warehouseIds.get(wh.code) ?? '',
        totalUnits: units,
        totalValuePaise: Math.round(value * 100),
        skuCount: skus,
        lowStockCount: low,
        outOfStockCount: out,
      });
    }
  }

  // ── Open documents as of yesterday evening ─────────────────────────────────
  // Deliveries scheduled after yesterday stay open (SENT / PARTIALLY_RECEIVED).
  for (const po of purchaseOrders) {
    if (po.pendingDeliveries > 0) {
      po.status = po.lastReceiptAt ? 'PARTIALLY_RECEIVED' : 'SENT';
      po.receivedAt = po.lastReceiptAt;
    } else {
      const last = po.lastReceiptAt ?? po.orderDate;
      po.receivedAt = last;
      if (daysBetween(istDay(last), lastDay) > 7) {
        po.status = 'CLOSED';
        po.closedAt = new Date(last.getTime() + 3 * 24 * 60 * MIN);
        if (po.shortClosed) po.notes = 'Closed short: the supplier could not supply the balance.';
      } else {
        po.status = 'RECEIVED';
      }
    }
  }

  const eve = (minute: number) => istInstant(lastDay, minute);
  const wholesaleCustomers = customers.filter((c) => c.type === 'WHOLESALE');
  const whId = (code: string) => warehouseIds.get(code) ?? '';

  // Draft PO started by the manager, and a large one submitted by staff for approval.
  {
    const khc = SUPPLIERS.find((s) => s.code === 'KHC');
    const chn = WAREHOUSES.find((w) => w.code === 'CHN');
    if (khc && chn) {
      const items = (locsByWh.get('CHN') ?? [])
        .filter((l) => l.p.suppliers[0]?.supplier.code === 'KHC')
        .slice(0, 3)
        .map((l) => ({
          loc: l,
          qty: roundUp(l.p.v * l.share * 10, l.p.pack),
          costPaise: supplierCostPaise(l.p.suppliers[0] as SupplierLink, l.p, lastDay),
        }));
      const po = createPo(khc, chn, lastDay, 15 * 60, items, 6);
      Object.assign(po, {
        status: 'DRAFT',
        createdById: users.manager,
        submittedAt: null,
        approvedById: null,
        approvedAt: null,
        sentAt: null,
        notes: 'Top-up for next week — review quantities',
      });
      for (const it of items) it.loc.onOrder -= it.qty;
    }
    const ngm = SUPPLIERS.find((s) => s.code === 'NGM');
    const blr = WAREHOUSES.find((w) => w.code === 'BLR');
    if (ngm && blr) {
      const items = (locsByWh.get('BLR') ?? [])
        .filter((l) => l.p.suppliers[0]?.supplier.code === 'NGM' && l.p.v >= 15)
        .slice(0, 4)
        .map((l) => ({
          loc: l,
          qty: roundUp(l.p.v * l.share * 21, l.p.pack),
          costPaise: supplierCostPaise(l.p.suppliers[0] as SupplierLink, l.p, lastDay),
        }));
      const po = createPo(ngm, blr, lastDay, 16 * 60, items, 4);
      Object.assign(po, {
        status: 'PENDING_APPROVAL',
        createdById: users.staff,
        approvedById: null,
        approvedAt: null,
        sentAt: null,
        notes: 'Festive season stock-up (Navratri) — needs manager approval',
      });
      for (const it of items) it.loc.onOrder -= it.qty;
    }
  }

  // Confirmed (reserved) and draft sales orders.
  const reservations = new Map<Loc, number>();
  const openOrder = (
    customer: CustomerDef & { id: string },
    wh: string,
    minute: number,
    status: 'CONFIRMED' | 'DRAFT',
    count: number,
  ) => {
    const r = rng.fork(`open-so|${customer.code}|${minute}`);
    const so = newSalesOrder(customer, whId(wh), eve(minute), status);
    const pool = r.shuffle(
      (locsByWh.get(wh) ?? []).filter((l) => l.onHand - (reservations.get(l) ?? 0) > 20 && !l.p.trackExpiry),
    );
    for (const l of pool.slice(0, count)) {
      const available = l.onHand - (reservations.get(l) ?? 0);
      const qty = Math.min(available, roundUp(Math.max(1, l.p.v * l.share * r.float(1.5, 3)), l.p.pack));
      if (qty <= 0) continue;
      const price = sellingPaiseOn(l.p, lastDay);
      so.lines.push({
        id: newId(so.orderDate),
        salesOrderId: so.id,
        productId: l.productId,
        quantity: qty,
        quantityFulfilled: 0,
        unitPricePaise: price,
        discountPaise: 0,
        taxRate: l.p.taxRate,
        lineTotalPaise: qty * price,
      });
      if (status === 'CONFIRMED') reservations.set(l, (reservations.get(l) ?? 0) + qty);
    }
    so.notes = status === 'CONFIRMED' ? 'Dispatch tomorrow morning' : 'Awaiting customer confirmation';
    salesOrders.push(so);
  };
  wholesaleCustomers
    .slice(0, 3)
    .forEach((c, i) =>
      openOrder(c, c.warehouse === '*' ? 'CHN' : c.warehouse, 18 * 60 + i * 10, 'CONFIRMED', 5),
    );
  customers
    .filter((c) => c.type === 'RETAIL')
    .slice(0, 2)
    .forEach((c, i) =>
      openOrder(c, c.warehouse === '*' ? 'CHN' : c.warehouse, 18 * 60 + 40 + i * 10, 'DRAFT', 4),
    );

  // Goods on the road between warehouses.
  {
    const t = plants.IN_TRANSIT;
    const at = eve(21 * 60 + 45);
    const transfer: TransferRow = {
      id: newId(at),
      number: nextNumber('TRF', at),
      fromWarehouseId: whId(t.from),
      toWarehouseId: whId(t.to),
      status: 'IN_TRANSIT',
      reason: 'Hyderabad running low on staples ahead of the weekend',
      createdById: users.manager,
      shippedAt: at,
      receivedAt: null,
      createdAt: new Date(at.getTime() - 90 * MIN),
      lines: [],
    };
    for (const line of t.lines) {
      const l = loc(line.key, t.from);
      const qty = Math.min(line.qty, l.onHand - (reservations.get(l) ?? 0));
      if (qty <= 0) continue;
      consume(l, qty, at, 'TRANSFER_OUT', {
        reference: transfer.number,
        sourceType: 'Transfer',
        sourceId: transfer.id,
      });
      transfer.lines.push({ id: newId(at), productId: l.productId, quantity: qty });
    }
    transfers.push(transfer);
  }

  // A cycle count in progress at Bengaluru.
  {
    const at = eve(9 * 60 + 30);
    const cc: CycleCountRow = {
      id: newId(at),
      number: nextNumber('CC', at),
      warehouseId: whId('BLR'),
      status: 'OPEN',
      reason: 'Quarterly count — personal care aisle',
      createdById: users.manager,
      approvedById: null,
      createdAt: at,
      submittedAt: null,
      completedAt: null,
      lines: [],
    };
    const pool = (locsByWh.get('BLR') ?? [])
      .filter((l) => l.p.category.slug === 'personal-care')
      .slice(0, 10);
    for (const l of pool) {
      cc.lines.push({
        id: newId(at),
        productId: l.productId,
        expectedQty: l.onHand,
        countedQty: null,
        variance: null,
        varianceValuePaise: null,
        status: 'PENDING',
        countedAt: null,
      });
    }
    cycleCounts.push(cc);
  }

  // Batches that will expire soon (expiry dates moved; quantities untouched, so the ledger is unaffected).
  for (const e of plants.EXPIRING) {
    const l = loc(e.key, e.wh);
    sortBatches(l);
    const target = [...l.batches].sort((a, b) => b.qty - a.qty)[0];
    if (!target) {
      notes.push(`No stock left to expire for ${e.key} @ ${e.wh}`);
      continue;
    }
    const expiry = addDays(today, e.days);
    target.expiry = expiry;
    target.row.expiryDate = expiry;
    target.row.manufacturedOn = addDays(expiry, -(l.p.shelfLifeDays ?? 30));
    if (target.row.manufacturedOn > istDay(target.row.receivedAt))
      target.row.manufacturedOn = istDay(target.row.receivedAt);
  }

  // ── Final stock levels ──────────────────────────────────────────────────────
  const stockLevels: StockLevelRow[] = locs.map((l) => ({
    id: newId(l.lastMovementAt ?? new Date()),
    productId: l.productId,
    warehouseId: l.whId,
    onHand: l.onHand,
    reserved: reservations.get(l) ?? 0,
    avgCost: l.avgCost.toFixed(4),
    reorderPoint: l.storedRop,
    safetyStock: l.storedSs,
    maxStock: l.storedMax,
    lastMovementAt: l.lastMovementAt,
  }));

  const supplierCosts = new Map<string, number>();
  for (const p of products)
    for (const link of p.suppliers)
      supplierCosts.set(`${link.supplier.code}|${p.key}`, supplierCostPaise(link, p, today));

  // Planted-situation check lines for the seed log.
  const planted = [
    ...plants.LOW_STOCK.map((b) => ({ l: loc(b.key, b.wh), why: `under-ordered, target ${b.coverDays}d` })),
    ...plants.STUCK_ORDERS.map((o) => ({ l: loc(o.key, o.wh), why: 'overdue PO' })),
  ];
  for (const { l, why } of planted) {
    const cover = l.onHand / Math.max(0.1, l.demandEma);
    const state =
      l.onHand === 0
        ? 'OUT'
        : l.onHand + l.onOrder <= l.storedRop
          ? 'LOW'
          : cover < l.lt
            ? 'PROJECTED'
            : 'ok?';
    notes.push(
      `${state.padEnd(9)} ${l.p.name} @ ${l.wh.code} (${why}): ${l.onHand} on hand + ${l.onOrder} on order, ROP ${l.storedRop}, ~${cover.toFixed(1)} days cover, lead ${l.lt}d`,
    );
  }
  for (const o of plants.OVERSTOCK) {
    const l = loc(o.key, o.wh);
    notes.push(
      `OVERSTOCK ${l.p.name} @ ${l.wh.code}: ${l.onHand} on hand ≈ ${Math.round(l.onHand / Math.max(0.05, l.demandEma))} days of demand`,
    );
  }

  return {
    movements,
    batches,
    purchaseOrders,
    receipts,
    salesOrders,
    salesDaily,
    snapshots,
    transfers,
    cycleCounts,
    stockLevels,
    supplierCosts,
    sequences,
    notes,
  };
}
