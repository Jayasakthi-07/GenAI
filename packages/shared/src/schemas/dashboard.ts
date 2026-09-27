import { z } from 'zod';

/** Current value vs the same-length previous period. Money values are decimal strings. */
export const comparedMoneySchema = z.object({ current: z.string(), previous: z.string() });
export const comparedNumberSchema = z.object({ current: z.number(), previous: z.number() });

export const dashboardOverviewSchema = z.object({
  asOf: z.string(),
  periodDays: z.number().int(),
  kpis: z.object({
    inventoryValue: comparedMoneySchema,
    revenue: comparedMoneySchema,
    unitsSold: comparedNumberSchema,
    fillRate: comparedNumberSchema,
    outOfStock: z.number().int(),
    needsReorder: z.number().int(),
    daysOfInventory: z.number(),
    activeSkus: z.number().int(),
    warehouses: z.number().int(),
  }),
  /** Daily inventory value (whole rupees) for the period, ending today. */
  valueTrend: z.array(z.object({ date: z.string(), value: z.number() })),
  /** Daily revenue (whole rupees) with a 7-day moving average. */
  salesTrend: z.array(z.object({ date: z.string(), revenue: z.number(), average: z.number().nullable() })),
  categoryMix: z.array(z.object({ category: z.string(), value: z.number(), share: z.number() })),
  topMovers: z.array(
    z.object({
      productId: z.uuid(),
      sku: z.string(),
      name: z.string(),
      category: z.string(),
      units: z.number().int(),
      revenue: z.number(),
      previousRevenue: z.number(),
    }),
  ),
});
export type DashboardOverview = z.infer<typeof dashboardOverviewSchema>;

export const dashboardOverviewQuerySchema = z.object({
  days: z.coerce
    .number()
    .int()
    .refine((d) => [30, 90, 180, 365].includes(d), 'days must be 30, 90, 180 or 365')
    .default(90),
});
