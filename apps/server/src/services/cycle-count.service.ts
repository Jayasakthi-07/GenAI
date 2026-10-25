import {
  type CountApprove,
  type CountLinesUpdate,
  countApproveSchema,
  countLinesUpdateSchema,
  type CycleCountDetail,
  type CycleCountInput,
  type CycleCountListItem,
  type CycleCountsQuery,
  cycleCountInputSchema,
} from '@stockroom/shared';
import type { Prisma } from '#generated/prisma/client.ts';
import type { Db, Tx } from '../db/client';
import { inTransaction } from '../db/tx';
import { type Actor, actorColumns, assertCan } from '../domain/actor';
import { writeAudit } from '../domain/audit';
import { AppError, invalidTransition, notFound } from '../domain/errors';
import type { EventBus } from '../domain/events';
import type { CatalogService } from './catalog.service';
import type { InventoryService } from './inventory.service';
import {
  actorView,
  dec,
  Decimal,
  getOrgSettings,
  iso,
  isoDay,
  money,
  nextNumber,
  pageArgs,
  pageMeta,
  userNames,
} from './support';

const productSelect = {
  select: { id: true, sku: true, name: true, trackExpiry: true, unit: { select: { code: true } } },
} as const;

export class CycleCountService {
  constructor(
    private readonly prisma: Db,
    private readonly bus: EventBus,
    private readonly inventory: InventoryService,
    private readonly catalog: CatalogService,
  ) {}

