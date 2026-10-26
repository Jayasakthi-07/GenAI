import { describe, expect, it } from 'vitest';
import {
  type Adjustment,
  costJumps,
  countVariances,
  type DemandSeries,
  demandSpikes,
  receiptMismatches,
  repeatedLosses,
  robustZ,
} from './anomalies';

const days = (n: number, end = '2026-10-25') =>
  Array.from({ length: n }, (_, i) => {
    const d = new Date(`${end}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - (n - 1 - i));
    return d.toISOString().slice(0, 10);
  });

describe('robustZ', () => {
  it('measures distance in MAD units', () => {
    const base = [10, 11, 9, 10, 12, 8, 10, 11, 9, 10];
    expect(robustZ(base, 10)).toBe(0);
    expect(robustZ(base, 30)).toBeGreaterThan(3.5);
    expect(robustZ([1, 2], 50)).toBeNull();
  });
});

describe('demandSpikes', () => {
  const series = (last: number): DemandSeries => {
    const daily = Array.from({ length: 70 }, (_, i) => 10 + (i % 3));
    daily[69] = last;
    return {
      productId: 'p',
      sku: 'S',
      name: 'Bhujia',
      warehouseId: 'w',
      warehouseCode: 'CHN',
      daily,
      dates: days(70),
    };
  };
  it('flags a recent day far above the baseline', () => {
    const [spike] = demandSpikes([series(66)]);
    expect(spike?.type).toBe('DEMAND_SPIKE');
    expect(spike?.data).toMatchObject({ units: 66, date: '2026-10-25' });
  });
  it('ignores normal variation', () => {
    expect(demandSpikes([series(13)])).toEqual([]);
  });
});

describe('repeatedLosses', () => {
  const adj = (date: string, quantity: number): Adjustment => ({
    productId: 'p',
    sku: 'S',
    name: 'Cashews',
    warehouseId: 'w',
    warehouseCode: 'HYD',
    date,
    quantity,
    reason: 'SHRINKAGE',
    unitCost: 300,
  });
  it('needs three losses inside the window', () => {
    expect(repeatedLosses([adj('2026-10-20', -2), adj('2026-10-22', -3)], '2026-10-25')).toEqual([]);
    const [f] = repeatedLosses(
      [adj('2026-10-14', -4), adj('2026-10-17', -6), adj('2026-10-20', -3), adj('2026-10-23', 5)],
      '2026-10-25',
    );
    expect(f).toMatchObject({ kind: 'shrinkage', countSuggested: true, data: { events: 3, units: 13 } });
  });
});

describe('countVariances', () => {
  it('flags large shares or values only', () => {
    const line = (expected: number, counted: number, unitCost = 100) => ({
      cycleCountId: 'c',
      countNumber: 'CC-1',
      productId: `p${expected}${counted}`,
      sku: 'S',
      name: 'Cardamom',
      warehouseId: 'w',
      warehouseCode: 'HYD',
      expected,
      counted,
      unitCost,
      date: '2026-10-20',
    });
    const found = countVariances([line(100, 86), line(100, 98), line(50, 50), line(10, 9, 2000)]);
    expect(found.map((f) => f.data.variance)).toEqual([-14, -1]);
  });
});

describe('receiptMismatches', () => {
  const base = {
    receiptNumber: 'GRN-1',
    poNumber: 'PO-1',
    supplierId: 's',
    supplierName: 'Malabar Spice Traders',
    productId: 'p',
    sku: 'S',
    name: 'Cardamom',
    warehouseId: 'w',
    warehouseCode: 'CHN',
    date: '2026-10-22',
    poStatus: 'PARTIALLY_RECEIVED',
    poExpectedDate: '2026-10-20',
  };
  it('catches price differences and POs closed short', () => {
    const found = receiptMismatches([
      {
        ...base,
        ordered: 120,
        receivedToDate: 80,
        received: 80,
        poUnitCost: 100,
        receivedUnitCost: 112,
        poStatus: 'CLOSED',
      },
      {
        ...base,
        productId: 'q',
        ordered: 100,
        receivedToDate: 100,
        received: 100,
        poUnitCost: 50,
        receivedUnitCost: 51,
      },
    ]);
    expect(found.map((f) => f.kind)).toEqual(['receipt_price', 'receipt_short']);
    expect(found[0]?.data).toMatchObject({ extra: 960 });
  });

  it('treats a partial delivery on an open PO as normal', () => {
    const found = receiptMismatches([
      { ...base, ordered: 120, receivedToDate: 80, received: 80, poUnitCost: 100, receivedUnitCost: 100 },
    ]);
    expect(found).toEqual([]);
  });
});

describe('costJumps', () => {
  it('compares the latest cost with the recent median', () => {
    const point = (date: string, unitCost: number) => ({
      productId: 'p',
      sku: 'S',
      name: 'Pepper',
      supplierId: 's',
      supplierName: 'MST',
      date,
      unitCost,
    });
    const found = costJumps(
      [point('2026-08-01', 100), point('2026-09-01', 101), point('2026-09-20', 99), point('2026-10-20', 118)],
      '2026-10-25',
    );
    expect(found).toHaveLength(1);
    expect(found[0]?.data.change).toBeCloseTo(0.18, 2);
    expect(costJumps([point('2026-09-01', 100), point('2026-10-20', 104)], '2026-10-25')).toEqual([]);
  });
});
