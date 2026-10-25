import { afterEach, describe, expect, it, vi } from 'vitest';
import { GeminiProvider } from './adapters/gemini';
import { MockProvider } from './adapters/mock';
import { OllamaProvider } from './adapters/ollama';
import { OpenAiCompatibleProvider } from './adapters/openai-compatible';
import { backoffMs, ProviderBudget } from './budget';
import { SecretBox } from './crypto';
import { errorFromStatus, LlmError } from './errors';
import { sanitizeSchema } from './schema-sanitize';
import { splitThinking, ThinkStreamSplitter } from './think';
import type { ProviderSettings } from './types';

const SETTINGS: ProviderSettings = {
  rpm: 0,
  concurrency: 2,
  dailyBudget: 0,
  timeoutMs: 5000,
  numCtx: 8192,
  keepAlive: '5m',
  disableThinking: false,
};
const TOOL = {
  name: 'get_stock',
  description: 'Stock for a SKU',
  parameters: { type: 'object', properties: { sku: { type: 'string' } }, required: ['sku'] },
};

type Handler = (url: string, init: RequestInit) => Response | Promise<Response>;
function mockFetch(handler: Handler) {
  const calls: Array<{ url: string; body: unknown }> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request, init: RequestInit = {}) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      calls.push({ url, body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined });
      return handler(url, init);
    }),
  );
  return calls;
}
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
const lines = (rows: string[]) => new Response(rows.join('\n'), { status: 200 });

afterEach(() => vi.unstubAllGlobals());

describe('thinking splitter', () => {
  it('separates <think> blocks from the answer', () => {
    expect(splitThinking('<think>count the units</think>{"final":1}')).toEqual({
      content: '{"final":1}',
      reasoning: 'count the units',
    });
    expect(splitThinking('plain answer')).toEqual({ content: 'plain answer', reasoning: null });
    expect(splitThinking('<think>cut off')).toEqual({ content: '', reasoning: 'cut off' });
  });

  it('handles tags split across stream deltas', () => {
    const s = new ThinkStreamSplitter();
    const out = ['Hello <thi', 'nk>secret</th', 'ink> world'].map((d) => s.push(d));
    expect(out.map((o) => o.text).join('')).toBe('Hello  world');
    expect(out.map((o) => o.reasoning).join('')).toBe('secret');
  });
});

describe('schema sanitizer', () => {
  const schema = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    additionalProperties: false,
    properties: {
      sku: { type: 'string', format: 'uuid', default: 'x' },
      qty: { anyOf: [{ type: 'number' }, { type: 'null' }] },
      ref: { $ref: '#/$defs/Line' },
      kind: { oneOf: [{ type: 'string' }, { type: 'number' }] },
    },
    $defs: { Line: { type: 'object', properties: { n: { type: 'integer' } } } },
  };

  it('makes schemas Gemini-safe', () => {
    const out = sanitizeSchema(schema, 'gemini');
    expect(out).not.toHaveProperty('$schema');
    expect(out).not.toHaveProperty('additionalProperties');
    expect(out).not.toHaveProperty('$defs');
    expect(out).toHaveProperty('properties.sku', { type: 'string' });
    expect(out).toHaveProperty('properties.qty', { type: 'number', nullable: true });
    expect(out).toHaveProperty('properties.ref', { type: 'object', properties: { n: { type: 'integer' } } });
    expect(out).toHaveProperty('properties.kind.anyOf', [{ type: 'string' }, { type: 'number' }]);
  });

  it('keeps most keywords for OpenAI-compatible providers but inlines $ref', () => {
    const out = sanitizeSchema(schema, 'openai');
    expect(out).toHaveProperty('additionalProperties', false);
    expect(out).toHaveProperty('properties.sku.format', 'uuid');
    expect(out).toHaveProperty('properties.ref.properties.n.type', 'integer');
  });
});

