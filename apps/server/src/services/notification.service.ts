import {
  AGENT_LABELS,
  type AgentKey,
  type MarkRead,
  type NotificationDto,
  type NotificationList,
  type NotificationType,
  type Permission,
  REPORT_TYPE_LABELS,
  roleCan,
  type Severity,
  userPreferencesSchema,
} from '@stockroom/shared';
import type { Db } from '../db/client';
import type { Actor } from '../domain/actor';
import { unauthenticated } from '../domain/errors';
import type { EventBus } from '../domain/events';
import { iso } from './support';

/** Each user keeps their most recent notifications only. */
const KEEP_PER_USER = 200;
/** Alerts and proposals often arrive in bursts from one agent run; they're grouped into one notification. */
const BURST_MS = 3000;

interface Draft {
  type: NotificationType;
  title: string;
  body: string | null;
  link: string | null;
  severity: Severity | null;
}

const WHO_GETS: Record<NotificationType, Permission> = {
  alert: 'inventory.view',
  approval: 'actions.approve',
  run_failed: 'agents.configure',
  po_received: 'purchase_orders.create',
  report_ready: 'inventory.view',
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
/** Notifications belong to a person; agents and the system have none. */
const ownerOf = (actor: Actor) => {
  if (actor.type !== 'user') throw unauthenticated();
  return actor.userId;
};
const SEVERITY_RANK: Record<Severity, number> = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1, INFO: 0 };

/**
 * In-app notifications. Listens to domain events, decides who should hear about them (by role and
 * preferences), stores them and announces each one on the bus for the recipient's event stream.
 */
export class NotificationService {
  private readonly bursts = new Map<'alert' | 'approval', { drafts: Draft[]; timer: NodeJS.Timeout }>();
  private unsubscribers: Array<() => void> = [];
  private readonly inflight = new Set<Promise<void>>();

  private onError: (err: unknown) => void = () => {};

  constructor(
    private readonly prisma: Db,
    private readonly bus: EventBus,
  ) {}

  start(onError: (err: unknown) => void): void {
    if (this.unsubscribers.length) return;
    this.onError = onError;
    const run = (fn: () => Promise<void>) => {
      const p = fn()
        .catch(this.onError)
        .finally(() => this.inflight.delete(p));
      this.inflight.add(p);
    };
    this.unsubscribers = [
      this.bus.on('alert.created', (e) => {
        if (e.payload.severity === 'CRITICAL' || e.payload.severity === 'HIGH')
          run(() => this.fromAlert(e.payload.alertId));
      }),
      this.bus.on('action.created', (e) => {
        if (e.payload.status === 'PENDING') run(() => this.fromAction(e.payload.actionId));
      }),
      this.bus.on('agent.run.finished', (e) => {
        if (e.payload.status === 'FAILED') run(() => this.fromFailedRun(e.payload.runId));
      }),
      this.bus.on('po.received', (e) => run(() => this.fromReceipt(e.payload.goodsReceiptId))),
      this.bus.on('report.created', (e) => run(() => this.fromReport(e.payload.reportId))),
    ];
  }

  /** Stops listening, then finishes what is in progress and delivers anything waiting in a burst. */
  async stop(): Promise<void> {
    for (const off of this.unsubscribers) off();
    this.unsubscribers = [];
    await Promise.allSettled(this.inflight);
    const pending = [...this.bursts.keys()];
    await Promise.all(pending.map((k) => this.flush(k)));
  }

