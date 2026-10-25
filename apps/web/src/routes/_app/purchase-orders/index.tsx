import { PO_STATUS_LABELS, PO_STATUSES, type PoListItem } from '@stockroom/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { Bot, Plus, Receipt } from 'lucide-react';
import { useMemo } from 'react';
import { z } from 'zod';
import { columnHelper, DataTable } from '@/components/data-table/data-table';
import { Pagination } from '@/components/data-table/pagination';
import { SavedViews } from '@/components/data-table/saved-views';
import {
  ClearFilters,
  DensityToggle,
  FilterMenu,
  SearchInput,
  Toolbar,
} from '@/components/data-table/toolbar';
import { ActorLabel, PoStatusPill } from '@/components/domain/status';
import { ListPage, PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useWarehouses } from '@/features/catalog/api';
import { allSuppliersQuery, purchaseOrdersQuery } from '@/features/purchasing/api';
import { useCan } from '@/lib/auth';
import { date, money } from '@/lib/format';
import { boolParam, cleanSearch, enumListParam, enumParam, idParam, listSearch } from '@/lib/list-search';
import { cn } from '@/lib/utils';

const searchSchema = z.object({
  ...listSearch,
  status: enumListParam(PO_STATUSES),
  supplierId: idParam,
  warehouseId: idParam,
  createdBy: enumParam(['agent', 'user']),
  overdue: boolParam,
});
type Search = z.infer<typeof searchSchema>;

export const Route = createFileRoute('/_app/purchase-orders/')({
  validateSearch: searchSchema,
  staticData: { title: 'Purchase orders' },
  component: PurchaseOrdersPage,
});

const col = columnHelper<PoListItem>();

function PurchaseOrdersPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const can = useCan();
  const suppliers = useQuery(allSuppliersQuery);
  const warehouses = useWarehouses();
  const page = search.page ?? 1;
  const pageSize = search.pageSize ?? 50;
  const query = useQuery({
    ...purchaseOrdersQuery({ ...search, page, pageSize, sort: search.sort ?? 'orderDate:desc' }),
    placeholderData: keepPreviousData,
  });
  const setSearch = (patch: Partial<Search>, keepPage = false) =>
    void navigate({
      search: (prev) => cleanSearch({ ...prev, ...(keepPage ? {} : { page: undefined }), ...patch }),
      replace: true,
    });
  const filtered = Boolean(
    search.q ||
    search.status ||
    search.supplierId ||
    search.warehouseId ||
    search.createdBy ||
    search.overdue,
  );

  const columns = useMemo(
    () => [
      col.accessor('number', {
        id: 'number',
        header: 'Order',
        enableSorting: true,
        meta: { required: true },
        cell: ({ row }) => (
          <span className="flex items-center gap-2 font-medium whitespace-nowrap">
            {row.original.number}
            {row.original.createdBy.type === 'AGENT' && (
              <Badge tone="accent">
                <Bot /> Agent
              </Badge>
            )}
          </span>
        ),
      }),
      col.accessor((p) => p.supplier.name, {
        id: 'supplier',
        header: 'Supplier',
        enableSorting: true,
        cell: ({ row }) => (
          <Link
            to="/suppliers/$id"
            params={{ id: row.original.supplier.id }}
            onClick={(e) => e.stopPropagation()}
            className="hover:underline"
          >
            {row.original.supplier.name}
          </Link>
        ),
      }),
      col.accessor((p) => p.warehouse.code, {
        id: 'warehouse',
        header: 'To',
        cell: (c) => <span className="text-fg-secondary">{c.getValue()}</span>,
      }),
      col.accessor('status', {
        id: 'status',
        header: 'Status',
        enableSorting: true,
        cell: (c) => <PoStatusPill status={c.getValue()} />,
      }),
      col.accessor('orderDate', {
        id: 'orderDate',
        header: 'Ordered',
        enableSorting: true,
        cell: (c) => <span className="text-fg-secondary">{date(c.getValue())}</span>,
      }),
      col.accessor('expectedDate', {
        id: 'expectedDate',
        header: 'Expected',
        enableSorting: true,
        cell: ({ row }) => (
          <span
            className={cn(
              'whitespace-nowrap',
              row.original.overdue ? 'font-medium text-danger' : 'text-fg-secondary',
            )}
          >
            {date(row.original.expectedDate)}
            {row.original.overdue && <span className="block text-xs font-normal">Overdue</span>}
          </span>
        ),
      }),
      col.accessor('receivedRatio', {
        id: 'received',
        header: 'Received',
        meta: { numeric: true },
        cell: ({ row }) => {
          const r = row.original.receivedRatio;
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
        title="Purchase orders"
        description="From draft through approval and sending to receiving. Orders above the approval limit need a manager."
        actions={
          can('purchase_orders.create') && (
            <Button variant="primary" asChild>
              <Link to="/purchase-orders/new">
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
          placeholder="PO number, supplier or product…"
          className="w-full sm:w-64"
        />
        <FilterMenu
          label="Status"
          value={search.status}
          onChange={(v) => setSearch({ status: v as Search['status'] })}
          options={PO_STATUSES.map((s) => ({ value: s, label: PO_STATUS_LABELS[s] }))}
        />
        <FilterMenu
          label="Supplier"
          multiple={false}
          searchable
          value={search.supplierId}
          onChange={(v) => setSearch({ supplierId: v?.[0] })}
          options={(suppliers.data?.data ?? []).map((s) => ({ value: s.id, label: s.name }))}
        />
        <FilterMenu
          label="Warehouse"
          multiple={false}
          value={search.warehouseId}
          onChange={(v) => setSearch({ warehouseId: v?.[0] })}
          options={(warehouses.data ?? []).map((w) => ({ value: w.id, label: w.name }))}
        />
        <FilterMenu
          label="Created by"
          multiple={false}
          value={search.createdBy}
          onChange={(v) => setSearch({ createdBy: v?.[0] as Search['createdBy'] })}
          options={[
            { value: 'agent', label: 'Agents' },
            { value: 'user', label: 'People' },
          ]}
        />
        <Button
          variant="secondary"
          size="sm"
          aria-pressed={Boolean(search.overdue)}
          className={cn(
            'border-dashed',
            search.overdue && 'border-solid border-danger/40 bg-danger-soft text-danger hover:bg-danger-soft',
          )}
          onClick={() => setSearch({ overdue: search.overdue ? undefined : true })}
        >
          Overdue
        </Button>
        <ClearFilters show={filtered} onClear={() => void navigate({ search: {}, replace: true })} />
        <div className="ml-auto flex items-center gap-1">
          <SavedViews
            page="purchase-orders"
            current={search}
            onApply={(state) => void navigate({ search: state as Search })}
          />
          <DensityToggle />
        </div>
      </Toolbar>
      <DataTable
        label="Purchase orders"
        columns={columns}
        data={query.data?.data}
        getRowId={(p) => p.id}
        isLoading={query.isPending}
        isFetching={query.isFetching && !query.isPending}
        error={query.error}
        onRetry={() => void query.refetch()}
        sort={search.sort ?? 'orderDate:desc'}
        onSortChange={(sort) => setSearch({ sort })}
        onRowClick={(p) => void navigate({ to: '/purchase-orders/$id', params: { id: p.id } })}
        empty={{
          icon: <Receipt strokeWidth={1.75} />,
          title: filtered ? 'No orders match' : 'No purchase orders yet',
          action:
            !filtered && can('purchase_orders.create') ? (
              <Button variant="primary" size="sm" asChild>
                <Link to="/purchase-orders/new">New order</Link>
              </Button>
            ) : undefined,
        }}
        renderCard={(p) => (
          <div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium">{p.number}</span>
              <PoStatusPill status={p.status} />
            </div>
            <p className="mt-0.5 truncate text-sm">{p.supplier.name}</p>
            <div className="mt-1 flex justify-between text-xs text-fg-secondary">
              <span className={cn(p.overdue && 'text-danger')}>
                {p.overdue ? 'Overdue · ' : 'Expected '}
                {date(p.expectedDate)}
              </span>
              <span className="tabular font-medium text-fg">{money(p.total)}</span>
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
