import pg from 'pg';
import { type Db, SESSION_OPTIONS } from '../db/client';
import { hashPassword } from '../services/password';
import { bulkInsert, rupees, suspendIndexes } from './bulk-insert';
import { addDays, istDay, istInstant } from './calendar';
import {
  DEMO_PASSWORD,
  type DemoUserKey,
  ORGANIZATION,
  REASON_CODES,
  SUPPLIERS,
  UNITS,
  USERS,
  WAREHOUSES,
} from './catalog';
import { buildCustomers } from './customers';
import { CATEGORIES } from './product-range';
import { buildProducts, type ProductSpec } from './products';
import { Rng, uuidv7 } from './random';
import { HISTORY_DAYS, simulate, type SimulationResult } from './simulate';

export interface DemoData {
  today: string;
  products: ProductSpec[];
  ids: {
    org: string;
    users: Record<DemoUserKey, string>;
    units: Map<string, string>;
    categories: Map<string, string>;
    warehouses: Map<string, string>;
    suppliers: Map<string, string>;
    products: Map<string, string>;
    customers: Map<string, string>;
    reasons: Map<string, string>;
  };
  customers: ReturnType<typeof buildCustomers>;
  sim: SimulationResult;
}

/** Builds the whole demo dataset in memory (no database access). Deterministic for a seed and a date. */
export function buildDemoData(seed: number, now: Date): DemoData {
  const today = istDay(now);
  const start = addDays(today, -HISTORY_DAYS);
  const rng = new Rng(seed);
  // Master-data ids are stable across resets (same seed → same ids), which keeps demo URLs valid.
  const idRng = rng.fork('master-ids');
  const masterAt = istInstant(start, 0).getTime();
  let tick = 0;
  const id = () => uuidv7(masterAt + tick++, idRng);

  const products = buildProducts(rng.fork('products'), start, today);
  const customers = buildCustomers();

  const ids: DemoData['ids'] = {
    org: id(),
    users: Object.fromEntries(USERS.map((u) => [u.key, id()])) as Record<DemoUserKey, string>,
    units: new Map(UNITS.map((u) => [u.code, id()])),
    categories: new Map(),
    warehouses: new Map(WAREHOUSES.map((w) => [w.code, id()])),
    suppliers: new Map(SUPPLIERS.map((s) => [s.code, id()])),
    products: new Map(products.map((p) => [p.key, id()])),
    customers: new Map(customers.map((c) => [c.code, id()])),
    reasons: new Map(REASON_CODES.map((r) => [r.code, id()])),
  };
  for (const c of CATEGORIES) {
    ids.categories.set(c.slug, id());
    for (const s of c.subcategories) ids.categories.set(`${c.slug}-${slugifyName(s.name)}`, id());
  }

  const sim = simulate({
    rng: rng.fork('simulation'),
    today,
    products,
    productIds: ids.products,
    warehouseIds: ids.warehouses,
    supplierIds: ids.suppliers,
    customers: customers.map((c) => ({ ...c, id: ids.customers.get(c.code) ?? '' })),
    reasonIds: ids.reasons,
    users: ids.users,
  });
  return { today, products, ids, customers, sim };
}

