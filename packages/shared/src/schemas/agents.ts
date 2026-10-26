import { z } from 'zod';
import {
  ACTION_STATUSES,
  ACTION_TYPES,
  type ActionType,
  AGENT_EVENTS,
  AGENT_KEYS,
  AUTONOMIES,
  RUN_MODES,
  RUN_STATUSES,
  RUN_TRIGGERS,
  STEP_TYPES,
} from '../constants/agents';
import { productRefSchema, refSchema, warehouseRefSchema } from './catalog';
import { moneySchema, paginationQuerySchema, unitCostSchema } from './common';
import { modelRefSchema } from './ai';

const multi = <T extends z.ZodType>(item: T) =>
  z.preprocess(
    (v) => (typeof v === 'string' ? v.split(',').filter(Boolean) : v),
    z.array(item).max(20).optional(),
  );

/* ── Definitions ───────────────────────────────────────────────────────── */
/** `@briefing` runs at the organization's daily briefing time (Settings → Organization). */
export const BRIEFING_CRON = '@briefing';
/** Five cron fields (minute hour day month weekday) or `@briefing`; validated again by the scheduler. */
const cronSchema = z
  .string()
  .trim()
  .regex(/^(@briefing|(\S+\s+){4}\S+)$/, 'Use five cron fields, e.g. 0 7 * * *');

export const agentLimitsSchema = z.object({
  maxSteps: z.coerce.number().int().min(1).max(30),
  maxToolCalls: z.coerce.number().int().min(1).max(60),
  timeoutMs: z.coerce.number().int().min(10_000).max(1_800_000),
  maxActionsPerRun: z.coerce.number().int().min(0).max(50),
  /** Act mode: purchase orders above this value always wait for approval. */
  maxPoValueInr: z.coerce.number().int().min(0).max(100_000_000),
});
export type AgentLimits = z.infer<typeof agentLimitsSchema>;

export const agentTriggersSchema = z.object({
  cron: z.array(cronSchema).max(5),
  events: z.array(z.enum(AGENT_EVENTS)).max(10),
  /** Event triggers are collected for this long before one run starts. */
  debounceSeconds: z.coerce.number().int().min(0).max(3600),
});
export type AgentTriggers = z.infer<typeof agentTriggersSchema>;

export const agentToolSchema = z.object({
  name: z.string(),
  kind: z.enum(['read', 'write', 'output']),
  description: z.string(),
});
export type AgentTool = z.infer<typeof agentToolSchema>;

export const runSummarySchema = z.object({
  id: z.uuid(),
  status: z.enum(RUN_STATUSES),
  mode: z.enum(RUN_MODES).nullable(),
  trigger: z.enum(RUN_TRIGGERS),
  summary: z.string().nullable(),
  modelId: z.string().nullable(),
  createdAt: z.string(),
  finishedAt: z.string().nullable(),
  durationMs: z.number().int().nullable(),
});
export type RunSummary = z.infer<typeof runSummarySchema>;

export const agentSchema = z.object({
  key: z.enum(AGENT_KEYS),
  name: z.string(),
  description: z.string(),
  /** What the code computes, what the model decides, what comes out. */
  analyzer: z.string(),
  llmJob: z.string(),
  outputs: z.string(),
  isEnabled: z.boolean(),
  autonomy: z.enum(AUTONOMIES),
  systemPrompt: z.string(),
  defaultPrompt: z.string(),
  tools: z.array(agentToolSchema),
  triggers: agentTriggersSchema,
  defaultTriggers: agentTriggersSchema,
  limits: agentLimitsSchema,
  modelOverride: modelRefSchema.nullable(),
  handoffsTo: z.array(z.enum(AGENT_KEYS)),
  writes: z.boolean(),
  /** Runs only in chat (the Assistant): no schedule and no Run now. */
  chatOnly: z.boolean(),
  status: z.object({ running: z.boolean(), queued: z.boolean(), currentRunId: z.uuid().nullable() }),
  lastRun: runSummarySchema.nullable(),
  nextRunAt: z.string().nullable(),
  stats: z.object({
    runs7d: z.number().int(),
    succeeded7d: z.number().int(),
    failed7d: z.number().int(),
    aiRuns7d: z.number().int(),
    pendingActions: z.number().int(),
    avgDurationMs: z.number().int().nullable(),
  }),
});
export type AgentDto = z.infer<typeof agentSchema>;

