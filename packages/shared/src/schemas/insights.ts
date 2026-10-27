import { z } from 'zod';
import { RISK_LEVELS } from './purchasing';

export const INSIGHT_PERIODS = [30, 90, 180, 365] as const;

export const insightsQuerySchema = z.object({
  days: z.coerce
    .number()
    .int()
    .refine((d) => (INSIGHT_PERIODS as readonly number[]).includes(d), 'days must be 30, 90, 180 or 365')
    .default(90),
  warehouseId: z.uuid().optional(),
  categoryId: z.uuid().optional(),
});
export type InsightsQuery = z.infer<typeof insightsQuerySchema>;

const share = z.number();

export const valuationSchema = z.object({
  totals: z.object({
    value: z.number(),
    units: z.number().int(),
    positions: z.number().int(),
    products: z.number().int(),
  }),
  byCategory: z.array(
    z.object({
      categoryId: z.uuid(),
      category: z.string(),
      value: z.number(),
      units: z.number().int(),
      share,
    }),
  ),
  byWarehouse: z.array(
    z.object({
      warehouseId: z.uuid(),
      code: z.string(),
      name: z.string(),
      value: z.number(),
      units: z.number().int(),
      share,
    }),
  ),
  /** Daily inventory value from nightly snapshots (warehouse filter applies; category filter doesn't). */
  trend: z.array(z.object({ date: z.string(), value: z.number() })),
  topItems: z.array(
    z.object({
      productId: z.uuid(),
      sku: z.string(),
      name: z.string(),
      warehouse: z.string(),
      onHand: z.number().int(),
      value: z.number(),
      daysOfCover: z.number().nullable(),
    }),
  ),
});
export type Valuation = z.infer<typeof valuationSchema>;

export const movementInsightsSchema = z.object({
  totals: z.object({
    inUnits: z.number().int(),
    outUnits: z.number().int(),
    inValue: z.number(),
    outValue: z.number(),
  }),
  byDay: z.array(
    z.object({
      date: z.string(),
      received: z.number().int(),
      sold: z.number().int(),
      transferred: z.number().int(),
      adjusted: z.number().int(),
      writtenOff: z.number().int(),
    }),
  ),
  byType: z.array(
    z.object({
      type: z.string(),
      label: z.string(),
      count: z.number().int(),
      units: z.number().int(),
      value: z.number(),
    }),
  ),
  topOut: z.array(
    z.object({
      productId: z.uuid(),
      sku: z.string(),
      name: z.string(),
      units: z.number().int(),
      value: z.number(),
    }),
  ),
});
export type MovementInsights = z.infer<typeof movementInsightsSchema>;

export const abcXyzSchema = z.object({
  classifiedAt: z.string().nullable(),
  cells: z.array(
    z.object({
      abc: z.enum(['A', 'B', 'C']),
      xyz: z.enum(['X', 'Y', 'Z']),
      products: z.number().int(),
      stockValue: z.number(),
      revenue: z.number(),
      revenueShare: share,
    }),
  ),
  unclassified: z.number().int(),
  totals: z.object({ products: z.number().int(), stockValue: z.number(), revenue: z.number() }),
});
export type AbcXyz = z.infer<typeof abcXyzSchema>;

const turnoverRow = z.object({
  key: z.string(),
  label: z.string(),
  cogs: z.number(),
  inventoryValue: z.number(),
  turnover: z.number().nullable(),
  daysOfInventory: z.number().nullable(),
});
export const turnoverSchema = z.object({
  days: z.number().int(),
  /** Average of the nightly snapshots over the period. */
  overall: turnoverRow,
  /** Against today's stock value (snapshots aren't kept per category). */
  byCategory: z.array(turnoverRow),
  byWarehouse: z.array(turnoverRow),
});
export type Turnover = z.infer<typeof turnoverSchema>;

export const forecastInsightsSchema = z.object({
  generatedAt: z.string().nullable(),
  products: z.number().int(),
  medianWape: z.number().nullable(),
  medianMape: z.number().nullable(),
  byMethod: z.array(
    z.object({ method: z.string(), products: z.number().int(), medianWape: z.number().nullable() }),
  ),
  byCategory: z.array(
    z.object({
      category: z.string(),
      products: z.number().int(),
      medianWape: z.number().nullable(),
      forecastPerDay: z.number(),
    }),
  ),
  buckets: z.array(z.object({ label: z.string(), products: z.number().int() })),
  worst: z.array(
    z.object({
      productId: z.uuid(),
      sku: z.string(),
      name: z.string(),
      method: z.string(),
      pattern: z.string(),
      wape: z.number().nullable(),
      avgDailyDemand: z.number(),
    }),
  ),
  /** Units per day: actual for the last 28 days, forecast (with the 80 % band) for the next 28. */
  series: z.array(
    z.object({
      date: z.string(),
      actual: z.number().nullable(),
      forecast: z.number().nullable(),
      low: z.number().nullable(),
      high: z.number().nullable(),
    }),
  ),
});
export type ForecastInsights = z.infer<typeof forecastInsightsSchema>;

export const supplierInsightsSchema = z.object({
  suppliers: z.array(
    z.object({
      supplierId: z.uuid(),
      code: z.string(),
      name: z.string(),
      score: z.number().nullable(),
      risk: z.enum(RISK_LEVELS).nullable(),
      onTimeRate: z.number().nullable(),
      fillRate: z.number().nullable(),
      avgLeadTimeDays: z.number().nullable(),
      leadTimeCv: z.number().nullable(),
      priceChange: z.number().nullable(),
      rejectionRate: z.number().nullable(),
      overdue: z.number().int(),
      spend: z.number(),
      orders: z.number().int(),
    }),
  ),
});
export type SupplierInsights = z.infer<typeof supplierInsightsSchema>;

export const deadStockSchema = z.object({
  totals: z.object({ deadValue: z.number(), slowValue: z.number(), positions: z.number().int() }),
  items: z.array(
    z.object({
      kind: z.enum(['dead', 'slow']),
      productId: z.uuid(),
      sku: z.string(),
      name: z.string(),
      warehouseId: z.uuid(),
      warehouse: z.string(),
      onHand: z.number().int(),
      value: z.number(),
      daysSinceSale: z.number().int().nullable(),
      coverDays: z.number().nullable(),
      sellingPrice: z.number(),
      costPrice: z.number(),
      suggestedPrice: z.number().nullable(),
    }),
  ),
});
export type DeadStock = z.infer<typeof deadStockSchema>;

export const FORECAST_METHOD_LABELS: Record<string, string> = {
  HOLT_WINTERS: 'Holt-Winters (trend and weekly season)',
  SES: 'Exponential smoothing',
  CROSTON_SBA: 'Croston (SBA), for intermittent demand',
  MOVING_AVERAGE: 'Moving average',
};
export const DEMAND_PATTERN_LABELS: Record<string, string> = {
  SMOOTH: 'Smooth',
  ERRATIC: 'Erratic',
  INTERMITTENT: 'Intermittent',
  LUMPY: 'Lumpy',
};
