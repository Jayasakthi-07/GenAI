import {
  type AdjustInput,
  type Batch,
  type BatchesQuery,
  type FefoResult,
  type IssueInput,
  type Movement,
  type MovementsQuery,
  type MovementType,
  type ReceiveInput,
  type StockPosition,
  type StockPositionsQuery,
  type StockSummary,
  type WriteOffInput,
  STOCK_STATES,
} from '@stockroom/shared';
import { Prisma } from '#generated/prisma/client.ts';
import type { Db, Tx } from '../db/client';
import { inTransaction } from '../db/tx';
import { type Actor, actorColumns, assertCan } from '../domain/actor';
import { writeAudit } from '../domain/audit';
import { AppError, notFound } from '../domain/errors';
import type { Emit, EventBus } from '../domain/events';
import {
  actorView,
  cost4,
  dec,
  Decimal,
  decodeCursor,
  encodeCursor,
  getOrgSettings,
  iso,
  isoDay,
  localDay,
  money,
  pageArgs,
  pageMeta,
  startOfLocalDay,
  userNames,
  uuidv7,
} from './support';

/** Everything that can change stock goes through recordMovement(). */
export interface MovementRequest {
  productId: string;
  warehouseId: string;
  type: MovementType;
  /** Signed, non-zero: positive adds stock, negative removes it. */
  quantity: number;
  /** Cost of incoming units (receipts, transfers in). Defaults to the current average cost. */
  unitCost?: Decimal | string | null;
  /** Take from / add to this batch. */
  batchId?: string | null;
  /** Incoming stock of an expiry-tracked product without an existing batch. */
  newBatch?: { batchNo: string; expiryDate: string | null; manufacturedOn?: string | null } | null;
  /** Reservation released by this movement (sales order fulfilment). */
  consumeReserved?: number;
  /** Allow taking stock from expired batches (write-offs, corrections). */
  allowExpired?: boolean;
  reasonCodeId?: string | null;
  reference?: string | null;
  sourceType?: string | null;
  sourceId?: string | null;
  note?: string | null;
  /** SALE only: net revenue for the daily sales rollup. */
  saleRevenue?: Decimal | null;
  occurredAt?: Date;
}

export interface RecordedMovement {
  id: string;
  batchId: string | null;
  batchNo: string | null;
  expiryDate: Date | null;
  quantity: number;
  balanceAfter: number;
  unitCost: Decimal;
}

interface LevelRow {
  id: string;
  on_hand: number;
  reserved: number;
  avg_cost: Prisma.Decimal;
}

interface BatchRow {
  id: string;
  batch_no: string;
  expiry_date: Date | null;
  quantity: number;
  unit_cost: Prisma.Decimal;
}

const INBOUND_COST_TYPES: MovementType[] = ['RECEIPT', 'TRANSFER_IN', 'OPENING_BALANCE'];

export class InventoryService {
  constructor(
    private readonly prisma: Db,
    private readonly bus: EventBus,
  ) {}

