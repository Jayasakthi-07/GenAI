import { randomUUID } from 'node:crypto';
import type { ChatChart, ChatPart, ChatStreamEvent, ConfirmationCard } from '@stockroom/shared';
import type { FastifyBaseLogger } from 'fastify';
import type { GatewayResult, LlmGateway, ModelRef, ResolvedModel } from '../../ai/gateway/gateway';
import type { ToolCall } from '../../ai/gateway/types';
import type { Actor } from '../../domain/actor';
import type { Services } from '../../services';
import { localDay } from '../../services/support';
import { executeTool, TOOLS, toolSpecs } from '../tools';
import type { ToolContext } from '../types';
import { extractJson, parseJsonProtocol, renderJson, renderNative, type Turn } from '../runtime/protocol';

export interface ChatDeps {
  services: Services;
  gateway: LlmGateway;
  log: FastifyBaseLogger;
}

const CHAT_RULES = [
  'Rules:',
  '- Every number you state must come from a tool result in this conversation. If you have not looked it up, look it up.',
  '- Products, warehouses and suppliers can be referred to by SKU or code (e.g. STP-RIC-005, CBE, EST).',
  '- Use Markdown: short paragraphs, bullet lists, and a table when listing four or more rows.',
  '- End with one short line that says what data you used, starting with "Based on".',
  '- You cannot change anything yourself. propose_ tools show the person a confirmation card; describe what you drafted and let them confirm.',
  '- If a request is outside inventory, sales, purchasing, suppliers or the agents, say so briefly.',
].join('\n');

const NO_MODEL =
  'AI isn’t available right now, so I can’t answer questions. Start Ollama on this computer or add a cloud provider key in **Settings → AI & models**, then ask again.\n\nEverything else keeps working without AI: the agents still raise rule-based alerts and proposals, and the dashboard, stock and order pages are all up to date.';

const fmtWeek = (d: string) =>
  new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' }).format(new Date(`${d}T00:00:00Z`));

/** Small charts for tool results that are series (sales by week, forecasts, sales by group). */
function chartFor(tool: string, value: unknown): ChatChart | null {
  const v = value as Record<string, unknown> | null;
  if (!v) return null;
  if (tool === 'get_sales_history' && Array.isArray(v.weeks)) {
    const weeks = v.weeks as Array<{ weekStarting: string; units: number; revenue: number }>;
    if (weeks.length < 2) return null;
    return {
      title: 'Units sold per week',
      type: 'trend',
      xKey: 'week',
      series: [{ key: 'units', label: 'Units' }],
      data: weeks.map((w) => ({ week: fmtWeek(w.weekStarting), units: w.units })),
      unit: 'units',
    };
  }
  if (tool === 'get_forecast' && Array.isArray(v.nextWeeks)) {
    const weeks = v.nextWeeks as Array<{ week: number; units: number; low80: number; high80: number }>;
    return {
      title: 'Forecast, next four weeks',
      type: 'bars',
      xKey: 'label',
      series: [
        { key: 'units', label: 'Forecast' },
        { key: 'high80', label: 'High (80 %)' },
      ],
      data: weeks.map((w) => ({ label: `Week ${w.week}`, units: w.units, high80: w.high80 })),
      unit: 'units',
    };
  }
  if (tool === 'query_sales_summary' && Array.isArray(v.rows)) {
    const rows = (v.rows as Array<{ label: string; revenue: number }>).slice(0, 10);
    if (rows.length < 2) return null;
    return {
      title: `Revenue by ${typeof v.groupBy === 'string' ? v.groupBy : 'group'}, last ${typeof v.days === 'number' ? v.days : 30} days`,
      type: 'bars',
      xKey: 'label',
      series: [{ key: 'revenue', label: 'Revenue' }],
      data: rows.map((r) => ({
        label: r.label.length > 22 ? `${r.label.slice(0, 21)}…` : r.label,
        revenue: r.revenue,
      })),
      unit: 'money',
    };
  }
  return null;
}

/** The text of a JSON-protocol final answer, whatever shape the model gave it. */
function finalText(value: unknown, raw: string): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    for (const k of ['answer', 'text', 'message', 'content', 'summary']) {
      const v = o[k];
      if (typeof v === 'string') return v;
    }
  }
  return raw;
}

/**
 * One Assistant turn, streamed: save the question, run the tool loop with the model (streaming its
 * text), turn write tools into confirmation cards, save the answer. Recorded as an agent run.
 */
