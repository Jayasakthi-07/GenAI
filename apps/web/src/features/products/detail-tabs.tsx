import {
  formatDays,
  formatNumber,
  formatPercent,
  MOVEMENT_LABELS,
  type Movement,
  type ProductDetail,
  type ProductStock,
  RISK_LABELS,
} from '@stockroom/shared';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { format, parseISO } from 'date-fns';
import { Boxes, History, Pencil, Star, Truck } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { BarsChart } from '@/components/charts/charts';
import { LoadMore } from '@/components/data-table/pagination';
import { ActorLabel, DetailList, StockStatePill } from '@/components/domain/status';
import { EmptyState, ErrorState } from '@/components/feedback/states';
import { Badge, StatusPill } from '@/components/ui/badge';
import { Button, IconButton } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Skeleton } from '@/components/ui/misc';
import { SegmentedControl } from '@/components/ui/tabs';
import { TD, TH, THead, TR } from '@/components/ui/table';
import { AuditItem } from '@/features/alerts/audit-entry';
import { batchesQuery } from '@/features/stock/api';
import { useCan } from '@/lib/auth';
import { date, dateTime, money } from '@/lib/format';
import { reportError } from '@/lib/forms';
import { usePreferences } from '@/lib/preferences';
import { cn } from '@/lib/utils';
import {
  productActivityQuery,
  productMovementsQuery,
  productSalesQuery,
  productSuppliersQuery,
  useUpdateStockParams,
} from './api';

