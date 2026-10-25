import { BATCH_STATUSES, type Batch, formatNumber } from '@stockroom/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { CalendarCheck, PackageX } from 'lucide-react';
import { useMemo, useState } from 'react';
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
import { StatusPill } from '@/components/ui/badge';
import { IconButton } from '@/components/ui/button';
import { Tooltip } from '@/components/ui/menus';
import { useWarehouses } from '@/features/catalog/api';
import { batchesQuery } from '@/features/stock/api';
import { StockOperationDialog } from '@/features/stock/operation-dialogs';
import { useCan } from '@/lib/auth';
import { date, money } from '@/lib/format';
import { cleanSearch, enumListParam, idParam, listSearch } from '@/lib/list-search';

const searchSchema = z.object({ ...listSearch, warehouseId: idParam, status: enumListParam(BATCH_STATUSES) });
type Search = z.infer<typeof searchSchema>;

export const Route = createFileRoute('/_app/stock/batches')({
  validateSearch: searchSchema,
  staticData: { title: 'Batches & expiry' },
  component: BatchesPage,
});

const col = columnHelper<Batch>();
const STATUS_LABEL = { EXPIRED: 'Expired', EXPIRING: 'Expiring soon', OK: 'Fresh' } as const;

function ExpiryPill({ batch }: { batch: Batch }) {
  if (batch.status === 'EXPIRED')
    return <StatusPill tone="danger">Expired {Math.abs(batch.daysToExpiry ?? 0)} d ago</StatusPill>;
  if (batch.status === 'EXPIRING')
    return (
      <StatusPill tone="warning">
        {batch.daysToExpiry === 0 ? 'Expires today' : `${batch.daysToExpiry} d left`}
      </StatusPill>
    );
  return (
    <StatusPill tone="success">
      {batch.daysToExpiry !== null ? `${batch.daysToExpiry} d left` : 'No expiry'}
    </StatusPill>
  );
}

function BatchesPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const can = useCan();
  const page = search.page ?? 1;
  const pageSize = search.pageSize ?? 50;
  const query = useQuery({
    ...batchesQuery({ ...search, page, pageSize }),
    placeholderData: keepPreviousData,
  });
  const warehouses = useWarehouses();
  const [writeOff, setWriteOff] = useState<Batch | null>(null);
  const setSearch = (patch: Partial<Search>, keepPage = false) =>
    void navigate({
      search: (prev) => cleanSearch({ ...prev, ...(keepPage ? {} : { page: undefined }), ...patch }),
      replace: true,
    });
  const filtered = Boolean(search.q || search.warehouseId || search.status);

  const columns = useMemo(
    () => [
      col.accessor('batchNo', {
        id: 'batchNo',
        header: 'Batch',
        cell: (c) => <span className="font-mono text-xs">{c.getValue()}</span>,
      }),
      col.accessor((b) => b.product.name, {
        id: 'product',
        header: 'Product',
        meta: { className: 'min-w-56' },
        cell: ({ row }) => (
          <div className="min-w-0">
            <Link
              to="/products/$id"
              params={{ id: row.original.product.id }}
              search={{ tab: 'stock' }}
              className="block truncate font-medium hover:underline"
            >
              {row.original.product.name}
            </Link>
            <p className="text-xs text-fg-tertiary">{row.original.product.sku}</p>
          </div>
        ),
      }),
      col.accessor((b) => b.warehouse.code, {
        id: 'warehouse',
        header: 'Warehouse',
        cell: (c) => <span className="text-fg-secondary">{c.getValue()}</span>,
      }),
      col.accessor('expiryDate', {
        id: 'expiryDate',
        header: 'Expiry',
        enableSorting: true,
        cell: ({ row }) => (
          <span className="flex items-center gap-2 whitespace-nowrap">
            {date(row.original.expiryDate)}
            <ExpiryPill batch={row.original} />
          </span>
        ),
      }),
      col.accessor('quantity', {
        id: 'quantity',
        header: 'Quantity',
        enableSorting: true,
        meta: { numeric: true },
        cell: ({ row }) => (
          <span>
            {formatNumber(row.original.quantity)}{' '}
            <span className="text-xs text-fg-tertiary">{row.original.product.unit}</span>
          </span>
        ),
      }),
      col.accessor('value', {
        id: 'value',
        header: 'Value',
        meta: { numeric: true },
        cell: (c) => money(c.getValue()),
      }),
      col.accessor('receivedAt', {
        id: 'receivedAt',
        header: 'Received',
        enableSorting: true,
        cell: (c) => <span className="text-fg-secondary">{date(c.getValue())}</span>,
      }),
      col.display({
        id: 'actions',
        header: () => <span className="sr-only">Actions</span>,
        meta: { className: 'w-12' },
        cell: ({ row }) =>
          can('stock.write_off') && row.original.status !== 'OK' ? (
            <Tooltip content="Write off">
              <IconButton
                label={`Write off batch ${row.original.batchNo}`}
                size="sm"
                onClick={() => setWriteOff(row.original)}
              >
                <PackageX strokeWidth={1.75} />
              </IconButton>
            </Tooltip>
          ) : null,
      }),
    ],
    [can],
  );

  return (
    <>
      <Toolbar>
        <SearchInput
          value={search.q}
          onChange={(q) => setSearch({ q })}
          placeholder="Batch number, product or SKU…"
          className="w-full sm:w-72"
        />
        <FilterMenu
          label="Expiry"
          value={search.status}
          onChange={(v) => setSearch({ status: v as Search['status'] })}
          options={BATCH_STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] }))}
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
        label="Batches"
        columns={columns}
        data={query.data?.data}
        getRowId={(b) => b.id}
        isLoading={query.isPending}
        isFetching={query.isFetching && !query.isPending}
        error={query.error}
        onRetry={() => void query.refetch()}
        sort={search.sort}
        onSortChange={(sort) => setSearch({ sort })}
        rowClassName={(b) => (b.status === 'EXPIRED' ? 'bg-danger-soft/40' : undefined)}
        empty={{
          icon: <CalendarCheck strokeWidth={1.75} />,
          title: filtered ? 'No batches match' : 'No batches in stock',
          description: filtered
            ? undefined
            : 'Expiry-tracked products are received in batches; they appear here.',
        }}
        renderCard={(b) => (
          <div>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{b.product.name}</p>
                <p className="text-xs text-fg-tertiary">
                  <span className="font-mono">{b.batchNo}</span> · {b.warehouse.code} ·{' '}
                  {formatNumber(b.quantity)} {b.product.unit}
                </p>
              </div>
              <ExpiryPill batch={b} />
            </div>
          </div>
        )}
        footer={
          <Pagination
            page={page}
            pageSize={pageSize}
            total={query.data?.meta.total}
            noun="batches"
            onPageChange={(p) => setSearch({ page: p }, true)}
            onPageSizeChange={(s) => setSearch({ pageSize: s })}
          />
        }
      />
      <StockOperationDialog
        op={writeOff ? 'write-off' : null}
        onClose={() => setWriteOff(null)}
        warehouseId={writeOff?.warehouse.id}
        batchId={writeOff?.id}
        product={writeOff ? { ...writeOff.product } : undefined}
      />
    </>
  );
}
