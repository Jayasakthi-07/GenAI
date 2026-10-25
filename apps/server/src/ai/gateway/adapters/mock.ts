import type {
  ChatChunk,
  ChatRequest,
  ChatResponse,
  LLMProvider,
  ModelInfo,
  ProviderHealthResult,
} from '../types';

export type MockScript = (req: ChatRequest, turn: number) => Partial<ChatResponse>;

/**
 * A deterministic model. Tests pass a script; the default behaviour reads the tool list and the
 * conversation: on the first turn it calls up to two read-only tools that need no arguments, and
 * then answers with a JSON summary built only from the tool results it saw. That is enough to show
 * a complete agent run (tool calls, steps, final output) without any real model.
 */
export class MockProvider implements LLMProvider {
  readonly kind = 'MOCK' as const;
  private script: MockScript | null = null;

  constructor(readonly id: string) {}

  /** Tests: replace the default behaviour. */
  setScript(script: MockScript | null) {
    this.script = script;
  }

  listModels(): Promise<ModelInfo[]> {
    return Promise.resolve([
      {
        id: 'mock-agent',
        provider: this.id,
        displayName: 'Mock agent model',
        contextWindow: 32_768,
        isLocal: true,
        isFree: true,
        capabilities: {
          tools: true,
          vision: false,
          thinking: false,
          embedding: false,
          structuredOutput: true,
        },
        sizeBytes: null,
        parameterSize: null,
        quantization: null,
        family: 'mock',
      },
      {
        id: 'mock-json',
        provider: this.id,
        displayName: 'Mock model without native tools',
        contextWindow: 32_768,
        isLocal: true,
        isFree: true,
        capabilities: {
          tools: false,
          vision: false,
          thinking: false,
          embedding: false,
          structuredOutput: true,
        },
        sizeBytes: null,
        parameterSize: null,
        quantization: null,
        family: 'mock',
      },
    ]);
  }

  healthCheck(): Promise<ProviderHealthResult> {
    return Promise.resolve({ status: 'connected', message: null, latencyMs: 0, version: 'mock' });
  }

  chat(req: ChatRequest): Promise<ChatResponse> {
    const turn = req.messages.filter((m) => m.role === 'assistant').length;
    const scripted = this.script?.(req, turn) ?? defaultBehaviour(req, turn);
    return Promise.resolve({
      model: req.model,
      content: '',
      reasoning: null,
      toolCalls: [],
      usage: { promptTokens: 0, completionTokens: 0 },
      finishReason: 'stop',
      ...scripted,
    });
  }

  async *chatStream(req: ChatRequest): AsyncGenerator<ChatChunk> {
    const res = await this.chat(req);
    for (const word of res.content.split(/(?<=\s)/)) yield { type: 'text', delta: word };
    for (const call of res.toolCalls) yield { type: 'tool_call', call };
    yield { type: 'done', response: res };
  }
}

function defaultBehaviour(req: ChatRequest, turn: number): Partial<ChatResponse> {
  const usedTools = req.messages.some((m) => m.role === 'tool');
  const readable = (req.tools ?? []).filter((t) => {
    const required = (t.parameters.required as string[] | undefined) ?? [];
    return required.length === 0 && /^(get_|list_|query_)/.test(t.name);
  });
  if (!usedTools && turn === 0 && readable.length) {
    return {
      content: '',
      toolCalls: readable
        .slice(0, 2)
        .map((t, i) => ({ id: `mock_${turn}_${i}`, name: t.name, arguments: {} })),
      finishReason: 'tool_calls',
    };
  }
  const results = req.messages.filter((m) => m.role === 'tool').map((m) => m.toolName ?? 'tool');
  const summary = results.length
    ? `Reviewed the results of ${results.join(', ')}. Everything shown comes from those tool results.`
    : 'Reviewed the information provided.';
  return { content: JSON.stringify({ summary, findings: [], actions: [] }), finishReason: 'stop' };
}