  async list(
    q: CycleCountsQuery,
  ): Promise<{ data: CycleCountListItem[]; meta: { page: number; pageSize: number; total: number } }> {
    const where: Prisma.CycleCountWhereInput = {
      status: q.status?.length ? { in: q.status } : undefined,
      warehouseId: q.warehouseId,
      ...(q.q
        ? {
            OR: [
              { number: { contains: q.q, mode: 'insensitive' } },
              { reason: { contains: q.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.cycleCount.count({ where }),
      this.prisma.cycleCount.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        ...pageArgs(q),
        include: { lines: { select: { countedQty: true, variance: true, varianceValue: true } } },
      }),
    ]);
    const wh = new Map(
      (await this.prisma.warehouse.findMany({ select: { id: true, code: true, name: true } })).map((w) => [
        w.id,
        w,
      ]),
    );
    const names = await userNames(
      this.prisma,
      rows.map((r) => r.createdById),
    );
    return {
      data: rows.map((c) => ({
        id: c.id,
        number: c.number,
        warehouse: wh.get(c.warehouseId) ?? { id: c.warehouseId, code: '?', name: 'Unknown' },
        status: c.status,
        reason: c.reason,
        dueDate: isoDay(c.dueDate),
        lineCount: c.lines.length,
        countedCount: c.lines.filter((l) => l.countedQty !== null).length,
        varianceCount: c.lines.filter((l) => (l.variance ?? 0) !== 0).length,
        varianceValue: money(c.lines.reduce((a, l) => a.plus(dec(l.varianceValue)), new Decimal(0))),
        createdAt: c.createdAt.toISOString(),
        completedAt: iso(c.completedAt),
        createdBy: actorView(c.createdByType, c.createdById, names),
      })),
      meta: pageMeta(q, total),
    };
  }

  async get(id: string): Promise<CycleCountDetail> {
    const c = await this.prisma.cycleCount.findUnique({
      where: { id },
      include: { lines: { include: { product: productSelect }, orderBy: { product: { name: 'asc' } } } },
    });
    if (!c) throw notFound('Cycle count');
    const wh = await this.prisma.warehouse.findUnique({
      where: { id: c.warehouseId },
      select: { id: true, code: true, name: true },
    });
    const names = await userNames(this.prisma, [c.createdById, c.approvedById]);
    return {
      id: c.id,
      number: c.number,
      warehouse: wh ?? { id: c.warehouseId, code: '?', name: 'Unknown' },
      status: c.status,
      reason: c.reason,
      dueDate: isoDay(c.dueDate),
      lineCount: c.lines.length,
      countedCount: c.lines.filter((l) => l.countedQty !== null).length,
      varianceCount: c.lines.filter((l) => (l.variance ?? 0) !== 0).length,
      varianceValue: money(c.lines.reduce((a, l) => a.plus(dec(l.varianceValue)), new Decimal(0))),
      createdAt: c.createdAt.toISOString(),
      completedAt: iso(c.completedAt),
      submittedAt: iso(c.submittedAt),
      approvedBy: c.approvedById ? (names.get(c.approvedById) ?? null) : null,
      createdBy: actorView(c.createdByType, c.createdById, names),
      lines: c.lines.map((l) => ({
        id: l.id,
        product: {
          id: l.product.id,
          sku: l.product.sku,
          name: l.product.name,
          unit: l.product.unit.code,
          trackExpiry: l.product.trackExpiry,
        },
        expectedQty: l.expectedQty,
        countedQty: l.countedQty,
        variance: l.variance,
        variancePct:
          l.variance === null ? null : l.expectedQty ? l.variance / l.expectedQty : l.variance ? 1 : 0,
        varianceValue: l.varianceValue === null ? null : money(l.varianceValue),
        status: l.status,
        note: l.note,
        countedAt: iso(l.countedAt),
      })),
    };
  }

  async create(
    actor: Actor,
    raw: CycleCountInput,
    extra: { agentActionId?: string | null } = {},
  ): Promise<CycleCountDetail> {
    assertCan(actor, 'stock.operate');
    const input = cycleCountInputSchema.parse(raw);
    const categoryIds = input.categoryId
      ? await this.catalog.categoryWithDescendants(input.categoryId)
      : null;
    const id = await inTransaction(this.prisma, this.bus, async (tx) => {
      const wh = await tx.warehouse.findUnique({ where: { id: input.warehouseId } });
      if (!wh?.isActive)
        throw new AppError('VALIDATION_ERROR', 'Choose an active warehouse.', {
          fields: { warehouseId: 'Inactive' },
        });
      const levels = await tx.stockLevel.findMany({
        where: {
          warehouseId: wh.id,
          product: {
            status: { not: 'DISCONTINUED' },
            ...(input.productIds?.length ? { id: { in: input.productIds } } : {}),
            ...(categoryIds ? { categoryId: { in: categoryIds } } : {}),
          },
        },
        select: { productId: true, onHand: true },
      });
      if (!levels.length)
        throw new AppError(
          'VALIDATION_ERROR',
          `Nothing to count: none of those products is stocked at ${wh.code}.`,
        );
      if (levels.length > 300)
        throw new AppError(
          'VALIDATION_ERROR',
          `That’s ${levels.length} products; count at most 300 at a time.`,
        );
      const now = new Date();
      const cols = actorColumns(actor);
      const count = await tx.cycleCount.create({
        data: {
          number: await nextNumber(tx, 'CC', now, (await getOrgSettings(tx)).timezone),
          warehouseId: wh.id,
          status: 'OPEN',
          reason: input.reason ?? null,
          dueDate: input.dueDate ? new Date(`${input.dueDate}T00:00:00Z`) : null,
          createdByType: cols.actorType,
          createdById: cols.actorUserId,
          agentActionId: extra.agentActionId ?? null,
          lines: { create: levels.map((l) => ({ productId: l.productId, expectedQty: l.onHand })) },
        },
      });
      await writeAudit(tx, actor, {
        action: 'count.create',
        entityType: 'CycleCount',
        entityId: count.id,
        summary: `Started ${count.number} at ${wh.code} (${levels.length} products)`,
        after: count,
      });
      return count.id;
    });
    return this.get(id);
  }

  private async lock(tx: Tx, id: string) {
    await tx.$queryRaw`SELECT id FROM cycle_counts WHERE id = ${id}::uuid FOR UPDATE`;
    const c = await tx.cycleCount.findUnique({ where: { id }, include: { lines: true } });
    if (!c) throw notFound('Cycle count');
    return c;
  }

  async updateLines(actor: Actor, id: string, raw: CountLinesUpdate): Promise<CycleCountDetail> {
    assertCan(actor, 'stock.operate');
    const input = countLinesUpdateSchema.parse(raw);
    const userId = actor.type === 'user' ? actor.userId : null;
    await inTransaction(this.prisma, this.bus, async (tx) => {
      const c = await this.lock(tx, id);
      if (c.status !== 'OPEN')
        throw new AppError(
          'INVALID_STATE_TRANSITION',
          `${c.number} is ${c.status.toLowerCase().replace('_', ' ')}; counts can’t change.`,
        );
      const lines = new Map(c.lines.map((l) => [l.id, l]));
      const costs = new Map(
        (
          await tx.stockLevel.findMany({
            where: { warehouseId: c.warehouseId, productId: { in: c.lines.map((l) => l.productId) } },
            select: { productId: true, avgCost: true },
          })
        ).map((s) => [s.productId, dec(s.avgCost)]),
      );
      for (const u of input.lines) {
        const line = lines.get(u.id);
        if (!line) throw new AppError('VALIDATION_ERROR', 'One of the lines isn’t part of this count.');
        const counted = u.countedQty;
        const variance = counted === null ? null : counted - line.expectedQty;
        await tx.cycleCountLine.update({
          where: { id: line.id },
          data: {
            countedQty: counted,
            variance,
            varianceValue:
              variance === null
                ? null
                : (costs.get(line.productId) ?? new Decimal(0)).mul(variance).toFixed(2),
            status: counted === null ? (line.status === 'RECOUNT' ? 'RECOUNT' : 'PENDING') : 'COUNTED',
            note: u.note ?? line.note,
            countedById: counted === null ? null : userId,
            countedAt: counted === null ? null : new Date(),
          },
        });
      }
    });
    return this.get(id);
  }

  async submit(actor: Actor, id: string): Promise<CycleCountDetail> {
    assertCan(actor, 'stock.operate');
    await inTransaction(this.prisma, this.bus, async (tx) => {
      const c = await this.lock(tx, id);
      if (c.status !== 'OPEN') throw invalidTransition(c.status, 'IN_REVIEW', c.number);
      const missing = c.lines.filter((l) => l.countedQty === null).length;
      if (missing) throw new AppError('VALIDATION_ERROR', `${missing} product(s) haven’t been counted yet.`);
      await tx.cycleCount.update({ where: { id }, data: { status: 'IN_REVIEW', submittedAt: new Date() } });
      await writeAudit(tx, actor, {
        action: 'count.submit',
        entityType: 'CycleCount',
        entityId: id,
        summary: `Submitted ${c.number} for review`,
        before: { status: c.status },
        after: { status: 'IN_REVIEW' },
      });
    });
    return this.get(id);
  }

  /** Accepts the counts (posting corrections to the ledger) or sends selected lines back for a recount. */
  async approve(actor: Actor, id: string, raw: CountApprove = {}): Promise<CycleCountDetail> {
    assertCan(actor, 'counts.approve');
    const input = countApproveSchema.parse(raw);
    await inTransaction(this.prisma, this.bus, async (tx, emit) => {
      const c = await this.lock(tx, id);
      if (c.status !== 'IN_REVIEW') throw invalidTransition(c.status, 'COMPLETED', c.number);
      if (input.recountLineIds.length) {
        const ids = new Set(input.recountLineIds);
        await tx.cycleCountLine.updateMany({
          where: { cycleCountId: id, id: { in: [...ids] } },
          data: { status: 'RECOUNT', countedQty: null, variance: null, varianceValue: null, countedAt: null },
        });
        await tx.cycleCount.update({ where: { id }, data: { status: 'OPEN', submittedAt: null } });
        await writeAudit(tx, actor, {
          action: 'count.recount',
          entityType: 'CycleCount',
          entityId: id,
          summary: `Sent ${ids.size} line(s) of ${c.number} back for a recount`,
        });
        return;
      }
      const reason = await tx.reasonCode.findUnique({ where: { code: 'COUNT_VARIANCE' } });
      const now = new Date();
      let adjusted = 0;
      let value = new Decimal(0);
      for (const line of c.lines) {
        const variance = line.variance ?? 0;
        if (variance !== 0) {
          let batchId: string | null = null;
          if (variance > 0) {
            const product = await tx.product.findUnique({
              where: { id: line.productId },
              select: { trackExpiry: true },
            });
            if (product?.trackExpiry) {
              const latest = await tx.batch.findFirst({
                where: { productId: line.productId, warehouseId: c.warehouseId },
                orderBy: [{ expiryDate: { sort: 'desc', nulls: 'last' } }, { receivedAt: 'desc' }],
              });
              if (!latest)
                throw new AppError(
                  'VALIDATION_ERROR',
                  'A surplus on an expiry-tracked product needs an existing batch; receive it instead.',
                );
              batchId = latest.id;
            }
          }
          const rows = await this.inventory.recordMovement(
            tx,
            actor,
            {
              productId: line.productId,
              warehouseId: c.warehouseId,
              type: 'COUNT_CORRECTION',
              quantity: variance,
              batchId,
              allowExpired: true,
              reasonCodeId: reason?.id ?? null,
              reference: c.number,
              sourceType: 'CycleCount',
              sourceId: c.id,
              note: line.note,
              occurredAt: now,
            },
            emit,
          );
          adjusted++;
          value = value.plus(rows.reduce((a, r) => a.plus(r.unitCost.mul(r.quantity)), new Decimal(0)));
        }
      }
      await tx.cycleCountLine.updateMany({ where: { cycleCountId: id }, data: { status: 'ACCEPTED' } });
      await tx.cycleCount.update({
        where: { id },
        data: {
          status: 'COMPLETED',
          completedAt: now,
          approvedById: actor.type === 'user' ? actor.userId : null,
        },
      });
      await writeAudit(tx, actor, {
        action: 'count.approve',
        entityType: 'CycleCount',
        entityId: id,
        summary: `Approved ${c.number}: ${adjusted} correction(s), net ${money(value)}`,
        before: { status: c.status },
        after: { status: 'COMPLETED', corrections: adjusted, value: money(value) },
      });
      emit('count.completed', { cycleCountId: id, warehouseId: c.warehouseId });
    });
    return this.get(id);
  }

  async cancel(actor: Actor, id: string, reason: string): Promise<CycleCountDetail> {
    assertCan(actor, 'stock.operate');
    await inTransaction(this.prisma, this.bus, async (tx) => {
      const c = await this.lock(tx, id);
      if (c.status !== 'OPEN' && c.status !== 'IN_REVIEW')
        throw invalidTransition(c.status, 'CANCELLED', c.number);
      await tx.cycleCount.update({
        where: { id },
        data: { status: 'CANCELLED', reason: [c.reason, `Cancelled: ${reason}`].filter(Boolean).join('\n') },
      });
      await writeAudit(tx, actor, {
        action: 'count.cancel',
        entityType: 'CycleCount',
        entityId: id,
        summary: `Cancelled ${c.number}: ${reason}`,
      });
    });
    return this.get(id);
  }
}
