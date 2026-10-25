import {
  type Customer,
  type CustomerInput,
  type CustomersQuery,
  customerInputSchema,
  type SalesOrderStatus,
  type SoDetail,
  type SoFulfill,
  type SoInput,
  type SoListItem,
  type SoListQuery,
  soFulfillSchema,
  soInputSchema,
} from '@stockroom/shared';
import type { Prisma } from '#generated/prisma/client.ts';
import type { Db, Tx } from '../db/client';
import { inTransaction } from '../db/tx';
import { type Actor, actorColumns, assertCan, can } from '../domain/actor';
import { writeAudit } from '../domain/audit';
import { AppError, invalidTransition, notFound } from '../domain/errors';
import type { EventBus } from '../domain/events';
import type { InventoryService } from './inventory.service';
import {
  actorView,
  dec,
  Decimal,
  getOrgSettings,
  iso,
  money,
  nextNumber,
  pageArgs,
  pageMeta,
  parseSort,
  userNames,
} from './support';

const productSelect = {
  select: { id: true, sku: true, name: true, trackExpiry: true, unit: { select: { code: true } } },
} as const;

export class SalesService {
  constructor(
    private readonly prisma: Db,
    private readonly bus: EventBus,
    private readonly inventory: InventoryService,
  ) {}

  /* ── Customers ───────────────────────────────────────────────────────── */

