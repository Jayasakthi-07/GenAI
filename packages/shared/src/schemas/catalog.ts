import { z } from 'zod';
import {
  ABC_CLASSES,
  MOVEMENT_TYPES,
  PRODUCT_STATUSES,
  REASON_DIRECTIONS,
  STOCK_STATES,
  XYZ_CLASSES,
} from '../constants/inventory';
import { moneySchema, paginationQuerySchema } from './common';

const trimmed = (max: number) => z.string().trim().min(1, 'Required').max(max);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

/** Accepts repeated or comma-separated query values: ?status=A&status=B or ?status=A,B. */
export function multiValue<T extends z.ZodType>(item: T) {
  return z.preprocess((v) => {
    if (v === undefined || v === '') return undefined;
    const list = Array.isArray(v) ? v : [v];
    return list.flatMap((x) => String(x).split(',')).filter(Boolean);
  }, z.array(item).optional());
}

export const booleanQuery = z.preprocess(
  (v) => (v === undefined || v === '' ? undefined : v === 'true' || v === true),
  z.boolean().optional(),
);

export const refSchema = z.object({ id: z.uuid(), name: z.string() });
export const warehouseRefSchema = z.object({ id: z.uuid(), code: z.string(), name: z.string() });
export const productRefSchema = z.object({
  id: z.uuid(),
  sku: z.string(),
  name: z.string(),
  unit: z.string(),
  trackExpiry: z.boolean(),
});
export type ProductRef = z.infer<typeof productRefSchema>;
export type WarehouseRef = z.infer<typeof warehouseRefSchema>;

/* ── Units ─────────────────────────────────────────────────────────────── */
export const unitSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
  productCount: z.number().int(),
});
export type Unit = z.infer<typeof unitSchema>;
export const unitInputSchema = z.object({
  code: trimmed(20).regex(/^[a-z0-9-]+$/, 'Lowercase letters, numbers and dashes'),
  name: trimmed(60),
});
export type UnitInput = z.infer<typeof unitInputSchema>;

/* ── Categories ────────────────────────────────────────────────────────── */
export const categorySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
  parentId: z.uuid().nullable(),
  sortOrder: z.number().int(),
  /** Products directly in this category. */
  productCount: z.number().int(),
});
export type Category = z.infer<typeof categorySchema>;
export const categoryInputSchema = z.object({
  name: trimmed(80),
  description: optionalText(300),
  parentId: z.uuid().nullable().optional(),
});
export type CategoryInput = z.infer<typeof categoryInputSchema>;

/* ── Warehouses ────────────────────────────────────────────────────────── */
export const warehouseSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
  city: z.string(),
  address: z.string().nullable(),
  isActive: z.boolean(),
  isDefault: z.boolean(),
  skuCount: z.number().int(),
  stockValue: z.string(),
});
export type Warehouse = z.infer<typeof warehouseSchema>;
export const warehouseInputSchema = z.object({
  code: trimmed(10).regex(/^[A-Z0-9-]+$/, 'Uppercase letters, numbers and dashes'),
  name: trimmed(80),
  city: trimmed(60),
  address: optionalText(200),
  isActive: z.boolean().default(true),
  isDefault: z.boolean().default(false),
});
export type WarehouseInput = z.infer<typeof warehouseInputSchema>;

/* ── Reason codes ──────────────────────────────────────────────────────── */
export const reasonCodeSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  label: z.string(),
  direction: z.enum(REASON_DIRECTIONS),
  appliesTo: z.array(z.enum(MOVEMENT_TYPES)),
  isActive: z.boolean(),
});
export type ReasonCode = z.infer<typeof reasonCodeSchema>;
export const reasonCodeInputSchema = z.object({
  code: trimmed(30).regex(/^[A-Z0-9_]+$/, 'Uppercase letters, numbers and underscores'),
  label: trimmed(80),
  direction: z.enum(REASON_DIRECTIONS),
  appliesTo: z.array(z.enum(MOVEMENT_TYPES)).min(1, 'Pick at least one movement type'),
  isActive: z.boolean().default(true),
});
export type ReasonCodeInput = z.infer<typeof reasonCodeInputSchema>;

