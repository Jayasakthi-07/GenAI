import {
  CYCLE_COUNT_STATUS_LABELS,
  CYCLE_COUNT_STATUSES,
  type CycleCountListItem,
  formatNumber,
} from '@stockroom/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { ClipboardCheck, Plus, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import { columnHelper, DataTable } from '@/components/data-table/data-table';
import { Pagination } from '@/components/data-table/pagination';
import { ClearFilters, DensityToggle, FilterMenu, Toolbar } from '@/components/data-table/toolbar';
import { type PickedProduct, ProductPicker, WarehouseSelect } from '@/components/domain/pickers';
import { ActorLabel, CountStatusPill } from '@/components/domain/status';
import { ListPage, PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { SegmentedControl } from '@/components/ui/tabs';
import { useCategoryTree, useWarehouses } from '@/features/catalog/api';
import { cycleCountsQuery, useCreateCount } from '@/features/operations/api';
import { useCan } from '@/lib/auth';
import { addDays, date, money } from '@/lib/format';
import { reportError } from '@/lib/forms';
import { cleanSearch, enumListParam, idParam, pageParam, pageSizeParam } from '@/lib/list-search';
import { cn } from '@/lib/utils';

const searchSchema = z.object({
  page: pageParam,
  pageSize: pageSizeParam,
  status: enumListParam(CYCLE_COUNT_STATUSES),
  warehouseId: idParam,
});
type Search = z.infer<typeof searchSchema>;

export const Route = createFileRoute('/_app/cycle-counts/')({
  validateSearch: searchSchema,
  staticData: { title: 'Cycle counts' },
  component: CycleCountsPage,
});

const col = columnHelper<CycleCountListItem>();

function CycleCountsPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const can = useCan();
  const warehouses = useWarehouses();
  const [creating, setCreating] = useState(false);
  const page = search.page ?? 1;
  const pageSize = search.pageSize ?? 50;
  const query = useQuery({
    ...cycleCountsQuery({ ...search, page, pageSize }),
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
        header: 'Count',
        meta: { required: true },
        cell: (c) => <span className="font-medium">{c.getValue()}</span>,
      }),
      col.accessor((c) => c.warehouse.name, { id: 'warehouse', header: 'Warehouse' }),
      col.accessor('status', {
        id: 'status',
        header: 'Status',
        cell: (c) => <CountStatusPill status={c.getValue()} />,
      }),
      col.display({
        id: 'progress',
        header: 'Counted',
        meta: { numeric: true },
        cell: ({ row }) => {
          const { countedCount, lineCount } = row.original;
          return (
            <span className="inline-flex items-center gap-2">
              <span
                className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-neutral-soft sm:block"
                aria-hidden
              >
                <span
                  className="block h-full rounded-full bg-accent"
                  style={{ width: `${lineCount ? (countedCount / lineCount) * 100 : 0}%` }}
                />
              </span>
              {formatNumber(countedCount)} / {formatNumber(lineCount)}
            </span>
          );
        },
      }),
      col.accessor('varianceCount', {
        id: 'variance',
        header: 'Variances',
        meta: { numeric: true },
        cell: ({ row }) =>
          row.original.varianceCount ? (
            <span>
              {formatNumber(row.original.varianceCount)}
              <span
                className={cn(
                  'block text-xs',
                  Number(row.original.varianceValue) < 0 ? 'text-danger' : 'text-fg-tertiary',
                )}
              >
                {money(row.original.varianceValue)}
              </span>
            </span>
          ) : (
            <span className="text-fg-tertiary">—</span>
          ),
      }),
      col.accessor('dueDate', {
        id: 'dueDate',
        header: 'Due',
        cell: (c) => <span className="text-fg-secondary">{date(c.getValue())}</span>,
      }),
      col.accessor('createdBy', {
        id: 'createdBy',
        header: 'Started by',
        cell: (c) => <ActorLabel actor={c.getValue()} className="text-fg-secondary" />,
      }),
      col.accessor('completedAt', {
        id: 'completedAt',
        header: 'Completed',
        cell: (c) => <span className="text-fg-secondary">{date(c.getValue())}</span>,
      }),
    ],
    [],
  );

  return (
    <ListPage>
      <PageHeader
        title="Cycle counts"
        description="Count a slice of the stock, review the differences, and post corrections to the ledger."
        actions={
          can('stock.operate') && (
            <Button variant="primary" onClick={() => setCreating(true)}>
              <Plus strokeWidth={1.75} /> New count
            </Button>
          )
        }
      />
      <Toolbar>
        <FilterMenu
          label="Status"
          value={search.status}
          onChange={(v) => setSearch({ status: v as Search['status'] })}
          options={CYCLE_COUNT_STATUSES.map((s) => ({ value: s, label: CYCLE_COUNT_STATUS_LABELS[s] }))}
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
        label="Cycle counts"
        columns={columns}
        data={query.data?.data}
        getRowId={(c) => c.id}
        isLoading={query.isPending}
        isFetching={query.isFetching && !query.isPending}
        error={query.error}
        onRetry={() => void query.refetch()}
        onRowClick={(c) => void navigate({ to: '/cycle-counts/$id', params: { id: c.id } })}
        empty={{
          icon: <ClipboardCheck strokeWidth={1.75} />,
          title: filtered ? 'No counts match' : 'No cycle counts yet',
          description: filtered ? undefined : 'Counting a few categories each week keeps the books honest.',
        }}
        renderCard={(c) => (
          <div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium">{c.number}</span>
              <CountStatusPill status={c.status} />
            </div>
            <p className="mt-1 text-xs text-fg-secondary">
              {c.warehouse.code} · {c.countedCount}/{c.lineCount} counted · {c.varianceCount} variances
            </p>
          </div>
        )}
        footer={
          <Pagination
            page={page}
            pageSize={pageSize}
            total={query.data?.meta.total}
            noun="counts"
            onPageChange={(p) => setSearch({ page: p }, true)}
            onPageSizeChange={(s) => setSearch({ pageSize: s })}
          />
        }
      />
      <NewCountDialog open={creating} onOpenChange={setCreating} />
    </ListPage>
  );
}

function NewCountDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const navigate = useNavigate();
  const warehouses = useWarehouses();
  const categories = useCategoryTree();
  const create = useCreateCount();
  const [warehouseId, setWarehouseId] = useState('');
  const [scope, setScope] = useState<'category' | 'products'>('category');
  const [categoryId, setCategoryId] = useState('');
  const [products, setProducts] = useState<PickedProduct[]>([]);
  const [reason, setReason] = useState('');
  const [dueDate, setDueDate] = useState(addDays(2));
  const wh = warehouseId || warehouses.data?.find((w) => w.isDefault)?.id || '';
  const ready = wh && (scope === 'category' ? categoryId : products.length > 0);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    create.mutate(
      {
        warehouseId: wh,
        reason: reason || null,
        dueDate: dueDate || null,
        ...(scope === 'category' ? { categoryId } : { productIds: products.map((p) => p.id) }),
      },
      {
        onSuccess: (c) => {
          toast.success(`${c.number} started`, {
            description: `${formatNumber(c.lineCount)} lines to count`,
          });
          onOpenChange(false);
          setProducts([]);
          void navigate({ to: '/cycle-counts/$id', params: { id: c.id } });
        },
        onError: (err) => reportError(err, undefined, 'Couldn’t start the count'),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>New cycle count</DialogTitle>
            <DialogDescription>
              Expected quantities are captured now; counters see them only after submitting.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-4">
            <Field label="Warehouse" required>
              <WarehouseSelect value={wh} onChange={setWarehouseId} />
            </Field>
            <Field label="What to count">
              <SegmentedControl
                aria-label="Scope"
                value={scope}
                onValueChange={setScope}
                options={[
                  { value: 'category', label: 'A category' },
                  { value: 'products', label: 'Chosen products' },
                ]}
              />
            </Field>
            {scope === 'category' ? (
              <Field label="Category" required hint="Every product in stock here, including subcategories.">
                <Select
                  value={categoryId}
                  onValueChange={setCategoryId}
                  placeholder="Choose a category"
                  options={categories.flat.map((c) => ({ value: c.id, label: c.path }))}
                />
              </Field>
            ) : (
              <Field label="Products" required>
                <div className="flex flex-col gap-2">
                  {products.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {products.map((p) => (
                        <Badge key={p.id} tone="outline" className="py-1">
                          {p.name}
                          <button
                            type="button"
                            aria-label={`Remove ${p.name}`}
                            onClick={() => setProducts((ps) => ps.filter((x) => x.id !== p.id))}
                          >
                            <X className="size-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  )}
                  <ProductPicker
                    value={null}
                    warehouseId={wh || undefined}
                    exclude={products.map((p) => p.id)}
                    placeholder="Add a product…"
                    onChange={(p) => setProducts((ps) => [...ps, p])}
                  />
                </div>
              </Field>
            )}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Reason">
                <Input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Weekly count"
                />
              </Field>
              <Field label="Due">
                <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </Field>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={create.isPending} disabled={!ready}>
              Start count
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
