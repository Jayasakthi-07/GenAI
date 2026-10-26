import type {
  ActionType,
  AgentKey,
  AgentLimits,
  AgentTriggers,
  Autonomy,
  Citation,
  RunFinding,
  RunTrigger,
} from '@stockroom/shared';
import type { z } from 'zod';
import type { Actor } from '../domain/actor';
import type { Services } from '../services';
import type { OrgSettings } from '../services/support';

export interface AgentDefaults {
  systemPrompt: string;
  triggers: AgentTriggers;
  autonomy: Autonomy;
  limits: AgentLimits;
  config: Record<string, unknown>;
}

/** The editable definition as stored, merged over the code defaults. */
export interface AgentSettings extends AgentDefaults {
  isEnabled: boolean;
  modelOverride: { providerKey: string; modelId: string } | null;
}

export interface RunContext {
  runId: string;
  agentKey: AgentKey;
  trigger: RunTrigger;
  triggerDetail: Record<string, unknown> | null;
  settings: AgentSettings;
  services: Services;
  /** The agent itself (Manager-level permissions; writes become proposals). */
  actor: Actor;
  org: OrgSettings;
  today: string;
  /** Products named by a hand-off or the events that triggered the run. */
  focusProductIds: string[];
  signal: AbortSignal;
}

export interface ProposalDraft {
  type: ActionType;
  payload: unknown;
  rationale: string;
}

export interface Analysis<S = unknown> {
  /** Shown as the ANALYSIS step label ("12 positions need attention"). */
  headline: string;
  /** Compact facts for the model: the numbers it must use, already computed. */
  facts: unknown;
  /** Hash input for "nothing changed since the last run". */
  fingerprint: string;
  /** Nothing for a model to judge: finish without calling one. */
  nothingToDo?: boolean;
  /** Used when no model is available, or its answer can't be used. */
  ruleBased: {
    summary: string;
    findings: RunFinding[];
    proposals: ProposalDraft[];
  };
  /** Private state for apply() and handoffs(). */
  state: S;
}

/** Every agent's final answer has a summary and findings; agents add their own fields. */
export interface BaseOutput {
  summary: string;
  findings: RunFinding[];
}

export interface ApplyResult {
  /** Extra output stored on the run (and shown in its detail view). */
  extra?: Record<string, unknown>;
  /** One line appended to the summary ("Explained 5 alerts"). */
  note?: string;
}

export interface Handoff {
  to: AgentKey;
  productIds: string[];
  reason: string;
}

export interface AgentModule<S = unknown, O extends BaseOutput = BaseOutput> {
  key: AgentKey;
  name: string;
  description: string;
  /** For the hub cards: what code computes, what the model decides, what comes out. */
  analyzer: string;
  llmJob: string;
  outputs: string;
  defaults: AgentDefaults;
  /** Tool names this agent may call. */
  tools: string[];
  handoffsTo: AgentKey[];
  /** Runs only in chat (the Assistant): never scheduled or queued. */
  chatOnly?: boolean;
  /** The final answer's schema and an example for the prompt. */
  output: z.ZodType<O>;
  outputExample: O;
  analyze(ctx: RunContext): Promise<Analysis<S>>;
  /** Persists informational outputs (alert explanations, forecasts, reports). Runs in both modes. */
  apply?(
    ctx: RunContext,
    analysis: Analysis<S>,
    output: O | null,
    modelUsed: string | null,
  ): Promise<ApplyResult>;
  handoffs?(ctx: RunContext, analysis: Analysis<S>, output: O | null): Handoff[];
}

export type AnyAgentModule = AgentModule<any, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- heterogeneous registry of agents with their own state/output types

/* ── Tools ─────────────────────────────────────────────────────────────── */

export interface ToolContext extends RunContext {
  modelUsed: string | null;
  analysis: Analysis;
  /** Tool calls so far, cited by proposals as the data used. */
  citations: Citation[];
  proposals: {
    created: number;
    observed: Array<{ type: ActionType; title: string; summary: string }>;
  };
  /** In chat, write tools draft a confirmation card for the person instead of a proposal. */
  draft?: (type: ActionType, payload: unknown, rationale: string) => Promise<unknown>;
}

export type ToolKind = 'read' | 'write';

export interface ToolDef<S extends z.ZodType = z.ZodType> {
  name: string;
  description: string;
  kind: ToolKind;
  input: S;
  /** Live label for the run timeline ("Comparing 3 suppliers…"). */
  label: (args: z.infer<S>) => string;
  run: (ctx: ToolContext, args: z.infer<S>) => Promise<unknown>;
}

export const defineTool = <S extends z.ZodType>(tool: ToolDef<S>): ToolDef<S> => tool;
