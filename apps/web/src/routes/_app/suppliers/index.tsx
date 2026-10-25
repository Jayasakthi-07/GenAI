import { formatNumber, type SupplierListItem } from '@stockroom/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { Factory, Plus } from 'lucide-react';
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
import { RiskPill, ScoreRing } from '@/components/domain/score';
import { ListPage, PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { suppliersQuery } from '@/features/purchasing/api';
import { SupplierDialog } from '@/features/purchasing/supplier-form';
import { useCan } from '@/lib/auth';
import { ago, money } from '@/lib/format';
import { boolParam, cleanSearch, listSearch } from '@/lib/list-search';

const searchSchema = z.object({ ...listSearch, active: boolParam });
type Search = z.infer<typeof searchSchema>;

export const Route = createFileRoute('/_app/suppliers/')({
  validateSearch: searchSchema,
  staticData: { title: 'Suppliers' },
  component: SuppliersPage,
});

const col = columnHelper<SupplierListItem>();

function SuppliersPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const can = useCan();
  const [creating, setCreating] = useState(false);
  const page = search.page ?? 1;
  const pageSize = search.pageSize ?? 50;
  const query = useQuery({
    ...suppliersQuery({ ...search, page, pageSize }),
    placeholderData: keepPreviousData,
  });
  const setSearch = (patch: Partial<Search>, keepPage = false) =>
    void navigate({
      search: (prev) => cleanSearch({ ...prev, ...(keepPage ? {} : { page: undefined }), ...patch }),
      replace: true,
    });
  const filtered = Boolean(search.q || search.active !== undefined);

  const columns = useMemo(
    () => [
      col.accessor('name', {
        id: 'name',
        header: 'Supplier',
        enableSorting: true,
        meta: { required: true, className: 'min-w-56' },
        cell: ({ row }) => (
          <div className="flex items-center gap-3">
            <ScoreRing score={row.original.score} size={36} />
            <div className="min-w-0">
              <p className="truncate font-medium">
                {row.original.name} {!row.original.isActive && <Badge>Inactive</Badge>}
              </p>
              <p className="truncate text-xs text-fg-tertiary">
                {row.original.code}
                {row.original.city ? ` · ${row.original.city}` : ''}
              </p>
            </div>
          </div>
        ),
      }),
      col.accessor('score', {
        id: 'score',
        header: 'Risk',
        enableSorting: true,
        cell: ({ row }) => <RiskPill risk={row.original.riskLevel} />,
      }),
      col.accessor('productCount', {
        id: 'productCount',
        header: 'Products',
        enableSorting: true,
        meta: { numeric: true },
        cell: (c) => formatNumber(c.getValue()),
      }),
      col.accessor('openPoValue', {
        id: 'openPoValue',
        header: 'Open orders',
        enableSorting: true,
        meta: { numeric: true },
        cell: ({ row }) =>
          row.original.openPoCount ? (
            <span>
              {money(row.original.openPoValue)}
              <span className="block text-xs text-fg-tertiary">{row.original.openPoCount} POs</span>
            </span>
          ) : (
            <span className="text-fg-tertiary">—</span>
          ),
      }),
      col.accessor('contactName', {
        id: 'contact',
        header: 'Contact',
        cell: ({ row }) => (
          <span className="text-fg-secondary">
            {row.original.contactName ?? '—'}
            {row.original.phone && (
              <span className="block text-xs text-fg-tertiary">{row.original.phone}</span>
            )}
          </span>
        ),
      }),
      col.accessor('lastOrderAt', {
        id: 'lastOrderAt',
        header: 'Last order',
        enableSorting: true,
        cell: (c) => <span className="text-fg-secondary">{ago(c.getValue())}</span>,
      }),
    ],
    [],
  );

  return (
    <ListPage>
      <PageHeader
        title="Suppliers"
        description="Scores come from delivery history: on-time rate, fill rate, lead-time consistency, price trend and quality."
        actions={
          can('suppliers.manage') && (
            <Button variant="primary" onClick={() => setCreating(true)}>
              <Plus strokeWidth={1.75} /> New supplier
            </Button>
          )
        }
      />
      <Toolbar>
        <SearchInput
          value={search.q}
          onChange={(q) => setSearch({ q })}
          placeholder="Name, code or city…"
          className="w-full sm:w-72"
        />
        <FilterMenu
          label="Status"
          multiple={false}
          value={search.active === undefined ? undefined : String(search.active)}
          onChange={(v) => setSearch({ active: v ? v[0] === 'true' : undefined })}
          options={[
            { value: 'true', label: 'Active' },
            { value: 'false', label: 'Inactive' },
          ]}
        />
        <ClearFilters show={filtered} onClear={() => void navigate({ search: {}, replace: true })} />
        <div className="ml-auto">
          <DensityToggle />
        </div>
      </Toolbar>
      <DataTable
        label="Suppliers"
        columns={columns}
        data={query.data?.data}
        getRowId={(s) => s.id}
        isLoading={query.isPending}
        isFetching={query.isFetching && !query.isPending}
        error={query.error}
        onRetry={() => void query.refetch()}
        sort={search.sort}
        onSortChange={(sort) => setSearch({ sort })}
        onRowClick={(s) => void navigate({ to: '/suppliers/$id', params: { id: s.id } })}
        empty={{
          icon: <Factory strokeWidth={1.75} />,
          title: filtered ? 'No suppliers match' : 'No suppliers yet',
        }}
        renderCard={(s) => (
          <div className="flex items-center gap-3">
            <ScoreRing score={s.score} size={40} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{s.name}</p>
              <p className="truncate text-xs text-fg-tertiary">
                {s.code} · {formatNumber(s.productCount)} products
                {s.openPoCount ? ` · ${s.openPoCount} open POs` : ''}
              </p>
            </div>
            <RiskPill risk={s.riskLevel} />
          </div>
        )}
        footer={
          <Pagination
            page={page}
            pageSize={pageSize}
            total={query.data?.meta.total}
            noun="suppliers"
            onPageChange={(p) => setSearch({ page: p }, true)}
            onPageSizeChange={(s) => setSearch({ pageSize: s })}
          />
        }
      />
      <SupplierDialog
        open={creating}
        onOpenChange={setCreating}
        onSaved={(s) => void navigate({ to: '/suppliers/$id', params: { id: s.id } })}
      />
    </ListPage>
  );
}
