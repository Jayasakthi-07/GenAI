import type {
  AiStatus,
  ConnectionTest,
  LatencyTest,
  ModelInfoDto,
  ModelList,
  OllamaStatus,
  ProviderCreate,
  ProviderDto,
  ProviderUpdate,
  RoutingDto,
  UsageDto,
} from '@stockroom/shared';
import { providerCreateSchema, providerUpdateSchema, routingSchema } from '@stockroom/shared';
import type { Prisma } from '#generated/prisma/client.ts';
import { OllamaProvider } from '../ai/gateway/adapters/ollama';
import { last4 } from '../ai/gateway/crypto';
import { errorFromException } from '../ai/gateway/errors';
import type { LlmGateway } from '../ai/gateway/gateway';
import { presetFor } from '../ai/gateway/presets';
import type { ProviderRegistry } from '../ai/gateway/registry';
import type { Db } from '../db/client';
import { type Actor, assertCan } from '../domain/actor';
import { writeAudit } from '../domain/audit';
import { AppError, notFound } from '../domain/errors';
import type { EventBus } from '../domain/events';
import { slugify } from './catalog.service';
import { iso } from './support';

const PROBE_TOOL = {
  name: 'get_current_time',
  description: 'Returns the current time in a city. Always call this tool to answer.',
  parameters: {
    type: 'object',
    properties: { city: { type: 'string', description: 'City name' } },
    required: ['city'],
  },
};

/** Providers, keys, model discovery, routing and usage. Keys are encrypted and never returned. */
export class AiService {
  constructor(
    private readonly prisma: Db,
    private readonly bus: EventBus,
    readonly gateway: LlmGateway,
    private readonly registry: ProviderRegistry,
  ) {}

  /** Creates rows for built-in providers on first boot. */
  init(): Promise<void> {
    return this.registry.ensurePresets();
  }

  async providers(actor: Actor): Promise<ProviderDto[]> {
    assertCan(actor, 'ai.configure');
    const rows = await this.prisma.providerConfig.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    const records = new Map((await this.registry.list()).map((r) => [r.key, r]));
    return Promise.all(
      rows.map(async (row) => {
        const rec = records.get(row.key);
        const preset = presetFor(row.key);
        return {
          key: row.key,
          kind: row.kind,
          displayName: row.displayName,
          description: preset?.description ?? 'A custom OpenAI-compatible endpoint.',
          baseUrl: row.baseUrl,
          isEnabled: row.isEnabled,
          isCustom: row.isCustom,
          isLocal: rec?.isLocal ?? false,
          requiresKey: preset?.requiresKey ?? !(rec?.isLocal ?? false),
          freeTier: preset?.freeTier ?? false,
          secondary: preset?.secondary ?? false,
          keyUrl: preset?.keyUrl ?? null,
          suggestedModel: preset?.suggestedModel ?? null,
          hasKey: rec?.hasKey ?? false,
          keySource: rec?.keySource ?? null,
          apiKeyLast4: rec?.apiKeyLast4 ?? null,
          settings: rec?.settings ?? (row.settings as ProviderDto['settings']),
          health: row.health,
          healthMessage: row.healthMessage,
          healthCheckedAt: iso(row.healthCheckedAt),
          latencyMs: row.latencyMs,
          callsToday: await this.registry.callsToday(row.key),
        };
      }),
    );
  }

  private async provider(actor: Actor, key: string): Promise<ProviderDto> {
    const p = (await this.providers(actor)).find((x) => x.key === key);
    if (!p) throw notFound('Provider');
    return p;
  }

