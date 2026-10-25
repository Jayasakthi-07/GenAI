import {
  SALES_CHANNEL_LABELS,
  SALES_CHANNELS,
  SO_STATUS_LABELS,
  SO_STATUSES,
  type SoListItem,
} from '@stockroom/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { Plus, ShoppingCart } from 'lucide-react';
import { useMemo } from 'react';
import { z } from 'zod';
import { columnHelper, DataTable } from '@/components/data-table/data-table';
import { Pagination } from '@/components/data-table/pagination';
import {
  ClearFilters,
  DensityToggle,
  FilterMenu,
  SearchInput,
  Toolbar,
} from '@/components/data-table/toolbar';
import { ActorLabel, SoStatusPill } from '@/components/domain/status';
import { ListPage, PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { useWarehouses } from '@/features/catalog/api';
import { allCustomersQuery, salesOrdersQuery } from '@/features/sales/api';
import { useCan } from '@/lib/auth';
import { date, money } from '@/lib/format';
import { cleanSearch, enumListParam, idParam, listSearch } from '@/lib/list-search';
import { cn } from '@/lib/utils';

const searchSchema = z.object({
  ...listSearch,
  status: enumListParam(SO_STATUSES),
  channel: enumListParam(SALES_CHANNELS),
  customerId: idParam,
  warehouseId: idParam,
});
type Search = z.infer<typeof searchSchema>;

export const Route = createFileRoute('/_app/sales-orders/')({
  validateSearch: searchSchema,
  staticData: { title: 'Sales orders' },
  component: SalesOrdersPage,
});

const col = columnHelper<SoListItem>();

function SalesOrdersPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const can = useCan();
  const customers = useQuery(allCustomersQuery);
  const warehouses = useWarehouses();
  const page = search.page ?? 1;
  const pageSize = search.pageSize ?? 50;
  const query = useQuery({
    ...salesOrdersQuery({ ...search, page, pageSize, sort: search.sort ?? 'orderDate:desc' }),
    placeholderData: keepPreviousData,
  });
  const setSearch = (patch: Partial<Search>, keepPage = false) =>
    void navigate({
      search: (prev) => cleanSearch({ ...prev, ...(keepPage ? {} : { page: undefined }), ...patch }),
      replace: true,
    });
  const filtered = Boolean(
    search.q || search.status || search.channel || search.customerId || search.warehouseId,
  );

  const columns = useMemo(
    () => [
      col.accessor('number', {
        id: 'number',
        header: 'Order',
        enableSorting: true,
        meta: { required: true },
        cell: (c) => <span className="font-medium">{c.getValue()}</span>,
      }),
      col.accessor((s) => s.customer?.name ?? 'Walk-in', {
        id: 'customer',
        header: 'Customer',
        enableSorting: true,
      }),
      col.accessor('channel', {
        id: 'channel',
        header: 'Channel',
        cell: (c) => <span className="text-fg-secondary">{SALES_CHANNEL_LABELS[c.getValue()]}</span>,
      }),
      col.accessor((s) => s.warehouse.code, {
        id: 'warehouse',
        header: 'From',
        cell: (c) => <span className="text-fg-secondary">{c.getValue()}</span>,
      }),
      col.accessor('status', {
        id: 'status',
        header: 'Status',
        enableSorting: true,
        cell: (c) => <SoStatusPill status={c.getValue()} />,
      }),
      col.accessor('orderDate', {
        id: 'orderDate',
        header: 'Ordered',
        enableSorting: true,
        cell: (c) => <span className="text-fg-secondary">{date(c.getValue())}</span>,
      }),
      col.accessor('fulfilledRatio', {
        id: 'fulfilled',
        header: 'Shipped',
        meta: { numeric: true },
        cell: ({ row }) => {
          const r = row.original.fulfilledRatio;
          return (
            <span className="inline-flex items-center gap-2">
              <span className="h-1.5 w-14 overflow-hidden rounded-full bg-neutral-soft" aria-hidden>
                <span
                  className={cn('block h-full rounded-full', r >= 1 ? 'bg-success' : 'bg-accent')}
                  style={{ width: `${Math.min(1, r) * 100}%` }}
                />
              </span>
              <span className="w-9 text-right text-xs text-fg-secondary">{Math.round(r * 100)}%</span>
            </span>
          );
        },
      }),
      col.accessor('total', {
        id: 'total',
        header: 'Total',
        enableSorting: true,
        meta: { numeric: true },
        cell: (c) => <span className="font-medium">{money(c.getValue())}</span>,
      }),
      col.accessor('createdBy', {
        id: 'createdBy',
        header: 'By',
        cell: (c) => <ActorLabel actor={c.getValue()} className="text-fg-secondary" />,
      }),
    ],
    [],
  );

  return (
    <ListPage>
      <PageHeader
        title="Sales orders"
        description="Confirming an order reserves stock; fulfilling it ships the earliest-expiring batches first."
        actions={
          can('sales_orders.create') && (
            <Button variant="primary" asChild>
              <Link to="/sales-orders/new">
                <Plus strokeWidth={1.75} /> New order
              </Link>
            </Button>
          )
        }
      />
      <Toolbar>
        <SearchInput
          value={search.q}
          onChange={(q) => setSearch({ q })}
          placeholder="SO number or customer…"
          className="w-full sm:w-60"
        />
        <FilterMenu
          label="Status"
          value={search.status}
          onChange={(v) => setSearch({ status: v as Search['status'] })}
          options={SO_STATUSES.map((s) => ({ value: s, label: SO_STATUS_LABELS[s] }))}
        />
        <FilterMenu
          label="Channel"
          value={search.channel}
          onChange={(v) => setSearch({ channel: v as Search['channel'] })}
          options={SALES_CHANNELS.map((s) => ({ value: s, label: SALES_CHANNEL_LABELS[s] }))}
        />
        <FilterMenu
          label="Customer"
          multiple={false}
          searchable
          value={search.customerId}
          onChange={(v) => setSearch({ customerId: v?.[0] })}
          options={(customers.data?.data ?? []).map((c) => ({ value: c.id, label: c.name }))}
        />
        <FilterMenu
          label="Warehouse"
          multiple={false}
          value={search.warehouseId}
          onChange={(v) => setSearch({ warehouseId: v?.[0] })}
          options={(warehouses.data ?? []).map((w) => ({ value: w.id, label: w.name }))}
        />
        <ClearFilters show={filtered} onClear={() => void navigate({ search: {}, replace: true })} />
        <div className="ml-auto">
          <DensityToggle />
        </div>
      </Toolbar>
      <DataTable
        label="Sales orders"
        columns={columns}
        data={query.data?.data}
        getRowId={(s) => s.id}
        isLoading={query.isPending}
        isFetching={query.isFetching && !query.isPending}
        error={query.error}
        onRetry={() => void query.refetch()}
        sort={search.sort ?? 'orderDate:desc'}
        onSortChange={(sort) => setSearch({ sort })}
        onRowClick={(s) => void navigate({ to: '/sales-orders/$id', params: { id: s.id } })}
        empty={{
          icon: <ShoppingCart strokeWidth={1.75} />,
          title: filtered ? 'No orders match' : 'No sales orders yet',
        }}
        renderCard={(s) => (
          <div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium">{s.number}</span>
              <SoStatusPill status={s.status} />
            </div>
            <p className="mt-0.5 truncate text-sm">{s.customer?.name ?? 'Walk-in'}</p>
            <div className="mt-1 flex justify-between text-xs text-fg-secondary">
              <span>
                {SALES_CHANNEL_LABELS[s.channel]} · {date(s.orderDate)}
              </span>
              <span className="tabular font-medium text-fg">{money(s.total)}</span>
            </div>
          </div>
        )}
        footer={
          <Pagination
            page={page}
            pageSize={pageSize}
            total={query.data?.meta.total}
            noun="orders"
            onPageChange={(p) => setSearch({ page: p }, true)}
            onPageSizeChange={(s) => setSearch({ pageSize: s })}
          />
        }
      />
    </ListPage>
  );
}
