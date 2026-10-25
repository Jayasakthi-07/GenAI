import { RISK_LABELS, type RiskLevel } from '@stockroom/shared';
import { StatusPill } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

/** Supplier score 0–100 as a small ring, coloured by band. */
export function ScoreRing({ score, size = 40 }: { score: number | null; size?: number }) {
  const r = (size - 5) / 2;
  const c = 2 * Math.PI * r;
  const value = score === null ? 0 : Math.max(0, Math.min(100, score));
  const color =
    score === null
      ? 'var(--hairline-strong)'
      : value >= 85
        ? 'var(--success)'
        : value >= 70
          ? 'var(--warning)'
          : 'var(--danger)';
  return (
    <span
      className="relative inline-grid shrink-0 place-items-center"
      style={{ width: size, height: size }}
      role="img"
      aria-label={score === null ? 'Not scored yet' : `Score ${Math.round(value)} out of 100`}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--neutral-soft)" strokeWidth={4} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={4}
          strokeLinecap="round"
          strokeDasharray={`${(value / 100) * c} ${c}`}
        />
      </svg>
      <span className={cn('absolute tabular font-semibold', size >= 56 ? 'text-lg' : 'text-xs')}>
        {score === null ? '—' : Math.round(value)}
      </span>
    </span>
  );
}

export function RiskPill({ risk }: { risk: RiskLevel | null }) {
  if (!risk) return <span className="text-xs text-fg-tertiary">Not enough data</span>;
  return (
    <StatusPill tone={risk === 'HIGH' ? 'danger' : risk === 'MEDIUM' ? 'warning' : 'success'}>
      {RISK_LABELS[risk]}
    </StatusPill>
  );
}
