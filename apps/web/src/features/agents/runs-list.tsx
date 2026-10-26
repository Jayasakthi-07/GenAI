import { AGENT_LABELS, type AgentKey, RUN_TRIGGER_LABELS } from '@stockroom/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { History } from 'lucide-react';
import { useState } from 'react';
import { Pagination } from '@/components/data-table/pagination';
import { EmptyState, ErrorState } from '@/components/feedback/states';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/misc';
import { Select } from '@/components/ui/select';
import { ago } from '@/lib/format';
import { useRunStepLabels } from '@/lib/live';
import { runsQuery } from './api';
import { AgentAvatar, duration, RunModeMarker, RunStatusPill } from './ui';

const PAGE_SIZE = 20;

/** Run history, newest first; for one agent or all of them. */
export function RunsList({
  agentKey,
  showAgentFilter = false,
}: {
  agentKey?: AgentKey;
  showAgentFilter?: boolean;
}) {
  const [page, setPage] = useState(1);
  const [agent, setAgent] = useState<AgentKey | undefined>(agentKey);
  const [status, setStatus] = useState<string>('all');
  const q = useQuery({
    ...runsQuery({
      agentKey: agent,
      status: status === 'all' ? undefined : status === 'problems' ? ['FAILED', 'CANCELLED'] : [status],
      page,
      pageSize: PAGE_SIZE,
    }),
    placeholderData: keepPreviousData,
  });
  const labels = useRunStepLabels();
  const rows = q.data?.data ?? [];
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap gap-2 border-b border-hairline px-4 py-3">
        {showAgentFilter && (
          <Select
            aria-label="Agent"
            value={agent ?? 'all'}
            onValueChange={(v) => {
              setAgent(v === 'all' ? undefined : (v as AgentKey));
              setPage(1);
            }}
            options={[
              { value: 'all', label: 'All agents' },
              ...(Object.keys(AGENT_LABELS) as AgentKey[])
                .filter((k) => k !== 'assistant')
                .map((k) => ({ value: k, label: AGENT_LABELS[k] })),
            ]}
            className="w-48"
          />
        )}
        <Select
          aria-label="Status"
          value={status}
          onValueChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
          options={[
            { value: 'all', label: 'All runs' },
            { value: 'SUCCEEDED', label: 'Succeeded' },
            { value: 'NO_CHANGE', label: 'No change' },
            { value: 'problems', label: 'Failed or cancelled' },
            { value: 'RUNNING', label: 'Running' },
          ]}
          className="w-44"
        />
      </div>
      {q.isPending ? (
        <div className="flex flex-col gap-2 p-4">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-14" />
          ))}
        </div>
      ) : q.isError ? (
        <ErrorState compact error={q.error} onRetry={() => void q.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          compact
          icon={<History strokeWidth={1.75} />}
          title="No runs yet"
          description="Runs appear here as soon as an agent is scheduled, triggered by a change, or started with Run now."
        />
      ) : (
        <ul className="divide-y divide-hairline">
          {rows.map((r) => (
            <li key={r.id}>
              <Link
                to="/agents/runs/$id"
                params={{ id: r.id }}
                className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-neutral-soft focus-visible:bg-neutral-soft focus-visible:outline-none"
              >
                {!agentKey && <AgentAvatar agentKey={r.agentKey} size="sm" />}
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    {!agentKey && <span className="text-sm font-medium">{r.agentName}</span>}
                    <RunStatusPill status={r.status} />
                    <span className="text-xs text-fg-tertiary">{RUN_TRIGGER_LABELS[r.trigger]}</span>
                    {r.status !== 'RUNNING' && r.status !== 'QUEUED' && r.status !== 'NO_CHANGE' && (
                      <RunModeMarker mode={r.mode} modelId={r.modelId} />
                    )}
                  </span>
                  <span className="mt-1 line-clamp-2 block text-sm text-fg-secondary">
                    {r.status === 'RUNNING' ? (labels.get(r.id) ?? 'Working…') : (r.summary ?? '—')}
                  </span>
                </span>
                <span className="shrink-0 text-right tabular text-xs text-fg-tertiary">
                  <span className="block">{ago(r.createdAt)}</span>
                  {r.durationMs !== null && <span className="block">{duration(r.durationMs)}</span>}
                  {r.actionCount > 0 && (
                    <span className="block text-accent-text">
                      {r.actionCount} proposal{r.actionCount === 1 ? '' : 's'}
                    </span>
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {(q.data?.meta.total ?? 0) > PAGE_SIZE && (
        <div className="border-t border-hairline">
          <Pagination
            page={page}
            pageSize={PAGE_SIZE}
            total={q.data?.meta.total}
            onPageChange={setPage}
            noun="runs"
          />
        </div>
      )}
    </Card>
  );
}
