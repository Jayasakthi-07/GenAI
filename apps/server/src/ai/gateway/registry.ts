import type { Env } from '../../config/env';
import type { Db } from '../../db/client';
import { toJson } from '../../db/json';
import { GeminiProvider } from './adapters/gemini';
import { MockProvider } from './adapters/mock';
import { OllamaProvider } from './adapters/ollama';
import { OpenAiCompatibleProvider } from './adapters/openai-compatible';
import { ProviderBudget } from './budget';
import { SecretBox } from './crypto';
import { CUSTOM_DEFAULT_SETTINGS, presetFor, PROVIDER_PRESETS } from './presets';
import type { LLMProvider, ModelCapabilities, ModelInfo, ProviderSettings } from './types';

export interface ProviderRecord {
  key: string;
  kind: 'OLLAMA' | 'OPENAI_COMPATIBLE' | 'GEMINI' | 'MOCK';
  displayName: string;
  baseUrl: string;
  isEnabled: boolean;
  isCustom: boolean;
  isLocal: boolean;
  settings: ProviderSettings;
  hasKey: boolean;
  keySource: 'ui' | 'env' | null;
  apiKeyLast4: string | null;
}

interface Entry {
  record: ProviderRecord;
  provider: LLMProvider;
  budget: ProviderBudget;
  stamp: string;
}

const MODEL_TTL_MS = { local: 20_000, cloud: 10 * 60_000 };

/**
 * Builds adapters from ProviderConfig rows (plus `.env` keys as a fallback), caches model lists,
 * and merges probed capabilities. Adapters are rebuilt when a provider's settings change.
 */
export class ProviderRegistry {
  private readonly entries = new Map<string, Entry>();
  private readonly models = new Map<string, { at: number; list: ModelInfo[] }>();
  private readonly box: SecretBox;
  private readonly callCounts = new Map<string, { at: number; count: number }>();

  constructor(
    private readonly prisma: Db,
    private readonly env: Env,
  ) {
    this.box = new SecretBox(env.APP_ENCRYPTION_KEY);
  }

  get secrets() {
    return this.box;
  }

  /** Creates rows for built-in providers that don't exist yet. Keys in `.env` enable their provider. */
  async ensurePresets(): Promise<void> {
    const existing = new Set(
      (await this.prisma.providerConfig.findMany({ select: { key: true } })).map((p) => p.key),
    );
    let order = 0;
    for (const p of PROVIDER_PRESETS) {
      order++;
      if (existing.has(p.key)) continue;
      const envKey = p.envKey ? (this.env[p.envKey] as string | undefined) : undefined;
      await this.prisma.providerConfig.create({
        data: {
          key: p.key,
          kind: p.kind,
          displayName: p.displayName,
          baseUrl: p.key === 'ollama' ? this.env.OLLAMA_BASE_URL : p.baseUrl,
          isEnabled: p.key === 'ollama' || Boolean(envKey),
          isCustom: false,
          settings: toJson(p.settings),
          sortOrder: order,
        },
      });
    }
  }

