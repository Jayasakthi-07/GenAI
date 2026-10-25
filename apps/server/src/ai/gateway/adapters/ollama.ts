import { randomUUID } from 'node:crypto';
import { errorFromException, LlmError } from '../errors';
import { httpJson, httpLines } from '../http';
import { sanitizeSchema } from '../schema-sanitize';
import { splitThinking, ThinkStreamSplitter } from '../think';
import type {
  ChatChunk,
  ChatMessage,
  ChatRequest,
  ChatResponse,
  LLMProvider,
  ModelCapabilities,
  ModelInfo,
  ProviderHealthResult,
  ProviderSettings,
  ToolCall,
} from '../types';

interface OllamaTag {
  name: string;
  size: number;
  details?: {
    family?: string;
    parameter_size?: string;
    quantization_level?: string;
    context_length?: number;
  };
  capabilities?: string[];
}
interface OllamaShow {
  capabilities?: string[];
  model_info?: Record<string, unknown>;
  details?: { family?: string };
}
interface OllamaMessage {
  role: string;
  content?: string;
  thinking?: string;
  tool_calls?: Array<{
    id?: string;
    function: { name: string; arguments: Record<string, unknown> | string };
  }>;
}
interface OllamaChatResponse {
  model: string;
  message?: OllamaMessage;
  done?: boolean;
  done_reason?: string;
  prompt_eval_count?: number;
  eval_count?: number;
  error?: string;
}

/**
 * Ollama's native REST API. The native API (not the OpenAI-compatible one) is used because it can
 * set `num_ctx`: the default context window is small and silently truncates long agent prompts.
 */
export class OllamaProvider implements LLMProvider {
  readonly kind = 'OLLAMA' as const;
  private readonly caps = new Map<string, ModelCapabilities & { contextWindow: number | null }>();
  private readonly name = 'Ollama';

  constructor(
    readonly id: string,
    private readonly baseUrl: string,
    private readonly settings: ProviderSettings,
  ) {}

  private url(path: string) {
    return `${this.baseUrl.replace(/\/$/, '')}${path}`;
  }

  async healthCheck(): Promise<ProviderHealthResult> {
    const started = performance.now();
    try {
      const v = await httpJson<{ version: string }>(this.url('/api/version'), {
        timeoutMs: 4000,
        providerName: this.name,
      });
      return {
        status: 'connected',
        message: null,
        latencyMs: Math.round(performance.now() - started),
        version: v.version,
      };
    } catch (error) {
      const e = errorFromException(error, this.name);
      return {
        status: 'offline',
        message:
          e.code === 'network'
            ? 'Ollama isn’t running. Start it, then pull a model, e.g. `ollama pull qwen3:8b`.'
            : e.message,
        latencyMs: null,
      };
    }
  }

  async version(): Promise<string | null> {
    const h = await this.healthCheck();
    return h.version ?? null;
  }

  async loaded(): Promise<Array<{ name: string; sizeVram: number; expiresAt: string | null }>> {
    const ps = await httpJson<{ models: Array<{ name: string; size_vram?: number; expires_at?: string }> }>(
      this.url('/api/ps'),
      { timeoutMs: 4000, providerName: this.name },
    );
    return ps.models.map((m) => ({
      name: m.name,
      sizeVram: m.size_vram ?? 0,
      expiresAt: m.expires_at ?? null,
    }));
  }

  private async show(model: string): Promise<ModelCapabilities & { contextWindow: number | null }> {
    const cached = this.caps.get(model);
    if (cached) return cached;
    const s = await httpJson<OllamaShow>(this.url('/api/show'), {
      body: { model },
      timeoutMs: 10_000,
      providerName: this.name,
    });
    const ctx = Object.entries(s.model_info ?? {}).find(([k]) => k.endsWith('.context_length'))?.[1];
    const c = capsFrom(s.capabilities ?? [], typeof ctx === 'number' ? ctx : null);
    this.caps.set(model, c);
    return c;
  }

  async listModels(signal?: AbortSignal): Promise<ModelInfo[]> {
    const tags = await httpJson<{ models: OllamaTag[] }>(this.url('/api/tags'), {
      timeoutMs: 8000,
      signal,
      providerName: this.name,
    });
    const loaded = new Set((await this.loaded().catch(() => [])).map((m) => m.name));
    return Promise.all(
      tags.models.map(async (t) => {
        // Recent Ollama versions include capabilities in /api/tags; older ones need /api/show.
        const c = t.capabilities
          ? capsFrom(t.capabilities, t.details?.context_length ?? null)
          : await this.show(t.name).catch(() => capsFrom([], null));
        this.caps.set(t.name, c);
        const { contextWindow, ...capabilities } = c;
        return {
          id: t.name,
          provider: this.id,
          displayName: t.name,
          contextWindow,
          isLocal: true,
          isFree: true,
          capabilities,
          sizeBytes: t.size,
          parameterSize: t.details?.parameter_size ?? null,
          quantization: t.details?.quantization_level ?? null,
          family: t.details?.family ?? null,
          loaded: loaded.has(t.name),
        } satisfies ModelInfo;
      }),
    );
  }