  async updateProvider(actor: Actor, key: string, raw: ProviderUpdate): Promise<ProviderDto> {
    assertCan(actor, 'ai.configure');
    const input = providerUpdateSchema.parse(raw);
    const row = await this.prisma.providerConfig.findUnique({ where: { key } });
    if (!row) throw notFound('Provider');
    const box = this.registry.secrets;
    const data: Prisma.ProviderConfigUpdateInput = {};
    if (input.displayName !== undefined && row.isCustom) data.displayName = input.displayName;
    if (input.baseUrl !== undefined) data.baseUrl = input.baseUrl.replace(/\/$/, '');
    if (input.isEnabled !== undefined) data.isEnabled = input.isEnabled;
    if (input.apiKey !== undefined) {
      data.apiKeyCiphertext = input.apiKey ? box.encrypt(input.apiKey) : null;
      data.apiKeyLast4 = input.apiKey ? last4(input.apiKey) : null;
      data.health = 'UNKNOWN';
    }
    if (input.extraHeaders !== undefined)
      data.extraHeadersCiphertext = Object.keys(input.extraHeaders).length
        ? box.encrypt(JSON.stringify(input.extraHeaders))
        : null;
    if (input.settings) data.settings = { ...(row.settings as object), ...input.settings };
    await this.prisma.$transaction(async (tx) => {
      await tx.providerConfig.update({ where: { key }, data });
      await writeAudit(tx, actor, {
        action: 'ai.provider.update',
        entityType: 'ProviderConfig',
        entityId: row.id,
        summary: `Updated ${row.displayName}${input.apiKey !== undefined ? (input.apiKey ? ' (new API key)' : ' (API key removed)') : ''}${input.isEnabled !== undefined ? (input.isEnabled ? ' (enabled)' : ' (disabled)') : ''}`,
        before: { baseUrl: row.baseUrl, isEnabled: row.isEnabled, settings: row.settings },
        // Keys are never written to the audit log.
        after: {
          baseUrl: input.baseUrl,
          isEnabled: input.isEnabled,
          settings: input.settings,
          apiKey: input.apiKey === undefined ? undefined : '[redacted]',
        },
      });
    });
    this.registry.invalidate(key);
    this.bus.emit('settings.changed', { scope: 'ai' });
    if (input.apiKey || input.isEnabled || input.baseUrl) await this.test(actor, key).catch(() => undefined);
    return this.provider(actor, key);
  }

  async createProvider(actor: Actor, raw: ProviderCreate): Promise<ProviderDto> {
    assertCan(actor, 'ai.configure');
    const input = providerCreateSchema.parse(raw);
    const key = `custom-${slugify(input.displayName)}`.slice(0, 60);
    if (await this.prisma.providerConfig.findUnique({ where: { key } }))
      throw new AppError('CONFLICT', `A provider called “${input.displayName}” already exists.`);
    const box = this.registry.secrets;
    await this.prisma.$transaction(async (tx) => {
      const row = await tx.providerConfig.create({
        data: {
          key,
          kind: 'OPENAI_COMPATIBLE',
          displayName: input.displayName,
          baseUrl: input.baseUrl.replace(/\/$/, ''),
          apiKeyCiphertext: input.apiKey ? box.encrypt(input.apiKey) : null,
          apiKeyLast4: input.apiKey ? last4(input.apiKey) : null,
          extraHeadersCiphertext:
            input.extraHeaders && Object.keys(input.extraHeaders).length
              ? box.encrypt(JSON.stringify(input.extraHeaders))
              : null,
          isEnabled: true,
          isCustom: true,
          settings: {
            rpm: 20,
            concurrency: 2,
            dailyBudget: 0,
            timeoutMs: 60_000,
            numCtx: 8192,
            keepAlive: '10m',
            disableThinking: false,
          },
          sortOrder: 100,
        },
      });
      await writeAudit(tx, actor, {
        action: 'ai.provider.create',
        entityType: 'ProviderConfig',
        entityId: row.id,
        summary: `Added custom provider ${row.displayName}`,
        after: { baseUrl: row.baseUrl },
      });
    });
    this.registry.invalidate();
    await this.test(actor, key).catch(() => undefined);
    return this.provider(actor, key);
  }

  async deleteProvider(actor: Actor, key: string): Promise<void> {
    assertCan(actor, 'ai.configure');
    const row = await this.prisma.providerConfig.findUnique({ where: { key } });
    if (!row) throw notFound('Provider');
    if (!row.isCustom)
      throw new AppError('VALIDATION_ERROR', 'Built-in providers can be disabled but not deleted.');
    await this.prisma.$transaction(async (tx) => {
      await tx.providerConfig.delete({ where: { key } });
      await writeAudit(tx, actor, {
        action: 'ai.provider.delete',
        entityType: 'ProviderConfig',
        entityId: row.id,
        summary: `Removed custom provider ${row.displayName}`,
      });
    });
    this.registry.invalidate(key);
    // Drop routing references to it.
    const routing = await this.gateway.routing();
    await this.gateway.saveRouting({
      ...routing,
      default: routing.default?.providerKey === key ? null : routing.default,
      fallbacks: routing.fallbacks.filter((f) => f.providerKey !== key),
      agentOverrides: Object.fromEntries(
        Object.entries(routing.agentOverrides).filter(([, v]) => v.providerKey !== key),
      ),
    });
  }

