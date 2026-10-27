/**
 * Demand forecasting (pure). The Demand Forecaster's numbers.
 *
 *   pattern    Syntetos–Boylan: ADI (average interval between demands) vs 1.32, CV² of non-zero sizes vs 0.49
 *   smooth / erratic   → damped Holt-Winters (additive, weekly season m = 7) or SES, whichever backtests better
 *   intermittent/lumpy → Croston with the Syntetos–Boylan correction: (1 − α/2) · z / p
 *   < 56 days          → 28-day moving average
 *   accuracy   28-day holdout: MAPE on days with demand, WAPE = Σ|e| / Σ actual
 *   bands      ŷ ± z·σ·√h, σ = std of one-step residuals, z = 1.2816 (80 %) / 1.96 (95 %)
 */
import { mean, round, stdDev, sum } from './stats';

export type DemandPattern = 'SMOOTH' | 'ERRATIC' | 'INTERMITTENT' | 'LUMPY';
export type ForecastMethod = 'HOLT_WINTERS' | 'CROSTON_SBA' | 'SES' | 'MOVING_AVERAGE';

export interface ForecastPoint {
  h: number;
  yhat: number;
  lo80: number;
  hi80: number;
  lo95: number;
  hi95: number;
}

export interface ForecastResult {
  method: ForecastMethod;
  pattern: DemandPattern;
  params: Record<string, number>;
  points: ForecastPoint[];
  /** Mean of the forecast horizon, per day. */
  avgDailyDemand: number;
  /** One-step residual spread, per day. */
  demandStdDev: number;
  mape: number | null;
  wape: number | null;
  historyDays: number;
}

const ADI_CUT = 1.32;
const CV2_CUT = 0.49;
const SEASON = 7;
const MIN_HW_DAYS = 56;

export function classifyDemand(series: readonly number[]): {
  pattern: DemandPattern;
  adi: number;
  cv2: number;
} {
  const nonZero = series.filter((x) => x > 0);
  if (!nonZero.length) return { pattern: 'LUMPY', adi: Infinity, cv2: 0 };
  const adi = series.length / nonZero.length;
  const m = mean(nonZero);
  const cv2 = m > 0 ? (stdDev(nonZero) / m) ** 2 : 0;
  const pattern: DemandPattern =
    adi < ADI_CUT ? (cv2 < CV2_CUT ? 'SMOOTH' : 'ERRATIC') : cv2 < CV2_CUT ? 'INTERMITTENT' : 'LUMPY';
  return { pattern, adi: round(adi, 3), cv2: round(cv2, 3) };
}

/** A fitted model: one-step-ahead fitted values for the history, and a forecast function. */
interface Fit {
  fitted: number[];
  forecast: (h: number) => number[];
  params: Record<string, number>;
}

export function movingAverage(series: readonly number[], window = 28): Fit {
  const fitted = series.map((_, i) =>
    i === 0 ? (series[0] ?? 0) : mean(series.slice(Math.max(0, i - window), i)),
  );
  const level = mean(series.slice(-window));
  return { fitted, forecast: (h) => Array.from({ length: h }, () => level), params: { window } };
}

export function ses(series: readonly number[], alpha: number): Fit {
  let level = series[0] ?? 0;
  const fitted: number[] = [];
  for (const y of series) {
    fitted.push(level);
    level = alpha * y + (1 - alpha) * level;
  }
  return { fitted, forecast: (h) => Array.from({ length: h }, () => level), params: { alpha } };
}

/** Additive Holt-Winters with a damped trend. Needs at least two seasons. */
export function holtWinters(
  series: readonly number[],
  p: { alpha: number; beta: number; gamma: number; phi: number },
  m = SEASON,
): Fit {
  const { alpha, beta, gamma, phi } = p;
  const first = series.slice(0, m);
  const second = series.slice(m, 2 * m);
  let level = mean(first);
  let trend = (mean(second) - mean(first)) / m;
  const season = first.map((y) => y - level);
  const fitted: number[] = [];
  for (let t = 0; t < series.length; t++) {
    const y = series[t] ?? 0;
    const s = season[t % m] ?? 0;
    fitted.push(level + phi * trend + s);
    const prevLevel = level;
    level = alpha * (y - s) + (1 - alpha) * (level + phi * trend);
    trend = beta * (level - prevLevel) + (1 - beta) * phi * trend;
    season[t % m] = gamma * (y - level) + (1 - gamma) * s;
  }
  const n = series.length;
  return {
    fitted,
    forecast: (h) => {
      const out: number[] = [];
      let damp = 0;
      for (let k = 1; k <= h; k++) {
        damp += phi ** k;
        out.push(level + damp * trend + (season[(n + k - 1) % m] ?? 0));
      }
      return out;
    },
    params: { alpha, beta, gamma, phi, seasonLength: m },
  };
}

