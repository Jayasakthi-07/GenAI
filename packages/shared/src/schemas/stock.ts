import { z } from 'zod';
import { ACTOR_TYPES, MOVEMENT_TYPES, STOCK_STATES } from '../constants/inventory';
import { multiValue, productRefSchema, warehouseRefSchema } from './catalog';
import { paginationQuerySchema, unitCostSchema } from './common';

const qty = z.coerce.number().int('Whole units only').positive('Must be more than zero').max(10_000_000);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

/* ── Positions ─────────────────────────────────────────────────────────── */
export const stockPositionSchema = z.object({
  id: z.uuid(),
  product: productRefSchema.extend({ category: z.string() }),
  warehouse: warehouseRefSchema,
  onHand: z.number().int(),
  reserved: z.number().int(),
  available: z.number().int(),
  onOrder: z.number().int(),
  reorderPoint: z.number().int().nullable(),
  safetyStock: z.number().int().nullable(),
  maxStock: z.number().int().nullable(),
  avgCost: z.string(),
  value: z.string(),
  state: z.enum(STOCK_STATES),
  avgDailyDemand: z.number(),
  daysOfCover: z.number().nullable(),
  lastMovementAt: z.string().nullable(),
});
export type StockPosition = z.infer<typeof stockPositionSchema>;

export const STOCK_POSITION_SORTS = [
  'product',
  'warehouse',
  'onHand',
  'available',
  'value',
  'daysOfCover',
  'lastMovementAt',
] as const;
export const stockPositionsQuerySchema = paginationQuerySchema.extend({
  warehouseId: z.uuid().optional(),
  categoryId: z.uuid().optional(),
  productId: z.uuid().optional(),
  state: multiValue(z.enum(STOCK_STATES)),
});
export type StockPositionsQuery = z.infer<typeof stockPositionsQuerySchema>;

export const stockSummarySchema = z.object({
  byState: z.record(z.enum(STOCK_STATES), z.number().int()),
  totalValue: z.string(),
  totalUnits: z.number().int(),
});
export type StockSummary = z.infer<typeof stockSummarySchema>;

/* ── Ledger ────────────────────────────────────────────────────────────── */
export const actorSchema = z.object({
  type: z.enum(ACTOR_TYPES),
  name: z.string(),
  agentKey: z.string().nullable(),
});
export type ActorView = z.infer<typeof actorSchema>;

export const movementSchema = z.object({
  id: z.uuid(),
  occurredAt: z.string(),
  type: z.enum(MOVEMENT_TYPES),
  quantity: z.number().int(),
  balanceAfter: z.number().int(),
  unitCost: z.string(),
  product: productRefSchema,
  warehouse: warehouseRefSchema,
  batch: z.object({ id: z.uuid(), batchNo: z.string() }).nullable(),
  reason: z.object({ code: z.string(), label: z.string() }).nullable(),
  reference: z.string().nullable(),
  sourceType: z.string().nullable(),
  sourceId: z.string().nullable(),
  note: z.string().nullable(),
  actor: actorSchema,
});
export type Movement = z.infer<typeof movementSchema>;

export const movementsQuerySchema = z.object({
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  productId: z.uuid().optional(),
  warehouseId: z.uuid().optional(),
  type: multiValue(z.enum(MOVEMENT_TYPES)),
  from: isoDate.optional(),
  to: isoDate.optional(),
  q: z.string().trim().max(100).optional(),
});
export type MovementsQuery = z.infer<typeof movementsQuerySchema>;

export function cursorPage<T extends z.ZodType>(item: T) {
  return z.object({ data: z.array(item), nextCursor: z.string().nullable() });
}

