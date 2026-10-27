import { describe, expect, it } from 'vitest';
import { arrivalSeconds, demandMultiplier, tickDemand } from './scenarios';

describe('demandMultiplier', () => {
  it('is neutral without a scenario or after it ends', () => {
    expect(demandMultiplier(null, 'Beverages')).toBe(1);
    expect(demandMultiplier({ key: 'festive_rush', hoursLeft: 0, detail: '' }, 'Snacks & Sweets')).toBe(1);
  });

  it('lifts festive categories most during a festive rush', () => {
    const s = { key: 'festive_rush', hoursLeft: 10, detail: '' } as const;
    expect(demandMultiplier(s, 'Snacks & Sweets')).toBe(4);
    expect(demandMultiplier(s, 'Beverages')).toBe(1.8);
  });

  it('cuts only the chosen category in a demand drop', () => {
    const s = { key: 'demand_drop', hoursLeft: 10, detail: '', category: 'Beverages' } as const;
    expect(demandMultiplier(s, 'Beverages')).toBeCloseTo(1 / 3);
    expect(demandMultiplier(s, 'Home Care')).toBe(1);
  });
});

describe('tickDemand', () => {
  it('scales the daily rate to the tick and caps at what is available', () => {
    const lambdas: number[] = [];
    const echo = (l: number) => (lambdas.push(l), Math.round(l));
    expect(tickDemand(48, 6, 1, 100, echo)).toBe(12);
    expect(lambdas[0]).toBe(12);
    expect(tickDemand(48, 6, 4, 20, echo)).toBe(20);
  });

  it('sells nothing without demand or stock', () => {
    const never = () => {
      throw new Error('not drawn');
    };
    expect(tickDemand(0, 6, 1, 10, never)).toBe(0);
    expect(tickDemand(5, 6, 1, 0, never)).toBe(0);
  });
});

describe('arrivalSeconds', () => {
  it('turns lead days into real seconds at the simulator speed', () => {
    // 4 simulated hours per 5 s tick: one simulated day is 30 s.
    expect(arrivalSeconds(3, 4, 5)).toBe(90);
    expect(arrivalSeconds(0, 4, 5)).toBe(30);
  });
});