  /**
   * The single code path that changes stock. In the caller's transaction it locks the balance row,
   * refuses to go negative, allocates batches first-expiry-first-out, writes one ledger row per batch
   * with the running balance, keeps the moving-average cost and the daily sales rollup up to date,
   * and queues a stock.changed event for after commit.
   */
  async recordMovement(tx: Tx, actor: Actor, req: MovementRequest, emit: Emit): Promise<RecordedMovement[]> {
    if (!Number.isInteger(req.quantity) || req.quantity === 0) {
      throw new AppError('VALIDATION_ERROR', 'Quantity must be a whole number other than zero.');
    }
    const product = await tx.product.findUnique({
      where: { id: req.productId },
      select: { id: true, name: true, trackExpiry: true, costPrice: true, unit: { select: { code: true } } },
    });
    if (!product) throw notFound('Product');
    const warehouse = await tx.warehouse.findUnique({
      where: { id: req.warehouseId },
      select: { id: true, code: true, isActive: true },
    });
    if (!warehouse) throw notFound('Warehouse');

    await tx.$executeRaw`
      INSERT INTO stock_levels (id, product_id, warehouse_id, updated_at)
      VALUES (${uuidv7()}::uuid, ${req.productId}::uuid, ${req.warehouseId}::uuid, now())
      ON CONFLICT (product_id, warehouse_id) DO NOTHING`;
    const [level] = await tx.$queryRaw<LevelRow[]>`
      SELECT id, on_hand, reserved, avg_cost FROM stock_levels
      WHERE product_id = ${req.productId}::uuid AND warehouse_id = ${req.warehouseId}::uuid
      FOR UPDATE`;
    if (!level) throw new AppError('INTERNAL', 'Stock level row could not be locked.');

    const at = req.occurredAt ?? new Date();
    const cols = actorColumns(actor);
    let onHand = level.on_hand;
    let reserved = level.reserved;
    let avgCost = dec(level.avg_cost);
    const recorded: RecordedMovement[] = [];

    const write = async (
      quantity: number,
      unitCost: Decimal,
      batch: { id: string; batchNo: string; expiry: Date | null } | null,
    ) => {
      onHand += quantity;
      const row = await tx.stockMovement.create({
        data: {
          productId: req.productId,
          warehouseId: req.warehouseId,
          batchId: batch?.id ?? null,
          type: req.type,
          quantity,
          balanceAfter: onHand,
          unitCost: unitCost.toFixed(4),
          reasonCodeId: req.reasonCodeId ?? null,
          reference: req.reference ?? null,
          sourceType: req.sourceType ?? null,
          sourceId: req.sourceId ?? null,
          note: req.note ?? null,
          actorType: cols.actorType,
          actorUserId: cols.actorUserId,
          agentRunId: cols.agentRunId,
          // Split rows for one movement are a millisecond apart so the ledger order is unambiguous.
          occurredAt: new Date(at.getTime() + recorded.length),
        },
        select: { id: true },
      });
      recorded.push({
        id: row.id,
        batchId: batch?.id ?? null,
        batchNo: batch?.batchNo ?? null,
        expiryDate: batch?.expiry ?? null,
        quantity,
        balanceAfter: onHand,
        unitCost,
      });
    };

    if (req.quantity > 0) {
      const q = req.quantity;
      const unitCost =
        req.unitCost !== undefined && req.unitCost !== null
          ? dec(req.unitCost)
          : avgCost.gt(0)
            ? avgCost
            : dec(product.costPrice);
      if (unitCost.lt(0)) throw new AppError('VALIDATION_ERROR', 'Unit cost cannot be negative.');
      if (INBOUND_COST_TYPES.includes(req.type)) {
        const total = onHand + q;
        avgCost = onHand > 0 ? avgCost.mul(onHand).plus(unitCost.mul(q)).div(total) : unitCost;
      }
      let batch: { id: string; batchNo: string; expiry: Date | null } | null = null;
      if (product.trackExpiry) batch = await this.addToBatch(tx, req, q, unitCost, at, product.name);
      await write(q, unitCost, batch);
    } else {
      const need = -req.quantity;
      const releasing = Math.min(req.consumeReserved ?? 0, reserved, need);
      const available = onHand - reserved + releasing;
      if (need > available) {
        const held = reserved - releasing;
        throw new AppError(
          'INSUFFICIENT_STOCK',
          `Only ${Math.max(0, available)} ${product.unit.code} of ${product.name} available at ${warehouse.code}` +
            (held > 0 ? ` (${held} more reserved for orders).` : '.'),
          {
            productId: req.productId,
            warehouseId: req.warehouseId,
            available: Math.max(0, available),
            requested: need,
          },
        );
      }
      reserved -= releasing;
      if (!product.trackExpiry) {
        await write(-need, avgCost, null);
      } else {
        const today = localDay(at, (await getOrgSettings(tx)).timezone);
        const batches = await this.lockBatches(tx, req.productId, req.warehouseId, req.batchId ?? null);
        const usable = batches.filter(
          (b) => b.quantity > 0 && (req.allowExpired || !b.expiry_date || isoDay(b.expiry_date)! >= today),
        );
        const usableQty = usable.reduce((a, b) => a + b.quantity, 0);
        if (usableQty < need) {
          const expired = batches
            .filter((b) => b.expiry_date && isoDay(b.expiry_date)! < today)
            .reduce((a, b) => a + b.quantity, 0);
          throw new AppError(
            'INSUFFICIENT_STOCK',
            req.batchId
              ? `Batch has only ${usableQty} ${product.unit.code} of ${product.name}.`
              : `Only ${usableQty} ${product.unit.code} of ${product.name} can be taken at ${warehouse.code}` +
                  (expired > 0 && !req.allowExpired
                    ? ` — ${expired} more are expired and must be written off.`
                    : '.'),
            { productId: req.productId, warehouseId: req.warehouseId, available: usableQty, requested: need },
          );
        }
        let remaining = need;
        for (const b of usable) {
          if (remaining <= 0) break;
          const take = Math.min(b.quantity, remaining);
          remaining -= take;
          await tx.$executeRaw`UPDATE batches SET quantity = quantity - ${take} WHERE id = ${b.id}::uuid`;
          await write(-take, avgCost, { id: b.id, batchNo: b.batch_no, expiry: b.expiry_date });
        }
      }
    }

    await tx.$executeRaw`
      UPDATE stock_levels
      SET on_hand = ${onHand}, reserved = ${reserved}, avg_cost = ${avgCost.toFixed(4)}::numeric,
          last_movement_at = ${at}, updated_at = now()
      WHERE id = ${level.id}::uuid`;

    if (req.type === 'SALE') {
      const sold = -req.quantity;
      const tz = (await getOrgSettings(tx)).timezone;
      const day = localDay(at, tz);
      const cogs = avgCost.mul(sold).toFixed(2);
      const revenue = dec(req.saleRevenue ?? 0).toFixed(2);
      await tx.$executeRaw`
        INSERT INTO sales_daily (product_id, warehouse_id, date, quantity, revenue, cogs, orders)
        VALUES (${req.productId}::uuid, ${req.warehouseId}::uuid, ${day}::date, ${sold}, ${revenue}::numeric, ${cogs}::numeric, 1)
        ON CONFLICT (product_id, warehouse_id, date) DO UPDATE SET
          quantity = sales_daily.quantity + EXCLUDED.quantity,
          revenue = sales_daily.revenue + EXCLUDED.revenue,
          cogs = sales_daily.cogs + EXCLUDED.cogs,
          orders = sales_daily.orders + 1`;
    }

    emit('stock.changed', {
      productId: req.productId,
      warehouseId: req.warehouseId,
      onHand,
      available: onHand - reserved,
      movementType: req.type,
      quantity: req.quantity,
    });
    return recorded;
  }

