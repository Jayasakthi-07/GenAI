import type { AgentTool } from '@stockroom/shared';
import { z } from 'zod';
import type { ToolSpec } from '../../ai/gateway/types';
import { AppError } from '../../domain/errors';
import type { ToolContext, ToolDef } from '../types';
import { insightTools } from './insight';
import { readTools } from './read';
import { writeTools } from './write';

const ALL: ToolDef[] = [...readTools, ...insightTools, ...writeTools];
export const TOOLS = new Map(ALL.map((t) => [t.name, t]));

/** Tool results are capped so one large answer can't crowd out the conversation. */
const MAX_RESULT_CHARS = 8000;

export function toolSpecs(names: string[]): ToolSpec[] {
  return names.flatMap((name) => {
    const t = TOOLS.get(name);
    if (!t) return [];
    const { $schema: _, ...parameters } = z.toJSONSchema(t.input, { io: 'input', unrepresentable: 'any' });
    return [{ name: t.name, description: t.description, parameters }];
  });
}

export function describeTools(names: string[]): AgentTool[] {
  return names.flatMap((name) => {
    const t = TOOLS.get(name);
    return t ? [{ name: t.name, kind: t.kind, description: t.description }] : [];
  });
}

export function isWriteTool(name: string): boolean {
  return TOOLS.get(name)?.kind === 'write';
}

export interface ToolResult {
  ok: boolean;
  label: string;
  args: unknown;
  /** What the model sees (JSON text, capped). */
  text: string;
  value: unknown;
  error: string | null;
  validation: boolean;
  durationMs: number;
}

/** Validates the arguments, runs the tool, and turns any failure into a message the model can act on. */
export async function executeTool(
  ctx: ToolContext,
  allowed: string[],
  name: string,
  raw: unknown,
): Promise<ToolResult> {
  const started = performance.now();
  const done = (r: Omit<ToolResult, 'durationMs' | 'text'> & { text?: string }): ToolResult => {
    const text = r.text ?? JSON.stringify(r.ok ? r.value : { error: r.error });
    return {
      ...r,
      text:
        text.length > MAX_RESULT_CHARS
          ? `${text.slice(0, MAX_RESULT_CHARS)}… (truncated; ask for fewer rows)`
          : text,
      durationMs: Math.round(performance.now() - started),
    };
  };
  const tool = TOOLS.get(name);
  if (!tool || !allowed.includes(name))
    return done({
      ok: false,
      label: `Unknown tool ${name}`,
      args: raw,
      value: null,
      error: `There is no tool called “${name}”. Available: ${allowed.join(', ')}.`,
      validation: true,
    });
  const parsed = tool.input.safeParse(raw ?? {});
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.') || 'arguments'}: ${i.message}`);
    return done({
      ok: false,
      label: `Invalid arguments for ${name}`,
      args: raw,
      value: null,
      error: `Invalid arguments — ${issues.join('; ')}. Fix them and call ${name} again.`,
      validation: true,
    });
  }
  const label = tool.label(parsed.data);
  try {
    const value = await tool.run(ctx, parsed.data);
    // Only reads are "data used"; other proposals are actions, not evidence.
    if (tool.kind === 'read')
      ctx.citations.push({ tool: name, label: label.replace(/…$/, ''), detail: summarizeArgs(parsed.data) });
    return done({ ok: true, label, args: parsed.data, value, error: null, validation: false });
  } catch (e) {
    const message = e instanceof AppError || e instanceof Error ? e.message : 'The tool failed unexpectedly.';
    return done({
      ok: false,
      label,
      args: parsed.data,
      value: null,
      error: message,
      validation: e instanceof AppError && e.code === 'VALIDATION_ERROR',
    });
  }
}

function summarizeArgs(args: unknown): string | null {
  if (!args || typeof args !== 'object') return null;
  const parts = Object.entries(args as Record<string, unknown>)
    .filter(
      ([k, v]) => k !== 'rationale' && k !== 'limit' && (typeof v === 'string' || typeof v === 'number'),
    )
    .filter(([, v]) => !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(String(v)))
    .map(([k, v]) => `${k} ${String(v)}`);
  return parts.length ? parts.join(', ').slice(0, 200) : null;
}