function slugifyName(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** In-memory invariant checks, run before anything is written. Throws on the first violation. */
export function verifyDemoData(data: DemoData): string[] {
  const { sim } = data;
  const problems: string[] = [];
  const byLoc = new Map<string, typeof sim.movements>();
  for (const m of sim.movements) {
    const k = `${m.productId}|${m.warehouseId}`;
    const list = byLoc.get(k);
    if (list) list.push(m);
    else byLoc.set(k, [m]);
  }
  const levels = new Map(sim.stockLevels.map((s) => [`${s.productId}|${s.warehouseId}`, s]));
  for (const [k, list] of byLoc) {
    list.sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
    let balance = 0;
    for (const m of list) {
      balance += m.quantity;
      if (balance !== m.balanceAfter) {
        problems.push(
          `Running balance mismatch at ${k} ${m.occurredAt.toISOString()}: ${balance} ≠ ${m.balanceAfter}`,
        );
        break;
      }
      if (balance < 0) problems.push(`Negative balance at ${k}`);
    }
    const level = levels.get(k);
    if (!level || level.onHand !== balance)
      problems.push(`Stock level ≠ ledger at ${k}: ${level?.onHand} vs ${balance}`);
    if (level && level.reserved > level.onHand) problems.push(`Reserved > on hand at ${k}`);
  }
  const trackedIds = new Set(
    data.products.filter((p) => p.trackExpiry).map((p) => data.ids.products.get(p.key)),
  );
  const batchSums = new Map<string, number>();
  for (const b of sim.batches) {
    if (b.quantity < 0) problems.push(`Negative batch ${b.batchNo}`);
    const k = `${b.productId}|${b.warehouseId}`;
    batchSums.set(k, (batchSums.get(k) ?? 0) + b.quantity);
  }
  for (const s of sim.stockLevels) {
    if (!trackedIds.has(s.productId)) continue;
    const sum = batchSums.get(`${s.productId}|${s.warehouseId}`) ?? 0;
    if (sum !== s.onHand)
      problems.push(`Batches (${sum}) ≠ on hand (${s.onHand}) for ${s.productId}@${s.warehouseId}`);
  }
  for (const po of sim.purchaseOrders) {
    for (const l of po.lines) {
      if (l.quantityReceived + l.quantityRejected > l.quantityOrdered)
        problems.push(`Over-received line on ${po.number}`);
    }
  }
  return problems.slice(0, 20);
}

export interface SeedOptions {
  prisma: Db;
  databaseUrl: string;
  seed: number;
  now?: Date;
  log?: (message: string) => void;
  /** Tables to leave as they are (the in-app reset keeps AI and agent configuration). */
  keepTables?: readonly string[];
}

const APP_TABLES_SQL = `
  SELECT string_agg(format('%I.%I', schemaname, tablename), ', ')
  FROM pg_tables
  WHERE schemaname = 'public' AND tablename <> '_prisma_migrations' AND tablename <> ALL($1::text[])`;

/** The large tables, loaded without their secondary indexes and foreign keys (rebuilt afterwards). */
const BULK_TABLES = [
  'stock_movements',
  'sales_order_lines',
  'sales_orders',
  'sales_daily',
  'inventory_snapshots',
  'purchase_order_lines',
  'purchase_orders',
  'goods_receipt_lines',
  'goods_receipts',
  'batches',
];

/** Wipes the application tables and loads the deterministic demo dataset. */
export async function seedDemoData({
  prisma,
  databaseUrl,
  seed,
  now = new Date(),
  log = () => {},
  keepTables = [],
}: SeedOptions) {
  const started = performance.now();
  const lap = (label: string) => log(`${label} (${((performance.now() - started) / 1000).toFixed(1)}s)`);

  const data = buildDemoData(seed, now);
  lap(
    `Simulated ${HISTORY_DAYS} days for ${data.products.length} products × ${WAREHOUSES.length} warehouses`,
  );
  const problems = verifyDemoData(data);
  if (problems.length) throw new Error(`Demo data failed its invariants:\n${problems.join('\n')}`);

  const { ids, sim, products, customers, today } = data;
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const startDay = addDays(today, -HISTORY_DAYS);
  const t0 = istInstant(startDay, 0);

  const pool = new pg.Pool({ connectionString: databaseUrl, max: 2, options: SESSION_OPTIONS });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const tables = (await client.query<{ string_agg: string | null }>(APP_TABLES_SQL, [keepTables])).rows[0]
      ?.string_agg;
    if (tables) await client.query(`TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`);
    const restoreIndexes = await suspendIndexes(client, BULK_TABLES);

    // ── Master data ──────────────────────────────────────────────────────────
    await client.query(
      `INSERT INTO organizations (id, name, legal_name, gstin, address, currency, locale, timezone, settings, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'INR', 'en-IN', 'Asia/Kolkata', $6, $7, $7)`,
      [
        ids.org,
        ORGANIZATION.name,
        ORGANIZATION.legalName,
        ORGANIZATION.gstin,
        ORGANIZATION.address,
        JSON.stringify({
          briefingTime: '08:00',
          serviceLevel: 0.95,
          orderCostInr: 500,
          holdingRate: 0.2,
          reviewPeriodDays: 7,
          expiryWarningDays: 14,
          overstockDays: 180,
          deadStockDays: 90,
          alertDedupeHours: 24,
          actionDedupeHours: 72,
          largeAdjustmentUnits: 50,
          poApprovalThresholdInr: 100000,
        }),
        t0,
      ],
    );

    await bulkInsert(
      client,
      'users',
      [
        ['id', 'uuid'],
        ['email', 'text'],
        ['name', 'text'],
        ['password_hash', 'text'],
        ['role', '"Role"'],
        ['preferences', 'jsonb'],
        ['created_at', 'timestamptz'],
        ['updated_at', 'timestamptz'],
      ],
      USERS.map((u) => [ids.users[u.key], u.email, u.name, passwordHash, u.role, '{}', t0, t0]),
    );
    await bulkInsert(
      client,
      'units',
      [
        ['id', 'uuid'],
        ['code', 'text'],
        ['name', 'text'],
      ],
      UNITS.map((u) => [ids.units.get(u.code) ?? '', u.code, u.name]),
    );

    const categoryRows: Array<Array<string | number | Date | null>> = [];
    CATEGORIES.forEach((c, i) => {
      categoryRows.push([ids.categories.get(c.slug) ?? '', c.name, c.slug, c.description, null, i, t0, t0]);
    });
    CATEGORIES.forEach((c) => {
      c.subcategories.forEach((s, j) => {
        const slug = `${c.slug}-${slugifyName(s.name)}`;
        categoryRows.push([
          ids.categories.get(slug) ?? '',
          s.name,
          slug,
          null,
          ids.categories.get(c.slug) ?? null,
          j,
          t0,
          t0,
        ]);
      });
    });
    await bulkInsert(
      client,
      'categories',
      [
        ['id', 'uuid'],
        ['name', 'text'],
        ['slug', 'text'],
        ['description', 'text'],
        ['parent_id', 'uuid'],
        ['sort_order', 'int4'],
        ['created_at', 'timestamptz'],
        ['updated_at', 'timestamptz'],
      ],
      categoryRows,
    );

    await bulkInsert(
      client,
      'warehouses',
      [
        ['id', 'uuid'],
        ['code', 'text'],
        ['name', 'text'],
        ['city', 'text'],
        ['address', 'text'],
        ['is_default', 'bool'],
        ['created_at', 'timestamptz'],
        ['updated_at', 'timestamptz'],
      ],
      WAREHOUSES.map((w) => [
        ids.warehouses.get(w.code) ?? '',
        w.code,
        w.name,
        w.city,
        w.address,
        w.isDefault,
        t0,
        t0,
      ]),
    );

    await bulkInsert(
      client,
      'suppliers',
      [
        ['id', 'uuid'],
        ['code', 'text'],
        ['name', 'text'],
        ['contact_name', 'text'],
        ['email', 'text'],
        ['phone', 'text'],
        ['city', 'text'],
        ['gstin', 'text'],
        ['payment_terms_days', 'int4'],
        ['notes', 'text'],
        ['created_at', 'timestamptz'],
        ['updated_at', 'timestamptz'],
      ],
      SUPPLIERS.map((s) => [
        ids.suppliers.get(s.code) ?? '',
        s.code,
        s.name,
        s.contactName,
        s.email,
        s.phone,
        s.city,
        s.gstin,
        s.paymentTermsDays,
        s.notes ?? null,
        t0,
        t0,
      ]),
    );

    // Products carry a text[] column, so they go through a regular multi-row insert.
    for (const p of products) {
      const primary = p.suppliers[0];
      await client.query(
        `INSERT INTO products (id, sku, barcode, name, description, category_id, brand, unit_id, cost_price, selling_price, mrp,
           tax_rate, tags, track_expiry, shelf_life_days, lead_time_days, preferred_supplier_id, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$18)`,
        [
          ids.products.get(p.key),
          p.sku,
          p.barcode,
          p.name,
          p.description,
          ids.categories.get(p.subcategorySlug),
          p.brand,
          ids.units.get(p.unitCode),
          rupees(sim.supplierCosts.get(`${primary?.supplier.code}|${p.key}`) ?? p.costPaise),
          rupees(p.sellingPaise),
          rupees(p.mrpPaise),
          p.taxRate.toFixed(2),
          p.tags,
          p.trackExpiry,
          p.shelfLifeDays,
          p.leadTimeDays,
          primary ? ids.suppliers.get(primary.supplier.code) : null,
          t0,
        ],
      );
    }

    const linkIds = new Rng(seed).fork('supplier-products');
    await bulkInsert(
      client,
      'supplier_products',
      [
        ['id', 'uuid'],
        ['supplier_id', 'uuid'],
        ['product_id', 'uuid'],
        ['supplier_sku', 'text'],
        ['unit_cost', 'numeric'],
        ['moq', 'int4'],
        ['pack_size', 'int4'],
        ['lead_time_days', 'int4'],
        ['updated_at', 'timestamptz'],
      ],
      products.flatMap((p, i) =>
        p.suppliers.map((link, j) => [
          uuidv7(t0.getTime() + 10_000 + i * 10 + j, linkIds),
          ids.suppliers.get(link.supplier.code) ?? '',
          ids.products.get(p.key) ?? '',
          link.supplierSku,
          rupees(sim.supplierCosts.get(`${link.supplier.code}|${p.key}`) ?? link.costPaise),
          link.moq,
          link.packSize,
          link.leadTimeDays,
          t0,
        ]),
      ),
    );

    await bulkInsert(
      client,
      'customers',
      [
        ['id', 'uuid'],
        ['code', 'text'],
        ['name', 'text'],
        ['type', '"CustomerType"'],
        ['city', 'text'],
        ['email', 'text'],
        ['gstin', 'text'],
        ['created_at', 'timestamptz'],
        ['updated_at', 'timestamptz'],
      ],
      customers.map((c) => [
        ids.customers.get(c.code) ?? '',
        c.code,
        c.name,
        c.type,
        c.city,
        c.email,
        c.gstin,
        t0,
        t0,
      ]),
    );

    for (const [i, r] of REASON_CODES.entries()) {
      await client.query(
        `INSERT INTO reason_codes (id, code, label, direction, applies_to, sort_order)
         VALUES ($1, $2, $3, $4::"ReasonDirection", $5::"MovementType"[], $6)`,
        [ids.reasons.get(r.code), r.code, r.label, r.direction, [...r.appliesTo], i],
      );
    }
    lap('Master data');

    // ── Transactions ─────────────────────────────────────────────────────────
    await bulkInsert(
      client,
      'stock_levels',
      [
        ['id', 'uuid'],
        ['product_id', 'uuid'],
        ['warehouse_id', 'uuid'],
        ['on_hand', 'int4'],
        ['reserved', 'int4'],
        ['avg_cost', 'numeric'],
        ['reorder_point', 'int4'],
        ['safety_stock', 'int4'],
        ['max_stock', 'int4'],
        ['last_movement_at', 'timestamptz'],
        ['updated_at', 'timestamptz'],
      ],
      sim.stockLevels.map((s) => [
        s.id,
        s.productId,
        s.warehouseId,
        s.onHand,
        s.reserved,
        s.avgCost,
        s.reorderPoint,
        s.safetyStock,
        s.maxStock,
        s.lastMovementAt,
        s.lastMovementAt ?? t0,
      ]),
    );
    await bulkInsert(
      client,
      'batches',
      [
        ['id', 'uuid'],
        ['product_id', 'uuid'],
        ['warehouse_id', 'uuid'],
        ['batch_no', 'text'],
        ['manufactured_on', 'date'],
        ['expiry_date', 'date'],
        ['quantity', 'int4'],
        ['unit_cost', 'numeric'],
        ['received_at', 'timestamptz'],
      ],
      sim.batches.map((b) => [
        b.id,
        b.productId,
        b.warehouseId,
        b.batchNo,
        b.manufacturedOn,
        b.expiryDate,
        b.quantity,
        b.unitCost,
        b.receivedAt,
      ]),
    );

    await bulkInsert(
      client,
      'purchase_orders',
      [
        ['id', 'uuid'],
        ['number', 'text'],
        ['supplier_id', 'uuid'],
        ['warehouse_id', 'uuid'],
        ['status', '"PurchaseOrderStatus"'],
        ['order_date', 'timestamptz'],
        ['expected_date', 'date'],
        ['subtotal', 'numeric'],
        ['tax_total', 'numeric'],
        ['total', 'numeric'],
        ['notes', 'text'],
        ['created_by_type', '"ActorType"'],
        ['created_by_id', 'uuid'],
        ['submitted_at', 'timestamptz'],
        ['approved_by_id', 'uuid'],
        ['approved_at', 'timestamptz'],
        ['sent_at', 'timestamptz'],
        ['received_at', 'timestamptz'],
        ['closed_at', 'timestamptz'],
        ['created_at', 'timestamptz'],
        ['updated_at', 'timestamptz'],
      ],
      sim.purchaseOrders.map((po) => [
        po.id,
        po.number,
        po.supplierId,
        po.warehouseId,
        po.status,
        po.orderDate,
        po.expectedDate,
        rupees(po.subtotalPaise),
        rupees(po.taxPaise),
        rupees(po.subtotalPaise + po.taxPaise),
        po.notes,
        'USER',
        po.createdById,
        po.submittedAt,
        po.approvedById,
        po.approvedAt,
        po.sentAt,
        po.receivedAt,
        po.closedAt,
        po.orderDate,
        po.closedAt ?? po.receivedAt ?? po.sentAt ?? po.orderDate,
      ]),
    );
    await bulkInsert(
      client,
      'purchase_order_lines',
      [
        ['id', 'uuid'],
        ['purchase_order_id', 'uuid'],
        ['product_id', 'uuid'],
        ['quantity_ordered', 'int4'],
        ['quantity_received', 'int4'],
        ['quantity_rejected', 'int4'],
        ['unit_cost', 'numeric'],
        ['tax_rate', 'numeric'],
        ['line_total', 'numeric'],
      ],
      sim.purchaseOrders.flatMap((po) =>
        po.lines.map((l) => [
          l.id,
          l.purchaseOrderId,
          l.productId,
          l.quantityOrdered,
          l.quantityReceived,
          l.quantityRejected,
          rupees(l.unitCostPaise),
          l.taxRate.toFixed(2),
          rupees(l.lineTotalPaise),
        ]),
      ),
    );
    await bulkInsert(
      client,
      'goods_receipts',
      [
        ['id', 'uuid'],
        ['number', 'text'],
        ['purchase_order_id', 'uuid'],
        ['warehouse_id', 'uuid'],
        ['received_at', 'timestamptz'],
        ['actor_type', '"ActorType"'],
        ['received_by_id', 'uuid'],
        ['notes', 'text'],
      ],
      sim.receipts.map((g) => [
        g.id,
        g.number,
        g.purchaseOrderId,
        g.warehouseId,
        g.receivedAt,
        'USER',
        g.receivedById,
        g.notes,
      ]),
    );
    await bulkInsert(
      client,
      'goods_receipt_lines',
      [
        ['id', 'uuid'],
        ['goods_receipt_id', 'uuid'],
        ['purchase_order_line_id', 'uuid'],
        ['product_id', 'uuid'],
        ['quantity_received', 'int4'],
        ['quantity_rejected', 'int4'],
        ['reject_reason', 'text'],
        ['unit_cost', 'numeric'],
        ['batch_no', 'text'],
        ['expiry_date', 'date'],
      ],
      sim.receipts.flatMap((g) =>
        g.lines.map((l) => [
          l.id,
          l.goodsReceiptId,
          l.purchaseOrderLineId,
          l.productId,
          l.quantityReceived,
          l.quantityRejected,
          l.rejectReason,
          rupees(l.unitCostPaise),
          l.batchNo,
          l.expiryDate,
        ]),
      ),
    );
    lap(`Purchasing: ${sim.purchaseOrders.length} POs, ${sim.receipts.length} receipts`);

    await bulkInsert(
      client,
      'sales_orders',
      [
        ['id', 'uuid'],
        ['number', 'text'],
        ['customer_id', 'uuid'],
        ['warehouse_id', 'uuid'],
        ['channel', '"SalesChannel"'],
        ['status', '"SalesOrderStatus"'],
        ['order_date', 'timestamptz'],
        ['fulfilled_at', 'timestamptz'],
        ['subtotal', 'numeric'],
        ['discount_total', 'numeric'],
        ['tax_total', 'numeric'],
        ['total', 'numeric'],
        ['notes', 'text'],
        ['created_by_type', '"ActorType"'],
        ['created_by_id', 'uuid'],
        ['created_at', 'timestamptz'],
        ['updated_at', 'timestamptz'],
      ],
      sim.salesOrders.map((so) => {
        const gross = so.lines.reduce((a, l) => a + l.quantity * l.unitPricePaise, 0);
        const discount = so.lines.reduce((a, l) => a + l.discountPaise, 0);
        const tax = so.lines.reduce((a, l) => a + Math.round((l.lineTotalPaise * l.taxRate) / 100), 0);
        return [
          so.id,
          so.number,
          so.customerId,
          so.warehouseId,
          so.channel,
          so.status,
          so.orderDate,
          so.fulfilledAt,
          rupees(gross),
          rupees(discount),
          rupees(tax),
          rupees(gross - discount + tax),
          so.notes,
          'USER',
          so.createdById,
          so.orderDate,
          so.fulfilledAt ?? so.orderDate,
        ];
      }),
    );
    await bulkInsert(
      client,
      'sales_order_lines',
      [
        ['id', 'uuid'],
        ['sales_order_id', 'uuid'],
        ['product_id', 'uuid'],
        ['quantity', 'int4'],
        ['quantity_fulfilled', 'int4'],
        ['unit_price', 'numeric'],
        ['discount', 'numeric'],
        ['tax_rate', 'numeric'],
        ['line_total', 'numeric'],
      ],
      sim.salesOrders.flatMap((so) =>
        so.lines.map((l) => [
          l.id,
          l.salesOrderId,
          l.productId,
          l.quantity,
          l.quantityFulfilled,
          rupees(l.unitPricePaise),
          rupees(l.discountPaise),
          l.taxRate.toFixed(2),
          rupees(l.lineTotalPaise),
        ]),
      ),
    );
    lap(`Sales: ${sim.salesOrders.length} orders`);

    await bulkInsert(
      client,
      'transfers',
      [
        ['id', 'uuid'],
        ['number', 'text'],
        ['from_warehouse_id', 'uuid'],
        ['to_warehouse_id', 'uuid'],
        ['status', '"TransferStatus"'],
        ['reason', 'text'],
        ['created_by_type', '"ActorType"'],
        ['created_by_id', 'uuid'],
        ['shipped_at', 'timestamptz'],
        ['received_at', 'timestamptz'],
        ['created_at', 'timestamptz'],
        ['updated_at', 'timestamptz'],
      ],
      sim.transfers.map((t) => [
        t.id,
        t.number,
        t.fromWarehouseId,
        t.toWarehouseId,
        t.status,
        t.reason,
        'USER',
        t.createdById,
        t.shippedAt,
        t.receivedAt,
        t.createdAt,
        t.receivedAt ?? t.shippedAt,
      ]),
    );
    await bulkInsert(
      client,
      'transfer_lines',
      [
        ['id', 'uuid'],
        ['transfer_id', 'uuid'],
        ['product_id', 'uuid'],
        ['quantity', 'int4'],
      ],
      sim.transfers.flatMap((t) => t.lines.map((l) => [l.id, t.id, l.productId, l.quantity])),
    );
    await bulkInsert(
      client,
      'cycle_counts',
      [
        ['id', 'uuid'],
        ['number', 'text'],
        ['warehouse_id', 'uuid'],
        ['status', '"CycleCountStatus"'],
        ['reason', 'text'],
        ['created_by_type', '"ActorType"'],
        ['created_by_id', 'uuid'],
        ['approved_by_id', 'uuid'],
        ['submitted_at', 'timestamptz'],
        ['completed_at', 'timestamptz'],
        ['created_at', 'timestamptz'],
        ['updated_at', 'timestamptz'],
      ],
      sim.cycleCounts.map((c) => [
        c.id,
        c.number,
        c.warehouseId,
        c.status,
        c.reason,
        'USER',
        c.createdById,
        c.approvedById,
        c.submittedAt,
        c.completedAt,
        c.createdAt,
        c.completedAt ?? c.createdAt,
      ]),
    );
    await bulkInsert(
      client,
      'cycle_count_lines',
      [
        ['id', 'uuid'],
        ['cycle_count_id', 'uuid'],
        ['product_id', 'uuid'],
        ['expected_qty', 'int4'],
        ['counted_qty', 'int4'],
        ['variance', 'int4'],
        ['variance_value', 'numeric'],
        ['status', '"CountLineStatus"'],
        ['counted_by_id', 'uuid'],
        ['counted_at', 'timestamptz'],
      ],
      sim.cycleCounts.flatMap((c) =>
        c.lines.map((l) => [
          l.id,
          c.id,
          l.productId,
          l.expectedQty,
          l.countedQty,
          l.variance,
          l.varianceValuePaise === null ? null : rupees(l.varianceValuePaise),
          l.status,
          l.countedAt ? ids.users.staff : null,
          l.countedAt,
        ]),
      ),
    );

    await bulkInsert(
      client,
      'stock_movements',
      [
        ['id', 'uuid'],
        ['product_id', 'uuid'],
        ['warehouse_id', 'uuid'],
        ['batch_id', 'uuid'],
        ['type', '"MovementType"'],
        ['quantity', 'int4'],
        ['balance_after', 'int4'],
        ['unit_cost', 'numeric'],
        ['reason_code_id', 'uuid'],
        ['reference', 'text'],
        ['source_type', 'text'],
        ['source_id', 'uuid'],
        ['note', 'text'],
        ['actor_type', '"ActorType"'],
        ['actor_user_id', 'uuid'],
        ['occurred_at', 'timestamptz'],
        ['created_at', 'timestamptz'],
      ],
      sim.movements.map((m) => [
        m.id,
        m.productId,
        m.warehouseId,
        m.batchId,
        m.type,
        m.quantity,
        m.balanceAfter,
        m.unitCost,
        m.reasonCodeId,
        m.reference,
        m.sourceType,
        m.sourceId,
        m.note,
        m.actorType,
        m.actorUserId,
        m.occurredAt,
        m.occurredAt,
      ]),
    );
    lap(`Ledger: ${sim.movements.length.toLocaleString('en-IN')} stock movements`);

    await bulkInsert(
      client,
      'sales_daily',
      [
        ['product_id', 'uuid'],
        ['warehouse_id', 'uuid'],
        ['date', 'date'],
        ['quantity', 'int4'],
        ['revenue', 'numeric'],
        ['cogs', 'numeric'],
        ['orders', 'int4'],
      ],
      sim.salesDaily.map((d) => [
        d.productId,
        d.warehouseId,
        d.date,
        d.quantity,
        rupees(d.revenuePaise),
        rupees(d.cogsPaise),
        d.orders,
      ]),
    );
    await bulkInsert(
      client,
      'inventory_snapshots',
      [
        ['date', 'date'],
        ['warehouse_id', 'uuid'],
        ['total_units', 'int4'],
        ['total_value', 'numeric'],
        ['sku_count', 'int4'],
        ['low_stock_count', 'int4'],
        ['out_of_stock_count', 'int4'],
      ],
      sim.snapshots.map((s) => [
        s.date,
        s.warehouseId,
        s.totalUnits,
        rupees(s.totalValuePaise),
        s.skuCount,
        s.lowStockCount,
        s.outOfStockCount,
      ]),
    );

    await bulkInsert(
      client,
      'document_sequences',
      [
        ['key', 'text'],
        ['year', 'int4'],
        ['next', 'int4'],
      ],
      [...sim.sequences].map(([k, n]) => {
        const [key, year] = k.split('|');
        return [key ?? '', Number(year), n + 1];
      }),
    );

    await restoreIndexes();
    lap('Indexes and constraints rebuilt');

    await client.query(
      `INSERT INTO audit_logs (id, actor_type, action, entity_type, summary, after, created_at)
       VALUES ($1, 'SYSTEM', 'demo.seed', 'Organization', $2, $3, now())`,
      [
        uuidv7(Date.now(), new Rng(seed)),
        `Loaded the demo dataset (seed ${seed})`,
        JSON.stringify({ seed, today, products: products.length, movements: sim.movements.length }),
      ],
    );

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
    await pool.end();
  }

  // Refresh planner statistics after a bulk load so the first dashboard queries use good plans.
  await prisma.$executeRawUnsafe('ANALYZE');
  lap('Done');
  return data;
}