  private async load(): Promise<void> {
    const rows = await this.prisma.providerConfig.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    const seen = new Set<string>();
    for (const row of rows) {
      seen.add(row.key);
      // Rebuild the adapter only when its configuration changes, not on health updates
      // (which would also reset its rate-limit budget).
      const stamp = JSON.stringify([
        row.kind,
        row.displayName,
        row.baseUrl,
        row.isEnabled,
        row.settings,
        row.apiKeyCiphertext,
        row.extraHeadersCiphertext,
      ]);
      const cached = this.entries.get(row.key);
      if (cached?.stamp === stamp) continue;
      const preset = presetFor(row.key);
      const settings = {
        ...(preset?.settings ?? CUSTOM_DEFAULT_SETTINGS),
        ...(row.settings as Partial<ProviderSettings>),
      };
      const uiKey = row.apiKeyCiphertext ? this.decrypt(row.apiKeyCiphertext) : undefined;
      const envKey = preset?.envKey ? (this.env[preset.envKey] as string | undefined) : undefined;
      const apiKey = uiKey ?? envKey;
      const headers = row.extraHeadersCiphertext
        ? (JSON.parse(this.decrypt(row.extraHeadersCiphertext) ?? '{}') as Record<string, string>)
        : undefined;
      const isLocal = preset?.isLocal ?? /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])/.test(row.baseUrl);
      const record: ProviderRecord = {
        key: row.key,
        kind: row.kind,
        displayName: row.displayName,
        baseUrl: row.baseUrl,
        isEnabled: row.isEnabled,
        isCustom: row.isCustom,
        isLocal,
        settings,
        hasKey: Boolean(apiKey),
        keySource: uiKey ? 'ui' : envKey ? 'env' : null,
        apiKeyLast4: uiKey ? row.apiKeyLast4 : envKey ? envKey.slice(-4) : null,
      };
      const provider = this.build(
        record,
        apiKey,
        headers,
        preset?.modelsUrl,
        preset?.requiresKey ?? !isLocal,
        preset?.freeTier ?? false,
      );
      const budget = cached?.budget ?? new ProviderBudget(settings, () => this.callsToday(row.key));
      budget.update(settings);
      this.entries.set(row.key, { record, provider, budget, stamp });
      if (cached && cached.record.baseUrl !== record.baseUrl) this.models.delete(row.key);
    }
    for (const key of [...this.entries.keys()]) if (!seen.has(key)) this.entries.delete(key);
  }

  private decrypt(blob: Uint8Array): string | undefined {
    try {
      return this.box.decrypt(blob);
    } catch {
      // Key rotated or data corrupted: behave as if no key was stored.
      return undefined;
    }
  }

  private build(
    r: ProviderRecord,
    apiKey: string | undefined,
    headers: Record<string, string> | undefined,
    modelsUrl: string | undefined,
    requiresKey: boolean,
    freeTier: boolean,
  ): LLMProvider {
    switch (r.kind) {
      case 'OLLAMA':
        return new OllamaProvider(r.key, r.baseUrl, r.settings);
      case 'GEMINI':
        return new GeminiProvider(r.key, apiKey, r.settings);
      case 'MOCK':
        return new MockProvider(r.key);
      case 'OPENAI_COMPATIBLE':
        return new OpenAiCompatibleProvider({
          id: r.key,
          displayName: r.displayName,
          baseUrl: r.baseUrl,
          apiKey,
          extraHeaders: headers,
          modelsUrl,
          requiresKey,
          freeTier,
          isLocal: r.isLocal,
          settings: r.settings,
        });
    }
  }

  async list(): Promise<ProviderRecord[]> {
    await this.load();
    return [...this.entries.values()].map((e) => e.record);
  }

  async get(key: string): Promise<Entry | undefined> {
    await this.load();
    return this.entries.get(key);
  }

  /** Forget cached adapters and models (after edits). */
  invalidate(key?: string) {
    if (key) {
      this.entries.delete(key);
      this.models.delete(key);
    } else {
      this.entries.clear();
      this.models.clear();
    }
  }

  /** Live model list (cached; local providers refresh quickly so newly pulled models appear). */
  async modelsFor(key: string, refresh = false): Promise<ModelInfo[]> {
    const entry = await this.get(key);
    if (!entry) return [];
    const cached = this.models.get(key);
    const ttl = entry.record.isLocal ? MODEL_TTL_MS.local : MODEL_TTL_MS.cloud;
    if (!refresh && cached && Date.now() - cached.at < ttl) return cached.list;
    const list = await entry.provider.listModels();
    const probed = await this.prisma.modelCapability.findMany({ where: { providerKey: key } });
    const byId = new Map(probed.map((p) => [p.modelId, p]));
    const merged = list.map((m) => {
      const p = byId.get(m.id);
      if (!p) return m;
      const caps = p.capabilities as Partial<ModelCapabilities>;
      // A probe result beats "unknown"; the provider's own report beats a stale probe otherwise.
      return {
        ...m,
        capabilities: { ...m.capabilities, tools: m.capabilities.tools ?? caps.tools ?? null },
        contextWindow: m.contextWindow ?? p.contextWindow,
      };
    });
    merged.sort(
      (a, b) =>
        Number(b.capabilities.tools === true) - Number(a.capabilities.tools === true) ||
        a.displayName.localeCompare(b.displayName),
    );
    this.models.set(key, { at: Date.now(), list: merged });
    return merged;
  }

  cachedModels(key: string): ModelInfo[] | undefined {
    return this.models.get(key)?.list;
  }

  async modelInfo(key: string, modelId: string): Promise<ModelInfo | undefined> {
    const cached = this.cachedModels(key)?.find((m) => m.id === modelId);
    if (cached) return cached;
    try {
      return (await this.modelsFor(key)).find((m) => m.id === modelId);
    } catch {
      return undefined;
    }
  }

  /** LlmCall rows for a provider since local midnight (cached for 30 s). */
  async callsToday(key: string): Promise<number> {
    const c = this.callCounts.get(key);
    if (c && Date.now() - c.at < 30_000) return c.count;
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const count = await this.prisma.llmCall.count({
      where: { providerKey: key, startedAt: { gte: start }, purpose: { in: ['AGENT', 'CHAT'] } },
    });
    this.callCounts.set(key, { at: Date.now(), count });
    return count;
  }

  noteCall(key: string) {
    const c = this.callCounts.get(key);
    if (c) c.count++;
  }
}
