import { formatMoney } from '@stockroom/shared';
import type { UseQueryResult } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { ErrorState } from '@/components/feedback/states';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { KpiCardSkeleton } from '@/components/ui/kpi-card';
import { Skeleton } from '@/components/ui/misc';
import { cn } from '@/lib/utils';

export const inr = (v: number) => formatMoney(Math.round(v), { compactDecimals: true });
export const inrCompact = (v: number) => formatMoney(v, { compact: true });
export const shortDate = (d: string) => format(parseISO(d), 'd MMM');
export const longDate = (d: string) => format(parseISO(d), 'EEE, d MMM yyyy');

/** Loading, error and data states for one analytics panel. */
export function InsightView<T>({
  query,
  children,
  kpis = 4,
}: {
  query: UseQueryResult<T>;
  children: (data: T) => React.ReactNode;
  /** How many KPI placeholders the skeleton shows. */
  kpis?: number;
}) {
  if (query.isPending)
    return (
      <div className="flex flex-col gap-4" aria-busy>
        {kpis > 0 && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: kpis }, (_, i) => (
              <KpiCardSkeleton key={i} />
            ))}
          </div>
        )}
        <Card>
          <CardHeader>
            <Skeleton className="h-4 w-40" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-60 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  if (query.isError)
    return (
      <Card>
        <ErrorState
          error={query.error}
          onRetry={() => void query.refetch()}
          title="Couldn’t load these figures"
        />
      </Card>
    );
  return (
    <div className={cn('flex flex-col gap-4 transition-opacity', query.isFetching && 'opacity-80')}>
      {children(query.data)}
    </div>
  );
}

/** A thin horizontal bar for shares and rates inside table cells. */
export function MeterBar({
  value,
  max = 1,
  tone = 'accent',
  className,
}: {
  value: number;
  max?: number;
  tone?: 'accent' | 'success' | 'warning' | 'danger';
  className?: string;
}) {
  const pct = max > 0 ? Math.max(0, Math.min(1, value / max)) * 100 : 0;
  const color = { accent: 'bg-accent', success: 'bg-success', warning: 'bg-warning', danger: 'bg-danger' }[
    tone
  ];
  return (
    <span
      className={cn('block h-1.5 w-full overflow-hidden rounded-full bg-neutral-soft', className)}
      aria-hidden
    >
      <span className={cn('block h-full rounded-full', color)} style={{ width: `${pct}%` }} />
    </span>
  );
}

export function Muted({ children }: { children: React.ReactNode }) {
  return <span className="text-fg-tertiary">{children}</span>;
}
