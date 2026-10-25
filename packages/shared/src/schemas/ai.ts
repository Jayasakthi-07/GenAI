import { z } from 'zod';

export const PROVIDER_KINDS = ['OLLAMA', 'OPENAI_COMPATIBLE', 'GEMINI', 'MOCK'] as const;
export const PROVIDER_HEALTHS = ['CONNECTED', 'INVALID_KEY', 'RATE_LIMITED', 'OFFLINE', 'UNKNOWN'] as const;
export type ProviderHealth = (typeof PROVIDER_HEALTHS)[number];
export const PROVIDER_HEALTH_LABELS: Record<ProviderHealth, string> = {
  CONNECTED: 'Connected',
  INVALID_KEY: 'Key needed',
  RATE_LIMITED: 'Rate-limited',
  OFFLINE: 'Offline',
  UNKNOWN: 'Not checked',
};

export const providerSettingsSchema = z.object({
  rpm: z.coerce.number().int().min(0).max(10_000),
  concurrency: z.coerce.number().int().min(1).max(32),
  dailyBudget: z.coerce.number().int().min(0).max(1_000_000),
  timeoutMs: z.coerce.number().int().min(5_000).max(1_800_000),
  numCtx: z.coerce.number().int().min(2048).max(1_048_576),
  keepAlive: z.string().trim().max(10),
  disableThinking: z.boolean(),
});
export type ProviderSettingsDto = z.infer<typeof providerSettingsSchema>;

export const providerSchema = z.object({
  key: z.string(),
  kind: z.enum(PROVIDER_KINDS),
  displayName: z.string(),
  description: z.string(),
  baseUrl: z.string(),
  isEnabled: z.boolean(),
  isCustom: z.boolean(),
  isLocal: z.boolean(),
  requiresKey: z.boolean(),
  freeTier: z.boolean(),
  secondary: z.boolean(),
  keyUrl: z.string().nullable(),
  suggestedModel: z.string().nullable(),
  hasKey: z.boolean(),
  keySource: z.enum(['ui', 'env']).nullable(),
  apiKeyLast4: z.string().nullable(),
  settings: providerSettingsSchema,
  health: z.enum(PROVIDER_HEALTHS),
  healthMessage: z.string().nullable(),
  healthCheckedAt: z.string().nullable(),
  latencyMs: z.number().int().nullable(),
  callsToday: z.number().int(),
});
export type ProviderDto = z.infer<typeof providerSchema>;

export const providerUpdateSchema = z.object({
  displayName: z.string().trim().min(1).max(60).optional(),
  baseUrl: z.url('Enter a full URL, e.g. https://api.example.com/v1').optional(),
  isEnabled: z.boolean().optional(),
  /** New key; an empty string removes the stored key. Never returned. */
  apiKey: z.string().trim().max(500).optional(),
  extraHeaders: z.record(z.string(), z.string().max(500)).optional(),
  settings: providerSettingsSchema.partial().optional(),
});
export type ProviderUpdate = z.input<typeof providerUpdateSchema>;

export const providerCreateSchema = z.object({
  displayName: z.string().trim().min(1, 'Required').max(60),
  baseUrl: z.url('Enter a full URL, e.g. https://api.example.com/v1'),
  apiKey: z.string().trim().max(500).optional(),
  extraHeaders: z.record(z.string(), z.string().max(500)).optional(),
});
export type ProviderCreate = z.input<typeof providerCreateSchema>;

export const modelCapabilitiesSchema = z.object({
  tools: z.boolean().nullable(),
  vision: z.boolean(),
  thinking: z.boolean(),
  embedding: z.boolean(),
  structuredOutput: z.boolean(),
});

export const modelInfoSchema = z.object({
  id: z.string(),
  provider: z.string(),
  displayName: z.string(),
  contextWindow: z.number().int().nullable(),
  isLocal: z.boolean(),
  isFree: z.boolean(),
  capabilities: modelCapabilitiesSchema,
  sizeBytes: z.number().nullable(),
  parameterSize: z.string().nullable(),
  quantization: z.string().nullable(),
  family: z.string().nullable(),
  loaded: z.boolean().optional(),
});
export type ModelInfoDto = z.infer<typeof modelInfoSchema>;

export const modelsQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  provider: z.string().max(60).optional(),
  local: z.preprocess(
    (v) => (v === undefined || v === '' ? undefined : v === 'true'),
    z.boolean().optional(),
  ),
  free: z.preprocess((v) => (v === undefined || v === '' ? undefined : v === 'true'), z.boolean().optional()),
  tools: z.preprocess(
    (v) => (v === undefined || v === '' ? undefined : v === 'true'),
    z.boolean().optional(),
  ),
  refresh: z.preprocess((v) => v === 'true' || v === '1', z.boolean()).default(false),
});

