import { z } from 'zod';
import { PO_STATUSES, type PurchaseOrderStatus } from '../constants/inventory';
import { multiValue, productRefSchema, refSchema, warehouseRefSchema } from './catalog';
import { moneySchema, paginationQuerySchema, unitCostSchema } from './common';
import { actorSchema } from './stock';

const text = (max: number) => z.string().trim().max(max);
const qty = z.coerce.number().int('Whole units only').positive('Must be more than zero').max(10_000_000);

/* ── Suppliers ─────────────────────────────────────────────────────────── */
export const RISK_LEVELS = ['LOW', 'MEDIUM', 'HIGH'] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];
export const RISK_LABELS: Record<RiskLevel, string> = {
  LOW: 'Low risk',
  MEDIUM: 'Medium risk',
  HIGH: 'High risk',
};

export const supplierListItemSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
  contactName: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  city: z.string().nullable(),
  isActive: z.boolean(),
  productCount: z.number().int(),
  openPoCount: z.number().int(),
  openPoValue: z.string(),
  score: z.number().nullable(),
  riskLevel: z.enum(RISK_LEVELS).nullable(),
  lastOrderAt: z.string().nullable(),
});
export type SupplierListItem = z.infer<typeof supplierListItemSchema>;

export const supplierDetailSchema = supplierListItemSchema.extend({
  address: z.string().nullable(),
  gstin: z.string().nullable(),
  paymentTermsDays: z.number().int(),
  notes: z.string().nullable(),
  scoredAt: z.string().nullable(),
});
export type SupplierDetail = z.infer<typeof supplierDetailSchema>;

export const suppliersQuerySchema = paginationQuerySchema.extend({
  active: z.preprocess(
    (v) => (v === undefined || v === '' ? undefined : v === 'true'),
    z.boolean().optional(),
  ),
});
export type SuppliersQuery = z.infer<typeof suppliersQuerySchema>;

const nullableText = (max: number) =>
  text(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

export const supplierInputSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2)
    .max(10)
    .regex(/^[A-Z0-9-]+$/, 'Uppercase letters, numbers and dashes'),
  name: z.string().trim().min(1, 'Required').max(120),
  contactName: nullableText(80),
  email: z
    .union([z.email('Enter a valid email'), z.literal('')])
    .optional()
    .nullable()
    .transform((v) => (v ? v : null)),
  phone: nullableText(30),
  city: nullableText(60),
  address: nullableText(200),
  gstin: z
    .union([
      z
        .string()
        .trim()
        .regex(/^[0-9A-Z]{15}$/, 'GSTIN has 15 letters and digits'),
      z.literal(''),
    ])
    .optional()
    .nullable()
    .transform((v) => (v ? v : null)),
  paymentTermsDays: z.coerce.number().int().min(0).max(180).default(30),
  isActive: z.boolean().default(true),
  notes: nullableText(1000),
});
export type SupplierInput = z.input<typeof supplierInputSchema>;

export const supplierProductSchema = z.object({
  id: z.uuid(),
  product: productRefSchema,
  supplierSku: z.string().nullable(),
  unitCost: z.string(),
  moq: z.number().int(),
  packSize: z.number().int(),
  leadTimeDays: z.number().int(),
  isActive: z.boolean(),
  isPreferred: z.boolean(),
  lastPurchasedAt: z.string().nullable(),
});
export type SupplierProduct = z.infer<typeof supplierProductSchema>;

export const supplierProductInputSchema = z.object({
  productId: z.uuid('Choose a product'),
  supplierSku: nullableText(40),
  unitCost: moneySchema,
  moq: z.coerce.number().int().min(1).default(1),
  packSize: z.coerce.number().int().min(1).default(1),
  leadTimeDays: z.coerce.number().int().min(0).max(180),
  isActive: z.boolean().default(true),
  isPreferred: z.boolean().default(false),
});
export type SupplierProductInput = z.input<typeof supplierProductInputSchema>;

export const supplierScorecardSchema = z.object({
  periodDays: z.number().int(),
  score: z.number().nullable(),
  riskLevel: z.enum(RISK_LEVELS).nullable(),
  breakdown: z.object({
    onTime: z.number().nullable(),
    fill: z.number().nullable(),
    leadTime: z.number().nullable(),
    price: z.number().nullable(),
    quality: z.number().nullable(),
  }),
  metrics: z.object({
    orders: z.number().int(),
    receipts: z.number().int(),
    spend: z.string(),
    onTimeRate: z.number().nullable(),
    avgLeadTimeDays: z.number().nullable(),
    leadTimeCv: z.number().nullable(),
    fillRate: z.number().nullable(),
    rejectionRate: z.number().nullable(),
    /** Unit-cost change over the last 90 days, as a fraction. */
    priceChange: z.number().nullable(),
  }),
  flags: z.array(z.string()),
  monthly: z.array(
    z.object({
      month: z.string(),
      orders: z.number().int(),
      spend: z.number(),
      onTimeRate: z.number().nullable(),
      fillRate: z.number().nullable(),
      avgLeadTimeDays: z.number().nullable(),
    }),
  ),
  recentDeliveries: z.array(
    z.object({
      receiptNumber: z.string(),
      poNumber: z.string(),
      purchaseOrderId: z.uuid(),
      expectedDate: z.string().nullable(),
      receivedAt: z.string(),
      daysLate: z.number().int().nullable(),
      fillRate: z.number(),
      rejected: z.number().int(),
    }),
  ),
});
export type SupplierScorecard = z.infer<typeof supplierScorecardSchema>;

