import { AGENT_EVENT_LABELS, AGENT_KEYS, AGENT_LABELS, type AgentKey } from '@stockroom/shared';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link, redirect, useNavigate } from '@tanstack/react-router';
import { formatDistanceToNowStrict, parseISO } from 'date-fns';
import { Calculator, ChevronLeft, Eye, PencilLine, Play, Sparkles, Wrench } from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';
import { PageLoading } from '@/components/feedback/page-loading';
import { ErrorState } from '@/components/feedback/states';
import { Page, PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/checkbox';
import { SegmentedControl } from '@/components/ui/tabs';
import { useRunNow } from '@/features/agents/agent-card';
import { AgentSettings } from '@/features/agents/agent-settings';
import { agentQuery, useUpdateAgent } from '@/features/agents/api';
import { RunsList } from '@/features/agents/runs-list';
import { AutonomyBadge, describeCron, duration, RunModeMarker, RunStatusPill } from '@/features/agents/ui';
import { useCan } from '@/lib/auth';
import { ago } from '@/lib/format';
import { reportError } from '@/lib/forms';
import { cleanSearch } from '@/lib/list-search';

export const Route = createFileRoute('/_app/agents/$key')({
  validateSearch: z.object({ tab: z.enum(['overview', 'runs', 'settings']).optional().catch(undefined) }),
  params: { parse: (p) => ({ key: p.key as AgentKey }), stringify: (p) => ({ key: p.key }) },
  beforeLoad: ({ params }) => {
    // Unknown agents (an old link, a typo) go back to the hub.
    if (!(AGENT_KEYS as readonly string[]).includes(params.key)) throw redirect({ to: '/agents' });
  },
  staticData: { title: 'Agent' },
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(agentQuery(params.key)).catch(() => undefined),
  component: AgentPage,
});

function AgentPage() {
  const { key } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const tab = search.tab ?? 'overview';
  const q = useQuery(agentQuery(key));
  const can = useCan();
  const runNow = useRunNow();
  const update = useUpdateAgent(key);

  if (q.isPending) return <PageLoading />;
  if (q.isError)
    return (
      <Page>
        <Card>
          <ErrorState error={q.error} onRetry={() => void q.refetch()} title="Couldn’t open this agent" />
        </Card>
      </Page>
    );
  const a = q.data;
  const reads = a.tools.filter((t) => t.kind === 'read');
  const writes = a.tools.filter((t) => t.kind !== 'read');

  return (
    <Page>
      <PageHeader
        eyebrow={
          <Link to="/agents" className="inline-flex items-center gap-1 hover:text-fg">
            <ChevronLeft className="size-4" strokeWidth={1.75} /> Agents
          </Link>
        }
        title={a.name}
        description={a.description}
        actions={
          <>
            <label className="flex items-center gap-2 text-sm text-fg-secondary">
              <Switch
                checked={a.isEnabled}
                disabled={!can('agents.configure') || update.isPending}
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
              {a.isEnabled ? 'On' : 'Off'}
            </label>
            {can('agents.run') && !a.chatOnly && (
              <Button
                variant="primary"
                disabled={a.status.running || a.status.queued || runNow.isPending}
                onClick={() => runNow.start(a)}
              >
                <Play strokeWidth={1.75} />{' '}
                {a.status.running ? 'Running…' : a.status.queued ? 'Queued' : 'Run now'}
              </Button>
            )}
          </>
        }
      />

      <SegmentedControl
        aria-label="Section"
        className="mb-5"
        value={tab}
        onValueChange={(v) =>
          void navigate({
            search: (p) => cleanSearch({ ...p, tab: v === 'overview' ? undefined : v }),
            replace: true,
          })
        }
        options={[
          { value: 'overview', label: 'Overview' },
          { value: 'runs', label: 'Runs' },
          { value: 'settings', label: 'Settings' },
        ]}
      />

      {tab === 'overview' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="flex flex-col gap-4 lg:col-span-2">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <HowCard icon={<Calculator strokeWidth={1.75} />} title="Code computes" body={a.analyzer} />
              <HowCard icon={<Sparkles strokeWidth={1.75} />} title="The model decides" body={a.llmJob} />
              <HowCard icon={<PencilLine strokeWidth={1.75} />} title="It produces" body={a.outputs} />
            </div>
            <Card>
              <CardHeader>
                <CardTitle>Last run</CardTitle>
                {a.lastRun && (
                  <Link
                    to="/agents/runs/$id"
                    params={{ id: a.lastRun.id }}
                    className="text-sm font-medium text-accent-text hover:underline"
                  >
                    Open run
                  </Link>
                )}
              </CardHeader>
              <CardContent>
                {a.lastRun ? (
                  <div className="flex flex-col gap-2">
                    <p className="flex flex-wrap items-center gap-2 text-sm">
                      <RunStatusPill status={a.lastRun.status} />
                      <span className="text-fg-tertiary">
                        {ago(a.lastRun.finishedAt ?? a.lastRun.createdAt)} · {duration(a.lastRun.durationMs)}
                      </span>
                      {a.lastRun.status === 'SUCCEEDED' && (
                        <RunModeMarker mode={a.lastRun.mode} modelId={a.lastRun.modelId} />
                      )}
                    </p>
                    <p className="text-sm text-fg-secondary">{a.lastRun.summary}</p>
                  </div>
                ) : (
                  <p className="text-sm text-fg-secondary">
                    This agent hasn’t run yet. Use Run now to try it.
                  </p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Tools</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 gap-5 md:grid-cols-2">
                <ToolList icon={<Eye strokeWidth={1.75} />} title="Reads" tools={reads} />
                {writes.length > 0 && (
                  <ToolList
                    icon={<Wrench strokeWidth={1.75} />}
                    title="Proposes (needs approval)"
                    tools={writes}
                  />
                )}
              </CardContent>
            </Card>
          </div>
          <Card className="self-start">
            <CardHeader>
              <CardTitle>At a glance</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="flex flex-col gap-3 text-sm">
                <Row label="Status" value={a.isEnabled ? (a.status.running ? 'Running' : 'Ready') : 'Off'} />
                <Row label="Autonomy" value={<AutonomyBadge autonomy={a.autonomy} />} />
                <Row
                  label="Schedule"
                  value={a.triggers.cron.length ? a.triggers.cron.map(describeCron).join(', ') : 'None'}
                />
                <Row
                  label="Triggers"
                  value={
                    a.triggers.events.length
                      ? `${a.triggers.events.map((e) => AGENT_EVENT_LABELS[e]).join(', ')} (after ${a.triggers.debounceSeconds} s)`
                      : 'None'
                  }
                />
                <Row
                  label="Next run"
                  value={a.nextRunAt ? `in ${formatDistanceToNowStrict(parseISO(a.nextRunAt))}` : '—'}
                />
                <Row
                  label="Model"
                  value={
                    a.modelOverride ? (
                      <span className="font-mono text-xs">{a.modelOverride.modelId}</span>
                    ) : (
                      'Default routing'
                    )
                  }
                />
                <Row
                  label="Last 7 days"
                  value={`${a.stats.runs7d} runs · ${a.stats.aiRuns7d} with AI · ${a.stats.failed7d} failed`}
                />
                {a.stats.avgDurationMs !== null && (
                  <Row label="Typical run" value={duration(a.stats.avgDurationMs)} />
                )}
                {a.handoffsTo.length > 0 && (
                  <Row label="Hands off to" value={a.handoffsTo.map((k) => AGENT_LABELS[k]).join(', ')} />
                )}
                {a.stats.pendingActions > 0 && (
                  <Row
                    label="Waiting"
                    value={
                      <Link
                        to="/approvals"
                        search={{ agentKey: a.key }}
                        className="text-accent-text hover:underline"
                      >
                        {a.stats.pendingActions} proposal{a.stats.pendingActions === 1 ? '' : 's'}
                      </Link>
                    }
                  />
                )}
              </dl>
            </CardContent>
          </Card>
        </div>
      )}

      {tab === 'runs' && <RunsList agentKey={a.key} />}
      {tab === 'settings' && <AgentSettings agent={a} />}
    </Page>
  );
}

function HowCard({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <Card className="p-5">
      <span
        className="grid size-8 place-items-center rounded-md bg-neutral-soft text-fg-secondary [&_svg]:size-4"
        aria-hidden
      >
        {icon}
      </span>
      <p className="mt-3 text-sm font-semibold">{title}</p>
      <p className="mt-1 text-sm text-fg-secondary">{body}</p>
    </Card>
  );
}

function ToolList({
  icon,
  title,
  tools,
}: {
  icon: React.ReactNode;
  title: string;
  tools: Array<{ name: string; description: string }>;
}) {
  return (
    <div>
      <p className="mb-2 flex items-center gap-2 text-sm font-medium [&_svg]:size-4 [&_svg]:text-fg-tertiary">
        {icon}
        {title}
      </p>
      <ul className="flex flex-col gap-2">
        {tools.map((t) => (
          <li key={t.name}>
            <p className="font-mono text-xs">{t.name}</p>
            <p className="line-clamp-2 text-xs text-fg-secondary">{t.description}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="shrink-0 text-fg-secondary">{label}</dt>
      <dd className="min-w-0 text-right">{value}</dd>
    </div>
  );
}
