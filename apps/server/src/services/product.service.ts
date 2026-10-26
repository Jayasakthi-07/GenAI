import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import {
  type ImportPreview,
  type ImportResult,
  PRODUCT_CSV_COLUMNS,
  type ProductBulk,
  type ProductDetail,
  type ProductInput,
  type ProductListItem,
  type ProductListQuery,
  type ProductStock,
  productInputSchema,
  type StockState,
} from '@stockroom/shared';
import writeXlsxFile from 'write-excel-file/node';
import { Prisma } from '#generated/prisma/client.ts';
import type { Db, Tx } from '../db/client';
import { inTransaction } from '../db/tx';
import { type Actor, assertCan } from '../domain/actor';
import { writeAudit } from '../domain/audit';
import { AppError, notFound } from '../domain/errors';
import type { EventBus } from '../domain/events';
import { parseCsv, toCsv } from '../lib/csv';
import type { CatalogService } from './catalog.service';
import { cost4, getOrgSettings, iso, localDay, money, pageArgs, pageMeta } from './support';

const STATE_RANK: Record<StockState, number> = { OUT: 0, LOW: 1, ON_ORDER: 2, OVER: 3, OK: 4 };
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

interface ProductRow {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  brand: string | null;
  status: ProductListItem['status'];
  cost_price: Prisma.Decimal;
  selling_price: Prisma.Decimal;
  tax_rate: Prisma.Decimal;
  track_expiry: boolean;
  tags: string[];
  image_path: string | null;
  abc_class: ProductListItem['abcClass'];
  xyz_class: ProductListItem['xyzClass'];
  updated_at: Date;
  category_id: string;
  category_name: string;
  parent_name: string | null;
  unit: string;
  on_hand: number;
  available: number;
  on_order: number;
  value: Prisma.Decimal;
  states: StockState[] | null;
  total: bigint;
}

function worstState(states: StockState[] | null): { state: StockState; count: number } {
  if (!states?.length) return { state: 'OUT', count: 0 };
  const worst = states.reduce((w, s) => (STATE_RANK[s] < STATE_RANK[w] ? s : w), 'OK' as StockState);
  return { state: worst, count: states.filter((s) => s === worst).length };
}

export class ProductService {
  constructor(
    private readonly prisma: Db,
    private readonly bus: EventBus,
    private readonly catalog: CatalogService,
    private readonly uploadsDir: string,
  ) {}

  imageUrl(path: string | null): string | null {
    return path ? `/uploads/${path}` : null;
  }

  private toListItem(r: ProductRow): ProductListItem {
    const { state, count } = worstState(r.states);
    return {
      id: r.id,
      sku: r.sku,
      barcode: r.barcode,
      name: r.name,
      brand: r.brand,
      category: {
        id: r.category_id,
        name: r.category_name,
        path: r.parent_name ? `${r.parent_name} › ${r.category_name}` : r.category_name,
      },
      unit: r.unit,
      status: r.status,
      costPrice: money(r.cost_price),
      sellingPrice: money(r.selling_price),
      taxRate: Number(r.tax_rate).toFixed(2),
      trackExpiry: r.track_expiry,
      tags: r.tags,
      imageUrl: this.imageUrl(r.image_path),
      abcClass: r.abc_class,
      xyzClass: r.xyz_class,
      onHand: r.on_hand,
      available: r.available,
      onOrder: r.on_order,
      value: money(r.value),
      stockState: state,
      stockStateCount: count,
      updatedAt: r.updated_at.toISOString(),
    };
  }

