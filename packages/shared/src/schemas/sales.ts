import { z } from 'zod';
import { CUSTOMER_TYPES, SALES_CHANNELS, SO_STATUSES } from '../constants/inventory';
import { multiValue, productRefSchema, refSchema, warehouseRefSchema } from './catalog';
import { moneySchema, paginationQuerySchema } from './common';
import { actorSchema } from './stock';

const nullableText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

/* ── Customers ─────────────────────────────────────────────────────────── */
export const customerSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
  type: z.enum(CUSTOMER_TYPES),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  city: z.string().nullable(),
  gstin: z.string().nullable(),
  isActive: z.boolean(),
  orderCount: z.number().int(),
  revenue90d: z.string(),
  lastOrderAt: z.string().nullable(),
});
export type Customer = z.infer<typeof customerSchema>;

export const customersQuerySchema = paginationQuerySchema.extend({
  type: multiValue(z.enum(CUSTOMER_TYPES)),
});
export type CustomersQuery = z.infer<typeof customersQuerySchema>;

export const customerInputSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2)
    .max(12)
    .regex(/^[A-Z0-9-]+$/, 'Uppercase letters, numbers and dashes'),
  name: z.string().trim().min(1, 'Required').max(120),
  type: z.enum(CUSTOMER_TYPES),
  email: z
    .union([z.email('Enter a valid email'), z.literal('')])
    .optional()
    .nullable()
    .transform((v) => (v ? v : null)),
  phone: nullableText(30),
  city: nullableText(60),
  gstin: nullableText(15),
  isActive: z.boolean().default(true),
});
export type CustomerInput = z.input<typeof customerInputSchema>;

/* ── Sales orders ──────────────────────────────────────────────────────── */
export const soListItemSchema = z.object({
  id: z.uuid(),
  number: z.string(),
  customer: refSchema.nullable(),
  warehouse: warehouseRefSchema,
  channel: z.enum(SALES_CHANNELS),
  status: z.enum(SO_STATUSES),
  orderDate: z.string(),
  total: z.string(),
  lineCount: z.number().int(),
  fulfilledRatio: z.number(),
  createdBy: actorSchema,
});
export type SoListItem = z.infer<typeof soListItemSchema>;

export const SO_SORTS = ['number', 'orderDate', 'total', 'status', 'customer'] as const;
export const soListQuerySchema = paginationQuerySchema.extend({
  status: multiValue(z.enum(SO_STATUSES)),
  customerId: z.uuid().optional(),
  warehouseId: z.uuid().optional(),
  channel: multiValue(z.enum(SALES_CHANNELS)),
});
export type SoListQuery = z.infer<typeof soListQuerySchema>;

export const soLineSchema = z.object({
  id: z.uuid(),
  product: productRefSchema,
  quantity: z.number().int(),
  quantityFulfilled: z.number().int(),
  unitPrice: z.string(),
  discount: z.string(),
  taxRate: z.string(),
  lineTotal: z.string(),
  /** Available at the order's warehouse now (excluding this order's own reservation). */
  available: z.number().int(),
});
export type SoLine = z.infer<typeof soLineSchema>;

export const soDetailSchema = soListItemSchema.extend({
  subtotal: z.string(),
  discountTotal: z.string(),
  taxTotal: z.string(),
  notes: z.string().nullable(),
  fulfilledAt: z.string().nullable(),
  lines: z.array(soLineSchema),
  allowedActions: z.array(z.enum(['edit', 'confirm', 'fulfill', 'cancel'])),
});
export type SoDetail = z.infer<typeof soDetailSchema>;

export const soInputSchema = z.object({
  customerId: z.uuid('Choose a customer'),
  warehouseId: z.uuid('Choose a warehouse'),
  channel: z.enum(SALES_CHANNELS),
  notes: nullableText(1000),
  lines: z
    .array(
      z.object({
        productId: z.uuid('Choose a product'),
        quantity: z.coerce.number().int('Whole units only').positive('Must be more than zero'),
        unitPrice: moneySchema.optional().nullable(),
        discount: moneySchema.optional().nullable(),
      }),
    )
    .min(1, 'Add at least one line')
    .max(200)
    .refine(
      (lines) => new Set(lines.map((l) => l.productId)).size === lines.length,
      'Each product can appear once',
    ),
  /** Reserve stock right after saving. */
  confirm: z.boolean().default(false),
});
export type SoInput = z.input<typeof soInputSchema>;

export const soFulfillSchema = z.object({
  /** Quantities to ship now; omit to ship everything outstanding. */
  lines: z.array(z.object({ lineId: z.uuid(), quantity: z.coerce.number().int().min(0) })).optional(),
});
export type SoFulfill = z.input<typeof soFulfillSchema>;
