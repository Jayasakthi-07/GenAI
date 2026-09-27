import { z } from 'zod';

/** Consistent error envelope for every API error response. */
export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
export type ApiError = z.infer<typeof apiErrorSchema>;

export const ERROR_CODES = [
  'VALIDATION_ERROR',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'INVALID_STATE_TRANSITION',
  'INSUFFICIENT_STOCK',
  'RATE_LIMITED',
  'DB_UNAVAILABLE',
  'AI_PROVIDER_UNAVAILABLE',
  'AI_INVALID_KEY',
  'AI_RATE_LIMITED',
  'AI_MODEL_NO_TOOLS',
  'INTERNAL',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export const uuidSchema = z.uuid();

/** Money travels as a decimal string with up to 2 (or 4 for unit costs) decimals. */
export const moneySchema = z.string().regex(/^-?\d+(\.\d{1,2})?$/, 'Enter an amount like 1250 or 1250.50');
export const unitCostSchema = z
  .string()
  .regex(/^-?\d+(\.\d{1,4})?$/, 'Enter an amount with up to 4 decimals');

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
  sort: z
    .string()
    .regex(/^[a-zA-Z.]+:(asc|desc)$/)
    .optional(),
  q: z.string().trim().max(200).optional(),
});
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export const pageMetaSchema = z.object({
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
});

export function paginated<T extends z.ZodType>(item: T) {
  return z.object({ data: z.array(item), meta: pageMetaSchema });
}

export const okSchema = z.object({ ok: z.literal(true) });