  /** Connection test: health check plus a live model list. */
  async test(actor: Actor, key: string): Promise<ConnectionTest> {
    assertCan(actor, 'ai.configure');
    const entry = await this.registry.get(key);
    if (!entry) throw notFound('Provider');
    const started = performance.now();
    const health = await entry.provider.healthCheck();
    let modelCount: number | null = null;
    let message = health.message;
    let status = health.status;
    if (health.status === 'connected') {
      try {
        modelCount = (await this.registry.modelsFor(key, true)).length;
      } catch (error) {
        const e = errorFromException(error, entry.record.displayName);
        message = e.message;
        status =
          e.code === 'invalid_key' ? 'invalid_key' : e.code === 'rate_limited' ? 'rate_limited' : 'offline';
      }
    }
    const healthEnum =
      status === 'connected'
        ? 'CONNECTED'
        : status === 'invalid_key'
          ? 'INVALID_KEY'
          : status === 'rate_limited'
            ? 'RATE_LIMITED'
            : 'OFFLINE';
    await this.prisma.providerConfig.update({
      where: { key },
      data: {
        health: healthEnum,
        healthMessage: message,
        healthCheckedAt: new Date(),
        latencyMs: health.latencyMs,
      },
    });
    await this.prisma.llmCall.create({
      data: {
        providerKey: key,
        modelId: '-',
        purpose: 'CONNECTION_TEST',
        status:
          status === 'connected'
            ? 'SUCCESS'
            : status === 'invalid_key'
              ? 'INVALID_KEY'
              : status === 'rate_limited'
                ? 'RATE_LIMITED'
                : 'ERROR',
        errorMessage: status === 'connected' ? null : message,
        latencyMs: Math.round(performance.now() - started),
      },
    });
    this.bus.emit('ai.status', { providerKey: key, health: healthEnum });
    return { status, message, latencyMs: health.latencyMs, version: health.version ?? null, modelCount };
  }

  /** Models across enabled providers (or one provider), with filters. */
  async models(
    actor: Actor,
    q: { q?: string; provider?: string; local?: boolean; free?: boolean; tools?: boolean; refresh?: boolean },
  ): Promise<ModelList> {
    assertCan(actor, 'inventory.view');
    const providers = (await this.registry.list()).filter((p) =>
      q.provider ? p.key === q.provider : p.isEnabled,
    );
    const errors: ModelList['errors'] = [];
    const lists = await Promise.all(
      providers.map(async (p) => {
        try {
          return await this.registry.modelsFor(p.key, q.refresh);
        } catch (error) {
          errors.push({ provider: p.key, message: errorFromException(error, p.displayName).message });
          return [];
        }
      }),
    );
    const needle = q.q?.toLowerCase();
    const models: ModelInfoDto[] = lists
      .flat()
      .filter(
        (m) =>
          (!needle || m.id.toLowerCase().includes(needle) || m.displayName.toLowerCase().includes(needle)) &&
          (q.local === undefined || m.isLocal === q.local) &&
          (q.free === undefined || m.isFree === q.free) &&
          (q.tools === undefined ||
            (q.tools ? m.capabilities.tools !== false : m.capabilities.tools === false)),
      );
    return { models, errors };
  }

