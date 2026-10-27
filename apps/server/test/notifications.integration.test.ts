import type { NotificationList } from '@stockroom/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';
import type { DomainEvents } from '../src/domain/events';
import { type Client, type Fixture, seedInventoryFixture, signIn } from './fixtures';
import { createTestApp, resetDatabase } from './helpers';

const url = inject('testDbUrl');

describe.skipIf(!url)('Notifications (integration)', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  let fx: Fixture;
  let manager: Client;
  let staff: Client;
  const announced: Array<DomainEvents['notification.created']> = [];

  const alert = (title: string, severity: 'CRITICAL' | 'HIGH' | 'MEDIUM') =>
    ctx.prisma.alert.create({
      data: {
        type: 'LOW_STOCK',
        severity,
        priority: 50,
        title,
        message: `${title}: 3 left`,
        explanationSource: 'RULE',
        productId: fx.rice.id,
        warehouseId: fx.chn.id,
        data: {},
        dedupeKey: `test:${title}`,
      },
    });
  /** Delivers whatever is waiting in a burst now instead of after the grouping window. */
  const settle = async () => {
    await ctx.app.services.notifications.stop();
    ctx.app.services.notifications.start((err) => {
      throw err;
    });
  };

  beforeAll(async () => {
    ctx = await createTestApp(url);
    await resetDatabase(ctx.prisma);
    fx = await seedInventoryFixture(ctx.prisma);
    await ctx.app.services.agents.ensureDefinitions();
    manager = await signIn(ctx.app, 'manager@fixture.example');
    staff = await signIn(ctx.app, 'staff@fixture.example');
    ctx.app.bus.on('notification.created', (e) => announced.push(e.payload));
  });
  afterAll(async () => {
    await ctx?.app.close();
    await ctx?.prisma.$disconnect();
  });
  beforeEach(async () => {
    await ctx.prisma.notification.deleteMany();
    announced.length = 0;
  });

  it('notifies everyone of an urgent alert, and ignores lower severities', async () => {
    const a = await alert('Rice is almost out', 'CRITICAL');
    const b = await alert('Milk is running low', 'MEDIUM');
    ctx.app.bus.emit('alert.created', { alertId: a.id, type: a.type, severity: a.severity });
    ctx.app.bus.emit('alert.created', { alertId: b.id, type: b.type, severity: b.severity });
    await settle();

    const mine = await staff.get<NotificationList>('/notifications');
    expect(mine.status).toBe(200);
    expect(mine.body.unread).toBe(1);
    expect(mine.body.data[0]).toMatchObject({
      type: 'alert',
      title: 'Rice is almost out',
      severity: 'CRITICAL',
      link: `/alerts?productId=${fx.rice.id}`,
      readAt: null,
    });
    // Admin, manager and staff each get one.
    expect(announced).toHaveLength(3);
    expect(announced.every((n) => n.toast)).toBe(true);
  });

  it('groups a burst of alerts into one notification', async () => {
    const created = await Promise.all([
      alert('Rice is out at Chennai', 'HIGH'),
      alert('Milk is out at Chennai', 'CRITICAL'),
      alert('Rice is out at Coimbatore', 'HIGH'),
    ]);
    for (const a of created)
      ctx.app.bus.emit('alert.created', { alertId: a.id, type: a.type, severity: a.severity });
    await settle();

    const { body } = await manager.get<NotificationList>('/notifications');
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({
      title: '3 new urgent alerts',
      body: 'Milk is out at Chennai, and 2 others.',
      severity: 'CRITICAL',
      link: '/alerts',
    });
  });

  it('sends approval requests only to people who can approve', async () => {
    const agent = await ctx.prisma.agentDefinition.findUniqueOrThrow({
      where: { key: 'replenishment_planner' },
    });
    const action = await ctx.prisma.agentAction.create({
      data: {
        agentId: agent.id,
        type: 'CREATE_PURCHASE_ORDER',
        status: 'PENDING',
        title: 'Order 120 Ponni Rice for Chennai',
        summary: 'Cover runs out in 3 days.',
        rationale: 'Below the reorder point.',
        rationaleSource: 'RULE',
        payload: {},
        expectedImpact: {},
        dataUsed: {},
        riskLevel: 'MEDIUM',
        dedupeKey: 'test:po',
      },
    });
    ctx.app.bus.emit('action.created', {
      actionId: action.id,
      agentKey: 'replenishment_planner',
      type: action.type,
      status: 'PENDING',
    });
    await settle();

    expect((await staff.get<NotificationList>('/notifications')).body.data).toHaveLength(0);
    const { body } = await manager.get<NotificationList>('/notifications');
    expect(body.data[0]).toMatchObject({
      type: 'approval',
      title: 'Order 120 Ponni Rice for Chennai',
      link: `/approvals?id=${action.id}`,
    });
  });

  it('respects preferences: no stored notification, toast only, or nothing', async () => {
    await manager.patch('/me/preferences', { notifications: { alert: { inApp: false, toast: true } } });
    await staff.patch('/me/preferences', { notifications: { alert: { inApp: false, toast: false } } });
    const a = await alert('Rice is out', 'CRITICAL');
    ctx.app.bus.emit('alert.created', { alertId: a.id, type: a.type, severity: a.severity });
    await settle();

    expect((await manager.get<NotificationList>('/notifications')).body.data).toHaveLength(0);
    expect((await staff.get<NotificationList>('/notifications')).body.data).toHaveLength(0);
    const toManager = announced.find((n) => n.userId === fx.users.manager.id);
    expect(toManager).toMatchObject({ notificationId: null, toast: true });
    expect(announced.some((n) => n.userId === fx.users.staff.id)).toBe(false);
    // Other preferences are untouched by the partial update.
    const me = await manager.get<{ user: { preferences: { notifications: Record<string, unknown> } } }>(
      '/auth/me',
    );
    expect(me.body.user.preferences.notifications.approval).toEqual({ inApp: true, toast: true });

    await manager.patch('/me/preferences', { notifications: { alert: { inApp: true, toast: true } } });
    await staff.patch('/me/preferences', { notifications: { alert: { inApp: true, toast: true } } });
  });

  it('marks notifications read, one at a time or all at once', async () => {
    for (const title of ['First', 'Second']) {
      const a = await alert(title, 'HIGH');
      ctx.app.bus.emit('alert.created', { alertId: a.id, type: a.type, severity: a.severity });
      await settle();
    }
    const list = await manager.get<NotificationList>('/notifications');
    expect(list.body.unread).toBe(2);

    const one = await manager.post<{ updated: number; unread: number }>('/notifications/read', {
      ids: [list.body.data[0]!.id],
    });
    expect(one.body).toEqual({ updated: 1, unread: 1 });
    // Someone else's notifications can't be touched.
    const theirs = await staff.post<{ updated: number }>('/notifications/read', {
      ids: [list.body.data[1]!.id],
    });
    expect(theirs.body.updated).toBe(0);

    const all = await manager.post<{ updated: number; unread: number }>('/notifications/read', { all: true });
    expect(all.body).toEqual({ updated: 1, unread: 0 });
    expect((await manager.get<NotificationList>('/notifications?unread=1')).body.data).toHaveLength(0);
  });
});
