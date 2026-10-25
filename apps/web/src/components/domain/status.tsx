import {
  ALERT_STATUS_LABELS,
  type ActorView,
  type AlertStatus,
  CYCLE_COUNT_STATUS_LABELS,
  CYCLE_COUNT_STATUS_TONES,
  type CycleCountStatus,
  PO_STATUS_LABELS,
  PO_STATUS_TONES,
  PRODUCT_STATUS_LABELS,
  PRODUCT_STATUS_TONES,
  type ProductStatus,
  type PurchaseOrderStatus,
  type SalesOrderStatus,
  SEVERITY_LABELS,
  SEVERITY_TONES,
  type Severity,
  SO_STATUS_LABELS,
  SO_STATUS_TONES,
  STOCK_STATE_LABELS,
  STOCK_STATE_TONES,
  type StockState,
  TRANSFER_STATUS_LABELS,
  TRANSFER_STATUS_TONES,
  type TransferStatus,
} from '@stockroom/shared';
import { Bot, Cpu, FlaskConical, UserRound } from 'lucide-react';
import { StatusPill } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export const StockStatePill = ({ state, count }: { state: StockState; count?: number }) => (
  <StatusPill tone={STOCK_STATE_TONES[state]}>
    {STOCK_STATE_LABELS[state]}
    {count !== undefined && count > 1 && <span className="opacity-70">×{count}</span>}
  </StatusPill>
);
export const ProductStatusPill = ({ status }: { status: ProductStatus }) => (
  <StatusPill tone={PRODUCT_STATUS_TONES[status]}>{PRODUCT_STATUS_LABELS[status]}</StatusPill>
);
export const PoStatusPill = ({ status }: { status: PurchaseOrderStatus }) => (
  <StatusPill tone={PO_STATUS_TONES[status]}>{PO_STATUS_LABELS[status]}</StatusPill>
);
export const SoStatusPill = ({ status }: { status: SalesOrderStatus }) => (
  <StatusPill tone={SO_STATUS_TONES[status]}>{SO_STATUS_LABELS[status]}</StatusPill>
);
export const TransferStatusPill = ({ status }: { status: TransferStatus }) => (
  <StatusPill tone={TRANSFER_STATUS_TONES[status]} pulse={status === 'IN_TRANSIT'}>
    {TRANSFER_STATUS_LABELS[status]}
  </StatusPill>
);
export const CountStatusPill = ({ status }: { status: CycleCountStatus }) => (
  <StatusPill tone={CYCLE_COUNT_STATUS_TONES[status]}>{CYCLE_COUNT_STATUS_LABELS[status]}</StatusPill>
);
export const SeverityPill = ({ severity }: { severity: Severity }) => (
  <StatusPill tone={SEVERITY_TONES[severity]} pulse={severity === 'CRITICAL'}>
    {SEVERITY_LABELS[severity]}
  </StatusPill>
);
export const AlertStatusText = ({ status }: { status: AlertStatus }) => (
  <span className="text-xs text-fg-secondary">{ALERT_STATUS_LABELS[status]}</span>
);

/** Who did something: a person, an agent, the system or the demo simulator. */
export function ActorLabel({ actor, className }: { actor: ActorView; className?: string }) {
  const Icon =
    actor.type === 'AGENT'
      ? Bot
      : actor.type === 'SYSTEM'
        ? Cpu
        : actor.type === 'SIMULATOR'
          ? FlaskConical
          : UserRound;
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-1.5', className)}>
      <Icon
        className={cn('size-3.5 shrink-0', actor.type === 'AGENT' ? 'text-accent-text' : 'text-fg-tertiary')}
        strokeWidth={1.75}
      />
      <span className="truncate">{actor.name}</span>
    </span>
  );
}

/** Label + value rows for detail pages. */
export function DetailList({
  items,
  className,
}: {
  items: Array<{ label: string; value: React.ReactNode; hidden?: boolean }>;
  className?: string;
}) {
  return (
    <dl className={cn('grid grid-cols-[minmax(110px,40%)_1fr] gap-x-4 gap-y-2.5 text-sm', className)}>
      {items
        .filter((i) => !i.hidden)
        .map((i) => (
          <div key={i.label} className="contents">
            <dt className="text-fg-secondary">{i.label}</dt>
            <dd className="min-w-0 text-fg">{i.value}</dd>
          </div>
        ))}
    </dl>
  );
}

/** Small figure with a caption, for summary strips on detail pages. */
export function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: 'danger' | 'warning' | 'success';
}) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-fg-secondary">{label}</p>
      <p
        className={cn(
          'mt-0.5 truncate tabular text-xl font-semibold tracking-tight',
          tone === 'danger' && 'text-danger',
          tone === 'warning' && 'text-warning',
          tone === 'success' && 'text-success',
        )}
      >
        {value}
      </p>
      {sub && <p className="truncate text-xs text-fg-tertiary">{sub}</p>}
    </div>
  );
}
