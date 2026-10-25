import { z } from 'zod';

/**
 * Search-param schemas for list pages. Every field is optional and falls back to undefined when
 * the URL holds something invalid, so a hand-edited or stale link still opens the page.
 */
export const pageParam = z.number().int().min(1).optional().catch(undefined);
export const pageSizeParam = z
  .union([z.literal(25), z.literal(50), z.literal(100), z.literal(200)])
  .optional()
  .catch(undefined);
export const sortParam = z
  .string()
  .regex(/^[a-zA-Z.]+:(asc|desc)$/)
  .optional()
  .catch(undefined);
export const textParam = z.string().max(200).optional().catch(undefined);
export const idParam = z.uuid().optional().catch(undefined);
export const boolParam = z.boolean().optional().catch(undefined);

export function enumListParam<const T extends readonly [string, ...string[]]>(values: T) {
  return z.array(z.enum(values)).optional().catch(undefined);
}
export function enumParam<const T extends readonly [string, ...string[]]>(values: T) {
  return z.enum(values).optional().catch(undefined);
}

export const listSearch = { page: pageParam, pageSize: pageSizeParam, sort: sortParam, q: textParam };

/** Drops empty values so URLs stay short and default states have clean links. */
export function cleanSearch<T extends Record<string, unknown>>(search: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(search)) {
    if (v === undefined || v === null || v === '') continue;
    if (Array.isArray(v) && v.length === 0) continue;
    out[k] = v;
  }
  return out as T;
}

/** Converts list search state to API query parameters (arrays become comma-separated values). */
export function toApiQuery(
  search: Record<string, unknown>,
): Record<string, string | number | boolean | undefined> {
  const out: Record<string, string | number | boolean | undefined> = {};
  for (const [k, v] of Object.entries(search)) {
    if (v === undefined || v === null || v === '') continue;
    out[k] = Array.isArray(v) ? v.join(',') : (v as string | number | boolean);
  }
  return out;
}
