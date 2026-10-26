import { ACTION_TYPE_LABELS, formatNumber, RUN_TRIGGER_LABELS } from '@stockroom/shared';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { ArrowRightLeft, ChevronLeft, Square } from 'lucide-react';
import { toast } from 'sonner';
import { SeverityPill } from '@/components/domain/status';
import { PageLoading } from '@/components/feedback/page-loading';
import { ErrorState } from '@/components/feedback/states';
import { Page, PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { runQuery, useCancelRun } from '@/features/agents/api';
import { RunTimeline } from '@/features/agents/run-timeline';
import { ActionStatusPill, AgentAvatar, duration, RunModeMarker, RunStatusPill } from '@/features/agents/ui';
import { useCan } from '@/lib/auth';
import { ago, dateTime } from '@/lib/format';
import { reportError } from '@/lib/forms';
import { useRunStepLabels } from '@/lib/live';

export const Route = createFileRoute('/_app/agents/runs/$id')({
  staticData: { title: 'Agent run' },
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(runQuery(params.id)).catch(() => undefined),
  component: RunPage,
});

function RunPage() {
  const { id } = Route.useParams();
  const q = useQuery({
    ...runQuery(id),
    // Live updates arrive over SSE; polling is only a safety net while the run is active.
    refetchInterval: (query) =>
      ['QUEUED', 'RUNNING'].includes(query.state.data?.status ?? '') ? 10_000 : false,
  });
  const can = useCan();
  const cancel = useCancelRun();
  const labels = useRunStepLabels();

  if (q.isPending) return <PageLoading />;
  if (q.isError)
    return (
      <Page>
        <Card>
          <ErrorState error={q.error} onRetry={() => void q.refetch()} title="Couldn’t open this run" />
        </Card>
      </Page>
    );
  const r = q.data;
  const active = r.status === 'QUEUED' || r.status === 'RUNNING';
  const out = r.output;
  const tokens = (r.promptTokens ?? 0) + (r.completionTokens ?? 0);

  return (
    <Page className="max-w-5xl">
      <PageHeader
        eyebrow={
          <Link
            to="/agents/$key"
            params={{ key: r.agentKey }}
            className="inline-flex items-center gap-1 hover:text-fg"
          >
            <ChevronLeft className="size-4" strokeWidth={1.75} /> {r.agentName}
          </Link>
        }
        title={`${r.agentName} run`}
        description={`${RUN_TRIGGER_LABELS[r.trigger]} · ${dateTime(r.createdAt)}`}
        actions={
          active &&
          can('agents.run') && (
            <Button
              variant="secondary"
              loading={cancel.isPending}
              onClick={() =>
                cancel.mutate(r.id, {
                  onSuccess: (res) =>
                    toast.success(res.cancelled ? 'Stopping the run' : 'The run had already finished'),
                  onError: (e) => reportError(e, undefined, 'Couldn’t cancel'),
                })
              }
            >
              <Square strokeWidth={1.75} /> Stop
            </Button>
          )
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_300px]">
        <div className="flex min-w-0 flex-col gap-4">
          <Card>
            <CardContent className="flex flex-col gap-3 pt-5">
              <div className="flex flex-wrap items-center gap-2">
                <AgentAvatar agentKey={r.agentKey} size="sm" />
                <RunStatusPill status={r.status} />
                {!active && r.status !== 'NO_CHANGE' && <RunModeMarker mode={r.mode} modelId={r.modelId} />}
              </div>
              <p className="text-base">
                {active
                  ? r.status === 'QUEUED'
                    ? 'Waiting to start…'
                    : (labels.get(r.id) ?? r.steps.at(-1)?.label ?? 'Working…')
                  : r.summary}
              </p>
              {out?.fallbackReason && (
                <p className="rounded-md bg-neutral-soft px-3 py-2 text-sm text-fg-secondary">
                  Used rules instead of a model: {out.fallbackReason}.
                </p>
              )}
              {r.error && r.status === 'FAILED' && (
                <p className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{r.error}</p>
              )}
            </CardContent>
          </Card>

          {(out?.findings.length ?? 0) > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Findings</CardTitle>
                <RunModeMarker mode={r.mode} modelId={r.modelId} />
              </CardHeader>
              <CardContent>
                <ul className="flex flex-col gap-3">
                  {out?.findings.map((f, i) => (
                    <li key={i} className="flex gap-3">
                      <span className="pt-0.5">
                        {f.severity ? <SeverityPill severity={f.severity} /> : null}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-medium">{f.title}</span>
                        {f.detail && <span className="block text-sm text-fg-secondary">{f.detail}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {(r.actions.length > 0 || (out?.observed.length ?? 0) > 0) && (
            <Card>
              <CardHeader>
                <CardTitle>Proposals</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="flex flex-col divide-y divide-hairline">
                  {r.actions.map((a) => (
                    <li key={a.id} className="py-2.5 first:pt-0 last:pb-0">
                      <Link
                        to="/approvals"
                        search={{ id: a.id, view: a.status === 'PENDING' ? undefined : 'decided' }}
                        className="flex items-center justify-between gap-3 text-sm hover:underline"
                      >
                        <span className="min-w-0">
                          <span className="block font-medium">{a.title}</span>
                          <span className="block text-xs text-fg-tertiary">{ACTION_TYPE_LABELS[a.type]}</span>
                        </span>
                        <ActionStatusPill status={a.status} />
                      </Link>
                    </li>
                  ))}
                  {out?.observed.map((o, i) => (
                    <li key={`o${i}`} className="py-2.5 text-sm first:pt-0 last:pb-0">
                      <span className="block font-medium">{o.title}</span>
                      <span className="block text-xs text-fg-tertiary">
                        Observe mode — recorded only. {o.summary}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Steps</CardTitle>
              <span className="text-xs text-fg-tertiary">
                Open a step to see exactly what was sent and returned
              </span>
            </CardHeader>
            <CardContent>
              {r.steps.length === 0 && !active ? (
                <p className="text-sm text-fg-secondary">No steps were recorded.</p>
              ) : (
                <RunTimeline steps={r.steps} running={active} />
              )}
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <Card>
            <CardContent className="pt-5">
              <dl className="flex flex-col gap-2.5 text-sm">
                <Row label="Started" value={r.startedAt ? ago(r.startedAt) : '—'} />
                <Row label="Duration" value={duration(r.durationMs)} />
                <Row
                  label="Model"
                  value={r.modelId ? <span className="font-mono text-xs">{r.modelId}</span> : '—'}
                />
                <Row label="Provider" value={r.providerKey ?? '—'} />
                <Row label="Tool calls" value={formatNumber(r.toolCallCount)} />
                <Row label="Tokens" value={tokens ? formatNumber(tokens) : '—'} />
              </dl>
            </CardContent>
          </Card>
          {(r.parent || r.children.length > 0) && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ArrowRightLeft className="size-4 text-fg-tertiary" strokeWidth={1.75} /> Hand-offs
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2 text-sm">
                {r.parent && (
                  <Link
                    to="/agents/runs/$id"
                    params={{ id: r.parent.id }}
                    className="text-accent-text hover:underline"
                  >
                    From {r.parent.agentName}
                  </Link>
                )}
                {r.children.map((c) => (
                  <Link
                    key={c.id}
                    to="/agents/runs/$id"
                    params={{ id: c.id }}
                    className="flex items-center justify-between gap-2 hover:underline"
                  >
                    <span className="text-accent-text">To {c.agentName}</span>
                    <RunStatusPill status={c.status} />
                  </Link>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </Page>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-fg-secondary">{label}</dt>
      <dd className="min-w-0 truncate text-right tabular">{value}</dd>
    </div>
  );
}
