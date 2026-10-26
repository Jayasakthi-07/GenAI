import { AGENT_EVENT_LABELS, type AgentDto } from '@stockroom/shared';
import { Link, useNavigate } from '@tanstack/react-router';
import { Play } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/checkbox';
import { useCan } from '@/lib/auth';
import { ago } from '@/lib/format';
import { reportError } from '@/lib/forms';
import { useRunStepLabels } from '@/lib/live';
import { formatDistanceToNowStrict, parseISO } from 'date-fns';
import { useRunAgent, useUpdateAgent } from './api';
import { AgentAvatar, AutonomyBadge, describeCron, RunModeMarker, RunStatusPill } from './ui';

export function useRunNow() {
  const run = useRunAgent();
  const navigate = useNavigate();
  return {
    isPending: run.isPending,
    start: (agent: Pick<AgentDto, 'key' | 'name'>) =>
      run.mutate(
        { key: agent.key },
        {
          onSuccess: (r) =>
            toast.success(
              r.deduped ? `${agent.name} already has a run waiting` : `${agent.name} is starting`,
              {
                action: {
                  label: 'Watch',
                  onClick: () => void navigate({ to: '/agents/runs/$id', params: { id: r.runId } }),
                },
              },
            ),
          onError: (e) => reportError(e, undefined, `Couldn’t start ${agent.name}`),
        },
      ),
  };
}

/** One agent on the hub: what it does, what it's doing now, and its last result. */
export function AgentCard({ agent: a }: { agent: AgentDto }) {
  const can = useCan();
  const runNow = useRunNow();
  const update = useUpdateAgent(a.key);
  const labels = useRunStepLabels();
  const live = a.status.currentRunId ? labels.get(a.status.currentRunId) : undefined;
  const triggers = [
    ...a.triggers.cron.map(describeCron),
    ...a.triggers.events.map((e) => `On ${AGENT_EVENT_LABELS[e].toLowerCase()}`),
  ];
  return (
    <Card className="flex flex-col">
      <div className="flex items-start gap-3 p-5 pb-4">
        <AgentAvatar agentKey={a.key} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <Link
              to="/agents/$key"
              params={{ key: a.key }}
              className="text-base font-semibold tracking-tight hover:underline"
            >
              {a.name}
            </Link>
            <Switch
              checked={a.isEnabled}
              disabled={!can('agents.configure') || update.isPending}
              aria-label={a.isEnabled ? `Turn off ${a.name}` : `Turn on ${a.name}`}
              onCheckedChange={(isEnabled) =>
                update.mutate(
                  { isEnabled },
                  {
                    onSuccess: () => toast.success(`${a.name} ${isEnabled ? 'is on' : 'is off'}`),
                    onError: (e) => reportError(e, undefined, 'Couldn’t change the agent'),
                  },
                )
              }
            />
          </div>
          <p className="mt-0.5 text-sm text-fg-secondary">{a.description}</p>
        </div>
      </div>

      <div className="mx-5 flex flex-col gap-1.5 rounded-lg bg-surface-2 px-3.5 py-3 text-sm">
        {a.status.running ? (
          <p className="flex items-center gap-2 font-medium text-accent-text">
            <span className="size-2 animate-pulse-dot rounded-full bg-accent" aria-hidden />
            <span className="truncate">{live ?? 'Working…'}</span>
          </p>
        ) : a.status.queued ? (
          <p className="text-fg-secondary">Queued to run</p>
        ) : a.lastRun ? (
          <>
            <p className="flex flex-wrap items-center gap-2">
              <RunStatusPill status={a.lastRun.status} />
              <span className="text-xs text-fg-tertiary">
                {ago(a.lastRun.finishedAt ?? a.lastRun.createdAt)}
              </span>
              {a.lastRun.status === 'SUCCEEDED' && (
                <RunModeMarker mode={a.lastRun.mode} modelId={a.lastRun.modelId} />
              )}
            </p>
            <p className="line-clamp-2 text-fg-secondary">{a.lastRun.summary ?? '—'}</p>
          </>
        ) : (
          <p className="text-fg-secondary">Hasn’t run yet.</p>
        )}
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 px-5 py-4 text-xs">
        <div>
          <dt className="text-fg-tertiary">Runs</dt>
          <dd className="mt-0.5 truncate text-fg-secondary">
            {a.isEnabled ? triggers.join(' · ') || 'Manual only' : 'Off'}
          </dd>
        </div>
        <div>
          <dt className="text-fg-tertiary">Next run</dt>
          <dd className="mt-0.5 text-fg-secondary">
            {a.nextRunAt
              ? `in ${formatDistanceToNowStrict(parseISO(a.nextRunAt))}`
              : a.isEnabled
                ? 'On triggers'
                : '—'}
          </dd>
        </div>
        <div>
          <dt className="text-fg-tertiary">Last 7 days</dt>
          <dd className="mt-0.5 tabular text-fg-secondary">
            {a.stats.runs7d} run{a.stats.runs7d === 1 ? '' : 's'}
            {a.stats.failed7d ? <span className="text-danger"> · {a.stats.failed7d} failed</span> : null}
          </dd>
        </div>
        <div>
          <dt className="text-fg-tertiary">Autonomy</dt>
          <dd className="mt-0.5">
            <AutonomyBadge autonomy={a.autonomy} />
          </dd>
        </div>
      </dl>

      <div className="mt-auto flex items-center gap-2 border-t border-hairline px-5 py-3">
        {a.stats.pendingActions > 0 ? (
          <Link
            to="/approvals"
            search={{ agentKey: a.key }}
            className="text-sm font-medium text-accent-text hover:underline"
          >
            {a.stats.pendingActions} waiting for approval
          </Link>
        ) : (
          <Link to="/agents/$key" params={{ key: a.key }} className="text-sm text-fg-secondary hover:text-fg">
            Details and settings
          </Link>
        )}
        {can('agents.run') && (
          <Button
            variant="secondary"
            size="sm"
            className="ml-auto"
            disabled={a.status.running || a.status.queued || runNow.isPending}
            onClick={() => runNow.start(a)}
          >
            <Play strokeWidth={1.75} /> Run now
          </Button>
        )}
      </div>
    </Card>
  );
}
