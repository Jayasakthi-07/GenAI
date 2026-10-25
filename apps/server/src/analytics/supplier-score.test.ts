import { describe, expect, it } from 'vitest';
import { type PoRecord, scoreSupplier } from './supplier-score';

const today = '2026-09-27';

function po(
  i: number,
  opts: {
    orderDate: string;
    expected: string;
    received?: string | null;
    fill?: number;
    rejected?: number;
    cost?: number;
    status?: string;
  },
): PoRecord {
  const ordered = 100;
  const got = opts.received === null ? 0 : Math.round(ordered * (opts.fill ?? 1));
  const rej = opts.rejected ?? 0;
  return {
    id: `po${i}`,
    number: `PO-${i}`,
    orderDate: opts.orderDate,
    expectedDate: opts.expected,
    status: opts.status ?? (opts.received === null ? 'SENT' : 'CLOSED'),
    lines: [{ productId: 'p1', ordered, received: got - rej, rejected: rej, unitCost: opts.cost ?? 100 }],
    receipts:
      opts.received === null
        ? []
        : [
            {
              number: `GRN-${i}`,
              receivedDate: opts.received ?? opts.expected,
              received: got - rej,
              rejected: rej,
            },
          ],
  };
}

const d = (offset: number) => {
  const x = new Date(`${today}T00:00:00Z`);
  x.setUTCDate(x.getUTCDate() + offset);
  return x.toISOString().slice(0, 10);
};

describe('scoreSupplier', () => {
  it('scores a reliable supplier near 100 with low risk', () => {
    const pos = Array.from({ length: 20 }, (_, i) =>
      po(i, { orderDate: d(-150 + i * 7), expected: d(-146 + i * 7), received: d(-146 + i * 7) }),
    );
    const s = scoreSupplier(pos, today);
    expect(s.metrics.onTimeRate).toBe(1);
    expect(s.metrics.fillRate).toBe(1);
    expect(s.score).toBeGreaterThanOrEqual(95);
    expect(s.riskLevel).toBe('LOW');
    expect(s.flags).toEqual([]);
  });

  it('counts overdue open orders as late and flags a recent drop in reliability', () => {
    const early = Array.from({ length: 12 }, (_, i) =>
      po(i, { orderDate: d(-170 + i * 8), expected: d(-166 + i * 8), received: d(-166 + i * 8) }),
    );
    const recent = Array.from({ length: 5 }, (_, i) =>
      po(100 + i, { orderDate: d(-50 + i * 8), expected: d(-46 + i * 8), received: d(-38 + i * 8) }),
    );
    const overdue = [po(200, { orderDate: d(-10), expected: d(-5), received: null })];
    const s = scoreSupplier([...early, ...recent, ...overdue], today);
    expect(s.metrics.overdue).toBe(1);
    expect(s.flags.some((f) => f.startsWith('On-time delivery fell'))).toBe(true);
    expect(s.flags.some((f) => f.includes('overdue'))).toBe(true);
    expect(s.riskLevel).toBe('HIGH');
  });

  it('penalises short deliveries, rejections and price rises', () => {
    const pos = Array.from({ length: 12 }, (_, i) =>
      po(i, {
        orderDate: d(-170 + i * 14),
        expected: d(-165 + i * 14),
        received: d(-165 + i * 14),
        fill: 0.8,
        rejected: 4,
        cost: i >= 6 ? 118 : 100,
      }),
    );
    const s = scoreSupplier(pos, today);
    expect(s.metrics.fillRate).toBeCloseTo(0.8);
    expect(s.breakdown.fill).toBeLessThan(40);
    expect(s.metrics.priceChange).toBeCloseTo(0.18, 2);
    expect(s.breakdown.price).toBeLessThan(20);
    expect(s.flags.some((f) => f.includes('Unit costs up'))).toBe(true);
    expect(s.flags.some((f) => f.includes('rejected'))).toBe(true);
  });

  it('returns no score without enough history', () => {
    const s = scoreSupplier([], today);
    expect(s.score).toBeNull();
    expect(s.riskLevel).toBeNull();
  });

  it('ignores drafts and cancelled orders', () => {
    const pos = [
      po(1, { orderDate: d(-30), expected: d(-25), received: d(-25) }),
      { ...po(2, { orderDate: d(-20), expected: d(-15), received: null }), status: 'DRAFT' },
      { ...po(3, { orderDate: d(-20), expected: d(-15), received: null }), status: 'CANCELLED' },
    ];
    expect(scoreSupplier(pos, today).metrics.orders).toBe(1);
  });
});
