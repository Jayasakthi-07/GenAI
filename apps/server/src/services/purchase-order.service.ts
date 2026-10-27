import {
  type PoAction,
  type PoDetail,
  type PoInput,
  type PoListItem,
  type PoListQuery,
  type PoReceive,
  poInputSchema,
  poReceiveSchema,
  type PurchaseOrderStatus,
} from '@stockroom/shared';
import type { Prisma } from '#generated/prisma/client.ts';
import type { Db, Tx } from '../db/client';
import { inTransaction } from '../db/tx';
import { type Actor, actorColumns, assertCan, can } from '../domain/actor';
import { writeAudit } from '../domain/audit';
import { AppError, invalidTransition, notFound } from '../domain/errors';
import type { Emit, EventBus } from '../domain/events';
import type { InventoryService } from './inventory.service';
import {
  actorView,
  dec,
  Decimal,
  getOrgSettings,
  iso,
  isoDay,
  localDay,
  money,
  nextNumber,
  pageArgs,
  pageMeta,
  parseSort,
  userNames,
} from './support';

const OPEN: PurchaseOrderStatus[] = ['APPROVED', 'SENT', 'PARTIALLY_RECEIVED'];

const detailInclude = {
  supplier: { select: { id: true, name: true, code: true } },
  lines: {
    orderBy: { id: 'asc' },
    include: {
      product: {
        select: { id: true, sku: true, name: true, trackExpiry: true, unit: { select: { code: true } } },
      },
    },
  },
  receipts: {
    orderBy: { receivedAt: 'asc' },
    include: {
      lines: {
        include: {
          purchaseOrderLine: {
            select: {
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
      },
    },
  },
} satisfies Prisma.PurchaseOrderInclude;

type PoRow = Prisma.PurchaseOrderGetPayload<{ include: typeof detailInclude }>;

export class PurchaseOrderService {
  constructor(
    private readonly prisma: Db,
    private readonly bus: EventBus,
    private readonly inventory: InventoryService,
  ) {}

  private async agentKeys(runIds: Array<string | null>): Promise<Map<string, string>> {
    const ids = [...new Set(runIds.filter((x): x is string => !!x))];
    if (!ids.length) return new Map();
    const runs = await this.prisma.agentRun.findMany({
      where: { id: { in: ids } },
      select: { id: true, agent: { select: { key: true } } },
    });
    return new Map(runs.map((r) => [r.id, r.agent.key]));
  }

  async list(
    q: PoListQuery,
  ): Promise<{ data: PoListItem[]; meta: { page: number; pageSize: number; total: number } }> {
    const today = localDay(new Date(), (await getOrgSettings(this.prisma)).timezone);
    const todayDate = new Date(`${today}T00:00:00Z`);
    const where: Prisma.PurchaseOrderWhereInput = {
      status: q.status?.length ? { in: q.status } : undefined,
      supplierId: q.supplierId,
      warehouseId: q.warehouseId,
      createdByType: q.createdBy === 'agent' ? 'AGENT' : q.createdBy === 'user' ? 'USER' : undefined,
      ...(q.overdue ? { status: { in: OPEN }, expectedDate: { lt: todayDate } } : {}),
      ...(q.q
        ? {
            OR: [
              { number: { contains: q.q, mode: 'insensitive' } },
              { supplier: { name: { contains: q.q, mode: 'insensitive' } } },
              {
                lines: {
                  some: {
                    product: {
                      OR: [
                        { sku: { contains: q.q, mode: 'insensitive' } },
                        { name: { contains: q.q, mode: 'insensitive' } },
                      ],
                    },
                  },
                },
              },
            ],
          }
        : {}),
    };
    const orderBy = parseSort<Prisma.PurchaseOrderOrderByWithRelationInput[]>(
      q.sort,
      {
        number: (d) => [{ number: d }],
        orderDate: (d) => [{ orderDate: d }],
        expectedDate: (d) => [{ expectedDate: { sort: d, nulls: 'last' } }],
        total: (d) => [{ total: d }],
        status: (d) => [{ status: d }, { orderDate: 'desc' }],
        supplier: (d) => [{ supplier: { name: d } }, { orderDate: 'desc' }],
      },
      [{ orderDate: 'desc' }],
    );
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.purchaseOrder.count({ where }),
      this.prisma.purchaseOrder.findMany({
        where,
        orderBy,
        ...pageArgs(q),
        include: {
          supplier: { select: { id: true, name: true, code: true } },
          lines: { select: { quantityOrdered: true, quantityReceived: true, quantityRejected: true } },
        },
      }),
    ]);
    const warehouses = new Map(
      (await this.prisma.warehouse.findMany({ select: { id: true, code: true, name: true } })).map((w) => [
        w.id,
        w,
      ]),
    );
    const names = await userNames(
      this.prisma,
      rows.map((r) => r.createdById),
    );
    const agents = await this.agentKeys(rows.map((r) => r.agentRunId));
    return {
      data: rows.map((po) => {
        const ordered = po.lines.reduce((a, l) => a + l.quantityOrdered, 0);
        const done = po.lines.reduce((a, l) => a + l.quantityReceived + l.quantityRejected, 0);
        return {
          id: po.id,
          number: po.number,
          supplier: po.supplier,
          warehouse: warehouses.get(po.warehouseId) ?? { id: po.warehouseId, code: '?', name: 'Unknown' },
          status: po.status,
          orderDate: po.orderDate.toISOString(),
          expectedDate: isoDay(po.expectedDate),
          total: money(po.total),
          lineCount: po.lines.length,
          receivedRatio: ordered ? done / ordered : 0,
          overdue: OPEN.includes(po.status) && !!po.expectedDate && po.expectedDate < todayDate,
          createdBy: actorView(
            po.createdByType,
            po.createdById,
            names,
            po.agentRunId ? agents.get(po.agentRunId) : null,
          ),
        };
      }),
      meta: pageMeta(q, total),
    };
  }

  private async allowedActions(
    actor: Actor,
    po: { status: PurchaseOrderStatus; receipts: unknown[] },
  ): Promise<PoAction[]> {
    const actions: PoAction[] = [];
    const create = can(actor, 'purchase_orders.create');
    const approve = can(actor, 'purchase_orders.approve');
    const receive = can(actor, 'stock.operate');
    if (po.status === 'DRAFT' && create) actions.push('edit', 'submit');
    if (po.status === 'PENDING_APPROVAL' && approve) actions.push('approve', 'reject');
    if (po.status === 'APPROVED' && create) actions.push('send');
    if ((po.status === 'APPROVED' || po.status === 'SENT' || po.status === 'PARTIALLY_RECEIVED') && receive)
      actions.push('receive');
    if ((po.status === 'PARTIALLY_RECEIVED' && approve) || (po.status === 'RECEIVED' && create))
      actions.push('close');
    const cancellable =
      (po.status === 'DRAFT' && create) ||
      (['PENDING_APPROVAL', 'APPROVED', 'SENT'].includes(po.status) && po.receipts.length === 0 && approve);
    if (cancellable) actions.push('cancel');
    return actions;
  }

  async get(actor: Actor, id: string): Promise<PoDetail> {
    const po = await this.prisma.purchaseOrder.findUnique({ where: { id }, include: detailInclude });
    if (!po) throw notFound('Purchase order');
    return this.toDetail(actor, po);
  }

  private async toDetail(actor: Actor, po: PoRow): Promise<PoDetail> {
    const today = localDay(new Date(), (await getOrgSettings(this.prisma)).timezone);
    const wh = await this.prisma.warehouse.findUnique({
      where: { id: po.warehouseId },
      select: { id: true, code: true, name: true },
    });
    const supplierSkus = new Map(
      (
        await this.prisma.supplierProduct.findMany({
          where: { supplierId: po.supplierId, productId: { in: po.lines.map((l) => l.productId) } },
          select: { productId: true, supplierSku: true },
        })
      ).map((s) => [s.productId, s.supplierSku]),
    );
    const names = await userNames(this.prisma, [
      po.createdById,
      po.approvedById,
      ...po.receipts.map((r) => r.receivedById),
    ]);
    const agents = await this.agentKeys([po.agentRunId]);
    const createdBy = actorView(
      po.createdByType,
      po.createdById,
      names,
      po.agentRunId ? agents.get(po.agentRunId) : null,
    );
    const ordered = po.lines.reduce((a, l) => a + l.quantityOrdered, 0);
    const done = po.lines.reduce((a, l) => a + l.quantityReceived + l.quantityRejected, 0);

    const timeline: PoDetail['timeline'] = [
      { at: po.createdAt.toISOString(), label: 'Created', by: createdBy.name },
    ];
    if (po.submittedAt)
      timeline.push({ at: po.submittedAt.toISOString(), label: 'Submitted for approval', by: null });
    if (po.approvedAt)
      timeline.push({
        at: po.approvedAt.toISOString(),
        label: 'Approved',
        by: po.approvedById ? (names.get(po.approvedById) ?? null) : 'Automatic (below approval limit)',
      });
    if (po.sentAt) timeline.push({ at: po.sentAt.toISOString(), label: 'Sent to supplier', by: null });
    for (const r of po.receipts) {
      const units = r.lines.reduce((a, l) => a + l.quantityReceived, 0);
      timeline.push({
        at: r.receivedAt.toISOString(),
        label: `Received ${units} units (${r.number})`,
        by: r.receivedById ? (names.get(r.receivedById) ?? null) : null,
      });
    }
    if (po.closedAt) timeline.push({ at: po.closedAt.toISOString(), label: 'Closed', by: null });
    if (po.cancelledAt)
      timeline.push({
        at: po.cancelledAt.toISOString(),
        label: `Cancelled${po.cancelReason ? `: ${po.cancelReason}` : ''}`,
        by: null,
      });
    timeline.sort((a, b) => a.at.localeCompare(b.at));

    return {
      id: po.id,
      number: po.number,
      supplier: po.supplier,
      warehouse: wh ?? { id: po.warehouseId, code: '?', name: 'Unknown' },
      status: po.status,
      orderDate: po.orderDate.toISOString(),
      expectedDate: isoDay(po.expectedDate),
      total: money(po.total),
      subtotal: money(po.subtotal),
      taxTotal: money(po.taxTotal),
      lineCount: po.lines.length,
      receivedRatio: ordered ? done / ordered : 0,
      overdue: OPEN.includes(po.status) && !!po.expectedDate && isoDay(po.expectedDate)! < today,
      createdBy,
      notes: po.notes,
      rationale: po.rationale,
      cancelReason: po.cancelReason,
      agentRunId: po.agentRunId,
      timeline,
      lines: po.lines.map((l) => ({
        id: l.id,
        product: {
          id: l.product.id,
          sku: l.product.sku,
          name: l.product.name,
          unit: l.product.unit.code,
          trackExpiry: l.product.trackExpiry,
        },
        supplierSku: supplierSkus.get(l.productId) ?? null,
        quantityOrdered: l.quantityOrdered,
        quantityReceived: l.quantityReceived,
        quantityRejected: l.quantityRejected,
        remaining: Math.max(0, l.quantityOrdered - l.quantityReceived - l.quantityRejected),
        unitCost: money(l.unitCost),
        taxRate: Number(l.taxRate).toFixed(2),
        lineTotal: money(l.lineTotal),
        rationale: l.rationale,
      })),
      receipts: po.receipts.map((r) => ({
        id: r.id,
        number: r.number,
        receivedAt: r.receivedAt.toISOString(),
        receivedBy: r.receivedById
          ? (names.get(r.receivedById) ?? 'Unknown user')
          : r.actorType === 'SIMULATOR'
            ? 'Simulator'
            : 'System',
        notes: r.notes,
        lines: r.lines.map((l) => ({
          id: l.id,
          product: {
            id: l.purchaseOrderLine.product.id,
            sku: l.purchaseOrderLine.product.sku,
            name: l.purchaseOrderLine.product.name,
            unit: l.purchaseOrderLine.product.unit.code,
            trackExpiry: l.purchaseOrderLine.product.trackExpiry,
          },
          quantityReceived: l.quantityReceived,
          quantityRejected: l.quantityRejected,
          rejectReason: l.rejectReason,
          unitCost: money(l.unitCost),
          batchNo: l.batchNo,
          expiryDate: isoDay(l.expiryDate),
        })),
      })),
      allowedActions: await this.allowedActions(actor, po),
    };
  }

  /* ── Writes ──────────────────────────────────────────────────────────── */

  private async buildLines(tx: Tx, input: ReturnType<typeof poInputSchema.parse>) {
    const supplier = await tx.supplier.findUnique({ where: { id: input.supplierId } });
    if (!supplier) throw notFound('Supplier');
    if (!supplier.isActive)
      throw new AppError('VALIDATION_ERROR', `${supplier.name} is inactive.`, {
        fields: { supplierId: 'Inactive supplier' },
      });
    const wh = await tx.warehouse.findUnique({ where: { id: input.warehouseId } });
    if (!wh?.isActive)
      throw new AppError('VALIDATION_ERROR', 'Choose an active warehouse.', {
        fields: { warehouseId: 'Inactive warehouse' },
      });
    const products = await tx.product.findMany({
      where: { id: { in: input.lines.map((l) => l.productId) } },
    });
    const byId = new Map(products.map((p) => [p.id, p]));
    let subtotal = new Decimal(0);
    let tax = new Decimal(0);
    const lines = input.lines.map((l, i) => {
      const p = byId.get(l.productId);
      if (!p) throw new AppError('VALIDATION_ERROR', `Line ${i + 1}: unknown product.`);
      if (p.status === 'DISCONTINUED') throw new AppError('VALIDATION_ERROR', `${p.name} is discontinued.`);
      const qty = Number(l.quantityOrdered);
      const unitCost = dec(l.unitCost).toDecimalPlaces(2);
      const rate = l.taxRate !== undefined ? dec(l.taxRate) : dec(p.taxRate);
      const lineTotal = unitCost.mul(qty).toDecimalPlaces(2);
      subtotal = subtotal.plus(lineTotal);
      tax = tax.plus(lineTotal.mul(rate).div(100).toDecimalPlaces(2));
      return {
        productId: p.id,
        quantityOrdered: qty,
        unitCost: unitCost.toFixed(2),
        taxRate: rate.toFixed(2),
        lineTotal: lineTotal.toFixed(2),
      };
    });
    return { supplier, wh, lines, subtotal, tax };
  }

  async create(
    actor: Actor,
    raw: PoInput,
    extra: {
      rationale?: string | null;
      lineRationales?: Map<string, string>;
      agentActionId?: string | null;
    } = {},
  ): Promise<PoDetail> {
    assertCan(actor, 'purchase_orders.create');
    const input = poInputSchema.parse(raw);
    const id = await inTransaction(this.prisma, this.bus, async (tx, emit) => {
      const { supplier, wh, lines, subtotal, tax } = await this.buildLines(tx, input);
      const now = new Date();
      const tz = (await getOrgSettings(tx)).timezone;
      const cols = actorColumns(actor);
      const po = await tx.purchaseOrder.create({
        data: {
          number: await nextNumber(tx, 'PO', now, tz),
          supplierId: supplier.id,
          warehouseId: wh.id,
          status: 'DRAFT',
          orderDate: now,
          expectedDate: input.expectedDate
            ? new Date(`${input.expectedDate}T00:00:00Z`)
            : await this.defaultExpectedDate(
                tx,
                supplier.id,
                input.lines.map((l) => l.productId),
                now,
                tz,
              ),
          subtotal: subtotal.toFixed(2),
          taxTotal: tax.toFixed(2),
          total: subtotal.plus(tax).toFixed(2),
          notes: input.notes ?? null,
          rationale: extra.rationale ?? null,
          createdByType: cols.actorType,
          createdById: cols.actorUserId,
          agentRunId: cols.agentRunId,
          agentActionId: extra.agentActionId ?? null,
          lines: {
            create: lines.map((l) => ({ ...l, rationale: extra.lineRationales?.get(l.productId) ?? null })),
          },
        },
      });
      await writeAudit(tx, actor, {
        action: 'po.create',
        entityType: 'PurchaseOrder',
        entityId: po.id,
        summary: `Created ${po.number} for ${supplier.name} (${money(po.total)})`,
        after: { ...po, lines },
      });
      emit('po.status_changed', { purchaseOrderId: po.id, number: po.number, status: po.status });
      if (input.submit) await this.submitInTx(tx, actor, po.id, emit);
      return po.id;
    });
    return this.get(actor, id);
  }

  /** Expected date from the slowest supplier lead time among the lines. */
  private async defaultExpectedDate(
    tx: Tx,
    supplierId: string,
    productIds: string[],
    now: Date,
    tz: string,
  ): Promise<Date> {
    const links = await tx.supplierProduct.findMany({
      where: { supplierId, productId: { in: productIds } },
      select: { leadTimeDays: true },
    });
    const lead = links.length ? Math.max(...links.map((l) => l.leadTimeDays)) : 7;
    const d = new Date(`${localDay(now, tz)}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + lead);
    return d;
  }

  async update(actor: Actor, id: string, raw: PoInput): Promise<PoDetail> {
    assertCan(actor, 'purchase_orders.create');
    const input = poInputSchema.parse(raw);
    await inTransaction(this.prisma, this.bus, async (tx, emit) => {
      const before = await tx.purchaseOrder.findUnique({ where: { id }, include: { lines: true } });
      if (!before) throw notFound('Purchase order');
      if (before.status !== 'DRAFT')
        throw new AppError('INVALID_STATE_TRANSITION', 'Only draft purchase orders can be edited.');
      const { supplier, wh, lines, subtotal, tax } = await this.buildLines(tx, input);
      await tx.purchaseOrderLine.deleteMany({ where: { purchaseOrderId: id } });
      const after = await tx.purchaseOrder.update({
        where: { id },
        data: {
          supplierId: supplier.id,
          warehouseId: wh.id,
          expectedDate: input.expectedDate
            ? new Date(`${input.expectedDate}T00:00:00Z`)
            : before.expectedDate,
          notes: input.notes ?? null,
          subtotal: subtotal.toFixed(2),
          taxTotal: tax.toFixed(2),
          total: subtotal.plus(tax).toFixed(2),
          lines: { create: lines },
        },
      });
      await writeAudit(tx, actor, {
        action: 'po.update',
        entityType: 'PurchaseOrder',
        entityId: id,
        summary: `Edited ${after.number}`,
        before,
        after: { ...after, lines },
      });
      if (input.submit) await this.submitInTx(tx, actor, id, emit);
    });
    return this.get(actor, id);
  }

  private async lockPo(tx: Tx, id: string) {
    await tx.$queryRaw`SELECT id FROM purchase_orders WHERE id = ${id}::uuid FOR UPDATE`;
    const po = await tx.purchaseOrder.findUnique({
      where: { id },
      include: { lines: true, supplier: { select: { name: true } }, receipts: { select: { id: true } } },
    });
    if (!po) throw notFound('Purchase order');
    return po;
  }

  private async submitInTx(tx: Tx, actor: Actor, id: string, emit: Emit): Promise<void> {
    const po = await this.lockPo(tx, id);
    if (po.status !== 'DRAFT') throw invalidTransition(po.status, 'PENDING_APPROVAL', po.number);
    const threshold = (await getOrgSettings(tx)).poApprovalThresholdInr;
    const now = new Date();
    const autoApprove = dec(po.total).lt(threshold);
    const status: PurchaseOrderStatus = autoApprove ? 'APPROVED' : 'PENDING_APPROVAL';
    await tx.purchaseOrder.update({
      where: { id },
      data: { status, submittedAt: now, approvedAt: autoApprove ? now : null, approvedById: null },
    });
    await writeAudit(tx, actor, {
      action: 'po.submit',
      entityType: 'PurchaseOrder',
      entityId: id,
      summary: autoApprove
        ? `Submitted ${po.number}; approved automatically (below ₹${threshold.toLocaleString('en-IN')})`
        : `Submitted ${po.number} for approval`,
      before: { status: po.status },
      after: { status },
    });
    emit('po.status_changed', { purchaseOrderId: id, number: po.number, status });
  }

  async submit(actor: Actor, id: string): Promise<PoDetail> {
    assertCan(actor, 'purchase_orders.create');
    await inTransaction(this.prisma, this.bus, (tx, emit) => this.submitInTx(tx, actor, id, emit));
    return this.get(actor, id);
  }

  private async transition(
    actor: Actor,
    id: string,
    from: PurchaseOrderStatus[],
    to: PurchaseOrderStatus,
    patch: (po: Awaited<ReturnType<PurchaseOrderService['lockPo']>>) => Prisma.PurchaseOrderUpdateInput,
    audit: { action: string; summary: (n: string) => string },
  ): Promise<PoDetail> {
    await inTransaction(this.prisma, this.bus, async (tx, emit) => {
      const po = await this.lockPo(tx, id);
      if (!from.includes(po.status)) throw invalidTransition(po.status, to, po.number);
      await tx.purchaseOrder.update({ where: { id }, data: { ...patch(po), status: to } });
      await writeAudit(tx, actor, {
        action: audit.action,
        entityType: 'PurchaseOrder',
        entityId: id,
        summary: audit.summary(po.number),
        before: { status: po.status },
        after: { status: to },
      });
      emit('po.status_changed', { purchaseOrderId: id, number: po.number, status: to });
    });
    return this.get(actor, id);
  }

  approve(actor: Actor, id: string) {
    assertCan(actor, 'purchase_orders.approve');
    const approvedById = actor.type === 'user' ? actor.userId : null;
    return this.transition(
      actor,
      id,
      ['PENDING_APPROVAL'],
      'APPROVED',
      () => ({ approvedAt: new Date(), approvedById }),
      {
        action: 'po.approve',
        summary: (n) => `Approved ${n}`,
      },
    );
  }

  reject(actor: Actor, id: string, reason: string) {
    assertCan(actor, 'purchase_orders.approve');
    return this.transition(
      actor,
      id,
      ['PENDING_APPROVAL'],
      'DRAFT',
      (po) => ({
        submittedAt: null,
        notes: [po.notes, `Returned for changes: ${reason}`].filter(Boolean).join('\n'),
      }),
      { action: 'po.reject', summary: (n) => `Returned ${n} to draft: ${reason}` },
    );
  }

  send(actor: Actor, id: string) {
    assertCan(actor, 'purchase_orders.create');
    return this.transition(actor, id, ['APPROVED'], 'SENT', () => ({ sentAt: new Date() }), {
      action: 'po.send',
      summary: (n) => `Marked ${n} as sent to the supplier`,
    });
  }

  /** Records a new expected delivery date from the supplier on an open order. */
  async reschedule(actor: Actor, id: string, expectedDate: string, note: string): Promise<void> {
    assertCan(actor, 'purchase_orders.create');
    await inTransaction(this.prisma, this.bus, async (tx, emit) => {
      const po = await this.lockPo(tx, id);
      if (!OPEN.includes(po.status))
        throw new AppError('INVALID_STATE_TRANSITION', `${po.number} isn’t open, so its date can’t change.`);
      const before = isoDay(po.expectedDate);
      await tx.purchaseOrder.update({
        where: { id },
        data: {
          expectedDate: new Date(`${expectedDate}T00:00:00Z`),
          notes: [po.notes, note].filter(Boolean).join('\n'),
        },
      });
      await writeAudit(tx, actor, {
        action: 'po.reschedule',
        entityType: 'PurchaseOrder',
        entityId: id,
        summary: `${po.number} now expected ${expectedDate}${before ? ` (was ${before})` : ''}: ${note}`,
        before: { expectedDate: before },
        after: { expectedDate },
      });
      emit('po.status_changed', { purchaseOrderId: id, number: po.number, status: po.status });
    });
  }

  async cancel(actor: Actor, id: string, reason: string): Promise<PoDetail> {
    const po = await this.prisma.purchaseOrder.findUnique({
      where: { id },
      include: { receipts: { select: { id: true } } },
    });
    if (!po) throw notFound('Purchase order');
    assertCan(actor, po.status === 'DRAFT' ? 'purchase_orders.create' : 'purchase_orders.approve');
    if (po.receipts.length)
      throw new AppError(
        'INVALID_STATE_TRANSITION',
        `${po.number} has receipts; close it instead of cancelling.`,
      );
    return this.transition(
      actor,
      id,
      ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'SENT'],
      'CANCELLED',
      () => ({ cancelledAt: new Date(), cancelReason: reason }),
      { action: 'po.cancel', summary: (n) => `Cancelled ${n}: ${reason}` },
    );
  }

  async close(actor: Actor, id: string, reason?: string | null): Promise<PoDetail> {
    const po = await this.prisma.purchaseOrder.findUnique({ where: { id } });
    if (!po) throw notFound('Purchase order');
    assertCan(
      actor,
      po.status === 'PARTIALLY_RECEIVED' ? 'purchase_orders.approve' : 'purchase_orders.create',
    );
    return this.transition(
      actor,
      id,
      ['PARTIALLY_RECEIVED', 'RECEIVED'],
      'CLOSED',
      (p) => ({
        closedAt: new Date(),
        notes:
          p.status === 'PARTIALLY_RECEIVED'
            ? [p.notes, `Closed short${reason ? `: ${reason}` : ''}`].filter(Boolean).join('\n')
            : p.notes,
      }),
      {
        action: 'po.close',
        summary: (n) =>
          `Closed ${n}${po.status === 'PARTIALLY_RECEIVED' ? ' short' : ''}${reason ? `: ${reason}` : ''}`,
      },
    );
  }

  /** Goods receipt against a PO: partial receipts allowed; stock is posted through the ledger. */
  async receive(actor: Actor, id: string, raw: PoReceive): Promise<PoDetail> {
    assertCan(actor, 'stock.operate');
    const input = poReceiveSchema.parse(raw);
    await inTransaction(this.prisma, this.bus, async (tx, emit) => {
      const po = await this.lockPo(tx, id);
      if (!['APPROVED', 'SENT', 'PARTIALLY_RECEIVED'].includes(po.status)) {
        throw new AppError(
          'INVALID_STATE_TRANSITION',
          `${po.number} is ${po.status.toLowerCase().replace('_', ' ')} and can’t be received.`,
        );
      }
      const now = new Date();
      const tz = (await getOrgSettings(tx)).timezone;
      const cols = actorColumns(actor);
      const grn = await tx.goodsReceipt.create({
        data: {
          number: await nextNumber(tx, 'GRN', now, tz),
          purchaseOrderId: po.id,
          warehouseId: po.warehouseId,
          receivedAt: now,
          actorType: cols.actorType,
          receivedById: cols.actorUserId,
          notes: input.notes ?? null,
        },
      });
      const lines = new Map(po.lines.map((l) => [l.id, l]));
      let receivedUnits = 0;
      for (const [i, r] of input.lines.entries()) {
        const line = lines.get(r.purchaseOrderLineId);
        if (!line) throw new AppError('VALIDATION_ERROR', `Line ${i + 1} isn’t on ${po.number}.`);
        const accepted = r.quantityReceived;
        const rejected = r.quantityRejected ?? 0;
        if (accepted + rejected === 0) continue;
        const remaining = line.quantityOrdered - line.quantityReceived - line.quantityRejected;
        if (accepted + rejected > remaining) {
          const product = await tx.product.findUnique({
            where: { id: line.productId },
            select: { name: true },
          });
          throw new AppError(
            'VALIDATION_ERROR',
            `${product?.name ?? 'Line'}: only ${remaining} remaining to receive.`,
            {
              fields: { [`lines.${i}.quantityReceived`]: `Max ${remaining}` },
            },
          );
        }
        const unitCost = r.unitCost ? dec(r.unitCost) : dec(line.unitCost);
        const movements =
          accepted > 0
            ? await this.inventory.recordMovement(
                tx,
                actor,
                {
                  productId: line.productId,
                  warehouseId: po.warehouseId,
                  type: 'RECEIPT',
                  quantity: accepted,
                  unitCost,
                  newBatch:
                    r.batchNo || r.expiryDate
                      ? { batchNo: r.batchNo ?? '', expiryDate: r.expiryDate ?? null }
                      : null,
                  reference: po.number,
                  sourceType: 'GoodsReceipt',
                  sourceId: grn.id,
                  occurredAt: now,
                },
                emit,
              )
            : [];
        await tx.purchaseOrderLine.update({
          where: { id: line.id },
          data: { quantityReceived: { increment: accepted }, quantityRejected: { increment: rejected } },
        });
        line.quantityReceived += accepted;
        line.quantityRejected += rejected;
        receivedUnits += accepted;
        await tx.goodsReceiptLine.create({
          data: {
            goodsReceiptId: grn.id,
            purchaseOrderLineId: line.id,
            productId: line.productId,
            quantityReceived: accepted,
            quantityRejected: rejected,
            rejectReason: rejected ? (r.rejectReason ?? 'Rejected on inspection') : null,
            unitCost: unitCost.toFixed(2),
            batchNo: movements[0]?.batchNo ?? r.batchNo ?? null,
            expiryDate:
              movements[0]?.expiryDate ?? (r.expiryDate ? new Date(`${r.expiryDate}T00:00:00Z`) : null),
          },
        });
      }
      const complete = po.lines.every((l) => l.quantityReceived + l.quantityRejected >= l.quantityOrdered);
      const status: PurchaseOrderStatus = complete ? 'RECEIVED' : 'PARTIALLY_RECEIVED';
      await tx.purchaseOrder.update({
        where: { id },
        data: { status, receivedAt: now, sentAt: po.sentAt ?? now },
      });
      await writeAudit(tx, actor, {
        action: 'po.receive',
        entityType: 'PurchaseOrder',
        entityId: id,
        summary: `Received ${receivedUnits} units against ${po.number} (${grn.number})`,
        before: { status: po.status },
        after: { status, receipt: grn.number, lines: input.lines },
      });
      emit('po.received', { purchaseOrderId: id, goodsReceiptId: grn.id, supplierId: po.supplierId });
      emit('po.status_changed', { purchaseOrderId: id, number: po.number, status });
    });
    return this.get(actor, id);
  }

  /** Raw record for the PDF. */
  async forPdf(id: string) {
    const po = await this.prisma.purchaseOrder.findUnique({
      where: { id },
      include: {
        supplier: true,
        lines: {
          orderBy: { id: 'asc' },
          include: { product: { select: { sku: true, name: true, unit: { select: { code: true } } } } },
        },
      },
    });
    if (!po) throw notFound('Purchase order');
    const [wh, org, skus] = await Promise.all([
      this.prisma.warehouse.findUnique({ where: { id: po.warehouseId } }),
      this.prisma.organization.findFirst({ orderBy: { createdAt: 'asc' } }),
      this.prisma.supplierProduct.findMany({
        where: { supplierId: po.supplierId, productId: { in: po.lines.map((l) => l.productId) } },
      }),
    ]);
    const skuBy = new Map(skus.map((s) => [s.productId, s.supplierSku]));
    return { po, warehouse: wh, organization: org, supplierSkus: skuBy, iso };
  }
}
