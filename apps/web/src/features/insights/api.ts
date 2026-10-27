import type {
  AbcXyz,
  DeadStock,
  ForecastInsights,
  MovementInsights,
  SupplierInsights,
  Turnover,
  Valuation,
} from '@stockroom/shared';
import { queryOptions } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { toApiQuery } from '@/lib/list-search';
import { queryKeys } from '@/lib/query-keys';

export interface InsightFilters {
  days: number;
  warehouseId?: string;
  categoryId?: string;
}

interface Sections {
  valuation: Valuation;
  movements: MovementInsights;
  'abc-xyz': AbcXyz;
  turnover: Turnover;
  forecast: ForecastInsights;
  suppliers: SupplierInsights;
  'dead-stock': DeadStock;
}
export type InsightSection = keyof Sections;
export type InsightData<K extends InsightSection> = Sections[K];

export const insightQuery = <K extends InsightSection>(section: K, filters: InsightFilters) =>
  queryOptions({
    queryKey: queryKeys.insights.section(section, filters),
    queryFn: ({ signal }) => api.get<Sections[K]>(`/insights/${section}`, toApiQuery({ ...filters }), signal),
    // Analytics move slowly; live events refresh them when stock or forecasts change.
    staleTime: 60_000,
  });
