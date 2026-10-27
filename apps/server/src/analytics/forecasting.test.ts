import { describe, expect, it } from 'vitest';
import {
  backtest,
  classifyDemand,
  crostonSba,
  fitHoltWinters,
  forecastSeries,
  forecastShift,
  holtWinters,
  movingAverage,
  ses,
  sumForecasts,
} from './forecasting';

/** Deterministic weekly pattern: weekends sell double. */
const weekly = (weeks: number, base = 10) =>
  Array.from({ length: weeks * 7 }, (_, i) => (i % 7 >= 5 ? base * 2 : base));
/** Sparse demand every ~4 days with varying size. */
const sparse = (days: number) => Array.from({ length: days }, (_, i) => (i % 4 === 0 ? 3 + (i % 3) : 0));

describe('classifyDemand', () => {
  it('follows the Syntetos–Boylan quadrants', () => {
    expect(classifyDemand(weekly(8)).pattern).toBe('SMOOTH');
    expect(classifyDemand(sparse(60)).pattern).toBe('INTERMITTENT');
    expect(classifyDemand([0, 0, 50, 0, 0, 1, 0, 0, 90, 0, 0, 2]).pattern).toBe('LUMPY');
    expect(classifyDemand([1, 40, 2, 60, 1, 55, 3, 70]).pattern).toBe('ERRATIC');
    expect(classifyDemand([0, 0, 0]).pattern).toBe('LUMPY');
  });
});

describe('simple methods', () => {
  it('moving average and SES converge on a flat series', () => {
    const flat = Array.from({ length: 30 }, () => 5);
    expect(movingAverage(flat, 7).forecast(3)).toEqual([5, 5, 5]);
    expect(ses(flat, 0.3).forecast(2)[0]).toBeCloseTo(5);
  });

  it('Croston-SBA forecasts the deflated demand rate', () => {
    const series = Array.from({ length: 40 }, (_, i) => (i % 4 === 0 ? 8 : 0));
    const rate = crostonSba(series, 0.1).forecast(1)[0] ?? 0;
    // True rate is 2/day; SBA deflates by (1 − α/2) = 0.95.
    expect(rate).toBeGreaterThan(1.7);
    expect(rate).toBeLessThan(2.05);
  });
});

describe('Holt-Winters', () => {
  it('learns weekly seasonality', () => {
    const series = weekly(12);
    const f = fitHoltWinters(series).forecast(7);
    // The series ends on day index 83 (a Sunday-like slot), so the next 5 days are weekdays.
    const weekdays = f.slice(0, 5);
    const weekend = f.slice(5, 7);
    expect(Math.min(...weekend)).toBeGreaterThan(Math.max(...weekdays));
    expect(weekdays.every((x) => Math.abs(x - 10) < 1.5)).toBe(true);
  });

  it('damps the trend', () => {
    const trending = Array.from({ length: 70 }, (_, i) => 10 + i * 0.5);
    const strong = holtWinters(trending, { alpha: 0.3, beta: 0.1, gamma: 0.05, phi: 0.8 }).forecast(60);
    const growth = (strong[59] ?? 0) - (strong[29] ?? 0);
    expect(growth).toBeLessThan(5);
  });
});

describe('forecastSeries', () => {
  it('chooses a method by history and pattern, with bands that widen', () => {
    const smooth = forecastSeries(weekly(20));
    expect(['HOLT_WINTERS', 'SES']).toContain(smooth.method);
    expect(smooth.points).toHaveLength(28);
    expect(smooth.wape).not.toBeNull();
    const first = smooth.points[0];
    const last = smooth.points[27];
    expect(first && last && last.hi95 - last.lo95 >= first.hi95 - first.lo95).toBe(true);

    expect(forecastSeries(sparse(120)).method).toBe('CROSTON_SBA');
    expect(forecastSeries(weekly(4)).method).toBe('MOVING_AVERAGE');
  });

  it('is accurate on a clean seasonal series', () => {
    expect(backtest(weekly(20), fitHoltWinters).wape).toBeLessThan(10);
    const r = forecastSeries(weekly(20));
    expect(r.avgDailyDemand).toBeGreaterThan(12);
    expect(r.avgDailyDemand).toBeLessThan(16);
  });

  it('never forecasts below zero', () => {
    const falling = Array.from({ length: 90 }, (_, i) => Math.max(0, 30 - i));
    expect(forecastSeries(falling).points.every((p) => p.yhat >= 0 && p.lo95 >= 0)).toBe(true);
  });
});

describe('forecastShift', () => {
  it('reports relative change and ignores negligible demand', () => {
    expect(forecastShift(10, 15)).toBe(0.5);
    expect(forecastShift(0.2, 0.5)).toBeNull();
    expect(forecastShift(0, 5)).toBeNull();
  });
});

describe('sumForecasts', () => {
  it('adds means and combines bands in quadrature', () => {
    const a = { points: [{ yhat: 10, lo80: 6, hi80: 14 }] };
    const b = { points: [{ yhat: 20, lo80: 17, hi80: 23 }] };
    const [s] = sumForecasts([a, b], 1);
    expect(s!.yhat).toBe(30);
    // sqrt(4² + 3²) = 5, narrower than the 7 you'd get by adding the edges.
    expect(s!.lo80).toBe(25);
    expect(s!.hi80).toBe(35);
  });

  it('scales by weight, keeps asymmetric bands and never goes below zero', () => {
    const [s] = sumForecasts([{ points: [{ yhat: 1, lo80: 0, hi80: 4 }], weight: 0.5 }], 1);
    expect(s).toEqual({ yhat: 0.5, lo80: 0, hi80: 2 });
  });

  it('pads short forecasts with zeros up to the horizon', () => {
    const out = sumForecasts([{ points: [{ yhat: 2, lo80: 1, hi80: 3 }] }], 3);
    expect(out).toHaveLength(3);
    expect(out[2]).toEqual({ yhat: 0, lo80: 0, hi80: 0 });
  });
});
