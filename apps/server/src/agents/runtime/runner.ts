import { createHash } from 'node:crypto';
import {
  type ActionType,
  type AgentKey,
  modelRefSchema,
  type RunFinding,
  type RunOutput,
} from '@stockroom/shared';
import type { FastifyBaseLogger } from 'fastify';
import type { LlmGateway } from '../../ai/gateway/gateway';
import type { Actor } from '../../domain/actor';
import type { Services } from '../../services';
import type { StepInput } from '../../services/agent.service';
import { localDay } from '../../services/support';
import type { Analysis, BaseOutput, Handoff, RunContext, ToolContext } from '../types';
import { buildBriefing, buildSystemPrompt } from './briefing';
import { runLoop } from './loop';

export interface RunnerDeps {
  services: Services;
  gateway: LlmGateway;
  log: FastifyBaseLogger;
  handoff: (h: Handoff, from: { runId: string; agentKey: AgentKey }) => Promise<string | null>;
}

const hash = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 32);
const secs = (ms: number) => `${Math.round(ms / 1000)} s`;

/** Analysis facts are capped in the step record; the model sees them in full in the briefing. */
function compact(value: unknown, max = 12_000): unknown {
  const text = JSON.stringify(value);
  return text.length <= max ? value : { truncated: true, preview: text.slice(0, max) };
}

/**
 * One agent run, end to end: analyze in code → skip if nothing changed → ask the model (or fall
 * back to rules) → persist outputs → hand off. Never throws: every outcome is recorded on the run.
 */
