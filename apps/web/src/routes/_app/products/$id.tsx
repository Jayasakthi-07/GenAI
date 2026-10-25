import { formatDays, formatNumber, formatPercent } from '@stockroom/shared';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  CalendarClock,
  ChevronDown,
  ChevronLeft,
  ImagePlus,
  PackageX,
  Pencil,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import { ProductThumb } from '@/components/domain/product-thumb';
import { ProductStatusPill, Stat, StockStatePill } from '@/components/domain/status';
import { ErrorState } from '@/components/feedback/states';
import { PageLoading } from '@/components/feedback/page-loading';
import { Page } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/menus';
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  productQuery,
  useRemoveProductImage,
  useSetProductImage,
  useUpdateProduct,
} from '@/features/products/api';
import {
  ActivityTab,
  MovementsTab,
  OverviewTab,
  StockTab,
  SuppliersTab,
} from '@/features/products/detail-tabs';
import { ProductFields, productDefaults, useProductForm } from '@/features/products/product-form';
import { type StockOp, StockOperationDialog } from '@/features/stock/operation-dialogs';
import { useCan } from '@/lib/auth';
import { money } from '@/lib/format';
import { readAsDataUrl, reportError } from '@/lib/forms';
import { enumParam } from '@/lib/list-search';
import type { ProductDetail } from '@stockroom/shared';

const TABS = ['overview', 'stock', 'movements', 'suppliers', 'activity'] as const;

export const Route = createFileRoute('/_app/products/$id')({
  validateSearch: z.object({ tab: enumParam(TABS) }),
  staticData: { title: 'Product' },
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(productQuery(params.id)).catch(() => undefined),
  component: ProductPage,
});

function ProductPage() {
  const { id } = Route.useParams();
  const { tab = 'overview' } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const query = useQuery(productQuery(id));
  const can = useCan();
  const [op, setOp] = useState<StockOp | null>(null);
  const [editing, setEditing] = useState(false);

  if (query.isPending) return <PageLoading />;
  if (query.isError)
    return (
      <Page>
        <BackLink />
        <Card className="mt-4">
          <ErrorState
            error={query.error}
            onRetry={() => void query.refetch()}
            title="Couldn’t open this product"
          />
        </Card>
      </Page>
    );
  const p = query.data;
  const cover = p.stock.reduce(
    (best, s) => (s.daysOfCover !== null && (best === null || s.daysOfCover < best) ? s.daysOfCover : best),
    null as number | null,
  );
  const margin = Number(p.sellingPrice) > 0 ? 1 - Number(p.costPrice) / Number(p.sellingPrice) : null;
  const picked = {
    id: p.id,
    sku: p.sku,
    name: p.name,
    unit: p.unit,
    trackExpiry: p.trackExpiry,
    costPrice: p.costPrice,
    sellingPrice: p.sellingPrice,
    available: p.available,
  };

  return (
    <Page>
      <BackLink />
      <div className="mt-3 flex flex-col gap-4 pb-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <ProductImage product={p} editable={can('catalog.manage')} />
          <div className="min-w-0">
            <h2 className="text-2xl font-semibold tracking-tighter sm:text-3xl">{p.name}</h2>
            <p className="mt-1 text-sm text-fg-secondary">
              <span className="font-mono">{p.sku}</span> · {p.category.path}
              {p.brand ? ` · ${p.brand}` : ''}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <StockStatePill state={p.stockState} count={p.stockStateCount} />
              {p.status !== 'ACTIVE' && <ProductStatusPill status={p.status} />}
              {p.trackExpiry && (
                <Badge tone="outline">
                  <CalendarClock /> Expiry-tracked
                </Badge>
              )}
              {p.abcClass && <Badge tone="outline">Class {p.abcClass}</Badge>}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {can('stock.operate') && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary">
                  <SlidersHorizontal strokeWidth={1.75} /> Stock{' '}
                  <ChevronDown className="opacity-60" strokeWidth={1.75} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onSelect={() => setOp('receive')}>
                  <ArrowDownToLine /> Receive
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setOp('issue')}>
                  <ArrowUpFromLine /> Issue
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setOp('adjust')}>
                  <SlidersHorizontal /> Adjust
                </DropdownMenuItem>
                {can('stock.write_off') && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem destructive onSelect={() => setOp('write-off')}>
                      <PackageX /> Write off
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {can('catalog.manage') && (
            <Button variant="primary" onClick={() => setEditing(true)}>
              <Pencil strokeWidth={1.75} /> Edit
            </Button>
          )}
        </div>
      </div>

      <Card className="mb-6 grid grid-cols-2 gap-x-6 gap-y-4 p-5 sm:grid-cols-3 lg:grid-cols-6">
        <Stat
          label="On hand"
          value={formatNumber(p.onHand)}
          sub={`${p.unit} · ${p.stock.length} ${p.stock.length === 1 ? 'warehouse' : 'warehouses'}`}
        />
        <Stat
          label="Available"
          value={formatNumber(p.available)}
          sub={
            p.onHand - p.available > 0
              ? `${formatNumber(p.onHand - p.available)} reserved`
              : 'Nothing reserved'
          }
          tone={p.available <= 0 ? 'danger' : undefined}
        />
        <Stat label="On order" value={formatNumber(p.onOrder)} sub="Open purchase orders" />
        <Stat label="Stock value" value={money(p.value)} sub="At moving-average cost" />
        <Stat
          label="Selling price"
          value={money(p.sellingPrice)}
          sub={margin !== null ? `${formatPercent(margin)} margin` : undefined}
        />
        <Stat
          label="Shortest cover"
          value={cover !== null ? formatDays(cover) : '—'}
          sub="At the last 28 days’ sales"
          tone={cover !== null && cover < (p.leadTimeDays ?? 0) ? 'warning' : undefined}
        />
      </Card>

      <Tabs
        value={tab}
        onValueChange={(t) =>
          void navigate({
            search: { tab: t === 'overview' ? undefined : (t as (typeof TABS)[number]) },
            replace: true,
          })
        }
      >
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="stock">Stock</TabsTrigger>
          <TabsTrigger value="movements">Movements</TabsTrigger>
          <TabsTrigger value="suppliers">Suppliers</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
          <OverviewTab product={p} />
        </TabsContent>
        <TabsContent value="stock">
          <StockTab product={p} />
        </TabsContent>
        <TabsContent value="movements">
          <MovementsTab product={p} />
        </TabsContent>
        <TabsContent value="suppliers">
          <SuppliersTab product={p} />
        </TabsContent>
        <TabsContent value="activity">
          <ActivityTab product={p} />
        </TabsContent>
      </Tabs>

      <StockOperationDialog op={op} onClose={() => setOp(null)} product={picked} />
      {editing && <EditProductSheet product={p} onClose={() => setEditing(false)} />}
    </Page>
  );
}

