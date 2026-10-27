import { formatDays, formatNumber, formatPercent, type SupplierInsights } from '@stockroom/shared';
import { Link } from '@tanstack/react-router';
import { Factory } from 'lucide-react';
import { RiskPill, ScoreRing } from '@/components/domain/score';
import { EmptyState } from '@/components/feedback/states';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { inrCompact, Muted } from './shared';

const rate = (v: number | null, warnBelow: number) =>
  v === null ? (
    <Muted>—</Muted>
  ) : (
    <span className={cn(v < warnBelow && 'text-warning')}>{formatPercent(v, { decimals: 0 })}</span>
  );

export function SuppliersPanel({ data }: { data: SupplierInsights }) {
  if (data.suppliers.length === 0)
    return (
      <Card>
        <EmptyState
          icon={<Factory strokeWidth={1.75} />}
          title="No suppliers yet"
          description="Add suppliers and place purchase orders; scores build up from deliveries."
          action={
            <Link to="/suppliers" className="text-sm font-medium text-accent-text hover:underline">
              Open suppliers
            </Link>
          }
        />
      </Card>
    );
  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <div>
          <CardTitle>Supplier performance</CardTitle>
          <CardDescription>
            Scores from the last 180 days of orders and deliveries. Period and filters don’t apply here.
          </CardDescription>
        </div>
      </CardHeader>
      <div className="overflow-x-auto border-t border-hairline">
        <Table>
          <THead>
            <TR>
              <TH>Supplier</TH>
              <TH className="text-right">Score</TH>
              <TH>Risk</TH>
              <TH className="text-right">On time</TH>
              <TH className="text-right">Fill rate</TH>
              <TH className="text-right">Lead time</TH>
              <TH className="text-right">Price change</TH>
              <TH className="text-right">Overdue</TH>
              <TH className="text-right">Spend</TH>
            </TR>
          </THead>
          <TBody>
            {data.suppliers.map((s) => (
              <TR key={s.supplierId}>
                <TD>
                  <Link
                    to="/suppliers/$id"
                    params={{ id: s.supplierId }}
                    className="font-medium hover:underline"
                  >
                    {s.name}
                  </Link>
                  <span className="block text-xs text-fg-tertiary">
                    {s.code} · {formatNumber(s.orders)} {s.orders === 1 ? 'order' : 'orders'}
                  </span>
                </TD>
                <TD className="text-right">
                  <span className="inline-flex justify-end">
                    <ScoreRing score={s.score} size={32} />
                  </span>
                </TD>
                <TD>
                  <RiskPill risk={s.risk} />
                </TD>
                <TD className="text-right tabular-nums">{rate(s.onTimeRate, 0.85)}</TD>
                <TD className="text-right tabular-nums">{rate(s.fillRate, 0.95)}</TD>
                <TD className="text-right tabular-nums">
                  {s.avgLeadTimeDays === null ? <Muted>—</Muted> : formatDays(s.avgLeadTimeDays)}
                </TD>
                <TD className="text-right tabular-nums">
                  {s.priceChange === null ? (
                    <Muted>—</Muted>
                  ) : (
                    <span className={cn(s.priceChange > 0.03 && 'text-warning')}>
                      {formatPercent(s.priceChange, { decimals: 1, signed: true })}
                    </span>
                  )}
                </TD>
                <TD className="text-right tabular-nums">
                  {s.overdue ? (
                    <span className="text-danger">{formatNumber(s.overdue)}</span>
                  ) : (
                    <Muted>0</Muted>
                  )}
                </TD>
                <TD className="text-right tabular-nums">{inrCompact(s.spend)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </div>
    </Card>
  );
}