  async customers(
    q: CustomersQuery,
  ): Promise<{ data: Customer[]; meta: { page: number; pageSize: number; total: number } }> {
    const where: Prisma.CustomerWhereInput = {
      type: q.type?.length ? { in: q.type } : undefined,
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
    const orderBy = parseSort<Prisma.CustomerOrderByWithRelationInput>(
      q.sort,
      { name: (d) => ({ name: d }), code: (d) => ({ code: d }) },
      { name: 'asc' },
    );
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.customer.count({ where }),
      this.prisma.customer.findMany({ where, orderBy, ...pageArgs(q) }),
    ]);
    const stats = rows.length
      ? await this.prisma.$queryRaw<
          Array<{ customer_id: string; orders: number; revenue: string; last: Date | null }>
        >`
          SELECT customer_id, COUNT(*)::int AS orders,
                 COALESCE(SUM(total) FILTER (WHERE order_date > now() - interval '90 days'), 0)::text AS revenue,
                 MAX(order_date) AS last
          FROM sales_orders WHERE customer_id = ANY(${rows.map((r) => r.id)}::uuid[]) AND status <> 'CANCELLED'
          GROUP BY customer_id`
      : [];
    const by = new Map(stats.map((s) => [s.customer_id, s]));
    return {
      data: rows.map((c) => ({
        id: c.id,
        code: c.code,
        name: c.name,
        type: c.type,
        email: c.email,
        phone: c.phone,
        city: c.city,
        gstin: c.gstin,
        isActive: c.isActive,
        orderCount: by.get(c.id)?.orders ?? 0,
        revenue90d: money(by.get(c.id)?.revenue ?? 0),
        lastOrderAt: iso(by.get(c.id)?.last ?? null),
      })),
      meta: pageMeta(q, total),
    };
  }

  async saveCustomer(actor: Actor, raw: CustomerInput, id?: string): Promise<Customer> {
    assertCan(actor, 'customers.manage');
    const input = customerInputSchema.parse(raw);
    const savedId = await inTransaction(this.prisma, this.bus, async (tx, emit) => {
      const before = id ? await tx.customer.findUnique({ where: { id } }) : null;
      if (id && !before) throw notFound('Customer');
      const clash = await tx.customer.findFirst({
        where: { code: input.code, NOT: id ? { id } : undefined },
      });
      if (clash)
        throw new AppError('CONFLICT', `Customer code ${input.code} is already used.`, {
          fields: { code: 'Already used' },
        });
      const saved = id
        ? await tx.customer.update({ where: { id }, data: input })
        : await tx.customer.create({ data: input });
      await writeAudit(tx, actor, {
        action: id ? 'customer.update' : 'customer.create',
        entityType: 'Customer',
        entityId: saved.id,
        summary: `${id ? 'Updated' : 'Created'} customer ${saved.name}`,
        before,
        after: saved,
      });
      emit('catalog.changed', { entity: 'customer', id: saved.id });
      return saved.id;
    });
    const saved = await this.prisma.customer.findUnique({ where: { id: savedId }, select: { code: true } });
    const { data } = await this.customers({
      page: 1,
      pageSize: 5,
      q: saved?.code,
      sort: undefined,
      type: undefined,
    });
    const customer = data.find((c) => c.id === savedId);
    if (!customer) throw notFound('Customer');
    return customer;
  }

  /* ── Sales orders ────────────────────────────────────────────────────── */

  async list(
    q: SoListQuery,
  ): Promise<{ data: SoListItem[]; meta: { page: number; pageSize: number; total: number } }> {
    const where: Prisma.SalesOrderWhereInput = {
      status: q.status?.length ? { in: q.status } : undefined,
      customerId: q.customerId,
      warehouseId: q.warehouseId,
      channel: q.channel?.length ? { in: q.channel } : undefined,
      ...(q.q
        ? {
            OR: [
              { number: { contains: q.q, mode: 'insensitive' } },
              { customer: { name: { contains: q.q, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    const orderBy = parseSort<Prisma.SalesOrderOrderByWithRelationInput[]>(
      q.sort,
      {
        number: (d) => [{ number: d }],
        orderDate: (d) => [{ orderDate: d }],
        total: (d) => [{ total: d }],
        status: (d) => [{ status: d }, { orderDate: 'desc' }],
        customer: (d) => [{ customer: { name: d } }, { orderDate: 'desc' }],
      },
      [{ orderDate: 'desc' }],
    );
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.salesOrder.count({ where }),
      this.prisma.salesOrder.findMany({
        where,
        orderBy,
        ...pageArgs(q),
        include: {
          customer: { select: { id: true, name: true } },
          lines: { select: { quantity: true, quantityFulfilled: true } },
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
    return {
      data: rows.map((so) => {
        const qty = so.lines.reduce((a, l) => a + l.quantity, 0);
        const done = so.lines.reduce((a, l) => a + l.quantityFulfilled, 0);
        return {
          id: so.id,
          number: so.number,
          customer: so.customer,
          warehouse: warehouses.get(so.warehouseId) ?? { id: so.warehouseId, code: '?', name: 'Unknown' },
          channel: so.channel,
          status: so.status,
          orderDate: so.orderDate.toISOString(),
          total: money(so.total),
          lineCount: so.lines.length,
          fulfilledRatio: qty ? done / qty : 0,
          createdBy: actorView(so.isSimulated ? 'SIMULATOR' : so.createdByType, so.createdById, names),
        };
      }),
      meta: pageMeta(q, total),
    };
  }

  async get(actor: Actor, id: string): Promise<SoDetail> {
    const so = await this.prisma.salesOrder.findUnique({
      where: { id },
      include: {
        customer: { select: { id: true, name: true } },
        lines: { orderBy: { id: 'asc' }, include: { product: productSelect } },
      },
    });
    if (!so) throw notFound('Sales order');
    const wh = await this.prisma.warehouse.findUnique({
      where: { id: so.warehouseId },
      select: { id: true, code: true, name: true },
    });
    const levels = await this.prisma.stockLevel.findMany({
      where: { warehouseId: so.warehouseId, productId: { in: so.lines.map((l) => l.productId) } },
      select: { productId: true, onHand: true, reserved: true },
    });
    const levelBy = new Map(levels.map((l) => [l.productId, l]));
    const names = await userNames(this.prisma, [so.createdById]);
    const qty = so.lines.reduce((a, l) => a + l.quantity, 0);
    const done = so.lines.reduce((a, l) => a + l.quantityFulfilled, 0);
    const reservedHere = (lineQty: number, fulfilled: number) =>
      so.status === 'CONFIRMED' || so.status === 'PARTIALLY_FULFILLED' ? lineQty - fulfilled : 0;
    const actions: SoDetail['allowedActions'] = [];
    if (so.status === 'DRAFT' && can(actor, 'sales_orders.create')) actions.push('edit', 'confirm');
    if ((so.status === 'CONFIRMED' || so.status === 'PARTIALLY_FULFILLED') && can(actor, 'stock.operate'))
      actions.push('fulfill');
    if ((so.status === 'DRAFT' || so.status === 'CONFIRMED') && can(actor, 'sales_orders.create'))
      actions.push('cancel');
    return {
      id: so.id,
      number: so.number,
      customer: so.customer,
      warehouse: wh ?? { id: so.warehouseId, code: '?', name: 'Unknown' },
      channel: so.channel,
      status: so.status,
      orderDate: so.orderDate.toISOString(),
      total: money(so.total),
      subtotal: money(so.subtotal),
      discountTotal: money(so.discountTotal),
      taxTotal: money(so.taxTotal),
      lineCount: so.lines.length,
      fulfilledRatio: qty ? done / qty : 0,
      createdBy: actorView(so.isSimulated ? 'SIMULATOR' : so.createdByType, so.createdById, names),
      notes: so.notes,
      fulfilledAt: iso(so.fulfilledAt),
      lines: so.lines.map((l) => {
        const lvl = levelBy.get(l.productId);
        return {
          id: l.id,
          product: {
            id: l.product.id,
            sku: l.product.sku,
            name: l.product.name,
            unit: l.product.unit.code,
            trackExpiry: l.product.trackExpiry,
          },
          quantity: l.quantity,
          quantityFulfilled: l.quantityFulfilled,
          unitPrice: money(l.unitPrice),
          discount: money(l.discount),
          taxRate: Number(l.taxRate).toFixed(2),
          lineTotal: money(l.lineTotal),
          available: lvl ? lvl.onHand - lvl.reserved + reservedHere(l.quantity, l.quantityFulfilled) : 0,
        };
      }),
      allowedActions: actions,
    };
  }

  private async buildLines(tx: Tx, input: ReturnType<typeof soInputSchema.parse>) {
    const customer = await tx.customer.findUnique({ where: { id: input.customerId } });
    if (!customer?.isActive)
      throw new AppError('VALIDATION_ERROR', 'Choose an active customer.', {
        fields: { customerId: 'Inactive customer' },
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
    let gross = new Decimal(0);
    let discount = new Decimal(0);
    let tax = new Decimal(0);
    const lines = input.lines.map((l, i) => {
      const p = byId.get(l.productId);
      if (!p) throw new AppError('VALIDATION_ERROR', `Line ${i + 1}: unknown product.`);
      if (p.status !== 'ACTIVE')
        throw new AppError('VALIDATION_ERROR', `${p.name} isn’t active and can’t be sold.`);
      const qty = Number(l.quantity);
      const price = l.unitPrice ? dec(l.unitPrice) : dec(p.sellingPrice);
      const disc = l.discount ? dec(l.discount) : new Decimal(0);
      const lineGross = price.mul(qty).toDecimalPlaces(2);
      if (disc.gt(lineGross))
        throw new AppError('VALIDATION_ERROR', `${p.name}: the discount is larger than the line value.`);
      const lineTotal = lineGross.minus(disc);
      gross = gross.plus(lineGross);
      discount = discount.plus(disc);
      tax = tax.plus(lineTotal.mul(dec(p.taxRate)).div(100).toDecimalPlaces(2));
      return {
        productId: p.id,
        quantity: qty,
        unitPrice: price.toFixed(2),
        discount: disc.toFixed(2),
        taxRate: dec(p.taxRate).toFixed(2),
        lineTotal: lineTotal.toFixed(2),
      };
    });
    return {
      customer,
      wh,
      lines,
      totals: {
        subtotal: gross.toFixed(2),
        discountTotal: discount.toFixed(2),
        taxTotal: tax.toFixed(2),
        total: gross.minus(discount).plus(tax).toFixed(2),
      },
    };
  }

  async create(actor: Actor, raw: SoInput): Promise<SoDetail> {
    assertCan(actor, 'sales_orders.create');
    const input = soInputSchema.parse(raw);
    const id = await inTransaction(this.prisma, this.bus, async (tx, emit) => {
      const { customer, wh, lines, totals } = await this.buildLines(tx, input);
      const now = new Date();
      const cols = actorColumns(actor);
      const so = await tx.salesOrder.create({
        data: {
          number: await nextNumber(tx, 'SO', now, (await getOrgSettings(tx)).timezone),
          customerId: customer.id,
          warehouseId: wh.id,
          channel: input.channel,
          status: 'DRAFT',
          orderDate: now,
          ...totals,
          notes: input.notes,
          createdByType: cols.actorType,
          createdById: cols.actorUserId,
          isSimulated: actor.type === 'simulator',
          lines: { create: lines },
        },
      });
      await writeAudit(tx, actor, {
        action: 'so.create',
        entityType: 'SalesOrder',
        entityId: so.id,
        summary: `Created ${so.number} for ${customer.name} (${money(so.total)})`,
        after: { ...so, lines },
      });
      emit('so.status_changed', { salesOrderId: so.id, number: so.number, status: 'DRAFT' });
      if (input.confirm) await this.confirmInTx(tx, actor, so.id, emit);
      return so.id;
    });
    return this.get(actor, id);
  }

  async update(actor: Actor, id: string, raw: SoInput): Promise<SoDetail> {
    assertCan(actor, 'sales_orders.create');
    const input = soInputSchema.parse(raw);
    await inTransaction(this.prisma, this.bus, async (tx, emit) => {
      const before = await tx.salesOrder.findUnique({ where: { id }, include: { lines: true } });
      if (!before) throw notFound('Sales order');
      if (before.status !== 'DRAFT')
        throw new AppError('INVALID_STATE_TRANSITION', 'Only draft sales orders can be edited.');
      const { customer, wh, lines, totals } = await this.buildLines(tx, input);
      await tx.salesOrderLine.deleteMany({ where: { salesOrderId: id } });
      const after = await tx.salesOrder.update({
        where: { id },
        data: {
          customerId: customer.id,
          warehouseId: wh.id,
          channel: input.channel,
          notes: input.notes,
          ...totals,
          lines: { create: lines },
        },
      });
      await writeAudit(tx, actor, {
        action: 'so.update',
        entityType: 'SalesOrder',
        entityId: id,
        summary: `Edited ${after.number}`,
        before,
        after: { ...after, lines },
      });
      if (input.confirm) await this.confirmInTx(tx, actor, id, emit);
    });
    return this.get(actor, id);
  }

  private async lockSo(tx: Tx, id: string) {
    await tx.$queryRaw`SELECT id FROM sales_orders WHERE id = ${id}::uuid FOR UPDATE`;
    const so = await tx.salesOrder.findUnique({ where: { id }, include: { lines: true } });
    if (!so) throw notFound('Sales order');
    return so;
  }

  private async confirmInTx(
    tx: Tx,
    actor: Actor,
    id: string,
    emit: (n: 'so.status_changed', p: { salesOrderId: string; number: string; status: string }) => void,
  ) {
    const so = await this.lockSo(tx, id);
    if (so.status !== 'DRAFT') throw invalidTransition(so.status, 'CONFIRMED', so.number);
    for (const line of so.lines)
      await this.inventory.changeReservation(tx, line.productId, so.warehouseId, line.quantity);
    await tx.salesOrder.update({ where: { id }, data: { status: 'CONFIRMED' } });
    await writeAudit(tx, actor, {
      action: 'so.confirm',
      entityType: 'SalesOrder',
      entityId: id,
      summary: `Confirmed ${so.number}; stock reserved`,
      before: { status: so.status },
      after: { status: 'CONFIRMED' },
    });
    emit('so.status_changed', { salesOrderId: id, number: so.number, status: 'CONFIRMED' });
  }

  async confirm(actor: Actor, id: string): Promise<SoDetail> {
    assertCan(actor, 'sales_orders.create');
    await inTransaction(this.prisma, this.bus, (tx, emit) => this.confirmInTx(tx, actor, id, emit));
    return this.get(actor, id);
  }

  /** Ships stock (first-expiry-first-out) and releases the matching reservation. */
  async fulfill(actor: Actor, id: string, raw: SoFulfill = {}): Promise<SoDetail> {
    assertCan(actor, 'stock.operate');
    const input = soFulfillSchema.parse(raw);
    await inTransaction(this.prisma, this.bus, async (tx, emit) => {
      const so = await this.lockSo(tx, id);
      if (so.status !== 'CONFIRMED' && so.status !== 'PARTIALLY_FULFILLED')
        throw invalidTransition(so.status, 'FULFILLED', so.number);
      const requested = new Map((input.lines ?? []).map((l) => [l.lineId, l.quantity]));
      const now = new Date();
      let shipped = 0;
      for (const line of so.lines) {
        const outstanding = line.quantity - line.quantityFulfilled;
        const qty = input.lines ? Math.min(requested.get(line.id) ?? 0, outstanding) : outstanding;
        if ((requested.get(line.id) ?? 0) > outstanding)
          throw new AppError('VALIDATION_ERROR', `Only ${outstanding} left to ship on one of the lines.`);
        if (qty <= 0) continue;
        const revenue = dec(line.lineTotal).mul(qty).div(line.quantity).toDecimalPlaces(2);
        await this.inventory.recordMovement(
          tx,
          actor,
          {
            productId: line.productId,
            warehouseId: so.warehouseId,
            type: 'SALE',
            quantity: -qty,
            consumeReserved: qty,
            reference: so.number,
            sourceType: 'SalesOrder',
            sourceId: so.id,
            saleRevenue: revenue,
            occurredAt: now,
          },
          emit,
        );
        await tx.salesOrderLine.update({
          where: { id: line.id },
          data: { quantityFulfilled: { increment: qty } },
        });
        line.quantityFulfilled += qty;
        shipped += qty;
      }
      if (!shipped) throw new AppError('VALIDATION_ERROR', 'Enter at least one quantity to ship.');
      const complete = so.lines.every((l) => l.quantityFulfilled >= l.quantity);
      const status: SalesOrderStatus = complete ? 'FULFILLED' : 'PARTIALLY_FULFILLED';
      await tx.salesOrder.update({ where: { id }, data: { status, fulfilledAt: complete ? now : null } });
      await writeAudit(tx, actor, {
        action: 'so.fulfill',
        entityType: 'SalesOrder',
        entityId: id,
        summary: `Shipped ${shipped} units for ${so.number}`,
        before: { status: so.status },
        after: { status },
      });
      emit('sale.recorded', { salesOrderId: id, warehouseId: so.warehouseId });
      emit('so.status_changed', { salesOrderId: id, number: so.number, status });
    });
    return this.get(actor, id);
  }

  async cancel(actor: Actor, id: string, reason: string): Promise<SoDetail> {
    assertCan(actor, 'sales_orders.create');
    await inTransaction(this.prisma, this.bus, async (tx, emit) => {
      const so = await this.lockSo(tx, id);
      if (so.status !== 'DRAFT' && so.status !== 'CONFIRMED') {
        throw new AppError('INVALID_STATE_TRANSITION', `${so.number} has shipments and can’t be cancelled.`);
      }
      if (so.status === 'CONFIRMED') {
        for (const line of so.lines)
          await this.inventory.changeReservation(
            tx,
            line.productId,
            so.warehouseId,
            -(line.quantity - line.quantityFulfilled),
          );
      }
      await tx.salesOrder.update({
        where: { id },
        data: { status: 'CANCELLED', notes: [so.notes, `Cancelled: ${reason}`].filter(Boolean).join('\n') },
      });
      await writeAudit(tx, actor, {
        action: 'so.cancel',
        entityType: 'SalesOrder',
        entityId: id,
        summary: `Cancelled ${so.number}: ${reason}`,
        before: { status: so.status },
        after: { status: 'CANCELLED' },
      });
      emit('so.status_changed', { salesOrderId: id, number: so.number, status: 'CANCELLED' });
    });
    return this.get(actor, id);
  }
}
