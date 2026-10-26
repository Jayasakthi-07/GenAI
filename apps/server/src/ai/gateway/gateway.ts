import type { FastifyBaseLogger } from 'fastify';
import type { Prisma } from '#generated/prisma/client.ts';
import type { Db } from '../../db/client';
import { toJson } from '../../db/json';
import type { EventBus } from '../../domain/events';
import { backoffMs, sleep } from './budget';
import { errorFromException, LlmError, type LlmErrorCode } from './errors';
import { presetFor } from './presets';
import type { ProviderRegistry } from './registry';
import type { ChatChunk, ChatRequest, ChatResponse, ModelCapabilities } from './types';

export interface ModelRef {
  providerKey: string;
  modelId: string;
}

export interface RoutingConfig {
  default: ModelRef | null;
  /** Tried in order after the default (e.g. Gemini → Groq → local Ollama). */
  fallbacks: ModelRef[];
  /** Try an available local Ollama model first. */
  preferLocal: boolean;
  agentOverrides: Record<string, ModelRef>;
  /** Retries per model for rate limits, timeouts and server errors. */
  maxRetries: number;
}

export const DEFAULT_ROUTING: RoutingConfig = {
  default: null,
  fallbacks: [],
  preferLocal: false,
  agentOverrides: {},
  maxRetries: 2,
};

export interface ResolvedModel extends ModelRef {
  displayName: string;
  providerName: string;
  isLocal: boolean;
  capabilities: ModelCapabilities;
  contextWindow: number | null;
}

export type Purpose = 'AGENT' | 'CHAT' | 'PROBE' | 'CONNECTION_TEST' | 'LATENCY_TEST';

export interface CallContext {
  purpose: Purpose;
  agentKey?: string | null;
  runId?: string | null;
  /** Per-run model (the model chip, a test). */
  override?: ModelRef | null;
  /** Use exactly this model: no fallback. */
  only?: boolean;
  signal?: AbortSignal;
}

export interface CallMeta {
  resolved: ResolvedModel;
  attempts: number;
  isFallback: boolean;
  latencyMs: number;
  llmCallId: string;
}

export type GatewayResult = ChatResponse & CallMeta;
export type GatewayChunk =
  | Exclude<ChatChunk, { type: 'done' }>
  | { type: 'start'; resolved: ResolvedModel }
  | { type: 'done'; response: GatewayResult };

/** Builds the request for a specific model (native tools vs the JSON protocol depends on it). */
export type RequestBuilder = (model: ResolvedModel) => Omit<ChatRequest, 'model' | 'signal'>;

const STATUS: Record<LlmErrorCode, Prisma.LlmCallCreateInput['status']> = {
  rate_limited: 'RATE_LIMITED',
  invalid_key: 'INVALID_KEY',
  timeout: 'TIMEOUT',
  budget_exceeded: 'BUDGET_EXCEEDED',
  cancelled: 'CANCELLED',
  network: 'ERROR',
  server: 'ERROR',
  bad_request: 'ERROR',
  model_not_found: 'ERROR',
  no_tools: 'ERROR',
  no_model: 'ERROR',
};

/**
 * The router. Resolves which models to try, enforces budgets, retries with backoff and jitter
 * (honouring Retry-After), falls back down the chain, and records every attempt in `llm_calls`.
 */
export class LlmGateway {
  private routingCache: { at: number; value: RoutingConfig } | null = null;

  constructor(
    private readonly prisma: Db,
    readonly registry: ProviderRegistry,
    private readonly bus: EventBus,
    private readonly log?: FastifyBaseLogger,
  ) {}

  async routing(): Promise<RoutingConfig> {
    if (this.routingCache && Date.now() - this.routingCache.at < 10_000) return this.routingCache.value;
    const row = await this.prisma.appSetting.findUnique({ where: { key: 'ai.routing' } });
    const value = { ...DEFAULT_ROUTING, ...((row?.value as Partial<RoutingConfig> | undefined) ?? {}) };
    this.routingCache = { at: Date.now(), value };
    return value;
  }

  async saveRouting(value: RoutingConfig): Promise<void> {
    await this.prisma.appSetting.upsert({
      where: { key: 'ai.routing' },
      create: { key: 'ai.routing', value: toJson(value) },
      update: { value: toJson(value) },
    });
    this.routingCache = null;
  }

  private async resolve(ref: ModelRef): Promise<ResolvedModel | null> {
    const entry = await this.registry.get(ref.providerKey);
    if (!entry?.record.isEnabled) return null;
    const info = await this.registry.modelInfo(ref.providerKey, ref.modelId);
    return {
      ...ref,
      displayName: info?.displayName ?? ref.modelId,
      providerName: entry.record.displayName,
      isLocal: entry.record.isLocal,
      capabilities: info?.capabilities ?? {
        tools: null,
        vision: false,
        thinking: false,
        embedding: false,
        structuredOutput: false,
      },
      contextWindow: info?.contextWindow ?? null,
    };
  }

