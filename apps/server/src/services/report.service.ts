import {
  AGENT_LABELS,
  type AgentKey,
  type ReportContent,
  type ReportDto,
  type ReportListItem,
  type ReportsQuery,
  type ReportType,
} from '@stockroom/shared';
import type { Prisma } from '#generated/prisma/client.ts';
import type { Db } from '../db/client';
import { toJson } from '../db/json';
import { inTransaction } from '../db/tx';
import { type Actor, assertCan } from '../domain/actor';
import { writeAudit } from '../domain/audit';
import { notFound } from '../domain/errors';
import type { EventBus } from '../domain/events';
import { toCsv } from '../lib/csv';
import type { DashboardService } from './dashboard.service';
import { getOrgSettings, localDay, pageArgs, pageMeta, startOfLocalDay } from './support';

/** Raw facts for a briefing; the Report Writer turns them into content and a narrative. */
export interface BriefingFacts {
  periodStart: Date;
  periodEnd: Date;
  days: number;
  sales: { revenue: number; prevRevenue: number; units: number; prevUnits: number };
  stock: {
    inventoryValue: number;
    outOfStock: number;
    needsReorder: number;
    fillRate: number | null;
    openPurchaseOrders: { count: number; value: number; overdue: number };
  };
  alerts: { created: Record<string, number>; resolved: number; openCritical: number; openHigh: number };
  purchasing: { created: number; createdValue: number; received: number; byAgents: number };
  risks: Array<{ title: string; detail: string; severity: string; productId: string | null }>;
  agents: Array<{
    agentKey: AgentKey;
    runs: number;
    aiRuns: number;
    proposals: number;
    executed: number;
    rejected: number;
  }>;
  pending: Array<{ id: string; title: string; agentKey: AgentKey; summary: string; createdAt: string }>;
}

const excerpt = (text: string) => {
  const first = text.trim().split(/(?<=[.!?])\s/)[0] ?? '';
  return first.length > 220 ? `${first.slice(0, 217)}…` : first;
};

export class ReportService {
  constructor(
    private readonly prisma: Db,
    private readonly bus: EventBus,
    private readonly dashboard: DashboardService,
  ) {}

