import {
  AGENT_EVENTS,
  type AgentEvent,
  type AgentKey,
  BRIEFING_CRON,
  type RunTrigger,
} from '@stockroom/shared';
import type { FastifyBaseLogger } from 'fastify';
import { type Job, PgBoss } from 'pg-boss';
import type { LlmGateway } from '../ai/gateway/gateway';
import type { Env } from '../config/env';
import { AppError } from '../domain/errors';
import type { EventBus } from '../domain/events';
import type { Services } from '../services';
import type { AgentSettings, AnyAgentModule, Handoff } from './types';
import { executeRun } from './runtime/runner';

const CRON_QUEUE = 'agent.cron';
const MAINTENANCE_QUEUE = 'agent.maintenance';
const queueOf = (key: AgentKey) => `agent.${key}`;
/** Event triggers wait at least this long so a burst of changes becomes one run. */
const MIN_DEBOUNCE_MS = 2000;

interface Bucket {
  timer: NodeJS.Timeout;
  events: Set<string>;
  productIds: Set<string>;
}

/**
 * Deterministic coordination (no LLM): pg-boss queues (one run per agent at a time), cron
 * schedules from each agent's settings, debounced event triggers, hand-offs between agents,
 * cancellation and restart recovery.
 */
export class AgentOrchestrator {
  private boss: PgBoss | null = null;
  private readonly controllers = new Map<string, AbortController>();
  private readonly buckets = new Map<AgentKey, Bucket>();
  private readonly nextRuns = new Map<AgentKey, Date | null>();
  private settingsCache: { at: number; value: Map<AgentKey, AgentSettings> } | null = null;
  private unsubscribe: Array<() => void> = [];
  private tz = 'Asia/Kolkata';

  constructor(
    private readonly deps: {
      env: Env;
      bus: EventBus;
      services: Services;
      gateway: LlmGateway;
      log: FastifyBaseLogger;
      modules: AnyAgentModule[];
    },
  ) {}

  get isRunning() {
    return this.boss !== null;
  }

  async start(opts: { startupRuns?: AgentKey[] } = {}): Promise<void> {
    const { env, services, log, modules, bus } = this.deps;
    const boss = new PgBoss({
      connectionString: env.DATABASE_URL,
      schema: 'pgboss',
      application_name: 'stockroom-agents',
      max: 4,
    });
    boss.on('error', (err) => log.error({ err }, 'agent scheduler error'));
    await boss.start();
    this.boss = boss;
    this.tz = (await services.planning.org()).timezone;

    const recovered = await services.agents.recoverInterrupted();
    if (recovered) log.warn({ recovered }, 'marked interrupted agent runs');

    for (const m of modules.filter((x) => !x.chatOnly)) {
      await this.ensureQueue(queueOf(m.key), {
        policy: 'stately',
        retryLimit: 0,
        expireInSeconds: 3600,
        deleteAfterSeconds: 3 * 86_400,
      });
      await boss.work<{ runId: string }>(
        queueOf(m.key),
        { pollingIntervalSeconds: 1, localConcurrency: 1 },
        ([job]) => this.handle(job),
      );
    }
    await this.ensureQueue(CRON_QUEUE, { policy: 'standard', retryLimit: 0, deleteAfterSeconds: 86_400 });
    await boss.work<{ agentKey: AgentKey; cron: string }>(
      CRON_QUEUE,
      { pollingIntervalSeconds: 5 },
      async ([job]) => {
        if (job) await this.trigger(job.data.agentKey, 'SCHEDULE', { cron: job.data.cron });
      },
    );
    await this.ensureQueue(MAINTENANCE_QUEUE, {
      policy: 'singleton',
      retryLimit: 0,
      deleteAfterSeconds: 86_400,
    });
    await boss.work(MAINTENANCE_QUEUE, { pollingIntervalSeconds: 30 }, async () => {
      const expired = await services.actions.expireStale();
      if (expired) log.info({ expired }, 'expired stale proposals');
    });
    await boss.schedule(MAINTENANCE_QUEUE, '7 * * * *', {}, { tz: this.tz, key: 'hourly' });
    await this.syncSchedules();

    this.unsubscribe = [
      ...AGENT_EVENTS.map((name) =>
        bus.on(name, (e) => this.onEvent(name, (e.payload as { productId?: unknown }).productId)),
      ),
      bus.on('settings.changed', (e) => {
        if (e.payload.scope !== 'agents' && e.payload.scope !== 'organization') return;
        this.settingsCache = null;
        void this.syncSchedules().catch((err: unknown) =>
          log.error({ err }, 'could not update agent schedules'),
        );
      }),
    ];
    services.agents.setScheduler({
      nextRunAt: (key) => this.nextRuns.get(key) ?? null,
      validateCron: (cron) => this.validateCron(cron),
    });
    for (const key of opts.startupRuns ?? []) {
      void this.trigger(key, 'SCHEDULE', { reason: 'startup' }).catch((err: unknown) =>
        log.error({ err, agent: key }, 'startup run failed to queue'),
      );
    }
  }

