import {
  formatNumber,
  TRANSFER_STATUS_LABELS,
  TRANSFER_STATUSES,
  type TransferListItem,
} from '@stockroom/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { ArrowLeftRight, ArrowRight, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { z } from 'zod';
import { columnHelper, DataTable } from '@/components/data-table/data-table';
import { Pagination } from '@/components/data-table/pagination';
import { ClearFilters, DensityToggle, FilterMenu, Toolbar } from '@/components/data-table/toolbar';
import { ActorLabel, TransferStatusPill } from '@/components/domain/status';
import { ListPage, PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { useWarehouses } from '@/features/catalog/api';
import { transfersQuery } from '@/features/operations/api';
import { NewTransferDialog } from '@/features/operations/transfer-dialog';
import { useCan } from '@/lib/auth';
import { date } from '@/lib/format';
import { cleanSearch, enumListParam, idParam, pageParam, pageSizeParam } from '@/lib/list-search';

const searchSchema = z.object({
  page: pageParam,
  pageSize: pageSizeParam,
  status: enumListParam(TRANSFER_STATUSES),
  warehouseId: idParam,
});
type Search = z.infer<typeof searchSchema>;

export const Route = createFileRoute('/_app/transfers/')({
  validateSearch: searchSchema,
  staticData: { title: 'Transfers' },
  component: TransfersPage,
});

const col = columnHelper<TransferListItem>();

function TransfersPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const can = useCan();
  const warehouses = useWarehouses();
  const [creating, setCreating] = useState(false);
  const page = search.page ?? 1;
  const pageSize = search.pageSize ?? 50;
  const query = useQuery({
    ...transfersQuery({ ...search, page, pageSize }),
    placeholderData: keepPreviousData,
  });
  const setSearch = (patch: Partial<Search>, keepPage = false) =>
    void navigate({
      search: (prev) => cleanSearch({ ...prev, ...(keepPage ? {} : { page: undefined }), ...patch }),
      replace: true,
    });
  const filtered = Boolean(search.status || search.warehouseId);

  const columns = useMemo(
    () => [
      col.accessor('number', {
        id: 'number',
        header: 'Transfer',
        meta: { required: true },
        cell: (c) => <span className="font-medium">{c.getValue()}</span>,
      }),
      col.display({
        id: 'route',
        header: 'Route',
        cell: ({ row }) => (
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
            {row.original.from.name}
            <ArrowRight className="size-3.5 text-fg-tertiary" strokeWidth={1.75} />
            {row.original.to.name}
          </span>
        ),
      }),
      col.accessor('status', {
        id: 'status',
        header: 'Status',
        cell: (c) => <TransferStatusPill status={c.getValue()} />,
      }),
      col.accessor('totalUnits', {
        id: 'units',
        header: 'Units',
        meta: { numeric: true },
        cell: ({ row }) => (
          <span>
            {formatNumber(row.original.totalUnits)}
            <span className="block text-xs text-fg-tertiary">
              {row.original.lineCount} {row.original.lineCount === 1 ? 'product' : 'products'}
            </span>
          </span>
        ),
      }),
      col.accessor('createdAt', {
        id: 'createdAt',
        header: 'Created',
        cell: (c) => <span className="text-fg-secondary">{date(c.getValue())}</span>,
      }),
      col.accessor('shippedAt', {
        id: 'shippedAt',
        header: 'Shipped',
        cell: (c) => <span className="text-fg-secondary">{date(c.getValue())}</span>,
      }),
      col.accessor('receivedAt', {
        id: 'receivedAt',
        header: 'Received',
        cell: (c) => <span className="text-fg-secondary">{date(c.getValue())}</span>,
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
        title="Transfers"
        description="Stock moving between warehouses. In-transit stock counts at neither end until it’s received."
        actions={
          can('stock.operate') && (
            <Button variant="primary" onClick={() => setCreating(true)}>
              <Plus strokeWidth={1.75} /> New transfer
            </Button>
          )
        }
      />
      <Toolbar>
        <FilterMenu
          label="Status"
          value={search.status}
          onChange={(v) => setSearch({ status: v as Search['status'] })}
          options={TRANSFER_STATUSES.map((s) => ({ value: s, label: TRANSFER_STATUS_LABELS[s] }))}
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
        label="Transfers"
        columns={columns}
        data={query.data?.data}
        getRowId={(t) => t.id}
        isLoading={query.isPending}
        isFetching={query.isFetching && !query.isPending}
        error={query.error}
        onRetry={() => void query.refetch()}
        onRowClick={(t) => void navigate({ to: '/transfers/$id', params: { id: t.id } })}
        empty={{
          icon: <ArrowLeftRight strokeWidth={1.75} />,
          title: filtered ? 'No transfers match' : 'No transfers yet',
          description: filtered ? undefined : 'Move stock to where it sells.',
          action:
            !filtered && can('stock.operate') ? (
              <Button variant="primary" size="sm" onClick={() => setCreating(true)}>
                New transfer
              </Button>
            ) : undefined,
        }}
        renderCard={(t) => (
          <div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium">{t.number}</span>
              <TransferStatusPill status={t.status} />
            </div>
            <p className="mt-1 text-xs text-fg-secondary">
              {t.from.code} → {t.to.code} · {formatNumber(t.totalUnits)} units · {date(t.createdAt)}
            </p>
          </div>
        )}
        footer={
          <Pagination
            page={page}
            pageSize={pageSize}
            total={query.data?.meta.total}
            noun="transfers"
            onPageChange={(p) => setSearch({ page: p }, true)}
            onPageSizeChange={(s) => setSearch({ pageSize: s })}
          />
        }
      />
      <NewTransferDialog open={creating} onOpenChange={setCreating} />
    </ListPage>
  );
}
