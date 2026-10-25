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
  ModelInfo,
  ProviderHealthResult,
  ProviderSettings,
  ToolCall,
} from '../types';

export interface OpenAiCompatibleOptions {
  id: string;
  displayName: string;
  baseUrl: string;
  apiKey?: string;
  extraHeaders?: Record<string, string>;
  /** Catalog endpoint when it isn't `${baseUrl}/models` (GitHub Models). */
  modelsUrl?: string;
  requiresKey: boolean;
  freeTier: boolean;
  isLocal: boolean;
  settings: ProviderSettings;
}

interface OaiModel {
  id: string;
  name?: string;
  context_length?: number;
  context_window?: number;
  pricing?: { prompt?: string; completion?: string };
  supported_parameters?: string[];
  architecture?: { input_modalities?: string[] };
  // GitHub Models catalog
  capabilities?: string[];
  limits?: { max_input_tokens?: number };
  supported_input_modalities?: string[];
}
interface OaiToolCallDelta {
  index?: number;
  id?: string;
  function?: { name?: string; arguments?: string };
}
interface OaiMessage {
  content?: string | null;
  reasoning?: string | null;
  reasoning_content?: string | null;
  tool_calls?: OaiToolCallDelta[];
}
interface OaiResponse {
  model?: string;
  choices?: Array<{ message?: OaiMessage; delta?: OaiMessage; finish_reason?: string | null }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string; code?: number | string };
}

/** One adapter for every OpenAI-compatible API, configured per provider. */
export class OpenAiCompatibleProvider implements LLMProvider {
  readonly kind = 'OPENAI_COMPATIBLE' as const;
  readonly id: string;

  constructor(private readonly o: OpenAiCompatibleOptions) {
    this.id = o.id;
  }

  private headers(): Record<string, string> {
    return {
      ...(this.o.apiKey ? { authorization: `Bearer ${this.o.apiKey}` } : {}),
      ...(this.o.id === 'openrouter' ? { 'HTTP-Referer': 'http://127.0.0.1', 'X-Title': 'Stockroom' } : {}),
      ...this.o.extraHeaders,
    };
  }

  private url(path: string) {
    return `${this.o.baseUrl.replace(/\/$/, '')}${path}`;
  }

  private assertKey() {
    if (this.o.requiresKey && !this.o.apiKey)
      throw new LlmError('invalid_key', `Add an API key for ${this.o.displayName}.`);
  }

  async healthCheck(): Promise<ProviderHealthResult> {
    if (this.o.requiresKey && !this.o.apiKey)
      return { status: 'invalid_key', message: 'No API key yet.', latencyMs: null };
    const started = performance.now();
    try {
      await httpJson(this.o.modelsUrl ?? this.url('/models'), {
        headers: this.headers(),
        timeoutMs: 10_000,
        providerName: this.o.displayName,
      });
      return { status: 'connected', message: null, latencyMs: Math.round(performance.now() - started) };
    } catch (error) {
      const e = errorFromException(error, this.o.displayName);
      const status =
        e.code === 'invalid_key' ? 'invalid_key' : e.code === 'rate_limited' ? 'rate_limited' : 'offline';
      return { status, message: e.message, latencyMs: null };
    }
  }

  async listModels(signal?: AbortSignal): Promise<ModelInfo[]> {
    this.assertKey();
    const raw = await httpJson<{ data?: OaiModel[] } | OaiModel[]>(this.o.modelsUrl ?? this.url('/models'), {
      headers: this.headers(),
      timeoutMs: 15_000,
      signal,
      providerName: this.o.displayName,
    });
    const list = Array.isArray(raw) ? raw : (raw.data ?? []);
    return list
      .filter((m) => typeof m.id === 'string' && !/embed|whisper|tts|guard|rerank|moderation/i.test(m.id))
      .map((m) => {
        const free =
          m.id.endsWith(':free') ||
          (m.pricing
            ? Number(m.pricing.prompt) === 0 && Number(m.pricing.completion) === 0
            : this.o.freeTier);
        const tools = m.supported_parameters
          ? m.supported_parameters.includes('tools')
          : m.capabilities
            ? m.capabilities.includes('tool-calling')
            : null;
        const modalities = m.architecture?.input_modalities ?? m.supported_input_modalities ?? [];
        return {
          id: m.id,
          provider: this.id,
          displayName: m.name ?? m.id,
          contextWindow: m.context_length ?? m.context_window ?? m.limits?.max_input_tokens ?? null,
          isLocal: this.o.isLocal,
          isFree: free,
          capabilities: {
            tools,
            vision: modalities.includes('image'),
            thinking:
              m.supported_parameters?.includes('reasoning') ??
              /r1|reason|think|qwq|o[134]-|gpt-oss/i.test(m.id),
            embedding: false,
            structuredOutput: m.supported_parameters?.includes('response_format') ?? false,
          },
          sizeBytes: null,
          parameterSize: /(\d+(\.\d+)?)b\b/i.exec(m.id)?.[0].toUpperCase() ?? null,
          quantization: null,
          family: m.id.split('/')[0] ?? null,
        } satisfies ModelInfo;
      });
  }

