import {
  AGENT_LABELS,
  type AgentDto,
  type AgentGraph,
  type AgentKey,
  type AgentRunDetail,
  type AgentRunDto,
  type AgentStepDto,
  type AgentUpdate,
  agentLimitsSchema,
  agentTriggersSchema,
  agentUpdateSchema,
  modelRefSchema,
  type RunOutput,
  type RunsQuery,
  type RunStatus,
  type RunSummary,
  type RunTrigger,
  type StepType,
} from '@stockroom/shared';
import { Prisma } from '#generated/prisma/client.ts';
import { describeTools } from '../agents/tools';
import type { AgentSettings, AnyAgentModule } from '../agents/types';
import type { Db } from '../db/client';
import { toJson } from '../db/json';
import { inTransaction } from '../db/tx';
import { type Actor, assertCan } from '../domain/actor';
import { writeAudit } from '../domain/audit';
import { notFound } from '../domain/errors';
import type { EventBus } from '../domain/events';
import { iso, pageArgs, pageMeta } from './support';

export interface Scheduler {
  nextRunAt(key: AgentKey): Date | null;
  validateCron(cron: string): void;
}

export interface StepInput {
  type: StepType;
  label: string;
  toolName?: string | null;
  input?: unknown;
  output?: unknown;
  content?: string | null;
  reasoning?: string | null;
  error?: string | null;
  llmCallId?: string | null;
  durationMs?: number | null;
}

export interface RunFinish {
  status: RunStatus;
  mode?: 'AI' | 'RULE_BASED' | null;
  providerKey?: string | null;
  modelId?: string | null;
  summary?: string | null;
  output?: RunOutput | null;
  error?: string | null;
  fingerprint?: string | null;
  promptTokens?: number | null;
  completionTokens?: number | null;
  stepCount: number;
  toolCallCount: number;
}

const runInclude = {
  agent: { select: { key: true } },
  _count: { select: { actions: true } },
} satisfies Prisma.AgentRunInclude;
type RunRow = Prisma.AgentRunGetPayload<{ include: typeof runInclude }>;

const asKey = (k: string) => k as AgentKey;
const clip = (s: string | null | undefined, n: number) =>
  s && s.length > n ? `${s.slice(0, n)}…` : (s ?? null);

/** Agent definitions (editable settings over code defaults), run recording and run history. */
export class AgentService {
  private scheduler: Scheduler | null = null;

  constructor(
    private readonly prisma: Db,
    private readonly bus: EventBus,
    private readonly modules: Map<AgentKey, AnyAgentModule>,
  ) {}

  setScheduler(s: Scheduler) {
    this.scheduler = s;
  }

  module(key: AgentKey): AnyAgentModule {
    const m = this.modules.get(key);
    if (!m) throw notFound('Agent');
    return m;
  }

  /** Creates missing definitions from code. Name, description and tools always follow the code. */
  async ensureDefinitions(): Promise<void> {
    for (const m of this.modules.values()) {
      await this.prisma.agentDefinition.upsert({
        where: { key: m.key },
        create: {
          key: m.key,
          name: m.name,
          description: m.description,
          systemPrompt: m.defaults.systemPrompt,
          allowedTools: m.tools,
          triggers: toJson(m.defaults.triggers),
          autonomy: m.defaults.autonomy,
          limits: toJson(m.defaults.limits),
          config: toJson(m.defaults.config),
        },
        update: { name: m.name, description: m.description, allowedTools: m.tools },
      });
    }
  }

  /** Stored values validated over the defaults; anything malformed falls back to the default. */
  async settings(key: AgentKey): Promise<AgentSettings> {
    const m = this.module(key);
    const row = await this.prisma.agentDefinition.findUnique({ where: { key } });
    if (!row) throw notFound('Agent');
    return this.merge(m, row);
  }

