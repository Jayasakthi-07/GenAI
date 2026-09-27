import { formatDays, formatMoney, formatNumber, formatPercent } from '@stockroom/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { format, parseISO } from 'date-fns';
import {
  Boxes,
  CircleCheck,
  Clock,
  IndianRupee,
  PackageX,
  RefreshCcw,
  TrendingUp,
  Warehouse,
} from 'lucide-react';
import { z } from 'zod';
import { CHART_COLORS, DonutChart, TrendChart } from '@/components/charts/charts';
import { EmptyState, ErrorState } from '@/components/feedback/states';
import { Page, PageHeader } from '@/components/layout/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { KpiCard, KpiCardSkeleton } from '@/components/ui/kpi-card';
import { Skeleton } from '@/components/ui/misc';
import { SegmentedControl } from '@/components/ui/tabs';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { dashboardOverviewQuery } from '@/features/dashboard/api';
import { useMe } from '@/lib/auth';
import { usePreferences } from '@/lib/preferences';
import { cn } from '@/lib/utils';

const RANGES = ['30', '90', '180', '365'] as const;

export const Route = createFileRoute('/_app/')({
  validateSearch: z.object({ range: z.enum(RANGES).optional().catch(undefined) }),
  staticData: { title: 'Dashboard' },
  component: DashboardPage,
});

const money = (v: number) => formatMoney(Math.round(v), { compactDecimals: true });
const moneyCompact = (v: number) => formatMoney(v, { compact: true });
const shortDate = (d: string) => format(parseISO(d), 'd MMM');
const longDate = (d: string) => format(parseISO(d), 'EEE, d MMM yyyy');
const change = (current: number, previous: number) => (previous > 0 ? current / previous - 1 : null);

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

