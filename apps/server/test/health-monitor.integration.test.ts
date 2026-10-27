import type { AiStatus } from '@stockroom/shared';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { type Client, seedInventoryFixture, signIn } from './fixtures';
import { createTestApp, resetDatabase } from './helpers';

const url = inject('testDbUrl');

describe.skipIf(!url)('Local provider health monitor (integration)', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  let manager: Client;
  const announced: string[] = [];

  beforeAll(async () => {
    ctx = await createTestApp(url);
    await resetDatabase(ctx.prisma);
    const fx = await seedInventoryFixture(ctx.prisma);
    await ctx.app.services.ai.init();
    // Ollama "installed" but nothing listening: port 1 refuses connections at once.
    await ctx.prisma.providerConfig.update({
      where: { key: 'ollama' },
      data: { isEnabled: true, baseUrl: 'http://127.0.0.1:1', health: 'CONNECTED' },
    });
    ctx.app.services.ai.gateway.registry.invalidate();
    ctx.app.bus.on('ai.status', (e) => announced.push(`${e.payload.providerKey}:${e.payload.health}`));
    manager = await signIn(ctx.app, fx.users.manager.email);
  });
  afterAll(async () => {
    ctx?.app.services.ai.stopHealthMonitor();
    await ctx?.app.close();
    await ctx?.prisma.$disconnect();
  });

  it('marks a stopped local provider offline on its own and announces it', async () => {
    ctx.app.services.ai.startHealthMonitor(60_000);
    await expect
      .poll(
        async () => (await ctx.prisma.providerConfig.findUniqueOrThrow({ where: { key: 'ollama' } })).health,
        {
          timeout: 10_000,
        },
      )
      .toBe('OFFLINE');
    expect(announced).toContain('ollama:OFFLINE');
    const status = await manager.get<AiStatus>('/ai/status');
    expect(status.body.mode).toBe('RULE_BASED');
  });
});
