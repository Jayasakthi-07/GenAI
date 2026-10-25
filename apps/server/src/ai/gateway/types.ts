/**
 * The provider-neutral contract the rest of the app depends on. Adapters translate to and from
 * each provider's wire format; nothing outside `ai/` imports an adapter.
 */

export type ChatRole = 'system' | 'user' | 'assistant' | 'tool';

export interface ToolCall {
  id: string;
  name: string;
  /** Parsed arguments. `rawArguments` keeps the original text when it wasn't valid JSON. */
  arguments: Record<string, unknown>;
  rawArguments?: string;
}

export interface ChatMessage {
  role: ChatRole;
  content: string;
  /** Assistant turns that called tools. */
  toolCalls?: ToolCall[];
  /** Tool results. */
  toolCallId?: string;
  toolName?: string;
  /**
   * Adapter-specific data needed to replay an assistant turn exactly (e.g. Gemini thought
   * signatures). Only the adapter that produced it reads it.
   */
  providerData?: { providerKey: string; data: unknown };
}

export type JsonSchema = Record<string, unknown>;

export interface ToolSpec {
  name: string;
  description: string;
  parameters: JsonSchema;
}

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  tools?: ToolSpec[];
  temperature?: number;
  maxTokens?: number;
  /** Ask for reasoning when the model supports it; false disables it where possible. */
  think?: boolean;
  /** Ask for a JSON object as the answer. */
  json?: boolean;
  signal?: AbortSignal;
  /** Idle timeout: how long to wait without receiving anything. */
  timeoutMs?: number;
}

export interface Usage {
  promptTokens?: number;
  completionTokens?: number;
}

export interface ChatResponse {
  model: string;
  content: string;
  reasoning: string | null;
  toolCalls: ToolCall[];
  usage: Usage;
  finishReason: string | null;
  providerData?: { providerKey: string; data: unknown };
}

export type ChatChunk =
  | { type: 'text'; delta: string }
  | { type: 'reasoning'; delta: string }
  | { type: 'tool_call'; call: ToolCall }
  | { type: 'done'; response: ChatResponse };

export interface ModelCapabilities {
  /** null = the provider doesn't say; a probe can find out. */
  tools: boolean | null;
  vision: boolean;
  thinking: boolean;
  embedding: boolean;
  structuredOutput: boolean;
}

export interface ModelInfo {
  id: string;
  provider: string;
  displayName: string;
  contextWindow: number | null;
  isLocal: boolean;
  isFree: boolean;
  capabilities: ModelCapabilities;
  sizeBytes: number | null;
  parameterSize: string | null;
  quantization: string | null;
  family: string | null;
  /** Ollama: currently loaded in memory. */
  loaded?: boolean;
}

export type HealthStatus = 'connected' | 'invalid_key' | 'rate_limited' | 'offline';

export interface ProviderHealthResult {
  status: HealthStatus;
  message: string | null;
  latencyMs: number | null;
  version?: string | null;
}

export interface LLMProvider {
  readonly id: string;
  readonly kind: 'OLLAMA' | 'OPENAI_COMPATIBLE' | 'GEMINI' | 'MOCK';
  listModels(signal?: AbortSignal): Promise<ModelInfo[]>;
  healthCheck(): Promise<ProviderHealthResult>;
  chat(req: ChatRequest): Promise<ChatResponse>;
  chatStream(req: ChatRequest): AsyncIterable<ChatChunk>;
}

/** Per-provider settings stored in ProviderConfig.settings. */
export interface ProviderSettings {
  /** Requests per minute; 0 = unlimited. */
  rpm: number;
  /** Parallel requests. Ollama defaults to 1. */
  concurrency: number;
  /** Calls per day; 0 = unlimited. */
  dailyBudget: number;
  /** Idle timeout in ms. */
  timeoutMs: number;
  /** Ollama context window (num_ctx). */
  numCtx: number;
  /** Ollama keep_alive. */
  keepAlive: string;
  /** Turn reasoning off where the model allows it. */
  disableThinking: boolean;
}
