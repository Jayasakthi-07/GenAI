import {
  formatDays,
  formatNumber,
  STOCK_STATE_LABELS,
  STOCK_STATE_TONES,
  STOCK_STATES,
  type StockPosition,
  type StockState,
} from '@stockroom/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { Boxes, PackageSearch } from 'lucide-react';
import { useMemo } from 'react';
import { z } from 'zod';
import { columnHelper, DataTable } from '@/components/data-table/data-table';
import { Pagination } from '@/components/data-table/pagination';
import {
  ClearFilters,
  ColumnsMenu,
  DensityToggle,
  FilterMenu,
  SearchInput,
  Toolbar,
  useColumnVisibility,
} from '@/components/data-table/toolbar';
import { StockStatePill } from '@/components/domain/status';
import { Button } from '@/components/ui/button';
import { useCategoryTree, useWarehouses } from '@/features/catalog/api';
import { positionsQuery, stockSummaryQuery } from '@/features/stock/api';
import { ago, money } from '@/lib/format';
import { cleanSearch, enumListParam, idParam, listSearch } from '@/lib/list-search';
import { cn } from '@/lib/utils';

const searchSchema = z.object({
  ...listSearch,
  warehouseId: idParam,
  categoryId: idParam,
  state: enumListParam(STOCK_STATES),
});
type Search = z.infer<typeof searchSchema>;

export const Route = createFileRoute('/_app/stock/')({
  validateSearch: searchSchema,
  staticData: { title: 'Stock levels' },
  component: StockLevelsPage,
});

const col = columnHelper<StockPosition>();
const TONE_RING: Record<string, string> = {
  danger: 'data-[on=true]:border-danger data-[on=true]:bg-danger-soft',
  warning: 'data-[on=true]:border-warning data-[on=true]:bg-warning-soft',
  accent: 'data-[on=true]:border-accent data-[on=true]:bg-accent-soft',
  success: 'data-[on=true]:border-success data-[on=true]:bg-success-soft',
  neutral: 'data-[on=true]:border-hairline-strong data-[on=true]:bg-neutral-soft',
};
const DOT: Record<string, string> = {
  danger: 'bg-danger',
  warning: 'bg-warning',
  accent: 'bg-accent',
  success: 'bg-success',
  neutral: 'bg-fg-tertiary',
};

function StockLevelsPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const page = search.page ?? 1;
  const pageSize = search.pageSize ?? 50;
  const query = useQuery({
    ...positionsQuery({ ...search, page, pageSize }),
    placeholderData: keepPreviousData,
  });
  const summary = useQuery(stockSummaryQuery(search.warehouseId));
  const warehouses = useWarehouses();
  const categories = useCategoryTree();
  const [visibility, setVisibility] = useColumnVisibility('stock-levels', {
    reserved: false,
    lastMovementAt: false,
  });
  const setSearch = (patch: Partial<Search>, keepPage = false) =>
    void navigate({
      search: (prev) => cleanSearch({ ...prev, ...(keepPage ? {} : { page: undefined }), ...patch }),
      replace: true,
    });
  const filtered = Boolean(search.q || search.warehouseId || search.categoryId || search.state);

  const toggleState = (s: StockState) => {
    const current = search.state ?? [];
    const next = current.includes(s) ? current.filter((x) => x !== s) : [...current, s];
    setSearch({ state: next.length ? next : undefined });
  };

  const columns = useMemo(
    () => [
      col.accessor((r) => r.product.name, {
        id: 'product',
        header: 'Product',
        enableSorting: true,
        meta: { required: true, className: 'min-w-60' },
        cell: ({ row }) => (
          <div className="min-w-0">
            <Link
              to="/products/$id"
              params={{ id: row.original.product.id }}
              search={{ tab: 'stock' }}
              onClick={(e) => e.stopPropagation()}
              className="block truncate font-medium hover:underline"
            >
              {row.original.product.name}
            </Link>
            <p className="truncate text-xs text-fg-tertiary">
              {row.original.product.sku} · {row.original.product.category}
            </p>
          </div>
        ),
      }),
      col.accessor((r) => r.warehouse.code, {
        id: 'warehouse',
        header: 'Warehouse',
        enableSorting: true,
        cell: (c) => <span className="text-fg-secondary">{c.getValue()}</span>,
      }),
      col.accessor('state', {
        id: 'state',
        header: 'Status',
        cell: (c) => <StockStatePill state={c.getValue()} />,
      }),
      col.accessor('onHand', {
        id: 'onHand',
        header: 'On hand',
        enableSorting: true,
        meta: { numeric: true },
        cell: (c) => formatNumber(c.getValue()),
      }),
      col.accessor('reserved', {
        id: 'reserved',
        header: 'Reserved',
        meta: { numeric: true },
        cell: (c) => (c.getValue() ? formatNumber(c.getValue()) : '—'),
      }),
      col.accessor('available', {
        id: 'available',
        header: 'Available',
        enableSorting: true,
        meta: { numeric: true },
        cell: (c) => <span className="font-medium">{formatNumber(c.getValue())}</span>,
      }),
      col.accessor('onOrder', {
        id: 'onOrder',
        header: 'On order',
        meta: { numeric: true },
        cell: (c) =>
          c.getValue() ? formatNumber(c.getValue()) : <span className="text-fg-tertiary">—</span>,
      }),
      col.accessor('reorderPoint', {
        id: 'reorderPoint',
        header: 'Reorder at',
        meta: { numeric: true },
        cell: (c) => c.getValue() ?? <span className="text-fg-tertiary">—</span>,
      }),
      col.accessor('daysOfCover', {
        id: 'daysOfCover',
        header: 'Cover',
        enableSorting: true,
        meta: { numeric: true },
        cell: ({ row }) =>
          row.original.daysOfCover === null ? (
            <span className="text-fg-tertiary">—</span>
          ) : (
            <span
              className={cn(
                row.original.daysOfCover < 7 && 'text-danger',
                row.original.daysOfCover >= 7 && row.original.daysOfCover < 14 && 'text-warning',
              )}
            >
              {formatDays(row.original.daysOfCover)}
            </span>
          ),
      }),
      col.accessor('value', {
        id: 'value',
        header: 'Value',
        enableSorting: true,
        meta: { numeric: true },
        cell: (c) => money(c.getValue()),
      }),
      col.accessor('lastMovementAt', {
        id: 'lastMovementAt',
        header: 'Last movement',
        enableSorting: true,
        cell: (c) => <span className="text-fg-secondary">{ago(c.getValue())}</span>,
      }),
    ],
    [],
  );

  return (
    <>
      <div className="mb-3 flex shrink-0 gap-2 overflow-x-auto pb-1">
        {STOCK_STATES.map((s) => {
          const tone = STOCK_STATE_TONES[s];
          const on = search.state?.includes(s) ?? false;
          return (
            <button
              key={s}
              type="button"
              data-on={on}
              aria-pressed={on}
              onClick={() => toggleState(s)}
              className={cn(
                'flex min-w-32 shrink-0 flex-col items-start rounded-lg border border-hairline bg-surface px-3.5 py-2.5 text-left shadow-card transition-colors hover:border-hairline-strong',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]',
                TONE_RING[tone],
              )}
            >
              <span className="flex items-center gap-1.5 text-xs font-medium text-fg-secondary">
                <span className={cn('size-1.5 rounded-full', DOT[tone])} aria-hidden />
                {STOCK_STATE_LABELS[s]}
              </span>
              <span className="mt-0.5 tabular text-xl font-semibold tracking-tight">
                {summary.data ? formatNumber(summary.data.byState[s]) : '–'}
              </span>
            </button>
          );
        })}
        {summary.data && (
          <div className="ml-auto hidden shrink-0 flex-col items-end justify-center px-2 text-right lg:flex">
            <span className="text-xs text-fg-secondary">Stock value</span>
            <span className="tabular text-xl font-semibold tracking-tight">
              {money(summary.data.totalValue)}
            </span>
            <span className="tabular text-xs text-fg-tertiary">
              {formatNumber(summary.data.totalUnits)} units
            </span>
          </div>
        )}
      </div>

      <Toolbar>
        <SearchInput
          value={search.q}
          onChange={(q) => setSearch({ q })}
          placeholder="Search product, SKU or barcode…"
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
          label="Category"
          multiple={false}
          searchable
          value={search.categoryId}
          onChange={(v) => setSearch({ categoryId: v?.[0] })}
          options={categories.flat.map((c) => ({ value: c.id, label: c.path }))}
        />
        <ClearFilters show={filtered} onClear={() => void navigate({ search: {}, replace: true })} />
        <div className="ml-auto flex items-center gap-1">
          <ColumnsMenu
            columns={[
              { id: 'warehouse', label: 'Warehouse' },
              { id: 'state', label: 'Status' },
              { id: 'onHand', label: 'On hand' },
              { id: 'reserved', label: 'Reserved' },
              { id: 'available', label: 'Available' },
              { id: 'onOrder', label: 'On order' },
              { id: 'reorderPoint', label: 'Reorder at' },
              { id: 'daysOfCover', label: 'Cover' },
              { id: 'value', label: 'Value' },
              { id: 'lastMovementAt', label: 'Last movement' },
            ]}
            visibility={visibility}
            onChange={setVisibility}
          />
          <DensityToggle />
        </div>
      </Toolbar>

      <DataTable
        label="Stock levels"
        columns={columns}
        data={query.data?.data}
        getRowId={(r) => r.id}
        isLoading={query.isPending}
        isFetching={query.isFetching && !query.isPending}
        error={query.error}
        onRetry={() => void query.refetch()}
        sort={search.sort}
        onSortChange={(sort) => setSearch({ sort })}
        columnVisibility={visibility}
        onColumnVisibilityChange={setVisibility}
        onRowClick={(r) =>
          void navigate({ to: '/products/$id', params: { id: r.product.id }, search: { tab: 'stock' } })
        }
        empty={
          filtered
            ? {
                icon: <PackageSearch strokeWidth={1.75} />,
                title: 'Nothing matches',
                action: (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => void navigate({ search: {}, replace: true })}
                  >
                    Clear filters
                  </Button>
                ),
              }
            : {
                icon: <Boxes strokeWidth={1.75} />,
                title: 'No stock recorded yet',
                description: 'Receive stock or a purchase order to see levels here.',
              }
        }
        renderCard={(r) => (
          <div>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{r.product.name}</p>
                <p className="truncate text-xs text-fg-tertiary">
                  {r.product.sku} · {r.warehouse.code}
                </p>
              </div>
              <StockStatePill state={r.state} />
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-fg-secondary">
              <span>
                Available{' '}
                <span className="block tabular text-sm font-medium text-fg">{formatNumber(r.available)}</span>
              </span>
              <span>
                On order <span className="block tabular text-sm text-fg">{formatNumber(r.onOrder)}</span>
              </span>
              <span>
                Cover{' '}
                <span className="block tabular text-sm text-fg">
                  {r.daysOfCover === null ? '—' : formatDays(r.daysOfCover)}
                </span>
              </span>
            </div>
          </div>
        )}
        footer={
          <Pagination
            page={page}
            pageSize={pageSize}
            total={query.data?.meta.total}
            noun="positions"
            onPageChange={(p) => setSearch({ page: p }, true)}
            onPageSizeChange={(s) => setSearch({ pageSize: s })}
          />
        }
      />
    </>
  );
}
