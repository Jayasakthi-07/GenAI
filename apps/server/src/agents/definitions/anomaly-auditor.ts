import type { RunFinding } from '@stockroom/shared';
import { z } from 'zod';
import {
  type AnomalyFinding,
  costJumps,
  countVariances,
  demandSpikes,
  receiptMismatches,
  repeatedLosses,
} from '../../analytics/anomalies';
import { baseOutput } from '../output';
import type { AgentModule, ProposalDraft } from '../types';

const MAX_FOR_MODEL = 10;

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
});
type Output = z.infer<typeof output>;

interface State {
  delta: AnomalyFinding[];
}

const brief = (f: AnomalyFinding) => ({
  key: f.dedupeKey,
  check: f.kind,
  severity: f.severity,
  title: f.title,
  facts: f.message,
  productId: f.productId,
  warehouseId: f.warehouseId,
  data: f.data,
  countSuggested: f.countSuggested,
});

export const anomalyAuditor: AgentModule<State, Output> = {
  key: 'anomaly_auditor',
  name: 'Anomaly Auditor',
  description:
    'Catches what looks wrong: demand spikes, repeated losses, count variances, invoices that don’t match POs and cost jumps.',
  analyzer:
    'Robust z-score 0.6745·(x − median)/MAD > 3.5 on daily demand; ≥ 3 negative adjustments for one item in 14 days; count variance over 5 % or ₹1,000; receipt price ±5 % from the PO or short deliveries; unit cost more than 15 % above its 90-day median.',
  llmJob:
    'Triages each finding: the likely cause, how serious it is, and what to check. Proposes a cycle count where one would settle it.',
  outputs: 'Anomaly and demand-spike alerts with triage notes; cycle-count proposals.',
  tools: [
    'list_open_alerts',
    'get_product_details',
    'get_sales_history',
    'list_open_purchase_orders',
    'compare_suppliers',
    'propose_cycle_count',
  ],
  handoffsTo: [],
  defaults: {
    systemPrompt:
      'You are the Anomaly Auditor. The analysis lists findings from deterministic checks with their facts. For each one, explain the most likely cause (bulk order, theft or damage, miscount, supplier billing error, price increase), how serious it is, and exactly what a person should check. Where repeated losses or count variances suggest the records are wrong, call propose_cycle_count once per warehouse with those products.',
    triggers: {
      cron: ['0 * * * *'],
      events: ['stock.adjusted', 'count.completed', 'po.received'],
      debounceSeconds: 30,
    },
    autonomy: 'RECOMMEND',
    limits: { maxSteps: 8, maxToolCalls: 12, timeoutMs: 300_000, maxActionsPerRun: 4, maxPoValueInr: 0 },
    config: {},
  },
  output,
  outputExample: {
    summary: '<one or two sentences on what looks wrong and what to do first>',
    findings: [
      { title: '<an issue in plain words>', detail: '<the facts, quoting the analysis>', severity: 'HIGH' },
    ],
    alerts: [
      { key: '<key from the analysis>', explanation: '<likely cause and what to check>', priority: 60 },
    ],
  },

  async analyze(ctx) {
    const { analysis, alerts } = ctx.services;
    const [demand, adjustments, counts, receipts, costs] = await Promise.all([
      analysis.locationDemand(63),
      analysis.adjustments(30),
      analysis.countLines(14),
      analysis.receiptLines(30),
      analysis.costHistory(180),
    ]);
    const findings = [
      ...demandSpikes(demand),
      ...repeatedLosses(adjustments, ctx.today),
      ...countVariances(counts),
      ...receiptMismatches(receipts),
      ...costJumps(costs, ctx.today),
    ].sort((a, b) => b.priority - a.priority);

    const before = await alerts.alertState(['DEMAND_SPIKE', 'ANOMALY']);
    const sync = await alerts.syncFindings(ctx.actor, ctx.runId, ['DEMAND_SPIKE', 'ANOMALY'], findings, {
      quietHours: 14 * 24,
      action: 'alerts.anomaly_check',
      label: 'Anomaly check',
    });
    const created = new Set(sync.createdKeys);
    const delta = findings
      .filter((f) => {
        const b = before.get(f.dedupeKey);
        return created.has(f.dedupeKey) || !b || b.severity !== f.severity || b.explanationSource === 'RULE';
      })
      .slice(0, MAX_FOR_MODEL);

    // Rule-based: one cycle count per warehouse for the items whose records look wrong.
    const byWarehouse = new Map<string, Set<string>>();
    for (const f of findings)
      if (f.countSuggested && f.warehouseId)
        byWarehouse.set(f.warehouseId, (byWarehouse.get(f.warehouseId) ?? new Set()).add(f.productId));
    const proposals: ProposalDraft[] = [...byWarehouse.entries()].map(([warehouseId, ids]) => ({
      type: 'CREATE_CYCLE_COUNT',
      payload: {
        warehouseId,
        productIds: [...ids].slice(0, 50),
        reason: 'Losses or count variances flagged by the Anomaly Auditor',
      },
      rationale: `${ids.size} item${ids.size === 1 ? '' : 's'} at this warehouse had repeated negative adjustments or a count variance above 5 % (or ₹1,000). A recount confirms the records before anything is written off.`,
    }));

    const kinds: Record<string, number> = {};
    for (const f of findings) kinds[f.kind] = (kinds[f.kind] ?? 0) + 1;
    const top: RunFinding[] = findings
      .slice(0, 5)
      .map((f) => ({ title: f.title, detail: f.message, severity: f.severity }));
    const summary = findings.length
      ? `${findings.length} anomal${findings.length === 1 ? 'y' : 'ies'} (${Object.entries(kinds)
          .map(([k, n]) => `${n} ${k.replace(/_/g, ' ')}`)
          .join(', ')}); ${sync.created} new.`
      : 'No anomalies in demand, adjustments, counts, receipts or costs.';
    return {
      headline: `${findings.length} anomalies · ${sync.created} new · ${delta.length} to review`,
      facts: {
        total: findings.length,
        byCheck: kinds,
        toReview: delta.map(brief),
        notShown: Math.max(0, findings.length - delta.length),
      },
      fingerprint: findings
        .map((f) => `${f.dedupeKey}:${f.severity}`)
        .sort()
        .join('|'),
      nothingToDo: delta.length === 0,
      ruleBased: { summary, findings: top, proposals },
      state: { delta },
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
    return { note: n ? `Triaged ${n} finding${n === 1 ? '' : 's'}.` : undefined, extra: { triaged: n } };
  },
};
