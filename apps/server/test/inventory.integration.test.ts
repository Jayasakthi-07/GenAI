import type {
  Alert,
  ApiError,
  CycleCountDetail,
  FefoResult,
  PoDetail,
  SoDetail,
  StockOperationResult,
  TransferDetail,
} from '@stockroom/shared';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { runLedgerChecks } from '../src/scripts/ledger-checks';
import { type Client, dayFromNow, type Fixture, level, seedInventoryFixture, signIn } from './fixtures';
import { createTestApp, resetDatabase } from './helpers';

const url = inject('testDbUrl');

/**
 * End-to-end through the HTTP API: every stock change goes through the ledger, and the
 * ledger invariants hold at the end. Tests build on each other's state, in order.
 */
describe.skipIf(!url)('inventory flows (integration)', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  let fx: Fixture;
  let manager: Client;
  let staff: Client;
  const batches: Record<string, string> = {};

  beforeAll(async () => {
    ctx = await createTestApp(url);
    await resetDatabase(ctx.prisma);
    fx = await seedInventoryFixture(ctx.prisma);
    manager = await signIn(ctx.app, fx.users.manager.email);
    staff = await signIn(ctx.app, fx.users.staff.email);
  });

  afterAll(async () => {
    await ctx?.app.close();
    await ctx?.prisma.$disconnect();
  });

  const riceAt = (w: 'chn' | 'blr' = 'chn') => level(ctx.prisma, fx.rice.id, fx[w].id);
  const milkAt = (w: 'chn' | 'blr' = 'chn') => level(ctx.prisma, fx.milk.id, fx[w].id);

  describe('stock operations', () => {
    it('receives stock, keeps a moving-average cost and creates batches', async () => {
      const res = await staff.post<StockOperationResult>('/stock/receive', {
        warehouseId: fx.chn.id,
        reference: 'DC-1',
        lines: [
          { productId: fx.rice.id, quantity: 100, unitCost: '400' },
          { productId: fx.milk.id, quantity: 20, unitCost: '50', batchNo: 'A', expiryDate: dayFromNow(30) },
          { productId: fx.milk.id, quantity: 30, unitCost: '55', batchNo: 'B', expiryDate: dayFromNow(90) },
          { productId: fx.milk.id, quantity: 3, unitCost: '50', batchNo: 'X', expiryDate: dayFromNow(-5) },
        ],
      });
      expect(res.status).toBe(200);
      expect(res.body.movements).toHaveLength(4);
      expect(await riceAt()).toMatchObject({ onHand: 100, avgCost: '400' });
      const milk = await milkAt();
      expect(milk.onHand).toBe(53);
      expect(Number(milk.avgCost)).toBeCloseTo(2800 / 53, 3);
      for (const b of await ctx.prisma.batch.findMany({ where: { productId: fx.milk.id } }))
        batches[b.batchNo] = b.id;
      expect(Object.keys(batches).sort()).toEqual(['A', 'B', 'X']);
    });

    it('insists on a batch and expiry for expiry-tracked products', async () => {
      const res = await staff.post<ApiError>('/stock/receive', {
        warehouseId: fx.chn.id,
        lines: [{ productId: fx.milk.id, quantity: 1, unitCost: '50' }],
      });
      expect(res.status).toBe(400);
      expect(res.body.error.message).toMatch(/batch number and expiry/);
      expect((await milkAt()).onHand).toBe(53);
    });

    it('refuses to go negative and leaves balances untouched', async () => {
      const res = await staff.post<ApiError>('/stock/issue', {
        warehouseId: fx.chn.id,
        reasonCodeId: fx.reasons.INTERNAL_USE,
        lines: [{ productId: fx.rice.id, quantity: 1000 }],
      });
      expect(res.status).toBe(409);
      expect(res.body.error).toMatchObject({
        code: 'INSUFFICIENT_STOCK',
        details: { available: 100, requested: 1000 },
      });
      expect((await riceAt()).onHand).toBe(100);
    });

    it('rejects reasons that do not fit the change', async () => {
      const wrongType = await staff.post<ApiError>('/stock/issue', {
        warehouseId: fx.chn.id,
        reasonCodeId: fx.reasons.DAMAGED,
        lines: [{ productId: fx.rice.id, quantity: 1 }],
      });
      expect(wrongType.status).toBe(400);
      const wrongDirection = await staff.post<ApiError>('/stock/adjust', {
        warehouseId: fx.chn.id,
        productId: fx.rice.id,
        quantity: -2,
        reasonCodeId: fx.reasons.FOUND,
      });
      expect(wrongDirection.status).toBe(400);
      expect((await riceAt()).onHand).toBe(100);
    });

    it('allocates first-expiry-first-out and never picks expired stock', async () => {
      const plan = await staff.get<FefoResult>(
        `/stock/fefo?productId=${fx.milk.id}&warehouseId=${fx.chn.id}&quantity=25`,
      );
      expect(plan.status).toBe(200);
      expect(plan.body.allocations.map((a) => [a.batchNo, a.take])).toEqual([
        ['A', 20],
        ['B', 5],
      ]);
      expect(plan.body.shortfall).toBe(0);

      const res = await staff.post<StockOperationResult>('/stock/issue', {
        warehouseId: fx.chn.id,
        reasonCodeId: fx.reasons.SAMPLE,
        lines: [{ productId: fx.milk.id, quantity: 25 }],
      });
      expect(res.status).toBe(200);
      expect(res.body.movements.map((m) => [m.batch?.batchNo, m.quantity])).toEqual([
        ['A', -20],
        ['B', -5],
      ]);
      const left = await ctx.prisma.batch.findMany({
        where: { productId: fx.milk.id },
        orderBy: { batchNo: 'asc' },
      });
      expect(left.map((b) => [b.batchNo, b.quantity])).toEqual([
        ['A', 0],
        ['B', 25],
        ['X', 3],
      ]);

      const tooMuch = await staff.post<ApiError>('/stock/issue', {
        warehouseId: fx.chn.id,
        reasonCodeId: fx.reasons.SAMPLE,
        lines: [{ productId: fx.milk.id, quantity: 26 }],
      });
      expect(tooMuch.status).toBe(409);
      expect(tooMuch.body.error.message).toMatch(/3 more are expired/);
    });

    it('writes off an expired batch (managers only)', async () => {
      const body = {
        warehouseId: fx.chn.id,
        productId: fx.milk.id,
        quantity: 3,
        batchId: batches.X,
        reasonCodeId: fx.reasons.EXPIRED,
      };
      expect((await staff.post('/stock/write-off', body)).status).toBe(403);
      const res = await manager.post<StockOperationResult>('/stock/write-off', body);
      expect(res.status).toBe(200);
      expect((await milkAt()).onHand).toBe(25);
    });

    it('needs a manager for large adjustments', async () => {
      const big = {
        warehouseId: fx.chn.id,
        productId: fx.rice.id,
        quantity: -60,
        reasonCodeId: fx.reasons.DAMAGED,
      };
      expect((await staff.post('/stock/adjust', big)).status).toBe(403);
      expect((await staff.post('/stock/adjust', { ...big, quantity: -5 })).status).toBe(200);
      expect(
        (await manager.post('/stock/adjust', { ...big, quantity: 60, reasonCodeId: fx.reasons.FOUND }))
          .status,
      ).toBe(200);
      expect((await riceAt()).onHand).toBe(155);
      expect(await ctx.prisma.auditLog.count({ where: { action: 'stock.adjust' } })).toBe(2);
    });

    it('never oversells under concurrent requests', async () => {
      const issue = () =>
        staff.post('/stock/issue', {
          warehouseId: fx.chn.id,
          reasonCodeId: fx.reasons.INTERNAL_USE,
          lines: [{ productId: fx.rice.id, quantity: 50 }],
        });
      const results = await Promise.all([issue(), issue(), issue(), issue()]);
      expect(results.filter((r) => r.status === 200)).toHaveLength(3);
      expect(results.filter((r) => r.status === 409)).toHaveLength(1);
      expect((await riceAt()).onHand).toBe(5);
      // Put it back for the following tests.
      await manager.post('/stock/receive', {
        warehouseId: fx.chn.id,
        lines: [{ productId: fx.rice.id, quantity: 150, unitCost: '400' }],
      });
      expect(await riceAt()).toMatchObject({ onHand: 155, avgCost: '400' });
    });
  });

  describe('purchase orders', () => {
    it('runs from draft to closed, receiving in parts at the invoiced cost', async () => {
      const created = await staff.post<PoDetail>('/purchase-orders', {
        supplierId: fx.supplier.id,
        warehouseId: fx.chn.id,
        lines: [{ productId: fx.rice.id, quantityOrdered: 50, unitCost: '410', taxRate: 5 }],
        submit: true,
      });
      expect(created.status).toBe(200);
      // Below the approval threshold, submission approves automatically.
      expect(created.body).toMatchObject({ status: 'APPROVED', total: '21525.00' });
      expect(created.body.number).toMatch(/^PO-\d{4}-\d{5}$/);
      const id = created.body.id;
      const lineId = created.body.lines[0]!.id;

      expect((await staff.post<PoDetail>(`/purchase-orders/${id}/send`)).body.status).toBe('SENT');

      const first = await staff.post<PoDetail>(`/purchase-orders/${id}/receipts`, {
        lines: [{ purchaseOrderLineId: lineId, quantityReceived: 20 }],
      });
      expect(first.status).toBe(200);
      expect(first.body.status).toBe('PARTIALLY_RECEIVED');
      expect(first.body.lines[0]).toMatchObject({ quantityReceived: 20, remaining: 30 });
      const afterFirst = await riceAt();
      expect(afterFirst.onHand).toBe(175);
      expect(Number(afterFirst.avgCost)).toBeCloseTo((155 * 400 + 20 * 410) / 175, 3);

      const rest = await staff.post<PoDetail>(`/purchase-orders/${id}/receipts`, {
        lines: [
          {
            purchaseOrderLineId: lineId,
            quantityReceived: 28,
            quantityRejected: 2,
            rejectReason: 'Torn bags',
          },
        ],
      });
      expect(rest.body.status).toBe('RECEIVED');
      expect(rest.body.receipts).toHaveLength(2);
      expect(rest.body.receipts.every((r) => /^GRN-\d{4}-\d{5}$/.test(r.number))).toBe(true);
      expect((await riceAt()).onHand).toBe(203);

      const again = await staff.post(`/purchase-orders/${id}/receipts`, {
        lines: [{ purchaseOrderLineId: lineId, quantityReceived: 1 }],
      });
      expect(again.status).toBe(409);

      expect((await staff.post<PoDetail>(`/purchase-orders/${id}/close`, {})).body.status).toBe('CLOSED');
    });

    it('needs approval above the threshold, and managers can send it back', async () => {
      const created = await staff.post<PoDetail>('/purchase-orders', {
        supplierId: fx.supplier.id,
        warehouseId: fx.chn.id,
        lines: [{ productId: fx.rice.id, quantityOrdered: 300, unitCost: '400' }],
        submit: true,
      });
      expect(created.body.status).toBe('PENDING_APPROVAL');
      expect(created.body.allowedActions).not.toContain('approve');
      const id = created.body.id;

      expect((await staff.post(`/purchase-orders/${id}/approve`)).status).toBe(403);
      const rejected = await manager.post<PoDetail>(`/purchase-orders/${id}/reject`, {
        reason: 'Order half now',
      });
      expect(rejected.body.status).toBe('DRAFT');
      expect(rejected.body.notes).toMatch(/Returned for changes: Order half now/);

      const cancelled = await staff.post<PoDetail>(`/purchase-orders/${id}/cancel`, {
        reason: 'Replaced by a smaller order',
      });
      expect(cancelled.body).toMatchObject({
        status: 'CANCELLED',
        cancelReason: 'Replaced by a smaller order',
      });
    });

    it('receives expiry-tracked goods into a new batch', async () => {
      const po = await manager.post<PoDetail>('/purchase-orders', {
        supplierId: fx.supplier.id,
        warehouseId: fx.chn.id,
        lines: [{ productId: fx.milk.id, quantityOrdered: 10, unitCost: '50' }],
        submit: true,
      });
      await manager.post(`/purchase-orders/${po.body.id}/send`);
      const lineId = po.body.lines[0]!.id;
      const missing = await manager.post<ApiError>(`/purchase-orders/${po.body.id}/receipts`, {
        lines: [{ purchaseOrderLineId: lineId, quantityReceived: 10 }],
      });
      expect(missing.status).toBe(400);
      const ok = await manager.post<PoDetail>(`/purchase-orders/${po.body.id}/receipts`, {
        lines: [
          { purchaseOrderLineId: lineId, quantityReceived: 10, batchNo: 'C', expiryDate: dayFromNow(60) },
        ],
      });
      expect(ok.body.status).toBe('RECEIVED');
      expect((await milkAt()).onHand).toBe(35);
    });

    it('renders a PDF', async () => {
      const list = await manager.get<{ data: Array<{ id: string }> }>('/purchase-orders?pageSize=1');
      const pdf = await manager.get(`/purchase-orders/${list.body.data[0]!.id}/pdf`);
      expect(pdf.status).toBe(200);
      expect(pdf.headers['content-type']).toBe('application/pdf');
      expect(pdf.raw.subarray(0, 5).toString()).toBe('%PDF-');
    });
  });

  describe('sales orders', () => {
    it('reserves on confirmation, ships in parts and records the sale', async () => {
      const so = await staff.post<SoDetail>('/sales-orders', {
        customerId: fx.customer.id,
        warehouseId: fx.chn.id,
        channel: 'WHOLESALE',
        lines: [{ productId: fx.rice.id, quantity: 10 }],
        confirm: true,
      });
      expect(so.status).toBe(200);
      expect(so.body.status).toBe('CONFIRMED');
      expect(await riceAt()).toMatchObject({ onHand: 203, reserved: 10 });

      const lineId = so.body.lines[0]!.id;
      const part = await staff.post<SoDetail>(`/sales-orders/${so.body.id}/fulfill`, {
        lines: [{ lineId, quantity: 4 }],
      });
      expect(part.body.status).toBe('PARTIALLY_FULFILLED');
      expect(await riceAt()).toMatchObject({ onHand: 199, reserved: 6 });

      const all = await staff.post<SoDetail>(`/sales-orders/${so.body.id}/fulfill`, {});
      expect(all.body.status).toBe('FULFILLED');
      expect(await riceAt()).toMatchObject({ onHand: 193, reserved: 0 });

      const sold = await ctx.prisma.salesDaily.aggregate({
        where: { productId: fx.rice.id },
        _sum: { quantity: true, revenue: true },
      });
      expect(sold._sum.quantity).toBe(10);
      expect(Number(sold._sum.revenue)).toBeCloseTo(4800, 2);
    });

    it('releases the reservation when an order is cancelled', async () => {
      const so = await staff.post<SoDetail>('/sales-orders', {
        customerId: fx.customer.id,
        warehouseId: fx.chn.id,
        channel: 'STORE',
        lines: [{ productId: fx.rice.id, quantity: 5 }],
        confirm: true,
      });
      expect((await riceAt()).reserved).toBe(5);
      const cancelled = await staff.post<SoDetail>(`/sales-orders/${so.body.id}/cancel`, {
        reason: 'Customer changed their mind',
      });
      expect(cancelled.body.status).toBe('CANCELLED');
      expect((await riceAt()).reserved).toBe(0);
    });

    it('cannot reserve more than is available', async () => {
      const res = await staff.post<ApiError>('/sales-orders', {
        customerId: fx.customer.id,
        warehouseId: fx.chn.id,
        channel: 'STORE',
        lines: [{ productId: fx.rice.id, quantity: 100_000 }],
        confirm: true,
      });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('INSUFFICIENT_STOCK');
      // The whole request is one transaction: no draft is left behind.
      expect(await ctx.prisma.salesOrder.count({ where: { lines: { some: { quantity: 100_000 } } } })).toBe(
        0,
      );
    });
  });

  describe('transfers', () => {
    it('moves batches with their expiry and cost to the other warehouse', async () => {
      const t = await staff.post<TransferDetail>('/transfers', {
        fromWarehouseId: fx.chn.id,
        toWarehouseId: fx.blr.id,
        lines: [{ productId: fx.milk.id, quantity: 12 }],
        ship: true,
      });
      expect(t.status).toBe(200);
      expect(t.body.status).toBe('IN_TRANSIT');
      expect((await milkAt('chn')).onHand).toBe(23);
      expect((await milkAt('blr')).onHand).toBe(0);

      const received = await staff.post<TransferDetail>(`/transfers/${t.body.id}/receive`);
      expect(received.body.status).toBe('RECEIVED');
      expect((await milkAt('blr')).onHand).toBe(12);
      // Batch C (expires first) goes before B.
      const blr = await ctx.prisma.batch.findMany({
        where: { productId: fx.milk.id, warehouseId: fx.blr.id },
        orderBy: { batchNo: 'asc' },
      });
      expect(blr.map((b) => [b.batchNo, b.quantity])).toEqual([
        ['B', 2],
        ['C', 10],
      ]);
      const source = await ctx.prisma.batch.findFirstOrThrow({
        where: { productId: fx.milk.id, warehouseId: fx.chn.id, batchNo: 'C' },
      });
      expect(blr[1]!.expiryDate?.toISOString()).toBe(source.expiryDate?.toISOString());
    });

    it('returns stock to the source when an in-transit transfer is cancelled', async () => {
      const t = await staff.post<TransferDetail>('/transfers', {
        fromWarehouseId: fx.chn.id,
        toWarehouseId: fx.blr.id,
        lines: [{ productId: fx.rice.id, quantity: 5 }],
        ship: true,
      });
      expect((await riceAt()).onHand).toBe(188);
      const cancelled = await staff.post<TransferDetail>(`/transfers/${t.body.id}/cancel`, {
        reason: 'Truck unavailable',
      });
      expect(cancelled.body.status).toBe('CANCELLED');
      expect((await riceAt()).onHand).toBe(193);
      expect((await riceAt('blr')).onHand).toBe(0);
    });
  });

  describe('cycle counts', () => {
    it('sends lines back for a recount, then posts the variance on approval', async () => {
      const created = await staff.post<CycleCountDetail>('/cycle-counts', {
        warehouseId: fx.chn.id,
        productIds: [fx.rice.id, fx.milk.id],
        reason: 'Monthly',
      });
      expect(created.status).toBe(200);
      const lines = created.body.lines;
      const riceLine = lines.find((l) => l.product.id === fx.rice.id)!;
      const milkLine = lines.find((l) => l.product.id === fx.milk.id)!;
      expect(riceLine.expectedQty).toBe(193);
      expect(milkLine.expectedQty).toBe(23);

      const count = (riceQty: number) =>
        staff.patch<CycleCountDetail>(`/cycle-counts/${created.body.id}/lines`, {
          lines: [
            { id: riceLine.id, countedQty: riceQty },
            { id: milkLine.id, countedQty: 23 },
          ],
        });
      const counted = await count(180);
      expect(counted.body.lines.find((l) => l.id === riceLine.id)).toMatchObject({ variance: -13 });
      expect(
        (await staff.post<CycleCountDetail>(`/cycle-counts/${created.body.id}/submit`)).body.status,
      ).toBe('IN_REVIEW');

      expect((await staff.post(`/cycle-counts/${created.body.id}/approve`, {})).status).toBe(403);
      const recount = await manager.post<CycleCountDetail>(`/cycle-counts/${created.body.id}/approve`, {
        recountLineIds: [riceLine.id],
      });
      expect(recount.body.status).toBe('OPEN');
      expect(recount.body.lines.find((l) => l.id === riceLine.id)?.status).toBe('RECOUNT');
      expect((await riceAt()).onHand).toBe(193);

      await count(190);
      await staff.post(`/cycle-counts/${created.body.id}/submit`);
      const approved = await manager.post<CycleCountDetail>(`/cycle-counts/${created.body.id}/approve`, {});
      expect(approved.body.status).toBe('COMPLETED');
      expect((await riceAt()).onHand).toBe(190);
      const correction = await ctx.prisma.stockMovement.findFirstOrThrow({
        where: { type: 'COUNT_CORRECTION', productId: fx.rice.id },
      });
      expect(correction).toMatchObject({ quantity: -3, balanceAfter: 190 });
    });
  });

  describe('alerts', () => {
    it('raises rule-based stock alerts and resolves them when the condition clears', async () => {
      // 23 of milk at CHN, reorder point 10: take it down to 6.
      await staff.post('/stock/issue', {
        warehouseId: fx.chn.id,
        reasonCodeId: fx.reasons.SAMPLE,
        lines: [{ productId: fx.milk.id, quantity: 17 }],
      });
      const check = await manager.post<{ created: number }>('/alerts/check');
      expect(check.status).toBe(200);
      expect(check.body.created).toBeGreaterThanOrEqual(1);

      const list = await staff.get<{ data: Alert[] }>(
        `/alerts?productId=${fx.milk.id}&warehouseId=${fx.chn.id}`,
      );
      const low = list.body.data.find((a) => a.type === 'LOW_STOCK');
      expect(low).toBeDefined();
      expect(low!.explanationSource).toBe('RULE');

      const again = await manager.post<{ created: number; updated: number }>('/alerts/check');
      expect(again.body).toMatchObject({ created: 0, updated: 0 });

      const ack = await staff.post<Alert>(`/alerts/${low!.id}/acknowledge`);
      expect(ack.body.status).toBe('ACKNOWLEDGED');

      await staff.post('/stock/receive', {
        warehouseId: fx.chn.id,
        lines: [
          { productId: fx.milk.id, quantity: 40, unitCost: '50', batchNo: 'D', expiryDate: dayFromNow(100) },
        ],
      });
      const cleared = await manager.post<{ resolved: number }>('/alerts/check');
      expect(cleared.body.resolved).toBeGreaterThanOrEqual(1);
      const after = await ctx.prisma.alert.findUniqueOrThrow({ where: { id: low!.id } });
      expect(after).toMatchObject({ status: 'RESOLVED', autoResolved: true });
    });

    it('lets only permitted roles run the check and read the audit log', async () => {
      expect((await staff.post('/alerts/check')).status).toBe(403);
      expect((await staff.get('/audit-log')).status).toBe(403);
      const audit = await manager.get<{ data: Array<{ action: string }> }>('/audit-log?limit=100');
      const actions = new Set(audit.body.data.map((a) => a.action));
      for (const a of [
        'stock.receive',
        'stock.issue',
        'stock.write_off',
        'po.submit',
        'po.reject',
        'po.receive',
        'so.fulfill',
        'transfer.receive',
        'count.approve',
      ]) {
        expect(actions, a).toContain(a);
      }
    });
  });

  it('keeps every ledger invariant', async () => {
    const results = await runLedgerChecks(ctx.prisma);
    expect(results.filter((r) => r.violations > 0)).toEqual([]);
  });
});
