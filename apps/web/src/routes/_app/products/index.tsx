import {
  formatNumber,
  PRODUCT_STATUS_LABELS,
  PRODUCT_STATUSES,
  type ProductListItem,
  type ProductStatus,
  STOCK_STATE_LABELS,
  STOCK_STATES,
} from '@stockroom/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import type { RowSelectionState } from '@tanstack/react-table';
import {
  Download,
  FileSpreadsheet,
  FileText,
  FolderInput,
  PackagePlus,
  PackageSearch,
  Power,
  Tag,
  Upload,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import { columnHelper, DataTable } from '@/components/data-table/data-table';
import { BulkBar, Pagination } from '@/components/data-table/pagination';
import { SavedViews } from '@/components/data-table/saved-views';
import {
  ClearFilters,
  ColumnsMenu,
  DensityToggle,
  FilterMenu,
  SearchInput,
  Toolbar,
  useColumnVisibility,
} from '@/components/data-table/toolbar';
import { ProductThumb } from '@/components/domain/product-thumb';
import { ProductStatusPill, StockStatePill } from '@/components/domain/status';
import { ListPage, PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/menus';
import { Select } from '@/components/ui/select';
import { savedViewsQuery, useCategoryTree, useWarehouses } from '@/features/catalog/api';
import { ImportProductsDialog } from '@/features/products/import-dialog';
import { productsQuery, useBulkProducts } from '@/features/products/api';
import { useCan } from '@/lib/auth';
import { downloadFile } from '@/lib/download';
import { money } from '@/lib/format';
import { reportError } from '@/lib/forms';
import {
  boolParam,
  cleanSearch,
  enumListParam,
  idParam,
  listSearch,
  textParam,
  toApiQuery,
} from '@/lib/list-search';

const searchSchema = z.object({
  ...listSearch,
  categoryId: idParam,
  warehouseId: idParam,
  stockState: enumListParam(STOCK_STATES),
  status: enumListParam(PRODUCT_STATUSES),
  trackExpiry: boolParam,
  tag: textParam,
});
type Search = z.infer<typeof searchSchema>;

export const Route = createFileRoute('/_app/products/')({
  validateSearch: searchSchema,
  staticData: { title: 'Products' },
  component: ProductsPage,
});

const col = columnHelper<ProductListItem>();

function ProductsPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const can = useCan();
  const canManage = can('catalog.manage');
  const categories = useCategoryTree();
  const warehouses = useWarehouses();
  const page = search.page ?? 1;
  const pageSize = search.pageSize ?? 50;
  const query = useQuery({
    ...productsQuery({ ...search, page, pageSize }),
    placeholderData: keepPreviousData,
  });
  const [selection, setSelection] = useState<RowSelectionState>({});
  const [importOpen, setImportOpen] = useState(false);
  const [bulk, setBulk] = useState<null | 'category' | 'add-tag' | 'remove-tag'>(null);
  const [visibility, setVisibility] = useColumnVisibility('products', {
    costPrice: false,
    tags: false,
    updatedAt: false,
    status: false,
  });

  const setSearch = (patch: Partial<Search>, keepPage = false) =>
    void navigate({
      search: (prev) => cleanSearch({ ...prev, ...(keepPage ? {} : { page: undefined }), ...patch }),
      replace: true,
    });

  // Open the user's default saved view when they arrive with no filters.
  const views = useQuery(savedViewsQuery('products'));
  const appliedDefault = useRef(false);
  useEffect(() => {
    if (appliedDefault.current || !views.data) return;
    appliedDefault.current = true;
    const def = views.data.find((v) => v.isDefault);
    if (def && Object.keys(search).length === 0)
      void navigate({ search: def.state as Search, replace: true });
  }, [views.data, search, navigate]);

  // Selection is per page of results.
  const [selectionFor, setSelectionFor] = useState(query.data);
  if (query.data !== selectionFor) {
    setSelectionFor(query.data);
    setSelection({});
  }

  const columns = useMemo(
    () => [
      col.accessor('name', {
        id: 'name',
        header: 'Product',
        enableSorting: true,
        meta: { required: true, className: 'min-w-64' },
        cell: ({ row }) => {
          const p = row.original;
          return (
            <div className="flex items-center gap-3">
              <ProductThumb src={p.imageUrl} name={p.name} />
              <div className="min-w-0">
                <Link
                  to="/products/$id"
                  params={{ id: p.id }}
                  onClick={(e) => e.stopPropagation()}
                  className="block truncate font-medium hover:underline focus-visible:underline focus-visible:outline-none"
                >
                  {p.name}
                </Link>
                <p className="truncate text-xs text-fg-tertiary">
                  {p.sku}
                  {p.brand ? ` · ${p.brand}` : ''}
                </p>
              </div>
            </div>
          );
        },
      }),
      col.accessor((p) => p.category.path, {
        id: 'category',
        header: 'Category',
        enableSorting: true,
        meta: { className: 'max-w-48' },
        cell: (c) => {
          const parts = c.getValue().split(' › ');
          return (
            <div className="min-w-0" title={c.getValue()}>
              <p className="truncate">{parts.at(-1)}</p>
              {parts.length > 1 && (
                <p className="truncate text-xs text-fg-tertiary">{parts.slice(0, -1).join(' › ')}</p>
              )}
            </div>
          );
        },
      }),
      col.accessor('stockState', {
        id: 'stockState',
        header: 'Stock',
        meta: { label: 'Stock status' },
        cell: ({ row }) => (
          <StockStatePill state={row.original.stockState} count={row.original.stockStateCount} />
        ),
      }),
      col.accessor('onHand', {
        id: 'onHand',
        header: 'On hand',
        enableSorting: true,
        meta: { numeric: true },
        cell: ({ row }) => (
          <span>
            {formatNumber(row.original.onHand)}{' '}
            <span className="text-xs text-fg-tertiary">{row.original.unit}</span>
          </span>
        ),
      }),
      col.accessor('available', {
        id: 'available',
        header: 'Available',
        meta: { numeric: true },
        cell: (c) => formatNumber(c.getValue()),
      }),
      col.accessor('onOrder', {
        id: 'onOrder',
        header: 'On order',
        meta: { numeric: true },
        cell: (c) =>
          c.getValue() ? formatNumber(c.getValue()) : <span className="text-fg-tertiary">—</span>,
      }),
      col.accessor('value', {
        id: 'value',
        header: 'Value',
        enableSorting: true,
        meta: { numeric: true },
        cell: (c) => money(c.getValue()),
      }),
      col.accessor('sellingPrice', {
        id: 'sellingPrice',
        header: 'Price',
        enableSorting: true,
        meta: { numeric: true },
        cell: (c) => money(c.getValue()),
      }),
      col.accessor('costPrice', {
        id: 'costPrice',
        header: 'Cost',
        enableSorting: true,
        meta: { numeric: true },
        cell: (c) => money(c.getValue()),
      }),
      col.accessor('status', {
        id: 'status',
        header: 'Status',
        cell: (c) => <ProductStatusPill status={c.getValue()} />,
      }),
      col.accessor('tags', {
        id: 'tags',
        header: 'Tags',
        cell: (c) => (
          <div className="flex max-w-56 flex-wrap gap-1">
            {c.getValue().map((t) => (
              <Badge key={t}>{t}</Badge>
            ))}
          </div>
        ),
      }),
      col.accessor('updatedAt', {
        id: 'updatedAt',
        header: 'Updated',
        enableSorting: true,
        cell: (c) => (
          <span className="text-fg-secondary">
            {new Date(c.getValue()).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
          </span>
        ),
      }),
    ],
    [],
  );

  const columnChoices = [
    { id: 'category', label: 'Category' },
    { id: 'stockState', label: 'Stock status' },
    { id: 'onHand', label: 'On hand' },
    { id: 'available', label: 'Available' },
    { id: 'onOrder', label: 'On order' },
    { id: 'value', label: 'Value' },
    { id: 'sellingPrice', label: 'Price' },
    { id: 'costPrice', label: 'Cost' },
    { id: 'status', label: 'Status' },
    { id: 'tags', label: 'Tags' },
    { id: 'updatedAt', label: 'Updated' },
  ];

  const filtered = Boolean(
    search.q ||
    search.categoryId ||
    search.warehouseId ||
    search.stockState ||
    search.status ||
    search.trackExpiry !== undefined ||
    search.tag,
  );
  const selectedIds = Object.keys(selection).filter((k) => selection[k]);
  const bulkMutation = useBulkProducts();
  const runBulk = (input: Parameters<typeof bulkMutation.mutate>[0], done?: () => void) =>
    bulkMutation.mutate(input, {
      onSuccess: (r) => {
        toast.success(`Updated ${formatNumber(r.updated)} ${r.updated === 1 ? 'product' : 'products'}`);
        setSelection({});
        done?.();
      },
      onError: (e) => reportError(e, undefined, 'Couldn’t update the products'),
    });

  const exportAs = (format: 'csv' | 'xlsx') =>
    toast.promise(
      downloadFile('/products/export', {
        ...toApiQuery({ ...search, page: undefined, pageSize: undefined }),
        format,
      }),
      { loading: 'Preparing the file…', success: 'Download started', error: (e: Error) => e.message },
    );

  return (
    <ListPage>
      <PageHeader
        title="Products"
        description={
          query.data
            ? `${formatNumber(query.data.meta.total)} ${filtered ? 'matching products' : 'products in the catalog'}`
            : 'Your catalog'
        }
        actions={
          <>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary">
                  <Download strokeWidth={1.75} /> Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuLabel>{filtered ? 'Matching products' : 'All products'}</DropdownMenuLabel>
                <DropdownMenuItem onSelect={() => exportAs('csv')}>
                  <FileText /> CSV
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => exportAs('xlsx')}>
                  <FileSpreadsheet /> Excel workbook
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {canManage && (
              <>
                <Button variant="secondary" onClick={() => setImportOpen(true)}>
                  <Upload strokeWidth={1.75} /> Import
                </Button>
                <Button variant="primary" asChild>
                  <Link to="/products/new">
                    <PackagePlus strokeWidth={1.75} /> New product
                  </Link>
                </Button>
              </>
            )}
          </>
        }
      />

      <Toolbar>
        <SearchInput
          value={search.q}
          onChange={(q) => setSearch({ q })}
          placeholder="Search name, SKU, brand, barcode…"
          className="w-full sm:w-72"
        />
        <FilterMenu
          label="Category"
          multiple={false}
          searchable
          value={search.categoryId}
          onChange={(v) => setSearch({ categoryId: v?.[0] })}
          options={categories.flat.map((c) => ({ value: c.id, label: c.path }))}
        />
        <FilterMenu
          label="Stock"
          value={search.stockState}
          onChange={(v) => setSearch({ stockState: v as Search['stockState'] })}
          options={STOCK_STATES.map((s) => ({ value: s, label: STOCK_STATE_LABELS[s] }))}
        />
        <FilterMenu
          label="Warehouse"
          multiple={false}
          value={search.warehouseId}
          onChange={(v) => setSearch({ warehouseId: v?.[0] })}
          options={(warehouses.data ?? []).map((w) => ({ value: w.id, label: w.name }))}
        />
        <FilterMenu
          label="Status"
          value={search.status}
          onChange={(v) => setSearch({ status: v as ProductStatus[] | undefined })}
          options={PRODUCT_STATUSES.map((s) => ({ value: s, label: PRODUCT_STATUS_LABELS[s] }))}
        />
        <FilterMenu
          label="Expiry"
          multiple={false}
          value={search.trackExpiry === undefined ? undefined : String(search.trackExpiry)}
          onChange={(v) => setSearch({ trackExpiry: v ? v[0] === 'true' : undefined })}
          options={[
            { value: 'true', label: 'Expiry-tracked' },
            { value: 'false', label: 'Not tracked' },
          ]}
        />
        {search.tag && (
          <Button variant="secondary" size="sm" onClick={() => setSearch({ tag: undefined })}>
            <Tag strokeWidth={1.75} /> {search.tag} ✕
          </Button>
        )}
        <ClearFilters show={filtered} onClear={() => void navigate({ search: {}, replace: true })} />
        <div className="ml-auto flex items-center gap-1">
          <SavedViews
            page="products"
            current={search}
            onApply={(state) => void navigate({ search: state as Search })}
          />
          <ColumnsMenu columns={columnChoices} visibility={visibility} onChange={setVisibility} />
          <DensityToggle />
        </div>
      </Toolbar>

      <DataTable
        label="Products"
        columns={columns}
        data={query.data?.data}
        getRowId={(p) => p.id}
        isLoading={query.isPending}
        isFetching={query.isFetching && !query.isPending}
        error={query.error}
        onRetry={() => void query.refetch()}
        sort={search.sort}
        onSortChange={(sort) => setSearch({ sort })}
        selection={canManage ? selection : undefined}
        onSelectionChange={canManage ? setSelection : undefined}
        columnVisibility={visibility}
        onColumnVisibilityChange={setVisibility}
        onRowClick={(p) => void navigate({ to: '/products/$id', params: { id: p.id } })}
        empty={
          filtered
            ? {
                icon: <PackageSearch strokeWidth={1.75} />,
                title: 'No products match',
                description: 'Try a different search or clear the filters.',
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
                icon: <PackagePlus strokeWidth={1.75} />,
                title: 'No products yet',
                description: 'Add your first product, or import a CSV of your catalog.',
                action: canManage ? (
                  <Button variant="primary" size="sm" onClick={() => setImportOpen(true)}>
                    <Upload strokeWidth={1.75} /> Import products
                  </Button>
                ) : undefined,
              }
        }
        renderCard={(p) => (
          <div className="flex items-center gap-3">
            <ProductThumb src={p.imageUrl} name={p.name} className="size-11" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{p.name}</p>
              <p className="truncate text-xs text-fg-tertiary">
                {p.sku} · {p.category.path}
              </p>
              <div className="mt-1.5 flex items-center justify-between gap-2">
                <StockStatePill state={p.stockState} count={p.stockStateCount} />
                <span className="tabular text-sm">
                  {formatNumber(p.onHand)} <span className="text-xs text-fg-tertiary">{p.unit}</span>
                </span>
              </div>
            </div>
          </div>
        )}
        footer={
          <Pagination
            page={page}
            pageSize={pageSize}
            total={query.data?.meta.total}
            noun="products"
            onPageChange={(p) => setSearch({ page: p }, true)}
            onPageSizeChange={(s) => setSearch({ pageSize: s })}
          />
        }
      />

      <BulkBar count={selectedIds.length} onClear={() => setSelection({})}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="secondary" size="sm">
              <Power strokeWidth={1.75} /> Set status
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center" side="top">
            {PRODUCT_STATUSES.map((s) => (
              <DropdownMenuItem
                key={s}
                onSelect={() => runBulk({ action: 'set-status', ids: selectedIds, status: s })}
              >
                {PRODUCT_STATUS_LABELS[s]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button variant="secondary" size="sm" onClick={() => setBulk('category')}>
          <FolderInput strokeWidth={1.75} /> Move
        </Button>
        <Button variant="secondary" size="sm" onClick={() => setBulk('add-tag')}>
          <Tag strokeWidth={1.75} /> Tag
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setBulk('remove-tag')}>
          Untag
        </Button>
      </BulkBar>

      <BulkDialog
        mode={bulk}
        count={selectedIds.length}
        categories={categories.flat.map((c) => ({ value: c.id, label: c.path }))}
        pending={bulkMutation.isPending}
        onClose={() => setBulk(null)}
        onSubmit={(value) => {
          if (bulk === 'category')
            runBulk({ action: 'set-category', ids: selectedIds, categoryId: value }, () => setBulk(null));
          if (bulk === 'add-tag' || bulk === 'remove-tag')
            runBulk({ action: bulk, ids: selectedIds, tag: value }, () => setBulk(null));
        }}
      />
      <ImportProductsDialog open={importOpen} onOpenChange={setImportOpen} />
    </ListPage>
  );
}

function BulkDialog({
  mode,
  count,
  categories,
  pending,
  onClose,
  onSubmit,
}: {
  mode: null | 'category' | 'add-tag' | 'remove-tag';
  count: number;
  categories: Array<{ value: string; label: string }>;
  pending: boolean;
  onClose: () => void;
  onSubmit: (value: string) => void;
}) {
  const [value, setValue] = useState('');
  const [valueFor, setValueFor] = useState(mode);
  if (mode !== valueFor) {
    setValueFor(mode);
    setValue('');
  }
  const title = mode === 'category' ? 'Move to category' : mode === 'add-tag' ? 'Add a tag' : 'Remove a tag';
  return (
    <Dialog open={mode !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="sm" aria-describedby={undefined}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (value.trim()) onSubmit(value.trim());
          }}
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <p className="text-sm text-fg-secondary">
              {formatNumber(count)} selected {count === 1 ? 'product' : 'products'}
            </p>
          </DialogHeader>
          <DialogBody>
            {mode === 'category' ? (
              <Field label="Category" required>
                <Select
                  value={value}
                  onValueChange={setValue}
                  options={categories}
                  placeholder="Choose a category"
                />
              </Field>
            ) : (
              <Field label="Tag" required hint="Lowercase words work best, e.g. festive or fast-moving.">
                <Input value={value} onChange={(e) => setValue(e.target.value)} maxLength={40} autoFocus />
              </Field>
            )}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={pending} disabled={!value.trim()}>
              {mode === 'category' ? 'Move products' : mode === 'add-tag' ? 'Add tag' : 'Remove tag'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
