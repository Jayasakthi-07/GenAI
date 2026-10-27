import type { DemoResetResult } from '@stockroom/shared';
import type { Db } from '../db/client';
import { seedDemoData } from '../demo/seed';
import { type Actor, assertCan } from '../domain/actor';
import { writeAudit } from '../domain/audit';
import { AppError } from '../domain/errors';
import type { EventBus } from '../domain/events';
import type { SimulationService } from '../simulation/simulator';
import type { SupplierService } from './supplier.service';
import { invalidateOrgSettings } from './support';

/** Configuration people set up by hand survives a reset; everything else is demo data. */
const KEPT_TABLES = ['provider_configs', 'model_capabilities', 'app_settings', 'agent_definitions'];

export interface ResetHooks {
  /** Before the data is replaced (e.g. stop the agent scheduler). */
  before(): Promise<void>;
  /** After (e.g. restart it and run the Stock Sentinel). */
  after(): Promise<void>;
}

/**
 * The one-click demo reset: reloads the deterministic dataset with history ending yesterday,
 * keeping AI and agent configuration, who is signed in and their personal preferences.
 */
export class DemoService {
  private resetting = false;
  private hooks: ResetHooks[] = [];

  constructor(
    private readonly prisma: Db,
    private readonly bus: EventBus,
    private readonly deps: { simulation: SimulationService; suppliers: SupplierService },
    private readonly config: { available: boolean; databaseUrl: string; seed: number },
  ) {}

  onReset(hooks: ResetHooks) {
    this.hooks.push(hooks);
  }

  async reset(actor: Actor): Promise<DemoResetResult> {
    assertCan(actor, 'demo.reset', 'Only admins can reset the demo data.');
    if (!this.config.available)
      throw new AppError('FORBIDDEN', 'Resetting is only possible in demo mode (DEMO_MODE=true in .env).');
    if (this.resetting) throw new AppError('CONFLICT', 'A reset is already running.');
    this.resetting = true;
    const started = performance.now();
    try {
      // Sessions and preferences are keyed by email: the dataset's user ids are stable, but
      // people may have been added or renamed since.
      const sessions = await this.prisma.session.findMany({
        where: { expiresAt: { gt: new Date() } },
        select: {
          tokenHash: true,
          expiresAt: true,
          ip: true,
          userAgent: true,
          user: { select: { email: true } },
        },
      });
      const preferences = await this.prisma.user.findMany({ select: { email: true, preferences: true } });

      await this.deps.simulation.stop();
      for (const h of this.hooks) await h.before();
      let today = '';
      try {
        const data = await seedDemoData({
          prisma: this.prisma,
          databaseUrl: this.config.databaseUrl,
          seed: this.config.seed,
          keepTables: KEPT_TABLES,
        });
        today = data.today;

        const users = new Map(
          (await this.prisma.user.findMany({ select: { id: true, email: true } })).map((u) => [
            u.email,
            u.id,
          ]),
        );
        for (const p of preferences) {
          const id = users.get(p.email);
          if (id)
            await this.prisma.user.update({ where: { id }, data: { preferences: p.preferences ?? {} } });
        }
        await this.prisma.session.createMany({
          data: sessions.flatMap((s) => {
            const userId = users.get(s.user.email);
            return userId
              ? [{ tokenHash: s.tokenHash, userId, expiresAt: s.expiresAt, ip: s.ip, userAgent: s.userAgent }]
              : [];
          }),
        });
        invalidateOrgSettings();
        this.deps.suppliers.invalidateScores();
        // The acting user may not exist in the fresh dataset; the audit row then names no one.
        const auditActor: Actor =
          actor.type === 'user' && [...users.values()].includes(actor.userId)
            ? actor
            : { type: 'system', reason: 'demo reset' };
        await writeAudit(this.prisma, auditActor, {
          action: 'demo.reset',
          entityType: 'Organization',
          summary: `Reset the demo data: 18 months of history up to ${today}`,
        });
      } finally {
        for (const h of this.hooks) await h.after();
      }
      this.bus.emit('demo.reset', { today });
      return { seconds: Math.round((performance.now() - started) / 100) / 10, today };
    } finally {
      this.resetting = false;
    }
  }
}