  /** Everything the briefing says, measured over the last `days` business days up to now. */
  async collect(days: number): Promise<BriefingFacts> {
    const org = await getOrgSettings(this.prisma);
    const today = localDay(new Date(), org.timezone);
    const startDay = (() => {
      const d = new Date(`${today}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() - days);
      return d.toISOString().slice(0, 10);
    })();
    const periodStart = startOfLocalDay(startDay, org.timezone);
    const periodEnd = new Date();
    const since = { gte: periodStart };

    const overview = await this.dashboard.overview(30);
    const salesRows = await this.prisma.$queryRaw<
      Array<{ revenue: number; prev_revenue: number; units: number; prev_units: number }>
    >`
      SELECT COALESCE(SUM(revenue) FILTER (WHERE date >= ${today}::date - ${days}::int), 0)::float8 AS revenue,
             COALESCE(SUM(revenue) FILTER (WHERE date < ${today}::date - ${days}::int), 0)::float8 AS prev_revenue,
             COALESCE(SUM(quantity) FILTER (WHERE date >= ${today}::date - ${days}::int), 0)::int AS units,
             COALESCE(SUM(quantity) FILTER (WHERE date < ${today}::date - ${days}::int), 0)::int AS prev_units
      FROM sales_daily
      -- Sales use complete days (a morning briefing covers yesterday), compared with the period before.
      WHERE date >= ${today}::date - ${2 * days}::int AND date < ${today}::date`;
    const s = salesRows[0] ?? { revenue: 0, prev_revenue: 0, units: 0, prev_units: 0 };

    const [createdAlerts, resolved, pos, received, runs, actions, pending, risks] = await Promise.all([
      this.prisma.alert.groupBy({ by: ['type'], where: { createdAt: since }, _count: { _all: true } }),
      this.prisma.alert.count({ where: { resolvedAt: since } }),
      this.prisma.purchaseOrder.findMany({
        where: { createdAt: since, status: { not: 'CANCELLED' } },
        select: { total: true, createdByType: true },
      }),
      this.prisma.goodsReceipt.count({ where: { receivedAt: since } }),
      this.prisma.agentRun.findMany({
        where: { createdAt: since },
        select: { mode: true, agent: { select: { key: true } } },
      }),
      this.prisma.agentAction.findMany({
        where: { OR: [{ createdAt: since }, { decidedAt: since }] },
        select: { status: true, createdAt: true, agent: { select: { key: true } } },
      }),
      this.prisma.agentAction.findMany({
        where: { status: 'PENDING' },
        orderBy: { createdAt: 'asc' },
        take: 8,
        select: { id: true, title: true, summary: true, createdAt: true, agent: { select: { key: true } } },
      }),
      this.prisma.alert.findMany({
        where: { status: { in: ['OPEN', 'ACKNOWLEDGED'] }, severity: { in: ['CRITICAL', 'HIGH'] } },
        orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
        take: 6,
        select: { title: true, message: true, severity: true, productId: true },
      }),
    ]);

    const agents = new Map<AgentKey, BriefingFacts['agents'][number]>();
    const agentRow = (key: AgentKey) => {
      let row = agents.get(key);
      if (!row)
        agents.set(
          key,
          (row = { agentKey: key, runs: 0, aiRuns: 0, proposals: 0, executed: 0, rejected: 0 }),
        );
      return row;
    };
    for (const r of runs) {
      const row = agentRow(r.agent.key as AgentKey);
      row.runs++;
      if (r.mode === 'AI') row.aiRuns++;
    }
    for (const a of actions) {
      const row = agentRow(a.agent.key as AgentKey);
      if (a.createdAt >= periodStart) row.proposals++;
      if (a.status === 'EXECUTED') row.executed++;
      if (a.status === 'REJECTED') row.rejected++;
    }

    const k = overview.kpis;
    return {
      periodStart,
      periodEnd,
      days,
      sales: { revenue: s.revenue, prevRevenue: s.prev_revenue, units: s.units, prevUnits: s.prev_units },
      stock: {
        inventoryValue: Number(k.inventoryValue.current),
        outOfStock: k.outOfStock,
        needsReorder: k.needsReorder,
        fillRate: k.fillRate.current,
        openPurchaseOrders: {
          count: k.openPurchaseOrders.count,
          value: Number(k.openPurchaseOrders.value),
          overdue: k.openPurchaseOrders.overdue,
        },
      },
      alerts: {
        created: Object.fromEntries(createdAlerts.map((g) => [g.type, g._count._all])),
        resolved,
        openCritical: k.openAlerts.critical,
        openHigh: k.openAlerts.high,
      },
      purchasing: {
        created: pos.length,
        createdValue: pos.reduce((a, p) => a + Number(p.total), 0),
        received,
        byAgents: pos.filter((p) => p.createdByType === 'AGENT').length,
      },
      risks: risks.map((r) => ({
        title: r.title,
        detail: r.message,
        severity: r.severity,
        productId: r.productId,
      })),
      agents: [...agents.values()].sort((a, b) => b.runs - a.runs),
      pending: pending.map((p) => ({
        id: p.id,
        title: p.title,
        agentKey: p.agent.key as AgentKey,
        summary: p.summary,
        createdAt: p.createdAt.toISOString(),
      })),
    };
  }

  async create(
    actor: Actor,
    runId: string | null,
    input: {
      type: ReportType;
      title: string;
      periodStart: Date;
      periodEnd: Date;
      content: ReportContent;
      narrativeSource: 'AI' | 'RULE';
      modelUsed: string | null;
    },
  ): Promise<string> {
    assertCan(actor, 'inventory.view');
    return inTransaction(this.prisma, this.bus, async (tx, emit) => {
      const r = await tx.report.create({
        data: { ...input, content: toJson(input.content), runId },
        select: { id: true },
      });
      await writeAudit(tx, actor, {
        action: 'report.create',
        entityType: 'Report',
        entityId: r.id,
        summary: `Wrote ${input.title}`,
      });
      emit('report.created', { reportId: r.id, type: input.type });
      return r.id;
    });
  }

  private toItem(r: Prisma.ReportGetPayload<object>): ReportListItem {
    const content = r.content as ReportContent;
    return {
      id: r.id,
      type: r.type,
      title: r.title,
      periodStart: r.periodStart.toISOString(),
      periodEnd: r.periodEnd.toISOString(),
      narrativeSource: r.narrativeSource,
      modelUsed: r.modelUsed,
      runId: r.runId,
      createdAt: r.createdAt.toISOString(),
      excerpt: excerpt(content.narrative ?? ''),
    };
  }

  async list(q: ReportsQuery) {
    const where: Prisma.ReportWhereInput = { type: q.type };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.report.count({ where }),
      this.prisma.report.findMany({ where, orderBy: { createdAt: 'desc' }, ...pageArgs(q) }),
    ]);
    return { data: rows.map((r) => this.toItem(r)), meta: pageMeta(q, total) };
  }

  async get(id: string): Promise<ReportDto> {
    const r = await this.prisma.report.findUnique({ where: { id } });
    if (!r) throw notFound('Report');
    return { ...this.toItem(r), content: r.content as ReportContent };
  }

  /** The report with the organization's name, for PDF export. */
  async forExport(id: string): Promise<{ report: ReportDto; organization: string }> {
    const [report, org] = await Promise.all([this.get(id), getOrgSettings(this.prisma)]);
    return { report, organization: org.name };
  }

  /** Every figure in the report as rows: section, item, value, detail. */
  async csv(id: string): Promise<{ filename: string; body: string }> {
    const r = await this.get(id);
    const c = r.content;
    const rows: Array<Array<string | number>> = [
      ...c.kpis.map((k) => ['KPI', k.label, k.value, k.change ?? '']),
      ...c.changes.map((line) => ['Change', line, '', '']),
      ...c.risks.map((x) => ['Risk', x.title, x.severity, x.detail]),
      ...c.agentActivity.map((a) => [
        'Agent activity',
        a.agent,
        a.runs,
        `${a.aiRuns} with AI, ${a.proposals} proposals, ${a.executed} executed, ${a.rejected} rejected`,
      ]),
      ...c.pendingDecisions.map((p) => ['Waiting for a decision', p.title, p.agent, p.summary]),
      [
        'Narrative',
        r.narrativeSource === 'AI' ? `AI (${r.modelUsed ?? 'model'})` : 'Rule-based',
        '',
        c.narrative,
      ],
    ];
    return {
      filename: `${r.type === 'WEEKLY_SUMMARY' ? 'weekly-summary' : 'daily-briefing'}-${r.periodEnd.slice(0, 10)}.csv`,
      body: toCsv(['Section', 'Item', 'Value', 'Detail'], rows),
    };
  }

  async latest(type?: ReportType): Promise<ReportDto | null> {
    const r = await this.prisma.report.findFirst({ where: { type }, orderBy: { createdAt: 'desc' } });
    return r ? { ...this.toItem(r), content: r.content as ReportContent } : null;
  }
}

export const agentName = (key: AgentKey) => AGENT_LABELS[key] ?? key;