export async function executeRun(deps: RunnerDeps, runId: string, cancel: AbortSignal): Promise<void> {
  const { services, gateway, log } = deps;
  const info = await services.agents.runInfo(runId);
  if (!info) return;
  const key = info.agent.key as AgentKey;
  const module = services.agents.module(key);
  if (!(await services.agents.startRun(runId, key))) return;

  let seq = 0;
  let toolCalls = 0;
  const record = async (step: StepInput) => {
    seq++;
    await services.agents.addStep(runId, key, seq, step);
  };

  const stored = await services.agents.settings(key);
  // "Run now" can pick a model for this run only.
  const runModel = modelRefSchema.safeParse((info.triggerDetail as { model?: unknown } | null)?.model);
  const settings = runModel.success ? { ...stored, modelOverride: runModel.data } : stored;
  const timeout = AbortSignal.timeout(settings.limits.timeoutMs);
  const signal = AbortSignal.any([cancel, timeout]);
  try {
    const org = await services.planning.org();
    const detail = (info.triggerDetail as Record<string, unknown> | null) ?? null;
    const focus = Array.isArray(detail?.productIds) ? (detail.productIds as string[]) : [];
    const actor: Actor = { type: 'agent', agentKey: key, runId };
    const ctx: RunContext = {
      runId,
      agentKey: key,
      trigger: info.trigger,
      triggerDetail: detail,
      settings,
      services,
      actor,
      org,
      today: localDay(new Date(), org.timezone),
      focusProductIds: focus,
      signal,
    };

    // 1. Deterministic analysis.
    const t0 = performance.now();
    const analysis: Analysis = await module.analyze(ctx);
    await record({
      type: 'ANALYSIS',
      label: analysis.headline,
      output: compact(analysis.facts),
      durationMs: Math.round(performance.now() - t0),
    });
    const fingerprint = hash(analysis.fingerprint);

    // 2. Nothing changed since the last result: no model call.
    if (
      (info.trigger === 'SCHEDULE' || info.trigger === 'EVENT') &&
      fingerprint === (await services.agents.lastFingerprint(key))
    ) {
      await services.agents.finishRun(runId, key, {
        status: 'NO_CHANGE',
        summary: 'Nothing changed since the last run, so no model was needed.',
        fingerprint,
        stepCount: seq,
        toolCallCount: 0,
      });
      return;
    }

    // 3. Nothing for a model to judge.
    if (analysis.nothingToDo) {
      const applied = module.apply ? await module.apply(ctx, analysis, null, null) : {};
      const summary = [analysis.ruleBased.summary, applied.note].filter(Boolean).join(' ');
      await services.agents.finishRun(runId, key, {
        status: 'SUCCEEDED',
        summary,
        output: {
          summary,
          findings: analysis.ruleBased.findings,
          observed: [],
          fallbackReason: null,
          extra: applied.extra ?? null,
        },
        fingerprint,
        stepCount: seq,
        toolCallCount: 0,
      });
      return;
    }

    // 4. The model, if one is available.
    const toolCtx: ToolContext = {
      ...ctx,
      modelUsed: null,
      analysis,
      citations: [{ tool: 'analysis', label: analysis.headline, detail: null }],
      proposals: { created: 0, observed: [] },
    };
    let output: BaseOutput | null = null;
    let fallbackReason: string | null = null;
    let model: { providerKey: string; modelId: string } | null = null;
    let usage = { prompt: 0, completion: 0 };
    const candidates = await gateway.candidates({ agentKey: key, override: settings.modelOverride });
    if (!candidates.length) {
      fallbackReason = 'No AI model is available';
    } else {
      const decisions = await services.actions.recentDecisions(key);
      const briefing = buildBriefing(ctx, module, analysis, decisions);
      const system = buildSystemPrompt(ctx);
      await record({
        type: 'CONTEXT',
        label: `Briefed the model (${decisions.length} past decision${decisions.length === 1 ? '' : 's'} included)`,
        content: briefing,
        input: { systemPrompt: system },
      });
      const loop = await runLoop({ gateway, module, ctx: toolCtx, system, briefing, record });
      toolCalls = loop.toolCalls;
      usage = loop.usage;
      if (loop.model) model = { providerKey: loop.model.providerKey, modelId: loop.model.modelId };
      if (loop.output) output = loop.output;
      else fallbackReason = loop.failure ?? 'The model gave no usable answer';
    }
    const mode = output ? 'AI' : 'RULE_BASED';

    // 5. Rule-based proposals when the model didn't do the job.
    const observed: Array<{ type: ActionType; title: string; summary: string }> = [
      ...toolCtx.proposals.observed,
    ];
    if (!output && analysis.ruleBased.proposals.length) {
      let created = toolCtx.proposals.created;
      const outcomes: string[] = [];
      for (const p of analysis.ruleBased.proposals) {
        try {
          const r = await services.actions.propose(
            actor,
            {
              type: p.type,
              payload: p.payload,
              rationale: p.rationale,
              rationaleSource: 'RULE',
              modelUsed: null,
              dataUsed: toolCtx.citations,
            },
            {
              agentKey: key,
              runId,
              autonomy: settings.autonomy,
              limits: settings.limits,
              createdThisRun: created,
            },
          );
          if (r.outcome === 'pending' || r.outcome === 'executed' || r.outcome === 'failed') created++;
          if (r.outcome === 'observed') observed.push({ type: p.type, title: r.title, summary: r.summary });
          outcomes.push(`${r.title}: ${r.outcome.replace('_', ' ')}`);
        } catch (e) {
          outcomes.push(
            `Skipped a ${p.type.toLowerCase().replace(/_/g, ' ')}: ${e instanceof Error ? e.message : 'invalid'}`,
          );
        }
      }
      await record({
        type: 'TOOL_CALL',
        label: `Made ${outcomes.length} rule-based proposal${outcomes.length === 1 ? '' : 's'}`,
        toolName: 'rule_based_proposals',
        output: outcomes,
      });
    }

    // 6. Informational outputs.
    const modelLabel = output ? toolCtx.modelUsed : null;
    const applied = module.apply ? await module.apply(ctx, analysis, output, modelLabel) : {};
    const findings: RunFinding[] = output?.findings ?? analysis.ruleBased.findings;
    const made = toolCtx.proposals.created;
    const proposalNote =
      output && made ? `${made} proposal${made === 1 ? '' : 's'} created through tools.` : undefined;
    const summary = [output?.summary ?? analysis.ruleBased.summary, applied.note, proposalNote]
      .filter(Boolean)
      .join(' ');

    // 7. Hand-offs (deterministic rules in each module).
    for (const h of module.handoffs?.(ctx, analysis, output) ?? []) {
      const child = await deps.handoff(h, { runId, agentKey: key });
      await record({
        type: 'HANDOFF',
        label: child
          ? `Handed ${h.productIds.length} product(s) to ${services.agents.module(h.to).name}`
          : `Hand-off to ${h.to} skipped (already queued)`,
        output: { to: h.to, runId: child, productIds: h.productIds, reason: h.reason },
      });
    }

    const runOutput: RunOutput = {
      summary,
      findings,
      observed,
      fallbackReason,
      extra: applied.extra ?? null,
    };
    await services.agents.finishRun(runId, key, {
      status: 'SUCCEEDED',
      mode,
      providerKey: model?.providerKey ?? null,
      modelId: model?.modelId ?? null,
      summary,
      output: runOutput,
      fingerprint,
      promptTokens: usage.prompt || null,
      completionTokens: usage.completion || null,
      stepCount: seq,
      toolCallCount: toolCalls,
    });
  } catch (e) {
    const cancelled = cancel.aborted;
    const timedOut = !cancelled && timeout.aborted;
    const message = cancelled
      ? typeof cancel.reason === 'string'
        ? cancel.reason
        : 'Cancelled by a person'
      : timedOut
        ? `Timed out after ${secs(settings.limits.timeoutMs)}`
        : e instanceof Error
          ? e.message
          : 'Unexpected error';
    if (!cancelled && !timedOut) log.error({ err: e, runId, agent: key }, 'agent run failed');
    try {
      await record({ type: 'ERROR', label: message.slice(0, 200), error: message });
    } catch {
      // The step table is best effort here; the run status below is what matters.
    }
    await services.agents.finishRun(runId, key, {
      status: cancelled ? 'CANCELLED' : 'FAILED',
      summary: message,
      error: message,
      stepCount: seq,
      toolCallCount: toolCalls,
    });
  }
}