/** Croston's method with the Syntetos–Boylan bias correction. */
export function crostonSba(series: readonly number[], alpha = 0.1): Fit {
  // Start from the series' own averages; starting at the first observation biases short series.
  const nonZero = series.filter((x) => x > 0);
  let size: number | null = nonZero.length ? mean(nonZero) : null;
  let interval: number | null = nonZero.length ? series.length / nonZero.length : null;
  let since = 1;
  const rate = () =>
    size !== null && interval !== null && interval > 0 ? (1 - alpha / 2) * (size / interval) : 0;
  const fitted: number[] = [];
  for (const y of series) {
    fitted.push(rate());
    if (y > 0) {
      size = size === null ? y : alpha * y + (1 - alpha) * size;
      interval = interval === null ? since : alpha * since + (1 - alpha) * interval;
      since = 1;
    } else {
      since++;
    }
  }
  const r = rate();
  return { fitted, forecast: (h) => Array.from({ length: h }, () => r), params: { alpha } };
}

const sse = (series: readonly number[], fitted: number[], skip: number) => {
  let s = 0;
  for (let i = skip; i < series.length; i++) s += ((series[i] ?? 0) - (fitted[i] ?? 0)) ** 2;
  return s;
};

const HW_GRID = (() => {
  const grid: Array<{ alpha: number; beta: number; gamma: number; phi: number }> = [];
  for (const alpha of [0.05, 0.1, 0.2, 0.3, 0.5])
    for (const beta of [0.01, 0.05, 0.1])
      for (const gamma of [0.05, 0.1, 0.2, 0.3])
        for (const phi of [0.9, 0.95, 0.98]) grid.push({ alpha, beta, gamma, phi });
  return grid;
})();

/** Holt-Winters parameters by grid search on one-step SSE (after a warm-up season). */
export function fitHoltWinters(series: readonly number[]): Fit {
  let best: Fit | null = null;
  let bestErr = Infinity;
  for (const p of HW_GRID) {
    const f = holtWinters(series, p);
    const e = sse(series, f.fitted, 2 * SEASON);
    if (e < bestErr) {
      bestErr = e;
      best = f;
    }
  }
  return best ?? holtWinters(series, { alpha: 0.2, beta: 0.05, gamma: 0.1, phi: 0.95 });
}

export function fitSes(series: readonly number[]): Fit {
  let best: Fit | null = null;
  let bestErr = Infinity;
  for (const alpha of [0.05, 0.1, 0.2, 0.3, 0.5, 0.7]) {
    const f = ses(series, alpha);
    const e = sse(series, f.fitted, SEASON);
    if (e < bestErr) {
      bestErr = e;
      best = f;
    }
  }
  return best ?? ses(series, 0.2);
}

/** Accuracy on the last `holdout` days, fitting only on what came before. */
export function backtest(
  series: readonly number[],
  fit: (train: readonly number[]) => Fit,
  holdout = 28,
): { mape: number | null; wape: number | null } {
  if (series.length < holdout * 2) return { mape: null, wape: null };
  const train = series.slice(0, -holdout);
  const actual = series.slice(-holdout);
  const predicted = fit(train)
    .forecast(holdout)
    .map((x) => Math.max(0, x));
  const absErr = actual.map((a, i) => Math.abs(a - (predicted[i] ?? 0)));
  const pct = actual.flatMap((a, i) => (a > 0 ? [Math.abs(a - (predicted[i] ?? 0)) / a] : []));
  const totalActual = sum(actual);
  return {
    mape: pct.length ? round(mean(pct) * 100, 2) : null,
    wape: totalActual > 0 ? round((sum(absErr) / totalActual) * 100, 2) : null,
  };
}

