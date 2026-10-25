import { z } from 'zod';
import { ACTOR_TYPES, ALERT_STATUSES, ALERT_TYPES, SEVERITIES } from '../constants/inventory';
import { multiValue, productRefSchema, refSchema, warehouseRefSchema } from './catalog';
import { paginationQuerySchema } from './common';

/* ── Alerts ────────────────────────────────────────────────────────────── */
export const alertSchema = z.object({
  id: z.uuid(),
  type: z.enum(ALERT_TYPES),
  severity: z.enum(SEVERITIES),
  status: z.enum(ALERT_STATUSES),
  priority: z.number().int(),
  title: z.string(),
  message: z.string(),
  explanation: z.string().nullable(),
  explanationSource: z.enum(['AI', 'RULE']),
  modelUsed: z.string().nullable(),
  product: productRefSchema.nullable(),
  warehouse: warehouseRefSchema.nullable(),
  supplier: refSchema.nullable(),
  data: z.record(z.string(), z.unknown()),
  createdAt: z.string(),
  updatedAt: z.string(),
  snoozedUntil: z.string().nullable(),
  acknowledgedAt: z.string().nullable(),
  acknowledgedBy: z.string().nullable(),
  resolvedAt: z.string().nullable(),
  resolvedBy: z.string().nullable(),
  resolution: z.string().nullable(),
  autoResolved: z.boolean(),
});
export type Alert = z.infer<typeof alertSchema>;

export const alertsQuerySchema = paginationQuerySchema.extend({
  status: multiValue(z.enum(ALERT_STATUSES)),
  severity: multiValue(z.enum(SEVERITIES)),
  type: multiValue(z.enum(ALERT_TYPES)),
  warehouseId: z.uuid().optional(),
  productId: z.uuid().optional(),
});
export type AlertsQuery = z.infer<typeof alertsQuerySchema>;

export const alertCountsSchema = z.object({
  open: z.number().int(),
  bySeverity: z.record(z.enum(SEVERITIES), z.number().int()),
  byType: z.record(z.string(), z.number().int()),
});
export type AlertCounts = z.infer<typeof alertCountsSchema>;

export const alertSnoozeSchema = z.object({ until: z.iso.datetime({ offset: true }) });
export const alertResolveSchema = z.object({ resolution: z.string().trim().max(500).optional().nullable() });
export const alertBulkSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('acknowledge'), ids: z.array(z.uuid()).min(1).max(500) }),
  z.object({
    action: z.literal('snooze'),
    ids: z.array(z.uuid()).min(1).max(500),
    until: z.iso.datetime({ offset: true }),
  }),
  z.object({
    action: z.literal('resolve'),
    ids: z.array(z.uuid()).min(1).max(500),
    resolution: z.string().trim().max(500).optional().nullable(),
  }),
]);
export type AlertBulk = z.infer<typeof alertBulkSchema>;

export const stockCheckResultSchema = z.object({
  created: z.number().int(),
  updated: z.number().int(),
  resolved: z.number().int(),
  findings: z.number().int(),
  durationMs: z.number().int(),
});
export type StockCheckResult = z.infer<typeof stockCheckResultSchema>;

/* ── Audit log ─────────────────────────────────────────────────────────── */
export const auditEntrySchema = z.object({
  id: z.uuid(),
  createdAt: z.string(),
  actorType: z.enum(ACTOR_TYPES),
  actorName: z.string(),
  agentKey: z.string().nullable(),
  agentRunId: z.string().nullable(),
  action: z.string(),
  entityType: z.string(),
  entityId: z.string().nullable(),
  summary: z.string().nullable(),
  before: z.unknown().nullable(),
  after: z.unknown().nullable(),
});
export type AuditEntry = z.infer<typeof auditEntrySchema>;

export const auditQuerySchema = z.object({
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  actorType: multiValue(z.enum(ACTOR_TYPES)),
  userId: z.uuid().optional(),
  agentKey: z.string().max(60).optional(),
  entityType: z.string().max(60).optional(),
  entityId: z.string().max(60).optional(),
  action: z.string().max(80).optional(),
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  q: z.string().trim().max(100).optional(),
});
export type AuditQuery = z.infer<typeof auditQuerySchema>;

export const auditFacetsSchema = z.object({
  users: z.array(refSchema),
  entityTypes: z.array(z.string()),
  actions: z.array(z.string()),
});
export type AuditFacets = z.infer<typeof auditFacetsSchema>;