function BackLink() {
  return (
    <Link to="/products" className="inline-flex items-center gap-1 text-sm text-fg-secondary hover:text-fg">
      <ChevronLeft className="size-4" strokeWidth={1.75} /> Products
    </Link>
  );
}

function ProductImage({ product, editable }: { product: ProductDetail; editable: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const upload = useSetProductImage(product.id);
  const remove = useRemoveProductImage(product.id);
  const choose = async (file: File | undefined) => {
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return toast.error('Use a PNG, JPEG or WebP image');
    if (file.size > 2 * 1024 * 1024) return toast.error('Images can be up to 2 MB');
    upload.mutate(await readAsDataUrl(file), {
      onSuccess: () => toast.success('Image updated'),
      onError: (e) => reportError(e, undefined, 'Couldn’t upload the image'),
    });
  };
  if (!editable)
    return <ProductThumb src={product.imageUrl} name={product.name} className="size-20 rounded-lg" />;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Change product image"
          className="group relative shrink-0 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
        >
          <ProductThumb src={product.imageUrl} name={product.name} className="size-20 rounded-lg" />
          <span className="absolute inset-0 grid place-items-center rounded-lg bg-black/40 text-white opacity-0 transition-opacity group-hover:opacity-100">
            <ImagePlus className="size-5" strokeWidth={1.75} />
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem onSelect={() => input.current?.click()}>
          <ImagePlus /> {product.imageUrl ? 'Replace image…' : 'Upload image…'}
        </DropdownMenuItem>
        {product.imageUrl && (
          <DropdownMenuItem
            destructive
            onSelect={() =>
              remove.mutate(undefined, {
                onError: (e) => reportError(e, undefined, 'Couldn’t remove the image'),
              })
            }
          >
            <Trash2 /> Remove image
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => {
          void choose(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
    </DropdownMenu>
  );
}

function EditProductSheet({ product, onClose }: { product: ProductDetail; onClose: () => void }) {
  const form = useProductForm(product);
  const update = useUpdateProduct(product.id);
  const submit = form.handleSubmit((values) =>
    update.mutate(values, {
      onSuccess: () => {
        toast.success('Product saved');
        onClose();
      },
      onError: (e) => reportError(e, form, 'Couldn’t save the product'),
    }),
  );
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="max-w-2xl">
        <form onSubmit={(e) => void submit(e)} noValidate className="flex h-full min-h-0 flex-col">
          <SheetHeader>
            <SheetTitle>Edit product</SheetTitle>
            <SheetDescription>{product.name}</SheetDescription>
          </SheetHeader>
          <SheetBody>
            <ProductFields form={form} compact trackExpiryLocked={product.onHand > 0} />
          </SheetBody>
          <SheetFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={() => (form.reset(productDefaults(product)), onClose())}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              loading={update.isPending}
              disabled={!form.formState.isDirty}
            >
              Save changes
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
