import { randomUUID } from 'node:crypto';
import {
  ApiError,
  type Content,
  type GenerateContentConfig,
  type GenerateContentResponse,
  GoogleGenAI,
  type Part,
} from '@google/genai';
import { errorFromException, errorFromStatus, LlmError } from '../errors';
import { IdleTimer } from '../http';
import { sanitizeSchema } from '../schema-sanitize';
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

const NAME = 'Gemini';

/**
 * Google's official Gen AI SDK, which has more reliable function calling than the
 * OpenAI-compatible endpoint. Thinking models return `thoughtSignature`s that must be sent back on
 * later turns, so assistant turns keep the raw model content in `providerData`.
 */
export class GeminiProvider implements LLMProvider {
  readonly kind = 'GEMINI' as const;
  private readonly client: GoogleGenAI | null;
  private readonly thinking = new Map<string, boolean>();

  constructor(
    readonly id: string,
    private readonly apiKey: string | undefined,
    private readonly settings: ProviderSettings,
  ) {
    this.client = apiKey ? new GoogleGenAI({ apiKey, httpOptions: { timeout: settings.timeoutMs } }) : null;
  }

  private ai(): GoogleGenAI {
    if (!this.client) throw new LlmError('invalid_key', 'Add a Gemini API key.');
    return this.client;
  }

  async healthCheck(): Promise<ProviderHealthResult> {
    if (!this.apiKey) return { status: 'invalid_key', message: 'No API key yet.', latencyMs: null };
    const started = performance.now();
    try {
      await this.ai().models.list({ config: { pageSize: 1 } });
      return { status: 'connected', message: null, latencyMs: Math.round(performance.now() - started) };
    } catch (error) {
      const e = mapError(error);
      return {
        status:
          e.code === 'invalid_key' ? 'invalid_key' : e.code === 'rate_limited' ? 'rate_limited' : 'offline',
        message: e.message,
        latencyMs: null,
      };
    }
  }

