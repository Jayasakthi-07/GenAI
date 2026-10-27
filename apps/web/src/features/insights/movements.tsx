import { formatNumber, type MovementInsights, type MovementType } from '@stockroom/shared';
import { Link } from '@tanstack/react-router';
import { addDays, format, parseISO, startOfWeek } from 'date-fns';
import { ArrowDownToLine, ArrowUpFromLine, IndianRupee } from 'lucide-react';
import { TrendChart } from '@/components/charts/charts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { KpiCard } from '@/components/ui/kpi-card';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { inr, inrCompact, longDate, MeterBar, shortDate } from './shared';

type Day = MovementInsights['byDay'][number];

/** Long periods read better as weekly totals. */
function byWeek(days: Day[]): Day[] {
  const weeks = new Map<string, Day>();
  for (const d of days) {
    const key = format(startOfWeek(parseISO(d.date), { weekStartsOn: 1 }), 'yyyy-MM-dd');
    const w = weeks.get(key) ?? {
      date: key,
      received: 0,
      sold: 0,
      transferred: 0,
      adjusted: 0,
      writtenOff: 0,
    };
    w.received += d.received;
    w.sold += d.sold;
    w.transferred += d.transferred;
    w.adjusted += d.adjusted;
    w.writtenOff += d.writtenOff;
    weeks.set(key, w);
  }
  return [...weeks.values()];
}

export function MovementsPanel({ data, days }: { data: MovementInsights; days: number }) {
  const weekly = days > 90;
  const series = weekly ? byWeek(data.byDay) : data.byDay;
  const t = data.totals;
  const maxUnits = Math.max(1, ...data.byType.map((r) => Math.abs(r.units)));
  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Units in"
          icon={<ArrowDownToLine strokeWidth={1.75} />}
          value={t.inUnits}
          format={(v) => formatNumber(Math.round(v))}
          hint="Receipts, incoming transfers, count gains and positive adjustments."
        />
        <KpiCard
          label="Units out"
          icon={<ArrowUpFromLine strokeWidth={1.75} />}
          value={t.outUnits}
          format={(v) => formatNumber(Math.round(v))}
          hint="Sales, issues, outgoing transfers, write-offs and losses."
        />
        <KpiCard
          label="Value in"
          icon={<IndianRupee strokeWidth={1.75} />}
          value={t.inValue}
          format={inrCompact}
          goodDirection="neutral"
          hint="At the cost recorded on each movement."
        />
        <KpiCard
          label="Value out"
          icon={<IndianRupee strokeWidth={1.75} />}
          value={t.outValue}
          format={inrCompact}
          goodDirection="neutral"
          hint="At the cost recorded on each movement."
        />
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>In and out</CardTitle>
            <CardDescription>Units sold and received {weekly ? 'per week' : 'per day'}</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <TrendChart
            ariaLabel={`Units sold and received ${weekly ? 'per week' : 'per day'}`}
            data={series}
            xKey="date"
            series={[
              { key: 'sold', label: 'Sold' },
              { key: 'received', label: 'Received' },
              { key: 'writtenOff', label: 'Written off', color: 'var(--danger)', dashed: true },
            ]}
            formatTick={shortDate}
            formatLabel={(d) =>
              weekly
                ? `Week of ${shortDate(d)} – ${shortDate(format(addDays(parseISO(d), 6), 'yyyy-MM-dd'))}`
                : longDate(d)
            }
          />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card className="overflow-hidden">
          <CardHeader>
            <div>
              <CardTitle>By movement type</CardTitle>
              <CardDescription>Every ledger entry in the period</CardDescription>
            </div>
          </CardHeader>
          <div className="overflow-x-auto border-t border-hairline">
            <Table>
              <THead>
                <TR>
                  <TH>Type</TH>
                  <TH className="text-right">Entries</TH>
                  <TH className="text-right">Units</TH>
                  <TH className="hidden w-28 sm:table-cell" />
                  <TH className="text-right">Value</TH>
                </TR>
              </THead>
              <TBody>
                {data.byType.map((r) => (
                  <TR key={r.type}>
                    <TD className="font-medium">
                      <Link
                        to="/stock/movements"
                        search={{ type: [r.type as MovementType] }}
                        className="hover:underline"
                      >
                        {r.label}
                      </Link>
                    </TD>
                    <TD className="text-right tabular-nums">{formatNumber(r.count)}</TD>
                    <TD className="text-right tabular-nums">{formatNumber(r.units)}</TD>
                    <TD className="hidden sm:table-cell">
                      <MeterBar
                        value={Math.abs(r.units)}
                        max={maxUnits}
                        tone={r.units < 0 ? 'warning' : 'accent'}
                      />
                    </TD>
                    <TD className="text-right tabular-nums">{inr(r.value)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        </Card>
        <Card className="overflow-hidden">
          <CardHeader>
            <div>
              <CardTitle>Fastest moving</CardTitle>
              <CardDescription>Most units out in the period</CardDescription>
            </div>
          </CardHeader>
          <div className="overflow-x-auto border-t border-hairline">
            <Table>
              <THead>
                <TR>
                  <TH>Product</TH>
                  <TH className="text-right">Units out</TH>
                  <TH className="text-right">Value</TH>
                </TR>
              </THead>
              <TBody>
                {data.topOut.map((p) => (
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
                    <TD className="text-right tabular-nums">{formatNumber(p.units)}</TD>
                    <TD className="text-right tabular-nums">{inr(p.value)}</TD>
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