  async stop(): Promise<void> {
    this.unsubscribe.forEach((u) => u());
    this.unsubscribe = [];
    for (const b of this.buckets.values()) clearTimeout(b.timer);
    this.buckets.clear();
    for (const c of this.controllers.values()) c.abort('Stopped because the server shut down');
    const boss = this.boss;
    this.boss = null;
    await boss?.stop({ graceful: true, timeout: 5000 });
  }

  private async ensureQueue(name: string, options: NonNullable<Parameters<PgBoss['createQueue']>[1]>) {
    const boss = this.requireBoss();
    const existing = await boss.getQueue(name);
    if (!existing) {
      await boss.createQueue(name, options);
      return;
    }
    // pg-boss fixes a queue's policy at creation; everything else can be updated.
    const { policy, ...rest } = options;
    if (policy && existing.policy !== policy)
      this.deps.log.warn({ queue: name, policy: existing.policy, wanted: policy }, 'queue policy differs');
    await boss.updateQueue(name, rest);
  }

  private requireBoss(): PgBoss {
    if (!this.boss) throw new AppError('INTERNAL', 'The agent scheduler isn’t running. Restart the server.');
    return this.boss;
  }

  validateCron(cron: string): void {
    if (cron === BRIEFING_CRON) return;
    try {
      this.requireBoss().previewSchedule(cron, { tz: this.tz, count: 1 });
    } catch {
      throw new AppError(
        'VALIDATION_ERROR',
        `“${cron}” isn’t a valid schedule. Use five cron fields, e.g. 0 7 * * *.`,
      );
    }
  }

  private async allSettings(): Promise<Map<AgentKey, AgentSettings>> {
    if (this.settingsCache && Date.now() - this.settingsCache.at < 30_000) return this.settingsCache.value;
    const value = new Map<AgentKey, AgentSettings>();
    for (const m of this.deps.modules) value.set(m.key, await this.deps.services.agents.settings(m.key));
    this.settingsCache = { at: Date.now(), value };
    return value;
  }

  /** Cron schedules follow each agent's settings; disabled agents have none. */
  async syncSchedules(): Promise<void> {
    const boss = this.requireBoss();
    this.tz = (await this.deps.services.planning.org()).timezone;
    const settings = await this.allSettings();
    const desired = new Map<string, { agentKey: AgentKey; cron: string }>();
    this.nextRuns.clear();
    const org = await this.deps.services.planning.org();
    const [hh = '8', mm = '0'] = org.briefingTime.split(':');
    const briefing = `${Number(mm)} ${Number(hh)} * * *`;
    for (const [key, s] of settings) {
      if (!s.isEnabled || this.deps.modules.find((m) => m.key === key)?.chatOnly) continue;
      let next: Date | null = null;
      s.triggers.cron.forEach((raw, i) => {
        const cron = raw === BRIEFING_CRON ? briefing : raw;
        try {
          const [at] = boss.previewSchedule(cron, { tz: this.tz, count: 1 });
          if (at && (!next || at < next)) next = at;
          desired.set(`${key}.${i}`, { agentKey: key, cron });
        } catch {
          this.deps.log.warn({ agent: key, cron }, 'ignoring an invalid cron expression');
        }
      });
      this.nextRuns.set(key, next);
    }
    for (const existing of await boss.getSchedules(CRON_QUEUE)) {
      const want = desired.get(existing.key);
      if (!want || want.cron !== existing.cron || existing.timezone !== this.tz)
        await boss.unschedule(CRON_QUEUE, existing.key);
    }
    for (const [k, v] of desired) await boss.schedule(CRON_QUEUE, v.cron, v, { tz: this.tz, key: k });
  }

