import { formatNumber, MOVEMENT_LABELS, MOVEMENT_TYPES } from '@stockroom/shared';
import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { History } from 'lucide-react';
import { z } from 'zod';
import { LoadMore } from '@/components/data-table/pagination';
import {
  ClearFilters,
  DensityToggle,
  FilterMenu,
  SearchInput,
  Toolbar,
} from '@/components/data-table/toolbar';
import { EmptyState, ErrorState } from '@/components/feedback/states';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/misc';
import { useWarehouses } from '@/features/catalog/api';
import { MovementRows, MovementsHead } from '@/features/products/detail-tabs';
import { movementsQuery } from '@/features/stock/api';
import { ActorLabel } from '@/components/domain/status';
import { dateTime } from '@/lib/format';
import { cleanSearch, enumListParam, idParam, textParam } from '@/lib/list-search';
import { cn } from '@/lib/utils';

const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional()
  .catch(undefined);
const searchSchema = z.object({
  q: textParam,
  warehouseId: idParam,
  type: enumListParam(MOVEMENT_TYPES),
  from: day,
  to: day,
});
type Search = z.infer<typeof searchSchema>;

export const Route = createFileRoute('/_app/stock/movements')({
  validateSearch: searchSchema,
  staticData: { title: 'Stock movements' },
  component: MovementsPage,
});

function MovementsPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const warehouses = useWarehouses();
  const query = useInfiniteQuery({ ...movementsQuery(search), placeholderData: keepPreviousData });
  const rows = query.data?.pages.flatMap((p) => p.data) ?? [];
  const setSearch = (patch: Partial<Search>) =>
    void navigate({ search: (prev) => cleanSearch({ ...prev, ...patch }), replace: true });
  const filtered = Boolean(search.q || search.warehouseId || search.type || search.from || search.to);

  return (
    <>
      <Toolbar>
        <SearchInput
          value={search.q}
          onChange={(q) => setSearch({ q })}
          placeholder="Product, SKU, reference or note…"
          className="w-full sm:w-72"
        />
        <FilterMenu
          label="Warehouse"
          multiple={false}
          value={search.warehouseId}
          onChange={(v) => setSearch({ warehouseId: v?.[0] })}
          options={(warehouses.data ?? []).map((w) => ({ value: w.id, label: w.name }))}
        />
        <FilterMenu
          label="Type"
          value={search.type}
          onChange={(v) => setSearch({ type: v as Search['type'] })}
          options={MOVEMENT_TYPES.map((t) => ({ value: t, label: MOVEMENT_LABELS[t] }))}
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
        <div className="ml-auto">
          <DensityToggle />
        </div>
      </Toolbar>

      <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-hairline bg-surface shadow-card">
        {/* Phone */}
        <ul className="divide-y divide-hairline md:hidden">
          {rows.map((m) => (
            <li key={m.id} className="px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{m.product.name}</p>
                  <p className="text-xs text-fg-tertiary">
                    {MOVEMENT_LABELS[m.type]} · {m.warehouse.code} · {dateTime(m.occurredAt)}
                  </p>
                </div>
                <span className={cn('tabular text-sm font-semibold', m.quantity > 0 && 'text-success')}>
                  {m.quantity > 0 ? '+' : '−'}
                  {formatNumber(Math.abs(m.quantity))}
                </span>
              </div>
              <div className="mt-1 flex justify-between text-xs text-fg-secondary">
                <ActorLabel actor={m.actor} />
                <span className="tabular">Balance {formatNumber(m.balanceAfter)}</span>
              </div>
            </li>
          ))}
        </ul>
        {/* Tablet and desktop */}
        <div
          className={cn(
            'hidden min-h-0 flex-1 overflow-auto md:block',
            query.isFetching && !query.isFetchingNextPage && rows.length > 0 && 'opacity-60',
          )}
        >
          <table
            className="w-full min-w-[960px] border-separate border-spacing-0 text-sm"
            aria-label="Stock movements"
          >
            <MovementsHead showProduct />
            <tbody>
              <MovementRows rows={rows} showProduct />
            </tbody>
          </table>
        </div>
        {query.isPending && (
          <div className="flex flex-col gap-2 p-4">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className="h-9" />
            ))}
          </div>
        )}
        {query.isError && !query.data && (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        )}
        {query.data && rows.length === 0 && (
          <EmptyState
            icon={<History strokeWidth={1.75} />}
            title={filtered ? 'No movements match' : 'No movements yet'}
            description={
              filtered
                ? 'Try widening the dates or clearing filters.'
                : 'Receipts, sales, transfers and adjustments appear here.'
            }
          />
        )}
        {rows.length > 0 && (
          <div className="shrink-0 border-t border-hairline">
            <LoadMore
              hasMore={query.hasNextPage}
              loading={query.isFetchingNextPage}
              onLoad={() => void query.fetchNextPage()}
              shown={rows.length}
              noun="movements"
            />
          </div>
        )}
      </div>
    </>
  );
}