  private merge(m: AnyAgentModule, row: Prisma.AgentDefinitionGetPayload<object>): AgentSettings {
    const triggers = agentTriggersSchema.safeParse(row.triggers);
    const limits = agentLimitsSchema.safeParse({ ...m.defaults.limits, ...(row.limits as object) });
    const model = modelRefSchema.safeParse(row.modelOverride);
    return {
      systemPrompt: row.systemPrompt || m.defaults.systemPrompt,
      triggers: triggers.success ? triggers.data : m.defaults.triggers,
      autonomy: row.autonomy,
      limits: limits.success ? limits.data : m.defaults.limits,
      config: { ...m.defaults.config, ...((row.config as Record<string, unknown> | null) ?? {}) },
      isEnabled: row.isEnabled,
      modelOverride: row.modelOverride && model.success ? model.data : null,
    };
  }

  async list(actor: Actor): Promise<AgentDto[]> {
    assertCan(actor, 'inventory.view');
    const rows = await this.prisma.agentDefinition.findMany();
    const byKey = new Map(rows.map((r) => [r.key, r]));
    const keys = [...this.modules.keys()].filter((k) => byKey.has(k));
    return Promise.all(
      keys.map((k) => this.toDto(k, byKey.get(k) as Prisma.AgentDefinitionGetPayload<object>)),
    );
  }

  async get(actor: Actor, key: AgentKey): Promise<AgentDto> {
    assertCan(actor, 'inventory.view');
    this.module(key);
    const row = await this.prisma.agentDefinition.findUnique({ where: { key } });
    if (!row) throw notFound('Agent');
    return this.toDto(key, row);
  }

