import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { animate, useMotionValue, useReducedMotion, useTransform, motion } from 'motion/react';
import { useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Sparkline } from '../charts/charts';
import { Card } from './card';
import { Skeleton } from './misc';
import { Tooltip } from './menus';

interface KpiCardProps {
  label: string;
  /** Numeric value (animated count-up) … */
  value: number;
  /** … and how to display it. */
  format: (value: number) => string;
  /** Change vs the comparison period as a fraction (0.12 = +12%). */
  delta?: number | null;
  deltaLabel?: string;
  /** Whether "up" is good (revenue), bad (stockouts) or neither (inventory value). */
  goodDirection?: 'up' | 'down' | 'neutral';
  trend?: number[];
  hint?: string;
  /** Shown under the value when there is no delta. */
  footnote?: string;
  icon?: React.ReactNode;
  onClick?: () => void;
  className?: string;
}

function CountUp({ value, format }: { value: number; format: (v: number) => string }) {
  const reduced = useReducedMotion();
  const mv = useMotionValue(reduced ? value : 0);
  const text = useTransform(mv, (v) => format(v));
  useEffect(() => {
    if (reduced) {
      mv.set(value);
      return;
    }
    const controls = animate(mv, value, { duration: 0.6, ease: [0.22, 1, 0.36, 1] });
    return () => controls.stop();
  }, [mv, value, reduced]);
  return <motion.span>{text}</motion.span>;
}

export function KpiCard({
  label,
  value,
  format,
  delta,
  deltaLabel = 'vs previous period',
  goodDirection = 'up',
  trend,
  hint,
  footnote,
  icon,
  onClick,
  className,
}: KpiCardProps) {
  const direction =
    delta === undefined || delta === null || Math.abs(delta) < 0.0005 ? 'flat' : delta > 0 ? 'up' : 'down';
  const good = direction === 'flat' || goodDirection === 'neutral' ? null : direction === goodDirection;
  const DeltaIcon = direction === 'up' ? ArrowUpRight : direction === 'down' ? ArrowDownRight : Minus;
  const Comp = onClick ? 'button' : 'div';

  return (
    <Card className={cn('overflow-hidden', onClick && 'transition-colors hover:bg-surface-2', className)}>
      <Comp
        {...(onClick ? { type: 'button' as const, onClick } : {})}
        className="flex h-full w-full flex-col gap-3 p-4 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-sm font-medium text-fg-secondary [&_svg]:size-4">
            {icon}
            {label}
          </span>
          {hint && (
            <Tooltip content={hint}>
              <span className="text-xs text-fg-tertiary underline decoration-dotted underline-offset-2">
                How?
              </span>
            </Tooltip>
          )}
        </div>
        <div className="flex items-end justify-between gap-3">
          <div className="tabular text-2xl font-semibold tracking-tighter text-fg">
            <CountUp value={value} format={format} />
          </div>
          {trend && trend.length > 1 && (
            <div className="mb-1 w-20 shrink-0">
              <Sparkline
                values={trend}
                tone={good === false ? 'danger' : good === null ? 'neutral' : 'accent'}
                height={28}
              />
            </div>
          )}
        </div>
        {(delta === undefined || delta === null) && footnote && (
          <p className="truncate text-xs text-fg-tertiary">{footnote}</p>
        )}
        {delta !== undefined && delta !== null && (
          <p className="flex min-w-0 items-center gap-1 text-xs">
            <span
              className={cn(
                'inline-flex shrink-0 items-center gap-0.5 font-medium',
                good === true && 'text-success',
                good === false && 'text-danger',
                good === null && 'text-fg-secondary',
              )}
            >
              <DeltaIcon className="size-3.5" strokeWidth={2} />
              <span className="tabular">{`${delta > 0 ? '+' : ''}${(delta * 100).toFixed(Math.abs(delta) < 0.1 ? 1 : 0)}%`}</span>
            </span>
            <span className="truncate text-fg-tertiary">{deltaLabel}</span>
          </p>
        )}
      </Comp>
    </Card>
  );
}

export function KpiCardSkeleton() {
  return (
    <Card className="flex flex-col gap-3 p-4">
      <Skeleton className="h-4 w-28" />
      <Skeleton className="h-7 w-36" />
      <Skeleton className="h-3.5 w-40" />
    </Card>
  );
}
