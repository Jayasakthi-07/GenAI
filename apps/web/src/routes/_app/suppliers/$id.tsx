import {
  formatDays,
  formatNumber,
  formatPercent,
  type SupplierDetail,
  type SupplierProduct,
} from '@stockroom/shared';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { format, parseISO } from 'date-fns';
import {
  ChevronLeft,
  CircleCheck,
  Mail,
  Package,
  Pencil,
  Phone,
  Plus,
  Receipt,
  Star,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import { BarsChart, TrendChart } from '@/components/charts/charts';
import { RiskPill, ScoreRing } from '@/components/domain/score';
import { DetailList, PoStatusPill } from '@/components/domain/status';
import { PageLoading } from '@/components/feedback/page-loading';
import { EmptyState, ErrorState } from '@/components/feedback/states';
import { Page } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button, IconButton } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/dialog';
import { Tooltip } from '@/components/ui/menus';
import { Skeleton } from '@/components/ui/misc';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TD, TH, THead, TR } from '@/components/ui/table';
import {
  purchaseOrdersQuery,
  supplierCatalogQuery,
  supplierQuery,
  supplierScorecardQuery,
  useRemoveCatalogItem,
} from '@/features/purchasing/api';
import { CatalogItemDialog } from '@/features/purchasing/catalog-dialog';
import { SupplierDialog } from '@/features/purchasing/supplier-form';
import { useCan } from '@/lib/auth';
import { date, money, moneyCompact } from '@/lib/format';
import { reportError } from '@/lib/forms';
import { enumParam } from '@/lib/list-search';
import { cn } from '@/lib/utils';

const TABS = ['scorecard', 'catalog', 'orders', 'details'] as const;

export const Route = createFileRoute('/_app/suppliers/$id')({
  validateSearch: z.object({ tab: enumParam(TABS) }),
  staticData: { title: 'Supplier' },
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(supplierQuery(params.id)).catch(() => undefined),
  component: SupplierPage,
});