/** Picks the method for the series, forecasts `horizon` days with bands, and backtests it. */
export function forecastSeries(series: readonly number[], horizon = 28): ForecastResult {
  const { pattern, adi, cv2 } = classifyDemand(series);
  let method: ForecastMethod;
  let fitter: (s: readonly number[]) => Fit;
  let accuracy: { mape: number | null; wape: number | null } | null = null;
  if (series.length < MIN_HW_DAYS) {
    method = 'MOVING_AVERAGE';
    fitter = (s) => movingAverage(s, Math.min(28, Math.max(1, s.length)));
  } else if (pattern === 'INTERMITTENT' || pattern === 'LUMPY') {
    method = 'CROSTON_SBA';
    fitter = (s) => crostonSba(s);
  } else {
    // Smooth or erratic: keep whichever of Holt-Winters and SES backtests better.
    const hw = backtest(series, fitHoltWinters);
    const s = backtest(series, fitSes);
    const useSes = (s.wape ?? Infinity) < (hw.wape ?? Infinity);
    method = useSes ? 'SES' : 'HOLT_WINTERS';
    fitter = useSes ? fitSes : fitHoltWinters;
    accuracy = useSes ? s : hw;
  }
  const fit = fitter(series);
  accuracy ??= backtest(series, fitter);
  const skip = method === 'HOLT_WINTERS' ? 2 * SEASON : Math.min(7, series.length - 1);
  const residuals = series.slice(skip).map((y, i) => y - (fit.fitted[i + skip] ?? 0));
  const sigma = residuals.length > 1 ? stdDev(residuals) : 0;
  const points: ForecastPoint[] = fit.forecast(horizon).map((raw, i) => {
    const h = i + 1;
    const yhat = Math.max(0, raw);
    const w80 = 1.2816 * sigma * Math.sqrt(h);
    const w95 = 1.96 * sigma * Math.sqrt(h);
    return {
      h,
      yhat: round(yhat, 2),
      lo80: round(Math.max(0, yhat - w80), 2),
      hi80: round(yhat + w80, 2),
      lo95: round(Math.max(0, yhat - w95), 2),
      hi95: round(yhat + w95, 2),
    };
  });
  return {
    method,
    pattern,
    params: { ...fit.params, adi: Number.isFinite(adi) ? adi : -1, cv2 },
    points,
    avgDailyDemand: round(mean(points.map((p) => p.yhat)), 4),
    demandStdDev: round(sigma, 4),
    mape: accuracy.mape,
    wape: accuracy.wape,
    historyDays: series.length,
  };
}

/** Relative change in daily demand between two forecasts; null when either is negligible. */
export function forecastShift(previous: number, next: number, minDaily = 1): number | null {
  if (Math.max(previous, next) < minDaily) return null;
  if (previous <= 0) return null;
  return round((next - previous) / previous, 4);
}

/**
 * Adds product forecasts into one series (e.g. a category's daily units). Means add; the 80 % band
 * combines in quadrature, assuming the products' errors are independent. Adding the band edges
 * instead would claim every product misses in the same direction on the same day.
 */
export function sumForecasts(
  items: ReadonlyArray<{
    points: ReadonlyArray<Pick<ForecastPoint, 'yhat' | 'lo80' | 'hi80'>>;
    weight?: number;
  }>,
  horizon: number,
): Array<{ yhat: number; lo80: number; hi80: number }> {
  const acc = Array.from({ length: horizon }, () => ({ yhat: 0, below: 0, above: 0 }));
  for (const { points, weight = 1 } of items)
    for (let i = 0; i < Math.min(horizon, points.length); i++) {
      const p = points[i]!;
      const a = acc[i]!;
      a.yhat += p.yhat * weight;
      a.below += ((p.yhat - p.lo80) * weight) ** 2;
      a.above += ((p.hi80 - p.yhat) * weight) ** 2;
    }
  return acc.map((a) => ({
    yhat: round(a.yhat, 2),
    lo80: round(Math.max(0, a.yhat - Math.sqrt(a.below)), 2),
    hi80: round(a.yhat + Math.sqrt(a.above), 2),
  }));
}