export const agentUpdateSchema = z.object({
  isEnabled: z.boolean().optional(),
  autonomy: z.enum(AUTONOMIES).optional(),
  /** null restores the default prompt. */
  systemPrompt: z.string().trim().min(20, 'Write at least a sentence').max(8000).nullable().optional(),
  triggers: agentTriggersSchema.optional(),
  limits: agentLimitsSchema.partial().optional(),
  modelOverride: modelRefSchema.nullable().optional(),
});
export type AgentUpdate = z.input<typeof agentUpdateSchema>;

export const runAgentSchema = z.object({
  /** Run with this model instead of the routing default. */
  model: modelRefSchema.optional(),
  note: z.string().trim().max(300).optional(),
});

/* ── Runs ──────────────────────────────────────────────────────────────── */
export const agentRunSchema = z.object({
  id: z.uuid(),
  agentKey: z.enum(AGENT_KEYS),
  agentName: z.string(),
  trigger: z.enum(RUN_TRIGGERS),
  triggerDetail: z.record(z.string(), z.unknown()).nullable(),
  status: z.enum(RUN_STATUSES),
  mode: z.enum(RUN_MODES).nullable(),
  providerKey: z.string().nullable(),
  modelId: z.string().nullable(),
  parentRunId: z.uuid().nullable(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
  durationMs: z.number().int().nullable(),
  promptTokens: z.number().int().nullable(),
  completionTokens: z.number().int().nullable(),
  stepCount: z.number().int(),
  toolCallCount: z.number().int(),
  actionCount: z.number().int(),
  summary: z.string().nullable(),
  error: z.string().nullable(),
  createdAt: z.string(),
});
export type AgentRunDto = z.infer<typeof agentRunSchema>;

export const agentStepSchema = z.object({
  id: z.uuid(),
  seq: z.number().int(),
  type: z.enum(STEP_TYPES),
  label: z.string(),
  toolName: z.string().nullable(),
  input: z.unknown().nullable(),
  output: z.unknown().nullable(),
  content: z.string().nullable(),
  reasoning: z.string().nullable(),
  error: z.string().nullable(),
  startedAt: z.string(),
  durationMs: z.number().int().nullable(),
});
export type AgentStepDto = z.infer<typeof agentStepSchema>;

export const runFindingSchema = z.object({
  title: z.string(),
  detail: z.string(),
  severity: z.enum(['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
});
export type RunFinding = z.infer<typeof runFindingSchema>;

export const runOutputSchema = z.object({
  summary: z.string(),
  findings: z.array(runFindingSchema),
  /** Proposals an Observe-mode agent would have made. */
  observed: z.array(z.object({ type: z.enum(ACTION_TYPES), title: z.string(), summary: z.string() })),
  /** Why the run fell back to rules, if it did. */
  fallbackReason: z.string().nullable(),
  extra: z.record(z.string(), z.unknown()).nullable(),
});
export type RunOutput = z.infer<typeof runOutputSchema>;

export const agentRunDetailSchema = agentRunSchema.extend({
  steps: z.array(agentStepSchema),
  output: runOutputSchema.nullable(),
  actions: z.array(
    z.object({
      id: z.uuid(),
      type: z.enum(ACTION_TYPES),
      status: z.enum(ACTION_STATUSES),
      title: z.string(),
    }),
  ),
  parent: z.object({ id: z.uuid(), agentKey: z.enum(AGENT_KEYS), agentName: z.string() }).nullable(),
  children: z.array(agentRunSchema),
});
export type AgentRunDetail = z.infer<typeof agentRunDetailSchema>;

export const runsQuerySchema = paginationQuerySchema.extend({
  agentKey: z.enum(AGENT_KEYS).optional(),
  status: multi(z.enum(RUN_STATUSES)),
  trigger: multi(z.enum(RUN_TRIGGERS)),
});
export type RunsQuery = z.infer<typeof runsQuerySchema>;

/* ── Actions (proposals) ───────────────────────────────────────────────── */
const id = z.uuid();
const qty = z.coerce.number().int().min(1).max(10_000_000);
const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional()
  .nullable();
const note = z.string().trim().max(500).optional().nullable();
const unique = (lines: Array<{ productId: string }>) =>
  new Set(lines.map((l) => l.productId)).size === lines.length;

export const poActionPayloadSchema = z.object({
  supplierId: id,
  warehouseId: id,
  expectedDate: day,
  notes: note,
  lines: z
    .array(
      z.object({
        productId: id,
        quantity: qty,
        unitCost: unitCostSchema,
        rationale: z.string().trim().max(400).optional().nullable(),
      }),
    )
    .min(1, 'Add at least one line')
    .max(100)
    .refine(unique, 'Each product can appear once'),
});
export const transferActionPayloadSchema = z
  .object({
    fromWarehouseId: id,
    toWarehouseId: id,
    reason: note,
    lines: z
      .array(z.object({ productId: id, quantity: qty }))
      .min(1)
      .max(100)
      .refine(unique, 'Each product can appear once'),
  })
  .refine((t) => t.fromWarehouseId !== t.toWarehouseId, {
    message: 'Choose two different warehouses',
    path: ['toWarehouseId'],
  });
export const reorderParamsPayloadSchema = z
  .object({
    productId: id,
    warehouseId: id,
    reorderPoint: z.coerce.number().int().min(0).max(10_000_000),
    safetyStock: z.coerce.number().int().min(0).max(10_000_000),
    maxStock: z.coerce.number().int().min(0).max(10_000_000).nullable(),
  })
  .refine((p) => p.safetyStock <= p.reorderPoint, {
    message: 'Safety stock can’t exceed the reorder point',
    path: ['safetyStock'],
  })
  .refine((p) => p.maxStock === null || p.maxStock >= p.reorderPoint, {
    message: 'Max stock must be at least the reorder point',
    path: ['maxStock'],
  });
export const cycleCountPayloadSchema = z.object({
  warehouseId: id,
  productIds: z.array(id).min(1).max(100),
  reason: note,
  dueDate: day,
});
export const markdownPayloadSchema = z.object({
  productId: id,
  newPrice: moneySchema,
  reason: note,
});
export const preferredSupplierPayloadSchema = z.object({ productId: id, supplierId: id });

export const ACTION_PAYLOAD_SCHEMAS = {
  CREATE_PURCHASE_ORDER: poActionPayloadSchema,
  CREATE_TRANSFER: transferActionPayloadSchema,
  UPDATE_REORDER_PARAMS: reorderParamsPayloadSchema,
  CREATE_CYCLE_COUNT: cycleCountPayloadSchema,
  MARKDOWN_PRICE: markdownPayloadSchema,
  CHANGE_PREFERRED_SUPPLIER: preferredSupplierPayloadSchema,
} satisfies Record<ActionType, z.ZodType>;
export type ActionPayloads = { [K in ActionType]: z.infer<(typeof ACTION_PAYLOAD_SCHEMAS)[K]> };

export const actionImpactSchema = z.object({
  /** Money committed (a PO's total, landed). */
  cost: moneySchema.nullable().optional(),
  units: z.number().int().nullable().optional(),
  /** Value freed or recovered (transfers, markdowns). */
  valueRecovered: moneySchema.nullable().optional(),
  daysOfCoverBefore: z.number().nullable().optional(),
  daysOfCoverAfter: z.number().nullable().optional(),
  /** Products that would otherwise run out within the lead time. */
  stockoutsPrevented: z.number().int().nullable().optional(),
  notes: z.array(z.string()).optional(),
});
export type ActionImpact = z.infer<typeof actionImpactSchema>;

export const citationSchema = z.object({
  tool: z.string(),
  label: z.string(),
  detail: z.string().nullable().optional(),
});
export type Citation = z.infer<typeof citationSchema>;

/** Names and current numbers resolved for display; never part of the payload. */
export const actionDisplaySchema = z.object({
  supplier: refSchema.nullable(),
  warehouse: warehouseRefSchema.nullable(),
  fromWarehouse: warehouseRefSchema.nullable(),
  toWarehouse: warehouseRefSchema.nullable(),
  product: productRefSchema.nullable(),
  lines: z.array(
    z.object({
      product: productRefSchema,
      quantity: z.number().int(),
      unitCost: z.string().nullable(),
      lineTotal: z.string().nullable(),
      rationale: z.string().nullable(),
      available: z.number().int().nullable(),
    }),
  ),
  /** Before → after for setting changes. */
  changes: z.array(z.object({ label: z.string(), before: z.string(), after: z.string() })),
});
export type ActionDisplay = z.infer<typeof actionDisplaySchema>;

export const actionSchema = z.object({
  id: z.uuid(),
  type: z.enum(ACTION_TYPES),
  status: z.enum(ACTION_STATUSES),
  title: z.string(),
  summary: z.string(),
  rationale: z.string(),
  rationaleSource: z.enum(['AI', 'RULE']),
  modelUsed: z.string().nullable(),
  payload: z.record(z.string(), z.unknown()),
  editedPayload: z.record(z.string(), z.unknown()).nullable(),
  expectedImpact: actionImpactSchema,
  dataUsed: z.array(citationSchema),
  riskLevel: z.enum(['LOW', 'MEDIUM', 'HIGH']),
  autoExecuted: z.boolean(),
  agent: z.object({ key: z.enum(AGENT_KEYS), name: z.string() }),
  runId: z.uuid().nullable(),
  decidedBy: z.string().nullable(),
  decidedAt: z.string().nullable(),
  decisionReason: z.string().nullable(),
  executedAt: z.string().nullable(),
  /** e.g. { entity: 'PurchaseOrder', id, number } */
  result: z.record(z.string(), z.unknown()).nullable(),
  error: z.string().nullable(),
  expiresAt: z.string().nullable(),
  createdAt: z.string(),
  display: actionDisplaySchema,
});
export type ActionDto = z.infer<typeof actionSchema>;

export const actionsQuerySchema = paginationQuerySchema.extend({
  status: multi(z.enum(ACTION_STATUSES)),
  type: multi(z.enum(ACTION_TYPES)),
  agentKey: z.enum(AGENT_KEYS).optional(),
  runId: z.uuid().optional(),
});
export type ActionsQuery = z.infer<typeof actionsQuerySchema>;

export const actionApproveSchema = z.object({
  /** Edit-and-approve: the changed payload, validated per action type. */
  payload: z.record(z.string(), z.unknown()).optional(),
  reason: z.string().trim().max(500).optional(),
});
export type ActionApprove = z.infer<typeof actionApproveSchema>;
export const actionRejectSchema = z.object({
  reason: z.string().trim().min(3, 'Tell the agent why, in a few words').max(500),
});
export type ActionReject = z.infer<typeof actionRejectSchema>;

export const actionCountsSchema = z.object({
  pending: z.number().int(),
  byAgent: z.record(z.string(), z.number().int()),
});
export type ActionCounts = z.infer<typeof actionCountsSchema>;

/* ── Network ───────────────────────────────────────────────────────────── */
export const agentGraphSchema = z.object({
  nodes: z.array(
    z.object({
      key: z.enum(AGENT_KEYS),
      name: z.string(),
      isEnabled: z.boolean(),
      running: z.boolean(),
      lastStatus: z.enum(RUN_STATUSES).nullable(),
      triggers: z.array(z.string()),
    }),
  ),
  edges: z.array(
    z.object({
      from: z.enum(AGENT_KEYS),
      to: z.enum(AGENT_KEYS),
      label: z.string(),
      /** Hand-offs in the last 7 days. */
      count7d: z.number().int(),
    }),
  ),
});
export type AgentGraph = z.infer<typeof agentGraphSchema>;