function SupplierPage() {
  const { id } = Route.useParams();
  const { tab = 'scorecard' } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const query = useQuery(supplierQuery(id));
  const can = useCan();
  const [editing, setEditing] = useState(false);

  if (query.isPending) return <PageLoading />;
  if (query.isError)
    return (
      <Page>
        <Card>
          <ErrorState
            error={query.error}
            onRetry={() => void query.refetch()}
            title="Couldn’t open this supplier"
          />
        </Card>
      </Page>
    );
  const s = query.data;
  return (
    <Page>
      <Link
        to="/suppliers"
        className="inline-flex items-center gap-1 text-sm text-fg-secondary hover:text-fg"
      >
        <ChevronLeft className="size-4" strokeWidth={1.75} /> Suppliers
      </Link>
      <div className="mt-3 flex flex-col gap-4 pb-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-4">
          <ScoreRing score={s.score} size={64} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-2xl font-semibold tracking-tighter sm:text-3xl">{s.name}</h2>
              {!s.isActive && <Badge>Inactive</Badge>}
            </div>
            <p className="mt-1 text-sm text-fg-secondary">
              <span className="font-mono">{s.code}</span>
              {s.city ? ` · ${s.city}` : ''} · {formatNumber(s.productCount)} products · {s.paymentTermsDays}
              -day terms
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
              <RiskPill risk={s.riskLevel} />
              {s.email && (
                <a
                  href={`mailto:${s.email}`}
                  className="inline-flex items-center gap-1 text-accent-text hover:underline"
                >
                  <Mail className="size-3.5" strokeWidth={1.75} /> {s.email}
                </a>
              )}
              {s.phone && (
                <span className="inline-flex items-center gap-1 text-fg-secondary">
                  <Phone className="size-3.5" strokeWidth={1.75} /> {s.phone}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          {can('suppliers.manage') && (
            <Button variant="secondary" onClick={() => setEditing(true)}>
              <Pencil strokeWidth={1.75} /> Edit
            </Button>
          )}
          {can('purchase_orders.create') && s.isActive && (
            <Button variant="primary" asChild>
              <Link to="/purchase-orders/new" search={{ supplierId: s.id }}>
                <Plus strokeWidth={1.75} /> New purchase order
              </Link>
            </Button>
          )}
        </div>
      </div>

      <Tabs
        value={tab}
        onValueChange={(t) =>
          void navigate({
            search: { tab: t === 'scorecard' ? undefined : (t as (typeof TABS)[number]) },
            replace: true,
          })
        }
      >
        <TabsList>
          <TabsTrigger value="scorecard">Scorecard</TabsTrigger>
          <TabsTrigger value="catalog">Catalog</TabsTrigger>
          <TabsTrigger value="orders">Purchase orders</TabsTrigger>
          <TabsTrigger value="details">Details</TabsTrigger>
        </TabsList>
        <TabsContent value="scorecard">
          <Scorecard supplierId={s.id} />
        </TabsContent>
        <TabsContent value="catalog">
          <Catalog supplier={s} />
        </TabsContent>
        <TabsContent value="orders">
          <Orders supplierId={s.id} />
        </TabsContent>
        <TabsContent value="details">
          <Card className="max-w-2xl">
            <CardContent className="pt-5">
              <DetailList
                items={[
                  { label: 'Contact', value: s.contactName ?? '—' },
                  { label: 'Email', value: s.email ?? '—' },
                  { label: 'Phone', value: s.phone ?? '—' },
                  { label: 'Address', value: s.address ?? s.city ?? '—' },
                  { label: 'GSTIN', value: s.gstin ? <span className="font-mono">{s.gstin}</span> : '—' },
                  { label: 'Payment terms', value: `${s.paymentTermsDays} days` },
                  {
                    label: 'Open orders',
                    value: s.openPoCount ? `${s.openPoCount} · ${money(s.openPoValue)}` : 'None',
                  },
                  { label: 'Notes', value: s.notes ?? '—' },
                ]}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      <SupplierDialog open={editing} onOpenChange={setEditing} supplier={s} />
    </Page>
  );
}

const PARTS = [
  { key: 'onTime', label: 'On-time delivery', weight: 35 },
  { key: 'fill', label: 'Fill rate', weight: 20 },
  { key: 'leadTime', label: 'Lead-time consistency', weight: 15 },
  { key: 'price', label: 'Price stability', weight: 15 },
  { key: 'quality', label: 'Quality (acceptance)', weight: 15 },
] as const;

function Scorecard({ supplierId }: { supplierId: string }) {
  const q = useQuery(supplierScorecardQuery(supplierId));
  if (q.isPending) return <Skeleton className="h-96 rounded-lg" />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const sc = q.data;
  const m = sc.metrics;
  const pct = (v: number | null) => (v === null ? '—' : formatPercent(v));
  const monthly = sc.monthly.map((x) => ({
    ...x,
    label: format(parseISO(`${x.month}-01`), 'MMM yy'),
    onTime: x.onTimeRate === null ? null : Math.round(x.onTimeRate * 1000) / 10,
    fill: x.fillRate === null ? null : Math.round(x.fillRate * 1000) / 10,
  }));
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Score breakdown</CardTitle>
            <CardDescription>
              Last {sc.periodDays} days · computed from purchase orders and receipts, not by AI.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-3.5">
          {PARTS.map((p) => {
            const v = sc.breakdown[p.key];
            return (
              <div key={p.key}>
                <div className="flex items-baseline justify-between text-sm">
                  <span>
                    {p.label} <span className="text-xs text-fg-tertiary">· {p.weight}%</span>
                  </span>
                  <span className="tabular font-medium">{v === null ? '—' : Math.round(v)}</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-neutral-soft">
                  <div
                    className={cn(
                      'h-full rounded-full',
                      v === null ? '' : v >= 85 ? 'bg-success' : v >= 70 ? 'bg-warning' : 'bg-danger',
                    )}
                    style={{ width: `${v ?? 0}%` }}
                  />
                </div>
              </div>
            );
          })}
          {sc.flags.length > 0 ? (
            <ul className="mt-2 flex flex-col gap-2 border-t border-hairline pt-3">
              {sc.flags.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm text-warning">
                  <TriangleAlert className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} />
                  <span className="text-fg">{f}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 flex items-center gap-2 border-t border-hairline pt-3 text-sm text-fg-secondary">
              <CircleCheck className="size-4 text-success" strokeWidth={1.75} /> No warning signs.
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="xl:col-span-2">
        <CardHeader>
          <div>
            <CardTitle>Delivery performance</CardTitle>
            <CardDescription>Monthly on-time and fill rates</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {monthly.length ? (
            <TrendChart
              ariaLabel="Monthly on-time and fill rates"
              data={monthly}
              xKey="label"
              series={[
                { key: 'onTime', label: 'On time' },
                { key: 'fill', label: 'Fill rate', color: 'var(--chart-5)' },
              ]}
              formatValue={(v) => `${v}%`}
              formatAxis={(v) => `${v}%`}
              height={240}
            />
          ) : (
            <EmptyState compact icon={<Receipt strokeWidth={1.75} />} title="No deliveries yet" />
          )}
          <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-hairline pt-4 text-sm sm:grid-cols-4">
            <Metric label="On time" value={pct(m.onTimeRate)} />
            <Metric label="Fill rate" value={pct(m.fillRate)} />
            <Metric
              label="Avg lead time"
              value={m.avgLeadTimeDays === null ? '—' : formatDays(m.avgLeadTimeDays)}
              sub={
                m.leadTimeCv !== null
                  ? `±${formatPercent(m.leadTimeCv, { decimals: 0 })} variation`
                  : undefined
              }
            />
            <Metric label="Rejected" value={pct(m.rejectionRate)} />
            <Metric
              label="Price change"
              value={m.priceChange === null ? '—' : formatPercent(m.priceChange, { signed: true })}
              sub="Last 90 vs prior 90 days"
            />
            <Metric label="Orders" value={formatNumber(m.orders)} />
            <Metric label="Receipts" value={formatNumber(m.receipts)} />
            <Metric label="Spend" value={moneyCompact(m.spend)} />
          </div>
        </CardContent>
      </Card>

      <Card className="xl:col-span-1">
        <CardHeader>
          <div>
            <CardTitle>Spend</CardTitle>
            <CardDescription>Ordered value per month</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {monthly.length ? (
            <BarsChart
              ariaLabel="Monthly spend"
              data={monthly}
              xKey="label"
              series={[{ key: 'spend', label: 'Spend' }]}
              formatValue={(v) => money(v)}
              formatAxis={(v) => moneyCompact(v)}
              height={220}
            />
          ) : (
            <EmptyState compact icon={<Receipt strokeWidth={1.75} />} title="No orders yet" />
          )}
        </CardContent>
      </Card>

      <Card className="overflow-hidden xl:col-span-2">
        <CardHeader className="pb-3">
          <div>
            <CardTitle>Recent deliveries</CardTitle>
            <CardDescription>Late deliveries and short shipments lower the score.</CardDescription>
          </div>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] border-separate border-spacing-0 text-sm">
            <THead>
              <tr>
                <TH className="pl-5">Receipt</TH>
                <TH>Expected</TH>
                <TH>Received</TH>
                <TH numeric>Timing</TH>
                <TH numeric className="pr-5">
                  Filled
                </TH>
              </tr>
            </THead>
            <tbody>
              {sc.recentDeliveries.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-6 text-center text-fg-secondary">
                    No deliveries yet.
                  </td>
                </tr>
              )}
              {sc.recentDeliveries.map((d) => (
                <TR key={d.receiptNumber} className="[&:last-child_td]:border-b-0">
                  <TD density="compact" className="pl-5">
                    <p className="font-medium">{d.receiptNumber}</p>
                    <Link
                      to="/purchase-orders/$id"
                      params={{ id: d.purchaseOrderId }}
                      className="text-xs text-accent-text hover:underline"
                    >
                      {d.poNumber}
                    </Link>
                  </TD>
                  <TD density="compact" className="text-fg-secondary">
                    {date(d.expectedDate)}
                  </TD>
                  <TD density="compact" className="text-fg-secondary">
                    {date(d.receivedAt)}
                  </TD>
                  <TD
                    numeric
                    density="compact"
                    className={cn(d.daysLate !== null && d.daysLate > 1 && 'text-danger')}
                  >
                    {d.daysLate === null ? '—' : d.daysLate <= 0 ? 'On time' : `${d.daysLate} d late`}
                  </TD>
                  <TD numeric density="compact" className={cn('pr-5', d.fillRate < 0.95 && 'text-warning')}>
                    {formatPercent(d.fillRate, { decimals: 0 })}
                    {d.rejected > 0 && (
                      <span className="block text-xs text-danger">{d.rejected} rejected</span>
                    )}
                  </TD>
                </TR>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function Metric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <p className="text-xs text-fg-secondary">{label}</p>
      <p className="tabular font-semibold">{value}</p>
      {sub && <p className="text-xs text-fg-tertiary">{sub}</p>}
    </div>
  );
}

function Catalog({ supplier }: { supplier: SupplierDetail }) {
  const q = useQuery(supplierCatalogQuery(supplier.id));
  const can = useCan();
  const remove = useRemoveCatalogItem(supplier.id);
  const [editing, setEditing] = useState<SupplierProduct | undefined>();
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<SupplierProduct | null>(null);
  const manage = can('suppliers.manage');
  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <div>
          <CardTitle>Catalog</CardTitle>
          <CardDescription>Products {supplier.name} sells us, with their terms.</CardDescription>
        </div>
        {manage && (
          <Button variant="secondary" size="sm" onClick={() => setAdding(true)}>
            <Plus strokeWidth={1.75} /> Add product
          </Button>
        )}
      </CardHeader>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-separate border-spacing-0 text-sm">
          <THead>
            <tr>
              <TH className="pl-5">Product</TH>
              <TH numeric>Unit cost</TH>
              <TH numeric>Pack / MOQ</TH>
              <TH numeric>Lead time</TH>
              <TH>Last ordered</TH>
              {manage && <TH className="w-20 pr-5" aria-label="Actions" />}
            </tr>
          </THead>
          <tbody>
            {q.data?.length === 0 && (
              <tr>
                <td colSpan={6}>
                  <EmptyState
                    compact
                    icon={<Package strokeWidth={1.75} />}
                    title="No products yet"
                    description="Add what this supplier sells to order from them."
                  />
                </td>
              </tr>
            )}
            {q.data?.map((l) => (
              <TR key={l.id} className={cn('[&:last-child_td]:border-b-0', !l.isActive && 'opacity-60')}>
                <TD className="pl-5">
                  <span className="flex items-center gap-2">
                    <Link
                      to="/products/$id"
                      params={{ id: l.product.id }}
                      className="font-medium hover:underline"
                    >
                      {l.product.name}
                    </Link>
                    {l.isPreferred && (
                      <Tooltip content="Preferred supplier for this product">
                        <Star className="size-3.5 fill-accent text-accent" aria-label="Preferred" />
                      </Tooltip>
                    )}
                    {!l.isActive && <Badge>Unavailable</Badge>}
                  </span>
                  <p className="text-xs text-fg-tertiary">
                    {l.product.sku}
                    {l.supplierSku && <span className="font-mono"> · {l.supplierSku}</span>}
                  </p>
                </TD>
                <TD numeric>{money(l.unitCost)}</TD>
                <TD numeric>
                  {formatNumber(l.packSize)} / {formatNumber(l.moq)}
                </TD>
                <TD numeric>{formatDays(l.leadTimeDays)}</TD>
                <TD className="text-fg-secondary">{date(l.lastPurchasedAt)}</TD>
                {manage && (
                  <TD className="pr-5">
                    <span className="flex justify-end gap-0.5">
                      <IconButton
                        label={`Edit terms for ${l.product.name}`}
                        size="sm"
                        onClick={() => setEditing(l)}
                      >
                        <Pencil strokeWidth={1.75} />
                      </IconButton>
                      <IconButton label={`Remove ${l.product.name}`} size="sm" onClick={() => setRemoving(l)}>
                        <Trash2 strokeWidth={1.75} />
                      </IconButton>
                    </span>
                  </TD>
                )}
              </TR>
            ))}
          </tbody>
        </table>
        {q.isPending && <Skeleton className="m-5 h-24" />}
        {q.isError && <ErrorState compact error={q.error} onRetry={() => void q.refetch()} />}
      </div>
      <CatalogItemDialog supplierId={supplier.id} open={adding} onOpenChange={setAdding} />
      <CatalogItemDialog
        supplierId={supplier.id}
        item={editing}
        open={Boolean(editing)}
        onOpenChange={(o) => !o && setEditing(undefined)}
      />
      <ConfirmDialog
        open={Boolean(removing)}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={`Remove ${removing?.product.name ?? ''}?`}
        description={`${supplier.name} will no longer be offered for this product. Past orders are kept.`}
        confirmLabel="Remove"
        tone="danger"
        loading={remove.isPending}
        onConfirm={() =>
          removing &&
          remove.mutate(removing.id, {
            onSuccess: () => (toast.success('Removed from catalog'), setRemoving(null)),
            onError: (e) => (reportError(e, undefined, 'Couldn’t remove'), setRemoving(null)),
          })
        }
      />
    </Card>
  );
}

function Orders({ supplierId }: { supplierId: string }) {
  const navigate = useNavigate();
  const q = useQuery(purchaseOrdersQuery({ supplierId, pageSize: 25, sort: 'orderDate:desc' }));
  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <div>
          <CardTitle>Purchase orders</CardTitle>
          <CardDescription>
            {q.data ? `${formatNumber(q.data.meta.total)} in total · latest 25` : 'Latest orders'}
          </CardDescription>
        </div>
        <Button variant="ghost" size="sm" asChild>
          <Link to="/purchase-orders" search={{ supplierId }}>
            View all
          </Link>
        </Button>
      </CardHeader>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[600px] border-separate border-spacing-0 text-sm">
          <THead>
            <tr>
              <TH className="pl-5">Order</TH>
              <TH>Status</TH>
              <TH>Ordered</TH>
              <TH>Expected</TH>
              <TH numeric className="pr-5">
                Total
              </TH>
            </tr>
          </THead>
          <tbody>
            {q.data?.data.map((po) => (
              <TR
                key={po.id}
                interactive
                className="[&:last-child_td]:border-b-0"
                onClick={() => void navigate({ to: '/purchase-orders/$id', params: { id: po.id } })}
              >
                <TD density="compact" className="pl-5 font-medium">
                  {po.number}
                </TD>
                <TD density="compact">
                  <PoStatusPill status={po.status} />
                </TD>
                <TD density="compact" className="text-fg-secondary">
                  {date(po.orderDate)}
                </TD>
                <TD density="compact" className={cn('text-fg-secondary', po.overdue && 'text-danger')}>
                  {date(po.expectedDate)}
                  {po.overdue && ' · overdue'}
                </TD>
                <TD numeric density="compact" className="pr-5">
                  {money(po.total)}
                </TD>
              </TR>
            ))}
          </tbody>
        </table>
        {q.isPending && <Skeleton className="m-5 h-24" />}
        {q.data?.data.length === 0 && (
          <EmptyState compact icon={<Receipt strokeWidth={1.75} />} title="No purchase orders yet" />
        )}
      </div>
    </Card>
  );
}
