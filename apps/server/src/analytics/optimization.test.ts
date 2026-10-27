import { describe, expect, it } from 'vitest';
import {
  abcClassify,
  deadAndSlow,
  rebalancing,
  reorderDrift,
  type StockLine,
  xyzClassify,
} from './optimization';

const line = (over: Partial<StockLine>): StockLine => ({
  productId: 'p',
  sku: 'S',
  name: 'Lotion',
  warehouseId: 'w1',
  warehouseCode: 'CBE',
  onHand: 100,
  available: 100,
  unitCost: 100,
  sellingPrice: 160,
  costPrice: 100,
  avgDaily: 1,
  daysSinceSale: 2,
  leadTimeDays: 5,
  configuredRop: null,
  computedRop: null,
  safetyStock: null,
  maxStock: null,
  ...over,
});

describe('abcClassify', () => {
  it('splits by cumulative value share', () => {
    const r = abcClassify([
      { id: 'a', value: 700 },
      { id: 'b', value: 150 },
      { id: 'c', value: 100 },
      { id: 'd', value: 50 },
      { id: 'e', value: 0 },
    ]);
    expect([...'abcde'].map((k) => r.get(k))).toEqual(['A', 'A', 'B', 'C', 'C']);
  });
});

describe('xyzClassify', () => {
  it('uses the coefficient of variation of weekly demand', () => {
    expect(xyzClassify([10, 11, 9, 10])).toBe('X');
    expect(xyzClassify([2, 10, 4, 12])).toBe('Y');
    expect(xyzClassify([0, 0, 30, 0])).toBe('Z');
    expect(xyzClassify([0, 0, 0])).toBe('Z');
  });
});

describe('deadAndSlow', () => {
  it('finds dead and slow stock and suggests a markdown above cost', () => {
    const out = deadAndSlow([
      line({ productId: 'dead', daysSinceSale: 120, avgDaily: 0 }),
      line({ productId: 'slow', avgDaily: 0.4 }),
      line({ productId: 'fine', avgDaily: 5 }),
      line({ productId: 'tiny', daysSinceSale: 200, onHand: 5, available: 5 }),
    ]);
    expect(out.map((o) => [o.line.productId, o.kind])).toEqual([
      ['dead', 'dead'],
      ['slow', 'slow'],
    ]);
    expect(out[0]?.markdownPrice).toBe(130);
    expect(out[0]?.markdownPrice).toBeGreaterThanOrEqual(100);
  });
});

describe('rebalancing', () => {
  it('moves excess to a warehouse about to run out, keeping the source at target', () => {
    const [move] = rebalancing([
      line({ warehouseId: 'w1', warehouseCode: 'CHN', available: 400, onHand: 400, avgDaily: 2 }),
      line({ warehouseId: 'w2', warehouseCode: 'MDU', available: 4, onHand: 4, avgDaily: 3 }),
    ]);
    expect(move).toMatchObject({ fromCode: 'CHN', toCode: 'MDU', quantity: 86 });
    expect(move?.fromCoverAfter).toBeGreaterThanOrEqual(30);
  });
  it('does nothing without both excess and shortage', () => {
    expect(rebalancing([line({ warehouseId: 'w1' }), line({ warehouseId: 'w2' })])).toEqual([]);
  });
});

describe('reorderDrift', () => {
  it('flags settings far from the computed reorder point', () => {
    const out = reorderDrift([
      line({ productId: 'a', configuredRop: 40, computedRop: 90 }),
      line({ productId: 'b', configuredRop: 40, computedRop: 44 }),
    ]);
    expect(out.map((d) => d.line.productId)).toEqual(['a']);
  });
});