  /** A sensible model when nothing is configured: a tool-capable local model, else a cloud provider's suggestion. */
  private async autoPick(localOnly = false): Promise<ModelRef | null> {
    for (const p of await this.registry.list()) {
      if (!p.isEnabled || !p.isLocal || p.kind === 'MOCK') continue;
      try {
        const models = (await this.registry.modelsFor(p.key)).filter((m) => !m.capabilities.embedding);
        const suggested = presetFor(p.key)?.suggestedModel;
        const pick =
          models.find((m) => m.id === suggested) ?? models.find((m) => m.capabilities.tools) ?? models[0];
        if (pick) return { providerKey: p.key, modelId: pick.id };
      } catch {
        // Not running; try the next one.
      }
    }
    if (localOnly) return null;
    for (const p of await this.registry.list()) {
      if (!p.isEnabled || p.isLocal || !p.hasKey) continue;
      const suggested = presetFor(p.key)?.suggestedModel;
      if (suggested) return { providerKey: p.key, modelId: suggested };
    }
    return null;
  }

  /** Ordered candidates for a call. */
  async candidates(ctx: Pick<CallContext, 'agentKey' | 'override' | 'only'>): Promise<ResolvedModel[]> {
    const cfg = await this.routing();
    if (ctx.only && ctx.override) {
      const r = await this.resolve(ctx.override);
      return r ? [r] : [];
    }
    const refs: ModelRef[] = [];
    if (ctx.override) refs.push(ctx.override);
    const agentRef = ctx.agentKey ? cfg.agentOverrides[ctx.agentKey] : undefined;
    if (agentRef) refs.push(agentRef);
    if (cfg.default) refs.push(cfg.default);
    refs.push(...cfg.fallbacks);
    if (!refs.length) {
      const auto = await this.autoPick();
      if (auto) refs.push(auto);
    }
    const seen = new Set<string>();
    const out: ResolvedModel[] = [];
    for (const ref of refs) {
      const id = `${ref.providerKey}/${ref.modelId}`;
      if (seen.has(id)) continue;
      seen.add(id);
      const r = await this.resolve(ref);
      if (r) out.push(r);
    }
    if (cfg.preferLocal) {
      if (!out.some((m) => m.isLocal)) {
        const local = await this.autoPick(true);
        const r = local ? await this.resolve(local) : null;
        if (r) out.unshift(r);
      } else {
        out.sort((a, b) => Number(b.isLocal) - Number(a.isLocal));
      }
    }
    return out;
  }

  private async record(
    model: ModelRef,
    ctx: CallContext,
    status: Prisma.LlmCallCreateInput['status'],
    latencyMs: number,
    attempt: number,
    isFallback: boolean,
    extra: { error?: LlmError; usage?: ChatResponse['usage'] } = {},
  ): Promise<string> {
    this.registry.noteCall(model.providerKey);
    const row = await this.prisma.llmCall.create({
      data: {
        providerKey: model.providerKey,
        modelId: model.modelId,
        purpose: ctx.purpose,
        agentKey: ctx.agentKey ?? null,
        runId: ctx.runId ?? null,
        status,
        errorCode: extra.error?.code ?? null,
        errorMessage: extra.error?.message.slice(0, 500) ?? null,
        promptTokens: extra.usage?.promptTokens ?? null,
        completionTokens: extra.usage?.completionTokens ?? null,
        latencyMs: Math.round(latencyMs),
        attempt,
        isFallback,
      },
      select: { id: true },
    });
    return row.id;
  }

  private async markHealth(providerKey: string, e: LlmError | null) {
    const health = !e
      ? 'CONNECTED'
      : e.code === 'invalid_key'
        ? 'INVALID_KEY'
        : e.code === 'rate_limited'
          ? 'RATE_LIMITED'
          : e.code === 'network'
            ? 'OFFLINE'
            : null;
    if (!health) return;
    const row = await this.prisma.providerConfig.findUnique({
      where: { key: providerKey },
      select: { health: true },
    });
    if (row?.health === health) return;
    await this.prisma.providerConfig.update({
      where: { key: providerKey },
      data: { health, healthMessage: e?.message ?? null, healthCheckedAt: new Date() },
    });
    this.bus.emit('ai.status', { providerKey, health });
  }