  private onEvent(event: AgentEvent, productId: unknown) {
    void this.allSettings()
      .then((settings) => {
        for (const [key, s] of settings) {
          if (!s.isEnabled || !s.triggers.events.includes(event)) continue;
          const existing = this.buckets.get(key);
          if (existing) clearTimeout(existing.timer);
          const bucket: Bucket = existing ?? {
            timer: setTimeout(() => undefined, 0),
            events: new Set(),
            productIds: new Set(),
          };
          bucket.events.add(event);
          if (typeof productId === 'string' && bucket.productIds.size < 500) bucket.productIds.add(productId);
          bucket.timer = setTimeout(
            () => {
              this.buckets.delete(key);
              void this.trigger(key, 'EVENT', {
                events: [...bucket.events],
                productIds: [...bucket.productIds],
              }).catch((err: unknown) => this.deps.log.error({ err, agent: key }, 'event trigger failed'));
            },
            Math.max(MIN_DEBOUNCE_MS, s.triggers.debounceSeconds * 1000),
          );
          bucket.timer.unref();
          this.buckets.set(key, bucket);
        }
      })
      .catch((err: unknown) => this.deps.log.error({ err }, 'could not read agent settings'));
  }

  /** Automatic triggers respect the enabled switch; manual runs and hand-offs check it themselves. */
  private async trigger(key: AgentKey, trigger: RunTrigger, detail: Record<string, unknown>) {
    const s = (await this.allSettings()).get(key);
    if (!s?.isEnabled) return null;
    return this.enqueue(key, trigger, detail);
  }

  /** Queues a run. If one is already waiting for this agent, that run is returned instead. */
  async enqueue(
    key: AgentKey,
    trigger: RunTrigger,
    detail: Record<string, unknown> | null,
    parentRunId: string | null = null,
  ): Promise<{ runId: string; deduped: boolean }> {
    const boss = this.requireBoss();
    const { agents } = this.deps.services;
    if (agents.module(key).chatOnly)
      throw new AppError(
        'VALIDATION_ERROR',
        `${agents.module(key).name} runs in chat; open the Assistant instead.`,
      );
    const waiting = await agents.queuedRun(key);
    if (waiting) return { runId: waiting, deduped: true };
    const runId = await agents.createRun(key, trigger, detail, parentRunId);
    const jobId = await boss.send(queueOf(key), { runId });
    if (!jobId) {
      await agents.cancelQueued(runId);
      return { runId: (await agents.queuedRun(key)) ?? runId, deduped: true };
    }
    return { runId, deduped: false };
  }

  private async handle(job: Job<{ runId: string }> | undefined) {
    if (!job?.data.runId) return;
    const runId = job.data.runId;
    const controller = new AbortController();
    this.controllers.set(runId, controller);
    const onAbort = () => controller.abort('Stopped because the server shut down');
    job.signal.addEventListener('abort', onAbort, { once: true });
    try {
      await executeRun(
        {
          services: this.deps.services,
          gateway: this.deps.gateway,
          log: this.deps.log,
          handoff: (h, from) => this.handoff(h, from),
        },
        runId,
        controller.signal,
      );
    } finally {
      job.signal.removeEventListener('abort', onAbort);
      this.controllers.delete(runId);
    }
  }

  private async handoff(h: Handoff, from: { runId: string; agentKey: AgentKey }): Promise<string | null> {
    const s = (await this.allSettings()).get(h.to);
    if (!s?.isEnabled) return null;
    const r = await this.enqueue(
      h.to,
      'HANDOFF',
      {
        fromAgent: from.agentKey,
        fromRunId: from.runId,
        productIds: h.productIds.slice(0, 200),
        reason: h.reason,
      },
      from.runId,
    );
    this.deps.bus.emit('agent.run.handoff', {
      fromRunId: from.runId,
      fromAgent: from.agentKey,
      toAgent: h.to,
      productIds: h.productIds.slice(0, 50),
    });
    return r.deduped ? null : r.runId;
  }

  /** Cancels a queued run, or stops a running one at its next step. */
  async cancel(runId: string): Promise<boolean> {
    const controller = this.controllers.get(runId);
    if (controller) {
      controller.abort('Cancelled by a person');
      return true;
    }
    return this.deps.services.agents.cancelQueued(runId);
  }
}