function DashboardPage() {
  const { user, organization } = useMe();
  const navigate = useNavigate({ from: Route.fullPath });
  const range = Route.useSearch().range ?? '90';
  const days = Number(range);
  const { preferences } = usePreferences();
  const query = useQuery({ ...dashboardOverviewQuery(days), placeholderData: keepPreviousData });
  const data = query.data;

  return (
    <Page>
      <PageHeader
        title={`${greeting()}, ${user.name.split(' ')[0]}`}
        description={
          data
            ? `${organization.name} · ${data.kpis.warehouses} warehouses · ${formatNumber(data.kpis.activeSkus)} active products`
            : organization.name
        }
        actions={
          <SegmentedControl
            aria-label="Chart range"
            value={range}
            onValueChange={(value) =>
              void navigate({ search: { range: value === '90' ? undefined : value } })
            }
            options={RANGES.map((r) => ({
              value: r,
              label: r === '365' ? '1Y' : `${r}D`,
              ariaLabel: `Last ${r} days`,
            }))}
          />
        }
      />

      {query.isError && !data ? (
        <Card>
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        </Card>
      ) : (
        <div
          className={cn('flex flex-col gap-4', query.isFetching && data && 'opacity-80 transition-opacity')}
        >
          {/* KPIs */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {data ? (
              <>
                <KpiCard
                  label="Inventory value"
                  icon={<IndianRupee strokeWidth={1.75} />}
                  value={Number(data.kpis.inventoryValue.current)}
                  format={moneyCompact}
                  delta={change(
                    Number(data.kpis.inventoryValue.current),
                    Number(data.kpis.inventoryValue.previous),
                  )}
                  deltaLabel="vs 30 days ago"
                  goodDirection="neutral"
                  trend={data.valueTrend.slice(-30).map((p) => p.value)}
                  hint="On-hand quantity × moving-average cost, all warehouses."
                />
                <KpiCard
                  label="Revenue · 30 days"
                  icon={<TrendingUp strokeWidth={1.75} />}
                  value={Number(data.kpis.revenue.current)}
                  format={moneyCompact}
                  delta={change(Number(data.kpis.revenue.current), Number(data.kpis.revenue.previous))}
                  deltaLabel="vs prior 30 days"
                  trend={data.salesTrend.slice(-30).map((p) => p.revenue)}
                />
                <KpiCard
                  label="Fill rate · 30 days"
                  icon={<CircleCheck strokeWidth={1.75} />}
                  value={data.kpis.fillRate.current}
                  format={(v) => formatPercent(v, { decimals: 1 })}
                  delta={data.kpis.fillRate.current - data.kpis.fillRate.previous}
                  deltaLabel="pts vs prior 30 days"
                  hint="Units shipped ÷ units ordered by customers."
                />
                <KpiCard
                  label="Days of inventory"
                  icon={<Clock strokeWidth={1.75} />}
                  value={data.kpis.daysOfInventory}
                  format={(v) => formatDays(v)}
                  footnote="At the last 90 days’ rate of sales"
                  hint="Inventory value ÷ average daily cost of goods sold over the last 90 days."
                />
              </>
            ) : (
              Array.from({ length: 4 }, (_, i) => <KpiCardSkeleton key={i} />)
            )}
          </div>

          {/* Attention strip */}
          {data && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <AttentionStat
                icon={<PackageX strokeWidth={1.75} />}
                tone={data.kpis.outOfStock > 0 ? 'danger' : 'success'}
                value={data.kpis.outOfStock}
                label="Out of stock"
                detail="Product × warehouse, nothing on hand"
              />
              <AttentionStat
                icon={<RefreshCcw strokeWidth={1.75} />}
                tone={data.kpis.needsReorder > 0 ? 'warning' : 'success'}
                value={data.kpis.needsReorder}
                label="Need reordering"
                detail="At or below reorder point, nothing on order"
              />
              <AttentionStat
                icon={<Boxes strokeWidth={1.75} />}
                tone="neutral"
                value={data.kpis.unitsSold.current}
                label="Units sold · 30 days"
                detail={`${formatPercent(change(data.kpis.unitsSold.current, data.kpis.unitsSold.previous) ?? 0, { signed: true })} vs prior 30 days`}
              />
            </div>
          )}

          {/* Sales + category mix */}
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader>
                <div>
                  <CardTitle>Sales</CardTitle>
                  <CardDescription>Daily revenue with a 7-day average</CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                {data ? (
                  <TrendChart
                    ariaLabel={`Daily revenue for the last ${days} days`}
                    data={data.salesTrend}
                    xKey="date"
                    series={[
                      { key: 'revenue', label: 'Revenue' },
                      { key: 'average', label: '7-day average', color: 'var(--chart-3)', dashed: true },
                    ]}
                    formatValue={money}
                    formatAxis={moneyCompact}
                    formatTick={shortDate}
                    formatLabel={longDate}
                    height={260}
                  />
                ) : (
                  <Skeleton className="h-[260px]" />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Stock by category</CardTitle>
                  <CardDescription>Share of inventory value</CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                {data ? (
                  data.categoryMix.length ? (
                    <CategoryMix mix={data.categoryMix} total={Number(data.kpis.inventoryValue.current)} />
                  ) : (
                    <EmptyState
                      compact
                      icon={<Warehouse strokeWidth={1.75} />}
                      title="No stock yet"
                      description="Receive stock to see how value splits across categories."
                    />
                  )
                ) : (
                  <Skeleton className="h-[260px]" />
                )}
              </CardContent>
            </Card>
          </div>

          {/* Value trend + top movers */}
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Inventory value</CardTitle>
                  <CardDescription>End-of-day value across all warehouses</CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                {data ? (
                  <TrendChart
                    ariaLabel={`Inventory value for the last ${days} days`}
                    data={data.valueTrend}
                    xKey="date"
                    series={[{ key: 'value', label: 'Inventory value' }]}
                    formatValue={money}
                    formatAxis={moneyCompact}
                    formatTick={shortDate}
                    formatLabel={longDate}
                    height={260}
                  />
                ) : (
                  <Skeleton className="h-[260px]" />
                )}
              </CardContent>
            </Card>

            <Card className="overflow-hidden">
              <CardHeader>
                <div>
                  <CardTitle>Top movers</CardTitle>
                  <CardDescription>Highest revenue in the last 30 days</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="px-0 pb-2">
                {data ? (
                  data.topMovers.length ? (
                    <>
                      <ul className="divide-y divide-hairline sm:hidden">
                        {data.topMovers.map((m) => {
                          const delta = change(m.revenue, m.previousRevenue);
                          return (
                            <li key={m.productId} className="px-5 py-3">
                              <p className="text-sm font-medium">{m.name}</p>
                              <div className="mt-0.5 flex items-center justify-between gap-3 text-xs text-fg-tertiary">
                                <span className="truncate">
                                  {m.sku} · {formatNumber(m.units)} units
                                </span>
                                <span className="shrink-0 tabular">
                                  <span className="text-sm font-medium text-fg">{money(m.revenue)}</span>
                                  {delta !== null && (
                                    <span
                                      className={cn('ml-1.5', delta >= 0 ? 'text-success' : 'text-danger')}
                                    >
                                      {formatPercent(delta, { signed: true })}
                                    </span>
                                  )}
                                </span>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                      <Table className="hidden table-fixed sm:table">
                        <THead>
                          <TR>
                            <TH className="pl-5">Product</TH>
                            <TH numeric className="w-20">
                              Units
                            </TH>
                            <TH numeric className="w-32 pr-5">
                              Revenue
                            </TH>
                          </TR>
                        </THead>
                        <TBody>
                          {data.topMovers.map((m) => {
                            const delta = change(m.revenue, m.previousRevenue);
                            return (
                              <TR key={m.productId}>
                                <TD density={preferences.density} className="max-w-0 pl-5">
                                  <p className="truncate font-medium">{m.name}</p>
                                  <p className="truncate text-xs text-fg-tertiary">
                                    {m.sku} · {m.category}
                                  </p>
                                </TD>
                                <TD numeric density={preferences.density}>
                                  {formatNumber(m.units)}
                                </TD>
                                <TD numeric density={preferences.density} className="pr-5">
                                  <p className="font-medium">{money(m.revenue)}</p>
                                  {delta !== null && (
                                    <p className={cn('text-xs', delta >= 0 ? 'text-success' : 'text-danger')}>
                                      {formatPercent(delta, { signed: true })}
                                    </p>
                                  )}
                                </TD>
                              </TR>
                            );
                          })}
                        </TBody>
                      </Table>
                    </>
                  ) : (
                    <EmptyState
                      compact
                      icon={<TrendingUp strokeWidth={1.75} />}
                      title="No sales in the last 30 days"
                    />
                  )
                ) : (
                  <div className="flex flex-col gap-3 px-5">
                    {Array.from({ length: 6 }, (_, i) => (
                      <Skeleton key={i} className="h-10" />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </Page>
  );
}

function AttentionStat({
  icon,
  tone,
  value,
  label,
  detail,
}: {
  icon: React.ReactNode;
  tone: 'danger' | 'warning' | 'success' | 'neutral';
  value: number;
  label: string;
  detail: string;
}) {
  const toneClasses = {
    danger: 'bg-danger-soft text-danger',
    warning: 'bg-warning-soft text-warning',
    success: 'bg-success-soft text-success',
    neutral: 'bg-neutral-soft text-fg-secondary',
  }[tone];
  return (
    <Card className="flex items-center gap-4 p-4">
      <div
        className={cn('grid size-10 shrink-0 place-items-center rounded-full [&_svg]:size-5', toneClasses)}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <p className="flex flex-wrap items-baseline gap-x-2">
          <span className="tabular text-xl font-semibold tracking-tight">{formatNumber(value)}</span>
          <span className="text-sm font-medium text-fg-secondary">{label}</span>
        </p>
        <p className="line-clamp-2 text-xs text-fg-tertiary">{detail}</p>
      </div>
    </Card>
  );
}

function CategoryMix({
  mix,
  total,
}: {
  mix: Array<{ category: string; value: number; share: number }>;
  total: number;
}) {
  // Top five categories, the rest grouped, so the donut stays readable.
  const top = mix.slice(0, 5);
  const rest = mix.slice(5);
  const rows = rest.length
    ? [
        ...top,
        {
          category: 'Other',
          value: rest.reduce((a, r) => a + r.value, 0),
          share: rest.reduce((a, r) => a + r.share, 0),
        },
      ]
    : top;
  const colors = [...CHART_COLORS.slice(0, 4), 'var(--chart-5)', 'var(--hairline-strong)'];
  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row xl:flex-col 2xl:flex-row">
      <DonutChart
        ariaLabel="Inventory value by category"
        data={rows.map((r, i) => ({ label: r.category, value: r.value, color: colors[i] }))}
        formatValue={money}
        centerValue={moneyCompact(total)}
        centerLabel="Total"
        size={168}
      />
      <ul className="flex w-full flex-col gap-2">
        {rows.map((r, i) => (
          <li key={r.category} className="flex items-center gap-2.5 text-sm">
            <span className="size-2.5 shrink-0 rounded-full" style={{ background: colors[i] }} aria-hidden />
            <span className="min-w-0 flex-1 truncate text-fg-secondary">{r.category}</span>
            <span className="tabular font-medium">{formatPercent(r.share, { decimals: 0 })}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
