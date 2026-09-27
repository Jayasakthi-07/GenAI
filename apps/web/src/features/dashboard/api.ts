import type { DashboardOverview } from '@stockroom/shared';
import { queryOptions } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';

export const dashboardOverviewQuery = (days: number) =>
  queryOptions({
    queryKey: queryKeys.dashboard.overview(days),
    queryFn: ({ signal }) => api.get<DashboardOverview>('/dashboard/overview', { days }, signal),
    staleTime: 60_000,
  });