describe('secret box', () => {
  it('round-trips and never stores plaintext', () => {
    const box = new SecretBox(Buffer.alloc(32, 7).toString('base64'));
    const blob = box.encrypt('sk-live-1234');
    expect(Buffer.from(blob).toString('utf8')).not.toContain('sk-live');
    expect(box.decrypt(blob)).toBe('sk-live-1234');
    const other = new SecretBox(Buffer.alloc(32, 8).toString('base64'));
    expect(() => other.decrypt(blob)).toThrow();
  });
});

describe('error mapping', () => {
  it('classifies statuses and honours Retry-After', () => {
    expect(errorFromStatus(401, '', 'X').code).toBe('invalid_key');
    const rl = errorFromStatus(429, '', 'X', '7');
    expect(rl.code).toBe('rate_limited');
    expect(rl.retryAfterMs).toBe(7000);
    expect(rl.retryable).toBe(true);
    expect(errorFromStatus(503, '', 'X').retryable).toBe(true);
    expect(errorFromStatus(400, 'model does not support tools', 'X').code).toBe('no_tools');
  });

  it('backs off with jitter inside the cap', () => {
    for (let i = 0; i < 50; i++) {
      const ms = backoffMs(3);
      expect(ms).toBeGreaterThanOrEqual(0);
      expect(ms).toBeLessThanOrEqual(4800);
    }
  });
});

describe('budgets', () => {
  it('limits concurrency and queues the rest', async () => {
    const budget = new ProviderBudget({ ...SETTINGS, concurrency: 1 }, () => Promise.resolve(0));
    const release = await budget.acquire();
    let second = false;
    const p = budget.acquire().then((r) => {
      second = true;
      return r;
    });
    await new Promise((r) => setTimeout(r, 20));
    expect(second).toBe(false);
    release();
    (await p)();
    expect(second).toBe(true);
  });

  it('refuses calls beyond the daily budget', async () => {
    const budget = new ProviderBudget({ ...SETTINGS, dailyBudget: 50 }, () => Promise.resolve(50));
    await expect(budget.acquire()).rejects.toMatchObject({ code: 'budget_exceeded' });
  });
});

describe('Ollama adapter', () => {
  const ollama = () => new OllamaProvider('ollama', 'http://127.0.0.1:11434', SETTINGS);

  it('lists models with capabilities and what is loaded', async () => {
    mockFetch((url) => {
      if (url.endsWith('/api/tags')) {
        return json({
          models: [
            {
              name: 'qwen3:8b',
              size: 5e9,
              details: {
                parameter_size: '8.2B',
                quantization_level: 'Q4_K_M',
                family: 'qwen3',
                context_length: 40960,
              },
              capabilities: ['completion', 'tools', 'thinking'],
            },
          ],
        });
      }
      if (url.endsWith('/api/ps')) return json({ models: [{ name: 'qwen3:8b', size_vram: 4e9 }] });
      return json({}, 404);
    });
    const [m] = await ollama().listModels();
    expect(m).toMatchObject({
      id: 'qwen3:8b',
      isLocal: true,
      loaded: true,
      contextWindow: 40960,
      parameterSize: '8.2B',
      capabilities: { tools: true, thinking: true },
    });
  });

  it('sends num_ctx and tools, and parses tool calls and thinking', async () => {
    const calls = mockFetch((url) => {
      if (url.endsWith('/api/show'))
        return json({
          capabilities: ['completion', 'tools', 'thinking'],
          model_info: { 'qwen3.context_length': 40960 },
        });
      return json({
        model: 'qwen3:8b',
        message: {
          role: 'assistant',
          content: '',
          thinking: 'need stock',
          tool_calls: [{ id: 'c1', function: { name: 'get_stock', arguments: { sku: 'A1' } } }],
        },
        done: true,
        prompt_eval_count: 10,
        eval_count: 5,
      });
    });
    const res = await ollama().chat({
      model: 'qwen3:8b',
      messages: [{ role: 'user', content: 'stock?' }],
      tools: [TOOL],
    });
    const body = calls.at(-1)!.body;
    expect(body).toHaveProperty('options.num_ctx', 8192);
    expect(body).toHaveProperty('think', true);
    expect(body).toHaveProperty(['tools', 0, 'function', 'name'], 'get_stock');
    expect(res.toolCalls).toEqual([{ id: 'c1', name: 'get_stock', arguments: { sku: 'A1' } }]);
    expect(res.reasoning).toBe('need stock');
    expect(res.usage).toEqual({ promptTokens: 10, completionTokens: 5 });
  });

  it('streams NDJSON deltas', async () => {
    mockFetch((url) => {
      if (url.endsWith('/api/show')) return json({ capabilities: ['completion'] });
      return lines([
        JSON.stringify({ model: 'm', message: { content: 'Hel' } }),
        JSON.stringify({ model: 'm', message: { content: 'lo' } }),
        JSON.stringify({ model: 'm', message: { content: '' }, done: true, eval_count: 2 }),
      ]);
    });
    const chunks = [];
    for await (const c of ollama().chatStream({ model: 'm', messages: [{ role: 'user', content: 'hi' }] }))
      chunks.push(c);
    expect(
      chunks
        .filter((c) => c.type === 'text')
        .map((c) => (c as { delta: string }).delta)
        .join(''),
    ).toBe('Hello');
    expect(chunks.at(-1)).toMatchObject({ type: 'done', response: { content: 'Hello' } });
  });

  it('reports offline with guidance when Ollama is not running', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.reject(Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } })),
      ),
    );
    const h = await ollama().healthCheck();
    expect(h.status).toBe('offline');
    expect(h.message).toMatch(/ollama pull/);
  });
});

