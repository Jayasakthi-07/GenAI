import { AGENT_LABELS, type AgentKey, formatMoney } from '@stockroom/shared';
import type { Analysis, AnyAgentModule, RunContext } from '../types';

/** Rules every agent follows; appended to the (editable) prompt and not editable themselves. */
export const COMMON_RULES = [
  'Rules:',
  '- Numbers come only from the analysis below and from tool results. Never invent, estimate or recompute figures.',
  '- Use tools to check anything you are unsure about before proposing or concluding.',
  '- Refer to products, warehouses and suppliers by the ids or codes that tool results give you.',
  '- Be brief and specific. Cite the numbers you relied on ("3.1 days of cover vs a 7-day lead time").',
  '- Don’t add up or convert amounts yourself; quote totals only if the analysis or a tool gives them.',
  '- Replace every <placeholder> in the answer example with your own content; never copy the example text.',
  '- Respect people’s past decisions listed below; do not re-propose what was rejected.',
].join('\n');

const AUTONOMY_TEXT = {
  OBSERVE: 'OBSERVE — proposals are only recorded as findings; nothing is queued or executed.',
  RECOMMEND: 'RECOMMEND — every proposal waits for a person to approve, edit or reject it.',
  ACT: 'ACT — low-risk proposals within your limits execute immediately; others wait for approval.',
} as const;

function triggerText(ctx: RunContext): string {
  const d = ctx.triggerDetail ?? {};
  switch (ctx.trigger) {
    case 'SCHEDULE':
      return 'Scheduled run.';
    case 'EVENT':
      return `Triggered by ${Array.isArray(d.events) ? d.events.join(', ') : 'recent changes'}.`;
    case 'MANUAL':
      return `Started by a person${typeof d.note === 'string' && d.note ? ` with the note: “${d.note}”` : ''}.`;
    case 'HANDOFF': {
      const from =
        typeof d.fromAgent === 'string'
          ? (AGENT_LABELS[d.fromAgent as AgentKey] ?? d.fromAgent)
          : 'another agent';
      return `Hand-off from ${from}${typeof d.reason === 'string' ? `: ${d.reason}` : ''}. Focus on the ${ctx.focusProductIds.length} product(s) it named.`;
    }
    case 'CHAT':
      return 'Chat.';
  }
}

export function buildSystemPrompt(ctx: RunContext): string {
  return `${ctx.settings.systemPrompt.trim()}\n\n${COMMON_RULES}`;
}

export function buildBriefing(
  ctx: RunContext,
  module: AnyAgentModule,
  analysis: Analysis,
  decisions: Array<{
    title: string;
    outcome: string;
    reason: string | null;
    edits: string | null;
    at: string;
  }>,
): string {
  const o = ctx.org;
  const lines = [
    `Today is ${ctx.today} (${o.timezone}). Money is in Indian rupees (INR).`,
    `Why you are running: ${triggerText(ctx)}`,
    `Your autonomy: ${AUTONOMY_TEXT[ctx.settings.autonomy]}`,
    `Your limits this run: ${ctx.settings.limits.maxToolCalls} tool calls, ${ctx.settings.limits.maxActionsPerRun} proposals.`,
    `Policy: target service level ${Math.round(o.serviceLevel * 100)}%, order cost ${formatMoney(o.orderCostInr, { compactDecimals: true })}, holding rate ${Math.round(o.holdingRate * 100)}%/year, replenishment budget ${formatMoney(o.replenishmentBudgetInr, { compactDecimals: true })}, PO approval above ${formatMoney(o.poApprovalThresholdInr, { compactDecimals: true })}.`,
    '',
    '## Analysis (computed by code — use these numbers exactly)',
    '```json',
    JSON.stringify(analysis.facts, null, 1),
    '```',
    '',
    '## How people responded to your recent proposals',
    decisions.length
      ? decisions
          .map(
            (d) =>
              `- ${d.at} ${d.outcome}: “${d.title}”${d.reason ? ` — “${d.reason}”` : ''}${d.edits ? ` (edits: ${d.edits})` : ''}`,
          )
          .join('\n')
      : '- None yet.',
    '',
    '## Your answer',
    'After any tool calls, reply with ONLY a JSON object shaped like this example (no prose around it):',
    '```json',
    JSON.stringify(module.outputExample, null, 1),
    '```',
  ];
  return lines.join('\n');
}
