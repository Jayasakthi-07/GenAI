import type {
  SupplierDetail,
  SupplierInput,
  SupplierListItem,
  SupplierProduct,
  SupplierProductInput,
  SupplierScorecard,
  SuppliersQuery,
} from '@stockroom/shared';
import { PO_OPEN_STATUSES, supplierInputSchema, supplierProductInputSchema } from '@stockroom/shared';
import type { Prisma } from '#generated/prisma/client.ts';
import { type PoRecord, scoreSupplier, type SupplierScore } from '../analytics/supplier-score';
import type { Db } from '../db/client';
import { inTransaction } from '../db/tx';
import { type Actor, assertCan } from '../domain/actor';
import { writeAudit } from '../domain/audit';
import { AppError, conflict, notFound } from '../domain/errors';
import type { EventBus } from '../domain/events';
import { dec, getOrgSettings, iso, isoDay, localDay, money, pageArgs, pageMeta } from './support';

const SCORE_WINDOW_DAYS = 180;

export class SupplierService {
  private scoreCache: { at: number; today: string; scores: Map<string, SupplierScore> } | null = null;

  constructor(
    private readonly prisma: Db,
    private readonly bus: EventBus,
  ) {}

  private async today() {
    return localDay(new Date(), (await getOrgSettings(this.prisma)).timezone);
  }

  /** Purchase history in the scoring window, shaped for the pure scorer. */
  private async history(supplierId?: string): Promise<Map<string, PoRecord[]>> {
    const today = await this.today();
    const since = new Date(`${today}T00:00:00Z`);
    since.setUTCDate(since.getUTCDate() - SCORE_WINDOW_DAYS);
    const pos = await this.prisma.purchaseOrder.findMany({
      where: { supplierId, orderDate: { gte: since }, status: { notIn: ['DRAFT', 'CANCELLED'] } },
      select: {
        id: true,
        number: true,
        supplierId: true,
        orderDate: true,
        expectedDate: true,
        status: true,
        lines: {
          select: {
            productId: true,
            quantityOrdered: true,
            quantityReceived: true,
            quantityRejected: true,
            unitCost: true,
          },
        },
        receipts: {
          select: {
            number: true,
            receivedAt: true,
            lines: { select: { quantityReceived: true, quantityRejected: true } },
          },
        },
      },
    });
    const tz = (await getOrgSettings(this.prisma)).timezone;
    const bySupplier = new Map<string, PoRecord[]>();
    for (const po of pos) {
      const rec: PoRecord = {
        id: po.id,
        number: po.number,
        orderDate: localDay(po.orderDate, tz),
        expectedDate: isoDay(po.expectedDate),
        status: po.status,
        lines: po.lines.map((l) => ({
          productId: l.productId,
          ordered: l.quantityOrdered,
          received: l.quantityReceived,
          rejected: l.quantityRejected,
          unitCost: Number(l.unitCost),
        })),
        receipts: po.receipts.map((r) => ({
          number: r.number,
          receivedDate: localDay(r.receivedAt, tz),
          received: r.lines.reduce((a, l) => a + l.quantityReceived, 0),
          rejected: r.lines.reduce((a, l) => a + l.quantityRejected, 0),
        })),
      };
      bySupplier.set(po.supplierId, [...(bySupplier.get(po.supplierId) ?? []), rec]);
    }
    return bySupplier;
  }

  /** Live scores for every supplier (cached for a minute; the list page reads them). */
  private async scores(): Promise<Map<string, SupplierScore>> {
    const today = await this.today();
    if (this.scoreCache && this.scoreCache.today === today && Date.now() - this.scoreCache.at < 60_000)
      return this.scoreCache.scores;
    const history = await this.history();
    const scores = new Map<string, SupplierScore>();
    for (const [id, pos] of history) scores.set(id, scoreSupplier(pos, today));
    this.scoreCache = { at: Date.now(), today, scores };
    return scores;
  }

  invalidateScores() {
    this.scoreCache = null;
  }