/* ── Purchase orders ───────────────────────────────────────────────────── */
export const poListItemSchema = z.object({
  id: z.uuid(),
  number: z.string(),
  supplier: refSchema.extend({ code: z.string() }),
  warehouse: warehouseRefSchema,
  status: z.enum(PO_STATUSES),
  orderDate: z.string(),
  expectedDate: z.string().nullable(),
  total: z.string(),
  lineCount: z.number().int(),
  /** Received ÷ ordered units (0–1). */
  receivedRatio: z.number(),
  overdue: z.boolean(),
  createdBy: actorSchema,
});
export type PoListItem = z.infer<typeof poListItemSchema>;

export const PO_SORTS = ['number', 'orderDate', 'expectedDate', 'total', 'status', 'supplier'] as const;
export const poListQuerySchema = paginationQuerySchema.extend({
  status: multiValue(z.enum(PO_STATUSES)),
  supplierId: z.uuid().optional(),
  warehouseId: z.uuid().optional(),
  createdBy: z.enum(['agent', 'user']).optional(),
  overdue: z.preprocess(
    (v) => (v === undefined || v === '' ? undefined : v === 'true'),
    z.boolean().optional(),
  ),
});
export type PoListQuery = z.infer<typeof poListQuerySchema>;

export const poLineSchema = z.object({
  id: z.uuid(),
  product: productRefSchema,
  supplierSku: z.string().nullable(),
  quantityOrdered: z.number().int(),
  quantityReceived: z.number().int(),
  quantityRejected: z.number().int(),
  remaining: z.number().int(),
  unitCost: z.string(),
  taxRate: z.string(),
  lineTotal: z.string(),
  rationale: z.string().nullable(),
});
export type PoLine = z.infer<typeof poLineSchema>;

export const goodsReceiptSchema = z.object({
  id: z.uuid(),
  number: z.string(),
  receivedAt: z.string(),
  receivedBy: z.string(),
  notes: z.string().nullable(),
  lines: z.array(
    z.object({
      id: z.uuid(),
      product: productRefSchema,
      quantityReceived: z.number().int(),
      quantityRejected: z.number().int(),
      rejectReason: z.string().nullable(),
      unitCost: z.string(),
      batchNo: z.string().nullable(),
      expiryDate: z.string().nullable(),
    }),
  ),
});
export type GoodsReceipt = z.infer<typeof goodsReceiptSchema>;

export const poEventSchema = z.object({ at: z.string(), label: z.string(), by: z.string().nullable() });

export const poDetailSchema = poListItemSchema.extend({
  subtotal: z.string(),
  taxTotal: z.string(),
  notes: z.string().nullable(),
  rationale: z.string().nullable(),
  cancelReason: z.string().nullable(),
  agentRunId: z.string().nullable(),
  timeline: z.array(poEventSchema),
  lines: z.array(poLineSchema),
  receipts: z.array(goodsReceiptSchema),
  /** Transitions the current user may perform now. */
  allowedActions: z.array(
    z.enum(['edit', 'submit', 'approve', 'reject', 'send', 'receive', 'close', 'cancel']),
  ),
});
export type PoDetail = z.infer<typeof poDetailSchema>;
export type PoAction = PoDetail['allowedActions'][number];

export const poInputSchema = z.object({
  supplierId: z.uuid('Choose a supplier'),
  warehouseId: z.uuid('Choose a warehouse'),
  expectedDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .nullable(),
  notes: text(1000).optional().nullable(),
  lines: z
    .array(
      z.object({
        productId: z.uuid('Choose a product'),
        quantityOrdered: qty,
        unitCost: unitCostSchema,
        taxRate: z.coerce.number().min(0).max(100).optional(),
      }),
    )
    .min(1, 'Add at least one line')
    .max(200)
    .refine(
      (lines) => new Set(lines.map((l) => l.productId)).size === lines.length,
      'Each product can appear once',
    ),
  /** Submit for approval right after saving. */
  submit: z.boolean().default(false),
});
export type PoInput = z.input<typeof poInputSchema>;

export const poReasonSchema = z.object({ reason: z.string().trim().min(3, 'Give a short reason').max(300) });

export const poReceiveSchema = z.object({
  notes: text(500).optional().nullable(),
  lines: z
    .array(
      z.object({
        purchaseOrderLineId: z.uuid(),
        quantityReceived: z.coerce.number().int().min(0),
        quantityRejected: z.coerce.number().int().min(0).default(0),
        rejectReason: text(200).optional().nullable(),
        unitCost: unitCostSchema.optional().nullable(),
        batchNo: text(40).optional().nullable(),
        expiryDate: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional()
          .nullable(),
      }),
    )
    .min(1)
    .refine(
      (lines) => lines.some((l) => l.quantityReceived + (l.quantityRejected ?? 0) > 0),
      'Enter at least one received quantity',
    ),
});
export type PoReceive = z.input<typeof poReceiveSchema>;

export const PO_EDITABLE_STATUSES: PurchaseOrderStatus[] = ['DRAFT'];
