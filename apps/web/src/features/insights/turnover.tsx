import { formatDays, formatNumber, type Turnover } from '@stockroom/shared';
import { Clock, IndianRupee, RefreshCcw } from 'lucide-react';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { KpiCard } from '@/components/ui/kpi-card';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { inr, inrCompact, MeterBar, Muted } from './shared';

type Row = Turnover['overall'];

function TurnoverTable({
  title,
  column,
  description,
  rows,
}: {
  title: string;
  column: string;
  description: string;
  rows: Row[];
}) {
  const max = Math.max(1, ...rows.map((r) => r.turnover ?? 0));
  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <div>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
      </CardHeader>
      <div className="overflow-x-auto border-t border-hairline">
        <Table>
          <THead>
            <TR>
              <TH>{column}</TH>
              <TH className="text-right">Cost of sales</TH>
              <TH className="text-right">Stock value</TH>
              <TH className="text-right">Turns a year</TH>
              <TH className="hidden w-24 md:table-cell" />
              <TH className="text-right">Days of stock</TH>
            </TR>
          </THead>
          <TBody>
            {rows.map((r) => (
              <TR key={r.key}>
                <TD className="font-medium">{r.label}</TD>
                <TD className="text-right tabular-nums">{inr(r.cogs)}</TD>
                <TD className="text-right tabular-nums">{inr(r.inventoryValue)}</TD>
                <TD className="text-right tabular-nums">
                  {r.turnover === null ? <Muted>—</Muted> : `${formatNumber(r.turnover, { decimals: 1 })}×`}
                </TD>
                <TD className="hidden md:table-cell">
                  <MeterBar
                    value={r.turnover ?? 0}
                    max={max}
                    tone={(r.turnover ?? 0) < 4 ? 'warning' : 'accent'}
                  />
                </TD>
                <TD className="text-right tabular-nums">
                  {r.daysOfInventory === null ? <Muted>No sales</Muted> : formatDays(r.daysOfInventory)}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </div>
    </Card>
  );
}

export function TurnoverPanel({ data }: { data: Turnover }) {
  const o = data.overall;
  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Turnover"
          icon={<RefreshCcw strokeWidth={1.75} />}
          value={o.turnover ?? 0}
          format={(v) => (o.turnover === null ? '—' : `${formatNumber(v, { decimals: 1 })}× a year`)}
          hint="Cost of goods sold over the period, scaled to a year, ÷ average inventory value."
        />
        <KpiCard
          label="Days of inventory"
          icon={<Clock strokeWidth={1.75} />}
          value={o.daysOfInventory ?? 0}
          format={(v) => (o.daysOfInventory === null ? '—' : formatDays(v))}
          hint="How long the average stock lasts at the period’s average daily cost of sales."
        />
        <KpiCard
          label={`Cost of sales · ${data.days} days`}
          icon={<IndianRupee strokeWidth={1.75} />}
          value={o.cogs}
          format={inrCompact}
          goodDirection="neutral"
        />
        <KpiCard
          label="Average stock value"
          icon={<IndianRupee strokeWidth={1.75} />}
          value={o.inventoryValue}
          format={inrCompact}
          goodDirection="neutral"
          hint="Average of the nightly snapshots over the period."
        />
      </div>
      <div className="grid grid-cols-1 gap-4 2xl:grid-cols-2">
        <TurnoverTable
          title="By category"
          column="Category"
          description="Against today’s stock value; slow categories tie up cash"
          rows={data.byCategory}
        />
        <TurnoverTable
          title="By warehouse"
          column="Warehouse"
          description="Against today’s stock value"
          rows={data.byWarehouse}
        />
      </div>
    </>
  );
}
