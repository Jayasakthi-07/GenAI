import {
  type UpdatePreferences,
  type UserCreate,
  type UserListItem,
  type UserPreferences,
  type UserUpdate,
  userCreateSchema,
  userPreferencesSchema,
  userUpdateSchema,
} from '@stockroom/shared';
import type { Db } from '../db/client';
import { type Actor, assertCan } from '../domain/actor';
import { writeAudit } from '../domain/audit';
import { AppError, conflict, notFound, unauthenticated } from '../domain/errors';
import { hashPassword } from './password';
import { iso } from './support';

type UserRow = {
  id: string;
  email: string;
  name: string;
  role: UserListItem['role'];
  isActive: boolean;
  mustChangePassword: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
};

const toItem = (u: UserRow): UserListItem => ({
  id: u.id,
  email: u.email,
  name: u.name,
  role: u.role,
  isActive: u.isActive,
  mustChangePassword: u.mustChangePassword,
  lastLoginAt: iso(u.lastLoginAt),
  createdAt: u.createdAt.toISOString(),
});

export class UserService {
  constructor(private readonly prisma: Db) {}

  /** Personal UI preferences. Not audited: they only affect the user's own view. */
  async updatePreferences(actor: Actor, patch: UpdatePreferences): Promise<UserPreferences> {
    if (actor.type !== 'user') throw unauthenticated();
    const user = await this.prisma.user.findUnique({
      where: { id: actor.userId },
      select: { preferences: true },
    });
    if (!user) throw unauthenticated();
    const current = userPreferencesSchema.parse(user.preferences ?? {});
    const next = userPreferencesSchema.parse({
      ...current,
      ...patch,
      notifications: { ...current.notifications, ...patch.notifications },
      onboarding: { ...current.onboarding, ...patch.onboarding },
    });
    await this.prisma.user.update({ where: { id: actor.userId }, data: { preferences: next } });
    return next;
  }

  async list(actor: Actor): Promise<UserListItem[]> {
    assertCan(actor, 'users.manage');
    const rows = await this.prisma.user.findMany({ orderBy: [{ isActive: 'desc' }, { name: 'asc' }] });
    return rows.map(toItem);
  }

  async create(actor: Actor, raw: UserCreate): Promise<UserListItem> {
    assertCan(actor, 'users.manage');
    const input = userCreateSchema.parse(raw);
    if (await this.prisma.user.findUnique({ where: { email: input.email } })) {
      throw conflict(`${input.email} already has an account.`, { fields: { email: 'Already used' } });
    }
    const passwordHash = await hashPassword(input.password);
    return this.prisma.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: {
          email: input.email,
          name: input.name,
          role: input.role,
          passwordHash,
          mustChangePassword: true,
        },
      });
      await writeAudit(tx, actor, {
        action: 'user.create',
        entityType: 'User',
        entityId: u.id,
        summary: `Added ${u.name} (${u.role.toLowerCase()})`,
        after: { email: u.email, name: u.name, role: u.role },
      });
      return toItem(u);
    });
  }

  async update(actor: Actor, id: string, raw: UserUpdate): Promise<UserListItem> {
    assertCan(actor, 'users.manage');
    const input = userUpdateSchema.parse(raw);
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.user.findUnique({ where: { id } });
      if (!before) throw notFound('User');
      if (actor.type === 'user' && actor.userId === id && (input.role !== before.role || !input.isActive)) {
        throw new AppError(
          'VALIDATION_ERROR',
          'You can’t change your own role or deactivate yourself. Ask another admin.',
        );
      }
      // There must always be an active admin.
      if (before.role === 'ADMIN' && (input.role !== 'ADMIN' || !input.isActive)) {
        const admins = await tx.user.count({ where: { role: 'ADMIN', isActive: true, id: { not: id } } });
        if (!admins) throw new AppError('VALIDATION_ERROR', 'At least one active admin is required.');
      }
      const u = await tx.user.update({ where: { id }, data: input });
      if (!input.isActive || input.role !== before.role)
        await tx.session.deleteMany({ where: { userId: id } });
      await writeAudit(tx, actor, {
        action: 'user.update',
        entityType: 'User',
        entityId: id,
        summary: `Updated ${u.name}${!input.isActive && before.isActive ? ' (deactivated)' : ''}`,
        before: { name: before.name, role: before.role, isActive: before.isActive },
        after: input,
      });
      return toItem(u);
    });
  }

  async resetPassword(actor: Actor, id: string, password: string): Promise<void> {
    assertCan(actor, 'users.manage');
    const passwordHash = await hashPassword(password);
    await this.prisma.$transaction(async (tx) => {
      const u = await tx.user.findUnique({ where: { id } });
      if (!u) throw notFound('User');
      await tx.user.update({ where: { id }, data: { passwordHash, mustChangePassword: true } });
      await tx.session.deleteMany({ where: { userId: id } });
      await writeAudit(tx, actor, {
        action: 'user.reset_password',
        entityType: 'User',
        entityId: id,
        summary: `Reset ${u.name}’s password`,
      });
    });
  }
}
