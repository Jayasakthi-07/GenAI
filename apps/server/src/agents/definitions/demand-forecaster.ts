import type { RunFinding } from '@stockroom/shared';
import { z } from 'zod';
import { type ForecastResult, forecastSeries, forecastShift } from '../../analytics/forecasting';
import { median, round } from '../../analytics/stats';
import type { AlertFinding } from '../../services/alert.service';
import { baseOutput } from '../output';
import type { AgentModule } from '../types';

const HISTORY = 365;
const SHIFT = 0.3;

const output = baseOutput.extend({
  categories: z
    .array(z.object({ category: z.string().min(1), narrative: z.string().trim().min(10).max(800) }))
    .max(12)
    .default([]),
});
type Output = z.infer<typeof output>;

interface Shift {
  productId: string;
  sku: string;
  name: string;
  category: string;
  previous: number;
  next: number;
  change: number;
  method: string;
  wape: number | null;
}

interface State {
  shifts: Shift[];
  forecasted: number;
}

const pct = (x: number) => `${x > 0 ? '+' : ''}${Math.round(x * 100)}%`;

export const demandForecaster: AgentModule<State, Output> = {
  key: 'demand_forecaster',
  name: 'Demand Forecaster',
  description:
    'Forecasts daily demand for every product four weeks ahead, with confidence bands and tracked accuracy.',
  analyzer:
    'Classifies each SKU’s demand (Syntetos–Boylan ADI / CV²), then fits damped Holt-Winters with weekly seasonality or SES for smooth demand, Croston-SBA for intermittent demand, or a moving average for short histories. Parameters by grid search; accuracy from a 28-day holdout (MAPE, WAPE); 80 % and 95 % bands from residual spread.',
  llmJob:
    'Writes a short narrative per category on notable shifts: what is rising or falling, and why it matters for ordering.',
  outputs: 'Stored forecasts the planner uses, forecast-shift alerts and a category outlook.',
  tools: [
    'get_forecast',
    'get_sales_history',
    'query_sales_summary',
    'search_products',
    'get_product_details',
  ],
  handoffsTo: [],
  defaults: {
    systemPrompt:
      'You are the Demand Forecaster. Code has already forecast every product; the analysis lists the notable shifts and a summary per category with accuracy. Write a short narrative for each category that has shifts: what is rising or falling, by how much, how reliable the forecast is (WAPE), and what a buyer should do. Use get_sales_history or get_forecast only to check a surprising shift.',
    triggers: { cron: ['0 2 * * *'], events: [], debounceSeconds: 0 },
    autonomy: 'RECOMMEND',
    limits: { maxSteps: 6, maxToolCalls: 8, timeoutMs: 300_000, maxActionsPerRun: 0, maxPoValueInr: 0 },
    config: {},
  },
  output,
  outputExample: {
    summary: '<one or two sentences on the demand outlook>',
    findings: [
      {
        title: '<a notable shift>',
        detail: '<previous → new daily demand and forecast accuracy, from the analysis>',
        severity: 'MEDIUM',
      },
    ],
    categories: [
      { category: '<category name from the analysis>', narrative: '<what is changing and what to do>' },
    ],
  },

  async analyze(ctx) {
    const { analysis, forecasts, alerts } = ctx.services;
    const [products, demand, previous] = await Promise.all([
      analysis.activeProducts(),
      analysis.productDemand(HISTORY),
      forecasts.latest(),
    ]);
    const results: Array<{ productId: string; result: ForecastResult }> = [];
    const shifts: Shift[] = [];
    const byCategory = new Map<
      string,
      { products: number; next: number; prev: number; actual28: number; wapes: number[] }
    >();
    for (const p of products) {
      const raw = demand.series.get(p.id);
      if (!raw) continue;
      // Forecast from the first sale; earlier zeros are "not stocked yet", not "no demand".
      const first = raw.findIndex((x) => x > 0);
      if (first < 0) continue;
      const series = raw.slice(first);
      const result = forecastSeries(series, 28);
      results.push({ productId: p.id, result });
      const prev = previous.get(p.id)?.avgDailyDemand;
      const actual28 = series.slice(-28).reduce((a, b) => a + b, 0) / Math.min(28, series.length);
      const c = byCategory.get(p.category) ?? { products: 0, next: 0, prev: 0, actual28: 0, wapes: [] };
      c.products++;
      c.next += result.avgDailyDemand;
      c.prev += prev ?? result.avgDailyDemand;
      c.actual28 += actual28;
      if (result.wape !== null) c.wapes.push(result.wape);
      byCategory.set(p.category, c);
      const change = prev === undefined ? null : forecastShift(prev, result.avgDailyDemand);
      if (change !== null && Math.abs(change) >= SHIFT)
        shifts.push({
          productId: p.id,
          sku: p.sku,
          name: p.name,
          category: p.category,
          previous: round(prev ?? 0, 2),
          next: round(result.avgDailyDemand, 2),
          change,
          method: result.method,
          wape: result.wape,
        });
    }
    await forecasts.save(ctx.actor, ctx.runId, results);
    shifts.sort((a, b) => Math.abs(b.change) - Math.abs(a.change));

    const alertFindings: AlertFinding[] = shifts.map((s) => ({
      type: 'FORECAST_SHIFT',
      dedupeKey: `FORECAST_SHIFT:${s.productId}`,
      severity: Math.abs(s.change) >= 0.6 ? 'MEDIUM' : 'LOW',
      priority: Math.min(60, 30 + Math.round(Math.abs(s.change) * 30)),
      title: `${s.name}: demand ${s.change > 0 ? 'rising' : 'falling'} ${pct(s.change)}`,
      message: `Forecast ${s.next}/day vs ${s.previous}/day before (${s.method.replace('_', '-').toLowerCase()}, WAPE ${s.wape ?? '—'}%).`,
      explanation:
        s.change > 0
          ? 'Reorder points computed from the old forecast are now too low; the planner uses the new forecast from its next run.'
          : 'Demand is softening; hold back on large orders and watch for overstock.',
      productId: s.productId,
      data: {
        sku: s.sku,
        previous: s.previous,
        next: s.next,
        change: s.change,
        method: s.method,
        wape: s.wape,
      },
    }));
    await alerts.syncFindings(ctx.actor, ctx.runId, ['FORECAST_SHIFT'], alertFindings, {
      quietHours: 72,
      action: 'alerts.forecast_shift',
      label: 'Forecast shifts',
    });

    const methods: Record<string, number> = {};
    for (const r of results) methods[r.result.method] = (methods[r.result.method] ?? 0) + 1;
    const wapes = results.flatMap((r) => (r.result.wape === null ? [] : [r.result.wape]));
    const categories = [...byCategory.entries()]
      .map(([category, c]) => ({
        category,
        products: c.products,
        forecastPerDay: round(c.next, 1),
        previousForecastPerDay: round(c.prev, 1),
        last28DaysPerDay: round(c.actual28, 1),
        change: c.prev > 0 ? round((c.next - c.prev) / c.prev, 3) : null,
        medianWape: c.wapes.length ? round(median(c.wapes), 1) : null,
        shifts: shifts.filter((s) => s.category === category).length,
      }))
      .sort((a, b) => b.shifts - a.shifts || b.forecastPerDay - a.forecastPerDay);
    const findings: RunFinding[] = shifts.slice(0, 5).map((s) => ({
      title: `${s.name} demand ${s.change > 0 ? 'up' : 'down'} ${pct(s.change)}`,
      detail: `${s.previous} → ${s.next} units/day (${s.method.replace('_', '-').toLowerCase()}, WAPE ${s.wape ?? '—'}%).`,
      severity: Math.abs(s.change) >= 0.6 ? 'MEDIUM' : 'LOW',
    }));
    const medianWape = wapes.length ? round(median(wapes), 1) : null;
    const summary = `Forecast ${results.length} products (${Object.entries(methods)
      .map(([m, n]) => `${n} ${m.replace('_', '-').toLowerCase()}`)
      .join(
        ', ',
      )}); median WAPE ${medianWape ?? '—'}%. ${shifts.length} notable shift${shifts.length === 1 ? '' : 's'}.`;
    return {
      headline: `${results.length} products forecast · ${shifts.length} shifts · median WAPE ${medianWape ?? '—'}%`,
      facts: {
        forecasted: results.length,
        methods,
        medianWape,
        categories: categories.slice(0, 10),
        shifts: shifts.slice(0, 12),
      },
      fingerprint: shifts
        .map((s) => `${s.productId}:${Math.round(s.change * 10)}`)
        .sort()
        .join('|'),
      // The first forecasts have no "before"; still worth an outlook.
      nothingToDo: shifts.length === 0 && previous.size > 0,
      ruleBased: { summary, findings, proposals: [] },
      state: { shifts, forecasted: results.length },
    };
  },

  apply(_ctx, _analysis, out) {
    if (!out?.categories.length) return Promise.resolve({});
    return Promise.resolve({ extra: { categories: out.categories } });
  },
};