  /** Reserve (positive) or release (negative) stock for sales orders without moving it. */
  async changeReservation(tx: Tx, productId: string, warehouseId: string, delta: number): Promise<void> {
    if (delta === 0) return;
    const [level] = await tx.$queryRaw<LevelRow[]>`
      SELECT id, on_hand, reserved, avg_cost FROM stock_levels
      WHERE product_id = ${productId}::uuid AND warehouse_id = ${warehouseId}::uuid FOR UPDATE`;
    const onHand = level?.on_hand ?? 0;
    const reserved = level?.reserved ?? 0;
    if (delta > 0 && onHand - reserved < delta) {
      const product = await tx.product.findUnique({ where: { id: productId }, select: { name: true } });
      throw new AppError(
        'INSUFFICIENT_STOCK',
        `Only ${Math.max(0, onHand - reserved)} of ${product?.name ?? 'this product'} can be reserved.`,
        { productId, warehouseId, available: Math.max(0, onHand - reserved), requested: delta },
      );
    }
    if (!level) return;
    await tx.$executeRaw`
      UPDATE stock_levels SET reserved = GREATEST(0, reserved + ${delta}), updated_at = now() WHERE id = ${level.id}::uuid`;
  }

  private async lockBatches(
    tx: Tx,
    productId: string,
    warehouseId: string,
    batchId: string | null,
  ): Promise<BatchRow[]> {
    if (batchId) {
      const rows = await tx.$queryRaw<BatchRow[]>`
        SELECT id, batch_no, expiry_date, quantity, unit_cost FROM batches
        WHERE id = ${batchId}::uuid AND product_id = ${productId}::uuid AND warehouse_id = ${warehouseId}::uuid
        FOR UPDATE`;
      if (!rows.length)
        throw new AppError('VALIDATION_ERROR', 'That batch doesn’t belong to this product and warehouse.');
      return rows;
    }
    return tx.$queryRaw<BatchRow[]>`
      SELECT id, batch_no, expiry_date, quantity, unit_cost FROM batches
      WHERE product_id = ${productId}::uuid AND warehouse_id = ${warehouseId}::uuid AND quantity > 0
      ORDER BY expiry_date ASC NULLS LAST, received_at ASC, id ASC
      FOR UPDATE`;
  }

  private async addToBatch(
    tx: Tx,
    req: MovementRequest,
    q: number,
    unitCost: Decimal,
    at: Date,
    productName: string,
  ): Promise<{ id: string; batchNo: string; expiry: Date | null }> {
    if (req.batchId) {
      const [b] = await this.lockBatches(tx, req.productId, req.warehouseId, req.batchId);
      if (!b) throw notFound('Batch');
      await tx.$executeRaw`UPDATE batches SET quantity = quantity + ${q} WHERE id = ${b.id}::uuid`;
      return { id: b.id, batchNo: b.batch_no, expiry: b.expiry_date };
    }
    if (!req.newBatch?.batchNo || !req.newBatch.expiryDate) {
      throw new AppError(
        'VALIDATION_ERROR',
        `${productName} is expiry-tracked: enter a batch number and expiry date.`,
        {
          fields: {
            batchNo: 'Required for expiry-tracked products',
            expiryDate: 'Required for expiry-tracked products',
          },
        },
      );
    }
    const batchNo = req.newBatch.batchNo.trim();
    const expiryDate = new Date(`${req.newBatch.expiryDate}T00:00:00Z`);
    const existing = await tx.batch.findUnique({
      where: {
        productId_warehouseId_batchNo: { productId: req.productId, warehouseId: req.warehouseId, batchNo },
      },
    });
    if (existing) {
      if (existing.expiryDate && isoDay(existing.expiryDate) !== req.newBatch.expiryDate) {
        throw new AppError(
          'VALIDATION_ERROR',
          `Batch ${batchNo} already exists with expiry ${isoDay(existing.expiryDate)}. Use a different batch number.`,
        );
      }
      await tx.$executeRaw`UPDATE batches SET quantity = quantity + ${q} WHERE id = ${existing.id}::uuid`;
      return { id: existing.id, batchNo, expiry: existing.expiryDate };
    }
    const created = await tx.batch.create({
      data: {
        productId: req.productId,
        warehouseId: req.warehouseId,
        batchNo,
        expiryDate,
        manufacturedOn: req.newBatch.manufacturedOn
          ? new Date(`${req.newBatch.manufacturedOn}T00:00:00Z`)
          : null,
        quantity: q,
        unitCost: unitCost.toFixed(4),
        receivedAt: at,
      },
      select: { id: true },
    });
    return { id: created.id, batchNo, expiry: expiryDate };
  }