describe('OpenAI-compatible adapter', () => {
  const groq = (apiKey: string | undefined = 'gsk_test') =>
    new OpenAiCompatibleProvider({
      id: 'openrouter',
      displayName: 'OpenRouter',
      baseUrl: 'https://openrouter.ai/api/v1',
      apiKey,
      requiresKey: true,
      freeTier: false,
      isLocal: false,
      settings: SETTINGS,
    });

  it('marks free models and tool support from the catalog', async () => {
    mockFetch(() =>
      json({
        data: [
          {
            id: 'meta/llama:free',
            name: 'Llama',
            context_length: 128000,
            pricing: { prompt: '0', completion: '0' },
            supported_parameters: ['tools'],
          },
          {
            id: 'paid/model',
            pricing: { prompt: '0.000001', completion: '0.000002' },
            supported_parameters: [],
          },
        ],
      }),
    );
    const models = await groq().listModels();
    expect(models.find((m) => m.id === 'meta/llama:free')).toMatchObject({
      isFree: true,
      capabilities: { tools: true },
      contextWindow: 128000,
    });
    expect(models.find((m) => m.id === 'paid/model')).toMatchObject({
      isFree: false,
      capabilities: { tools: false },
    });
  });

  it('sends a bearer key, tool schemas, and parses tool-call JSON', async () => {
    const seen: Array<{ auth: string | null }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init: RequestInit) => {
        seen.push({ auth: new Headers(init.headers).get('authorization') });
        return Promise.resolve(
          json({
            model: 'x',
            choices: [
              {
                message: {
                  content: null,
                  tool_calls: [{ id: 't1', function: { name: 'get_stock', arguments: '{"sku":"B2"}' } }],
                },
                finish_reason: 'tool_calls',
              },
            ],
            usage: { prompt_tokens: 3, completion_tokens: 4 },
          }),
        );
      }),
    );
    const res = await groq().chat({ model: 'x', messages: [{ role: 'user', content: 'hi' }], tools: [TOOL] });
    expect(seen[0]!.auth).toBe('Bearer gsk_test');
    expect(res.toolCalls[0]).toEqual({ id: 't1', name: 'get_stock', arguments: { sku: 'B2' } });
  });

  it('keeps invalid tool-call JSON for the runtime to correct', async () => {
    mockFetch(() =>
      json({
        choices: [
          { message: { tool_calls: [{ id: 't1', function: { name: 'get_stock', arguments: '{sku: B2' } }] } },
        ],
      }),
    );
    const res = await groq().chat({ model: 'x', messages: [{ role: 'user', content: 'hi' }], tools: [TOOL] });
    expect(res.toolCalls[0]).toMatchObject({ arguments: {}, rawArguments: '{sku: B2' });
  });

  it('assembles streamed tool-call deltas', async () => {
    mockFetch(() =>
      lines([
        `data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'c9', function: { name: 'get_', arguments: '{"sk' } }] } }] })}`,
        `data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, function: { name: 'stock', arguments: 'u":"Z"}' } }] }, finish_reason: 'tool_calls' }] })}`,
        'data: [DONE]',
      ]),
    );
    const chunks = [];
    for await (const c of groq().chatStream({
      model: 'x',
      messages: [{ role: 'user', content: 'hi' }],
      tools: [TOOL],
    }))
      chunks.push(c);
    expect(chunks.find((c) => c.type === 'tool_call')).toMatchObject({
      call: { id: 'c9', name: 'get_stock', arguments: { sku: 'Z' } },
    });
  });

  it('maps 429 with Retry-After and refuses to call without a key', async () => {
    mockFetch(() => json({ error: { message: 'slow down' } }, 429, { 'retry-after': '3' }));
    await expect(
      groq().chat({ model: 'x', messages: [{ role: 'user', content: 'hi' }] }),
    ).rejects.toMatchObject({ code: 'rate_limited', retryAfterMs: 3000 });
    await expect(groq(undefined).chat({ model: 'x', messages: [] })).rejects.toBeInstanceOf(LlmError);
  });
});