  async listModels(signal?: AbortSignal): Promise<ModelInfo[]> {
    const out: ModelInfo[] = [];
    try {
      const pager = await this.ai().models.list({ config: { pageSize: 100, abortSignal: signal } });
      for await (const m of pager) {
        if (!m.name || !m.supportedActions?.includes('generateContent')) continue;
        const id = m.name.replace(/^models\//, '');
        if (/tts|image|embedding|aqa|veo|imagen|live|native-audio/i.test(id)) continue;
        const gemma = /gemma/i.test(id);
        this.thinking.set(id, Boolean(m.thinking));
        out.push({
          id,
          provider: this.id,
          displayName: m.displayName ?? id,
          contextWindow: m.inputTokenLimit ?? null,
          isLocal: false,
          isFree: true,
          capabilities: {
            tools: !gemma,
            vision: !gemma,
            thinking: Boolean(m.thinking),
            embedding: false,
            structuredOutput: !gemma,
          },
          sizeBytes: null,
          parameterSize: null,
          quantization: null,
          family: gemma ? 'gemma' : 'gemini',
        });
      }
    } catch (error) {
      throw mapError(error);
    }
    return out;
  }

  private config(
    req: ChatRequest,
    signal: AbortSignal,
  ): { contents: Content[]; config: GenerateContentConfig } {
    const system = req.messages
      .filter((m) => m.role === 'system')
      .map((m) => m.content)
      .join('\n\n');
    const thinks = this.thinking.get(req.model) ?? /2\.5|3\.|thinking/.test(req.model);
    const off = req.think === false || this.settings.disableThinking;
    const config: GenerateContentConfig = {
      abortSignal: signal,
      ...(system ? { systemInstruction: system } : {}),
      ...(req.temperature === undefined ? {} : { temperature: req.temperature }),
      ...(req.maxTokens ? { maxOutputTokens: req.maxTokens } : {}),
      ...(req.json && !req.tools?.length ? { responseMimeType: 'application/json' } : {}),
      ...(thinks
        ? {
            thinkingConfig:
              off && /flash/.test(req.model) ? { thinkingBudget: 0 } : { includeThoughts: true },
          }
        : {}),
      ...(req.tools?.length
        ? {
            tools: [
              {
                functionDeclarations: req.tools.map((t) => ({
                  name: t.name,
                  description: t.description,
                  parametersJsonSchema: sanitizeSchema(t.parameters, 'gemini'),
                })),
              },
            ],
          }
        : {}),
    };
    return { contents: toContents(req.messages, this.id), config };
  }

  async chat(req: ChatRequest): Promise<ChatResponse> {
    const idle = new IdleTimer(req.timeoutMs ?? this.settings.timeoutMs, req.signal);
    try {
      const { contents, config } = this.config(req, idle.signal);
      const res = await this.ai().models.generateContent({ model: req.model, contents, config });
      return this.toResponse(req.model, res);
    } catch (error) {
      throw mapError(error, idle.signal);
    } finally {
      idle.clear();
    }
  }

  private toResponse(model: string, res: GenerateContentResponse): ChatResponse {
    const cand = res.candidates?.[0];
    const parts = cand?.content?.parts ?? [];
    return {
      model,
      content: parts
        .filter((p) => p.text && !p.thought)
        .map((p) => p.text)
        .join('')
        .trim(),
      reasoning:
        parts
          .filter((p) => p.thought && p.text)
          .map((p) => p.text)
          .join('\n')
          .trim() || null,
      toolCalls: parts.filter((p) => p.functionCall).map((p) => toToolCall(p)),
      usage: {
        promptTokens: res.usageMetadata?.promptTokenCount,
        completionTokens:
          (res.usageMetadata?.candidatesTokenCount ?? 0) + (res.usageMetadata?.thoughtsTokenCount ?? 0) ||
          undefined,
      },
      finishReason: cand?.finishReason ?? null,
      providerData: cand?.content ? { providerKey: this.id, data: cand.content } : undefined,
    };
  }

  async *chatStream(req: ChatRequest): AsyncGenerator<ChatChunk> {
    const idle = new IdleTimer(req.timeoutMs ?? this.settings.timeoutMs, req.signal);
    const allParts: Part[] = [];
    let usage: GenerateContentResponse['usageMetadata'];
    let finish: string | null = null;
    try {
      const { contents, config } = this.config(req, idle.signal);
      const stream = await this.ai().models.generateContentStream({ model: req.model, contents, config });
      for await (const chunk of stream) {
        idle.touch();
        usage = chunk.usageMetadata ?? usage;
        const cand = chunk.candidates?.[0];
        if (cand?.finishReason) finish = cand.finishReason;
        for (const p of cand?.content?.parts ?? []) {
          allParts.push(p);
          if (p.functionCall) yield { type: 'tool_call', call: toToolCall(p) };
          else if (p.text && p.thought) yield { type: 'reasoning', delta: p.text };
          else if (p.text) yield { type: 'text', delta: p.text };
        }
      }
    } catch (error) {
      throw mapError(error, idle.signal);
    } finally {
      idle.clear();
    }
    const content: Content = { role: 'model', parts: mergeTextParts(allParts) };
    yield {
      type: 'done',
      response: {
        model: req.model,
        content: allParts
          .filter((p) => p.text && !p.thought)
          .map((p) => p.text)
          .join('')
          .trim(),
        reasoning:
          allParts
            .filter((p) => p.thought && p.text)
            .map((p) => p.text)
            .join('')
            .trim() || null,
        toolCalls: allParts.filter((p) => p.functionCall).map((p) => toToolCall(p)),
        usage: { promptTokens: usage?.promptTokenCount, completionTokens: usage?.candidatesTokenCount },
        finishReason: finish,
        providerData: { providerKey: this.id, data: content },
      },
    };
  }
}

function toToolCall(p: Part): ToolCall {
  return {
    id: p.functionCall?.id ?? `call_${randomUUID().slice(0, 8)}`,
    name: p.functionCall?.name ?? '',
    arguments: p.functionCall?.args ?? {},
  };
}

/** Streaming delivers text in many small parts; join adjacent plain-text parts for replay. */
function mergeTextParts(parts: Part[]): Part[] {
  const out: Part[] = [];
  for (const p of parts) {
    const prev = out.at(-1);
    if (
      prev &&
      p.text !== undefined &&
      !p.thought &&
      !p.thoughtSignature &&
      prev.text !== undefined &&
      !prev.thought &&
      !prev.functionCall
    ) {
      prev.text += p.text;
    } else out.push({ ...p });
  }
  return out;
}

function toContents(messages: ChatMessage[], providerKey: string): Content[] {
  const contents: Content[] = [];
  for (const m of messages) {
    if (m.role === 'system') continue;
    if (m.role === 'assistant') {
      if (m.providerData?.providerKey === providerKey && m.providerData.data) {
        contents.push(m.providerData.data);
        continue;
      }
      const parts: Part[] = [];
      if (m.content) parts.push({ text: m.content });
      for (const c of m.toolCalls ?? [])
        parts.push({ functionCall: { id: c.id, name: c.name, args: c.arguments } });
      contents.push({ role: 'model', parts: parts.length ? parts : [{ text: '' }] });
      continue;
    }
    if (m.role === 'tool') {
      let result: unknown = m.content;
      try {
        result = JSON.parse(m.content);
      } catch {
        // plain text result
      }
      const part: Part = {
        functionResponse: { id: m.toolCallId, name: m.toolName ?? 'tool', response: { result } },
      };
      const prev = contents.at(-1);
      // Several results for one model turn travel together in a single user turn.
      if (prev?.role === 'user' && prev.parts?.every((p) => p.functionResponse)) prev.parts.push(part);
      else contents.push({ role: 'user', parts: [part] });
      continue;
    }
    contents.push({ role: 'user', parts: [{ text: m.content }] });
  }
  return contents;
}

function mapError(error: unknown, signal?: AbortSignal): LlmError {
  if (error instanceof LlmError) return error;
  if (signal?.aborted && signal.reason instanceof DOMException && signal.reason.name === 'TimeoutError')
    return new LlmError('timeout', 'Gemini didn’t respond in time.');
  if (error instanceof ApiError) {
    if (error.status === 400 && /api key|API_KEY/i.test(error.message))
      return new LlmError('invalid_key', 'Gemini rejected the API key.', { status: 400 });
    return errorFromStatus(error.status, error.message, NAME);
  }
  return errorFromException(error, NAME);
}
