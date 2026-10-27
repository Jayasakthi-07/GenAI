import type {
  ActionDto,
  AgentDto,
  AgentKey,
  AgentRunDetail,
  ApiError,
  ChatMessageDto,
  ChatStreamEvent,
  ConversationDetail,
  ConversationDto,
} from '@stockroom/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';
import type { MockProvider } from '../src/ai/gateway/adapters/mock';
import type { ChatRequest } from '../src/ai/gateway/types';
import { executeRun } from '../src/agents/runtime/runner';
import type { Handoff } from '../src/agents/types';
import { type Client, dayFromNow, type Fixture, seedInventoryFixture, signIn } from './fixtures';
import { createTestApp, resetDatabase } from './helpers';

const url = inject('testDbUrl');

/** Pulls a JSON tool result out of the conversation the mock model receives. */
function toolResult<T>(req: ChatRequest, name: string): T | null {
  const m = [...req.messages].reverse().find((x) => x.role === 'tool' && x.toolName === name);
  return m ? (JSON.parse(m.content) as T) : null;
}

describe.skipIf(!url)('Agent runtime (integration)', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  let fx: Fixture;
  let manager: Client;
  let staff: Client;
  let mock: MockProvider;
  const handoffs: Handoff[] = [];

  const run = async (
    key: AgentKey,
    trigger: 'MANUAL' | 'SCHEDULE' = 'MANUAL',
    detail: Record<string, unknown> | null = null,
  ) => {
    const { services } = ctx.app;
    const runId = await services.agents.createRun(key, trigger, detail);
    await executeRun(
      {
        services,
        gateway: services.llm,
        log: ctx.app.log,
        handoff: (h) => {
          handoffs.push(h);
          return Promise.resolve(null);
        },
      },
      runId,
      new AbortController().signal,
    );
    const result = await services.agents.run(runId);
    return result;
  };
  const setAgent = (key: string, data: object) => ctx.prisma.agentDefinition.update({ where: { key }, data });

  beforeAll(async () => {
    ctx = await createTestApp(url);
    await resetDatabase(ctx.prisma);
    fx = await seedInventoryFixture(ctx.prisma);
    const { services } = ctx.app;
    await services.ai.init();
    await services.agents.ensureDefinitions();
    await ctx.prisma.providerConfig.update({ where: { key: 'mock' }, data: { isEnabled: true } });
    await ctx.prisma.providerConfig.update({ where: { key: 'ollama' }, data: { isEnabled: false } });
    await services.llm.saveRouting({
      default: { providerKey: 'mock', modelId: 'mock-agent' },
      fallbacks: [],
      preferLocal: false,
      agentOverrides: {},
      maxRetries: 0,
    });
    mock = (await services.llm.registry.get('mock'))?.provider as MockProvider;
    manager = await signIn(ctx.app, fx.users.manager.email);
    staff = await signIn(ctx.app, fx.users.staff.email);

    // Rice at Chennai: 12 left, selling 5 a day for 8 weeks; reorder point 40.
    // Milk at Bengaluru: 3 left, selling 2 a day; reorder point 10.
    await manager.post('/stock/receive', {
      warehouseId: fx.chn.id,
      lines: [{ productId: fx.rice.id, quantity: 12, unitCost: '400' }],
    });
    await manager.post('/stock/receive', {
      warehouseId: fx.blr.id,
      lines: [
        { productId: fx.milk.id, quantity: 3, unitCost: '50', batchNo: 'M1', expiryDate: dayFromNow(60) },
      ],
    });
    const today = await services.planning.today();
    const rows = [];
    for (let i = 0; i < 56; i++) {
      const date = new Date(`${today}T00:00:00Z`);
      date.setUTCDate(date.getUTCDate() - i);
      rows.push(
        {
          productId: fx.rice.id,
          warehouseId: fx.chn.id,
          date,
          quantity: 5,
          revenue: '2400',
          cogs: '2000',
          orders: 2,
        },
        {
          productId: fx.milk.id,
          warehouseId: fx.blr.id,
          date,
          quantity: 2,
          revenue: '120',
          cogs: '100',
          orders: 1,
        },
      );
    }
    await ctx.prisma.salesDaily.createMany({ data: rows });
  });

  beforeEach(async () => {
    // Toggling a provider rebuilds its adapter, so look the mock up fresh each time.
    mock = (await ctx.app.services.llm.registry.get('mock'))?.provider as MockProvider;
    mock.setScript(null);
    handoffs.length = 0;
  });

  afterAll(async () => {
    mock?.setScript(null);
    await ctx?.app.close();
    await ctx?.prisma.$disconnect();
  });

  it('lists the agents with their tools, triggers and limits', async () => {
    const res = await manager.get<AgentDto[]>('/agents');
    expect(res.status).toBe(200);
    const sentinel = res.body.find((a) => a.key === 'stock_sentinel');
    expect(sentinel?.tools.map((t) => t.name)).toContain('list_open_alerts');
    expect(sentinel?.triggers.events).toContain('stock.changed');
    expect(res.body.find((a) => a.key === 'replenishment_planner')?.writes).toBe(true);
  });

  it('Stock Sentinel: code finds the issue, the model explains it via tools, and urgent items are handed off', async () => {
    const key = `LOW_STOCK:${fx.rice.id}:${fx.chn.id}`;
    mock.setScript((req, turn) => {
      if (turn === 0)
        return {
          toolCalls: [{ id: 't1', name: 'list_open_alerts', arguments: {} }],
          finishReason: 'tool_calls',
        };
      const alerts = toolResult<{ total: number }>(req, 'list_open_alerts');
      return {
        content: JSON.stringify({
          summary: `Ponni Rice 5 kg is low at CHN; reviewed ${alerts?.total ?? 0} open alerts.`,
          findings: [
            { title: 'Rice is low at CHN', detail: '2.4 days of cover vs 4-day lead time', severity: 'high' },
          ],
          alerts: [
            { key, explanation: 'Only 2.4 days left and the supplier needs 4. Reorder today.', priority: 99 },
          ],
          urgent: [fx.rice.id],
        }),
      };
    });
    const r = await run('stock_sentinel');
    expect(r.status).toBe('SUCCEEDED');
    expect(r.mode).toBe('AI');
    expect(r.modelId).toBe('mock-agent');
    expect(r.steps.map((s) => s.type)).toEqual([
      'ANALYSIS',
      'CONTEXT',
      'LLM_CALL',
      'TOOL_CALL',
      'LLM_CALL',
      'FINAL',
      'HANDOFF',
    ]);
    expect(r.output?.findings[0]?.severity).toBe('HIGH');

    const alert = await ctx.prisma.alert.findFirstOrThrow({ where: { dedupeKey: key } });
    expect(alert.explanationSource).toBe('AI');
    expect(alert.modelUsed).toMatch(/Mock/);
    // Re-ranking is bounded to ±10 of the deterministic priority.
    expect(alert.priority).toBeLessThanOrEqual(100);
    expect(handoffs).toHaveLength(1);
    expect(handoffs[0]?.to).toBe('replenishment_planner');
    expect(handoffs[0]?.productIds).toContain(fx.rice.id);
    // Every model call is recorded against the run.
    expect(await ctx.prisma.llmCall.count({ where: { runId: r.id, status: 'SUCCESS' } })).toBe(2);
  });

  it('skips the model when nothing changed since the last scheduled run', async () => {
    const first = await run('stock_sentinel', 'SCHEDULE');
    expect(['SUCCEEDED', 'NO_CHANGE']).toContain(first.status);
    const second = await run('stock_sentinel', 'SCHEDULE');
    expect(second.status).toBe('NO_CHANGE');
    expect(second.steps.map((s) => s.type)).toEqual(['ANALYSIS']);
  });

  it('Planner: proposes a PO through the write tool; a manager approves and it becomes a real PO', async () => {
    mock.setScript((req, turn) => {
      if (turn === 0)
        return { toolCalls: [{ id: 'p1', name: 'compute_reorder_plan', arguments: { warehouse: 'CHN' } }] };
      if (turn === 1) {
        const plan = toolResult<{ lines: Array<{ sku: string; quantity: number }> }>(
          req,
          'compute_reorder_plan',
        );
        const rice = plan?.lines.find((l) => l.sku === 'RICE-1');
        return {
          toolCalls: [
            {
              id: 'p2',
              name: 'propose_purchase_order',
              arguments: {
                supplier: 'SUP',
                warehouse: 'CHN',
                lines: [
                  { product: 'RICE-1', quantity: rice?.quantity ?? 0, rationale: 'Below reorder point' },
                ],
                rationale: 'Rice has 2.4 days of cover against a 4-day lead time.',
              },
            },
          ],
        };
      }
      return { content: JSON.stringify({ summary: 'Proposed one order.', findings: [] }) };
    });
    const r = await run('replenishment_planner', 'MANUAL');
    expect(r.status).toBe('SUCCEEDED');
    expect(r.mode).toBe('AI');
    const proposal = r.steps.find((s) => s.toolName === 'propose_purchase_order');
    expect(proposal?.output).toMatchObject({ outcome: 'pending' });
    expect(r.actions).toHaveLength(1);

    const action = (await manager.get<ActionDto>(`/actions/${r.actions[0]?.id}`)).body;
    expect(action).toMatchObject({ status: 'PENDING', rationaleSource: 'AI', type: 'CREATE_PURCHASE_ORDER' });
    expect(action.dataUsed.map((d) => d.tool)).toContain('compute_reorder_plan');
    expect(action.display.lines[0]).toMatchObject({
      product: { sku: 'RICE-1' },
      quantity: 152,
      available: 12,
    });
    expect(action.expectedImpact.stockoutsPrevented).toBe(1);

    expect((await staff.post<ApiError>(`/actions/${action.id}/approve`, {})).status).toBe(403);
    const approved = await manager.post<ActionDto>(`/actions/${action.id}/approve`, {});
    expect(approved.status).toBe(200);
    expect(approved.body.status).toBe('EXECUTED');
    expect(approved.body.result).toMatchObject({ entity: 'PurchaseOrder' });
    const po = await ctx.prisma.purchaseOrder.findFirstOrThrow({
      where: { agentActionId: action.id },
      include: { lines: true },
    });
    expect(po.status).toBe('APPROVED');
    expect(po.createdByType).toBe('AGENT');
    expect(po.lines[0]?.quantityOrdered).toBe(152);
    expect(po.lines[0]?.rationale).toBe('Below reorder point');
    const audit = await ctx.prisma.auditLog.findMany({
      where: { entityId: action.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(audit.map((a) => a.action)).toEqual(['action.propose', 'action.approve', 'action.execute']);
  });

  it('falls back to rules when no model is available, and Act mode executes low-risk proposals', async () => {
    await ctx.prisma.providerConfig.update({ where: { key: 'mock' }, data: { isEnabled: false } });
    await setAgent('replenishment_planner', { autonomy: 'ACT' });
    try {
      const r = await run('replenishment_planner');
      expect(r.status).toBe('SUCCEEDED');
      expect(r.mode).toBe('RULE_BASED');
      expect(r.output?.fallbackReason).toBe('No AI model is available');
      const action = await ctx.prisma.agentAction.findFirstOrThrow({ where: { runId: r.id } });
      // Milk at BLR: capped at max stock, ₹4,850, catalog price → low risk → executed automatically.
      expect(action).toMatchObject({
        status: 'EXECUTED',
        autoExecuted: true,
        rationaleSource: 'RULE',
        riskLevel: 'LOW',
      });
      const po = await ctx.prisma.purchaseOrder.findFirstOrThrow({
        where: { agentActionId: action.id },
        include: { lines: true },
      });
      expect(po.lines[0]?.quantityOrdered).toBe(97);
    } finally {
      await ctx.prisma.providerConfig.update({ where: { key: 'mock' }, data: { isEnabled: true } });
      await setAgent('replenishment_planner', { autonomy: 'RECOMMEND' });
    }
  });

  it('feeds rejections back into the next run and refuses to re-propose them', async () => {
    const { services } = ctx.app;
    const proposed = await services.actions.propose(
      { type: 'agent', agentKey: 'replenishment_planner', runId: null },
      {
        type: 'CREATE_PURCHASE_ORDER',
        payload: {
          supplierId: fx.supplier.id,
          warehouseId: fx.blr.id,
          lines: [{ productId: fx.milk.id, quantity: 10, unitCost: '50.00' }],
        },
        rationale: 'Milk is low at BLR.',
        rationaleSource: 'AI',
        modelUsed: 'mock',
        dataUsed: [],
      },
      {
        agentKey: 'replenishment_planner',
        runId: null,
        autonomy: 'RECOMMEND',
        limits: { maxSteps: 5, maxToolCalls: 5, timeoutMs: 60_000, maxActionsPerRun: 5, maxPoValueInr: 0 },
        createdThisRun: 0,
      },
    );
    expect(proposed.outcome).toBe('pending');
    const id = proposed.outcome === 'pending' ? proposed.actionId : '';
    expect((await manager.post<ApiError>(`/actions/${id}/reject`, { reason: '' })).status).toBe(400);
    const rejected = await manager.post<ActionDto>(`/actions/${id}/reject`, {
      reason: 'Milk is already on order at BLR',
    });
    expect(rejected.body.status).toBe('REJECTED');

    mock.setScript((_req, turn) =>
      turn === 0
        ? {
            toolCalls: [
              {
                id: 'r1',
                name: 'propose_purchase_order',
                arguments: {
                  supplier: 'SUP',
                  warehouse: 'BLR',
                  lines: [{ product: 'MILK-1', quantity: 10 }],
                  rationale: 'Milk is below its reorder point at BLR.',
                },
              },
            ],
          }
        : { content: JSON.stringify({ summary: 'Done.', findings: [] }) },
    );
    // Raise milk's reorder point at BLR so the planner has something to analyze.
    await ctx.prisma.stockLevel.update({
      where: { productId_warehouseId: { productId: fx.milk.id, warehouseId: fx.blr.id } },
      data: { reorderPoint: 500 },
    });
    const r = await run('replenishment_planner');
    const briefing = r.steps.find((s) => s.type === 'CONTEXT')?.content ?? '';
    expect(briefing).toContain('Milk is already on order at BLR');
    expect(r.steps.find((s) => s.toolName === 'propose_purchase_order')?.output).toMatchObject({
      outcome: 'recently_rejected',
    });
  });

  it('uses the JSON protocol for models without native tools', async () => {
    mock.setScript((req, turn) => {
      expect(req.tools).toBeUndefined();
      if (turn === 0)
        return { content: '```json\n{"tool_calls":[{"name":"get_inventory_kpis","arguments":{}}]}\n```' };
      expect(req.messages.at(-1)?.content).toContain('Result of get_inventory_kpis');
      return { content: JSON.stringify({ final: { summary: 'Checked the KPIs.', findings: [] } }) };
    });
    const r = await run('stock_sentinel', 'MANUAL', { model: { providerKey: 'mock', modelId: 'mock-json' } });
    expect(r.status).toBe('SUCCEEDED');
    expect(r.mode).toBe('AI');
    expect(r.modelId).toBe('mock-json');
    expect(r.steps.find((s) => s.type === 'LLM_CALL')?.output).toMatchObject({ protocol: 'json' });
    expect(r.steps.find((s) => s.type === 'TOOL_CALL')?.toolName).toBe('get_inventory_kpis');
  });

  it('returns invalid tool arguments to the model, and falls back to rules after a failed repair', async () => {
    let call = 0;
    mock.setScript(() => {
      call++;
      if (call === 1) return { toolCalls: [{ id: 'v1', name: 'get_product_details', arguments: {} }] };
      return { content: 'I think everything is fine.' };
    });
    const r = await run('stock_sentinel');
    expect(r.steps.filter((s) => s.type === 'VALIDATION_ERROR').map((s) => s.toolName ?? 'answer')).toEqual([
      'get_product_details',
      'answer',
      'answer',
    ]);
    expect(r.status).toBe('SUCCEEDED');
    expect(r.mode).toBe('RULE_BASED');
    expect(r.output?.fallbackReason).toMatch(/expected format/);
  });

  it('lets managers edit an agent and rejects invalid schedules', async () => {
    const bad = await manager.patch<ApiError>('/agents/stock_sentinel', {
      triggers: { cron: ['every day'], events: [], debounceSeconds: 10 },
    });
    expect(bad.status).toBe(400);
    const ok = await manager.patch<AgentDto>('/agents/stock_sentinel', {
      autonomy: 'OBSERVE',
      limits: { maxToolCalls: 4 },
    });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ autonomy: 'OBSERVE', limits: { maxToolCalls: 4, maxSteps: 6 } });
    expect((await staff.patch<ApiError>('/agents/stock_sentinel', { isEnabled: false })).status).toBe(403);
    const reset = await manager.patch<AgentDto>('/agents/stock_sentinel', {
      autonomy: 'RECOMMEND',
      systemPrompt: null,
      limits: { maxToolCalls: 8 },
    });
    expect(reset.body.systemPrompt).toBe(reset.body.defaultPrompt);
  });

  it('runs every scheduled agent end to end without a model', async () => {
    await ctx.prisma.providerConfig.update({ where: { key: 'mock' }, data: { isEnabled: false } });
    try {
      for (const key of [
        'demand_forecaster',
        'anomaly_auditor',
        'supplier_analyst',
        'inventory_optimizer',
        'report_writer',
      ] as const) {
        const r = await run(key);
        expect(r.status, `${key}: ${r.error ?? ''}`).toBe('SUCCEEDED');
        expect([null, 'RULE_BASED']).toContain(r.mode);
        expect(r.steps[0]?.type).toBe('ANALYSIS');
      }
      // Informational outputs are recorded directly, model or not.
      expect(await ctx.prisma.forecast.count({ where: { isLatest: true } })).toBe(2);
      const products = await ctx.prisma.product.findMany({ select: { abcClass: true, xyzClass: true } });
      expect(products.every((p) => p.abcClass && p.xyzClass)).toBe(true);
      const report = await ctx.prisma.report.findFirstOrThrow();
      expect(report).toMatchObject({ type: 'DAILY_BRIEFING', narrativeSource: 'RULE' });
      const supplier = await ctx.prisma.supplier.findUniqueOrThrow({ where: { id: fx.supplier.id } });
      expect(supplier.scoredAt).not.toBeNull();
    } finally {
      await ctx.prisma.providerConfig.update({ where: { key: 'mock' }, data: { isEnabled: true } });
    }
  });

  describe('Assistant', () => {
    const ask = async (client: Client, conversationId: string, content: string) => {
      const res = await client.post<string>(`/assistant/conversations/${conversationId}/messages`, {
        content,
      });
      expect(res.status).toBe(200);
      return String(res.body)
        .split('\n')
        .filter(Boolean)
        .map((l) => JSON.parse(l) as ChatStreamEvent);
    };
    const doneOf = (events: ChatStreamEvent[]) => {
      const done = events.find((e) => e.type === 'done');
      if (done?.type !== 'done') throw new Error('no done event');
      return done.message;
    };

    it('answers with tools, drafts a card, and carries it out as the person on confirm', async () => {
      mock.setScript((_req, turn) => {
        if (turn === 0)
          return { toolCalls: [{ id: 'a1', name: 'list_stock_positions', arguments: { warehouse: 'CHN' } }] };
        if (turn === 1)
          return {
            toolCalls: [
              {
                id: 'a2',
                name: 'propose_transfer',
                arguments: {
                  from: 'CHN',
                  to: 'BLR',
                  lines: [{ product: 'RICE-1', quantity: 5 }],
                  rationale: 'BLR has no rice.',
                },
              },
            ],
          };
        return { content: 'I drafted a transfer of 5 bags from CHN to BLR.\n\nBased on stock at CHN.' };
      });
      const conv = (await manager.post<ConversationDto>('/assistant/conversations', {})).body;
      const events = await ask(manager, conv.id, 'Move some rice to Bengaluru');
      expect(events.map((e) => e.type)).toEqual(
        expect.arrayContaining(['start', 'tool', 'part', 'text', 'done']),
      );
      const message = doneOf(events);
      const card = message.parts.find((p) => p.kind === 'card');
      expect(card?.kind === 'card' && card.card).toMatchObject({
        type: 'CREATE_TRANSFER',
        status: 'pending',
      });
      expect(message.citations.map((c) => c.tool)).toContain('list_stock_positions');
      // Drafting changed nothing.
      expect(await ctx.prisma.transfer.count()).toBe(0);

      const cardId = card?.kind === 'card' ? card.card.id : '';
      const confirmed = await manager.post<{ message: ChatMessageDto; action: ActionDto }>(
        `/assistant/messages/${message.id}/cards/${cardId}/confirm`,
      );
      expect(confirmed.status).toBe(200);
      expect(confirmed.body.action).toMatchObject({ status: 'EXECUTED', agent: { key: 'assistant' } });
      expect(confirmed.body.message.parts.find((p) => p.kind === 'card')).toMatchObject({
        card: { status: 'confirmed' },
      });
      const audit = await ctx.prisma.auditLog.findFirstOrThrow({ where: { action: 'transfer.create' } });
      expect(audit).toMatchObject({ actorType: 'USER', actorUserId: fx.users.manager.id });
      // A decided card can't be confirmed twice.
      expect((await manager.post(`/assistant/messages/${message.id}/cards/${cardId}/confirm`)).status).toBe(
        409,
      );

      const detail = await manager.get<ConversationDetail>(`/assistant/conversations/${conv.id}`);
      expect(detail.body.messages.map((m) => m.role)).toEqual(['user', 'assistant']);
      expect(detail.body.title).toBe('Move some rice to Bengaluru');
      // Conversations are private.
      const admin = await signIn(ctx.app, fx.users.admin.email);
      expect((await admin.get(`/assistant/conversations/${conv.id}`)).status).toBe(404);
    });

    it('lets the person dismiss a draft', async () => {
      mock.setScript((_req, turn) =>
        turn === 0
          ? {
              toolCalls: [
                {
                  id: 'd1',
                  name: 'propose_cycle_count',
                  arguments: { warehouse: 'CHN', products: ['RICE-1'], rationale: 'Check the shelf.' },
                },
              ],
            }
          : { content: 'Drafted a count.' },
      );
      const conv = (await manager.post<ConversationDto>('/assistant/conversations', {})).body;
      const message = doneOf(await ask(manager, conv.id, 'Count rice at Chennai'));
      const card = message.parts.find((p) => p.kind === 'card');
      const cardId = card?.kind === 'card' ? card.card.id : '';
      const dismissed = await manager.post<ChatMessageDto>(
        `/assistant/messages/${message.id}/cards/${cardId}/dismiss`,
      );
      expect(dismissed.body.parts.find((p) => p.kind === 'card')).toMatchObject({
        card: { status: 'dismissed' },
      });
      expect(
        await ctx.prisma.cycleCount.count({ where: { lines: { some: { productId: fx.rice.id } } } }),
      ).toBe(0);
    });

    it('gives setup guidance when no model is available', async () => {
      await ctx.prisma.providerConfig.update({ where: { key: 'mock' }, data: { isEnabled: false } });
      try {
        const conv = (await staff.post<ConversationDto>('/assistant/conversations', {})).body;
        const message = doneOf(await ask(staff, conv.id, 'What is low?'));
        expect(message).toMatchObject({ ruleBased: true, role: 'assistant' });
        expect(message.content).toMatch(/AI isn’t available/);
      } finally {
        await ctx.prisma.providerConfig.update({ where: { key: 'mock' }, data: { isEnabled: true } });
      }
    });
  });

  it('shows runs with steps through the API', async () => {
    const list = await manager.get<{ data: Array<{ id: string; agentKey: string }> }>(
      '/agent-runs?agentKey=stock_sentinel',
    );
    expect(list.status).toBe(200);
    const first = list.body.data[0];
    const detail = await manager.get<AgentRunDetail>(`/agent-runs/${first?.id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.steps.length).toBeGreaterThan(0);
  });
});