  /* ── Operations (each one transaction, audited) ──────────────────────── */

  private async reason(tx: Tx, id: string, type: MovementType, direction: 'IN' | 'OUT') {
    const reason = await tx.reasonCode.findUnique({ where: { id } });
    if (!reason || !reason.isActive)
      throw new AppError('VALIDATION_ERROR', 'Choose an active reason.', {
        fields: { reasonCodeId: 'Choose a reason' },
      });
    if (!reason.appliesTo.includes(type) || (reason.direction !== 'BOTH' && reason.direction !== direction)) {
      throw new AppError('VALIDATION_ERROR', `“${reason.label}” can’t be used for this kind of change.`, {
        fields: { reasonCodeId: 'Not valid for this change' },
      });
    }
    return reason;
  }

  private async activeWarehouse(tx: Tx, id: string) {
    const wh = await tx.warehouse.findUnique({ where: { id } });
    if (!wh) throw notFound('Warehouse');
    if (!wh.isActive) throw new AppError('VALIDATION_ERROR', `${wh.name} is inactive.`);
    return wh;
  }

  async receive(actor: Actor, input: ReceiveInput & { warehouseId: string }): Promise<string[]> {
    assertCan(actor, 'stock.operate');
    return inTransaction(this.prisma, this.bus, async (tx, emit) => {
      const wh = await this.activeWarehouse(tx, input.warehouseId);
      const ids: string[] = [];
      for (const line of input.lines) {
        const rows = await this.recordMovement(
          tx,
          actor,
          {
            productId: line.productId,
            warehouseId: wh.id,
            type: 'RECEIPT',
            quantity: Number(line.quantity),
            unitCost: line.unitCost,
            newBatch:
              line.batchNo || line.expiryDate
                ? {
                    batchNo: line.batchNo ?? '',
                    expiryDate: line.expiryDate ?? null,
                    manufacturedOn: line.manufacturedOn,
                  }
                : null,
            reference: input.reference ?? null,
            sourceType: 'Manual',
            note: input.note ?? null,
          },
          emit,
        );
        ids.push(...rows.map((r) => r.id));
      }
      await writeAudit(tx, actor, {
        action: 'stock.receive',
        entityType: 'Warehouse',
        entityId: wh.id,
        summary: `Received ${input.lines.length} line(s) at ${wh.code}${input.reference ? ` (${input.reference})` : ''}`,
        after: { lines: input.lines, reference: input.reference },
      });
      return ids;
    });
  }

  async issue(actor: Actor, input: IssueInput): Promise<string[]> {
    assertCan(actor, 'stock.operate');
    return inTransaction(this.prisma, this.bus, async (tx, emit) => {
      const wh = await this.activeWarehouse(tx, input.warehouseId);
      const reason = await this.reason(tx, input.reasonCodeId, 'ISSUE', 'OUT');
      const ids: string[] = [];
      for (const line of input.lines) {
        const rows = await this.recordMovement(
          tx,
          actor,
          {
            productId: line.productId,
            warehouseId: wh.id,
            type: 'ISSUE',
            quantity: -Number(line.quantity),
            batchId: line.batchId ?? null,
            reasonCodeId: reason.id,
            sourceType: 'Manual',
            note: input.note ?? null,
          },
          emit,
        );
        ids.push(...rows.map((r) => r.id));
      }
      await writeAudit(tx, actor, {
        action: 'stock.issue',
        entityType: 'Warehouse',
        entityId: wh.id,
        summary: `Issued ${input.lines.length} line(s) from ${wh.code} — ${reason.label}`,
        after: { lines: input.lines, reason: reason.code, note: input.note },
      });
      return ids;
    });
  }

