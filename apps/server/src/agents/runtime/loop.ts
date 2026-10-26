import { LlmError } from '../../ai/gateway/errors';
import type { LlmGateway, ResolvedModel } from '../../ai/gateway/gateway';
import type { ToolCall } from '../../ai/gateway/types';
import type { StepInput } from '../../services/agent.service';
import { executeTool, toolSpecs } from '../tools';
import type { AnyAgentModule, BaseOutput, ToolContext } from '../types';
import { extractJson, parseJsonProtocol, renderJson, renderNative, type Turn } from './protocol';

export interface LoopInput {
  gateway: LlmGateway;
  module: AnyAgentModule;
  ctx: ToolContext;
  system: string;
  briefing: string;
  record: (step: StepInput) => Promise<void>;
}

export interface LoopResult {
  output: BaseOutput | null;
  /** Why there is no output (the run then falls back to rules). */
  failure: string | null;
  /** No model was reachable at all. */
  noModel: boolean;
  model: ResolvedModel | null;
  usage: { prompt: number; completion: number };
  llmCalls: number;
  toolCalls: number;
}

const issuesOf = (error: { issues: Array<{ path: PropertyKey[]; message: string }> }) =>
  error.issues
    .slice(0, 6)
    .map((i) => `${i.path.map(String).join('.') || 'answer'}: ${i.message}`)
    .join('; ');

/**
 * The agent loop: ask the model, run the tools it calls (validated), feed back results, repeat
 * until it gives a final answer that matches the agent's schema, or a limit is hit. Models without
 * native tool calling get the same tools through a JSON protocol.
 */
