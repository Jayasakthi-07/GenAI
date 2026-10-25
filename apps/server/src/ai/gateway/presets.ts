import type { Env } from '../../config/env';
import type { ProviderSettings } from './types';

export interface ProviderPreset {
  key: string;
  kind: 'OLLAMA' | 'OPENAI_COMPATIBLE' | 'GEMINI' | 'MOCK';
  displayName: string;
  description: string;
  baseUrl: string;
  /** Some catalogs live outside the OpenAI-style `/models` endpoint. */
  modelsUrl?: string;
  envKey?: keyof Env;
  requiresKey: boolean;
  /** Has a free tier (models are marked free unless the catalog says otherwise). */
  freeTier: boolean;
  isLocal: boolean;
  keyUrl?: string;
  /** A sensible first model; lists are always fetched live. */
  suggestedModel?: string;
  settings: ProviderSettings;
  /** Shown under "More providers" until configured. */
  secondary?: boolean;
}

const cloud = (over: Partial<ProviderSettings> = {}): ProviderSettings => ({
  rpm: 20,
  concurrency: 2,
  dailyBudget: 500,
  timeoutMs: 60_000,
  numCtx: 8192,
  keepAlive: '10m',
  disableThinking: false,
  ...over,
});

/**
 * Built-in providers. Limits are conservative free-tier defaults and are editable in Settings
 * (e.g. OpenRouter's `:free` models allow about 50 requests a day without purchased credits).
 */
export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    key: 'ollama',
    kind: 'OLLAMA',
    displayName: 'Ollama',
    description: 'Models running on this computer. Works offline.',
    baseUrl: 'http://127.0.0.1:11434',
    requiresKey: false,
    freeTier: true,
    isLocal: true,
    suggestedModel: 'qwen3:8b',
    settings: {
      rpm: 0,
      concurrency: 1,
      dailyBudget: 0,
      timeoutMs: 300_000,
      numCtx: 8192,
      keepAlive: '10m',
      disableThinking: false,
    },
  },
  {
    key: 'gemini',
    kind: 'GEMINI',
    displayName: 'Google Gemini',
    description: 'Google’s Gemini API with a free tier and reliable tool calling.',
    baseUrl: 'https://generativelanguage.googleapis.com',
    envKey: 'GEMINI_API_KEY',
    requiresKey: true,
    freeTier: true,
    isLocal: false,
    keyUrl: 'https://aistudio.google.com/apikey',
    suggestedModel: 'gemini-2.5-flash',
    settings: cloud({ rpm: 10, dailyBudget: 250 }),
  },
  {
    key: 'openrouter',
    kind: 'OPENAI_COMPATIBLE',
    displayName: 'OpenRouter',
    description: 'One key for many models; free models end in “:free”.',
    baseUrl: 'https://openrouter.ai/api/v1',
    envKey: 'OPENROUTER_API_KEY',
    requiresKey: true,
    freeTier: false,
    isLocal: false,
    keyUrl: 'https://openrouter.ai/keys',
    settings: cloud({ rpm: 20, dailyBudget: 50 }),
  },
  {
    key: 'groq',
    kind: 'OPENAI_COMPATIBLE',
    displayName: 'Groq',
    description: 'Very fast hosted open models with a free tier.',
    baseUrl: 'https://api.groq.com/openai/v1',
    envKey: 'GROQ_API_KEY',
    requiresKey: true,
    freeTier: true,
    isLocal: false,
    keyUrl: 'https://console.groq.com/keys',
    suggestedModel: 'llama-3.3-70b-versatile',
    settings: cloud({ rpm: 30, dailyBudget: 1000 }),
  },
  {
    key: 'nvidia',
    kind: 'OPENAI_COMPATIBLE',
    displayName: 'NVIDIA NIM',
    description: 'NVIDIA-hosted open models with free developer credits.',
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    envKey: 'NVIDIA_API_KEY',
    requiresKey: true,
    freeTier: true,
    isLocal: false,
    keyUrl: 'https://build.nvidia.com',
    settings: cloud({ rpm: 40, dailyBudget: 1000 }),
  },
  {
    key: 'cerebras',
    kind: 'OPENAI_COMPATIBLE',
    displayName: 'Cerebras',
    description: 'Fast inference for open models with a free tier.',
    baseUrl: 'https://api.cerebras.ai/v1',
    envKey: 'CEREBRAS_API_KEY',
    requiresKey: true,
    freeTier: true,
    isLocal: false,
    keyUrl: 'https://cloud.cerebras.ai',
    settings: cloud({ rpm: 30, dailyBudget: 1000 }),
    secondary: true,
  },
  {
    key: 'mistral',
    kind: 'OPENAI_COMPATIBLE',
    displayName: 'Mistral',
    description: 'Mistral’s hosted models (free experiment tier).',
    baseUrl: 'https://api.mistral.ai/v1',
    envKey: 'MISTRAL_API_KEY',
    requiresKey: true,
    freeTier: true,
    isLocal: false,
    keyUrl: 'https://console.mistral.ai/api-keys',
    settings: cloud({ rpm: 30, dailyBudget: 1000 }),
    secondary: true,
  },
  {
    key: 'github',
    kind: 'OPENAI_COMPATIBLE',
    displayName: 'GitHub Models',
    description: 'Free, rate-limited access with a GitHub token.',
    baseUrl: 'https://models.github.ai/inference',
    modelsUrl: 'https://models.github.ai/catalog/models',
    envKey: 'GITHUB_MODELS_TOKEN',
    requiresKey: true,
    freeTier: true,
    isLocal: false,
    keyUrl: 'https://github.com/settings/personal-access-tokens',
    settings: cloud({ rpm: 10, dailyBudget: 150 }),
    secondary: true,
  },
  {
    key: 'huggingface',
    kind: 'OPENAI_COMPATIBLE',
    displayName: 'Hugging Face',
    description: 'Inference Providers through the Hugging Face router.',
    baseUrl: 'https://router.huggingface.co/v1',
    envKey: 'HUGGINGFACE_API_KEY',
    requiresKey: true,
    freeTier: true,
    isLocal: false,
    keyUrl: 'https://huggingface.co/settings/tokens',
    settings: cloud({ rpm: 20, dailyBudget: 300 }),
    secondary: true,
  },
  {
    key: 'lmstudio',
    kind: 'OPENAI_COMPATIBLE',
    displayName: 'LM Studio',
    description: 'A local OpenAI-compatible server on this computer.',
    baseUrl: 'http://127.0.0.1:1234/v1',
    requiresKey: false,
    freeTier: true,
    isLocal: true,
    settings: {
      rpm: 0,
      concurrency: 1,
      dailyBudget: 0,
      timeoutMs: 300_000,
      numCtx: 8192,
      keepAlive: '10m',
      disableThinking: false,
    },
    secondary: true,
  },
  {
    key: 'mock',
    kind: 'MOCK',
    displayName: 'Mock (demo)',
    description: 'A scripted, deterministic model for tests and for showing agent runs without AI.',
    baseUrl: 'mock://local',
    requiresKey: false,
    freeTier: true,
    isLocal: true,
    settings: {
      rpm: 0,
      concurrency: 4,
      dailyBudget: 0,
      timeoutMs: 10_000,
      numCtx: 8192,
      keepAlive: '0',
      disableThinking: true,
    },
    secondary: true,
  },
];

export const presetFor = (key: string) => PROVIDER_PRESETS.find((p) => p.key === key);

export const CUSTOM_DEFAULT_SETTINGS = cloud({ rpm: 20, dailyBudget: 0 });