  async adjust(actor: Actor, input: AdjustInput): Promise<string[]> {
    assertCan(actor, 'stock.operate');
    const quantity = Number(input.quantity);
    const settings = await getOrgSettings(this.prisma);
    if (Math.abs(quantity) > settings.largeAdjustmentUnits) {
      assertCan(
        actor,
        'stock.adjust.large',
        `Adjustments over ${settings.largeAdjustmentUnits} units need a manager.`,
      );
    }
    return inTransaction(this.prisma, this.bus, async (tx, emit) => {
      const wh = await this.activeWarehouse(tx, input.warehouseId);
      const reason = await this.reason(tx, input.reasonCodeId, 'ADJUSTMENT', quantity > 0 ? 'IN' : 'OUT');
      const rows = await this.recordMovement(
        tx,
        actor,
        {
          productId: input.productId,
          warehouseId: wh.id,
          type: 'ADJUSTMENT',
          quantity,
          batchId: input.batchId ?? null,
          newBatch:
            quantity > 0 && input.batchNo
              ? { batchNo: input.batchNo, expiryDate: input.expiryDate ?? null }
              : null,
          reasonCodeId: reason.id,
          allowExpired: quantity < 0,
          sourceType: 'Manual',
          note: input.note ?? null,
        },
        emit,
      );
      const product = await tx.product.findUnique({
        where: { id: input.productId },
        select: { name: true, sku: true },
      });
      await writeAudit(tx, actor, {
        action: 'stock.adjust',
        entityType: 'Product',
        entityId: input.productId,
        summary: `Adjusted ${product?.name ?? 'product'} by ${quantity > 0 ? '+' : ''}${quantity} at ${wh.code} — ${reason.label}`,
        after: {
          quantity,
          reason: reason.code,
          warehouse: wh.code,
          note: input.note,
          balanceAfter: rows.at(-1)?.balanceAfter,
        },
      });
      emit('stock.adjusted', {
        productId: input.productId,
        warehouseId: wh.id,
        quantity,
        reasonCode: reason.code,
      });
      return rows.map((r) => r.id);
    });
  }

  async writeOff(actor: Actor, input: WriteOffInput): Promise<string[]> {
    assertCan(actor, 'stock.write_off');
    return inTransaction(this.prisma, this.bus, async (tx, emit) => {
      const wh = await this.activeWarehouse(tx, input.warehouseId);
      const reason = await this.reason(tx, input.reasonCodeId, 'WRITE_OFF', 'OUT');
      const quantity = Number(input.quantity);
      const rows = await this.recordMovement(
        tx,
        actor,
        {
          productId: input.productId,
          warehouseId: wh.id,
          type: 'WRITE_OFF',
          quantity: -quantity,
          batchId: input.batchId ?? null,
          reasonCodeId: reason.id,
          allowExpired: true,
          sourceType: 'Manual',
          note: input.note ?? null,
        },
        emit,
      );
      const product = await tx.product.findUnique({ where: { id: input.productId }, select: { name: true } });
      const value = rows.reduce((a, r) => a.plus(r.unitCost.mul(-r.quantity)), new Decimal(0));
      await writeAudit(tx, actor, {
        action: 'stock.write_off',
        entityType: 'Product',
        entityId: input.productId,
        summary: `Wrote off ${quantity} of ${product?.name ?? 'product'} at ${wh.code} (${money(value)}) — ${reason.label}`,
        after: {
          quantity,
          reason: reason.code,
          warehouse: wh.code,
          value: money(value),
          batches: rows.map((r) => r.batchNo),
        },
      });
      emit('stock.adjusted', {
        productId: input.productId,
        warehouseId: wh.id,
        quantity: -quantity,
        reasonCode: reason.code,
      });
      return rows.map((r) => r.id);
    });
  }

  /* ── Queries ─────────────────────────────────────────────────────────── */