  private async body(req: ChatRequest, stream: boolean) {
    const caps = await this.show(req.model).catch((error: unknown) => {
      const e = errorFromException(error, this.name);
      throw e.code === 'model_not_found' || e.code === 'bad_request'
        ? new LlmError(
            'model_not_found',
            `Ollama has no model “${req.model}”. Pull it with \`ollama pull ${req.model}\`.`,
          )
        : e;
    });
    if (req.tools?.length && caps.tools === false)
      throw new LlmError('no_tools', `${req.model} doesn’t support tool calls.`);
    const think = caps.thinking ? (req.think ?? !this.settings.disableThinking) : undefined;
    return {
      model: req.model,
      stream,
      keep_alive: this.settings.keepAlive,
      ...(think === undefined ? {} : { think }),
      ...(req.json ? { format: 'json' } : {}),
      options: {
        num_ctx: Math.min(this.settings.numCtx, caps.contextWindow ?? this.settings.numCtx),
        ...(req.temperature === undefined ? {} : { temperature: req.temperature }),
        ...(req.maxTokens ? { num_predict: req.maxTokens } : {}),
      },
      messages: req.messages.map(toOllama),
      ...(req.tools?.length
        ? {
            tools: req.tools.map((t) => ({
              type: 'function',
              function: {
                name: t.name,
                description: t.description,
                parameters: sanitizeSchema(t.parameters, 'ollama'),
              },
            })),
          }
        : {}),
    };
  }

  async chat(req: ChatRequest): Promise<ChatResponse> {
    const res = await httpJson<OllamaChatResponse>(this.url('/api/chat'), {
      body: await this.body(req, false),
      timeoutMs: req.timeoutMs ?? this.settings.timeoutMs,
      signal: req.signal,
      providerName: this.name,
    });
    if (res.error) throw new LlmError('bad_request', `Ollama: ${res.error}`);
    const split = splitThinking(res.message?.content ?? '');
    return {
      model: res.model,
      content: split.content,
      reasoning: res.message?.thinking?.trim() || split.reasoning,
      toolCalls: (res.message?.tool_calls ?? []).map(toToolCall),
      usage: { promptTokens: res.prompt_eval_count, completionTokens: res.eval_count },
      finishReason: res.done_reason ?? null,
    };
  }

  async *chatStream(req: ChatRequest): AsyncGenerator<ChatChunk> {
    const splitter = new ThinkStreamSplitter();
    let content = '';
    let reasoning = '';
    const calls: ToolCall[] = [];
    let last: OllamaChatResponse | null = null;
    for await (const line of httpLines(this.url('/api/chat'), {
      body: await this.body(req, true),
      timeoutMs: req.timeoutMs ?? this.settings.timeoutMs,
      signal: req.signal,
      providerName: this.name,
    })) {
      const chunk = JSON.parse(line) as OllamaChatResponse;
      if (chunk.error) throw new LlmError('bad_request', `Ollama: ${chunk.error}`);
      last = chunk;
      if (chunk.message?.thinking) {
        reasoning += chunk.message.thinking;
        yield { type: 'reasoning', delta: chunk.message.thinking };
      }
      if (chunk.message?.content) {
        const parts = splitter.push(chunk.message.content);
        if (parts.reasoning) {
          reasoning += parts.reasoning;
          yield { type: 'reasoning', delta: parts.reasoning };
        }
        if (parts.text) {
          content += parts.text;
          yield { type: 'text', delta: parts.text };
        }
      }
      for (const tc of chunk.message?.tool_calls ?? []) {
        const call = toToolCall(tc);
        calls.push(call);
        yield { type: 'tool_call', call };
      }
    }
    yield {
      type: 'done',
      response: {
        model: last?.model ?? req.model,
        content: content.trim(),
        reasoning: reasoning.trim() || null,
        toolCalls: calls,
        usage: { promptTokens: last?.prompt_eval_count, completionTokens: last?.eval_count },
        finishReason: last?.done_reason ?? null,
      },
    };
  }
}

function capsFrom(
  list: string[],
  contextWindow: number | null,
): ModelCapabilities & { contextWindow: number | null } {
  return {
    tools: list.includes('tools'),
    vision: list.includes('vision'),
    thinking: list.includes('thinking'),
    embedding: list.includes('embedding'),
    structuredOutput: list.includes('completion'),
    contextWindow,
  };
}

function toOllama(m: ChatMessage): Record<string, unknown> {
  if (m.role === 'tool') return { role: 'tool', content: m.content, tool_name: m.toolName };
  if (m.role === 'assistant' && m.toolCalls?.length) {
    return {
      role: 'assistant',
      content: m.content,
      tool_calls: m.toolCalls.map((c) => ({ function: { name: c.name, arguments: c.arguments } })),
    };
  }
  return { role: m.role, content: m.content };
}

function toToolCall(tc: {
  id?: string;
  function: { name: string; arguments: Record<string, unknown> | string };
}): ToolCall {
  const raw = tc.function.arguments;
  if (typeof raw === 'string') {
    try {
      return {
        id: tc.id ?? randomUUID(),
        name: tc.function.name,
        arguments: JSON.parse(raw) as Record<string, unknown>,
      };
    } catch {
      return { id: tc.id ?? randomUUID(), name: tc.function.name, arguments: {}, rawArguments: raw };
    }
  }
  return { id: tc.id ?? randomUUID(), name: tc.function.name, arguments: raw ?? {} };
}
