import type { ChatMessage, ToolCall, ToolSpec } from '../../ai/gateway/types';

/** The conversation in a provider-neutral form; rendered per model (native tools or JSON protocol). */
export type Turn =
  | { kind: 'user'; content: string }
  | {
      kind: 'assistant';
      content: string;
      toolCalls: ToolCall[];
      providerData?: ChatMessage['providerData'];
    }
  | { kind: 'tool'; callId: string; name: string; text: string };

/** Finds the JSON object in a model's answer: bare, fenced, or surrounded by prose. */
export function extractJson(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  const attempts = [trimmed];
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
  if (fence?.[1]) attempts.push(fence[1].trim());
  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (first >= 0 && last > first) attempts.push(trimmed.slice(first, last + 1));
  for (const candidate of attempts) {
    try {
      return JSON.parse(candidate) as unknown;
    } catch {
      // Try the next shape.
    }
  }
  return undefined;
}

export function jsonProtocolInstructions(tools: ToolSpec[]): string {
  const list = tools
    .map((t) => `- ${t.name}: ${t.description}\n  arguments (JSON Schema): ${JSON.stringify(t.parameters)}`)
    .join('\n');
  return [
    'You answer with exactly one JSON object and nothing else.',
    tools.length
      ? 'To use tools, reply: {"tool_calls": [{"name": "<tool>", "arguments": {…}}]} — you will get the results, then continue.'
      : 'No tools are available now.',
    'When you are finished, reply: {"final": <your answer object>}.',
    tools.length ? `Tools:\n${list}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

/** Reads a JSON-protocol reply: tool calls, a final answer, or neither. */
export function parseJsonProtocol(
  text: string,
  turn: number,
): { toolCalls: ToolCall[] } | { final: unknown } | null {
  const value = extractJson(text);
  if (!value || typeof value !== 'object') return null;
  const obj = value as Record<string, unknown>;
  const raw =
    obj.tool_calls ?? obj.toolCalls ?? (obj.tool ? [{ name: obj.tool, arguments: obj.arguments }] : null);
  if (Array.isArray(raw) && raw.length) {
    return {
      toolCalls: (raw as unknown[])
        .filter(
          (c): c is Record<string, unknown> =>
            !!c && typeof c === 'object' && typeof (c as Record<string, unknown>).name === 'string',
        )
        .map((c, i) => ({
          id: `json_${turn}_${i}`,
          name: c.name as string,
          arguments: (c.arguments && typeof c.arguments === 'object' ? c.arguments : {}) as Record<
            string,
            unknown
          >,
        })),
    };
  }
  return { final: 'final' in obj ? obj.final : obj };
}

export function renderNative(system: string, turns: Turn[]): ChatMessage[] {
  const out: ChatMessage[] = [{ role: 'system', content: system }];
  for (const t of turns) {
    if (t.kind === 'user') out.push({ role: 'user', content: t.content });
    else if (t.kind === 'assistant')
      out.push({
        role: 'assistant',
        content: t.content,
        toolCalls: t.toolCalls.length ? t.toolCalls : undefined,
        providerData: t.providerData,
      });
    else out.push({ role: 'tool', content: t.text, toolCallId: t.callId, toolName: t.name });
  }
  return out;
}

export function renderJson(system: string, tools: ToolSpec[], turns: Turn[]): ChatMessage[] {
  const out: ChatMessage[] = [{ role: 'system', content: `${system}\n\n${jsonProtocolInstructions(tools)}` }];
  let results: string[] = [];
  const flush = () => {
    if (results.length) out.push({ role: 'user', content: results.join('\n\n') });
    results = [];
  };
  for (const t of turns) {
    if (t.kind === 'tool') {
      results.push(`Result of ${t.name}:\n${t.text}`);
      continue;
    }
    flush();
    if (t.kind === 'user') out.push({ role: 'user', content: t.content });
    else
      out.push({
        role: 'assistant',
        content: t.toolCalls.length
          ? JSON.stringify({ tool_calls: t.toolCalls.map((c) => ({ name: c.name, arguments: c.arguments })) })
          : t.content,
      });
  }
  flush();
  return out;
}