  async positions(
    q: StockPositionsQuery,
  ): Promise<{ data: StockPosition[]; meta: { page: number; pageSize: number; total: number } }> {
    const where: Prisma.Sql[] = [Prisma.sql`p.status <> 'DISCONTINUED'`];
    if (q.warehouseId) where.push(Prisma.sql`v.warehouse_id = ${q.warehouseId}::uuid`);
    if (q.productId) where.push(Prisma.sql`v.product_id = ${q.productId}::uuid`);
    if (q.state?.length) where.push(Prisma.sql`v.state IN (${Prisma.join(q.state)})`);
    if (q.categoryId)
      where.push(
        Prisma.sql`p.category_id IN (SELECT id FROM categories WHERE id = ${q.categoryId}::uuid OR parent_id = ${q.categoryId}::uuid)`,
      );
    if (q.q) {
      const like = `%${q.q}%`;
      where.push(Prisma.sql`(p.name ILIKE ${like} OR p.sku ILIKE ${like} OR p.barcode = ${q.q})`);
    }
    const [field, dir] = (q.sort ?? '').split(':');
    const d = dir === 'desc' ? Prisma.sql`DESC` : Prisma.sql`ASC`;
    const orderBy =
      {
        product: Prisma.sql`p.name ${d}`,
        warehouse: Prisma.sql`w.code ${d}, p.name ASC`,
        onHand: Prisma.sql`v.on_hand ${d}`,
        available: Prisma.sql`v.available ${d}`,
        value: Prisma.sql`v.value ${d}`,
        daysOfCover: Prisma.sql`v.days_of_cover ${d} NULLS LAST`,
        lastMovementAt: Prisma.sql`v.last_movement_at ${d} NULLS LAST`,
      }[field ?? ''] ??
      // Default: problems first (out, low, reordered), then by name.
      Prisma.sql`CASE v.state WHEN 'OUT' THEN 0 WHEN 'LOW' THEN 1 WHEN 'ON_ORDER' THEN 2 WHEN 'OVER' THEN 3 ELSE 4 END, p.name ASC`;
    const { skip, take } = pageArgs(q);
    const rows = await this.prisma.$queryRaw<
      Array<{
        id: string;
        product_id: string;
        sku: string;
        name: string;
        unit: string;
        track_expiry: boolean;
        category: string;
        warehouse_id: string;
        wh_code: string;
        wh_name: string;
        on_hand: number;
        reserved: number;
        available: number;
        on_order: number;
        reorder_point: number | null;
        safety_stock: number | null;
        max_stock: number | null;
        avg_cost: Prisma.Decimal;
        value: Prisma.Decimal;
        state: StockPosition['state'];
        avg_daily_demand: number;
        days_of_cover: number | null;
        last_movement_at: Date | null;
        total: bigint;
      }>
    >`
      SELECT v.id, v.product_id, p.sku, p.name, u.code AS unit, p.track_expiry, c.name AS category,
             v.warehouse_id, w.code AS wh_code, w.name AS wh_name,
             v.on_hand, v.reserved, v.available, v.on_order, v.reorder_point, v.safety_stock, v.max_stock,
             v.avg_cost, v.value, v.state, v.avg_daily_demand, v.days_of_cover, v.last_movement_at,
             COUNT(*) OVER() AS total
      FROM v_stock_positions v
      JOIN products p ON p.id = v.product_id
      JOIN units u ON u.id = p.unit_id
      JOIN categories c ON c.id = p.category_id
      JOIN warehouses w ON w.id = v.warehouse_id
      WHERE ${Prisma.join(where, ' AND ')}
      ORDER BY ${orderBy}
      LIMIT ${take} OFFSET ${skip}`;
    return {
      data: rows.map((r) => ({
        id: r.id,
        product: {
          id: r.product_id,
          sku: r.sku,
          name: r.name,
          unit: r.unit,
          trackExpiry: r.track_expiry,
          category: r.category,
        },
        warehouse: { id: r.warehouse_id, code: r.wh_code, name: r.wh_name },
        onHand: r.on_hand,
        reserved: r.reserved,
        available: r.available,
        onOrder: r.on_order,
        reorderPoint: r.reorder_point,
        safetyStock: r.safety_stock,
        maxStock: r.max_stock,
        avgCost: cost4(r.avg_cost),
        value: money(r.value),
        state: r.state,
        avgDailyDemand: Math.round(r.avg_daily_demand * 100) / 100,
        daysOfCover: r.days_of_cover === null ? null : Math.round(r.days_of_cover * 10) / 10,
        lastMovementAt: iso(r.last_movement_at),
      })),
      meta: pageMeta(q, Number(rows[0]?.total ?? 0)),
    };
  }

  async summary(warehouseId?: string): Promise<StockSummary> {
    const filter = warehouseId ? Prisma.sql`AND v.warehouse_id = ${warehouseId}::uuid` : Prisma.empty;
    const rows = await this.prisma.$queryRaw<
      Array<{ state: StockPosition['state']; n: number; value: string; units: number }>
    >`
      SELECT v.state, COUNT(*)::int AS n, COALESCE(SUM(v.value), 0)::text AS value, COALESCE(SUM(v.on_hand), 0)::int AS units
      FROM v_stock_positions v JOIN products p ON p.id = v.product_id
      WHERE p.status <> 'DISCONTINUED' ${filter}
      GROUP BY v.state`;
    const byState = Object.fromEntries(STOCK_STATES.map((s) => [s, 0])) as StockSummary['byState'];
    let value = new Decimal(0);
    let units = 0;
    for (const r of rows) {
      byState[r.state] = r.n;
      value = value.plus(r.value);
      units += r.units;
    }
    return { byState, totalValue: money(value), totalUnits: units };
  }