  /** One-click capability probe: a tiny forced tool call. The result is cached per model. */
  async probe(
    actor: Actor,
    providerKey: string,
    modelId: string,
  ): Promise<{ tools: boolean; latencyMs: number; message: string }> {
    assertCan(actor, 'agents.configure');
    const started = performance.now();
    let tools = false;
    let message: string;
    try {
      const res = await this.gateway.chat(
        { purpose: 'PROBE', override: { providerKey, modelId }, only: true },
        () => ({
          messages: [
            { role: 'system', content: 'You answer by calling tools.' },
            { role: 'user', content: 'What time is it in Chennai? Use the tool.' },
          ],
          tools: [PROBE_TOOL],
          temperature: 0,
          maxTokens: 300,
          think: false,
        }),
      );
      tools = res.toolCalls.some((c) => c.name === PROBE_TOOL.name);
      message = tools
        ? 'The model called the test tool correctly.'
        : 'The model answered without calling the tool; agents will use the JSON protocol with it.';
    } catch (error) {
      const e = errorFromException(error, providerKey);
      if (e.code === 'no_tools' || e.code === 'bad_request' || /no model could answer/i.test(e.message)) {
        message = `The model doesn’t support native tool calls (${e.message.replace(/^No model could answer\. Last error: /, '')}). Agents will use the JSON protocol.`;
      } else throw new AppError('AI_PROVIDER_UNAVAILABLE', e.message);
    }
    const info = await this.registry.modelInfo(providerKey, modelId);
    await this.prisma.modelCapability.upsert({
      where: { providerKey_modelId: { providerKey, modelId } },
      create: {
        providerKey,
        modelId,
        capabilities: { ...(info?.capabilities ?? {}), tools },
        contextWindow: info?.contextWindow ?? null,
        source: 'PROBED',
      },
      update: {
        capabilities: { ...(info?.capabilities ?? {}), tools },
        source: 'PROBED',
        probedAt: new Date(),
      },
    });
    this.registry.invalidate(providerKey);
    return { tools, latencyMs: Math.round(performance.now() - started), message };
  }

  /** Time to first token and total time for a short reply. */
  async latencyTest(actor: Actor, providerKey: string, modelId: string): Promise<LatencyTest> {
    assertCan(actor, 'agents.configure');
    const started = performance.now();
    let first: number | null = null;
    let output = '';
    try {
      for await (const chunk of this.gateway.chatStream(
        { purpose: 'LATENCY_TEST', override: { providerKey, modelId }, only: true },
        () => ({
          messages: [{ role: 'user', content: 'Reply with exactly: Stockroom is ready.' }],
          temperature: 0,
          maxTokens: 60,
          think: false,
        }),
      )) {
        if ((chunk.type === 'text' || chunk.type === 'reasoning') && first === null)
          first = performance.now() - started;
        if (chunk.type === 'text') output += chunk.delta;
        if (chunk.type === 'done')
          return {
            ok: true,
            firstTokenMs: first === null ? null : Math.round(first),
            totalMs: Math.round(performance.now() - started),
            output: output.trim().slice(0, 200),
            message: null,
            modelUsed: chunk.response.model,
          };
      }
      return {
        ok: true,
        firstTokenMs: first === null ? null : Math.round(first),
        totalMs: Math.round(performance.now() - started),
        output: output.trim().slice(0, 200),
        message: null,
        modelUsed: modelId,
      };
    } catch (error) {
      return {
        ok: false,
        firstTokenMs: null,
        totalMs: Math.round(performance.now() - started),
        output: '',
        message: errorFromException(error, providerKey).message.replace(
          /^No model could answer\. Last error: /,
          '',
        ),
        modelUsed: null,
      };
    }
  }

  async routing(actor: Actor): Promise<RoutingDto> {
    assertCan(actor, 'inventory.view');
    return this.gateway.routing();
  }

  async saveRouting(actor: Actor, raw: RoutingDto): Promise<RoutingDto> {
    assertCan(actor, 'agents.configure');
    const input = routingSchema.parse(raw);
    const before = await this.gateway.routing();
    const keys = new Set((await this.registry.list()).map((p) => p.key));
    for (const ref of [input.default, ...input.fallbacks, ...Object.values(input.agentOverrides)]) {
      if (ref && !keys.has(ref.providerKey))
        throw new AppError('VALIDATION_ERROR', `Unknown provider “${ref.providerKey}”.`);
    }
    await this.gateway.saveRouting(input);
    await this.prisma.$transaction((tx) =>
      writeAudit(tx, actor, {
        action: 'ai.routing.update',
        entityType: 'AppSetting',
        entityId: 'ai.routing',
        summary: input.default
          ? `Default model set to ${input.default.modelId} (${input.default.providerKey})`
          : 'Updated model routing',
        before,
        after: input,
      }),
    );
    this.bus.emit('settings.changed', { scope: 'ai' });
    return input;
  }