describe('Gemini adapter', () => {
  it('sends function declarations and replays thought signatures', async () => {
    const calls = mockFetch(() =>
      json({
        candidates: [
          {
            content: {
              role: 'model',
              parts: [
                { text: 'checking', thought: true },
                {
                  functionCall: { id: 'g1', name: 'get_stock', args: { sku: 'C3' } },
                  thoughtSignature: 'sig',
                },
              ],
            },
            finishReason: 'STOP',
          },
        ],
        usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 6 },
      }),
    );
    const gemini = new GeminiProvider('gemini', 'AIza-test', SETTINGS);
    const res = await gemini.chat({
      model: 'gemini-2.5-flash',
      messages: [
        { role: 'system', content: 'be brief' },
        { role: 'user', content: 'stock?' },
      ],
      tools: [TOOL],
    });
    expect(res.toolCalls[0]).toEqual({ id: 'g1', name: 'get_stock', arguments: { sku: 'C3' } });
    expect(res.reasoning).toBe('checking');
    expect(JSON.stringify(calls[0]!.body)).toContain('get_stock');

    // The next turn sends the model's raw content back, signature included.
    await gemini.chat({
      model: 'gemini-2.5-flash',
      messages: [
        { role: 'user', content: 'stock?' },
        { role: 'assistant', content: '', toolCalls: res.toolCalls, providerData: res.providerData },
        { role: 'tool', content: '{"onHand":5}', toolCallId: 'g1', toolName: 'get_stock' },
      ],
      tools: [TOOL],
    });
    expect(JSON.stringify(calls[1]!.body)).toContain('"thoughtSignature":"sig"');
    expect(JSON.stringify(calls[1]!.body)).toContain('functionResponse');
  });
});

describe('Mock provider', () => {
  it('calls argument-free read tools, then answers from their results', async () => {
    const mock = new MockProvider('mock');
    const tools = [
      { name: 'list_open_alerts', description: '', parameters: { type: 'object', properties: {} } },
      TOOL,
    ];
    const first = await mock.chat({
      model: 'mock-agent',
      messages: [{ role: 'user', content: 'go' }],
      tools,
    });
    expect(first.toolCalls.map((c) => c.name)).toEqual(['list_open_alerts']);
    const second = await mock.chat({
      model: 'mock-agent',
      messages: [
        { role: 'user', content: 'go' },
        { role: 'assistant', content: '', toolCalls: first.toolCalls },
        { role: 'tool', content: '[]', toolCallId: first.toolCalls[0]!.id, toolName: 'list_open_alerts' },
      ],
      tools,
    });
    expect((JSON.parse(second.content) as { summary: string }).summary).toContain('list_open_alerts');
  });
});