function TableCard({
  title,
  description,
  children,
  action,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <div>
          <CardTitle>{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </div>
        {action}
      </CardHeader>
      <div className="overflow-x-auto">{children}</div>
    </Card>
  );
}

/* ── Overview ───────────────────────────────────────────────────────────── */

export function OverviewTab({ product }: { product: ProductDetail }) {
  const [days, setDays] = useState<'30' | '90' | '180'>('90');
  const sales = useQuery(productSalesQuery(product.id, Number(days)));
  const total = sales.data?.reduce((a, d) => a + d.quantity, 0) ?? 0;
  const revenue = sales.data?.reduce((a, d) => a + d.revenue, 0) ?? 0;
  const margin =
    Number(product.sellingPrice) > 0 ? 1 - Number(product.costPrice) / Number(product.sellingPrice) : null;

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
      <Card className="xl:col-span-2">
        <CardHeader>
          <div>
            <CardTitle>Sales</CardTitle>
            <CardDescription>
              {sales.data
                ? `${formatNumber(total)} ${product.unit} · ${money(revenue)} in the last ${days} days`
                : `Units sold per day`}
            </CardDescription>
          </div>
          <SegmentedControl
            aria-label="Sales range"
            size="sm"
            value={days}
            onValueChange={setDays}
            options={[
              { value: '30', label: '30D' },
              { value: '90', label: '90D' },
              { value: '180', label: '180D' },
            ]}
          />
        </CardHeader>
        <CardContent>
          {sales.isError ? (
            <ErrorState compact error={sales.error} onRetry={() => void sales.refetch()} />
          ) : sales.data ? (
            total === 0 ? (
              <EmptyState compact icon={<Boxes strokeWidth={1.75} />} title="No sales in this period" />
            ) : (
              <BarsChart
                ariaLabel={`Units of ${product.name} sold per day`}
                data={sales.data.map((d) => ({ ...d, label: format(parseISO(d.date), 'd MMM') }))}
                xKey="label"
                series={[{ key: 'quantity', label: `Units (${product.unit})` }]}
                formatValue={(v) => formatNumber(v)}
                height={240}
              />
            )
          ) : (
            <Skeleton className="h-[240px]" />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent>
          <DetailList
            items={[
              { label: 'SKU', value: <span className="font-mono text-xs">{product.sku}</span> },
              { label: 'Barcode', value: product.barcode ?? '—' },
              { label: 'Brand', value: product.brand ?? '—' },
              { label: 'Unit', value: product.unit },
              { label: 'Cost price', value: <span className="tabular">{money(product.costPrice)}</span> },
              {
                label: 'Selling price',
                value: (
                  <span className="tabular">
                    {money(product.sellingPrice)}
                    {margin !== null && (
                      <span className="text-fg-tertiary"> · {formatPercent(margin)} margin</span>
                    )}
                  </span>
                ),
              },
              {
                label: 'MRP',
                value: product.mrp ? <span className="tabular">{money(product.mrp)}</span> : '—',
              },
              { label: 'GST', value: `${Number(product.taxRate)}%` },
              {
                label: 'Lead time',
                value: product.leadTimeDays !== null ? formatDays(product.leadTimeDays) : '—',
              },
              {
                label: 'Shelf life',
                value: product.shelfLifeDays ? formatDays(product.shelfLifeDays) : '—',
                hidden: !product.trackExpiry,
              },
              {
                label: 'Preferred supplier',
                value: product.preferredSupplier ? (
                  <Link
                    to="/suppliers/$id"
                    params={{ id: product.preferredSupplier.id }}
                    className="text-accent-text hover:underline"
                  >
                    {product.preferredSupplier.name}
                  </Link>
                ) : (
                  '—'
                ),
              },
              {
                label: 'ABC / XYZ',
                value: product.abcClass
                  ? `${product.abcClass} / ${product.xyzClass ?? '—'}`
                  : 'Not classified yet',
              },
              {
                label: 'Tags',
                value: product.tags.length ? (
                  <span className="flex flex-wrap gap-1">
                    {product.tags.map((t) => (
                      <Link key={t} to="/products" search={{ tag: t }}>
                        <Badge className="hover:bg-accent-soft hover:text-accent-text">{t}</Badge>
                      </Link>
                    ))}
                  </span>
                ) : (
                  '—'
                ),
              },
            ]}
          />
          {product.description && (
            <p className="mt-4 border-t border-hairline pt-4 text-sm text-fg-secondary">
              {product.description}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ── Stock ──────────────────────────────────────────────────────────────── */

export function StockTab({ product }: { product: ProductDetail }) {
  const can = useCan();
  const { preferences } = usePreferences();
  const [editing, setEditing] = useState<ProductStock | null>(null);
  const batches = useQuery({
    ...batchesQuery({ productId: product.id, pageSize: 200 }),
    enabled: product.trackExpiry,
  });

  return (
    <div className="flex flex-col gap-4">
      <TableCard
        title="By warehouse"
        description="Reorder levels can differ per warehouse; blank uses the product default."
      >
        <table className="w-full min-w-[760px] border-separate border-spacing-0 text-sm">
          <THead>
            <tr>
              <TH className="pl-5">Warehouse</TH>
              <TH>Status</TH>
              <TH numeric>On hand</TH>
              <TH numeric>Reserved</TH>
              <TH numeric>Available</TH>
              <TH numeric>On order</TH>
              <TH numeric>Reorder / safety / max</TH>
              <TH numeric>Cover</TH>
              <TH numeric className="pr-5">
                Value
              </TH>
            </tr>
          </THead>
          <tbody>
            {product.stock.length === 0 && (
              <tr>
                <td colSpan={9}>
                  <EmptyState
                    compact
                    icon={<Boxes strokeWidth={1.75} />}
                    title="Not stocked anywhere yet"
                    description="Receive stock to start tracking it."
                  />
                </td>
              </tr>
            )}
            {product.stock.map((s) => (
              <TR key={s.warehouse.id} className="[&:last-child_td]:border-b-0">
                <TD density={preferences.density} className="pl-5 font-medium">
                  {s.warehouse.name}
                </TD>
                <TD density={preferences.density}>
                  <StockStatePill state={s.state} />
                </TD>
                <TD numeric density={preferences.density}>
                  {formatNumber(s.onHand)}
                </TD>
                <TD numeric density={preferences.density} className="text-fg-secondary">
                  {s.reserved ? formatNumber(s.reserved) : '—'}
                </TD>
                <TD numeric density={preferences.density} className="font-medium">
                  {formatNumber(s.available)}
                </TD>
                <TD numeric density={preferences.density}>
                  {s.onOrder ? formatNumber(s.onOrder) : '—'}
                </TD>
                <TD numeric density={preferences.density}>
                  <span className="inline-flex items-center gap-1">
                    <span className="text-fg-secondary">
                      {s.reorderPoint ?? '—'} / {s.safetyStock ?? '—'} / {s.maxStock ?? '—'}
                    </span>
                    {can('catalog.manage') && (
                      <IconButton
                        label={`Edit reorder levels at ${s.warehouse.name}`}
                        size="sm"
                        onClick={() => setEditing(s)}
                      >
                        <Pencil strokeWidth={1.75} />
                      </IconButton>
                    )}
                  </span>
                </TD>
                <TD numeric density={preferences.density}>
                  {s.daysOfCover === null ? (
                    <span className="text-fg-tertiary">No sales</span>
                  ) : (
                    formatDays(s.daysOfCover)
                  )}
                  <p className="text-xs text-fg-tertiary">
                    {s.avgDailyDemand ? `${formatNumber(s.avgDailyDemand, { decimals: 1 })}/day` : ''}
                  </p>
                </TD>
                <TD numeric density={preferences.density} className="pr-5">
                  {money(s.value)}
                </TD>
              </TR>
            ))}
          </tbody>
        </table>
      </TableCard>

      {product.trackExpiry && (
        <TableCard
          title="Batches"
          description="Stock by batch, earliest expiry first. Sales and issues take the earliest-expiring batch first."
        >
          <table className="w-full min-w-[640px] border-separate border-spacing-0 text-sm">
            <THead>
              <tr>
                <TH className="pl-5">Batch</TH>
                <TH>Warehouse</TH>
                <TH>Expiry</TH>
                <TH numeric>Quantity</TH>
                <TH numeric>Unit cost</TH>
                <TH className="pr-5">Received</TH>
              </tr>
            </THead>
            <tbody>
              {batches.data?.data.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-6 text-center text-sm text-fg-secondary">
                    No batches with stock.
                  </td>
                </tr>
              )}
              {batches.data?.data.map((b) => (
                <TR key={b.id} className="[&:last-child_td]:border-b-0">
                  <TD density={preferences.density} className="pl-5 font-mono text-xs">
                    {b.batchNo}
                  </TD>
                  <TD density={preferences.density}>{b.warehouse.code}</TD>
                  <TD density={preferences.density}>
                    <span className="flex items-center gap-2">
                      {date(b.expiryDate)}
                      {b.status !== 'OK' && (
                        <StatusPill tone={b.status === 'EXPIRED' ? 'danger' : 'warning'}>
                          {b.status === 'EXPIRED' ? 'Expired' : `${b.daysToExpiry} d left`}
                        </StatusPill>
                      )}
                    </span>
                  </TD>
                  <TD numeric density={preferences.density}>
                    {formatNumber(b.quantity)}
                  </TD>
                  <TD numeric density={preferences.density}>
                    {money(b.unitCost)}
                  </TD>
                  <TD density={preferences.density} className="pr-5 text-fg-secondary">
                    {date(b.receivedAt)}
                  </TD>
                </TR>
              ))}
            </tbody>
          </table>
          {batches.isPending && <Skeleton className="m-5 h-20" />}
        </TableCard>
      )}

      <StockParamsDialog product={product} stock={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function StockParamsDialog({
  product,
  stock,
  onClose,
}: {
  product: ProductDetail;
  stock: ProductStock | null;
  onClose: () => void;
}) {
  const update = useUpdateStockParams(product.id);
  const [values, setValues] = useState({ reorderPoint: '', safetyStock: '', maxStock: '' });
  const [key, setKey] = useState<string | null>(null);
  if (stock && key !== stock.warehouse.id) {
    setKey(stock.warehouse.id);
    setValues({
      reorderPoint: stock.reorderPoint?.toString() ?? '',
      safetyStock: stock.safetyStock?.toString() ?? '',
      maxStock: stock.maxStock?.toString() ?? '',
    });
  }
  const toInt = (v: string) => (v.trim() === '' ? null : Math.max(0, Math.round(Number(v))));
  return (
    <Dialog
      open={stock !== null}
      onOpenChange={(o) => {
        if (!o) {
          onClose();
          setKey(null);
        }
      }}
    >
      <DialogContent size="sm" aria-describedby={undefined}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!stock) return;
            update.mutate(
              {
                warehouseId: stock.warehouse.id,
                reorderPoint: toInt(values.reorderPoint),
                safetyStock: toInt(values.safetyStock),
                maxStock: toInt(values.maxStock),
              },
              {
                onSuccess: () => {
                  toast.success(`Updated reorder levels at ${stock.warehouse.name}`);
                  onClose();
                  setKey(null);
                },
                onError: (err) => reportError(err, undefined, 'Couldn’t update the levels'),
              },
            );
          }}
        >
          <DialogHeader>
            <DialogTitle>Reorder levels · {stock?.warehouse.name}</DialogTitle>
            <p className="text-sm text-fg-secondary">
              Product defaults: {product.reorderPoint ?? '—'} / {product.safetyStock ?? '—'} /{' '}
              {product.maxStock ?? '—'}. Leave blank to use them.
            </p>
          </DialogHeader>
          <DialogBody className="grid grid-cols-3 gap-3">
            {(['reorderPoint', 'safetyStock', 'maxStock'] as const).map((k) => (
              <Field
                key={k}
                label={
                  k === 'reorderPoint' ? 'Reorder point' : k === 'safetyStock' ? 'Safety stock' : 'Max stock'
                }
              >
                <Input
                  type="number"
                  min={0}
                  value={values[k]}
                  onChange={(e) => setValues((v) => ({ ...v, [k]: e.target.value }))}
                  className="tabular"
                />
              </Field>
            ))}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={update.isPending}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ── Movements ──────────────────────────────────────────────────────────── */

export function MovementRows({ rows, showProduct = false }: { rows: Movement[]; showProduct?: boolean }) {
  const { preferences } = usePreferences();
  const d = preferences.density;
  return (
    <>
      {rows.map((m) => (
        <TR key={m.id} className="[&:last-child_td]:border-b-0">
          <TD density={d} className="pl-5 whitespace-nowrap text-fg-secondary">
            {dateTime(m.occurredAt)}
          </TD>
          {showProduct && (
            <TD density={d} className="max-w-64">
              <Link
                to="/products/$id"
                params={{ id: m.product.id }}
                className="block truncate font-medium hover:underline"
              >
                {m.product.name}
              </Link>
              <p className="truncate text-xs text-fg-tertiary">{m.product.sku}</p>
            </TD>
          )}
          <TD density={d}>
            <span className="font-medium">{MOVEMENT_LABELS[m.type]}</span>
            {m.reason && <p className="text-xs text-fg-tertiary">{m.reason.label}</p>}
          </TD>
          <TD density={d} className="text-fg-secondary">
            {m.warehouse.code}
          </TD>
          <TD numeric density={d} className={cn('font-medium', m.quantity > 0 ? 'text-success' : 'text-fg')}>
            {m.quantity > 0 ? '+' : '−'}
            {formatNumber(Math.abs(m.quantity))}
          </TD>
          <TD numeric density={d}>
            {formatNumber(m.balanceAfter)}
          </TD>
          <TD density={d} className="max-w-48">
            <p className="truncate">
              {m.reference ?? <span className="text-fg-tertiary">—</span>}
              {m.batch && (
                <span className="ml-1.5 font-mono text-xs text-fg-tertiary">{m.batch.batchNo}</span>
              )}
            </p>
            {m.note && <p className="truncate text-xs text-fg-tertiary">{m.note}</p>}
          </TD>
          <TD density={d} className="max-w-40 pr-5 text-fg-secondary">
            <ActorLabel actor={m.actor} />
          </TD>
        </TR>
      ))}
    </>
  );
}

export function MovementsHead({ showProduct = false }: { showProduct?: boolean }) {
  return (
    <THead>
      <tr>
        <TH className="pl-5">When</TH>
        {showProduct && <TH>Product</TH>}
        <TH>Movement</TH>
        <TH>Warehouse</TH>
        <TH numeric>Change</TH>
        <TH numeric>Balance</TH>
        <TH>Reference</TH>
        <TH className="pr-5">By</TH>
      </tr>
    </THead>
  );
}

export function MovementsTab({ product }: { product: ProductDetail }) {
  const [warehouseId, setWarehouseId] = useState<string>('all');
  const query = useInfiniteQuery(
    productMovementsQuery(product.id, { warehouseId: warehouseId === 'all' ? undefined : warehouseId }),
  );
  const rows = query.data?.pages.flatMap((p) => p.data) ?? [];
  return (
    <TableCard
      title="Ledger"
      description="Every change to this product’s stock, newest first. Balances are per warehouse."
      action={
        product.stock.length > 1 ? (
          <SegmentedControl
            aria-label="Warehouse"
            size="sm"
            value={warehouseId}
            onValueChange={setWarehouseId}
            options={[
              { value: 'all', label: 'All' },
              ...product.stock.map((s) => ({ value: s.warehouse.id, label: s.warehouse.code })),
            ]}
          />
        ) : undefined
      }
    >
      <table className="w-full min-w-[860px] border-separate border-spacing-0 text-sm">
        <MovementsHead />
        <tbody>
          {query.isPending &&
            Array.from({ length: 6 }, (_, i) => (
              <tr key={i}>
                <td colSpan={7} className="px-5 py-2">
                  <Skeleton className="h-8" />
                </td>
              </tr>
            ))}
          {query.isError && (
            <tr>
              <td colSpan={7}>
                <ErrorState compact error={query.error} onRetry={() => void query.refetch()} />
              </td>
            </tr>
          )}
          {query.data && rows.length === 0 && (
            <tr>
              <td colSpan={7}>
                <EmptyState compact icon={<History strokeWidth={1.75} />} title="No movements yet" />
              </td>
            </tr>
          )}
          <MovementRows rows={rows} />
        </tbody>
      </table>
      {rows.length > 0 && (
        <div className="border-t border-hairline">
          <LoadMore
            hasMore={query.hasNextPage}
            loading={query.isFetchingNextPage}
            onLoad={() => void query.fetchNextPage()}
            shown={rows.length}
            noun="movements"
          />
        </div>
      )}
    </TableCard>
  );
}

/* ── Suppliers ──────────────────────────────────────────────────────────── */

export function SuppliersTab({ product }: { product: ProductDetail }) {
  const query = useQuery(productSuppliersQuery(product.id));
  const { preferences } = usePreferences();
  const d = preferences.density;
  return (
    <TableCard title="Suppliers" description="Who sells this product, on what terms, and what we last paid.">
      <table className="w-full min-w-[760px] border-separate border-spacing-0 text-sm">
        <THead>
          <tr>
            <TH className="pl-5">Supplier</TH>
            <TH numeric>Score</TH>
            <TH numeric>List cost</TH>
            <TH numeric>Last paid</TH>
            <TH numeric>Lead time</TH>
            <TH numeric>MOQ / pack</TH>
            <TH className="pr-5">Last purchase</TH>
          </tr>
        </THead>
        <tbody>
          {query.data?.length === 0 && (
            <tr>
              <td colSpan={7}>
                <EmptyState
                  compact
                  icon={<Truck strokeWidth={1.75} />}
                  title="No supplier sells this yet"
                  description="Add it to a supplier’s catalog from the supplier’s page."
                />
              </td>
            </tr>
          )}
          {query.data?.map((s) => (
            <TR key={s.id} className="[&:last-child_td]:border-b-0">
              <TD density={d} className="pl-5">
                <span className="flex items-center gap-2">
                  <Link
                    to="/suppliers/$id"
                    params={{ id: s.supplier.id }}
                    className="font-medium hover:underline"
                  >
                    {s.supplier.name}
                  </Link>
                  {s.isPreferred && (
                    <Badge tone="accent">
                      <Star className="fill-current" /> Preferred
                    </Badge>
                  )}
                  {!s.isActive && <Badge>Inactive</Badge>}
                </span>
                {s.supplierSku && <p className="font-mono text-xs text-fg-tertiary">{s.supplierSku}</p>}
              </TD>
              <TD numeric density={d}>
                {s.supplierScore !== null ? Math.round(s.supplierScore) : '—'}
                {s.riskLevel && s.riskLevel !== 'LOW' && (
                  <p className={cn('text-xs', s.riskLevel === 'HIGH' ? 'text-danger' : 'text-warning')}>
                    {RISK_LABELS[s.riskLevel]}
                  </p>
                )}
              </TD>
              <TD numeric density={d}>
                {money(s.unitCost)}
              </TD>
              <TD numeric density={d}>
                {s.lastPurchaseCost ? money(s.lastPurchaseCost) : '—'}
              </TD>
              <TD numeric density={d}>
                {formatDays(s.leadTimeDays)}
              </TD>
              <TD numeric density={d}>
                {formatNumber(s.moq)} / {formatNumber(s.packSize)}
              </TD>
              <TD density={d} className="pr-5 text-fg-secondary">
                {date(s.lastPurchasedAt)}
              </TD>
            </TR>
          ))}
        </tbody>
      </table>
      {query.isPending && <Skeleton className="m-5 h-20" />}
    </TableCard>
  );
}

/* ── Activity ───────────────────────────────────────────────────────────── */

export function ActivityTab({ product }: { product: ProductDetail }) {
  const query = useInfiniteQuery(productActivityQuery(product.id));
  const rows = query.data?.pages.flatMap((p) => p.data) ?? [];
  return (
    <Card>
      <CardHeader className="pb-2">
        <div>
          <CardTitle>Activity</CardTitle>
          <CardDescription>Changes to this product’s details, by people and agents.</CardDescription>
        </div>
      </CardHeader>
      {query.isPending ? (
        <div className="flex flex-col gap-3 p-5">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </div>
      ) : query.isError ? (
        <ErrorState compact error={query.error} onRetry={() => void query.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          compact
          icon={<History strokeWidth={1.75} />}
          title="No changes recorded"
          description="Stock movements are on the Movements tab."
        />
      ) : (
        <>
          <ul className="divide-y divide-hairline">
            {rows.map((e) => (
              <AuditItem key={e.id} entry={e} />
            ))}
          </ul>
          {query.hasNextPage && (
            <div className="border-t border-hairline p-3 text-center">
              <Button
                variant="secondary"
                size="sm"
                loading={query.isFetchingNextPage}
                onClick={() => void query.fetchNextPage()}
              >
                Show older
              </Button>
            </div>
          )}
        </>
      )}
    </Card>
  );
}