  private async toDto(key: AgentKey, row: Prisma.AgentDefinitionGetPayload<object>): Promise<AgentDto> {
    const m = this.module(key);
    const s = this.merge(m, row);
    const since = new Date(Date.now() - 7 * 86_400_000);
    const [last, active, stats, pending] = await Promise.all([
      this.prisma.agentRun.findFirst({
        where: { agentId: row.id, status: { notIn: ['QUEUED', 'RUNNING'] } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.agentRun.findMany({
        where: { agentId: row.id, status: { in: ['QUEUED', 'RUNNING'] } },
        select: { id: true, status: true },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.agentRun.groupBy({
        by: ['status', 'mode'],
        where: { agentId: row.id, createdAt: { gte: since } },
        _count: { _all: true },
        _avg: { durationMs: true },
      }),
      this.prisma.agentAction.count({ where: { agentId: row.id, status: 'PENDING' } }),
    ]);
    const count = (pred: (g: (typeof stats)[number]) => boolean) =>
      stats.filter(pred).reduce((a, g) => a + g._count._all, 0);
    const finished = stats.filter((g) => g._avg.durationMs !== null);
    const avg = finished.length
      ? Math.round(
          finished.reduce((a, g) => a + (g._avg.durationMs ?? 0) * g._count._all, 0) /
            Math.max(
              1,
              finished.reduce((a, g) => a + g._count._all, 0),
            ),
        )
      : null;
    const running = active.find((r) => r.status === 'RUNNING');
    return {
      key,
      name: m.name,
      description: m.description,
      analyzer: m.analyzer,
      llmJob: m.llmJob,
      outputs: m.outputs,
      isEnabled: s.isEnabled,
      autonomy: s.autonomy,
      systemPrompt: s.systemPrompt,
      defaultPrompt: m.defaults.systemPrompt,
      tools: describeTools(m.tools),
      triggers: s.triggers,
      defaultTriggers: m.defaults.triggers,
      limits: s.limits,
      modelOverride: s.modelOverride,
      handoffsTo: m.handoffsTo,
      writes: m.tools.some((t) => t.startsWith('propose_')),
      status: {
        running: !!running,
        queued: active.some((r) => r.status === 'QUEUED'),
        currentRunId: running?.id ?? active[0]?.id ?? null,
      },
      lastRun: last ? summary(last) : null,
      nextRunAt: s.isEnabled ? iso(this.scheduler?.nextRunAt(key) ?? null) : null,
      stats: {
        runs7d: count(() => true),
        succeeded7d: count((g) => g.status === 'SUCCEEDED' || g.status === 'NO_CHANGE'),
        failed7d: count((g) => g.status === 'FAILED'),
        aiRuns7d: count((g) => g.mode === 'AI'),
        pendingActions: pending,
        avgDurationMs: avg,
      },
    };
  }

  async update(actor: Actor, key: AgentKey, raw: AgentUpdate): Promise<AgentDto> {
    assertCan(actor, 'agents.configure');
    const input = agentUpdateSchema.parse(raw);
    const m = this.module(key);
    for (const cron of input.triggers?.cron ?? []) this.scheduler?.validateCron(cron);
    await inTransaction(this.prisma, this.bus, async (tx, emit) => {
      const before = await tx.agentDefinition.findUnique({ where: { key } });
      if (!before) throw notFound('Agent');
      const data: Prisma.AgentDefinitionUpdateInput = {};
      if (input.isEnabled !== undefined) data.isEnabled = input.isEnabled;
      if (input.autonomy) data.autonomy = input.autonomy;
      if (input.systemPrompt !== undefined) data.systemPrompt = input.systemPrompt ?? m.defaults.systemPrompt;
      if (input.triggers) data.triggers = toJson(input.triggers);
      if (input.limits) data.limits = toJson({ ...this.merge(m, before).limits, ...input.limits });
      if (input.modelOverride !== undefined)
        data.modelOverride = input.modelOverride ? toJson(input.modelOverride) : Prisma.DbNull;
      const after = await tx.agentDefinition.update({ where: { key }, data });
      const changed = Object.keys(data);
      await writeAudit(tx, actor, {
        action: 'agent.update',
        entityType: 'AgentDefinition',
        entityId: after.id,
        summary: `Changed ${m.name}: ${changed.join(', ')}`,
        before: pick(before, changed),
        after: pick(after, changed),
      });
      emit('settings.changed', { scope: 'agents' });
    });
    return this.get(actor, key);
  }

  /* ── Run recording ───────────────────────────────────────────────────── */

  async createRun(
    key: AgentKey,
    trigger: RunTrigger,
    detail: Record<string, unknown> | null,
    parentRunId: string | null = null,
  ): Promise<string> {
    const agent = await this.prisma.agentDefinition.findUnique({ where: { key }, select: { id: true } });
    if (!agent) throw notFound('Agent');
    const run = await this.prisma.agentRun.create({
      data: {
        agentId: agent.id,
        trigger,
        triggerDetail: detail ? toJson(detail) : undefined,
        parentRunId,
        status: 'QUEUED',
      },
      select: { id: true },
    });
    this.bus.emit('agent.run.queued', { runId: run.id, agentKey: key, trigger });
    return run.id;
  }

  async queuedRun(key: AgentKey): Promise<string | null> {
    const run = await this.prisma.agentRun.findFirst({
      where: { agent: { key }, status: 'QUEUED' },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });
    return run?.id ?? null;
  }

  async runInfo(runId: string) {
    return this.prisma.agentRun.findUnique({
      where: { id: runId },
      select: {
        id: true,
        status: true,
        trigger: true,
        triggerDetail: true,
        parentRunId: true,
        agent: { select: { key: true } },
      },
    });
  }

  /** QUEUED → RUNNING. False when the run was cancelled (or already taken). */
  async startRun(runId: string, key: AgentKey): Promise<boolean> {
    const res = await this.prisma.agentRun.updateMany({
      where: { id: runId, status: 'QUEUED' },
      data: { status: 'RUNNING', startedAt: new Date() },
    });
    if (res.count) this.bus.emit('agent.run.started', { runId, agentKey: key });
    return res.count > 0;
  }

  async addStep(runId: string, key: AgentKey, seq: number, step: StepInput): Promise<void> {
    await this.prisma.agentStep.create({
      data: {
        runId,
        seq,
        type: step.type,
        label: step.label.slice(0, 300),
        toolName: step.toolName ?? null,
        input: step.input === undefined ? undefined : toJson(step.input),
        output: step.output === undefined ? undefined : toJson(step.output),
        content: clip(step.content, 20_000),
        reasoning: clip(step.reasoning, 20_000),
        error: step.error ? { message: step.error } : undefined,
        llmCallId: step.llmCallId ?? null,
        durationMs: step.durationMs ?? null,
      },
    });
    this.bus.emit('agent.run.step', { runId, agentKey: key, seq, type: step.type, label: step.label });
  }

  async finishRun(runId: string, key: AgentKey, f: RunFinish): Promise<void> {
    const run = await this.prisma.agentRun.findUnique({ where: { id: runId }, select: { startedAt: true } });
    const finishedAt = new Date();
    await this.prisma.agentRun.update({
      where: { id: runId },
      data: {
        status: f.status,
        mode: f.mode ?? null,
        providerKey: f.providerKey ?? null,
        modelId: f.modelId ?? null,
        summary: clip(f.summary, 2000),
        output: f.output ? toJson(f.output) : undefined,
        error: f.error ? { message: f.error } : undefined,
        fingerprint: f.fingerprint ?? null,
        promptTokens: f.promptTokens ?? null,
        completionTokens: f.completionTokens ?? null,
        stepCount: f.stepCount,
        toolCallCount: f.toolCallCount,
        finishedAt,
        durationMs: run?.startedAt ? finishedAt.getTime() - run.startedAt.getTime() : null,
      },
    });
    this.bus.emit('agent.run.finished', {
      runId,
      agentKey: key,
      status: f.status,
      summary: f.summary ?? null,
    });
  }

  async cancelQueued(runId: string): Promise<boolean> {
    const res = await this.prisma.agentRun.updateMany({
      where: { id: runId, status: 'QUEUED' },
      data: { status: 'CANCELLED', finishedAt: new Date(), summary: 'Cancelled before it started' },
    });
    return res.count > 0;
  }

  /** Fingerprint of the last run that produced a result, for NO_CHANGE detection. */
  async lastFingerprint(key: AgentKey): Promise<string | null> {
    const run = await this.prisma.agentRun.findFirst({
      where: { agent: { key }, status: { in: ['SUCCEEDED', 'NO_CHANGE'] }, fingerprint: { not: null } },
      orderBy: { createdAt: 'desc' },
      select: { fingerprint: true },
    });
    return run?.fingerprint ?? null;
  }

  /** At boot: anything RUNNING was interrupted; old QUEUED runs lost their job. */
  async recoverInterrupted(): Promise<number> {
    const now = new Date();
    const a = await this.prisma.agentRun.updateMany({
      where: { status: 'RUNNING' },
      data: {
        status: 'FAILED',
        finishedAt: now,
        error: { message: 'Interrupted by a restart' },
        summary: 'Interrupted by a restart',
      },
    });
    const b = await this.prisma.agentRun.updateMany({
      where: { status: 'QUEUED', createdAt: { lt: new Date(now.getTime() - 10 * 60_000) } },
      data: { status: 'CANCELLED', finishedAt: now, summary: 'Expired in the queue' },
    });
    return a.count + b.count;
  }

  /* ── History ─────────────────────────────────────────────────────────── */

  async runs(q: RunsQuery) {
    const where: Prisma.AgentRunWhereInput = {
      agent: q.agentKey ? { key: q.agentKey } : undefined,
      status: q.status?.length ? { in: q.status } : undefined,
      trigger: q.trigger?.length ? { in: q.trigger } : undefined,
      ...(q.q ? { summary: { contains: q.q, mode: 'insensitive' } } : {}),
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.agentRun.count({ where }),
      this.prisma.agentRun.findMany({
        where,
        include: runInclude,
        orderBy: { createdAt: 'desc' },
        ...pageArgs(q),
      }),
    ]);
    return { data: rows.map(runDto), meta: pageMeta(q, total) };
  }

  async run(id: string): Promise<AgentRunDetail> {
    const row = await this.prisma.agentRun.findUnique({
      where: { id },
      include: {
        ...runInclude,
        steps: { orderBy: { seq: 'asc' } },
        actions: {
          select: { id: true, type: true, status: true, title: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!row) throw notFound('Run');
    const [parent, children] = await Promise.all([
      row.parentRunId
        ? this.prisma.agentRun.findUnique({
            where: { id: row.parentRunId },
            select: { id: true, agent: { select: { key: true } } },
          })
        : null,
      this.prisma.agentRun.findMany({
        where: { parentRunId: id },
        include: runInclude,
        orderBy: { createdAt: 'asc' },
      }),
    ]);
    return {
      ...runDto(row),
      steps: row.steps.map((s): AgentStepDto => ({
        id: s.id,
        seq: s.seq,
        type: s.type,
        label: s.label,
        toolName: s.toolName,
        input: s.input ?? null,
        output: s.output ?? null,
        content: s.content,
        reasoning: s.reasoning,
        error: (s.error as { message?: string } | null)?.message ?? null,
        startedAt: s.startedAt.toISOString(),
        durationMs: s.durationMs,
      })),
      output: (row.output as RunOutput | null) ?? null,
      actions: row.actions,
      parent: parent
        ? {
            id: parent.id,
            agentKey: asKey(parent.agent.key),
            agentName: AGENT_LABELS[asKey(parent.agent.key)],
          }
        : null,
      children: children.map(runDto),
    };
  }

  async graph(): Promise<AgentGraph> {
    const since = new Date(Date.now() - 7 * 86_400_000);
    const rows = await this.prisma.agentDefinition.findMany();
    const latest = await this.prisma.agentRun.findMany({
      where: { createdAt: { gte: since } },
      select: { id: true, status: true, parentRunId: true, agent: { select: { key: true } } },
      orderBy: { createdAt: 'desc' },
    });
    const keyOfRun = new Map(latest.map((r) => [r.id, r.agent.key]));
    const counts = new Map<string, number>();
    for (const r of latest) {
      if (!r.parentRunId) continue;
      const from = keyOfRun.get(r.parentRunId);
      if (from) counts.set(`${from}>${r.agent.key}`, (counts.get(`${from}>${r.agent.key}`) ?? 0) + 1);
    }
    const nodes = rows
      .filter((r) => this.modules.has(asKey(r.key)))
      .map((r) => {
        const m = this.module(asKey(r.key));
        const s = this.merge(m, r);
        const mine = latest.filter((x) => x.agent.key === r.key);
        return {
          key: asKey(r.key),
          name: m.name,
          isEnabled: r.isEnabled,
          running: mine.some((x) => x.status === 'RUNNING'),
          lastStatus: mine.find((x) => x.status !== 'QUEUED' && x.status !== 'RUNNING')?.status ?? null,
          triggers: [...s.triggers.cron.map((c) => `cron ${c}`), ...s.triggers.events],
        };
      });
    const edges = [...this.modules.values()].flatMap((m) =>
      m.handoffsTo
        .filter((to) => this.modules.has(to))
        .map((to) => ({ from: m.key, to, label: 'hand-off', count7d: counts.get(`${m.key}>${to}`) ?? 0 })),
    );
    return { nodes, edges };
  }
}

function summary(r: Prisma.AgentRunGetPayload<object>): RunSummary {
  return {
    id: r.id,
    status: r.status,
    mode: r.mode,
    trigger: r.trigger,
    summary: r.summary,
    modelId: r.modelId,
    createdAt: r.createdAt.toISOString(),
    finishedAt: iso(r.finishedAt),
    durationMs: r.durationMs,
  };
}

function runDto(r: RunRow): AgentRunDto {
  const key = asKey(r.agent.key);
  return {
    id: r.id,
    agentKey: key,
    agentName: AGENT_LABELS[key] ?? key,
    trigger: r.trigger,
    triggerDetail: (r.triggerDetail as Record<string, unknown> | null) ?? null,
    status: r.status,
    mode: r.mode,
    providerKey: r.providerKey,
    modelId: r.modelId,
    parentRunId: r.parentRunId,
    startedAt: iso(r.startedAt),
    finishedAt: iso(r.finishedAt),
    durationMs: r.durationMs,
    promptTokens: r.promptTokens,
    completionTokens: r.completionTokens,
    stepCount: r.stepCount,
    toolCallCount: r.toolCallCount,
    actionCount: r._count.actions,
    summary: r.summary,
    error: (r.error as { message?: string } | null)?.message ?? null,
    createdAt: r.createdAt.toISOString(),
  };
}

function pick(row: Record<string, unknown>, keys: string[]) {
  return Object.fromEntries(keys.map((k) => [k, row[k]]));
}
