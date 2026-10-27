import {
  DEMAND_PATTERN_LABELS,
  FORECAST_METHOD_LABELS,
  type ForecastInsights,
  formatNumber,
} from '@stockroom/shared';
import { Link } from '@tanstack/react-router';
import { Gauge, LineChart, Package, Target } from 'lucide-react';
import { BarsChart, ForecastChart } from '@/components/charts/charts';
import { EmptyState } from '@/components/feedback/states';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { KpiCard } from '@/components/ui/kpi-card';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { ago, today } from '@/lib/format';
import { longDate, Muted, shortDate } from './shared';

const units = (v: number) => formatNumber(v, { decimals: v < 10 ? 1 : 0 });
const pct = (v: number | null) => (v === null ? '—' : `${formatNumber(v, { decimals: 0 })} %`);

export function ForecastPanel({ data }: { data: ForecastInsights }) {
  if (data.products === 0)
    return (
      <Card>
        <EmptyState
          icon={<LineChart strokeWidth={1.75} />}
          title="No forecasts yet"
          description="The Demand Forecaster runs every night and after unusual sales. You can run it now from its page."
          action={
            <Link
              to="/agents/$key"
              params={{ key: 'demand_forecaster' }}
              className="text-sm font-medium text-accent-text hover:underline"
            >
              Open the Demand Forecaster
            </Link>
          }
        />
      </Card>
    );
  const accuracy = data.medianWape === null ? null : Math.max(0, 100 - data.medianWape);
  const now = today();
  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Forecast accuracy"
          icon={<Target strokeWidth={1.75} />}
          value={accuracy ?? 0}
          format={(v) => (accuracy === null ? '—' : `${formatNumber(v, { decimals: 0 })} %`)}
          hint="100 % minus the median WAPE: how close the forecast came to actual sales on held-out recent weeks."
        />
        <KpiCard
          label="Median error (WAPE)"
          icon={<Gauge strokeWidth={1.75} />}
          value={data.medianWape ?? 0}
          format={() => pct(data.medianWape)}
          hint="Weighted absolute percentage error, per product, then the median across products."
        />
        <KpiCard
          label="Products forecast"
          icon={<Package strokeWidth={1.75} />}
          value={data.products}
          format={(v) => formatNumber(Math.round(v))}
          footnote={data.generatedAt ? `Updated ${ago(data.generatedAt)}` : undefined}
        />
        <KpiCard
          label="Median MAPE"
          icon={<Gauge strokeWidth={1.75} />}
          value={data.medianMape ?? 0}
          format={() => pct(data.medianMape)}
          hint="Mean absolute percentage error. It overstates the error for slow sellers, which is why WAPE leads."
        />
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Sales and forecast</CardTitle>
            <CardDescription>
              Units a day: the last four weeks, then the next four with the 80 % likely range
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <ForecastChart
            ariaLabel="Actual units sold per day and the forecast for the next 28 days"
            data={data.series}
            today={data.series.find((d) => d.date >= now)?.date}
            formatValue={units}
            formatTick={shortDate}
            formatLabel={longDate}
          />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>How accurate</CardTitle>
              <CardDescription>Products by forecast error</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <BarsChart
              ariaLabel="Number of products in each error band"
              data={data.buckets}
              xKey="label"
              series={[{ key: 'products', label: 'Products' }]}
              layout="vertical"
              height={200}
            />
          </CardContent>
        </Card>
        <Card className="overflow-hidden xl:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>By method</CardTitle>
              <CardDescription>Each product uses the method that did best on its own history</CardDescription>
            </div>
          </CardHeader>
          <div className="overflow-x-auto border-t border-hairline">
            <Table>
              <THead>
                <TR>
                  <TH>Method</TH>
                  <TH className="text-right">Products</TH>
                  <TH className="text-right">Median WAPE</TH>
                </TR>
              </THead>
              <TBody>
                {data.byMethod.map((m) => (
                  <TR key={m.method}>
                    <TD className="font-medium">{FORECAST_METHOD_LABELS[m.method] ?? m.method}</TD>
                    <TD className="text-right tabular-nums">{formatNumber(m.products)}</TD>
                    <TD className="text-right tabular-nums">{pct(m.medianWape)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card className="overflow-hidden">
          <CardHeader>
            <div>
              <CardTitle>By category</CardTitle>
              <CardDescription>Expected demand and how well it’s predicted</CardDescription>
            </div>
          </CardHeader>
          <div className="overflow-x-auto border-t border-hairline">
            <Table>
              <THead>
                <TR>
                  <TH>Category</TH>
                  <TH className="text-right">Products</TH>
                  <TH className="text-right">Units a day</TH>
                  <TH className="text-right">WAPE</TH>
                </TR>
              </THead>
              <TBody>
                {data.byCategory.map((c) => (
                  <TR key={c.category}>
                    <TD className="font-medium">{c.category}</TD>
                    <TD className="text-right tabular-nums">{formatNumber(c.products)}</TD>
                    <TD className="text-right tabular-nums">{units(c.forecastPerDay)}</TD>
                    <TD className="text-right tabular-nums">{pct(c.medianWape)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        </Card>
        <Card className="overflow-hidden">
          <CardHeader>
            <div>
              <CardTitle>Hardest to predict</CardTitle>
              <CardDescription>
                Regular sellers with the largest error; keep more safety stock here
              </CardDescription>
            </div>
          </CardHeader>
          <div className="overflow-x-auto border-t border-hairline">
            <Table>
              <THead>
                <TR>
                  <TH>Product</TH>
                  <TH>Pattern</TH>
                  <TH className="text-right">Units a day</TH>
                  <TH className="text-right">WAPE</TH>
                </TR>
              </THead>
              <TBody>
                {data.worst.length === 0 ? (
                  <TR>
                    <TD colSpan={4}>
                      <Muted>Every regular seller is forecast within range.</Muted>
                    </TD>
                  </TR>
                ) : (
                  data.worst.map((p) => (
                    <TR key={p.productId}>
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
                      <TD className="text-fg-secondary">{DEMAND_PATTERN_LABELS[p.pattern] ?? p.pattern}</TD>
                      <TD className="text-right tabular-nums">{units(p.avgDailyDemand)}</TD>
                      <TD className="text-right tabular-nums">{pct(p.wape)}</TD>
                    </TR>
                  ))
                )}
              </TBody>
            </Table>
          </div>
        </Card>
      </div>
    </>
  );
}
