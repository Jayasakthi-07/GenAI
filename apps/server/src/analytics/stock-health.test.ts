import { describe, expect, it } from 'vitest';
import { analyzeBatches, analyzePositions, type BatchInput, type PositionInput } from './stock-health';

const opts = { today: '2026-09-27', expiryWarningDays: 14, overstockDays: 180, overstockMinValue: 5000 };

const pos = (over: Partial<PositionInput>): PositionInput => ({
  productId: 'p1',
  sku: 'SKU-1',
  productName: 'Toor Dal 1 kg',
  unit: 'pack',
  warehouseId: 'w1',
  warehouseCode: 'CBE',
  onHand: 100,
  available: 100,
  onOrder: 0,
  reorderPoint: 40,
  maxStock: 120,
  avgDailyDemand: 10,
  leadTimeDays: 4,
  unitCost: 146,
  nextDelivery: null,
  ...over,
});

describe('analyzePositions', () => {
  it('reports nothing for a healthy position', () => {
    expect(analyzePositions([pos({})], opts)).toEqual([]);
  });

  it('flags out of stock as critical for a regular seller, and mentions an overdue PO', () => {
    const [f] = analyzePositions(
      [
        pos({
          onHand: 0,
          available: 0,
          onOrder: 60,
          nextDelivery: { number: 'PO-2026-00001', expectedDate: '2026-09-22' },
        }),
      ],
      opts,
    );
    expect(f?.type).toBe('OUT_OF_STOCK');
    expect(f?.severity).toBe('CRITICAL');
    expect(f?.message).toContain('5 day(s) overdue');
    expect(f?.dedupeKey).toBe('OUT_OF_STOCK:p1:w1');
  });

  it('counts reservations: stock on hand but fully reserved is out', () => {
    const [f] = analyzePositions([pos({ onHand: 12, available: 0 })], opts);
    expect(f?.type).toBe('OUT_OF_STOCK');
  });

  it('flags low stock, and escalates when cover is shorter than lead time', () => {
    const [medium] = analyzePositions([pos({ available: 38, onHand: 38, avgDailyDemand: 5 })], opts);
    expect(medium?.type).toBe('LOW_STOCK');
    expect(medium?.severity).toBe('MEDIUM');
    const [high] = analyzePositions([pos({ available: 30, onHand: 30, avgDailyDemand: 10 })], opts);
    expect(high?.severity).toBe('HIGH');
    expect(high?.explanation).toMatch(/run out before/);
  });

  it('does not call it low when enough is on order', () => {
    const findings = analyzePositions(
      [
        pos({
          available: 45,
          onHand: 45,
          onOrder: 80,
          avgDailyDemand: 5,
          nextDelivery: { number: 'PO-1', expectedDate: '2026-09-29' },
        }),
      ],
      opts,
    );
    expect(findings).toEqual([]);
  });

  it('projects a stockout when the covering delivery arrives too late', () => {
    const [f] = analyzePositions(
      [
        pos({
          available: 45,
          onHand: 45,
          onOrder: 200,
          reorderPoint: 40,
          avgDailyDemand: 30,
          nextDelivery: { number: 'PO-9', expectedDate: '2026-10-03' },
        }),
      ],
      opts,
    );
    expect(f?.type).toBe('PROJECTED_STOCKOUT');
    expect(f?.explanation).toMatch(/after stock runs out/);
  });

  it('flags overstock only when the excess is large and valuable', () => {
    const [f] = analyzePositions(
      [pos({ onHand: 600, available: 600, maxStock: 120, avgDailyDemand: 2 })],
      opts,
    );
    expect(f?.type).toBe('OVERSTOCK');
    expect(f?.data.excessUnits).toBe(480);
    expect(
      analyzePositions(
        [pos({ onHand: 600, available: 600, maxStock: 120, avgDailyDemand: 2, unitCost: 5 })],
        opts,
      ),
    ).toEqual([]);
  });

  it('ignores items that never sell and have no reorder point', () => {
    expect(
      analyzePositions([pos({ onHand: 0, available: 0, avgDailyDemand: 0, reorderPoint: null })], opts),
    ).toEqual([]);
  });

  it('orders priority by severity, then value', () => {
    const [critical] = analyzePositions([pos({ onHand: 0, available: 0 })], opts);
    const [medium] = analyzePositions([pos({ available: 38, onHand: 38, avgDailyDemand: 5 })], opts);
    expect(critical!.priority).toBeGreaterThan(medium!.priority);
    expect(critical!.priority).toBeLessThanOrEqual(100);
  });
});

describe('analyzeBatches', () => {
  const batch = (over: Partial<BatchInput>): BatchInput => ({
    batchId: 'b1',
    batchNo: 'B260915-CHN-101',
    productId: 'p2',
    sku: 'DAI-CHS-003',
    productName: 'Fresh Paneer 200 g',
    unit: 'pack',
    warehouseId: 'w2',
    warehouseCode: 'CHN',
    quantity: 60,
    expiryDate: '2026-09-29',
    unitCost: 82,
    avgDailyDemand: 6,
    ...over,
  });

  it('warns when stock will be left over at expiry', () => {
    const [f] = analyzeBatches([batch({})], opts);
    expect(f?.type).toBe('EXPIRING_BATCH');
    expect(f?.data.expectedToSell).toBe(12);
    expect(f?.data.atRiskUnits).toBe(48);
    expect(f?.severity).toBe('HIGH');
  });

  it('stays quiet when the batch will sell out in time', () => {
    expect(analyzeBatches([batch({ quantity: 10 })], opts)).toEqual([]);
  });

  it('flags expired stock still on hand', () => {
    const [f] = analyzeBatches([batch({ expiryDate: '2026-09-25' })], opts);
    expect(f?.title).toMatch(/^Expired stock/);
    expect(f?.data.atRiskUnits).toBe(60);
  });

  it('ignores batches beyond the warning window', () => {
    expect(analyzeBatches([batch({ expiryDate: '2026-11-30' })], opts)).toEqual([]);
  });
});
