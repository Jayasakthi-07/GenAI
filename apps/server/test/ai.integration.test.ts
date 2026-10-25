import type { ProviderDto } from '@stockroom/shared';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import type { MockProvider } from '../src/ai/gateway/adapters/mock';
import { LlmError } from '../src/ai/gateway/errors';
import { type Client, seedInventoryFixture, signIn } from './fixtures';
import { createTestApp, resetDatabase } from './helpers';

const url = inject('testDbUrl');

describe.skipIf(!url)('LLM gateway (integration)', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  let admin: Client;
  let staff: Client;

  beforeAll(async () => {
    ctx = await createTestApp(url);
    await resetDatabase(ctx.prisma);
    const fx = await seedInventoryFixture(ctx.prisma);
    await ctx.app.services.ai.init();
    // Two mock providers: one that is rate-limited, one that answers.
    await ctx.prisma.providerConfig.update({ where: { key: 'mock' }, data: { isEnabled: true } });
    await ctx.prisma.providerConfig.create({
      data: {
        key: 'mock-b',
        kind: 'MOCK',
        displayName: 'Mock B',
        baseUrl: 'mock://b',
        isEnabled: true,
        isCustom: true,
        settings: {
          rpm: 0,
          concurrency: 2,
          dailyBudget: 0,
          timeoutMs: 5000,
          numCtx: 8192,
          keepAlive: '0',
          disableThinking: true,
        },
      },
    });
    // Ollama isn't reachable in tests; keep it out of routing.
    await ctx.prisma.providerConfig.update({ where: { key: 'ollama' }, data: { isEnabled: false } });
    admin = await signIn(ctx.app, fx.users.admin.email);
    staff = await signIn(ctx.app, fx.users.staff.email);
  });

  afterAll(async () => {
    await ctx?.app.close();
    await ctx?.prisma.$disconnect();
  });

  it('retries a rate-limited model, then falls back and records every attempt', async () => {
    const { gateway, registry } = {
      gateway: ctx.app.services.ai.gateway,
      registry: ctx.app.services.ai.gateway.registry,
    };
    await gateway.saveRouting({
      default: { providerKey: 'mock', modelId: 'mock-agent' },
      fallbacks: [{ providerKey: 'mock-b', modelId: 'mock-agent' }],
      preferLocal: false,
      agentOverrides: {},
      maxRetries: 1,
    });
    const a = (await registry.get('mock'))!.provider as MockProvider;
    a.setScript(() => {
      throw new LlmError('rate_limited', 'Mock A is busy.', { retryAfterMs: 5 });
    });
    const res = await gateway.chat({ purpose: 'AGENT', agentKey: 'stock_sentinel' }, () => ({
      messages: [{ role: 'user', content: 'hello' }],
    }));
    expect(res.resolved.providerKey).toBe('mock-b');
    expect(res.isFallback).toBe(true);
    const calls = await ctx.prisma.llmCall.findMany({
      where: { agentKey: 'stock_sentinel' },
      orderBy: { startedAt: 'asc' },
    });
    expect(calls.map((c) => [c.providerKey, c.status, c.attempt])).toEqual([
      ['mock', 'RATE_LIMITED', 1],
      ['mock', 'RATE_LIMITED', 2],
      ['mock-b', 'SUCCESS', 1],
    ]);
    a.setScript(null);
  });

  it('uses a per-agent override before the default', async () => {
    const gateway = ctx.app.services.ai.gateway;
    await gateway.saveRouting({
      default: { providerKey: 'mock', modelId: 'mock-agent' },
      fallbacks: [],
      preferLocal: false,
      agentOverrides: { demand_forecaster: { providerKey: 'mock-b', modelId: 'mock-json' } },
      maxRetries: 0,
    });
    const [first] = await gateway.candidates({ agentKey: 'demand_forecaster' });
    expect(first).toMatchObject({
      providerKey: 'mock-b',
      modelId: 'mock-json',
      capabilities: { tools: false },
    });
  });

  it('fails with no_model when nothing can answer', async () => {
    const gateway = ctx.app.services.ai.gateway;
    await gateway.saveRouting({
      default: null,
      fallbacks: [],
      preferLocal: false,
      agentOverrides: {},
      maxRetries: 0,
    });
    await ctx.prisma.providerConfig.updateMany({ where: { kind: 'MOCK' }, data: { isEnabled: false } });
    gateway.registry.invalidate();
    await expect(
      gateway.chat({ purpose: 'AGENT' }, () => ({ messages: [{ role: 'user', content: 'x' }] })),
    ).rejects.toMatchObject({ code: 'no_model' });
    const status = await admin.get<{ mode: string }>('/ai/status');
    expect(status.body.mode).toBe('RULE_BASED');
    await ctx.prisma.providerConfig.updateMany({ where: { kind: 'MOCK' }, data: { isEnabled: true } });
    gateway.registry.invalidate();
  });

  it('stores keys encrypted and only ever returns the last four characters', async () => {
    const res = await admin.patch<ProviderDto>('/ai/providers/groq', {
      apiKey: 'gsk_super_secret_9876',
      isEnabled: false,
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ hasKey: true, keySource: 'ui', apiKeyLast4: '9876' });
    expect(JSON.stringify(res.body)).not.toContain('super_secret');
    const row = await ctx.prisma.providerConfig.findUniqueOrThrow({ where: { key: 'groq' } });
    expect(Buffer.from(row.apiKeyCiphertext!).toString('utf8')).not.toContain('super_secret');
    const list = await admin.get<ProviderDto[]>('/ai/providers');
    expect(JSON.stringify(list.body)).not.toContain('super_secret');
    const audit = await ctx.prisma.auditLog.findFirstOrThrow({ where: { action: 'ai.provider.update' } });
    expect(JSON.stringify(audit.after)).not.toContain('super_secret');
  });

  it('keeps providers and keys admin-only', async () => {
    expect((await staff.get('/ai/providers')).status).toBe(403);
    expect((await staff.patch('/ai/providers/groq', { apiKey: 'x' })).status).toBe(403);
    expect((await staff.get('/ai/status')).status).toBe(200);
  });

  it('adds and removes a custom OpenAI-compatible endpoint', async () => {
    const created = await admin.post<ProviderDto>('/ai/providers', {
      displayName: 'My Lab Server',
      baseUrl: 'http://127.0.0.1:9/v1',
    });
    expect(created.status).toBe(200);
    expect(created.body).toMatchObject({ key: 'custom-my-lab-server', isCustom: true, health: 'OFFLINE' });
    expect((await admin.del('/ai/providers/custom-my-lab-server')).status).toBe(200);
    expect((await admin.del('/ai/providers/groq')).status).toBe(400);
  });
});