  private async query(q: ProductListQuery, limit: number, offset: number): Promise<ProductRow[]> {
    const where: Prisma.Sql[] = [Prisma.sql`TRUE`];
    if (q.q) {
      const like = `%${q.q}%`;
      where.push(
        Prisma.sql`(p.name ILIKE ${like} OR p.sku ILIKE ${like} OR p.brand ILIKE ${like} OR p.barcode = ${q.q})`,
      );
    }
    if (q.categoryId) {
      const ids = await this.catalog.categoryWithDescendants(q.categoryId);
      where.push(Prisma.sql`p.category_id IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))})`);
    }
    if (q.status?.length) where.push(Prisma.sql`p.status::text IN (${Prisma.join(q.status)})`);
    if (q.abcClass?.length) where.push(Prisma.sql`p.abc_class::text IN (${Prisma.join(q.abcClass)})`);
    if (q.brand) where.push(Prisma.sql`p.brand = ${q.brand}`);
    if (q.tag) where.push(Prisma.sql`${q.tag} = ANY(p.tags)`);
    if (q.trackExpiry !== undefined) where.push(Prisma.sql`p.track_expiry = ${q.trackExpiry}`);
    if (q.supplierId) {
      where.push(
        Prisma.sql`EXISTS (SELECT 1 FROM supplier_products sp WHERE sp.product_id = p.id AND sp.supplier_id = ${q.supplierId}::uuid)`,
      );
    }
    if (q.warehouseId) where.push(Prisma.sql`a.product_id IS NOT NULL`);
    if (q.stockState?.length) {
      const states = Prisma.sql`ARRAY[${Prisma.join(q.stockState)}]::text[]`;
      where.push(
        q.stockState.includes('OUT')
          ? Prisma.sql`(a.states && ${states} OR a.states IS NULL)`
          : Prisma.sql`a.states && ${states}`,
      );
    }
    const whFilter = q.warehouseId ? Prisma.sql`WHERE v.warehouse_id = ${q.warehouseId}::uuid` : Prisma.empty;
    const [field, dir] = (q.sort ?? '').split(':');
    const d = dir === 'desc' ? Prisma.sql`DESC` : Prisma.sql`ASC`;
    const orderBy =
      {
        name: Prisma.sql`p.name ${d}`,
        sku: Prisma.sql`p.sku ${d}`,
        onHand: Prisma.sql`COALESCE(a.on_hand, 0) ${d}, p.name ASC`,
        value: Prisma.sql`COALESCE(a.value, 0) ${d}, p.name ASC`,
        sellingPrice: Prisma.sql`p.selling_price ${d}`,
        costPrice: Prisma.sql`p.cost_price ${d}`,
        updatedAt: Prisma.sql`p.updated_at ${d}`,
        category: Prisma.sql`COALESCE(parent.name, c.name) ${d}, c.name ${d}, p.name ASC`,
      }[field ?? ''] ?? Prisma.sql`p.name ASC`;
    return this.prisma.$queryRaw<ProductRow[]>`
      WITH a AS (
        SELECT v.product_id,
               SUM(v.on_hand)::int AS on_hand, SUM(v.available)::int AS available, SUM(v.on_order)::int AS on_order,
               COALESCE(SUM(v.value), 0) AS value, ARRAY_AGG(v.state) AS states
        FROM v_stock_positions v ${whFilter}
        GROUP BY v.product_id
      )
      SELECT p.id, p.sku, p.barcode, p.name, p.brand, p.status, p.cost_price, p.selling_price, p.tax_rate, p.track_expiry,
             p.tags, p.image_path, p.abc_class, p.xyz_class, p.updated_at,
             c.id AS category_id, c.name AS category_name, parent.name AS parent_name, u.code AS unit,
             COALESCE(a.on_hand, 0) AS on_hand, COALESCE(a.available, 0) AS available, COALESCE(a.on_order, 0) AS on_order,
             COALESCE(a.value, 0) AS value, a.states, COUNT(*) OVER() AS total
      FROM products p
      JOIN categories c ON c.id = p.category_id
      LEFT JOIN categories parent ON parent.id = c.parent_id
      JOIN units u ON u.id = p.unit_id
      LEFT JOIN a ON a.product_id = p.id
      WHERE ${Prisma.join(where, ' AND ')}
      ORDER BY ${orderBy}
      LIMIT ${limit} OFFSET ${offset}`;
  }

  async list(q: ProductListQuery) {
    const { skip, take } = pageArgs(q);
    const rows = await this.query(q, take, skip);
    return { data: rows.map((r) => this.toListItem(r)), meta: pageMeta(q, Number(rows[0]?.total ?? 0)) };
  }

