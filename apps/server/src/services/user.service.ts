import { type UpdatePreferences, type UserPreferences, userPreferencesSchema } from '@stockroom/shared';
import type { Db } from '../db/client';
import type { Actor } from '../domain/actor';
import { unauthenticated } from '../domain/errors';

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
    const next = userPreferencesSchema.parse({ ...current, ...patch });
    await this.prisma.user.update({ where: { id: actor.userId }, data: { preferences: next } });
    return next;
  }
}
