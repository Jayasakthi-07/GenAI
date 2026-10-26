import { AGENT_LABELS } from '@stockroom/shared';
import { z } from 'zod';
import { deadAndSlow, rebalancing } from '../../analytics/optimization';
import { defineTool, type ToolContext } from '../types';
import { resolveOne } from './read';

const limit = (max: number, def: number) =>
  z.number().int().min(1).max(max).default(def).describe(`How many rows (1–${max})`);

const stockLines = (ctx: ToolContext) =>
  ctx.services.analysis.stockLines({
    serviceLevel: ctx.org.serviceLevel,
    orderCostInr: ctx.org.orderCostInr,
    holdingRate: ctx.org.holdingRate,
  });

/** Read tools over forecasts, classifications, sales and agent activity. */
export const insightTools = [
  defineTool({
    name: 'get_forecast',
    kind: 'read',
    description:
      'The latest demand forecast for one product (all warehouses): method, pattern, average daily demand, backtest accuracy (MAPE/WAPE) and the next four weeks with 80 % bands.',
    input: z.object({ product: z.string().min(1).describe('Product id or SKU') }),
    label: () => 'Reading the forecast…',
    run: async (ctx, a) => {
      const id = await resolveOne(ctx, 'product', a.product);
      const f = await ctx.services.forecasts.forProduct(id);
      if (!f)
        return {
          productId: id,
          forecast: null,
          note: 'No forecast yet; the Demand Forecaster runs nightly.',
        };
      const weeks = [0, 1, 2, 3].map((w) => {
        const pts = f.points.slice(w * 7, w * 7 + 7);
        return {
          week: w + 1,
          units: Math.round(pts.reduce((s, p) => s + p.yhat, 0)),
          low80: Math.round(pts.reduce((s, p) => s + p.lo80, 0)),
          high80: Math.round(pts.reduce((s, p) => s + p.hi80, 0)),
        };
      });
      return {
        productId: id,
        method: f.method,
        pattern: f.pattern,
        avgDailyDemand: Math.round(f.avgDailyDemand * 100) / 100,
        mape: f.mape,
        wape: f.wape,
        historyDays: f.historyDays,
        generatedAt: f.generatedAt,
        nextWeeks: weeks,
      };
    },
  }),

  defineTool({
    name: 'query_sales_summary',
    kind: 'read',
    description:
      'Units, revenue (₹) and gross margin % over the last N days, grouped by category, warehouse or product.',
    input: z.object({
      days: z.number().int().min(1).max(365).default(30),
      groupBy: z.enum(['category', 'warehouse', 'product']).default('category'),
      limit: limit(40, 15),
    }),
    label: (a) => `Summarizing ${a.days} days of sales by ${a.groupBy}…`,
    run: async (ctx, a) => ({
      days: a.days,
      groupBy: a.groupBy,
      rows: await ctx.services.analysis.salesSummary(a.days, a.groupBy, a.limit),
    }),
  }),

  defineTool({
    name: 'get_abc_xyz_summary',
    kind: 'read',
    description:
      'Products and stock value per ABC (annual consumption value) × XYZ (demand variability) class, from the latest classification.',
    input: z.object({}),
    label: () => 'Reading the ABC–XYZ classes…',
    run: (ctx) => ctx.services.analysis.classSummary(),
  }),

  defineTool({
    name: 'list_slow_and_dead_stock',
    kind: 'read',
    description:
      'Stock with no sale in 90 days (dead) or more than 180 days of cover (slow), largest value first, with a suggested clearance price that stays above cost.',
    input: z.object({
      warehouse: z.string().optional().describe('Warehouse id or code'),
      limit: limit(30, 15),
    }),
    label: () => 'Finding slow and dead stock…',
    run: async (ctx, a) => {
      const warehouseId = a.warehouse ? await resolveOne(ctx, 'warehouse', a.warehouse) : undefined;
      const lines = (await stockLines(ctx)).filter((l) => !warehouseId || l.warehouseId === warehouseId);
      const found = deadAndSlow(lines, {
        deadDays: ctx.org.deadStockDays,
        slowCoverDays: ctx.org.overstockDays,
        minValue: 2000,
      });
      return {
        total: found.length,
        totalValue: Math.round(found.reduce((s, f) => s + f.value, 0)),
        items: found.slice(0, a.limit).map((f) => ({
          kind: f.kind,
          productId: f.line.productId,
          sku: f.line.sku,
          name: f.line.name,
          warehouse: f.line.warehouseCode,
          onHand: f.line.onHand,
          value: Math.round(f.value),
          daysSinceSale: f.line.daysSinceSale,
          coverDays: f.coverDays,
          sellingPrice: f.line.sellingPrice,
          costPrice: f.line.costPrice,
          suggestedPrice: f.markdownPrice,
        })),
      };
    },
  }),

  defineTool({
    name: 'find_rebalancing_opportunities',
    kind: 'read',
    description:
      'Products with excess at one warehouse (cover > 2× the 30-day target) and a shortage at another (cover below lead time), with the quantity that fixes both.',
    input: z.object({ limit: limit(20, 10) }),
    label: () => 'Looking for stock to rebalance…',
    run: async (ctx, a) => {
      const moves = rebalancing(await stockLines(ctx));
      return {
        total: moves.length,
        moves: moves.slice(0, a.limit).map((m) => ({
          productId: m.productId,
          sku: m.sku,
          name: m.name,
          from: m.fromCode,
          to: m.toCode,
          quantity: m.quantity,
          value: Math.round(m.value),
          fromCover: `${m.fromCoverBefore} → ${m.fromCoverAfter} days`,
          toCover: `${m.toCoverBefore} → ${m.toCoverAfter} days`,
        })),
      };
    },
  }),

  defineTool({
    name: 'get_supplier_scorecard',
    kind: 'read',
    description:
      'One supplier over 180 days: score 0–100 with its breakdown, on-time rate, lead time and variability, fill rate, price trend, rejections and overdue orders.',
    input: z.object({ supplier: z.string().min(1).describe('Supplier id or code') }),
    label: () => 'Reading the supplier scorecard…',
    run: async (ctx, a) => {
      const id = await resolveOne(ctx, 'supplier', a.supplier);
      const s = await ctx.services.suppliers.scorecard(id);
      return {
        supplierId: id,
        score: s.score,
        risk: s.riskLevel,
        breakdown: s.breakdown,
        metrics: s.metrics,
        flags: s.flags,
        recentDeliveries: s.recentDeliveries.slice(0, 6).map((d) => ({
          po: d.poNumber,
          receivedAt: d.receivedAt,
          daysLate: d.daysLate,
          fillRate: d.fillRate,
        })),
      };
    },
  }),

  defineTool({
    name: 'get_agent_activity',
    kind: 'read',
    description:
      'What each agent did over the last N days: runs (with AI), proposals made, executed and rejected.',
    input: z.object({ days: z.number().int().min(1).max(30).default(1) }),
    label: (a) => `Reviewing ${a.days === 1 ? 'today’s' : `${a.days} days of`} agent activity…`,
    run: async (ctx, a) => {
      const facts = await ctx.services.reports.collect(a.days);
      return {
        days: a.days,
        agents: facts.agents.map((g) => ({ ...g, agent: AGENT_LABELS[g.agentKey] })),
        waitingForApproval: facts.pending.length,
      };
    },
  }),
];