/* ── Products ──────────────────────────────────────────────────────────── */
export const productListItemSchema = z.object({
  id: z.uuid(),
  sku: z.string(),
  barcode: z.string().nullable(),
  name: z.string(),
  brand: z.string().nullable(),
  category: z.object({ id: z.uuid(), name: z.string(), path: z.string() }),
  unit: z.string(),
  status: z.enum(PRODUCT_STATUSES),
  costPrice: z.string(),
  sellingPrice: z.string(),
  taxRate: z.string(),
  trackExpiry: z.boolean(),
  tags: z.array(z.string()),
  imageUrl: z.string().nullable(),
  abcClass: z.enum(ABC_CLASSES).nullable(),
  xyzClass: z.enum(XYZ_CLASSES).nullable(),
  onHand: z.number().int(),
  available: z.number().int(),
  onOrder: z.number().int(),
  value: z.string(),
  /** Worst stock state across warehouses, and how many warehouses are in it. */
  stockState: z.enum(STOCK_STATES),
  stockStateCount: z.number().int(),
  updatedAt: z.string(),
});
export type ProductListItem = z.infer<typeof productListItemSchema>;

export const PRODUCT_SORTS = [
  'name',
  'sku',
  'onHand',
  'value',
  'sellingPrice',
  'costPrice',
  'updatedAt',
  'category',
] as const;

export const productListQuerySchema = paginationQuerySchema.extend({
  categoryId: z.uuid().optional(),
  status: multiValue(z.enum(PRODUCT_STATUSES)),
  stockState: multiValue(z.enum(STOCK_STATES)),
  warehouseId: z.uuid().optional(),
  supplierId: z.uuid().optional(),
  brand: z.string().trim().max(80).optional(),
  tag: z.string().trim().max(40).optional(),
  trackExpiry: booleanQuery,
  abcClass: multiValue(z.enum(ABC_CLASSES)),
});
export type ProductListQuery = z.infer<typeof productListQuerySchema>;

export const productStockSchema = z.object({
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
export type ProductStock = z.infer<typeof productStockSchema>;

export const productDetailSchema = productListItemSchema.extend({
  description: z.string().nullable(),
  mrp: z.string().nullable(),
  shelfLifeDays: z.number().int().nullable(),
  leadTimeDays: z.number().int().nullable(),
  reorderPoint: z.number().int().nullable(),
  safetyStock: z.number().int().nullable(),
  maxStock: z.number().int().nullable(),
  preferredSupplier: refSchema.nullable(),
  unitId: z.uuid(),
  createdAt: z.string(),
  stock: z.array(productStockSchema),
});
export type ProductDetail = z.infer<typeof productDetailSchema>;

const optionalInt = z
  .union([z.number().int().min(0), z.nan(), z.null()])
  .optional()
  .transform((v) => (v === undefined || v === null || Number.isNaN(v) ? null : v));

export const productInputSchema = z
  .object({
    sku: trimmed(40).regex(/^[A-Za-z0-9._-]+$/, 'Letters, numbers, dots, dashes and underscores'),
    barcode: optionalText(40),
    name: trimmed(160),
    description: optionalText(2000),
    categoryId: z.uuid('Choose a category'),
    brand: optionalText(80),
    unitId: z.uuid('Choose a unit'),
    costPrice: moneySchema,
    sellingPrice: moneySchema,
    mrp: moneySchema
      .optional()
      .nullable()
      .or(z.literal('').transform(() => null)),
    taxRate: z.coerce.number().min(0).max(100),
    tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
    status: z.enum(PRODUCT_STATUSES).default('ACTIVE'),
    trackExpiry: z.boolean().default(false),
    shelfLifeDays: optionalInt,
    leadTimeDays: optionalInt,
    reorderPoint: optionalInt,
    safetyStock: optionalInt,
    maxStock: optionalInt,
    preferredSupplierId: z.uuid().nullable().optional(),
  })
  .refine((p) => Number(p.sellingPrice) >= Number(p.costPrice) || p.status !== 'ACTIVE', {
    message: 'Selling price is below cost',
    path: ['sellingPrice'],
  })
  .refine((p) => !p.mrp || Number(p.mrp) >= Number(p.sellingPrice), {
    message: 'MRP must be at least the selling price',
    path: ['mrp'],
  })
  .refine((p) => !p.trackExpiry || (p.shelfLifeDays ?? 0) > 0, {
    message: 'Set a shelf life for expiry-tracked products',
    path: ['shelfLifeDays'],
  });
export type ProductInput = z.input<typeof productInputSchema>;
export type ProductInputParsed = z.output<typeof productInputSchema>;

export const productBulkSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('set-status'),
    ids: z.array(z.uuid()).min(1).max(500),
    status: z.enum(PRODUCT_STATUSES),
  }),
  z.object({
    action: z.literal('set-category'),
    ids: z.array(z.uuid()).min(1).max(500),
    categoryId: z.uuid(),
  }),
  z.object({
    action: z.literal('add-tag'),
    ids: z.array(z.uuid()).min(1).max(500),
    tag: z.string().trim().min(1).max(40),
  }),
  z.object({
    action: z.literal('remove-tag'),
    ids: z.array(z.uuid()).min(1).max(500),
    tag: z.string().trim().min(1).max(40),
  }),
]);
export type ProductBulk = z.infer<typeof productBulkSchema>;
export const bulkResultSchema = z.object({ updated: z.number().int() });