  async get(id: string): Promise<ProductDetail> {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: { preferredSupplier: { select: { id: true, name: true } } },
    });
    if (!product) throw notFound('Product');
    const list = await this.listOne(id);
    return {
      ...list,
      description: product.description,
      mrp: product.mrp ? money(product.mrp) : null,
      shelfLifeDays: product.shelfLifeDays,
      leadTimeDays: product.leadTimeDays,
      reorderPoint: product.reorderPoint,
      safetyStock: product.safetyStock,
      maxStock: product.maxStock,
      preferredSupplier: product.preferredSupplier,
      unitId: product.unitId,
      createdAt: product.createdAt.toISOString(),
      stock: await this.stock(id),
    };
  }

  private async listOne(id: string): Promise<ProductListItem> {
    const rows = await this.prisma.$queryRaw<ProductRow[]>`
      WITH a AS (
        SELECT v.product_id, SUM(v.on_hand)::int AS on_hand, SUM(v.available)::int AS available,
               SUM(v.on_order)::int AS on_order, COALESCE(SUM(v.value), 0) AS value, ARRAY_AGG(v.state) AS states
        FROM v_stock_positions v WHERE v.product_id = ${id}::uuid GROUP BY v.product_id
      )
      SELECT p.id, p.sku, p.barcode, p.name, p.brand, p.status, p.cost_price, p.selling_price, p.tax_rate, p.track_expiry,
             p.tags, p.image_path, p.abc_class, p.xyz_class, p.updated_at,
             c.id AS category_id, c.name AS category_name, parent.name AS parent_name, u.code AS unit,
             COALESCE(a.on_hand, 0) AS on_hand, COALESCE(a.available, 0) AS available, COALESCE(a.on_order, 0) AS on_order,
             COALESCE(a.value, 0) AS value, a.states, 1::bigint AS total
      FROM products p
      JOIN categories c ON c.id = p.category_id
      LEFT JOIN categories parent ON parent.id = c.parent_id
      JOIN units u ON u.id = p.unit_id
      LEFT JOIN a ON a.product_id = p.id
      WHERE p.id = ${id}::uuid`;
    const r = rows[0];
    if (!r) throw notFound('Product');
    return this.toListItem(r);
  }

  async stock(productId: string): Promise<ProductStock[]> {
    const rows = await this.prisma.$queryRaw<
      Array<{
        warehouse_id: string;
        code: string;
        name: string;
        on_hand: number;
        reserved: number;
        available: number;
        on_order: number;
        reorder_point: number | null;
        safety_stock: number | null;
        max_stock: number | null;
        avg_cost: Prisma.Decimal;
        value: Prisma.Decimal;
        state: StockState;
        avg_daily_demand: number;
        days_of_cover: number | null;
        last_movement_at: Date | null;
      }>
    >`
      SELECT v.warehouse_id, w.code, w.name, v.on_hand, v.reserved, v.available, v.on_order, v.reorder_point, v.safety_stock,
             v.max_stock, v.avg_cost, v.value, v.state, v.avg_daily_demand, v.days_of_cover, v.last_movement_at
      FROM v_stock_positions v JOIN warehouses w ON w.id = v.warehouse_id
      WHERE v.product_id = ${productId}::uuid
      ORDER BY w.is_default DESC, w.code`;
    return rows.map((r) => ({
      warehouse: { id: r.warehouse_id, code: r.code, name: r.name },
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
    }));
  }

  /** Daily units and revenue across warehouses (zero-filled), oldest first. */
  async sales(
    productId: string,
    days: number,
  ): Promise<Array<{ date: string; quantity: number; revenue: number }>> {
    const tz = (await getOrgSettings(this.prisma)).timezone;
    const today = localDay(new Date(), tz);
    const rows = await this.prisma.$queryRaw<Array<{ date: Date; quantity: number; revenue: number }>>`
      SELECT date, SUM(quantity)::int AS quantity, ROUND(SUM(revenue))::float8 AS revenue
      FROM sales_daily
      WHERE product_id = ${productId}::uuid AND date > ${today}::date - ${days}::int
      GROUP BY date ORDER BY date`;
    const byDay = new Map(rows.map((r) => [r.date.toISOString().slice(0, 10), r]));
    const out: Array<{ date: string; quantity: number; revenue: number }> = [];
    const start = new Date(`${today}T00:00:00Z`);
    start.setUTCDate(start.getUTCDate() - days + 1);
    for (let i = 0; i < days; i++) {
      const d = new Date(start.getTime() + i * 86_400_000).toISOString().slice(0, 10);
      const r = byDay.get(d);
      out.push({ date: d, quantity: r?.quantity ?? 0, revenue: r?.revenue ?? 0 });
    }
    return out;
  }

  async suppliers(productId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { preferredSupplierId: true },
    });
    if (!product) throw notFound('Product');
    const links = await this.prisma.supplierProduct.findMany({
      where: { productId },
      include: {
        supplier: {
          select: { id: true, name: true, code: true, score: true, riskLevel: true, isActive: true },
        },
      },
      orderBy: { unitCost: 'asc' },
    });
    const last = await this.prisma.$queryRaw<
      Array<{ supplier_id: string; unit_cost: Prisma.Decimal; order_date: Date }>
    >`
      SELECT DISTINCT ON (po.supplier_id) po.supplier_id, l.unit_cost, po.order_date
      FROM purchase_order_lines l JOIN purchase_orders po ON po.id = l.purchase_order_id
      WHERE l.product_id = ${productId}::uuid AND po.status <> 'CANCELLED'
      ORDER BY po.supplier_id, po.order_date DESC`;
    const lastBy = new Map(last.map((l) => [l.supplier_id, l]));
    return links.map((l) => ({
      id: l.id,
      supplier: { id: l.supplier.id, name: l.supplier.name, code: l.supplier.code },
      supplierScore: l.supplier.score === null ? null : Number(l.supplier.score),
      riskLevel: l.supplier.riskLevel,
      supplierActive: l.supplier.isActive,
      supplierSku: l.supplierSku,
      unitCost: money(l.unitCost),
      moq: l.moq,
      packSize: l.packSize,
      leadTimeDays: l.leadTimeDays,
      isActive: l.isActive,
      isPreferred: product.preferredSupplierId === l.supplierId,
      lastPurchaseCost: lastBy.get(l.supplierId) ? money(lastBy.get(l.supplierId)?.unit_cost) : null,
      lastPurchasedAt: iso(lastBy.get(l.supplierId)?.order_date),
    }));
  }

  /* ── Writes ──────────────────────────────────────────────────────────── */

  private async validateRefs(tx: Tx, input: ReturnType<typeof productInputSchema.parse>, id?: string) {
    const category = await tx.category.findUnique({ where: { id: input.categoryId } });
    const unit = await tx.unit.findUnique({ where: { id: input.unitId } });
    if (!category)
      throw new AppError('VALIDATION_ERROR', 'Choose a category.', {
        fields: { categoryId: 'Choose a category' },
      });
    if (!unit)
      throw new AppError('VALIDATION_ERROR', 'Choose a unit.', { fields: { unitId: 'Choose a unit' } });
    const skuClash = await tx.product.findFirst({
      where: { sku: { equals: input.sku, mode: 'insensitive' }, NOT: id ? { id } : undefined },
    });
    if (skuClash)
      throw new AppError('CONFLICT', `SKU ${input.sku} is already used by ${skuClash.name}.`, {
        fields: { sku: 'Already used' },
      });
    if (input.barcode) {
      const clash = await tx.product.findFirst({
        where: { barcode: input.barcode, NOT: id ? { id } : undefined },
      });
      if (clash)
        throw new AppError('CONFLICT', `Barcode ${input.barcode} is already used by ${clash.name}.`, {
          fields: { barcode: 'Already used' },
        });
    }
    if (input.preferredSupplierId) {
      const s = await tx.supplier.findUnique({ where: { id: input.preferredSupplierId } });
      if (!s)
        throw new AppError('VALIDATION_ERROR', 'Choose a supplier.', {
          fields: { preferredSupplierId: 'Unknown supplier' },
        });
    }
  }

  private toData(input: ReturnType<typeof productInputSchema.parse>) {
    return {
      sku: input.sku,
      barcode: input.barcode,
      name: input.name,
      description: input.description,
      categoryId: input.categoryId,
      brand: input.brand,
      unitId: input.unitId,
      costPrice: input.costPrice,
      sellingPrice: input.sellingPrice,
      mrp: input.mrp ?? null,
      taxRate: input.taxRate.toFixed(2),
      tags: [...new Set(input.tags)],
      status: input.status,
      trackExpiry: input.trackExpiry,
      shelfLifeDays: input.shelfLifeDays,
      leadTimeDays: input.leadTimeDays,
      reorderPoint: input.reorderPoint,
      safetyStock: input.safetyStock,
      maxStock: input.maxStock,
      preferredSupplierId: input.preferredSupplierId ?? null,
    };
  }

  async create(actor: Actor, raw: ProductInput): Promise<ProductDetail> {
    assertCan(actor, 'catalog.manage');
    const input = productInputSchema.parse(raw);
    const id = await inTransaction(this.prisma, this.bus, async (tx, emit) => {
      await this.validateRefs(tx, input);
      const created = await tx.product.create({ data: this.toData(input) });
      await writeAudit(tx, actor, {
        action: 'product.create',
        entityType: 'Product',
        entityId: created.id,
        summary: `Created ${created.name}`,
        after: created,
      });
      emit('catalog.changed', { entity: 'product', id: created.id });
      return created.id;
    });
    return this.get(id);
  }

  async update(actor: Actor, id: string, raw: ProductInput): Promise<ProductDetail> {
    assertCan(actor, 'catalog.manage');
    const input = productInputSchema.parse(raw);
    await inTransaction(this.prisma, this.bus, async (tx, emit) => {
      const before = await tx.product.findUnique({ where: { id } });
      if (!before) throw notFound('Product');
      await this.validateRefs(tx, input, id);
      if (before.trackExpiry !== input.trackExpiry) {
        const held = await tx.stockLevel.aggregate({ where: { productId: id }, _sum: { onHand: true } });
        if ((held._sum.onHand ?? 0) > 0) {
          throw new AppError(
            'VALIDATION_ERROR',
            'Expiry tracking can only be changed when the product has no stock.',
            {
              fields: { trackExpiry: 'Product has stock' },
            },
          );
        }
      }
      const after = await tx.product.update({ where: { id }, data: this.toData(input) });
      await writeAudit(tx, actor, {
        action: 'product.update',
        entityType: 'Product',
        entityId: id,
        summary: `Updated ${after.name}`,
        before,
        after,
      });
      emit('catalog.changed', { entity: 'product', id });
    });
    return this.get(id);
  }

  /** A price change on its own (markdowns). Never below cost or above MRP. */
  async setSellingPrice(actor: Actor, id: string, price: string, reason: string): Promise<ProductDetail> {
    assertCan(actor, 'catalog.manage');
    await inTransaction(this.prisma, this.bus, async (tx, emit) => {
      const before = await tx.product.findUnique({ where: { id } });
      if (!before) throw notFound('Product');
      const next = new Prisma.Decimal(price);
      if (next.lt(before.costPrice))
        throw new AppError('VALIDATION_ERROR', 'The price can’t be below the cost price.', {
          fields: { sellingPrice: 'Below cost' },
        });
      if (before.mrp && next.gt(before.mrp))
        throw new AppError('VALIDATION_ERROR', 'The price can’t be above the MRP.', {
          fields: { sellingPrice: 'Above MRP' },
        });
      await tx.product.update({ where: { id }, data: { sellingPrice: next } });
      await writeAudit(tx, actor, {
        action: 'product.price',
        entityType: 'Product',
        entityId: id,
        summary: `Changed the price of ${before.name} from ₹${money(before.sellingPrice)} to ₹${money(next)}: ${reason}`,
        before: { sellingPrice: money(before.sellingPrice) },
        after: { sellingPrice: money(next), reason },
      });
      emit('catalog.changed', { entity: 'product', id });
    });
    return this.get(id);
  }

  /** Per-warehouse replenishment parameters (reorder point, safety stock, max stock). */
  async updateStockParams(
    actor: Actor,
    productId: string,
    warehouseId: string,
    params: { reorderPoint: number | null; safetyStock: number | null; maxStock: number | null },
  ): Promise<ProductStock[]> {
    assertCan(actor, 'catalog.manage');
    if (params.maxStock !== null && params.reorderPoint !== null && params.maxStock < params.reorderPoint) {
      throw new AppError('VALIDATION_ERROR', 'Max stock must be at least the reorder point.', {
        fields: { maxStock: 'Below reorder point' },
      });
    }
    if (
      params.safetyStock !== null &&
      params.reorderPoint !== null &&
      params.safetyStock > params.reorderPoint
    ) {
      throw new AppError('VALIDATION_ERROR', 'Safety stock can’t exceed the reorder point.', {
        fields: { safetyStock: 'Above reorder point' },
      });
    }
    await inTransaction(this.prisma, this.bus, async (tx, emit) => {
      const before = await tx.stockLevel.findUnique({
        where: { productId_warehouseId: { productId, warehouseId } },
      });
      const after = await tx.stockLevel.upsert({
        where: { productId_warehouseId: { productId, warehouseId } },
        create: { productId, warehouseId, ...params },
        update: params,
      });
      const wh = await tx.warehouse.findUnique({ where: { id: warehouseId }, select: { code: true } });
      await writeAudit(tx, actor, {
        action: 'product.stock_params',
        entityType: 'Product',
        entityId: productId,
        summary: `Changed replenishment settings at ${wh?.code ?? 'warehouse'}`,
        before: before
          ? { reorderPoint: before.reorderPoint, safetyStock: before.safetyStock, maxStock: before.maxStock }
          : null,
        after: { reorderPoint: after.reorderPoint, safetyStock: after.safetyStock, maxStock: after.maxStock },
      });
      emit('stock.changed', {
        productId,
        warehouseId,
        onHand: after.onHand,
        available: after.onHand - after.reserved,
        movementType: 'PARAMS',
        quantity: 0,
      });
    });
    return this.stock(productId);
  }

  async bulk(actor: Actor, input: ProductBulk): Promise<number> {
    assertCan(actor, 'catalog.manage');
    return inTransaction(this.prisma, this.bus, async (tx, emit) => {
      let updated: number;
      if (input.action === 'set-status') {
        updated = (
          await tx.product.updateMany({ where: { id: { in: input.ids } }, data: { status: input.status } })
        ).count;
      } else if (input.action === 'set-category') {
        if (!(await tx.category.findUnique({ where: { id: input.categoryId } }))) throw notFound('Category');
        updated = (
          await tx.product.updateMany({
            where: { id: { in: input.ids } },
            data: { categoryId: input.categoryId },
          })
        ).count;
      } else if (input.action === 'add-tag') {
        updated = await tx.$executeRaw`
          UPDATE products SET tags = array_append(tags, ${input.tag}), updated_at = now()
          WHERE id IN (${Prisma.join(input.ids.map((id) => Prisma.sql`${id}::uuid`))}) AND NOT (${input.tag} = ANY(tags))`;
      } else {
        updated = await tx.$executeRaw`
          UPDATE products SET tags = array_remove(tags, ${input.tag}), updated_at = now()
          WHERE id IN (${Prisma.join(input.ids.map((id) => Prisma.sql`${id}::uuid`))}) AND ${input.tag} = ANY(tags)`;
      }
      await writeAudit(tx, actor, {
        action: `product.bulk.${input.action}`,
        entityType: 'Product',
        summary: `Bulk ${input.action.replace('-', ' ')} on ${updated} product(s)`,
        after: input,
      });
      emit('catalog.changed', { entity: 'product' });
      return updated;
    });
  }

  async setImage(actor: Actor, id: string, dataUrl: string): Promise<ProductDetail> {
    assertCan(actor, 'catalog.manage');
    const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
    if (!match?.[1] || !match[2]) throw new AppError('VALIDATION_ERROR', 'Upload a PNG, JPEG or WebP image.');
    const bytes = Buffer.from(match[2], 'base64');
    if (bytes.length > MAX_IMAGE_BYTES) throw new AppError('VALIDATION_ERROR', 'Images up to 2 MB, please.');
    const product = await this.prisma.product.findUnique({
      where: { id },
      select: { imagePath: true, name: true },
    });
    if (!product) throw notFound('Product');
    const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
    const path = `products/${id}-${Date.now().toString(36)}.${ext}`;
    const file = resolve(this.uploadsDir, path);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, bytes);
    await inTransaction(this.prisma, this.bus, async (tx, emit) => {
      await tx.product.update({ where: { id }, data: { imagePath: path } });
      await writeAudit(tx, actor, {
        action: 'product.image',
        entityType: 'Product',
        entityId: id,
        summary: `Updated the image of ${product.name}`,
      });
      emit('catalog.changed', { entity: 'product', id });
    });
    if (product.imagePath) await unlink(resolve(this.uploadsDir, product.imagePath)).catch(() => {});
    return this.get(id);
  }

  async removeImage(actor: Actor, id: string): Promise<ProductDetail> {
    assertCan(actor, 'catalog.manage');
    const product = await this.prisma.product.findUnique({
      where: { id },
      select: { imagePath: true, name: true },
    });
    if (!product) throw notFound('Product');
    await inTransaction(this.prisma, this.bus, async (tx, emit) => {
      await tx.product.update({ where: { id }, data: { imagePath: null } });
      await writeAudit(tx, actor, {
        action: 'product.image',
        entityType: 'Product',
        entityId: id,
        summary: `Removed the image of ${product.name}`,
      });
      emit('catalog.changed', { entity: 'product', id });
    });
    if (product.imagePath) await unlink(resolve(this.uploadsDir, product.imagePath)).catch(() => {});
    return this.get(id);
  }

  /* ── Export / import ─────────────────────────────────────────────────── */

  async export(
    q: ProductListQuery,
    format: 'csv' | 'xlsx',
  ): Promise<{ body: Buffer; contentType: string; filename: string }> {
    const rows = await this.query(q, 20_000, 0);
    const details = await this.prisma.product.findMany({
      where: { id: { in: rows.map((r) => r.id) } },
      select: {
        id: true,
        mrp: true,
        description: true,
        shelfLifeDays: true,
        leadTimeDays: true,
        category: { select: { name: true, parent: { select: { name: true } } } },
      },
    });
    const byId = new Map(details.map((d) => [d.id, d]));
    const header = [...PRODUCT_CSV_COLUMNS, 'on_hand', 'available', 'on_order', 'stock_value', 'stock_state'];
    const data = rows.map((r) => {
      const d = byId.get(r.id);
      const category = d?.category.parent
        ? `${d.category.parent.name} > ${d.category.name}`
        : (d?.category.name ?? r.category_name);
      const item = this.toListItem(r);
      return [
        r.sku,
        r.name,
        category,
        r.unit,
        money(r.cost_price),
        money(r.selling_price),
        d?.mrp ? money(d.mrp) : '',
        Number(r.tax_rate).toString(),
        r.barcode ?? '',
        r.brand ?? '',
        d?.description ?? '',
        r.tags.join(';'),
        r.status,
        r.track_expiry ? 'yes' : 'no',
        d?.shelfLifeDays ?? '',
        d?.leadTimeDays ?? '',
        r.on_hand,
        r.available,
        r.on_order,
        money(r.value),
        item.stockState,
      ];
    });
    const stamp = localDay(new Date(), (await getOrgSettings(this.prisma)).timezone);
    if (format === 'csv') {
      return {
        body: Buffer.from(toCsv(header, data), 'utf8'),
        contentType: 'text/csv; charset=utf-8',
        filename: `products-${stamp}.csv`,
      };
    }
    const numeric = new Set([
      'cost_price',
      'selling_price',
      'mrp',
      'tax_rate',
      'shelf_life_days',
      'lead_time_days',
      'on_hand',
      'available',
      'on_order',
      'stock_value',
    ]);
    const sheet = [
      header.map((h) => ({ value: h, fontWeight: 'bold' as const })),
      ...data.map((row) =>
        row.map((v, i) => {
          const col = header[i] ?? '';
          if (numeric.has(col) && v !== '' && v !== null) return { value: Number(v), type: Number };
          return { value: v === null ? '' : String(v), type: String };
        }),
      ),
    ];
    const body = await writeXlsxFile(sheet as never, { stickyRowsCount: 1 } as never).toBuffer();
    return {
      body,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      filename: `products-${stamp}.xlsx`,
    };
  }

  /** Validates a CSV import without writing anything. */
  async previewImport(csv: string, updateExisting: boolean): Promise<ImportPreview> {
    const plan = await this.planImport(csv, updateExisting);
    return plan.preview;
  }

  async commitImport(actor: Actor, csv: string, updateExisting: boolean): Promise<ImportResult> {
    assertCan(actor, 'catalog.manage');
    const plan = await this.planImport(csv, updateExisting);
    if (plan.preview.missingColumns.length) {
      throw new AppError(
        'VALIDATION_ERROR',
        `The file is missing required columns: ${plan.preview.missingColumns.join(', ')}.`,
      );
    }
    const result: ImportResult = {
      created: 0,
      updated: 0,
      skipped: plan.preview.summary.skip,
      failed: plan.preview.summary.error,
      errors: [],
    };
    result.errors = plan.preview.rows
      .filter((r) => r.action === 'error')
      .map((r) => ({ row: r.row, sku: r.sku, errors: r.errors }));
    await inTransaction(this.prisma, this.bus, async (tx, emit) => {
      for (const item of plan.valid) {
        if (item.existingId) {
          await tx.product.update({ where: { id: item.existingId }, data: this.toData(item.input) });
          result.updated++;
        } else {
          await tx.product.create({ data: this.toData(item.input) });
          result.created++;
        }
      }
      await writeAudit(tx, actor, {
        action: 'product.import',
        entityType: 'Product',
        summary: `Imported products: ${result.created} created, ${result.updated} updated, ${result.skipped} skipped, ${result.failed} failed`,
        after: { ...result, errors: result.errors.slice(0, 50) },
      });
      emit('catalog.changed', { entity: 'product' });
    });
    return result;
  }

  private async planImport(csv: string, updateExisting: boolean) {
    const table = parseCsv(csv);
    const [headerRow, ...body] = table;
    if (!headerRow) throw new AppError('VALIDATION_ERROR', 'The file is empty.');
    if (body.length > 10_000) throw new AppError('VALIDATION_ERROR', 'Import up to 10,000 rows at a time.');
    const header = headerRow.map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'));
    const required = ['sku', 'name', 'category', 'unit', 'cost_price', 'selling_price'];
    const missingColumns = required.filter((c) => !header.includes(c));
    const known = new Set<string>([
      ...PRODUCT_CSV_COLUMNS,
      'on_hand',
      'available',
      'on_order',
      'stock_value',
      'stock_state',
    ]);
    const unknownColumns = header.filter((h) => !known.has(h));
    const col = (row: string[], name: string) => {
      const i = header.indexOf(name);
      return i >= 0 ? (row[i] ?? '').trim() : undefined;
    };

    const [categories, units, existing] = await Promise.all([
      this.prisma.category.findMany({ include: { parent: { select: { name: true } } } }),
      this.prisma.unit.findMany(),
      this.prisma.product.findMany(),
    ]);
    const categoryByKey = new Map<string, string>();
    for (const c of categories) {
      categoryByKey.set(c.slug, c.id);
      categoryByKey.set(c.name.toLowerCase(), c.id);
      if (c.parent) categoryByKey.set(`${c.parent.name} > ${c.name}`.toLowerCase(), c.id);
    }
    const unitByKey = new Map<string, string>();
    for (const u of units) {
      unitByKey.set(u.code.toLowerCase(), u.id);
      unitByKey.set(u.name.toLowerCase(), u.id);
    }
    const bySku = new Map(existing.map((p) => [p.sku.toLowerCase(), p]));
    const byBarcode = new Map(existing.filter((p) => p.barcode).map((p) => [p.barcode as string, p]));
    const seenSku = new Set<string>();
    const seenBarcode = new Set<string>();

    const rows: ImportPreview['rows'] = [];
    const valid: Array<{ existingId: string | null; input: ReturnType<typeof productInputSchema.parse> }> =
      [];
    const yes = (v: string | undefined) =>
      v === undefined ? undefined : ['yes', 'y', 'true', '1'].includes(v.toLowerCase());

    body.forEach((row, index) => {
      const rowNumber = index + 2;
      const sku = col(row, 'sku') ?? '';
      const name = col(row, 'name') ?? '';
      const errors: string[] = [];
      if (missingColumns.length) {
        rows.push({ row: rowNumber, sku, name, action: 'error', errors: ['Missing required columns'] });
        return;
      }
      const current = bySku.get(sku.toLowerCase());
      if (seenSku.has(sku.toLowerCase())) errors.push('SKU appears more than once in this file');
      seenSku.add(sku.toLowerCase());
      if (current && !updateExisting) {
        rows.push({ row: rowNumber, sku, name, action: 'skip', errors: [] });
        return;
      }
      const categoryText = col(row, 'category') ?? '';
      const categoryId = categoryByKey.get(categoryText.toLowerCase().replace(/\s*›\s*/g, ' > '));
      if (!categoryId) errors.push(`Unknown category “${categoryText}”`);
      const unitText = col(row, 'unit') ?? '';
      const unitId = unitByKey.get(unitText.toLowerCase());
      if (!unitId) errors.push(`Unknown unit “${unitText}”`);
      const pick = <T>(value: T | undefined, fallback: T): T => (value === undefined ? fallback : value);
      const optionalNum = (v: string | undefined, fallback: number | null) =>
        v === undefined
          ? fallback
          : v === ''
            ? null
            : Number.isFinite(Number(v))
              ? Math.round(Number(v))
              : Number.NaN;
      const candidate = {
        sku,
        name,
        barcode: pick(col(row, 'barcode'), current?.barcode ?? '') || null,
        description: pick(col(row, 'description'), current?.description ?? '') || null,
        categoryId: categoryId ?? '',
        brand: pick(col(row, 'brand'), current?.brand ?? '') || null,
        unitId: unitId ?? '',
        costPrice: (col(row, 'cost_price') ?? '').replace(/[₹,\s]/g, ''),
        sellingPrice: (col(row, 'selling_price') ?? '').replace(/[₹,\s]/g, ''),
        mrp:
          (pick(col(row, 'mrp'), current?.mrp ? current.mrp.toString() : '') ?? '').replace(/[₹,\s]/g, '') ||
          null,
        taxRate: Number(pick(col(row, 'tax_rate'), current ? current.taxRate.toString() : '0') || 0),
        tags: (pick(col(row, 'tags'), current?.tags.join(';') ?? '') ?? '')
          .split(/[;|]/)
          .map((t) => t.trim())
          .filter(Boolean),
        status: (pick(col(row, 'status'), current?.status ?? 'ACTIVE') || 'ACTIVE').toUpperCase(),
        trackExpiry: yes(col(row, 'track_expiry')) ?? current?.trackExpiry ?? false,
        shelfLifeDays: optionalNum(col(row, 'shelf_life_days'), current?.shelfLifeDays ?? null),
        leadTimeDays: optionalNum(col(row, 'lead_time_days'), current?.leadTimeDays ?? null),
        reorderPoint: current?.reorderPoint ?? null,
        safetyStock: current?.safetyStock ?? null,
        maxStock: current?.maxStock ?? null,
        preferredSupplierId: current?.preferredSupplierId ?? null,
      };
      const parsed = productInputSchema.safeParse(candidate);
      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          const field = issue.path.join('.');
          if ((field === 'categoryId' && !categoryId) || (field === 'unitId' && !unitId)) continue;
          errors.push(`${field.replace(/([A-Z])/g, ' $1').toLowerCase()}: ${issue.message}`);
        }
      }
      if (candidate.barcode) {
        const other = byBarcode.get(candidate.barcode);
        if ((other && other.id !== current?.id) || seenBarcode.has(candidate.barcode))
          errors.push(`Barcode ${candidate.barcode} is already used`);
        seenBarcode.add(candidate.barcode);
      }
      if (current && current.trackExpiry !== candidate.trackExpiry)
        errors.push('Expiry tracking can’t be changed by import');
      if (errors.length || !parsed.success) {
        rows.push({ row: rowNumber, sku, name, action: 'error', errors });
        return;
      }
      rows.push({ row: rowNumber, sku, name, action: current ? 'update' : 'create', errors: [] });
      valid.push({ existingId: current?.id ?? null, input: parsed.data });
    });

    const count = (a: string) => rows.filter((r) => r.action === a).length;
    return {
      preview: {
        columns: header,
        missingColumns,
        unknownColumns,
        rows,
        summary: {
          total: rows.length,
          create: count('create'),
          update: count('update'),
          skip: count('skip'),
          error: count('error'),
        },
      },
      valid,
    };
  }
}