/* ── Batches ───────────────────────────────────────────────────────────── */
export const BATCH_STATUSES = ['EXPIRED', 'EXPIRING', 'OK'] as const;
export const batchSchema = z.object({
  id: z.uuid(),
  product: productRefSchema,
  warehouse: warehouseRefSchema,
  batchNo: z.string(),
  manufacturedOn: z.string().nullable(),
  expiryDate: z.string().nullable(),
  quantity: z.number().int(),
  unitCost: z.string(),
  value: z.string(),
  receivedAt: z.string(),
  daysToExpiry: z.number().int().nullable(),
  status: z.enum(BATCH_STATUSES),
});
export type Batch = z.infer<typeof batchSchema>;
export const batchesQuerySchema = paginationQuerySchema.extend({
  productId: z.uuid().optional(),
  warehouseId: z.uuid().optional(),
  expiringWithinDays: z.coerce.number().int().min(0).max(3650).optional(),
  status: multiValue(z.enum(BATCH_STATUSES)),
  includeEmpty: z.preprocess((v) => v === 'true' || v === true, z.boolean()).default(false),
});
export type BatchesQuery = z.infer<typeof batchesQuerySchema>;

export const fefoQuerySchema = z.object({ productId: z.uuid(), warehouseId: z.uuid(), quantity: qty });
export const fefoResultSchema = z.object({
  allocations: z.array(
    z.object({
      batchId: z.uuid(),
      batchNo: z.string(),
      expiryDate: z.string().nullable(),
      available: z.number().int(),
      take: z.number().int(),
    }),
  ),
  shortfall: z.number().int(),
});
export type FefoResult = z.infer<typeof fefoResultSchema>;

/* ── Operations ────────────────────────────────────────────────────────── */
export const receiveLineSchema = z.object({
  productId: z.uuid('Choose a product'),
  quantity: qty,
  unitCost: unitCostSchema,
  batchNo: z.string().trim().max(40).optional().nullable(),
  expiryDate: isoDate.optional().nullable(),
  manufacturedOn: isoDate.optional().nullable(),
});
export const receiveInputSchema = z.object({
  warehouseId: z.uuid('Choose a warehouse'),
  reference: z.string().trim().max(60).optional().nullable(),
  note: z.string().trim().max(500).optional().nullable(),
  lines: z.array(receiveLineSchema).min(1, 'Add at least one line').max(200),
});
export type ReceiveInput = z.input<typeof receiveInputSchema>;

export const issueInputSchema = z.object({
  warehouseId: z.uuid('Choose a warehouse'),
  reasonCodeId: z.uuid('Choose a reason'),
  note: z.string().trim().max(500).optional().nullable(),
  lines: z
    .array(
      z.object({
        productId: z.uuid('Choose a product'),
        quantity: qty,
        batchId: z.uuid().optional().nullable(),
      }),
    )
    .min(1, 'Add at least one line')
    .max(200),
});
export type IssueInput = z.input<typeof issueInputSchema>;

export const adjustInputSchema = z.object({
  warehouseId: z.uuid('Choose a warehouse'),
  productId: z.uuid('Choose a product'),
  /** Signed change: +5 adds five units, −3 removes three. */
  quantity: z.coerce
    .number()
    .int('Whole units only')
    .refine((v) => v !== 0, 'Enter a change other than zero'),
  reasonCodeId: z.uuid('Choose a reason'),
  batchId: z.uuid().optional().nullable(),
  /** For additions to expiry-tracked products without an existing batch. */
  batchNo: z.string().trim().max(40).optional().nullable(),
  expiryDate: isoDate.optional().nullable(),
  note: z.string().trim().max(500).optional().nullable(),
});
export type AdjustInput = z.input<typeof adjustInputSchema>;

export const writeOffInputSchema = z.object({
  warehouseId: z.uuid('Choose a warehouse'),
  productId: z.uuid('Choose a product'),
  quantity: qty,
  reasonCodeId: z.uuid('Choose a reason'),
  batchId: z.uuid().optional().nullable(),
  note: z.string().trim().max(500).optional().nullable(),
});
export type WriteOffInput = z.input<typeof writeOffInputSchema>;

export const stockOperationResultSchema = z.object({ movements: z.array(movementSchema) });
export type StockOperationResult = z.infer<typeof stockOperationResultSchema>;
