import { formatDays, formatNumber, formatPercent, type Valuation } from '@stockroom/shared';
import { Link } from '@tanstack/react-router';
import { Boxes, IndianRupee, Package, Warehouse } from 'lucide-react';
import { CHART_COLORS, DonutChart, TrendChart } from '@/components/charts/charts';
import { EmptyState } from '@/components/feedback/states';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { KpiCard } from '@/components/ui/kpi-card';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { inr, inrCompact, longDate, MeterBar, Muted, shortDate } from './shared';

export function ValuationPanel({ data }: { data: Valuation }) {
  const t = data.totals;
  if (t.positions === 0)
    return (
      <Card>
        <EmptyState
          icon={<Boxes strokeWidth={1.75} />}
          title="No stock matches these filters"
          description="Try another warehouse or category, or receive stock against a purchase order."
          action={
            <Link to="/purchase-orders" className="text-sm font-medium text-accent-text hover:underline">
              Open purchase orders
            </Link>
          }
        />
      </Card>
    );
  const first = data.trend[0]?.value ?? 0;
  const last = data.trend.at(-1)?.value ?? t.value;
  const categories = data.byCategory.slice(0, 7);
  const rest = data.byCategory.slice(7).reduce((a, c) => a + c.value, 0);
  const donut = [
    ...categories.map((c, i) => ({
      label: c.category,
      value: c.value,
      color: CHART_COLORS[i % CHART_COLORS.length],
    })),
    ...(rest > 0 ? [{ label: 'Other', value: rest, color: 'var(--chart-axis)' }] : []),
  ];
  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Inventory value"
          icon={<IndianRupee strokeWidth={1.75} />}
          value={t.value}
          format={inrCompact}
          delta={first > 0 ? last / first - 1 : null}
          deltaLabel="over the period"
          goodDirection="neutral"
          trend={data.trend.map((p) => p.value)}
          hint="On-hand quantity × moving-average cost."
        />
        <KpiCard
          label="Units on hand"
          icon={<Boxes strokeWidth={1.75} />}
          value={t.units}
          format={(v) => formatNumber(Math.round(v))}
        />
        <KpiCard
          label="Products in stock"
          icon={<Package strokeWidth={1.75} />}
          value={t.products}
          format={(v) => formatNumber(Math.round(v))}
        />
        <KpiCard
          label="Stock positions"
          icon={<Warehouse strokeWidth={1.75} />}
          value={t.positions}
          format={(v) => formatNumber(Math.round(v))}
          hint="A product in one warehouse."
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Value over time</CardTitle>
              <CardDescription>
                End-of-day snapshots{data.trend.length ? ` since ${longDate(data.trend[0]!.date)}` : ''}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {data.trend.length > 1 ? (
              <TrendChart
                ariaLabel="Inventory value by day"
                data={data.trend}
                xKey="date"
                series={[{ key: 'value', label: 'Inventory value' }]}
                formatValue={inr}
                formatAxis={inrCompact}
                formatTick={shortDate}
                formatLabel={longDate}
                height={260}
              />
            ) : (
              <p className="py-16 text-center text-sm text-fg-secondary">
                The trend appears after the first nightly snapshots.
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div>
              <CardTitle>By warehouse</CardTitle>
              <CardDescription>Where the money sits</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {data.byWarehouse.map((w) => (
              <div key={w.warehouseId}>
                <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
                  <span className="font-medium">{w.name}</span>
                  <span className="tabular-nums">
                    {inrCompact(w.value)} <Muted>· {formatPercent(w.share, { decimals: 0 })}</Muted>
                  </span>
                </div>
                <MeterBar value={w.share} />
                <p className="mt-1 text-xs text-fg-tertiary tabular-nums">{formatNumber(w.units)} units</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>By category</CardTitle>
              <CardDescription>Share of inventory value</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-5 sm:flex-row xl:flex-col">
            <DonutChart
              ariaLabel="Inventory value by category"
              data={donut}
              formatValue={inr}
              centerValue={inrCompact(t.value)}
              centerLabel="in stock"
            />
            <ul className="flex w-full flex-col gap-1.5 text-sm">
              {donut.map((d) => (
                <li key={d.label} className="flex items-center gap-2">
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ background: d.color }}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1 truncate text-fg-secondary">{d.label}</span>
                  <span className="tabular-nums">
                    {formatPercent(t.value ? d.value / t.value : 0, { decimals: 0 })}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card className="overflow-hidden xl:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Largest positions</CardTitle>
              <CardDescription>The stock tying up the most money</CardDescription>
            </div>
          </CardHeader>
          <div className="overflow-x-auto border-t border-hairline">
            <Table>
              <THead>
                <TR>
                  <TH>Product</TH>
                  <TH>Warehouse</TH>
                  <TH className="text-right">On hand</TH>
                  <TH className="text-right">Value</TH>
                  <TH className="text-right">Cover</TH>
                </TR>
              </THead>
              <TBody>
                {data.topItems.slice(0, 8).map((p) => (
                  <TR key={`${p.productId}-${p.warehouse}`}>
                    <TD>
                      <Link
                        to="/products/$id"
                        params={{ id: p.productId }}
                        className="font-medium hover:underline"
                      >
                        {p.name}
                      </Link>
                      <span className="block text-xs text-fg-tertiary">{p.sku}</span>
                    </TD>
                    <TD className="text-fg-secondary">{p.warehouse}</TD>
                    <TD className="text-right tabular-nums">{formatNumber(p.onHand)}</TD>
                    <TD className="text-right tabular-nums">{inr(p.value)}</TD>
                    <TD className="text-right tabular-nums">
                      {p.daysOfCover === null ? <Muted>No recent sales</Muted> : formatDays(p.daysOfCover)}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        </Card>
      </div>
    </>
  );
}
