import { AGENT_LABELS } from '@stockroom/shared';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { activeRunsQuery } from '@/features/agents/api';
import { AgentAvatar } from '@/features/agents/ui';
import { ago } from '@/lib/format';
import { useLiveConnection, useRunStepLabels } from '@/lib/live';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/menus';

/** Appears in the top bar only while agents are working; shows what each one is doing right now. */
export function AgentActivity() {
  const { data } = useQuery(activeRunsQuery);
  const labels = useRunStepLabels();
  const connection = useLiveConnection();
  const runs = data?.data ?? [];
  const running = runs.filter((r) => r.status === 'RUNNING');
  if (!runs.length) return null;
  const text =
    running.length === 1
      ? `${running[0]?.agentName ?? 'An agent'} is working`
      : running.length > 1
        ? `${running.length} agents working`
        : `${runs.length} queued`;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex h-8 max-w-56 items-center gap-2 rounded-full border border-hairline bg-surface/60 px-3 text-xs font-medium text-fg-secondary',
            'transition-colors hover:border-hairline-strong hover:text-fg',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]',
          )}
          aria-label={`Agent activity: ${text}`}
        >
          <span
            className={cn(
              'size-2 shrink-0 rounded-full',
              running.length ? 'animate-pulse-dot bg-accent' : 'bg-fg-tertiary',
            )}
            aria-hidden
          />
          <span className="hidden truncate sm:inline">{text}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="border-b border-hairline px-4 py-3">
          <p className="text-sm font-semibold">Agent activity</p>
          <p className="text-xs text-fg-tertiary">
            {connection === 'open' ? 'Live' : 'Reconnecting to live updates…'}
          </p>
        </div>
        <ul className="max-h-80 divide-y divide-hairline overflow-y-auto">
          {runs.map((r) => (
            <li key={r.id}>
              <Link
                to="/agents/runs/$id"
                params={{ id: r.id }}
                className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-neutral-soft"
              >
                <AgentAvatar agentKey={r.agentKey} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{AGENT_LABELS[r.agentKey]}</span>
                  <span className="block truncate text-xs text-fg-secondary">
                    {r.status === 'QUEUED' ? 'Waiting to start' : (labels.get(r.id) ?? 'Starting…')}
                  </span>
                </span>
                <span className="shrink-0 text-xs text-fg-tertiary">{ago(r.startedAt ?? r.createdAt)}</span>
              </Link>
            </li>
          ))}
        </ul>
        <div className="border-t border-hairline px-4 py-2.5">
          <Link to="/agents" className="text-xs font-medium text-accent-text hover:underline">
            Open the agents hub
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
