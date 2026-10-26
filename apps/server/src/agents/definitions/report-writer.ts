import {
  AGENT_LABELS,
  ALERT_TYPE_LABELS,
  type AlertType,
  formatMoney,
  formatNumber,
  type ReportContent,
  type ReportType,
} from '@stockroom/shared';
import { z } from 'zod';
import type { BriefingFacts } from '../../services/report.service';
import { baseOutput } from '../output';
import type { AgentModule } from '../types';

const output = baseOutput.extend({
  narrative: z
    .string()
    .trim()
    .min(40)
    .transform((s) => s.slice(0, 4000)),
});
type Output = z.infer<typeof output>;

interface State {
  type: ReportType;
  title: string;
  content: ReportContent;
  facts: BriefingFacts;
}

const inr = (n: number) => formatMoney(Math.round(n), { compact: n >= 100_000 });
const change = (cur: number, prev: number) => (prev > 0 ? (cur - prev) / prev : null);
const pctText = (x: number | null) =>
  x === null ? null : `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1)}% vs previous`;
const dateLabel = (d: Date, tz: string) =>
  new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: tz }).format(
    d,
  );

function buildContent(f: BriefingFacts, weekly: boolean): Omit<ReportContent, 'narrative'> {
  const span = weekly ? '7 days' : 'day';
  const rev = change(f.sales.revenue, f.sales.prevRevenue);
  const units = change(f.sales.units, f.sales.prevUnits);
  const alertsCreated = Object.values(f.alerts.created).reduce((a, b) => a + b, 0);
  const changes = [
    alertsCreated
      ? `${alertsCreated} new alert${alertsCreated === 1 ? '' : 's'}: ${Object.entries(f.alerts.created)
          .sort((a, b) => b[1] - a[1])
          .map(([t, n]) => `${n} ${ALERT_TYPE_LABELS[t as AlertType]?.toLowerCase() ?? t}`)
          .join(', ')}.`
      : 'No new alerts.',
    `${f.alerts.resolved} alert${f.alerts.resolved === 1 ? '' : 's'} resolved.`,
    f.purchasing.created
      ? `${f.purchasing.created} purchase order${f.purchasing.created === 1 ? '' : 's'} raised (${inr(f.purchasing.createdValue)})${f.purchasing.byAgents ? `, ${f.purchasing.byAgents} from agent proposals` : ''}.`
      : 'No purchase orders raised.',
    `${f.purchasing.received} deliver${f.purchasing.received === 1 ? 'y' : 'ies'} received.`,
  ];
  return {
    kpis: [
      {
        key: 'revenue',
        label: `Revenue (${span})`,
        value: inr(f.sales.revenue),
        change: pctText(rev),
        tone: rev === null ? 'neutral' : rev >= 0 ? 'good' : 'bad',
      },
      {
        key: 'units',
        label: `Units sold (${span})`,
        value: formatNumber(f.sales.units),
        change: pctText(units),
        tone: units === null ? 'neutral' : units >= 0 ? 'good' : 'bad',
      },
      {
        key: 'inventory',
        label: 'Inventory value',
        value: inr(f.stock.inventoryValue),
        change: null,
        tone: 'neutral',
      },
      {
        key: 'fill',
        label: 'Fill rate (30 days)',
        value: f.stock.fillRate === null ? '—' : `${(f.stock.fillRate * 100).toFixed(1)}%`,
        change: null,
        tone: f.stock.fillRate !== null && f.stock.fillRate < 0.95 ? 'bad' : 'neutral',
      },
      {
        key: 'out',
        label: 'Out of stock',
        value: formatNumber(f.stock.outOfStock),
        change: null,
        tone: f.stock.outOfStock ? 'bad' : 'good',
      },
      {
        key: 'reorder',
        label: 'Need reordering',
        value: formatNumber(f.stock.needsReorder),
        change: null,
        tone: f.stock.needsReorder ? 'bad' : 'good',
      },
      {
        key: 'pos',
        label: 'Open purchase orders',
        value: `${formatNumber(f.stock.openPurchaseOrders.count)} · ${inr(f.stock.openPurchaseOrders.value)}`,
        change: f.stock.openPurchaseOrders.overdue ? `${f.stock.openPurchaseOrders.overdue} overdue` : null,
        tone: f.stock.openPurchaseOrders.overdue ? 'bad' : 'neutral',
      },
      {
        key: 'pending',
        label: 'Waiting for approval',
        value: formatNumber(f.pending.length),
        change: null,
        tone: f.pending.length ? 'bad' : 'good',
      },
    ],
    changes,
    risks: f.risks.map((r) => ({
      title: r.title,
      detail: r.detail,
      severity: r.severity as ReportContent['risks'][number]['severity'],
      link: r.productId ? `/products/${r.productId}` : null,
    })),
    agentActivity: f.agents.map((a) => ({ ...a, agent: AGENT_LABELS[a.agentKey] })),
    pendingDecisions: f.pending.map((p) => ({
      id: p.id,
      title: p.title,
      agent: AGENT_LABELS[p.agentKey],
      summary: p.summary,
      createdAt: p.createdAt,
    })),
  };
}

