import { z } from 'zod';
import { COUNT_LINE_STATUSES, CYCLE_COUNT_STATUSES, TRANSFER_STATUSES } from '../constants/inventory';
import { multiValue, productRefSchema, warehouseRefSchema } from './catalog';
import { paginationQuerySchema } from './common';
import { actorSchema } from './stock';

const qty = z.coerce.number().int('Whole units only').positive('Must be more than zero').max(10_000_000);
const reason = z.string().trim().max(300);

/* ── Transfers ─────────────────────────────────────────────────────────── */
export const transferListItemSchema = z.object({
  id: z.uuid(),
  number: z.string(),
  from: warehouseRefSchema,
  to: warehouseRefSchema,
  status: z.enum(TRANSFER_STATUSES),
  lineCount: z.number().int(),
  totalUnits: z.number().int(),
  createdAt: z.string(),
  shippedAt: z.string().nullable(),
  receivedAt: z.string().nullable(),
  createdBy: actorSchema,
});
export type TransferListItem = z.infer<typeof transferListItemSchema>;

export const transferDetailSchema = transferListItemSchema.extend({
  reason: z.string().nullable(),
  cancelledAt: z.string().nullable(),
  lines: z.array(
    z.object({
      id: z.uuid(),
      product: productRefSchema,
      quantity: z.number().int(),
      /** Available at the source warehouse right now (for drafts). */
      availableAtSource: z.number().int(),
    }),
  ),
});
export type TransferDetail = z.infer<typeof transferDetailSchema>;

export const transfersQuerySchema = paginationQuerySchema.extend({
  status: multiValue(z.enum(TRANSFER_STATUSES)),
  warehouseId: z.uuid().optional(),
});
export type TransfersQuery = z.infer<typeof transfersQuerySchema>;

export const transferInputSchema = z
  .object({
    fromWarehouseId: z.uuid('Choose the source warehouse'),
    toWarehouseId: z.uuid('Choose the destination warehouse'),
    reason: reason.optional().nullable(),
    lines: z
      .array(z.object({ productId: z.uuid('Choose a product'), quantity: qty }))
      .min(1, 'Add at least one product')
      .max(200)
      .refine(
        (lines) => new Set(lines.map((l) => l.productId)).size === lines.length,
        'Each product can appear once',
      ),
    /** Ship immediately after creating. */
    ship: z.boolean().default(false),
  })
  .refine((t) => t.fromWarehouseId !== t.toWarehouseId, {
    message: 'Source and destination must differ',
    path: ['toWarehouseId'],
  });
export type TransferInput = z.input<typeof transferInputSchema>;
export const cancelInputSchema = z.object({
  reason: z.string().trim().min(3, 'Give a short reason').max(300),
});
export type CancelInput = z.infer<typeof cancelInputSchema>;

/* ── Cycle counts ──────────────────────────────────────────────────────── */
export const cycleCountListItemSchema = z.object({
  id: z.uuid(),
  number: z.string(),
  warehouse: warehouseRefSchema,
  status: z.enum(CYCLE_COUNT_STATUSES),
  reason: z.string().nullable(),
  dueDate: z.string().nullable(),
  lineCount: z.number().int(),
  countedCount: z.number().int(),
  varianceCount: z.number().int(),
  varianceValue: z.string(),
  createdAt: z.string(),
  completedAt: z.string().nullable(),
  createdBy: actorSchema,
});
export type CycleCountListItem = z.infer<typeof cycleCountListItemSchema>;

export const cycleCountLineSchema = z.object({
  id: z.uuid(),
  product: productRefSchema,
  expectedQty: z.number().int(),
  countedQty: z.number().int().nullable(),
  variance: z.number().int().nullable(),
  variancePct: z.number().nullable(),
  varianceValue: z.string().nullable(),
  status: z.enum(COUNT_LINE_STATUSES),
  note: z.string().nullable(),
  countedAt: z.string().nullable(),
});
export type CycleCountLine = z.infer<typeof cycleCountLineSchema>;

export const cycleCountDetailSchema = cycleCountListItemSchema.extend({
  submittedAt: z.string().nullable(),
  approvedBy: z.string().nullable(),
  lines: z.array(cycleCountLineSchema),
});
export type CycleCountDetail = z.infer<typeof cycleCountDetailSchema>;

export const cycleCountsQuerySchema = paginationQuerySchema.extend({
  status: multiValue(z.enum(CYCLE_COUNT_STATUSES)),
  warehouseId: z.uuid().optional(),
});
export type CycleCountsQuery = z.infer<typeof cycleCountsQuerySchema>;

export const cycleCountInputSchema = z
  .object({
    warehouseId: z.uuid('Choose a warehouse'),
    reason: reason.optional().nullable(),
    dueDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .nullable(),
    /** Count these products … */
    productIds: z.array(z.uuid()).max(300).optional(),
    /** … or every stocked product in this category (including subcategories). */
    categoryId: z.uuid().optional(),
  })
  .refine((c) => (c.productIds?.length ?? 0) > 0 || !!c.categoryId, {
    message: 'Choose products or a category to count',
    path: ['productIds'],
  });
export type CycleCountInput = z.input<typeof cycleCountInputSchema>;

export const countLinesUpdateSchema = z.object({
  lines: z
    .array(
      z.object({
        id: z.uuid(),
        countedQty: z.coerce.number().int().min(0).max(10_000_000).nullable(),
        note: z.string().trim().max(300).optional().nullable(),
      }),
    )
    .min(1)
    .max(300),
});
export type CountLinesUpdate = z.input<typeof countLinesUpdateSchema>;

export const countApproveSchema = z.object({
  /** Lines to send back for a recount instead of accepting. */
  recountLineIds: z.array(z.uuid()).default([]),
});
export type CountApprove = z.input<typeof countApproveSchema>;