  /** For the model chip: which model the next call would use, and provider health. */
  async status(actor: Actor): Promise<AiStatus> {
    assertCan(actor, 'inventory.view');
    const records = await this.registry.list();
    const rows = await this.prisma.providerConfig.findMany({ select: { key: true, health: true } });
    const health = new Map(rows.map((r) => [r.key, r.health]));
    const routing = await this.gateway.routing();
    let active: AiStatus['active'] = null;
    try {
      const [first] = await this.gateway.candidates({});
      if (first)
        active = {
          providerKey: first.providerKey,
          providerName: first.providerName,
          modelId: first.modelId,
          displayName: first.displayName,
          isLocal: first.isLocal,
          tools: first.capabilities.tools,
        };
    } catch {
      active = null;
    }
    // A configured model on a provider that's known to be down won't serve anything.
    const reachable =
      active &&
      health.get(active.providerKey) !== 'OFFLINE' &&
      health.get(active.providerKey) !== 'INVALID_KEY';
    return {
      mode: reachable ? 'AI' : 'RULE_BASED',
      active,
      configured: Boolean(routing.default),
      providers: records
        .filter((r) => r.isEnabled)
        .map((r) => ({
          key: r.key,
          displayName: r.displayName,
          health: health.get(r.key) ?? 'UNKNOWN',
          isEnabled: r.isEnabled,
          isLocal: r.isLocal,
        })),
    };
  }

  /** Live Ollama card: version, installed models with capabilities, what's loaded in memory. */
  async ollama(actor: Actor): Promise<OllamaStatus> {
    assertCan(actor, 'ai.configure');
    const entry = await this.registry.get('ollama');
    if (!entry || !(entry.provider instanceof OllamaProvider)) throw notFound('Provider');
    const provider = entry.provider;
    const health = await provider.healthCheck();
    if (health.status !== 'connected') {
      if (entry.record.isEnabled) await this.setHealth('ollama', 'OFFLINE', health.message);
      return {
        running: false,
        version: null,
        baseUrl: entry.record.baseUrl,
        message: health.message,
        models: [],
        loaded: [],
      };
    }
    const [models, loaded] = await Promise.all([
      this.registry.modelsFor('ollama', true),
      provider.loaded().catch(() => []),
    ]);
    await this.setHealth('ollama', 'CONNECTED', null, health.latencyMs);
    return {
      running: true,
      version: health.version ?? null,
      baseUrl: entry.record.baseUrl,
      message: models.length
        ? null
        : 'Ollama is running but has no models. Pull one, e.g. `ollama pull qwen3:8b`.',
      models,
      loaded,
    };
  }

  private async setHealth(
    key: string,
    health: 'CONNECTED' | 'OFFLINE',
    message: string | null,
    latencyMs?: number | null,
  ) {
    const row = await this.prisma.providerConfig.findUnique({ where: { key }, select: { health: true } });
    await this.prisma.providerConfig.update({
      where: { key },
      data: {
        health,
        healthMessage: message,
        healthCheckedAt: new Date(),
        ...(latencyMs === undefined ? {} : { latencyMs }),
      },
    });
    if (row?.health !== health) this.bus.emit('ai.status', { providerKey: key, health });
  }