  async movements(q: MovementsQuery): Promise<{ data: Movement[]; nextCursor: string | null }> {
    const cursor = decodeCursor(q.cursor);
    const tz = (await getOrgSettings(this.prisma)).timezone;
    const where: Prisma.StockMovementWhereInput = {
      productId: q.productId,
      warehouseId: q.warehouseId,
      type: q.type?.length ? { in: q.type } : undefined,
      occurredAt: {
        gte: q.from ? startOfLocalDay(q.from, tz) : undefined,
        lt: q.to ? new Date(startOfLocalDay(q.to, tz).getTime() + 86_400_000) : undefined,
      },
      ...(q.q
        ? {
            OR: [
              { reference: { contains: q.q, mode: 'insensitive' } },
              { note: { contains: q.q, mode: 'insensitive' } },
              { product: { name: { contains: q.q, mode: 'insensitive' } } },
              { product: { sku: { contains: q.q, mode: 'insensitive' } } },
            ],
          }
        : {}),
      ...(cursor
        ? {
            AND: [
              { OR: [{ occurredAt: { lt: cursor.at } }, { occurredAt: cursor.at, id: { lt: cursor.id } }] },
            ],
          }
        : {}),
    };
    const rows = await this.prisma.stockMovement.findMany({
      where,
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      take: q.limit + 1,
      include: {
        product: {
          select: { id: true, sku: true, name: true, trackExpiry: true, unit: { select: { code: true } } },
        },
        warehouse: { select: { id: true, code: true, name: true } },
        batch: { select: { id: true, batchNo: true } },
        reasonCode: { select: { code: true, label: true } },
      },
    });
    const page = rows.slice(0, q.limit);
    const names = await userNames(
      this.prisma,
      page.map((r) => r.actorUserId),
    );
    const agentKeys = await this.agentKeysForRuns(page.map((r) => r.agentRunId));
    const last = page.at(-1);
    return {
      data: page.map((r) => ({
        id: r.id,
        occurredAt: r.occurredAt.toISOString(),
        type: r.type,
        quantity: r.quantity,
        balanceAfter: r.balanceAfter,
        unitCost: cost4(r.unitCost),
        product: {
          id: r.product.id,
          sku: r.product.sku,
          name: r.product.name,
          unit: r.product.unit.code,
          trackExpiry: r.product.trackExpiry,
        },
        warehouse: r.warehouse,
        batch: r.batch,
        reason: r.reasonCode,
        reference: r.reference,
        sourceType: r.sourceType,
        sourceId: r.sourceId,
        note: r.note,
        actor: actorView(
          r.actorType,
          r.actorUserId,
          names,
          r.agentRunId ? agentKeys.get(r.agentRunId) : null,
        ),
      })),
      nextCursor: rows.length > q.limit && last ? encodeCursor(last.occurredAt, last.id) : null,
    };
  }

  private async agentKeysForRuns(runIds: Array<string | null>): Promise<Map<string, string>> {
    const ids = [...new Set(runIds.filter((id): id is string => !!id))];
    if (!ids.length) return new Map();
    const runs = await this.prisma.agentRun.findMany({
      where: { id: { in: ids } },
      select: { id: true, agent: { select: { key: true } } },
    });
    return new Map(runs.map((r) => [r.id, r.agent.key]));
  }