  async list(actor: Actor, q: { unread: boolean; limit: number }): Promise<NotificationList> {
    const userId = ownerOf(actor);
    const [rows, unread] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId, ...(q.unread ? { readAt: null } : {}) },
        orderBy: { createdAt: 'desc' },
        take: q.limit,
      }),
      this.prisma.notification.count({ where: { userId, readAt: null } }),
    ]);
    return {
      data: rows.map((n): NotificationDto => ({
        id: n.id,
        type: n.type as NotificationType,
        title: n.title,
        body: n.body,
        link: n.link,
        severity: n.severity,
        readAt: iso(n.readAt),
        createdAt: n.createdAt.toISOString(),
      })),
      unread,
    };
  }

  /** Marking your own notifications read is personal state, so it isn't audited. */
  async markRead(actor: Actor, input: MarkRead): Promise<{ updated: number; unread: number }> {
    const userId = ownerOf(actor);
    const { count } = await this.prisma.notification.updateMany({
      where: { userId, readAt: null, ...('ids' in input ? { id: { in: input.ids } } : {}) },
      data: { readAt: new Date() },
    });
    const unread = await this.prisma.notification.count({ where: { userId, readAt: null } });
    return { updated: count, unread };
  }

  private async fromAlert(alertId: string) {
    const a = await this.prisma.alert.findUnique({
      where: { id: alertId },
      select: { title: true, message: true, severity: true, productId: true },
    });
    if (!a) return;
    this.queue('alert', {
      type: 'alert',
      title: a.title,
      body: a.message,
      link: a.productId ? `/alerts?productId=${a.productId}` : '/alerts',
      severity: a.severity,
    });
  }

  private async fromAction(actionId: string) {
    const a = await this.prisma.agentAction.findUnique({
      where: { id: actionId },
      select: { title: true, summary: true, status: true, agent: { select: { key: true } } },
    });
    // Auto-executed proposals never wait for anyone.
    if (!a || a.status !== 'PENDING') return;
    this.queue('approval', {
      type: 'approval',
      title: a.title,
      body: `${AGENT_LABELS[a.agent.key as AgentKey] ?? a.agent.key} proposes: ${a.summary}`,
      link: `/approvals?id=${actionId}`,
      severity: null,
    });
  }

  private async fromFailedRun(runId: string) {
    const r = await this.prisma.agentRun.findUnique({
      where: { id: runId },
      select: { error: true, agent: { select: { key: true } } },
    });
    if (!r) return;
    const agent = AGENT_LABELS[r.agent.key as AgentKey] ?? r.agent.key;
    await this.deliver({
      type: 'run_failed',
      title: `${agent} run failed`,
      body:
        (r.error as { message?: string } | null)?.message ??
        'The run stopped with an error. Open it to see the steps.',
      link: `/agents/runs/${runId}`,
      severity: 'MEDIUM',
    });
  }

  private async fromReceipt(goodsReceiptId: string) {
    const g = await this.prisma.goodsReceipt.findUnique({
      where: { id: goodsReceiptId },
      select: {
        number: true,
        purchaseOrderId: true,
        purchaseOrder: { select: { number: true, status: true, supplier: { select: { name: true } } } },
        _count: { select: { lines: true } },
      },
    });
    if (!g) return;
    const po = g.purchaseOrder;
    await this.deliver({
      type: 'po_received',
      title: `${po.number} ${po.status === 'PARTIALLY_RECEIVED' ? 'partly received' : 'received'}`,
      body: `${g.number}: ${plural(g._count.lines, 'line')} from ${po.supplier.name}.`,
      link: `/purchase-orders/${g.purchaseOrderId}`,
      severity: null,
    });
  }

  private async fromReport(reportId: string) {
    const r = await this.prisma.report.findUnique({
      where: { id: reportId },
      select: { title: true, type: true, narrativeSource: true },
    });
    if (!r) return;
    await this.deliver({
      type: 'report_ready',
      title: r.title,
      body: `${REPORT_TYPE_LABELS[r.type]} is ready${r.narrativeSource === 'AI' ? ', written by AI' : ''}.`,
      link: `/reports/${reportId}`,
      severity: null,
    });
  }

  private queue(key: 'alert' | 'approval', draft: Draft) {
    const burst = this.bursts.get(key);
    if (burst) {
      burst.drafts.push(draft);
      return;
    }
    const timer = setTimeout(() => void this.flush(key).catch(this.onError), BURST_MS);
    timer.unref();
    this.bursts.set(key, { drafts: [draft], timer });
  }

  private async flush(key: 'alert' | 'approval') {
    const burst = this.bursts.get(key);
    if (!burst) return;
    clearTimeout(burst.timer);
    this.bursts.delete(key);
    const { drafts } = burst;
    if (drafts.length === 1) return this.deliver(drafts[0]!);
    const top = drafts.reduce((a, b) =>
      SEVERITY_RANK[b.severity ?? 'INFO'] > SEVERITY_RANK[a.severity ?? 'INFO'] ? b : a,
    );
    const others = drafts.length - 1;
    await this.deliver(
      key === 'alert'
        ? {
            type: 'alert',
            title: plural(drafts.length, 'new urgent alert'),
            body: `${top.title}, and ${plural(others, 'other')}.`,
            link: '/alerts',
            severity: top.severity,
          }
        : {
            type: 'approval',
            title: `${plural(drafts.length, 'proposal')} waiting for approval`,
            body: `${top.title}, and ${plural(others, 'other')}.`,
            link: '/approvals',
            severity: null,
          },
    );
  }

  private async deliver(draft: Draft) {
    const users = await this.prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, role: true, preferences: true },
    });
    for (const u of users) {
      if (!roleCan(u.role, WHO_GETS[draft.type])) continue;
      const prefs = userPreferencesSchema.safeParse(u.preferences ?? {});
      const channel = (prefs.success ? prefs.data : userPreferencesSchema.parse({})).notifications[
        draft.type
      ];
      if (!channel.inApp && !channel.toast) continue;
      let notificationId: string | null = null;
      if (channel.inApp) {
        const n = await this.prisma.notification.create({
          data: { userId: u.id, ...draft },
          select: { id: true },
        });
        notificationId = n.id;
        await this.prune(u.id);
      }
      this.bus.emit('notification.created', {
        notificationId,
        userId: u.id,
        type: draft.type,
        title: draft.title,
        body: draft.body,
        severity: draft.severity,
        link: draft.link,
        toast: channel.toast,
      });
    }
  }

  private async prune(userId: string) {
    await this.prisma.$executeRaw`
      DELETE FROM notifications
      WHERE user_id = ${userId}::uuid
        AND id NOT IN (SELECT id FROM notifications WHERE user_id = ${userId}::uuid
                       ORDER BY created_at DESC LIMIT ${KEEP_PER_USER})`;
  }
}