/* ── CSV import ────────────────────────────────────────────────────────── */
export const PRODUCT_CSV_COLUMNS = [
  'sku',
  'name',
  'category',
  'unit',
  'cost_price',
  'selling_price',
  'mrp',
  'tax_rate',
  'barcode',
  'brand',
  'description',
  'tags',
  'status',
  'track_expiry',
  'shelf_life_days',
  'lead_time_days',
] as const;

export const importRequestSchema = z.object({
  csv: z.string().min(1, 'The file is empty').max(5_000_000, 'Files up to 5 MB'),
  /** Existing SKUs are updated when true, skipped when false. */
  updateExisting: z.boolean().default(true),
});
export type ImportRequest = z.input<typeof importRequestSchema>;

export const importRowSchema = z.object({
  row: z.number().int(),
  sku: z.string(),
  name: z.string(),
  action: z.enum(['create', 'update', 'skip', 'error']),
  errors: z.array(z.string()),
});
export const importPreviewSchema = z.object({
  columns: z.array(z.string()),
  missingColumns: z.array(z.string()),
  unknownColumns: z.array(z.string()),
  rows: z.array(importRowSchema),
  summary: z.object({
    total: z.number().int(),
    create: z.number().int(),
    update: z.number().int(),
    skip: z.number().int(),
    error: z.number().int(),
  }),
});
export type ImportPreview = z.infer<typeof importPreviewSchema>;
export const importResultSchema = z.object({
  created: z.number().int(),
  updated: z.number().int(),
  skipped: z.number().int(),
  failed: z.number().int(),
  errors: z.array(z.object({ row: z.number().int(), sku: z.string(), errors: z.array(z.string()) })),
});
export type ImportResult = z.infer<typeof importResultSchema>;

/* ── Saved views ───────────────────────────────────────────────────────── */
export const savedViewSchema = z.object({
  id: z.uuid(),
  page: z.string(),
  name: z.string(),
  state: z.record(z.string(), z.unknown()),
  isDefault: z.boolean(),
});
export type SavedView = z.infer<typeof savedViewSchema>;
export const savedViewInputSchema = z.object({
  page: z.string().trim().min(1).max(40),
  name: trimmed(60),
  state: z.record(z.string(), z.unknown()),
  isDefault: z.boolean().default(false),
});
export type SavedViewInput = z.input<typeof savedViewInputSchema>;