export const modelListSchema = z.object({
  models: z.array(modelInfoSchema),
  /** Providers whose list couldn't be fetched, with the reason. */
  errors: z.array(z.object({ provider: z.string(), message: z.string() })),
});
export type ModelList = z.infer<typeof modelListSchema>;

export const connectionTestSchema = z.object({
  status: z.enum(['connected', 'invalid_key', 'rate_limited', 'offline']),
  message: z.string().nullable(),
  latencyMs: z.number().int().nullable(),
  version: z.string().nullable(),
  modelCount: z.number().int().nullable(),
});
export type ConnectionTest = z.infer<typeof connectionTestSchema>;

export const modelRefSchema = z.object({
  providerKey: z.string().min(1).max(60),
  modelId: z.string().min(1).max(200),
});
export type ModelRefDto = z.infer<typeof modelRefSchema>;

export const probeResultSchema = z.object({
  tools: z.boolean(),
  latencyMs: z.number().int(),
  message: z.string(),
});
export const latencyTestSchema = z.object({
  ok: z.boolean(),
  firstTokenMs: z.number().int().nullable(),
  totalMs: z.number().int(),
  output: z.string(),
  message: z.string().nullable(),
  modelUsed: z.string().nullable(),
});
export type LatencyTest = z.infer<typeof latencyTestSchema>;

export const routingSchema = z.object({
  default: modelRefSchema.nullable(),
  fallbacks: z.array(modelRefSchema).max(8),
  preferLocal: z.boolean(),
  agentOverrides: z.record(z.string(), modelRefSchema),
  maxRetries: z.coerce.number().int().min(0).max(5),
});
export type RoutingDto = z.infer<typeof routingSchema>;

export const aiStatusSchema = z.object({
  /** AI = a model will be used; RULE_BASED = nothing reachable, agents fall back to rules. */
  mode: z.enum(['AI', 'RULE_BASED']),
  active: z
    .object({
      providerKey: z.string(),
      providerName: z.string(),
      modelId: z.string(),
      displayName: z.string(),
      isLocal: z.boolean(),
      tools: z.boolean().nullable(),
    })
    .nullable(),
  configured: z.boolean(),
  providers: z.array(
    z.object({
      key: z.string(),
      displayName: z.string(),
      health: z.enum(PROVIDER_HEALTHS),
      isEnabled: z.boolean(),
      isLocal: z.boolean(),
    }),
  ),
});
export type AiStatus = z.infer<typeof aiStatusSchema>;

export const ollamaStatusSchema = z.object({
  running: z.boolean(),
  version: z.string().nullable(),
  baseUrl: z.string(),
  message: z.string().nullable(),
  models: z.array(modelInfoSchema),
  loaded: z.array(z.object({ name: z.string(), sizeVram: z.number(), expiresAt: z.string().nullable() })),
});
export type OllamaStatus = z.infer<typeof ollamaStatusSchema>;

export const LLM_CALL_STATUSES = [
  'SUCCESS',
  'ERROR',
  'RATE_LIMITED',
  'TIMEOUT',
  'INVALID_KEY',
  'BUDGET_EXCEEDED',
  'CANCELLED',
] as const;

export const usageSchema = z.object({
  days: z.number().int(),
  totals: z.object({
    calls: z.number().int(),
    succeeded: z.number().int(),
    failed: z.number().int(),
    fallbacks: z.number().int(),
    promptTokens: z.number().int(),
    completionTokens: z.number().int(),
    avgLatencyMs: z.number().int().nullable(),
  }),
  byProvider: z.array(
    z.object({
      providerKey: z.string(),
      calls: z.number().int(),
      failed: z.number().int(),
      avgLatencyMs: z.number().int().nullable(),
      tokens: z.number().int(),
      today: z.number().int(),
      dailyBudget: z.number().int(),
    }),
  ),
  byDay: z.array(z.object({ date: z.string(), succeeded: z.number().int(), failed: z.number().int() })),
  byAgent: z.array(z.object({ agentKey: z.string(), calls: z.number().int(), tokens: z.number().int() })),
  recent: z.array(
    z.object({
      id: z.string(),
      startedAt: z.string(),
      providerKey: z.string(),
      modelId: z.string(),
      purpose: z.string(),
      agentKey: z.string().nullable(),
      status: z.enum(LLM_CALL_STATUSES),
      latencyMs: z.number().int(),
      tokens: z.number().int().nullable(),
      errorMessage: z.string().nullable(),
      isFallback: z.boolean(),
    }),
  ),
});
export type UsageDto = z.infer<typeof usageSchema>;