  async batches(
    q: BatchesQuery,
  ): Promise<{ data: Batch[]; meta: { page: number; pageSize: number; total: number } }> {
    const tz = (await getOrgSettings(this.prisma)).timezone;
    const today = localDay(new Date(), tz);
    const todayDate = new Date(`${today}T00:00:00Z`);
    const warnDays = (await getOrgSettings(this.prisma)).expiryWarningDays;
    const statusFilters: Prisma.BatchWhereInput[] = [];
    for (const s of q.status ?? []) {
      if (s === 'EXPIRED') statusFilters.push({ expiryDate: { lt: todayDate } });
      if (s === 'EXPIRING')
        statusFilters.push({
          expiryDate: { gte: todayDate, lte: new Date(todayDate.getTime() + warnDays * 86_400_000) },
        });
      if (s === 'OK')
        statusFilters.push({
          OR: [
            { expiryDate: null },
            { expiryDate: { gt: new Date(todayDate.getTime() + warnDays * 86_400_000) } },
          ],
        });
    }
    const where: Prisma.BatchWhereInput = {
      productId: q.productId,
      warehouseId: q.warehouseId,
      quantity: q.includeEmpty ? undefined : { gt: 0 },
      expiryDate:
        q.expiringWithinDays !== undefined
          ? { lte: new Date(todayDate.getTime() + q.expiringWithinDays * 86_400_000) }
          : undefined,
      ...(statusFilters.length ? { OR: statusFilters } : {}),
      ...(q.q
        ? {
            AND: [
              {
                OR: [
                  { batchNo: { contains: q.q, mode: 'insensitive' } },
                  { product: { name: { contains: q.q, mode: 'insensitive' } } },
                  { product: { sku: { contains: q.q, mode: 'insensitive' } } },
                ],
              },
            ],
          }
        : {}),
    };
    const [dir] = [q.sort?.endsWith(':desc') ? 'desc' : 'asc'] as const;
    const orderBy: Prisma.BatchOrderByWithRelationInput[] = q.sort?.startsWith('quantity')
      ? [{ quantity: dir }]
      : q.sort?.startsWith('receivedAt')
        ? [{ receivedAt: dir }]
        : [{ expiryDate: { sort: dir, nulls: 'last' } }, { receivedAt: 'asc' }];
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.batch.count({ where }),
      this.prisma.batch.findMany({
        where,
        orderBy,
        ...pageArgs(q),
        include: {
          product: {
            select: { id: true, sku: true, name: true, trackExpiry: true, unit: { select: { code: true } } },
          },
          warehouse: { select: { id: true, code: true, name: true } },
        },
      }),
    ]);
    return {
      data: rows.map((b) => {
        const days = b.expiryDate
          ? Math.round((b.expiryDate.getTime() - todayDate.getTime()) / 86_400_000)
          : null;
        return {
          id: b.id,
          product: {
            id: b.product.id,
            sku: b.product.sku,
            name: b.product.name,
            unit: b.product.unit.code,
            trackExpiry: b.product.trackExpiry,
          },
          warehouse: b.warehouse,
          batchNo: b.batchNo,
          manufacturedOn: isoDay(b.manufacturedOn),
          expiryDate: isoDay(b.expiryDate),
          quantity: b.quantity,
          unitCost: cost4(b.unitCost),
          value: money(dec(b.unitCost).mul(b.quantity)),
          receivedAt: b.receivedAt.toISOString(),
          daysToExpiry: days,
          status: days === null ? 'OK' : days < 0 ? 'EXPIRED' : days <= warnDays ? 'EXPIRING' : 'OK',
        };
      }),
      meta: pageMeta(q, total),
    };
  }

  /** First-expiry-first-out suggestion for taking `quantity` of a product from a warehouse. */
  async fefo(productId: string, warehouseId: string, quantity: number): Promise<FefoResult> {
    const today = localDay(new Date(), (await getOrgSettings(this.prisma)).timezone);
    const batches = await this.prisma.batch.findMany({
      where: {
        productId,
        warehouseId,
        quantity: { gt: 0 },
        OR: [{ expiryDate: null }, { expiryDate: { gte: new Date(`${today}T00:00:00Z`) } }],
      },
      orderBy: [{ expiryDate: { sort: 'asc', nulls: 'last' } }, { receivedAt: 'asc' }],
    });
    let remaining = quantity;
    const allocations: FefoResult['allocations'] = [];
    for (const b of batches) {
      if (remaining <= 0) break;
      const take = Math.min(b.quantity, remaining);
      remaining -= take;
      allocations.push({
        batchId: b.id,
        batchNo: b.batchNo,
        expiryDate: isoDay(b.expiryDate),
        available: b.quantity,
        take,
      });
    }
    return { allocations, shortfall: remaining };
  }

  /** Ledger rows written by an operation, shaped for the API. */
  async movementsByIds(ids: string[]): Promise<Movement[]> {
    if (!ids.length) return [];
    const rows = await this.prisma.stockMovement.findMany({
      where: { id: { in: ids } },
      orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
      include: {
        product: {
          select: { id: true, sku: true, name: true, trackExpiry: true, unit: { select: { code: true } } },
        },
        warehouse: { select: { id: true, code: true, name: true } },
        batch: { select: { id: true, batchNo: true } },
        reasonCode: { select: { code: true, label: true } },
      },
    });
    const names = await userNames(
      this.prisma,
      rows.map((r) => r.actorUserId),
    );
    return rows.map((r) => ({
      id: r.id,
      occurredAt: r.occurredAt.toISOString(),
      type: r.type,
      quantity: r.quantity,
      balanceAfter: r.balanceAfter,
      unitCost: cost4(r.unitCost),
      product: {
        id: r.product.id,
        sku: r.product.sku,
        name: r.product.name,
        unit: r.product.unit.code,
        trackExpiry: r.product.trackExpiry,
      },
      warehouse: r.warehouse,
      batch: r.batch,
      reason: r.reasonCode,
      reference: r.reference,
      sourceType: r.sourceType,
      sourceId: r.sourceId,
      note: r.note,
      actor: actorView(r.actorType, r.actorUserId, names),
    }));
  }
}
