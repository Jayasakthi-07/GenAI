import {
  type TransferDetail,
  type TransferInput,
  type TransferListItem,
  type TransfersQuery,
  transferInputSchema,
} from '@stockroom/shared';
import type { Prisma } from '#generated/prisma/client.ts';
import type { Db, Tx } from '../db/client';
import { inTransaction } from '../db/tx';
import { type Actor, actorColumns, assertCan } from '../domain/actor';
import { writeAudit } from '../domain/audit';
import { AppError, invalidTransition, notFound } from '../domain/errors';
import type { Emit, EventBus } from '../domain/events';
import type { InventoryService } from './inventory.service';
import { actorView, getOrgSettings, iso, isoDay, nextNumber, pageArgs, pageMeta, userNames } from './support';

export class TransferService {
  constructor(
    private readonly prisma: Db,
    private readonly bus: EventBus,
    private readonly inventory: InventoryService,
  ) {}

  private async warehouses() {
    return new Map(
      (await this.prisma.warehouse.findMany({ select: { id: true, code: true, name: true } })).map((w) => [
        w.id,
        w,
      ]),
    );
  }

  async list(
    q: TransfersQuery,
  ): Promise<{ data: TransferListItem[]; meta: { page: number; pageSize: number; total: number } }> {
    const where: Prisma.TransferWhereInput = {
      status: q.status?.length ? { in: q.status } : undefined,
      ...(q.warehouseId
        ? { OR: [{ fromWarehouseId: q.warehouseId }, { toWarehouseId: q.warehouseId }] }
        : {}),
      ...(q.q ? { number: { contains: q.q, mode: 'insensitive' } } : {}),
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.transfer.count({ where }),
      this.prisma.transfer.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        ...pageArgs(q),
        include: { lines: { select: { quantity: true } } },
      }),
    ]);
    const wh = await this.warehouses();
    const names = await userNames(
      this.prisma,
      rows.map((r) => r.createdById),
    );
    return {
      data: rows.map((t) => ({
        id: t.id,
        number: t.number,
        from: wh.get(t.fromWarehouseId) ?? { id: t.fromWarehouseId, code: '?', name: 'Unknown' },
        to: wh.get(t.toWarehouseId) ?? { id: t.toWarehouseId, code: '?', name: 'Unknown' },
        status: t.status,
        lineCount: t.lines.length,
        totalUnits: t.lines.reduce((a, l) => a + l.quantity, 0),
        createdAt: t.createdAt.toISOString(),
        shippedAt: iso(t.shippedAt),
        receivedAt: iso(t.receivedAt),
        createdBy: actorView(t.createdByType, t.createdById, names),
      })),
      meta: pageMeta(q, total),
    };
  }

  async get(id: string): Promise<TransferDetail> {
    const t = await this.prisma.transfer.findUnique({
      where: { id },
      include: {
        lines: {
          include: {
            product: {
              select: {
                id: true,
                sku: true,
                name: true,
                trackExpiry: true,
                unit: { select: { code: true } },
              },
            },
          },
        },
      },
    });
    if (!t) throw notFound('Transfer');
    const wh = await this.warehouses();
    const names = await userNames(this.prisma, [t.createdById]);
    const levels = await this.prisma.stockLevel.findMany({
      where: { warehouseId: t.fromWarehouseId, productId: { in: t.lines.map((l) => l.productId) } },
      select: { productId: true, onHand: true, reserved: true },
    });
    const available = new Map(levels.map((l) => [l.productId, l.onHand - l.reserved]));
    return {
      id: t.id,
      number: t.number,
      from: wh.get(t.fromWarehouseId) ?? { id: t.fromWarehouseId, code: '?', name: 'Unknown' },
      to: wh.get(t.toWarehouseId) ?? { id: t.toWarehouseId, code: '?', name: 'Unknown' },
      status: t.status,
      lineCount: t.lines.length,
      totalUnits: t.lines.reduce((a, l) => a + l.quantity, 0),
      createdAt: t.createdAt.toISOString(),
      shippedAt: iso(t.shippedAt),
      receivedAt: iso(t.receivedAt),
      cancelledAt: iso(t.cancelledAt),
      createdBy: actorView(t.createdByType, t.createdById, names),
      reason: t.reason,
      lines: t.lines.map((l) => ({
        id: l.id,
        product: {
          id: l.product.id,
          sku: l.product.sku,
          name: l.product.name,
          unit: l.product.unit.code,
          trackExpiry: l.product.trackExpiry,
        },
        quantity: l.quantity,
        availableAtSource: available.get(l.productId) ?? 0,
      })),
    };
  }

  async create(
    actor: Actor,
    raw: TransferInput,
    extra: { agentActionId?: string | null } = {},
  ): Promise<TransferDetail> {
    assertCan(actor, 'stock.operate');
    const input = transferInputSchema.parse(raw);
    const id = await inTransaction(this.prisma, this.bus, async (tx, emit) => {
      // One connection per transaction: queries run one after another.
      const from = await tx.warehouse.findUnique({ where: { id: input.fromWarehouseId } });
      const to = await tx.warehouse.findUnique({ where: { id: input.toWarehouseId } });
      if (!from?.isActive)
        throw new AppError('VALIDATION_ERROR', 'Choose an active source warehouse.', {
          fields: { fromWarehouseId: 'Inactive' },
        });
      if (!to?.isActive)
        throw new AppError('VALIDATION_ERROR', 'Choose an active destination warehouse.', {
          fields: { toWarehouseId: 'Inactive' },
        });
      const count = await tx.product.count({ where: { id: { in: input.lines.map((l) => l.productId) } } });
      if (count !== input.lines.length)
        throw new AppError('VALIDATION_ERROR', 'One of the products doesn’t exist.');
      const now = new Date();
      const cols = actorColumns(actor);
      const t = await tx.transfer.create({
        data: {
          number: await nextNumber(tx, 'TRF', now, (await getOrgSettings(tx)).timezone),
          fromWarehouseId: from.id,
          toWarehouseId: to.id,
          status: 'DRAFT',
          reason: input.reason ?? null,
          createdByType: cols.actorType,
          createdById: cols.actorUserId,
          agentActionId: extra.agentActionId ?? null,
          lines: {
            create: input.lines.map((l) => ({ productId: l.productId, quantity: Number(l.quantity) })),
          },
        },
      });
      await writeAudit(tx, actor, {
        action: 'transfer.create',
        entityType: 'Transfer',
        entityId: t.id,
        summary: `Created ${t.number}: ${from.code} → ${to.code}`,
        after: { ...t, lines: input.lines },
      });
      emit('transfer.status_changed', { transferId: t.id, number: t.number, status: 'DRAFT' });
      if (input.ship) await this.shipInTx(tx, actor, t.id, emit);
      return t.id;
    });
    return this.get(id);
  }

  private async lock(tx: Tx, id: string) {
    await tx.$queryRaw`SELECT id FROM transfers WHERE id = ${id}::uuid FOR UPDATE`;
    const t = await tx.transfer.findUnique({ where: { id }, include: { lines: true } });
    if (!t) throw notFound('Transfer');
    return t;
  }

  private async shipInTx(tx: Tx, actor: Actor, id: string, emit: Emit) {
    const t = await this.lock(tx, id);
    if (t.status !== 'DRAFT') throw invalidTransition(t.status, 'IN_TRANSIT', t.number);
    const now = new Date();
    for (const line of t.lines) {
      await this.inventory.recordMovement(
        tx,
        actor,
        {
          productId: line.productId,
          warehouseId: t.fromWarehouseId,
          type: 'TRANSFER_OUT',
          quantity: -line.quantity,
          reference: t.number,
          sourceType: 'Transfer',
          sourceId: t.id,
          occurredAt: now,
        },
        emit,
      );
    }
    await tx.transfer.update({ where: { id }, data: { status: 'IN_TRANSIT', shippedAt: now } });
    await writeAudit(tx, actor, {
      action: 'transfer.ship',
      entityType: 'Transfer',
      entityId: id,
      summary: `Shipped ${t.number}`,
      before: { status: t.status },
      after: { status: 'IN_TRANSIT' },
    });
    emit('transfer.status_changed', { transferId: id, number: t.number, status: 'IN_TRANSIT' });
  }

  async ship(actor: Actor, id: string): Promise<TransferDetail> {
    assertCan(actor, 'stock.operate');
    await inTransaction(this.prisma, this.bus, (tx, emit) => this.shipInTx(tx, actor, id, emit));
    return this.get(id);
  }

  /** Brings shipped stock into `warehouseId`, recreating the same batches and costs. */
  private async landShipment(
    tx: Tx,
    actor: Actor,
    t: { id: string; number: string },
    warehouseId: string,
    emit: Emit,
  ) {
    const out = await tx.stockMovement.findMany({
      where: { sourceType: 'Transfer', sourceId: t.id, type: 'TRANSFER_OUT' },
      include: { batch: { select: { batchNo: true, expiryDate: true, manufacturedOn: true } } },
      orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
    });
    const now = new Date();
    for (const m of out) {
      await this.inventory.recordMovement(
        tx,
        actor,
        {
          productId: m.productId,
          warehouseId,
          type: 'TRANSFER_IN',
          quantity: -m.quantity,
          unitCost: m.unitCost.toString(),
          newBatch: m.batch
            ? {
                batchNo: m.batch.batchNo,
                expiryDate: isoDay(m.batch.expiryDate),
                manufacturedOn: isoDay(m.batch.manufacturedOn),
              }
            : null,
          reference: t.number,
          sourceType: 'Transfer',
          sourceId: t.id,
          occurredAt: now,
        },
        emit,
      );
    }
  }

  async receive(actor: Actor, id: string): Promise<TransferDetail> {
    assertCan(actor, 'stock.operate');
    await inTransaction(this.prisma, this.bus, async (tx, emit) => {
      const t = await this.lock(tx, id);
      if (t.status !== 'IN_TRANSIT') throw invalidTransition(t.status, 'RECEIVED', t.number);
      await this.landShipment(tx, actor, t, t.toWarehouseId, emit);
      await tx.transfer.update({ where: { id }, data: { status: 'RECEIVED', receivedAt: new Date() } });
      await writeAudit(tx, actor, {
        action: 'transfer.receive',
        entityType: 'Transfer',
        entityId: id,
        summary: `Received ${t.number}`,
        before: { status: t.status },
        after: { status: 'RECEIVED' },
      });
      emit('transfer.status_changed', { transferId: id, number: t.number, status: 'RECEIVED' });
    });
    return this.get(id);
  }

  /** Drafts are simply cancelled; stock already in transit goes back to the source. */
  async cancel(actor: Actor, id: string, reason: string): Promise<TransferDetail> {
    assertCan(actor, 'stock.operate');
    await inTransaction(this.prisma, this.bus, async (tx, emit) => {
      const t = await this.lock(tx, id);
      if (t.status !== 'DRAFT' && t.status !== 'IN_TRANSIT')
        throw invalidTransition(t.status, 'CANCELLED', t.number);
      if (t.status === 'IN_TRANSIT') await this.landShipment(tx, actor, t, t.fromWarehouseId, emit);
      await tx.transfer.update({
        where: { id },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          reason: [t.reason, `Cancelled: ${reason}`].filter(Boolean).join('\n'),
        },
      });
      await writeAudit(tx, actor, {
        action: 'transfer.cancel',
        entityType: 'Transfer',
        entityId: id,
        summary: `Cancelled ${t.number}${t.status === 'IN_TRANSIT' ? ' (stock returned to source)' : ''}: ${reason}`,
        before: { status: t.status },
        after: { status: 'CANCELLED' },
      });
      emit('transfer.status_changed', { transferId: id, number: t.number, status: 'CANCELLED' });
    });
    return this.get(id);
  }
}
