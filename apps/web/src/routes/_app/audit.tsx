import { ACTOR_TYPES, formatNumber } from '@stockroom/shared';
import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { History } from 'lucide-react';
import { z } from 'zod';
import { LoadMore } from '@/components/data-table/pagination';
import { ClearFilters, FilterMenu, SearchInput, Toolbar } from '@/components/data-table/toolbar';
import { EmptyState, ErrorState } from '@/components/feedback/states';
import { ListPage, PageHeader } from '@/components/layout/page-header';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/misc';
import { auditFacetsQuery, auditQuery } from '@/features/alerts/api';
import { AuditItem } from '@/features/alerts/audit-entry';
import { meQueryOptions } from '@/lib/auth';
import { cleanSearch, enumListParam, idParam, textParam } from '@/lib/list-search';

const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional()
  .catch(undefined);
const searchSchema = z.object({
  q: textParam,
  actorType: enumListParam(ACTOR_TYPES),
  userId: idParam,
  entityType: textParam,
  action: textParam,
  from: day,
  to: day,
});
type Search = z.infer<typeof searchSchema>;

export const Route = createFileRoute('/_app/audit')({
  validateSearch: searchSchema,
  staticData: { title: 'Audit log' },
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData(meQueryOptions);
    if (!me?.permissions.includes('audit.view')) throw redirect({ to: '/' });
  },
  component: AuditPage,
});

const ACTOR_LABELS = { USER: 'People', AGENT: 'Agents', SYSTEM: 'System', SIMULATOR: 'Simulator' } as const;

function AuditPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const facets = useQuery(auditFacetsQuery);
  const query = useInfiniteQuery({ ...auditQuery(search), placeholderData: keepPreviousData });
  const rows = query.data?.pages.flatMap((p) => p.data) ?? [];
  const setSearch = (patch: Partial<Search>) =>
    void navigate({ search: (prev) => cleanSearch({ ...prev, ...patch }), replace: true });
  const filtered = Object.values(search).some((v) => v !== undefined);

  return (
    <ListPage>
      <PageHeader
        title="Audit log"
        description="Every change, by people, agents and the system, with before and after values."
      />
      <Toolbar>
        <SearchInput
          value={search.q}
          onChange={(q) => setSearch({ q })}
          placeholder="Search summaries…"
          className="w-full sm:w-64"
        />
        <FilterMenu
          label="Actor"
          value={search.actorType}
          onChange={(v) => setSearch({ actorType: v as Search['actorType'] })}
          options={ACTOR_TYPES.map((t) => ({ value: t, label: ACTOR_LABELS[t] }))}
        />
        <FilterMenu
          label="Person"
          multiple={false}
          searchable
          value={search.userId}
          onChange={(v) => setSearch({ userId: v?.[0] })}
          options={(facets.data?.users ?? []).map((u) => ({ value: u.id, label: u.name }))}
        />
        <FilterMenu
          label="Record"
          multiple={false}
          value={search.entityType}
          onChange={(v) => setSearch({ entityType: v?.[0] })}
          options={(facets.data?.entityTypes ?? []).map((t) => ({
            value: t,
            label: t.replace(/([a-z])([A-Z])/g, '$1 $2'),
          }))}
        />
        <FilterMenu
          label="Action"
          multiple={false}
          searchable
          value={search.action}
          onChange={(v) => setSearch({ action: v?.[0] })}
          options={(facets.data?.actions ?? []).map((a) => ({ value: a, label: a }))}
        />
        <div className="flex items-center gap-1.5 text-sm text-fg-secondary">
          <Input
            type="date"
            aria-label="From date"
            value={search.from ?? ''}
            onChange={(e) => setSearch({ from: e.target.value || undefined })}
            className="h-8 w-[140px]"
          />
          <span>to</span>
          <Input
            type="date"
            aria-label="To date"
            value={search.to ?? ''}
            onChange={(e) => setSearch({ to: e.target.value || undefined })}
            className="h-8 w-[140px]"
          />
        </div>
        <ClearFilters show={filtered} onClear={() => void navigate({ search: {}, replace: true })} />
      </Toolbar>
      <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-hairline bg-surface shadow-card">
        <div className="min-h-0 flex-1 overflow-auto">
          {query.isPending ? (
            <div className="flex flex-col gap-3 p-5">
              {Array.from({ length: 8 }, (_, i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          ) : query.isError && !query.data ? (
            <ErrorState error={query.error} onRetry={() => void query.refetch()} />
          ) : rows.length === 0 ? (
            <EmptyState
              icon={<History strokeWidth={1.75} />}
              title={filtered ? 'Nothing matches' : 'No changes recorded yet'}
            />
          ) : (
            <ul className="divide-y divide-hairline" aria-label="Audit entries">
              {rows.map((e) => (
                <AuditItem key={e.id} entry={e} showEntity />
              ))}
            </ul>
          )}
        </div>
        {rows.length > 0 && (
          <div className="shrink-0 border-t border-hairline">
            <LoadMore
              hasMore={query.hasNextPage}
              loading={query.isFetchingNextPage}
              onLoad={() => void query.fetchNextPage()}
              shown={rows.length}
              noun={`entr${rows.length === 1 ? 'y' : 'ies'}`}
            />
          </div>
        )}
      </div>
      <p className="sr-only" aria-live="polite">
        {query.data ? `${formatNumber(rows.length)} entries shown` : ''}
      </p>
    </ListPage>
  );
}
