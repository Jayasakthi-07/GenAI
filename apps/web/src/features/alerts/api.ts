import type {
  Alert,
  AlertBulk,
  AlertCounts,
  AuditEntry,
  AuditFacets,
  StockCheckResult,
} from '@stockroom/shared';
import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query';
import type { CursorPage, Page } from '@/features/products/api';
import { api } from '@/lib/api';
import { toApiQuery } from '@/lib/list-search';
import { useInvalidatingMutation } from '@/lib/mutations';
import { queryKeys } from '@/lib/query-keys';

export const alertsQuery = (search: Record<string, unknown>) =>
  queryOptions({
    queryKey: queryKeys.alerts.list(search),
    queryFn: ({ signal }) => api.get<Page<Alert>>('/alerts', toApiQuery(search), signal),
  });
export const alertCountsQuery = queryOptions({
  queryKey: queryKeys.alerts.counts,
  queryFn: ({ signal }) => api.get<AlertCounts>('/alerts/counts', undefined, signal),
  refetchInterval: 60_000,
});

const alertKeys = [queryKeys.alerts.all, queryKeys.dashboard.all, queryKeys.audit.all] as const;
export const useAlertBulk = () =>
  useInvalidatingMutation(
    (input: AlertBulk) => api.post<{ updated: number }>('/alerts/bulk', input),
    alertKeys,
  );
export const useRunStockCheck = () =>
  useInvalidatingMutation(() => api.post<StockCheckResult>('/alerts/check'), alertKeys);

export const auditQuery = (search: Record<string, unknown>) =>
  infiniteQueryOptions({
    queryKey: queryKeys.audit.list(search),
    queryFn: ({ pageParam, signal }) =>
      api.get<CursorPage<AuditEntry>>(
        '/audit-log',
        toApiQuery({ ...search, cursor: pageParam, limit: 50 }),
        signal,
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
export const auditFacetsQuery = queryOptions({
  queryKey: queryKeys.audit.facets,
  queryFn: ({ signal }) => api.get<AuditFacets>('/audit-log/facets', undefined, signal),
  staleTime: 5 * 60_000,
});