  private body(req: ChatRequest, stream: boolean) {
    return {
      model: req.model,
      stream,
      messages: req.messages.map(toOpenAi),
      ...(req.temperature === undefined ? {} : { temperature: req.temperature }),
      ...(req.maxTokens ? { max_tokens: req.maxTokens } : {}),
      ...(req.json && !req.tools?.length ? { response_format: { type: 'json_object' } } : {}),
      ...(req.tools?.length
        ? {
            tools: req.tools.map((t) => ({
              type: 'function',
              function: {
                name: t.name,
                description: t.description,
                parameters: sanitizeSchema(t.parameters, 'openai'),
              },
            })),
            tool_choice: 'auto',
          }
        : {}),
      ...(stream ? { stream_options: { include_usage: true } } : {}),
      // OpenRouter: keep reasoning out of the answer when thinking is off.
      ...(this.o.id === 'openrouter' && (req.think === false || this.o.settings.disableThinking)
        ? { reasoning: { exclude: true } }
        : {}),
    };
  }

  async chat(req: ChatRequest): Promise<ChatResponse> {
    this.assertKey();
    const res = await httpJson<OaiResponse>(this.url('/chat/completions'), {
      headers: this.headers(),
      body: this.body(req, false),
      timeoutMs: req.timeoutMs ?? this.o.settings.timeoutMs,
      signal: req.signal,
      providerName: this.o.displayName,
    });
    if (res.error)
      throw new LlmError(
        String(res.error.code) === '429' ? 'rate_limited' : 'bad_request',
        `${this.o.displayName}: ${res.error.message ?? 'error'}`,
      );
    const choice = res.choices?.[0];
    const split = splitThinking(choice?.message?.content ?? '');
    return {
      model: res.model ?? req.model,
      content: split.content,
      reasoning:
        (choice?.message?.reasoning ?? choice?.message?.reasoning_content ?? '').trim() || split.reasoning,
      toolCalls: (choice?.message?.tool_calls ?? []).map((tc) =>
        parseCall(tc.id, tc.function?.name ?? '', tc.function?.arguments ?? ''),
      ),
      usage: { promptTokens: res.usage?.prompt_tokens, completionTokens: res.usage?.completion_tokens },
      finishReason: choice?.finish_reason ?? null,
    };
  }

  async *chatStream(req: ChatRequest): AsyncGenerator<ChatChunk> {
    this.assertKey();
    const splitter = new ThinkStreamSplitter();
    const partial = new Map<number, { id?: string; name: string; args: string }>();
    let content = '';
    let reasoning = '';
    let usage: OaiResponse['usage'];
    let finish: string | null = null;
    let model = req.model;
    for await (const line of httpLines(this.url('/chat/completions'), {
      headers: this.headers(),
      body: this.body(req, true),
      timeoutMs: req.timeoutMs ?? this.o.settings.timeoutMs,
      signal: req.signal,
      providerName: this.o.displayName,
    })) {
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]') break;
      const chunk = JSON.parse(data) as OaiResponse;
      if (chunk.error)
        throw new LlmError('bad_request', `${this.o.displayName}: ${chunk.error.message ?? 'error'}`);
      model = chunk.model ?? model;
      usage = chunk.usage ?? usage;
      const choice = chunk.choices?.[0];
      if (choice?.finish_reason) finish = choice.finish_reason;
      const d = choice?.delta;
      const r = d?.reasoning ?? d?.reasoning_content;
      if (r) {
        reasoning += r;
        yield { type: 'reasoning', delta: r };
      }
      if (d?.content) {
        const parts = splitter.push(d.content);
        if (parts.reasoning) {
          reasoning += parts.reasoning;
          yield { type: 'reasoning', delta: parts.reasoning };
        }
        if (parts.text) {
          content += parts.text;
          yield { type: 'text', delta: parts.text };
        }
      }
      for (const tc of d?.tool_calls ?? []) {
        const i = tc.index ?? 0;
        const p = partial.get(i) ?? { name: '', args: '' };
        if (tc.id) p.id = tc.id;
        if (tc.function?.name) p.name += tc.function.name;
        if (tc.function?.arguments) p.args += tc.function.arguments;
        partial.set(i, p);
      }
    }
    const calls = [...partial.values()].map((p) => parseCall(p.id, p.name, p.args));
    for (const call of calls) yield { type: 'tool_call', call };
    yield {
      type: 'done',
      response: {
        model,
        content: content.trim(),
        reasoning: reasoning.trim() || null,
        toolCalls: calls,
        usage: { promptTokens: usage?.prompt_tokens, completionTokens: usage?.completion_tokens },
        finishReason: finish,
      },
    };
  }
}

function toOpenAi(m: ChatMessage): Record<string, unknown> {
  if (m.role === 'tool') return { role: 'tool', tool_call_id: m.toolCallId, content: m.content };
  if (m.role === 'assistant' && m.toolCalls?.length) {
    return {
      role: 'assistant',
      content: m.content || null,
      tool_calls: m.toolCalls.map((c) => ({
        id: c.id,
        type: 'function',
        function: { name: c.name, arguments: c.rawArguments ?? JSON.stringify(c.arguments) },
      })),
    };
  }
  return { role: m.role, content: m.content };
}

function parseCall(id: string | undefined, name: string, args: string): ToolCall {
  const callId = id ?? `call_${randomUUID().slice(0, 8)}`;
  if (!args.trim()) return { id: callId, name, arguments: {} };
  try {
    const parsed: unknown = JSON.parse(args);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? { id: callId, name, arguments: parsed as Record<string, unknown> }
      : { id: callId, name, arguments: {}, rawArguments: args };
  } catch {
    return { id: callId, name, arguments: {}, rawArguments: args };
  }
}