export async function runLoop({
  gateway,
  module,
  ctx,
  system,
  briefing,
  record,
}: LoopInput): Promise<LoopResult> {
  const limits = ctx.settings.limits;
  const allSpecs = toolSpecs(module.tools);
  const turns: Turn[] = [{ kind: 'user', content: briefing }];
  const result: LoopResult = {
    output: null,
    failure: null,
    noModel: false,
    model: null,
    usage: { prompt: 0, completion: 0 },
    llmCalls: 0,
    toolCalls: 0,
  };
  let forceJson = false;
  let repaired = false;
  let warnedLast = false;
  const example = JSON.stringify(module.outputExample, null, 2);

  for (let step = 1; step <= limits.maxSteps; step++) {
    const last = step === limits.maxSteps;
    const canUseTools = !last && result.toolCalls < limits.maxToolCalls && allSpecs.length > 0;
    if (!canUseTools && !warnedLast && result.llmCalls > 0) {
      warnedLast = true;
      turns.push({
        kind: 'user',
        content: `No more tool calls are possible. Reply now with only the final JSON answer:\n${example}`,
      });
    }
    const specs = canUseTools ? allSpecs : [];
    const started = performance.now();
    let res;
    try {
      res = await gateway.chat(
        {
          purpose: 'AGENT',
          agentKey: ctx.agentKey,
          runId: ctx.runId,
          override: ctx.settings.modelOverride,
          signal: ctx.signal,
        },
        (model) =>
          forceJson || model.capabilities.tools === false
            ? { messages: renderJson(system, specs, turns), json: true, temperature: 0.2 }
            : {
                messages: renderNative(system, turns),
                tools: specs.length ? specs : undefined,
                temperature: 0.2,
              },
      );
    } catch (e) {
      if (e instanceof LlmError && e.code === 'cancelled') throw e;
      if (ctx.signal.aborted) throw ctx.signal.reason ?? e;
      if (e instanceof LlmError && e.options.lastCode === 'no_tools' && !forceJson) {
        // The model refused native tools: retry the same step through the JSON protocol.
        forceJson = true;
        step--;
        continue;
      }
      const message = e instanceof Error ? e.message : 'The model call failed';
      await record({ type: 'ERROR', label: 'No model could answer', error: message });
      result.noModel = result.llmCalls === 0;
      result.failure = message;
      return result;
    }

    result.llmCalls++;
    result.model = res.resolved;
    ctx.modelUsed = `${res.resolved.displayName} (${res.resolved.providerName})`;
    result.usage.prompt += res.usage.promptTokens ?? 0;
    result.usage.completion += res.usage.completionTokens ?? 0;
    const jsonMode = forceJson || res.resolved.capabilities.tools === false;

    let calls: ToolCall[] = res.toolCalls;
    let candidate: unknown;
    if (jsonMode) {
      const parsed = parseJsonProtocol(res.content, step);
      if (parsed && 'toolCalls' in parsed && specs.length) calls = parsed.toolCalls;
      else if (parsed && 'final' in parsed) candidate = parsed.final;
    } else if (!calls.length) {
      candidate = extractJson(res.content);
      if (candidate && typeof candidate === 'object' && 'final' in candidate) candidate = candidate.final;
    }

    await record({
      type: 'LLM_CALL',
      label: calls.length
        ? `${res.resolved.displayName} decided to use ${calls.length === 1 ? (calls[0]?.name ?? 'a tool') : `${calls.length} tools`}`
        : `${res.resolved.displayName} wrote its answer`,
      content: res.content || null,
      reasoning: res.reasoning,
      llmCallId: res.llmCallId,
      output: {
        model: res.resolved.modelId,
        provider: res.resolved.providerKey,
        protocol: jsonMode ? 'json' : 'native',
        fallback: res.isFallback,
        toolCalls: calls.map((c) => c.name),
        tokens: { prompt: res.usage.promptTokens ?? null, completion: res.usage.completionTokens ?? null },
      },
      durationMs: Math.round(performance.now() - started),
    });

    if (calls.length) {
      turns.push({
        kind: 'assistant',
        content: res.content,
        toolCalls: calls,
        providerData: res.providerData,
      });
      for (const call of calls) {
        if (result.toolCalls >= limits.maxToolCalls) {
          turns.push({
            kind: 'tool',
            callId: call.id,
            name: call.name,
            text: JSON.stringify({ error: 'Tool-call limit reached. Give your final answer now.' }),
          });
          continue;
        }
        result.toolCalls++;
        const args =
          call.rawArguments !== undefined && !Object.keys(call.arguments).length
            ? safeParse(call.rawArguments)
            : call.arguments;
        const r = await executeTool(ctx, module.tools, call.name, args);
        await record({
          type: !r.ok && r.validation ? 'VALIDATION_ERROR' : 'TOOL_CALL',
          label: r.ok ? r.label.replace(/…$/, '') : `${r.label}: ${r.error ?? 'failed'}`.slice(0, 280),
          toolName: call.name,
          input: r.args ?? null,
          output: r.ok ? r.value : null,
          error: r.error,
          durationMs: r.durationMs,
        });
        turns.push({ kind: 'tool', callId: call.id, name: call.name, text: r.text });
      }
      continue;
    }

    turns.push({ kind: 'assistant', content: res.content, toolCalls: [] });
    const checked = candidate === undefined ? null : module.output.safeParse(candidate);
    if (checked?.success) {
      await record({ type: 'FINAL', label: 'Final answer', output: checked.data });
      result.output = checked.data as BaseOutput;
      return result;
    }
    const problem = checked ? issuesOf(checked.error) : 'the reply wasn’t a JSON object';
    await record({
      type: 'VALIDATION_ERROR',
      label: 'The answer didn’t match the expected format',
      error: problem,
      content: res.content.slice(0, 4000) || null,
    });
    if (repaired) {
      result.failure = `The model’s answer didn’t match the expected format (${problem})`;
      return result;
    }
    repaired = true;
    turns.push({
      kind: 'user',
      content: `That answer didn’t match the required format (${problem}). Reply with only a JSON object shaped like:\n${example}`,
    });
  }
  result.failure = `Reached the limit of ${limits.maxSteps} model calls without a final answer`;
  return result;
}

function safeParse(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return {};
  }
}
