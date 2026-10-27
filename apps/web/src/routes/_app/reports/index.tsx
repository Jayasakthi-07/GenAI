import { REPORT_TYPE_LABELS, REPORT_TYPES, type ReportType } from '@stockroom/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { CalendarDays, CalendarRange, ChevronRight, FileText } from 'lucide-react';
import { z } from 'zod';
import { Pagination } from '@/components/data-table/pagination';
import { EmptyState, ErrorState } from '@/components/feedback/states';
import { Page, PageHeader } from '@/components/layout/page-header';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/misc';
import { SegmentedControl } from '@/components/ui/tabs';
import { reportsQuery } from '@/features/reports/api';
import { ReportSource } from '@/features/reports/report-view';
import { WriteReportButton } from '@/features/reports/write-report-button';
import { ago, dateTime } from '@/lib/format';
import { cleanSearch, enumParam, pageParam } from '@/lib/list-search';

const searchSchema = z.object({ type: enumParam(REPORT_TYPES), page: pageParam });

export const Route = createFileRoute('/_app/reports/')({
  validateSearch: searchSchema,
  staticData: { title: 'Reports' },
  component: ReportsPage,
});

const PAGE_SIZE = 25;

function ReportsPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const page = search.page ?? 1;
  const query = useQuery({
    ...reportsQuery({ type: search.type, page, pageSize: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });
  const setSearch = (patch: Partial<z.infer<typeof searchSchema>>) =>
    void navigate({ search: (prev) => cleanSearch({ ...prev, page: undefined, ...patch }), replace: true });

  return (
    <Page className="max-w-5xl">
      <PageHeader
        title="Reports"
        description="Daily briefings and weekly summaries from the Report Writer. Every figure comes from Stockroom; the model only writes the story around them."
        actions={<WriteReportButton />}
      />
      <div className="mb-4">
        <SegmentedControl
          aria-label="Report type"
          value={search.type ?? 'ALL'}
          onValueChange={(v: string) => setSearch({ type: v === 'ALL' ? undefined : (v as ReportType) })}
          options={[
            { value: 'ALL', label: 'All' },
            { value: 'DAILY_BRIEFING', label: 'Daily' },
            { value: 'WEEKLY_SUMMARY', label: 'Weekly' },
          ]}
        />
      </div>

      <Card className="overflow-hidden">
        {query.isPending ? (
          <ul className="divide-y divide-hairline">
            {[0, 1, 2, 3].map((i) => (
              <li key={i} className="flex flex-col gap-2 px-5 py-4">
                <Skeleton className="h-4 w-64" />
                <Skeleton className="h-3.5 w-full max-w-xl" />
              </li>
            ))}
          </ul>
        ) : query.isError ? (
          <ErrorState
            error={query.error}
            onRetry={() => void query.refetch()}
            title="Couldn’t load reports"
          />
        ) : query.data.data.length === 0 ? (
          <EmptyState
            icon={<FileText strokeWidth={1.75} />}
            title={search.type ? `No ${REPORT_TYPE_LABELS[search.type].toLowerCase()} yet` : 'No reports yet'}
            description="The Report Writer writes a daily briefing each morning and a summary every Monday. You can also ask for one now."
            action={<WriteReportButton variant="secondary" />}
          />
        ) : (
          <ul className="divide-y divide-hairline">
            {query.data.data.map((r) => (
              <li key={r.id}>
                <Link
                  to="/reports/$id"
                  params={{ id: r.id }}
                  className="flex items-start gap-4 px-5 py-4 transition-colors hover:bg-neutral-soft focus-visible:bg-neutral-soft focus-visible:outline-none"
                >
                  <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent-text">
                    {r.type === 'WEEKLY_SUMMARY' ? (
                      <CalendarRange className="size-4" strokeWidth={1.75} />
                    ) : (
                      <CalendarDays className="size-4" strokeWidth={1.75} />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-medium">{r.title}</span>
                      <ReportSource report={r} />
                    </span>
                    {r.excerpt && (
                      <span className="mt-1 line-clamp-2 block text-sm text-fg-secondary">{r.excerpt}</span>
                    )}
                    <span className="mt-1 block text-xs text-fg-tertiary" title={dateTime(r.createdAt)}>
                      {REPORT_TYPE_LABELS[r.type]} · written {ago(r.createdAt)}
                    </span>
                  </span>
                  <ChevronRight className="mt-2 size-4 shrink-0 text-fg-tertiary" strokeWidth={1.75} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {query.data && query.data.meta.total > PAGE_SIZE && (
        <div className="mt-3">
          <Pagination
            page={page}
            pageSize={PAGE_SIZE}
            total={query.data.meta.total}
            onPageChange={(p) => void navigate({ search: (prev) => ({ ...prev, page: p }) })}
            noun="reports"
          />
        </div>
      )}
    </Page>
  );
}
