import type { ReportDto, ReportListItem, ReportType } from '@stockroom/shared';
import { queryOptions } from '@tanstack/react-query';
import type { Page } from '@/features/products/api';
import { api } from '@/lib/api';
import { toApiQuery } from '@/lib/list-search';
import { useInvalidatingMutation } from '@/lib/mutations';
import { queryKeys } from '@/lib/query-keys';

export const reportsQuery = (search: { page?: number; pageSize?: number; type?: ReportType }) =>
  queryOptions({
    queryKey: queryKeys.reports.list(search),
    queryFn: ({ signal }) => api.get<Page<ReportListItem>>('/reports', toApiQuery(search), signal),
  });

export const reportQuery = (id: string) =>
  queryOptions({
    queryKey: queryKeys.reports.detail(id),
    queryFn: ({ signal }) => api.get<ReportDto>(`/reports/${id}`, undefined, signal),
    // Reports never change once written.
    staleTime: Infinity,
  });

export const latestBriefingQuery = queryOptions({
  queryKey: queryKeys.reports.latest,
  queryFn: ({ signal }) => api.get<ReportDto | null>('/reports/latest', { type: 'DAILY_BRIEFING' }, signal),
});

/** Asks the Report Writer for a report now; it arrives through the report.created event. */
export const useWriteReport = () =>
  useInvalidatingMutation(
    (reportType: ReportType) =>
      api.post<{ runId: string; deduped: boolean }>('/agents/report_writer/run', { reportType }),
    [queryKeys.agents.all, queryKeys.runs.all],
  );
