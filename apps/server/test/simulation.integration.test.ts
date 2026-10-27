import type { ApiError, PoDetail, SimulationState } from '@stockroom/shared';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { type Client, dayFromNow, type Fixture, level, seedInventoryFixture, signIn } from './fixtures';
import { localDay } from '../src/services/support';
import { createTestApp, resetDatabase } from './helpers';

const url = inject('testDbUrl');

describe.skipIf(!url)('Simulator (integration)', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  let fx: Fixture;
  let manager: Client;
  let staff: Client;

  beforeAll(async () => {
    ctx = await createTestApp(url);
    await resetDatabase(ctx.prisma);
    fx = await seedInventoryFixture(ctx.prisma);
    manager = await signIn(ctx.app, 'manager@fixture.example');
    staff = await signIn(ctx.app, 'staff@fixture.example');
    await manager.post('/stock/receive', {
      warehouseId: fx.chn.id,
      lines: [{ productId: fx.rice.id, quantity: 500, unitCost: '400' }],
    });
    // Four weeks of steady rice sales at Chennai: 240 units a day, so a tick sells plenty.
    await ctx.prisma.salesDaily.createMany({
      data: Array.from({ length: 28 }, (_, i) => ({
        productId: fx.rice.id,
        warehouseId: fx.chn.id,
        date: new Date(`${dayFromNow(-(i + 1))}T00:00:00Z`),
        quantity: 240,
        revenue: '115200.00',
        cogs: '96000.00',
        orders: 4,
      })),
    });
  });
  afterAll(async () => {
    await ctx?.app.services.simulation.stop();
    await ctx?.app.close();
    await ctx?.prisma.$disconnect();
  });

  it('is controlled by managers, not staff', async () => {
    const res = await staff.post<ApiError>('/simulation/start');
    expect(res.status).toBe(403);
    const s = await staff.get<SimulationState>('/simulation');
    expect(s.body).toMatchObject({ available: true, running: false });
  });

  it('sells through the sales service and sends approved orders', async () => {
    const po = await manager.post<PoDetail>('/purchase-orders', {
      supplierId: fx.supplier.id,
      warehouseId: fx.chn.id,
      lines: [{ productId: fx.rice.id, quantityOrdered: 40, unitCost: '400' }],
      submit: true,
    });
    expect(po.body.status).toBe('APPROVED');
    await manager.patch('/simulation', { speed: 8 });

    const started = await manager.post<SimulationState>('/simulation/start');
    expect(started.body.running).toBe(true);
    const stopped = await manager.post<SimulationState>('/simulation/stop');
    expect(stopped.body.running).toBe(false);

    const orders = await ctx.prisma.salesOrder.findMany({
      where: { isSimulated: true },
      include: { lines: true },
    });
    expect(orders.length).toBeGreaterThanOrEqual(1);
    expect(orders[0]).toMatchObject({ status: 'FULFILLED', createdByType: 'SIMULATOR' });
    const sold = orders.flatMap((o) => o.lines).reduce((a, l) => a + l.quantityFulfilled, 0);
    expect(sold).toBeGreaterThan(0);
    expect(stopped.body.stats).toMatchObject({ orders: orders.length, units: sold, sentOrders: 1 });
    expect((await level(ctx.prisma, fx.rice.id, fx.chn.id)).onHand).toBe(500 - sold);
    // A ledger row per sale, recorded by the simulator.
    const sales = await ctx.prisma.stockMovement.count({ where: { type: 'SALE', actorType: 'SIMULATOR' } });
    expect(sales).toBeGreaterThan(0);
    expect((await ctx.prisma.purchaseOrder.findUniqueOrThrow({ where: { id: po.body.id } })).status).toBe(
      'SENT',
    );
  });

  it('delays a supplier: its open orders become overdue and are audited', async () => {
    const res = await manager.post<SimulationState>('/simulation/scenarios/supplier_delay');
    expect(res.status).toBe(200);
    expect(res.body.scenario).toMatchObject({ key: 'supplier_delay', hoursLeft: 72 });
    expect(res.body.scenario?.detail).toContain('Fixture Supplies');
    const open = await ctx.prisma.purchaseOrder.findMany({ where: { status: 'SENT' } });
    // Two days before today in the organization's time zone.
    const today = localDay(new Date(), 'Asia/Kolkata');
    const expected = new Date(Date.parse(`${today}T00:00:00Z`) - 2 * 86_400_000).toISOString().slice(0, 10);
    for (const po of open) expect(po.expectedDate?.toISOString().slice(0, 10)).toBe(expected);
    expect(await ctx.prisma.auditLog.count({ where: { action: 'po.reschedule' } })).toBe(open.length);
    await manager.post('/simulation/stop');
  });

  it('records a shrinkage incident as reasoned adjustments', async () => {
    await ctx.prisma.reasonCode.create({
      data: {
        code: 'SHRINKAGE',
        label: 'Shrinkage',
        direction: 'OUT',
        appliesTo: ['ADJUSTMENT'],
        sortOrder: 9,
      },
    });
    const before = (await level(ctx.prisma, fx.rice.id, fx.chn.id)).onHand;
    const res = await manager.post<SimulationState>('/simulation/scenarios/shrinkage');
    expect(res.status).toBe(200);
    expect(res.body.scenario).toMatchObject({ key: 'shrinkage', hoursLeft: 0 });
    // One-off: the simulator doesn't start for it.
    expect(res.body.running).toBe(false);
    const adjustments = await ctx.prisma.stockMovement.findMany({
      where: { type: 'ADJUSTMENT', actorType: 'SIMULATOR' },
      include: { reasonCode: true },
    });
    // Only Chennai holds stock in the fixture, so that's where the loss is.
    expect(adjustments).toHaveLength(1);
    expect(adjustments[0]).toMatchObject({ warehouseId: fx.chn.id, reasonCode: { code: 'SHRINKAGE' } });
    expect(adjustments[0]!.quantity).toBeLessThan(0);
    expect((await level(ctx.prisma, fx.rice.id, fx.chn.id)).onHand).toBe(before + adjustments[0]!.quantity);
    expect(res.body.scenario?.detail).toBe('1 high-value product short at Chennai.');
  });
});