export async function* chatTurn(
  deps: ChatDeps,
  actor: Actor & { type: 'user' },
  conversationId: string,
  content: string,
  opts: { model?: ModelRef; signal: AbortSignal },
): AsyncGenerator<ChatStreamEvent> {
  const { services, gateway, log } = deps;
  const question = await services.chat.addMessage(actor, conversationId, { role: 'user', content });
  const history = (await services.chat.history(actor, conversationId, 13)).slice(0, -1);
  const settings = await services.agents.settings('assistant');
  const override = opts.model ?? settings.modelOverride;
  const module = services.agents.module('assistant');

  if (!(await gateway.candidates({ agentKey: 'assistant', override })).length) {
    yield { type: 'start', runId: null, model: null, userMessageId: question.id };
    yield { type: 'text', delta: NO_MODEL };
    const message = await services.chat.addMessage(actor, conversationId, {
      role: 'assistant',
      content: NO_MODEL,
      ruleBased: true,
    });
    yield { type: 'done', message, conversation: await services.chat.summary(actor, conversationId) };
    return;
  }

  const runId = await services.agents.createRun('assistant', 'CHAT', {
    conversationId,
    question: content.slice(0, 200),
    userId: actor.userId,
  });
  await services.agents.startRun(runId, 'assistant');
  yield { type: 'start', runId, model: null, userMessageId: question.id };

  let seq = 0;
  const record = (step: Parameters<Services['agents']['addStep']>[3]) =>
    services.agents.addStep(runId, 'assistant', ++seq, step);
  const org = await services.planning.org();
  const today = localDay(new Date(), org.timezone);
  const parts: ChatPart[] = [];
  const pending: ChatStreamEvent[] = [];
  const signal = AbortSignal.any([opts.signal, AbortSignal.timeout(settings.limits.timeoutMs)]);
  const ctx: ToolContext = {
    runId,
    agentKey: 'assistant',
    trigger: 'CHAT',
    triggerDetail: { conversationId },
    settings: { ...settings, modelOverride: override },
    services,
    actor,
    org,
    today,
    focusProductIds: [],
    signal,
    modelUsed: null,
    analysis: {
      headline: 'Chat',
      facts: null,
      fingerprint: '',
      ruleBased: { summary: '', findings: [], proposals: [] },
      state: null,
    },
    citations: [],
    proposals: { created: 0, observed: [] },
    draft: async (type, payload, rationale) => {
      const prepared = await services.actions.prepare(type, payload);
      const card: ConfirmationCard = {
        id: randomUUID(),
        type,
        title: prepared.title,
        summary: prepared.summary,
        rationale,
        riskLevel: prepared.riskLevel,
        impact: prepared.impact,
        display: await services.actions.preview(type, prepared.payload),
        payload: prepared.payload,
        status: 'pending',
        result: null,
        error: null,
      };
      const part: ChatPart = { kind: 'card', card };
      parts.push(part);
      pending.push({ type: 'part', part });
      return {
        outcome: 'awaiting_confirmation',
        title: card.title,
        summary: card.summary,
        message:
          'Shown to the person as a confirmation card. Nothing changes until they confirm. Tell them briefly what you drafted and why.',
      };
    },
  };

  const system = `${settings.systemPrompt.trim()}\n\n${CHAT_RULES}\n\nToday is ${today} (${org.timezone}); money is in INR. You are helping ${actor.name} (${actor.role.toLowerCase()}) at ${org.name}.\nWhen tools aren't native, answer with {"final": "<your Markdown answer>"}.`;
  const turns: Turn[] = [
    ...history.map((h): Turn =>
      h.role === 'user'
        ? { kind: 'user', content: h.content }
        : { kind: 'assistant', content: h.content, toolCalls: [] },
    ),
    { kind: 'user', content },
  ];
  const specs = toolSpecs(module.tools);
  const limits = settings.limits;
  let answer = '';
  let model: ResolvedModel | null = null;
  let toolCalls = 0;
  const usage = { prompt: 0, completion: 0 };

  try {
    for (let step = 1; step <= limits.maxSteps; step++) {
      const use = step < limits.maxSteps && toolCalls < limits.maxToolCalls ? specs : [];
      let text = '';
      let calls: ToolCall[] = [];
      let res: GatewayResult | null = null;
      let jsonMode = false;
      const started = performance.now();
      for await (const chunk of gateway.chatStream(
        { purpose: 'CHAT', agentKey: 'assistant', runId, override, signal },
        (m) =>
          m.capabilities.tools === false
            ? { messages: renderJson(system, use, turns), json: true, temperature: 0.3 }
            : {
                messages: renderNative(system, turns),
                tools: use.length ? use : undefined,
                temperature: 0.3,
              },
      )) {
        if (chunk.type === 'start') {
          model = chunk.resolved;
          jsonMode = chunk.resolved.capabilities.tools === false;
          ctx.modelUsed = `${chunk.resolved.displayName} (${chunk.resolved.providerName})`;
        } else if (chunk.type === 'text') {
          text += chunk.delta;
          if (!jsonMode) yield { type: 'text', delta: chunk.delta };
        } else if (chunk.type === 'tool_call') {
          calls.push(chunk.call);
        } else if (chunk.type === 'done') {
          res = chunk.response;
        }
      }
      if (!res) throw new Error('The model stopped without answering.');
      usage.prompt += res.usage.promptTokens ?? 0;
      usage.completion += res.usage.completionTokens ?? 0;
      if (res.toolCalls.length) calls = res.toolCalls;
      if (jsonMode) {
        const parsed = parseJsonProtocol(res.content, step);
        if (parsed && 'toolCalls' in parsed && use.length) calls = parsed.toolCalls;
        else {
          text = finalText(
            parsed && 'final' in parsed ? parsed.final : extractJson(res.content),
            res.content,
          );
          yield { type: 'text', delta: text };
        }
      }
      await record({
        type: 'LLM_CALL',
        label: calls.length
          ? `${res.resolved.displayName} decided to use ${calls.length === 1 ? (calls[0]?.name ?? 'a tool') : `${calls.length} tools`}`
          : `${res.resolved.displayName} answered`,
        content: res.content || null,
        reasoning: res.reasoning,
        llmCallId: res.llmCallId,
        output: {
          model: res.resolved.modelId,
          provider: res.resolved.providerKey,
          protocol: jsonMode ? 'json' : 'native',
          toolCalls: calls.map((c) => c.name),
          tokens: { prompt: res.usage.promptTokens ?? null, completion: res.usage.completionTokens ?? null },
        },
        durationMs: Math.round(performance.now() - started),
      });

      if (!calls.length) {
        answer = text.trim();
        break;
      }
      if (text.trim() && !jsonMode) yield { type: 'reset' };
      turns.push({
        kind: 'assistant',
        content: res.content,
        toolCalls: calls,
        providerData: res.providerData,
      });
      for (const call of calls) {
        toolCalls++;
        const tool = TOOLS.get(call.name);
        const parsedArgs = tool?.input.safeParse(call.arguments);
        const label = tool && parsedArgs?.success ? tool.label(parsedArgs.data) : `Using ${call.name}`;
        yield { type: 'tool', name: call.name, label, status: 'running' };
        const r = await executeTool(ctx, module.tools, call.name, call.arguments);
        await record({
          type: !r.ok && r.validation ? 'VALIDATION_ERROR' : 'TOOL_CALL',
          label: r.ok ? r.label.replace(/…$/, '') : `${r.label}: ${r.error ?? 'failed'}`.slice(0, 280),
          toolName: call.name,
          input: r.args ?? null,
          output: r.ok ? r.value : null,
          error: r.error,
          durationMs: r.durationMs,
        });
        parts.push({ kind: 'tool', name: call.name, label: r.label.replace(/…$/, ''), ok: r.ok });
        yield {
          type: 'tool',
          name: call.name,
          label: r.label.replace(/…$/, ''),
          status: r.ok ? 'done' : 'error',
        };
        const chart = r.ok ? chartFor(call.name, r.value) : null;
        if (chart) {
          const part: ChatPart = { kind: 'chart', chart };
          parts.push(part);
          yield { type: 'part', part };
        }
        while (pending.length) yield pending.shift() as ChatStreamEvent;
        turns.push({ kind: 'tool', callId: call.id, name: call.name, text: r.text });
      }
    }
    if (!answer) answer = 'I ran out of steps before finishing. Try a narrower question.';
    await record({ type: 'FINAL', label: 'Answered', content: answer });
    const message = await services.chat.addMessage(actor, conversationId, {
      role: 'assistant',
      content: answer,
      parts,
      citations: ctx.citations.filter((c) => c.tool !== 'analysis'),
      runId,
      modelUsed: model ? model.displayName : null,
    });
    await services.agents.finishRun(runId, 'assistant', {
      status: 'SUCCEEDED',
      mode: 'AI',
      providerKey: model?.providerKey ?? null,
      modelId: model?.modelId ?? null,
      summary: answer.replace(/\s+/g, ' ').slice(0, 300),
      output: {
        summary: answer.slice(0, 2000),
        findings: [],
        observed: [],
        fallbackReason: null,
        extra: { conversationId, cards: parts.filter((p) => p.kind === 'card').length },
      },
      promptTokens: usage.prompt || null,
      completionTokens: usage.completion || null,
      stepCount: seq,
      toolCallCount: toolCalls,
    });
    yield { type: 'done', message, conversation: await services.chat.summary(actor, conversationId) };
  } catch (e) {
    const cancelled = opts.signal.aborted;
    const reason = cancelled ? 'Stopped.' : e instanceof Error ? e.message : 'Something went wrong.';
    if (!cancelled) log.error({ err: e, runId }, 'assistant turn failed');
    await record({ type: 'ERROR', label: reason.slice(0, 200), error: reason }).catch(() => undefined);
    await services.agents.finishRun(runId, 'assistant', {
      status: cancelled ? 'CANCELLED' : 'FAILED',
      summary: reason,
      error: reason,
      stepCount: seq,
      toolCallCount: toolCalls,
    });
    const message = await services.chat.addMessage(actor, conversationId, {
      role: 'assistant',
      content: cancelled ? answer || 'Stopped.' : `I couldn’t answer that: ${reason}`,
      parts,
      runId,
      modelUsed: model?.displayName ?? null,
    });
    if (!cancelled) yield { type: 'error', message: reason };
    yield { type: 'done', message, conversation: await services.chat.summary(actor, conversationId) };
  }
}
