import { type AbcXyz, formatNumber, formatPercent } from '@stockroom/shared';
import { Link } from '@tanstack/react-router';
import { Grid3x3 } from 'lucide-react';
import { EmptyState } from '@/components/feedback/states';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ago } from '@/lib/format';
import { cn } from '@/lib/utils';
import { inrCompact } from './shared';

const ABC = [
  { key: 'A', label: 'A', hint: 'Top 80 % of value' },
  { key: 'B', label: 'B', hint: 'Next 15 %' },
  { key: 'C', label: 'C', hint: 'Last 5 %' },
] as const;
const XYZ = [
  { key: 'X', label: 'X', hint: 'Steady demand' },
  { key: 'Y', label: 'Y', hint: 'Variable' },
  { key: 'Z', label: 'Z', hint: 'Erratic' },
] as const;

/** What to do with each kind of product; the classic ABC–XYZ playbook. */
const ADVICE: Record<string, string> = {
  AX: 'Keep tight: frequent, automatic replenishment.',
  AY: 'Watch closely; safety stock matters.',
  AZ: 'High value, hard to predict: review by hand.',
  BX: 'Automate with standard rules.',
  BY: 'Standard rules, periodic review.',
  BZ: 'Order to demand where you can.',
  CX: 'Order in bulk, rarely.',
  CY: 'Low effort: periodic review.',
  CZ: 'Candidates to stop stocking.',
};

export function AbcXyzPanel({ data }: { data: AbcXyz }) {
  if (data.totals.products === 0)
    return (
      <Card>
        <EmptyState
          icon={<Grid3x3 strokeWidth={1.75} />}
          title="Products aren’t classified yet"
          description="The Inventory Optimizer classifies products by consumption value (ABC) and demand stability (XYZ) every week."
          action={
            <Link
              to="/agents/$key"
              params={{ key: 'inventory_optimizer' }}
              className="text-sm font-medium text-accent-text hover:underline"
            >
              Open the Inventory Optimizer
            </Link>
          }
        />
      </Card>
    );
  const cell = (abc: string, xyz: string) => data.cells.find((c) => c.abc === abc && c.xyz === xyz);
  const maxShare = Math.max(0.0001, ...data.cells.map((c) => c.revenueShare));
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>ABC × XYZ</CardTitle>
          <CardDescription>
            Share of consumption value (ABC) against how predictable demand is (XYZ). Select a cell to see its
            products.
            {data.classifiedAt && ` Classified ${ago(data.classifiedAt)}.`}
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <div className="grid min-w-[560px] grid-cols-[72px_repeat(3,minmax(0,1fr))] gap-2">
            <div />
            {XYZ.map((x) => (
              <div key={x.key} className="px-1 pb-1 text-center">
                <p className="text-sm font-semibold">{x.label}</p>
                <p className="text-xs text-fg-tertiary">{x.hint}</p>
              </div>
            ))}
            {ABC.map((a) => (
              <div key={a.key} className="contents">
                <div className="flex flex-col justify-center pr-1">
                  <p className="text-sm font-semibold">{a.label}</p>
                  <p className="text-xs text-fg-tertiary">{a.hint}</p>
                </div>
                {XYZ.map((x) => {
                  const c = cell(a.key, x.key);
                  const intensity = c ? c.revenueShare / maxShare : 0;
                  return (
                    <Link
                      key={x.key}
                      to="/products"
                      search={{ abcClass: [a.key], xyzClass: [x.key] }}
                      aria-label={`${a.key}${x.key}: ${formatNumber(c?.products ?? 0)} products`}
                      className={cn(
                        'group relative flex min-h-28 flex-col justify-between overflow-hidden rounded-lg border border-hairline p-3 transition-[border-color,box-shadow]',
                        'hover:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]',
                      )}
                    >
                      <span
                        className="absolute inset-0 bg-accent"
                        style={{ opacity: 0.04 + intensity * 0.22 }}
                        aria-hidden
                      />
                      <span className="relative flex items-baseline justify-between gap-2">
                        <span className="text-xs font-semibold text-fg-secondary">
                          {a.key}
                          {x.key}
                        </span>
                        <span className="text-xs text-fg-tertiary tabular-nums">
                          {formatPercent(c?.revenueShare ?? 0, { decimals: 1 })} of sales
                        </span>
                      </span>
                      <span className="relative">
                        <span className="block text-xl font-semibold tracking-tight tabular-nums">
                          {formatNumber(c?.products ?? 0)}
                        </span>
                        <span className="block text-xs text-fg-secondary tabular-nums">
                          {inrCompact(c?.stockValue ?? 0)} in stock
                        </span>
                      </span>
                      <span className="relative mt-1 hidden text-xs text-fg-tertiary group-hover:block group-focus-visible:block">
                        {ADVICE[`${a.key}${x.key}`]}
                      </span>
                    </Link>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
        <p className="mt-4 text-sm text-fg-tertiary">
          {formatNumber(data.totals.products)} products classified
          {data.unclassified > 0 && `, ${formatNumber(data.unclassified)} not yet (too little sales history)`}
          . ABC ranks products by a year of consumption value (cost of goods sold); XYZ by how much weekly
          demand varies. Each cell’s share is of the last 12 months’ sales.
        </p>
      </CardContent>
    </Card>
  );
}