  /** Whether retrying the same model is worthwhile. */
  private shouldRetry(e: LlmError, model: ResolvedModel, attempt: number, max: number) {
    if (!e.retryable || attempt > max) return false;
    // A local server that isn't running won't start by itself in a second.
    if (e.code === 'network' && model.isLocal) return false;
    return (e.retryAfterMs ?? 0) <= 20_000;
  }

  async chat(ctx: CallContext, build: RequestBuilder): Promise<GatewayResult> {
    const cfg = await this.routing();
    const models = await this.candidates(ctx);
    if (!models.length)
      throw new LlmError(
        'no_model',
        'No AI model is set up. Start Ollama or add a provider key in Settings → AI & models.',
      );
    let last: LlmError | null = null;
    for (const [index, model] of models.entries()) {
      const entry = await this.registry.get(model.providerKey);
      if (!entry) continue;
      for (let attempt = 1; ; attempt++) {
        const started = performance.now();
        let release: (() => void) | undefined;
        try {
          release = await entry.budget.acquire(ctx.signal);
          const res = await entry.provider.chat({
            ...build(model),
            model: model.modelId,
            signal: ctx.signal,
          });
          const latencyMs = performance.now() - started;
          const llmCallId = await this.record(model, ctx, 'SUCCESS', latencyMs, attempt, index > 0, {
            usage: res.usage,
          });
          void this.markHealth(model.providerKey, null);
          return {
            ...res,
            resolved: model,
            attempts: attempt,
            isFallback: index > 0,
            latencyMs: Math.round(latencyMs),
            llmCallId,
          };
        } catch (error) {
          const e = errorFromException(error, entry.record.displayName);
          last = e;
          await this.record(model, ctx, STATUS[e.code], performance.now() - started, attempt, index > 0, {
            error: e,
          });
          void this.markHealth(model.providerKey, e);
          this.log?.warn(
            { provider: model.providerKey, model: model.modelId, code: e.code, attempt },
            'llm call failed',
          );
          if (e.code === 'cancelled') throw e;
          if (this.shouldRetry(e, model, attempt, cfg.maxRetries)) {
            await sleep(e.retryAfterMs ?? backoffMs(attempt), ctx.signal);
            continue;
          }
          break;
        } finally {
          release?.();
        }
      }
      if (ctx.only) break;
    }
    throw new LlmError('no_model', `No model could answer. Last error: ${last?.message ?? 'unknown'}`, {
      providerKey: last?.options.providerKey,
      lastCode: last?.code,
    });
  }

  /** Streaming chat. Fallback is possible until the first chunk arrives. */
  async *chatStream(ctx: CallContext, build: RequestBuilder): AsyncGenerator<GatewayChunk> {
    const cfg = await this.routing();
    const models = await this.candidates(ctx);
    if (!models.length)
      throw new LlmError(
        'no_model',
        'No AI model is set up. Start Ollama or add a provider key in Settings → AI & models.',
      );
    let last: LlmError | null = null;
    for (const [index, model] of models.entries()) {
      const entry = await this.registry.get(model.providerKey);
      if (!entry) continue;
      for (let attempt = 1; ; attempt++) {
        const started = performance.now();
        let release: (() => void) | undefined;
        let streamed = false;
        try {
          release = await entry.budget.acquire(ctx.signal);
          for await (const chunk of entry.provider.chatStream({
            ...build(model),
            model: model.modelId,
            signal: ctx.signal,
          })) {
            if (!streamed) {
              streamed = true;
              yield { type: 'start', resolved: model };
            }
            if (chunk.type === 'done') {
              const latencyMs = performance.now() - started;
              const llmCallId = await this.record(model, ctx, 'SUCCESS', latencyMs, attempt, index > 0, {
                usage: chunk.response.usage,
              });
              void this.markHealth(model.providerKey, null);
              yield {
                type: 'done',
                response: {
                  ...chunk.response,
                  resolved: model,
                  attempts: attempt,
                  isFallback: index > 0,
                  latencyMs: Math.round(latencyMs),
                  llmCallId,
                },
              };
              return;
            }
            yield chunk;
          }
          return;
        } catch (error) {
          const e = errorFromException(error, entry.record.displayName);
          last = e;
          await this.record(model, ctx, STATUS[e.code], performance.now() - started, attempt, index > 0, {
            error: e,
          });
          void this.markHealth(model.providerKey, e);
          if (e.code === 'cancelled' || streamed) throw e;
          if (this.shouldRetry(e, model, attempt, cfg.maxRetries)) {
            await sleep(e.retryAfterMs ?? backoffMs(attempt), ctx.signal);
            continue;
          }
          break;
        } finally {
          release?.();
        }
      }
      if (ctx.only) break;
    }
    throw new LlmError('no_model', `No model could answer. Last error: ${last?.message ?? 'unknown'}`, {
      lastCode: last?.code,
    });
  }
}