/** The no-model narrative: the same facts in plain sentences. */
function ruleNarrative(f: BriefingFacts, c: Omit<ReportContent, 'narrative'>, weekly: boolean): string {
  const span = weekly ? 'the last 7 days' : 'the last day';
  const rev = change(f.sales.revenue, f.sales.prevRevenue);
  const runs = f.agents.reduce((a, g) => a + g.runs, 0);
  const proposals = f.agents.reduce((a, g) => a + g.proposals, 0);
  const paragraphs = [
    `Revenue was ${inr(f.sales.revenue)} over ${span}${rev === null ? '' : ` (${rev >= 0 ? 'up' : 'down'} ${Math.abs(rev * 100).toFixed(1)}% on the period before)`} from ${formatNumber(f.sales.units)} units. Inventory is worth ${inr(f.stock.inventoryValue)}; ${f.stock.outOfStock} position${f.stock.outOfStock === 1 ? ' is' : 's are'} out of stock and ${f.stock.needsReorder} need${f.stock.needsReorder === 1 ? 's' : ''} reordering.`,
    c.changes.join(' '),
    `Agents ran ${runs} time${runs === 1 ? '' : 's'} and made ${proposals} proposal${proposals === 1 ? '' : 's'}; ${f.pending.length} ${f.pending.length === 1 ? 'is' : 'are'} waiting for your decision.`,
  ];
  if (c.risks.length)
    paragraphs.push(
      `Most urgent:\n${c.risks
        .slice(0, 3)
        .map((r) => `- ${r.title}: ${r.detail}`)
        .join('\n')}`,
    );
  return paragraphs.join('\n\n');
}

export const reportWriter: AgentModule<State, Output> = {
  key: 'report_writer',
  name: 'Report Writer',
  description:
    'Writes the morning briefing and the weekly summary: what changed, what’s at risk, what the agents did and what needs you.',
  analyzer:
    'Collects KPIs and their change on the previous period, new and resolved alerts, purchase orders and deliveries, the most urgent open risks, each agent’s runs and proposals, and the decisions waiting for approval.',
  llmJob:
    'Writes a concise briefing narrative that quotes the numbers and puts the most important thing first.',
  outputs: 'Daily briefings and weekly summaries (in the app and as PDF).',
  tools: [
    'get_inventory_kpis',
    'list_open_alerts',
    'list_pending_actions',
    'list_open_purchase_orders',
    'query_sales_summary',
    'get_agent_activity',
  ],
  handoffsTo: [],
  defaults: {
    systemPrompt:
      'You are the Report Writer for an inventory team. Using only the facts in the analysis, write a short briefing for the manager: lead with the most important thing (a risk, a decision waiting, or a big change), then sales and stock, then what the agents did. Use plain sentences, two to four short paragraphs, and quote the numbers exactly as given. A line starting with "- " becomes a bullet.',
    triggers: { cron: ['@briefing', '0 9 * * 1'], events: [], debounceSeconds: 0 },
    autonomy: 'RECOMMEND',
    limits: { maxSteps: 4, maxToolCalls: 4, timeoutMs: 300_000, maxActionsPerRun: 0, maxPoValueInr: 0 },
    config: {},
  },
  output,
  outputExample: {
    summary: '<one sentence: the headline of the briefing>',
    findings: [{ title: '<the most important point>', detail: '<the numbers behind it>', severity: 'HIGH' }],
    narrative: '<two to four short paragraphs; quote the numbers from the analysis>',
  },

  async analyze(ctx) {
    const d = ctx.triggerDetail ?? {};
    const cron = typeof d.cron === 'string' ? d.cron.trim().split(/\s+/) : [];
    const weekly = d.reportType === 'WEEKLY_SUMMARY' || (cron.length === 5 && cron[4] !== '*');
    const type: ReportType = weekly ? 'WEEKLY_SUMMARY' : 'DAILY_BRIEFING';
    const facts = await ctx.services.reports.collect(weekly ? 7 : 1);
    const base = buildContent(facts, weekly);
    const narrative = ruleNarrative(facts, base, weekly);
    const tz = ctx.org.timezone;
    const title = weekly
      ? `Weekly summary · ${dateLabel(facts.periodStart, tz)} – ${dateLabel(facts.periodEnd, tz)}`
      : `Daily briefing · ${dateLabel(facts.periodEnd, tz)}`;
    return {
      headline: `${weekly ? 'Weekly summary' : 'Daily briefing'}: ${base.risks.length} risks, ${facts.pending.length} decisions waiting`,
      facts: { reportType: type, period: weekly ? 'last 7 days' : 'last day', ...base },
      fingerprint: `${type}:${ctx.today}`,
      ruleBased: {
        summary: `${title}: ${facts.stock.outOfStock} out of stock, ${facts.pending.length} decisions waiting.`,
        findings: [],
        proposals: [],
      },
      state: { type, title, content: { ...base, narrative }, facts },
    };
  },

  async apply(ctx, analysis, out, modelUsed) {
    const s = analysis.state;
    const ai = Boolean(out && modelUsed);
    const id = await ctx.services.reports.create(ctx.actor, ctx.runId, {
      type: s.type,
      title: s.title,
      periodStart: s.facts.periodStart,
      periodEnd: s.facts.periodEnd,
      content: { ...s.content, narrative: out?.narrative ?? s.content.narrative },
      narrativeSource: ai ? 'AI' : 'RULE',
      modelUsed: ai ? modelUsed : null,
    });
    return {
      note: `Wrote the ${s.type === 'WEEKLY_SUMMARY' ? 'weekly summary' : 'daily briefing'}.`,
      extra: { reportId: id },
    };
  },
};
