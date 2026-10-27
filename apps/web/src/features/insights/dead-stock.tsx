import { type DeadStock, formatDays, formatNumber } from '@stockroom/shared';
import { Link } from '@tanstack/react-router';
import { CircleCheck, Hourglass, IndianRupee, PackageX } from 'lucide-react';
import { EmptyState } from '@/components/feedback/states';
import { StatusPill } from '@/components/ui/badge';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { KpiCard } from '@/components/ui/kpi-card';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { money } from '@/lib/format';
import { inr, inrCompact, Muted } from './shared';

export function DeadStockPanel({ data }: { data: DeadStock }) {
  const t = data.totals;
  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard
          label="Dead stock"
          icon={<PackageX strokeWidth={1.75} />}
          value={t.deadValue}
          format={inrCompact}
          goodDirection="down"
          hint="Positions with no sale in the dead-stock window set under Organization settings."
        />
        <KpiCard
          label="Slow stock"
          icon={<Hourglass strokeWidth={1.75} />}
          value={t.slowValue}
          format={inrCompact}
          goodDirection="down"
          hint="Positions with more cover than the overstock limit set under Organization settings."
        />
        <KpiCard
          label="Positions affected"
          icon={<IndianRupee strokeWidth={1.75} />}
          value={t.positions}
          format={(v) => formatNumber(Math.round(v))}
          hint="Only positions worth ₹1,000 or more are listed."
        />
      </div>
      <Card className="overflow-hidden">
        <CardHeader>
          <div>
            <CardTitle>What isn’t moving</CardTitle>
            <CardDescription>
              Suggested prices are markdowns that stay above cost. The Inventory Optimizer proposes them for
              approval.
            </CardDescription>
          </div>
        </CardHeader>
        {data.items.length === 0 ? (
          <EmptyState
            compact
            icon={<CircleCheck strokeWidth={1.75} />}
            title="Everything is moving"
            description="No dead or slow stock matches these filters."
            className="border-t border-hairline"
          />
        ) : (
          <div className="overflow-x-auto border-t border-hairline">
            <Table>
              <THead>
                <TR>
                  <TH>Product</TH>
                  <TH>Warehouse</TH>
                  <TH>Kind</TH>
                  <TH className="text-right">On hand</TH>
                  <TH className="text-right">Value</TH>
                  <TH className="text-right">Last sale</TH>
                  <TH className="text-right">Cover</TH>
                  <TH className="text-right">Price → suggested</TH>
                </TR>
              </THead>
              <TBody>
                {data.items.map((i) => (
                  <TR key={`${i.productId}-${i.warehouseId}`}>
                    <TD>
                      <Link
                        to="/products/$id"
                        params={{ id: i.productId }}
                        className="font-medium hover:underline"
                      >
                        {i.name}
                      </Link>
                      <span className="block text-xs text-fg-tertiary">{i.sku}</span>
                    </TD>
                    <TD className="text-fg-secondary">{i.warehouse}</TD>
                    <TD>
                      <StatusPill tone={i.kind === 'dead' ? 'danger' : 'warning'}>
                        {i.kind === 'dead' ? 'Dead' : 'Slow'}
                      </StatusPill>
                    </TD>
                    <TD className="text-right tabular-nums">{formatNumber(i.onHand)}</TD>
                    <TD className="text-right tabular-nums">{inr(i.value)}</TD>
                    <TD className="text-right tabular-nums">
                      {i.daysSinceSale === null ? (
                        <Muted>Never here</Muted>
                      ) : (
                        `${formatNumber(i.daysSinceSale)} days ago`
                      )}
                    </TD>
                    <TD className="text-right tabular-nums">
                      {i.coverDays === null ? <Muted>—</Muted> : formatDays(i.coverDays)}
                    </TD>
                    <TD className="text-right whitespace-nowrap tabular-nums">
                      {money(i.sellingPrice)}
                      {i.suggestedPrice !== null && (
                        <span className="text-accent-text"> → {money(i.suggestedPrice)}</span>
                      )}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        )}
      </Card>
    </>
  );
}
