import type { RunFinding } from '@stockroom/shared';
import { z } from 'zod';
import { round } from '../../analytics/stats';
import type { SupplierScore } from '../../analytics/supplier-score';
import type { AlertFinding } from '../../services/alert.service';
import { baseOutput } from '../output';
import type { AgentModule, ProposalDraft } from '../types';

const output = baseOutput.extend({
  alerts: z
    .array(z.object({ key: z.string().min(1), explanation: z.string().trim().min(5).max(600) }))
    .max(12)
    .default([]),
});
type Output = z.infer<typeof output>;

interface Alternative {
  productId: string;
  sku: string;
  name: string;
  currentSupplierId: string;
  current: string;
  currentScore: number | null;
  currentCost: number;
  alternativeSupplierId: string;
  alternative: string;
  alternativeScore: number;
  alternativeCost: number;
  alternativeLeadTimeDays: number;
}

interface State {
  risks: AlertFinding[];
  alternatives: Alternative[];
}

const pct = (x: number | null) => (x === null ? '—' : `${Math.round(x * 100)}%`);

export const supplierAnalyst: AgentModule<State, Output> = {
  key: 'supplier_analyst',
  name: 'Supplier Analyst',
  description:
    'Scores every supplier on delivery, fill, lead-time stability, price and quality, and flags the risky ones.',
  analyzer:
    'Over 180 days: on-time rate (received by the expected date + 1 day), lead-time mean and CV, fill rate, price trend (last 90 days vs the 90 before), rejection rate. Score = 35 % on-time + 20 % fill + 15 % lead-time stability + 15 % price + 15 % quality, from 0 to 100.',
  llmJob:
    'Explains score changes and risks in plain words and suggests switching products to better suppliers already in the catalog.',
  outputs: 'Saved scorecards, supplier-risk alerts and preferred-supplier proposals.',
  tools: [
    'get_supplier_scorecards',
    'get_supplier_scorecard',
    'compare_suppliers',
    'list_open_purchase_orders',
    'get_product_details',
    'propose_preferred_supplier_change',
  ],
  handoffsTo: [],
  defaults: {
    systemPrompt:
      'You are the Supplier Analyst. The analysis lists suppliers with their computed scores, the change since the last scorecard and the metrics behind it, plus products whose preferred supplier is risky and a better-scored alternative exists. Explain each risk briefly with the numbers (on-time rate, fill rate, lead-time variability, price change). For the alternatives you agree with, call propose_preferred_supplier_change with a one-line reason.',
    triggers: { cron: ['0 6 * * 1'], events: ['po.received'], debounceSeconds: 120 },
    autonomy: 'RECOMMEND',
    limits: { maxSteps: 8, maxToolCalls: 12, timeoutMs: 300_000, maxActionsPerRun: 5, maxPoValueInr: 0 },
    config: {},
  },
  output,
  outputExample: {
    summary: '<one or two sentences on supplier performance and risks>',
    findings: [
      { title: '<a supplier risk>', detail: '<the metrics behind it, from the analysis>', severity: 'HIGH' },
    ],
    alerts: [{ key: '<key from the analysis>', explanation: '<why the supplier is risky and what to do>' }],
  },

  async analyze(ctx) {
    const { suppliers, planning, analysis, alerts } = ctx.services;
    const [comparison, options, products] = await Promise.all([
      suppliers.scoreComparison(),
      planning.supplierOptions(),
      analysis.activeProducts(),
    ]);
    const live = new Map<string, SupplierScore>();
    for (const c of comparison) if (c.live) live.set(c.supplierId, c.live);
    await suppliers.saveScores(
      ctx.actor,
      [...live.entries()].map(([supplierId, score]) => ({ supplierId, score })),
    );

    const risks: AlertFinding[] = [];
    const rows = comparison
      .filter((c) => c.live?.score !== null && c.live)
      .map((c) => {
        const s = c.live as SupplierScore;
        const change = c.saved.score !== null && s.score !== null ? round(s.score - c.saved.score, 1) : null;
        return { c, s, change };
      });
    for (const { c, s, change } of rows) {
      const dropped = change !== null && change <= -10;
      if (s.riskLevel !== 'HIGH' && !dropped) continue;
      const m = s.metrics;
      risks.push({
        type: 'SUPPLIER_RISK',
        dedupeKey: `SUPPLIER_RISK:${c.supplierId}`,
        severity: s.riskLevel === 'HIGH' ? 'HIGH' : 'MEDIUM',
        priority: s.riskLevel === 'HIGH' ? 66 : 50,
        title:
          s.riskLevel === 'HIGH'
            ? `${c.name} is a high-risk supplier`
            : `${c.name}’s score dropped ${Math.abs(change ?? 0)} points`,
        message: `Score ${s.score ?? '—'}${change !== null ? ` (${change > 0 ? '+' : ''}${change})` : ''}; on time ${pct(m.onTimeRate)}, fill ${pct(m.fillRate)}, lead-time CV ${m.leadTimeCv === null ? '—' : round(m.leadTimeCv, 2)}, price ${m.priceChange === null ? '—' : `${m.priceChange > 0 ? '+' : ''}${pct(m.priceChange)}`}, ${m.overdue} overdue order${m.overdue === 1 ? '' : 's'}.`,
        explanation: s.flags.length
          ? s.flags.join(' ')
          : 'Review open orders with this supplier and consider an alternate source.',
        supplierId: c.supplierId,
        data: {
          supplier: c.name,
          score: s.score,
          previousScore: c.saved.score,
          risk: s.riskLevel,
          ...m,
          flags: s.flags,
        },
      });
    }
    await alerts.syncFindings(ctx.actor, ctx.runId, ['SUPPLIER_RISK'], risks, {
      quietHours: 7 * 24,
      action: 'alerts.supplier_risk',
      label: 'Supplier review',
    });

    // Products whose preferred supplier is risky, with a clearly better alternative at a similar price.
    const productById = new Map(products.map((p) => [p.id, p]));
    const nameOf = new Map(comparison.map((c) => [c.supplierId, c.name]));
    const alternatives: Alternative[] = [];
    for (const [productId, opts] of options) {
      const product = productById.get(productId);
      const preferred = opts.find((o) => o.isPreferred);
      if (!product || !preferred) continue;
      const ps = live.get(preferred.supplierId);
      const pScore = ps?.score ?? preferred.score;
      if (!(ps?.riskLevel === 'HIGH' || (pScore !== null && pScore < 60))) continue;
      const better = opts
        .filter((o) => o.isActive && o.supplierId !== preferred.supplierId)
        .map((o) => ({ o, score: live.get(o.supplierId)?.score ?? o.score }))
        .filter(
          (x) =>
            x.score !== null && x.score >= (pScore ?? 0) + 10 && x.o.unitCost <= preferred.unitCost * 1.1,
        )
        .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0];
      if (!better) continue;
      alternatives.push({
        productId,
        sku: product.sku,
        name: product.name,
        currentSupplierId: preferred.supplierId,
        current: nameOf.get(preferred.supplierId) ?? preferred.supplierName,
        currentScore: pScore,
        currentCost: preferred.unitCost,
        alternativeSupplierId: better.o.supplierId,
        alternative: nameOf.get(better.o.supplierId) ?? better.o.supplierName,
        alternativeScore: better.score ?? 0,
        alternativeCost: better.o.unitCost,
        alternativeLeadTimeDays: better.o.leadTimeDays,
      });
    }
    alternatives.sort(
      (a, b) => b.alternativeScore - (b.currentScore ?? 0) - (a.alternativeScore - (a.currentScore ?? 0)),
    );

    const proposals: ProposalDraft[] = alternatives.slice(0, 5).map((a) => ({
      type: 'CHANGE_PREFERRED_SUPPLIER',
      payload: { productId: a.productId, supplierId: a.alternativeSupplierId },
      rationale: `${a.current} scores ${a.currentScore ?? '—'}; ${a.alternative} scores ${a.alternativeScore} at ₹${a.alternativeCost} vs ₹${a.currentCost} per unit, ${a.alternativeLeadTimeDays}-day lead time.`,
    }));
    const findings: RunFinding[] = risks
      .slice(0, 5)
      .map((r) => ({ title: r.title, detail: r.message, severity: r.severity }));
    const scored = rows.length;
    const avg = scored ? round(rows.reduce((a, r) => a + (r.s.score ?? 0), 0) / scored, 1) : null;
    const summary = `Scored ${scored} supplier${scored === 1 ? '' : 's'} (average ${avg ?? '—'}); ${risks.length} at risk, ${alternatives.length} better source${alternatives.length === 1 ? '' : 's'} available.`;
    return {
      headline: `${scored} suppliers scored · ${risks.length} at risk · ${alternatives.length} alternatives`,
      facts: {
        suppliers: rows
          .sort((a, b) => (a.s.score ?? 0) - (b.s.score ?? 0))
          .slice(0, 12)
          .map(({ c, s, change }) => ({
            key: `SUPPLIER_RISK:${c.supplierId}`,
            supplierId: c.supplierId,
            code: c.code,
            name: c.name,
            score: s.score,
            change,
            risk: s.riskLevel,
            breakdown: s.breakdown,
            onTimeRate: s.metrics.onTimeRate,
            fillRate: s.metrics.fillRate,
            leadTimeCv: s.metrics.leadTimeCv,
            priceChange: s.metrics.priceChange,
            overdue: s.metrics.overdue,
            flags: s.flags,
          })),
        riskAlertKeys: risks.map((r) => r.dedupeKey),
        alternatives: alternatives.slice(0, 8),
      },
      fingerprint: [
        ...risks.map((r) => `${r.dedupeKey}:${r.severity}`),
        ...rows.map(({ c, s }) => `${c.supplierId}:${Math.round((s.score ?? 0) / 5)}`),
        ...alternatives.map((a) => `${a.productId}>${a.alternativeSupplierId}`),
      ]
        .sort()
        .join('|'),
      nothingToDo: risks.length === 0 && alternatives.length === 0,
      ruleBased: { summary, findings, proposals },
      state: { risks, alternatives },
    };
  },

  async apply(ctx, analysis, out, modelUsed) {
    if (!out || !modelUsed) return {};
    const allowed = new Set(analysis.state.risks.map((r) => r.dedupeKey));
    const n = await ctx.services.alerts.applyExplanations(
      ctx.actor,
      out.alerts
        .filter((a) => allowed.has(a.key))
        .map((a) => ({ dedupeKey: a.key, explanation: a.explanation })),
      modelUsed,
    );
    return { note: n ? `Explained ${n} supplier risk${n === 1 ? '' : 's'}.` : undefined };
  },
};
