import { createHash, randomBytes } from 'node:crypto';
import {
  type ChangePasswordRequest,
  type MeResponse,
  PERMISSIONS,
  type Role,
  type SessionUser,
  roleCan,
  userPreferencesSchema,
} from '@stockroom/shared';
import type { Db } from '../db/client';
import type { Actor } from '../domain/actor';
import { writeAudit } from '../domain/audit';
import { AppError, unauthenticated } from '../domain/errors';
import type { EventBus } from '../domain/events';
import { dummyPasswordHash, hashPassword, verifyPassword } from './password';

const TOUCH_INTERVAL_MS = 5 * 60 * 1000;

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

interface UserRow {
  id: string;
  email: string;
  name: string;
  role: Role;
  mustChangePassword: boolean;
  preferences: unknown;
}

function toSessionUser(user: UserRow): SessionUser {
  const preferences = userPreferencesSchema.safeParse(user.preferences ?? {});
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    mustChangePassword: user.mustChangePassword,
    preferences: preferences.success ? preferences.data : userPreferencesSchema.parse({}),
  };
}

export interface SessionInfo {
  user: SessionUser;
  sessionId: string;
}

export class AuthService {
  constructor(
    private readonly prisma: Db,
    private readonly bus: EventBus,
    private readonly sessionTtlHours: number,
  ) {}

  async login(
    email: string,
    password: string,
    meta: { ip?: string; userAgent?: string },
  ): Promise<{ user: SessionUser; token: string; expiresAt: Date }> {
    const user = await this.prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
    const valid = user
      ? await verifyPassword(user.passwordHash, password)
      : await verifyPassword(await dummyPasswordHash(), password).then(() => false);

    if (!user || !valid || !user.isActive) {
      throw new AppError(
        'UNAUTHENTICATED',
        user && valid && !user.isActive
          ? 'This account is deactivated. Ask an admin to re-activate it.'
          : 'Email or password is incorrect.',
      );
    }

    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + this.sessionTtlHours * 3_600_000);
    const actor: Actor = { type: 'user', userId: user.id, role: user.role, name: user.name, ip: meta.ip };

    await this.prisma.$transaction(async (tx) => {
      await tx.session.create({
        data: {
          tokenHash: hashToken(token),
          userId: user.id,
          expiresAt,
          ip: meta.ip ?? null,
          userAgent: meta.userAgent?.slice(0, 300) ?? null,
        },
      });
      await tx.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
      await writeAudit(tx, actor, {
        action: 'auth.login',
        entityType: 'User',
        entityId: user.id,
        summary: 'Signed in',
      });
    });
    // Opportunistic cleanup keeps the sessions table small without a separate job.
    await this.prisma.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });

    this.bus.emit('user.signed_in', { userId: user.id });
    return { user: toSessionUser(user), token, expiresAt };
  }

  /** Resolves a cookie token to its user, or null when missing, expired or revoked. */
  async resolveSession(token: string): Promise<SessionInfo | null> {
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: true },
    });
    if (!session || session.expiresAt < new Date() || !session.user.isActive) return null;

    if (Date.now() - session.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
      await this.prisma.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } });
    }
    return { user: toSessionUser(session.user), sessionId: session.id };
  }

  async logout(token: string, actor: Actor): Promise<void> {
    const session = await this.prisma.session.findUnique({ where: { tokenHash: hashToken(token) } });
    if (!session) return;
    await this.prisma.$transaction(async (tx) => {
      await tx.session.delete({ where: { id: session.id } });
      await writeAudit(tx, actor, {
        action: 'auth.logout',
        entityType: 'User',
        entityId: session.userId,
        summary: 'Signed out',
      });
    });
  }

  async changePassword(actor: Actor, currentSessionId: string, input: ChangePasswordRequest): Promise<void> {
    if (actor.type !== 'user') throw unauthenticated();
    const user = await this.prisma.user.findUnique({ where: { id: actor.userId } });
    if (!user) throw unauthenticated();
    if (!(await verifyPassword(user.passwordHash, input.currentPassword))) {
      throw new AppError('VALIDATION_ERROR', 'Your current password is incorrect.', {
        fields: { currentPassword: 'Your current password is incorrect.' },
      });
    }
    const passwordHash = await hashPassword(input.newPassword);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { passwordHash, mustChangePassword: false } });
      // Sign out every other device.
      await tx.session.deleteMany({ where: { userId: user.id, id: { not: currentSessionId } } });
      await writeAudit(tx, actor, {
        action: 'auth.change_password',
        entityType: 'User',
        entityId: user.id,
        summary: 'Changed password and signed out other sessions',
      });
    });
    this.bus.emit('user.password_changed', { userId: user.id });
  }

  async me(user: SessionUser): Promise<MeResponse> {
    const org = await this.prisma.organization.findFirst({ orderBy: { createdAt: 'asc' } });
    return {
      user,
      permissions: PERMISSIONS.filter((p) => roleCan(user.role, p)),
      organization: {
        name: org?.name ?? 'Stockroom',
        currency: org?.currency ?? 'INR',
        locale: org?.locale ?? 'en-IN',
        timezone: org?.timezone ?? 'Asia/Kolkata',
      },
    };
  }
}
