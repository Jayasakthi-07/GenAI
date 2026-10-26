import {
  ACTION_STATUS_LABELS,
  ACTION_STATUS_TONES,
  type ActionStatus,
  type AgentKey,
  AUTONOMY_LABELS,
  type Autonomy,
  RUN_STATUS_LABELS,
  RUN_STATUS_TONES,
  type RunMode,
  type RunStatus,
} from '@stockroom/shared';
import {
  Eye,
  FileText,
  Handshake,
  type LucideIcon,
  MessagesSquare,
  PackagePlus,
  Radar,
  Scale,
  ScanSearch,
  ThumbsUp,
  TrendingUp,
  Zap,
} from 'lucide-react';
import { AiMarker } from '@/components/ai/ai-marker';
import { StatusPill } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export const AGENT_ICONS: Record<AgentKey, LucideIcon> = {
  stock_sentinel: Radar,
  demand_forecaster: TrendingUp,
  replenishment_planner: PackagePlus,
  anomaly_auditor: ScanSearch,
  supplier_analyst: Handshake,
  inventory_optimizer: Scale,
  report_writer: FileText,
  assistant: MessagesSquare,
};

export function AgentAvatar({ agentKey, size = 'md' }: { agentKey: AgentKey; size?: 'sm' | 'md' | 'lg' }) {
  const Icon = AGENT_ICONS[agentKey];
  return (
    <span
      className={cn(
        'grid shrink-0 place-items-center rounded-[10px] bg-accent-soft text-accent-text',
        size === 'sm' ? 'size-7 rounded-md' : size === 'lg' ? 'size-12 rounded-[14px]' : 'size-9',
      )}
      aria-hidden
    >
      <Icon
        className={size === 'sm' ? 'size-4' : size === 'lg' ? 'size-6' : 'size-[18px]'}
        strokeWidth={1.75}
      />
    </span>
  );
}

export const RunStatusPill = ({ status }: { status: RunStatus }) => (
  <StatusPill tone={RUN_STATUS_TONES[status]} pulse={status === 'RUNNING'}>
    {RUN_STATUS_LABELS[status]}
  </StatusPill>
);

export const ActionStatusPill = ({ status }: { status: ActionStatus }) => (
  <StatusPill tone={ACTION_STATUS_TONES[status]}>{ACTION_STATUS_LABELS[status]}</StatusPill>
);

const AUTONOMY_ICONS: Record<Autonomy, LucideIcon> = { OBSERVE: Eye, RECOMMEND: ThumbsUp, ACT: Zap };

export function AutonomyBadge({ autonomy }: { autonomy: Autonomy }) {
  const Icon = AUTONOMY_ICONS[autonomy];
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-fg-secondary">
      <Icon className="size-3.5" strokeWidth={1.75} aria-hidden />
      {AUTONOMY_LABELS[autonomy]}
    </span>
  );
}

/** How a run's output was produced: the model's name, or the rule-based label. */
export function RunModeMarker({ mode, modelId }: { mode: RunMode | null; modelId: string | null }) {
  if (mode === 'AI') return <AiMarker model={modelId} />;
  if (mode === 'RULE_BASED') return <AiMarker source="rule" />;
  return <span className="text-xs text-fg-tertiary">No model needed</span>;
}

/** "Every 15 minutes", "Daily at 07:00", "Mondays at 06:00", else the expression itself. */
export function describeCron(cron: string): string {
  const [min, hour, dom, mon, dow] = cron.trim().split(/\s+/);
  const every = /^\*\/(\d+)$/.exec(min ?? '');
  const rest = [hour, dom, mon, dow].every((x) => x === '*');
  if (every && rest) return `Every ${every[1]} minutes`;
  if (min === '0' && rest) return 'Every hour';
  const pad = (s: string) => s.padStart(2, '0');
  if (/^\d+$/.test(min ?? '') && /^\d+$/.test(hour ?? '') && dom === '*' && mon === '*') {
    const at = `${pad(hour ?? '0')}:${pad(min ?? '0')}`;
    if (dow === '*') return `Daily at ${at}`;
    const days = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];
    if (/^\d$/.test(dow ?? '')) return `${days[Number(dow) % 7]} at ${at}`;
    if (dow === '1-5') return `Weekdays at ${at}`;
  }
  return cron;
}

/** 850 ms · 12 s · 2 min 24 s */
export function duration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return '—';
  if (ms < 1000) return `${ms} ms`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  return s % 60 ? `${m} min ${s % 60} s` : `${m} min`;
}