  async list(
    q: SuppliersQuery,
  ): Promise<{ data: SupplierListItem[]; meta: { page: number; pageSize: number; total: number } }> {
    const where: Prisma.SupplierWhereInput = {
      isActive: q.active,
      ...(q.q
        ? {
            OR: [
              { name: { contains: q.q, mode: 'insensitive' } },
              { code: { contains: q.q, mode: 'insensitive' } },
              { city: { contains: q.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const rows = await this.prisma.supplier.findMany({
      where,
      include: { _count: { select: { catalog: true } } },
      orderBy: { name: 'asc' },
    });
    const ids = rows.map((r) => r.id);
    const [open, last, scores] = await Promise.all([
      ids.length
        ? this.prisma.purchaseOrder.groupBy({
            by: ['supplierId'],
            where: { supplierId: { in: ids }, status: { in: PO_OPEN_STATUSES } },
            _count: { _all: true },
            _sum: { total: true },
          })
        : [],
      ids.length
        ? this.prisma.purchaseOrder.groupBy({
            by: ['supplierId'],
            where: { supplierId: { in: ids } },
            _max: { orderDate: true },
          })
        : [],
      this.scores(),
    ]);
    const openBy = new Map(open.map((o) => [o.supplierId, o]));
    const lastBy = new Map(last.map((o) => [o.supplierId, o._max.orderDate]));
    let items: SupplierListItem[] = rows.map((s) => {
      const sc = scores.get(s.id);
      return {
        id: s.id,
        code: s.code,
        name: s.name,
        contactName: s.contactName,
        email: s.email,
        phone: s.phone,
        city: s.city,
        isActive: s.isActive,
        productCount: s._count.catalog,
        openPoCount: openBy.get(s.id)?._count._all ?? 0,
        openPoValue: money(openBy.get(s.id)?._sum.total ?? 0),
        score: sc?.score ?? (s.score !== null ? Number(s.score) : null),
        riskLevel: sc?.riskLevel ?? s.riskLevel,
        lastOrderAt: iso(lastBy.get(s.id) ?? null),
      };
    });
    const [field, dir] = (q.sort ?? '').split(':');
    const sign = dir === 'desc' ? -1 : 1;
    const key: Record<string, (s: SupplierListItem) => number | string> = {
      name: (s) => s.name,
      score: (s) => s.score ?? -1,
      openPoValue: (s) => Number(s.openPoValue),
      productCount: (s) => s.productCount,
      lastOrderAt: (s) => s.lastOrderAt ?? '',
    };
    const k = field ? key[field] : undefined;
    if (k) items = [...items].sort((a, b) => (k(a) > k(b) ? sign : k(a) < k(b) ? -sign : 0));
    const { skip, take } = pageArgs(q);
    return { data: items.slice(skip, skip + take), meta: pageMeta(q, items.length) };
  }

  async get(id: string): Promise<SupplierDetail> {
    const s = await this.prisma.supplier.findUnique({ where: { id } });
    if (!s) throw notFound('Supplier');
    const { data } = await this.list({
      page: 1,
      pageSize: 1000,
      q: undefined,
      sort: undefined,
      active: undefined,
    });
    const item = data.find((d) => d.id === id);
    if (!item) throw notFound('Supplier');
    return {
      ...item,
      address: s.address,
      gstin: s.gstin,
      paymentTermsDays: s.paymentTermsDays,
      notes: s.notes,
      scoredAt: iso(s.scoredAt),
    };
  }

  async save(actor: Actor, raw: SupplierInput, id?: string): Promise<SupplierDetail> {
    assertCan(actor, 'suppliers.manage');
    const input = supplierInputSchema.parse(raw);
    const savedId = await inTransaction(this.prisma, this.bus, async (tx, emit) => {
      const before = id ? await tx.supplier.findUnique({ where: { id } }) : null;
      if (id && !before) throw notFound('Supplier');
      const clash = await tx.supplier.findFirst({
        where: { code: input.code, NOT: id ? { id } : undefined },
      });
      if (clash)
        throw new AppError('CONFLICT', `Supplier code ${input.code} is already used by ${clash.name}.`, {
          fields: { code: 'Already used' },
        });
      const saved = id
        ? await tx.supplier.update({ where: { id }, data: input })
        : await tx.supplier.create({ data: input });
      await writeAudit(tx, actor, {
        action: id ? 'supplier.update' : 'supplier.create',
        entityType: 'Supplier',
        entityId: saved.id,
        summary: `${id ? 'Updated' : 'Created'} supplier ${saved.name}`,
        before,
        after: saved,
      });
      emit('catalog.changed', { entity: 'supplier', id: saved.id });
      return saved.id;
    });
    return this.get(savedId);
  }

  /* ── Supplier catalog ────────────────────────────────────────────────── */

  async catalog(supplierId: string): Promise<SupplierProduct[]> {
    const supplier = await this.prisma.supplier.findUnique({
      where: { id: supplierId },
      select: { id: true },
    });
    if (!supplier) throw notFound('Supplier');
    const rows = await this.prisma.supplierProduct.findMany({
      where: { supplierId },
      include: {
        product: {
          select: {
            id: true,
            sku: true,
            name: true,
            trackExpiry: true,
            preferredSupplierId: true,
            unit: { select: { code: true } },
          },
        },
      },
      orderBy: { product: { name: 'asc' } },
    });
    const last = await this.prisma.$queryRaw<Array<{ product_id: string; order_date: Date }>>`
      SELECT l.product_id, MAX(po.order_date) AS order_date
      FROM purchase_order_lines l JOIN purchase_orders po ON po.id = l.purchase_order_id
      WHERE po.supplier_id = ${supplierId}::uuid AND po.status <> 'CANCELLED'
      GROUP BY l.product_id`;
    const lastBy = new Map(last.map((l) => [l.product_id, l.order_date]));
    return rows.map((r) => ({
      id: r.id,
      product: {
        id: r.product.id,
        sku: r.product.sku,
        name: r.product.name,
        unit: r.product.unit.code,
        trackExpiry: r.product.trackExpiry,
      },
      supplierSku: r.supplierSku,
      unitCost: money(r.unitCost),
      moq: r.moq,
      packSize: r.packSize,
      leadTimeDays: r.leadTimeDays,
      isActive: r.isActive,
      isPreferred: r.product.preferredSupplierId === supplierId,
      lastPurchasedAt: iso(lastBy.get(r.productId) ?? null),
    }));
  }

  async saveCatalogItem(
    actor: Actor,
    supplierId: string,
    raw: SupplierProductInput,
    linkId?: string,
  ): Promise<SupplierProduct[]> {
    assertCan(actor, 'suppliers.manage');
    const input = supplierProductInputSchema.parse(raw);
    if (input.moq % input.packSize !== 0) {
      throw new AppError('VALIDATION_ERROR', 'Minimum order must be a multiple of the pack size.', {
        fields: { moq: 'Not a multiple of the pack size' },
      });
    }
    await inTransaction(this.prisma, this.bus, async (tx, emit) => {
      const supplier = await tx.supplier.findUnique({ where: { id: supplierId } });
      if (!supplier) throw notFound('Supplier');
      const product = await tx.product.findUnique({
        where: { id: input.productId },
        select: { id: true, name: true },
      });
      if (!product) throw notFound('Product');
      const before = linkId
        ? await tx.supplierProduct.findFirst({ where: { id: linkId, supplierId } })
        : null;
      if (linkId && !before) throw notFound('Catalog item');
      const dup = await tx.supplierProduct.findFirst({
        where: { supplierId, productId: input.productId, NOT: linkId ? { id: linkId } : undefined },
      });
      if (dup) throw conflict(`${product.name} is already in ${supplier.name}’s catalog.`);
      const data = {
        productId: input.productId,
        supplierSku: input.supplierSku,
        unitCost: input.unitCost,
        moq: input.moq,
        packSize: input.packSize,
        leadTimeDays: input.leadTimeDays,
        isActive: input.isActive,
      };
      const saved = linkId
        ? await tx.supplierProduct.update({ where: { id: linkId }, data })
        : await tx.supplierProduct.create({ data: { ...data, supplierId } });
      if (input.isPreferred) {
        await tx.product.update({
          where: { id: input.productId },
          data: { preferredSupplierId: supplierId, leadTimeDays: input.leadTimeDays },
        });
      }
      await writeAudit(tx, actor, {
        action: linkId ? 'supplier.catalog.update' : 'supplier.catalog.add',
        entityType: 'Supplier',
        entityId: supplierId,
        summary: `${linkId ? 'Updated' : 'Added'} ${product.name} in ${supplier.name}’s catalog${input.isPreferred ? ' (preferred)' : ''}`,
        before,
        after: saved,
      });
      emit('catalog.changed', { entity: 'supplier', id: supplierId });
    });
    return this.catalog(supplierId);
  }

  /** Makes an existing, active catalog link the product's preferred source. */
  async setPreferred(actor: Actor, productId: string, supplierId: string): Promise<void> {
    assertCan(actor, 'suppliers.manage');
    await inTransaction(this.prisma, this.bus, async (tx, emit) => {
      const link = await tx.supplierProduct.findUnique({
        where: { supplierId_productId: { supplierId, productId } },
        include: {
          supplier: { select: { name: true, isActive: true } },
          product: { select: { name: true, preferredSupplierId: true } },
        },
      });
      if (!link?.isActive || !link.supplier.isActive)
        throw new AppError('VALIDATION_ERROR', 'That supplier doesn’t actively supply this product.');
      await tx.product.update({
        where: { id: productId },
        data: { preferredSupplierId: supplierId, leadTimeDays: link.leadTimeDays },
      });
      await writeAudit(tx, actor, {
        action: 'product.preferred_supplier',
        entityType: 'Product',
        entityId: productId,
        summary: `${link.supplier.name} is now the preferred supplier for ${link.product.name}`,
        before: { preferredSupplierId: link.product.preferredSupplierId },
        after: { preferredSupplierId: supplierId },
      });
      emit('catalog.changed', { entity: 'product', id: productId });
    });
  }

  async removeCatalogItem(actor: Actor, supplierId: string, linkId: string): Promise<SupplierProduct[]> {
    assertCan(actor, 'suppliers.manage');
    await inTransaction(this.prisma, this.bus, async (tx, emit) => {
      const link = await tx.supplierProduct.findFirst({
        where: { id: linkId, supplierId },
        include: { product: { select: { name: true, preferredSupplierId: true } } },
      });
      if (!link) throw notFound('Catalog item');
      if (link.product.preferredSupplierId === supplierId) {
        throw conflict(
          `This supplier is the preferred source for ${link.product.name}. Choose another preferred supplier first.`,
        );
      }
      await tx.supplierProduct.delete({ where: { id: linkId } });
      await writeAudit(tx, actor, {
        action: 'supplier.catalog.remove',
        entityType: 'Supplier',
        entityId: supplierId,
        summary: `Removed ${link.product.name} from the catalog`,
        before: link,
      });
      emit('catalog.changed', { entity: 'supplier', id: supplierId });
    });
    return this.catalog(supplierId);
  }

  /* ── Scorecard ───────────────────────────────────────────────────────── */

  async scorecard(supplierId: string): Promise<SupplierScorecard> {
    const supplier = await this.prisma.supplier.findUnique({
      where: { id: supplierId },
      select: { id: true },
    });
    if (!supplier) throw notFound('Supplier');
    const today = await this.today();
    const pos = (await this.history(supplierId)).get(supplierId) ?? [];
    const s = scoreSupplier(pos, today);

    const months = new Map<
      string,
      {
        orders: number;
        spend: number;
        onTime: number;
        timed: number;
        ordered: number;
        delivered: number;
        leads: number[];
      }
    >();
    for (const po of pos) {
      const m = po.orderDate.slice(0, 7);
      const e = months.get(m) ?? {
        orders: 0,
        spend: 0,
        onTime: 0,
        timed: 0,
        ordered: 0,
        delivered: 0,
        leads: [],
      };
      e.orders++;
      e.spend += po.lines.reduce((a, l) => a + l.ordered * l.unitCost, 0);
      const first = po.receipts.map((r) => r.receivedDate).sort()[0];
      if (first && po.expectedDate) {
        e.timed++;
        if (Date.parse(first) - Date.parse(po.expectedDate) <= 86_400_000) e.onTime++;
        e.leads.push(Math.round((Date.parse(first) - Date.parse(po.orderDate)) / 86_400_000));
      }
      if (po.status === 'RECEIVED' || po.status === 'CLOSED') {
        e.ordered += po.lines.reduce((a, l) => a + l.ordered, 0);
        e.delivered += po.lines.reduce((a, l) => a + l.received + l.rejected, 0);
      }
      months.set(m, e);
    }
    const monthly = [...months.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, e]) => ({
        month,
        orders: e.orders,
        spend: Math.round(e.spend),
        onTimeRate: e.timed ? e.onTime / e.timed : null,
        fillRate: e.ordered ? e.delivered / e.ordered : null,
        avgLeadTimeDays: e.leads.length
          ? Math.round((e.leads.reduce((a, b) => a + b, 0) / e.leads.length) * 10) / 10
          : null,
      }));

    const recentDeliveries = pos
      .flatMap((po) =>
        po.receipts.map((r) => ({
          receiptNumber: r.number,
          poNumber: po.number,
          purchaseOrderId: po.id,
          expectedDate: po.expectedDate,
          receivedAt: r.receivedDate,
          daysLate: po.expectedDate
            ? Math.round((Date.parse(r.receivedDate) - Date.parse(po.expectedDate)) / 86_400_000)
            : null,
          fillRate: (() => {
            const ordered = po.lines.reduce((a, l) => a + l.ordered, 0);
            return ordered ? Math.min(1, (r.received + r.rejected) / ordered) : 1;
          })(),
          rejected: r.rejected,
        })),
      )
      .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))
      .slice(0, 12);

    return {
      periodDays: SCORE_WINDOW_DAYS,
      score: s.score,
      riskLevel: s.riskLevel,
      breakdown: s.breakdown,
      metrics: {
        orders: s.metrics.orders,
        receipts: s.metrics.receipts,
        spend: money(dec(s.metrics.spend)),
        onTimeRate: s.metrics.onTimeRate,
        avgLeadTimeDays: s.metrics.avgLeadTimeDays,
        leadTimeCv: s.metrics.leadTimeCv,
        fillRate: s.metrics.fillRate,
        rejectionRate: s.metrics.rejectionRate,
        priceChange: s.metrics.priceChange,
      },
      flags: s.flags,
      monthly,
      recentDeliveries,
    };
  }
}
