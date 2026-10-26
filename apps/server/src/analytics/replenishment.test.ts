import { describe, expect, it } from 'vitest';
import {
  chooseSupplier,
  computePolicy,
  groupIntoOrders,
  type PlanItemInput,
  planItem,
  planReplenishment,
  roundToPack,
  type SupplierOption,
} from './replenishment';
import { inverseNormal, median, slope, stdDev } from './stats';

const opts = {
  serviceLevel: 0.95,
  orderCostInr: 500,
  holdingRate: 0.2,
  reviewPeriodDays: 7,
  budgetInr: 100_000,
  leadTimeCv: 0.15,
};

const supplier = (over: Partial<SupplierOption> = {}): SupplierOption => ({
  supplierId: 's1',
  supplierName: 'Acme',
  unitCost: 100,
  moq: 1,
  packSize: 1,
  leadTimeDays: 5,
  score: 80,
  isPreferred: false,
  isActive: true,
  ...over,
});

const item = (over: Partial<PlanItemInput> = {}): PlanItemInput => ({
  productId: 'p1',
  sku: 'SKU-1',
  name: 'Toor Dal 1 kg',
  unit: 'pack',
  warehouseId: 'w1',
  warehouseCode: 'BLR',
  available: 20,
  onOrder: 0,
  reorderPoint: null,
  maxStock: null,
  demandMean: 10,
  demandStd: 3,
  demandSource: 'history',
  leadTimeDays: 7,
  unitCost: 100,
  suppliers: [supplier()],
  ...over,
});

describe('stats', () => {
  it('inverts the normal CDF', () => {
    expect(inverseNormal(0.5)).toBeCloseTo(0, 8);
    expect(inverseNormal(0.95)).toBeCloseTo(1.6449, 4);
    expect(inverseNormal(0.99)).toBeCloseTo(2.3263, 4);
    expect(inverseNormal(0.01)).toBeCloseTo(-2.3263, 4);
    expect(() => inverseNormal(1)).toThrow();
  });

  it('computes spread, median and trend', () => {
    expect(stdDev([2, 4, 4, 4, 5, 5, 7, 9])).toBe(2);
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(slope([1, 2, 3, 4])).toBeCloseTo(1);
  });
});

describe('computePolicy', () => {
  it('applies the safety stock, reorder point and EOQ formulas', () => {
    const p = computePolicy(10, 3, 5, 100, opts);
    // SS = 1.645 · √(5·9 + 100·0.5625) = 1.645 · √101.25 ≈ 16.55 → 17
    expect(p.safetyStock).toBe(17);
    expect(p.reorderPoint).toBe(67);
    expect(p.orderUpTo).toBe(137);
    // EOQ = √(2·3650·500 / 20) ≈ 427.2 → 428
    expect(p.eoq).toBe(428);
  });

  it('has no EOQ without demand', () => {
    expect(computePolicy(0, 0, 5, 100, opts).eoq).toBe(0);
  });
});

describe('roundToPack', () => {
  it('rounds up to packs and respects the MOQ', () => {
    expect(roundToPack(13, 1, 6)).toBe(18);
    expect(roundToPack(5, 24, 12)).toBe(24);
    expect(roundToPack(0, 1, 1)).toBe(1);
  });
});

describe('chooseSupplier', () => {
  it('weighs cost, lead time and score', () => {
    const cheapSlow = supplier({ supplierId: 'cheap', unitCost: 90, leadTimeDays: 14, score: 70 });
    const fairFast = supplier({ supplierId: 'fast', unitCost: 95, leadTimeDays: 3, score: 85 });
    expect(chooseSupplier([cheapSlow, fairFast])?.option.supplierId).toBe('fast');
  });

  it('ignores inactive suppliers', () => {
    expect(chooseSupplier([supplier({ isActive: false })])).toBeNull();
    expect(
      chooseSupplier([supplier({ isActive: false }), supplier({ supplierId: 's2' })])?.option.supplierId,
    ).toBe('s2');
  });
});

describe('planItem', () => {
  it('skips items above the trigger point', () => {
    expect(planItem(item({ available: 200 }), opts)).toBeNull();
  });

  it('orders the larger of EOQ and the order-up-to gap', () => {
    const line = planItem(item(), opts);
    expect(line).not.toBeNull();
    expect(line?.quantity).toBe(428);
    expect(line?.urgent).toBe(true); // 2 days of cover vs 5-day lead time
    expect(line?.supplierId).toBe('s1');
  });

  it('counts stock on order in the position', () => {
    expect(planItem(item({ onOrder: 100 }), opts)).toBeNull();
  });

  it('caps at max stock and flags it', () => {
    const line = planItem(item({ maxStock: 150 }), opts);
    expect(line?.quantity).toBe(130);
    expect(line?.flags.join(' ')).toMatch(/max stock/);
  });

  it('flags MOQ that forces a much larger order', () => {
    const line = planItem(
      item({ demandMean: 1, demandStd: 0, available: 2, maxStock: 10, suppliers: [supplier({ moq: 100 })] }),
      opts,
    );
    expect(line?.quantity).toBe(100);
    expect(line?.flags.join(' ')).toMatch(/MOQ/);
  });

  it('never orders speculatively without demand or a configured reorder point', () => {
    expect(planItem(item({ demandMean: 0, demandStd: 0, available: 0 }), opts)).toBeNull();
    const restore = planItem(item({ demandMean: 0, demandStd: 0, available: 0, reorderPoint: 10 }), opts);
    expect(restore?.quantity).toBe(10);
  });
});

describe('planReplenishment', () => {
  it('fills by priority up to the budget, letting urgent lines exceed it by 10 % at most', () => {
    const items = [
      item({ productId: 'a', available: 0 }), // urgent, 428 × 100 = 42,800
      item({ productId: 'b', available: 30 }), // urgent
      item({ productId: 'c', available: 30, demandMean: 5 }), // below ROP 38, 6 days of cover: not urgent
    ];
    const plan = planReplenishment(items, { ...opts, budgetInr: 60_000 });
    expect(plan.lines.map((l) => l.productId)).toEqual(['a']);
    expect(plan.deferred.length).toBe(2);
    expect(plan.totals.value).toBeLessThanOrEqual(66_000);
  });

  it('puts items without an active supplier in blocked', () => {
    const plan = planReplenishment([item({ suppliers: [] })], opts);
    expect(plan.blocked.length).toBe(1);
    expect(plan.lines.length).toBe(0);
  });

  it('groups lines into one order per supplier and warehouse', () => {
    const plan = planReplenishment(
      [
        item({ productId: 'a' }),
        item({ productId: 'b' }),
        item({ productId: 'c', suppliers: [supplier({ supplierId: 's2' })] }),
      ],
      { ...opts, budgetInr: 0 },
    );
    const orders = groupIntoOrders(plan.lines);
    expect(orders.length).toBe(2);
    expect(orders.find((o) => o.supplierId === 's1')?.lines.length).toBe(2);
  });
});
