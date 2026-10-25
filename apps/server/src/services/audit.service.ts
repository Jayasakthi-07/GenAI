import type { AuditEntry, AuditFacets, AuditQuery } from '@stockroom/shared';
import type { Prisma } from '#generated/prisma/client.ts';
import type { Db } from '../db/client';
import { type Actor, assertCan } from '../domain/actor';
import {
  AGENT_NAMES,
  decodeCursor,
  encodeCursor,
  getOrgSettings,
  startOfLocalDay,
  userNames,
} from './support';

export class AuditService {
  constructor(private readonly prisma: Db) {}

  async list(
    actor: Actor,
    q: AuditQuery,
    scope?: { entityType: string; entityId: string },
  ): Promise<{ data: AuditEntry[]; nextCursor: string | null }> {
    // An entity's own history (e.g. a product's Activity tab) is visible to anyone who can see the entity.
    assertCan(actor, scope ? 'inventory.view' : 'audit.view');
    const cursor = decodeCursor(q.cursor);
    const tz = (await getOrgSettings(this.prisma)).timezone;
    const where: Prisma.AuditLogWhereInput = {
      actorType: q.actorType?.length ? { in: q.actorType } : undefined,
      actorUserId: q.userId,
      agentKey: q.agentKey,
      entityType: scope?.entityType ?? q.entityType,
      entityId: scope?.entityId ?? q.entityId,
      action: q.action ? { startsWith: q.action } : undefined,
      createdAt: {
        gte: q.from ? startOfLocalDay(q.from, tz) : undefined,
        lt: q.to ? new Date(startOfLocalDay(q.to, tz).getTime() + 86_400_000) : undefined,
      },
      ...(q.q ? { summary: { contains: q.q, mode: 'insensitive' } } : {}),
      ...(cursor
        ? {
            AND: [
              { OR: [{ createdAt: { lt: cursor.at } }, { createdAt: cursor.at, id: { lt: cursor.id } }] },
            ],
          }
        : {}),
    };
    const rows = await this.prisma.auditLog.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: q.limit + 1,
    });
    const page = rows.slice(0, q.limit);
    const names = await userNames(
      this.prisma,
      page.map((r) => r.actorUserId),
    );
    const last = page.at(-1);
    return {
      data: page.map((r) => ({
        id: r.id,
        createdAt: r.createdAt.toISOString(),
        actorType: r.actorType,
        actorName:
          r.actorType === 'AGENT'
            ? (r.agentKey && AGENT_NAMES[r.agentKey]) || 'Agent'
            : r.actorType === 'USER'
              ? ((r.actorUserId && names.get(r.actorUserId)) ?? 'Unknown user')
              : r.actorType === 'SIMULATOR'
                ? 'Simulator'
                : 'System',
        agentKey: r.agentKey,
        agentRunId: r.agentRunId,
        action: r.action,
        entityType: r.entityType,
        entityId: r.entityId,
        summary: r.summary,
        before: r.before ?? null,
        after: r.after ?? null,
      })),
      nextCursor: rows.length > q.limit && last ? encodeCursor(last.createdAt, last.id) : null,
    };
  }

  async facets(actor: Actor): Promise<AuditFacets> {
    assertCan(actor, 'audit.view');
    const [users, entities, actions] = await Promise.all([
      this.prisma.user.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
      this.prisma.auditLog.findMany({
        distinct: ['entityType'],
        select: { entityType: true },
        orderBy: { entityType: 'asc' },
      }),
      this.prisma.auditLog.findMany({
        distinct: ['action'],
        select: { action: true },
        orderBy: { action: 'asc' },
      }),
    ]);
    return { users, entityTypes: entities.map((e) => e.entityType), actions: actions.map((a) => a.action) };
  }
}