  async usage(actor: Actor, days: number): Promise<UsageDto> {
    assertCan(actor, 'agents.configure');
    const since = new Date(Date.now() - days * 86_400_000);
    const where = {
      startedAt: { gte: since },
      purpose: { in: ['AGENT', 'CHAT'] as Array<'AGENT' | 'CHAT'> },
    };
    const [totals, byProvider, byAgent, byDay, recent] = await Promise.all([
      this.prisma.llmCall.groupBy({
        by: ['status'],
        where,
        _count: { _all: true },
        _sum: { promptTokens: true, completionTokens: true },
        _avg: { latencyMs: true },
      }),
      this.prisma.llmCall.groupBy({
        by: ['providerKey', 'status'],
        where,
        _count: { _all: true },
        _sum: { promptTokens: true, completionTokens: true },
        _avg: { latencyMs: true },
      }),
      this.prisma.llmCall.groupBy({
        by: ['agentKey'],
        where: { ...where, agentKey: { not: null } },
        _count: { _all: true },
        _sum: { promptTokens: true, completionTokens: true },
      }),
      this.prisma.$queryRaw<Array<{ day: string; ok: number; failed: number }>>`
        SELECT to_char(date_trunc('day', started_at), 'YYYY-MM-DD') AS day,
               COUNT(*) FILTER (WHERE status = 'SUCCESS')::int AS ok,
               COUNT(*) FILTER (WHERE status <> 'SUCCESS')::int AS failed
        FROM llm_calls WHERE started_at >= ${since} AND purpose IN ('AGENT', 'CHAT')
        GROUP BY 1 ORDER BY 1`,
      this.prisma.llmCall.findMany({
        where: { startedAt: { gte: since } },
        orderBy: { startedAt: 'desc' },
        take: 40,
      }),
    ]);
    const fallbacks = await this.prisma.llmCall.count({
      where: { ...where, isFallback: true, status: 'SUCCESS' },
    });
    const calls = totals.reduce((a, t) => a + t._count._all, 0);
    const ok = totals.find((t) => t.status === 'SUCCESS');
    const providers = new Map<string, { calls: number; failed: number; latency: number[]; tokens: number }>();
    for (const r of byProvider) {
      const p = providers.get(r.providerKey) ?? { calls: 0, failed: 0, latency: [], tokens: 0 };
      p.calls += r._count._all;
      if (r.status !== 'SUCCESS') p.failed += r._count._all;
      if (r._avg.latencyMs !== null) p.latency.push(r._avg.latencyMs);
      p.tokens += (r._sum.promptTokens ?? 0) + (r._sum.completionTokens ?? 0);
      providers.set(r.providerKey, p);
    }
    const records = new Map((await this.registry.list()).map((r) => [r.key, r]));
    // Fill missing days so the chart has a continuous axis.
    const dayMap = new Map(byDay.map((d) => [d.day, d]));
    const series: UsageDto['byDay'] = [];
    for (let i = days - 1; i >= 0; i--) {
      const day = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
      const d = dayMap.get(day);
      series.push({ date: day, succeeded: d?.ok ?? 0, failed: d?.failed ?? 0 });
    }
    return {
      days,
      totals: {
        calls,
        succeeded: ok?._count._all ?? 0,
        failed: calls - (ok?._count._all ?? 0),
        fallbacks,
        promptTokens: totals.reduce((a, t) => a + (t._sum.promptTokens ?? 0), 0),
        completionTokens: totals.reduce((a, t) => a + (t._sum.completionTokens ?? 0), 0),
        avgLatencyMs: ok?._avg.latencyMs ? Math.round(ok._avg.latencyMs) : null,
      },
      byProvider: await Promise.all(
        [...providers.entries()].map(async ([providerKey, p]) => ({
          providerKey,
          calls: p.calls,
          failed: p.failed,
          avgLatencyMs: p.latency.length
            ? Math.round(p.latency.reduce((a, b) => a + b, 0) / p.latency.length)
            : null,
          tokens: p.tokens,
          today: await this.registry.callsToday(providerKey),
          dailyBudget: records.get(providerKey)?.settings.dailyBudget ?? 0,
        })),
      ),
      byDay: series,
      byAgent: byAgent.map((a) => ({
        agentKey: a.agentKey ?? 'unknown',
        calls: a._count._all,
        tokens: (a._sum.promptTokens ?? 0) + (a._sum.completionTokens ?? 0),
      })),
      recent: recent.map((r) => ({
        id: r.id,
        startedAt: r.startedAt.toISOString(),
        providerKey: r.providerKey,
        modelId: r.modelId,
        purpose: r.purpose,
        agentKey: r.agentKey,
        status: r.status,
        latencyMs: r.latencyMs,
        tokens:
          r.promptTokens === null && r.completionTokens === null
            ? null
            : (r.promptTokens ?? 0) + (r.completionTokens ?? 0),
        errorMessage: r.errorMessage,
        isFallback: r.isFallback,
      })),
    };
  }
}
