import type { RunFinding } from '@stockroom/shared';
import { z } from 'zod';
import type { Finding } from '../../analytics/stock-health';
import { baseOutput } from '../output';
import type { AgentModule } from '../types';

const REPLENISH_TYPES = new Set(['OUT_OF_STOCK', 'LOW_STOCK', 'PROJECTED_STOCKOUT']);
const MAX_FOR_MODEL = 12;

const output = baseOutput.extend({
  alerts: z
    .array(
      z.object({
        key: z.string().min(1),
        explanation: z.string().trim().min(5).max(600),
        priority: z.number().int().min(0).max(100).optional(),
      }),
    )
    .max(MAX_FOR_MODEL)
    .default([]),
  urgent: z.array(z.string()).max(50).default([]),
});
type Output = z.infer<typeof output>;

interface State {
  delta: Finding[];
  open: number;
}

const brief = (f: Finding) => ({
  key: f.dedupeKey,
  type: f.type,
  severity: f.severity,
  priority: f.priority,
  title: f.title,
  facts: f.message,
  productId: f.productId,
  sku: f.data.sku,
  warehouse: f.data.warehouse,
  onOrder: f.data.onOrder,
  daysOfCover: f.data.daysOfCover,
  leadTimeDays: f.data.leadTimeDays,
});

export const stockSentinel: AgentModule<State, Output> = {
  key: 'stock_sentinel',
  name: 'Stock Sentinel',
  description: 'Watches every product at every warehouse and raises clear, prioritized stock alerts.',
  analyzer:
    'Available vs reorder point and safety stock, out of stock, overstock, days of cover (available ÷ daily demand), projected stockouts within the lead time, and batches nearing expiry. Keeps alerts in sync and resolves them when conditions clear.',
  llmJob:
    'Prioritizes new and worsening issues, explains each in plain language, and picks which items need replenishing now.',
  outputs: 'Alerts with explanations; urgent items handed to the Replenishment Planner.',
  tools: [
    'get_inventory_kpis',
    'list_stock_positions',
    'get_product_details',
    'get_sales_history',
    'list_open_alerts',
    'list_open_purchase_orders',
  ],
  handoffsTo: ['replenishment_planner'],
  defaults: {
    systemPrompt:
      'You are the Stock Sentinel for an Indian retail and distribution business. The analysis lists stock issues that are new or worse since your last review, with the facts computed by code. For each one, write a short explanation a store manager can act on: what is happening, why it matters (days of cover vs lead time, open purchase orders), and the next step. You may re-rank priorities slightly. Look up details with tools only when the facts are not enough. List the product ids that need replenishing now in "urgent".',
    triggers: { cron: ['*/15 * * * *'], events: ['stock.changed', 'po.status_changed'], debounceSeconds: 60 },
    autonomy: 'RECOMMEND',
    limits: { maxSteps: 6, maxToolCalls: 8, timeoutMs: 240_000, maxActionsPerRun: 0, maxPoValueInr: 0 },
    config: {},
  },
  output,
  outputExample: {
    summary: '<one or two sentences on the most important stock issues right now>',
    findings: [
      {
        title: '<an issue in plain words>',
        detail: '<the facts behind it, quoting numbers from the analysis>',
        severity: 'HIGH',
      },
    ],
    alerts: [
      {
        key: 'LOW_STOCK:<productId>:<warehouseId>',
        explanation:
          '<what is happening, why it matters (cover vs lead time, open orders), and the next step>',
        priority: 80,
      },
    ],
    urgent: ['<productId>'],
  },

  async analyze(ctx) {
    const findings = await ctx.services.alerts.analyze(ctx.today, ctx.org);
    const before = await ctx.services.alerts.stockAlertState();
    // The deterministic part runs every time: alert facts always match the data.
    const sync = await ctx.services.alerts.syncStockFindings(ctx.actor, ctx.runId, findings);
    const created = new Set(sync.createdKeys);
    const delta = findings
      .filter((f) => {
        const b = before.get(f.dedupeKey);
        return created.has(f.dedupeKey) || !b || b.severity !== f.severity || b.explanationSource === 'RULE';
      })
      .slice(0, MAX_FOR_MODEL);
    const bySeverity: Record<string, number> = {};
    const byType: Record<string, number> = {};
    for (const f of findings) {
      bySeverity[f.severity] = (bySeverity[f.severity] ?? 0) + 1;
      byType[f.type] = (byType[f.type] ?? 0) + 1;
    }
    const top: RunFinding[] = findings
      .slice(0, 5)
      .map((f) => ({ title: f.title, detail: f.message, severity: f.severity }));
    const summary = `${findings.length} open stock issue${findings.length === 1 ? '' : 's'}: ${sync.created} new, ${sync.resolved} resolved.`;
    return {
      headline: `${findings.length} stock issues · ${sync.created} new · ${sync.resolved} resolved · ${delta.length} to review`,
      facts: {
        open: findings.length,
        bySeverity,
        byType,
        newSinceLastCheck: sync.created,
        resolvedSinceLastCheck: sync.resolved,
        toReview: delta.map(brief),
        notShown: Math.max(0, findings.length - delta.length),
      },
      fingerprint: findings
        .map((f) => `${f.dedupeKey}:${f.severity}`)
        .sort()
        .join('|'),
      nothingToDo: delta.length === 0,
      ruleBased: {
        summary: delta.length ? summary : `${summary} Nothing new to review.`,
        findings: top,
        proposals: [],
      },
      state: { delta, open: findings.length },
    };
  },

  async apply(ctx, analysis, out, modelUsed) {
    if (!out || !modelUsed) return {};
    const allowed = new Set(analysis.state.delta.map((f) => f.dedupeKey));
    const n = await ctx.services.alerts.applyExplanations(
      ctx.actor,
      out.alerts
        .filter((a) => allowed.has(a.key))
        .map((a) => ({ dedupeKey: a.key, explanation: a.explanation, priority: a.priority })),
      modelUsed,
    );
    return { note: n ? `Explained ${n} alert${n === 1 ? '' : 's'}.` : undefined, extra: { explained: n } };
  },

  handoffs(_ctx, analysis, out) {
    const needs = analysis.state.delta.filter(
      (f) => REPLENISH_TYPES.has(f.type) && (f.type === 'OUT_OF_STOCK' || Number(f.data.onOrder ?? 0) === 0),
    );
    const ids = new Set(needs.map((f) => f.productId));
    // The model may add items it judged urgent, but only ones the analysis flagged.
    const flagged = new Set(analysis.state.delta.map((f) => f.productId));
    for (const id of out?.urgent ?? []) if (flagged.has(id)) ids.add(id);
    if (!ids.size) return [];
    return [
      {
        to: 'replenishment_planner',
        productIds: [...ids],
        reason: `${ids.size} item${ids.size === 1 ? '' : 's'} at or below the reorder point with nothing on order`,
      },
    ];
  },
};
