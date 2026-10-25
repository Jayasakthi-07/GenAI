import { z } from 'zod';

export const SEARCH_KINDS = [
  'product',
  'supplier',
  'customer',
  'purchase_order',
  'sales_order',
  'transfer',
  'cycle_count',
] as const;
export type SearchKind = (typeof SEARCH_KINDS)[number];

export const searchResultSchema = z.object({
  kind: z.enum(SEARCH_KINDS),
  id: z.uuid(),
  title: z.string(),
  subtitle: z.string(),
});
export type SearchResult = z.infer<typeof searchResultSchema>;

export const searchQuerySchema = z.object({ q: z.string().trim().min(1).max(100) });
