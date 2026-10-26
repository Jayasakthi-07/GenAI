import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { Bot, Inbox, Sparkles } from 'lucide-react';
import { z } from 'zod';
import { AiMarker } from '@/components/ai/ai-marker';
import { EmptyState, ErrorState } from '@/components/feedback/states';
import { Page, PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/misc';
import { SegmentedControl } from '@/components/ui/tabs';
import { aiStatusQuery } from '@/features/ai/api';
import { AgentCard } from '@/features/agents/agent-card';
import { actionCountsQuery, agentGraphQuery, agentsQuery } from '@/features/agents/api';
import { NetworkView } from '@/features/agents/network-view';
import { RunsList } from '@/features/agents/runs-list';
import { useCan } from '@/lib/auth';
import { cleanSearch } from '@/lib/list-search';

const searchSchema = z.object({
  tab: z.enum(['team', 'activity', 'network']).optional().catch(undefined),
});

export const Route = createFileRoute('/_app/agents/')({
  validateSearch: searchSchema,
  staticData: { title: 'Agents' },
  component: AgentsHub,
});

function AgentsHub() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const tab = search.tab ?? 'team';
  const can = useCan();
  const agents = useQuery(agentsQuery);
  const counts = useQuery(actionCountsQuery);
  const ai = useQuery(aiStatusQuery);
  const graph = useQuery({ ...agentGraphQuery, enabled: tab === 'network' });
  const pending = counts.data?.pending ?? 0;

  return (
    <Page>
      <PageHeader
        title="Agents"
        description="Specialists that watch stock, plan orders and explain what they find. Numbers come from code; judgment comes from the model; consequential actions wait for you."
        actions={
          pending > 0 && (
            <Button variant="primary" asChild>
              <Link to="/approvals">
                <Inbox strokeWidth={1.75} /> {pending} waiting for approval
              </Link>
            </Button>
          )
        }
      />

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SegmentedControl
          aria-label="View"
          value={tab}
          onValueChange={(v) =>
            void navigate({
              search: (p) => cleanSearch({ ...p, tab: v === 'team' ? undefined : v }),
              replace: true,
            })
          }
          options={[
            { value: 'team', label: 'Team' },
            { value: 'activity', label: 'Activity' },
            { value: 'network', label: 'Network' },
          ]}
        />
        <p className="flex flex-wrap items-center gap-2 text-sm text-fg-secondary">
          {ai.data?.mode === 'AI' && ai.data.active ? (
            <>
              <AiMarker model={ai.data.active.modelId} />
              <span>{ai.data.active.isLocal ? 'on this computer' : ai.data.active.providerName}</span>
            </>
          ) : ai.data ? (
            <>
              <AiMarker source="rule" />
              <span>Agents still run, using rules.</span>
            </>
          ) : null}
          {can('agents.configure') && (
            <Link to="/settings/ai" className="text-accent-text hover:underline">
              Models
            </Link>
          )}
        </p>
      </div>

      {tab === 'team' &&
        (agents.isPending ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-80 rounded-lg" />
            ))}
          </div>
        ) : agents.isError ? (
          <Card>
            <ErrorState error={agents.error} onRetry={() => void agents.refetch()} />
          </Card>
        ) : agents.data.length === 0 ? (
          <Card>
            <EmptyState
              icon={<Bot strokeWidth={1.75} />}
              title="No agents are set up"
              description="Restart the server; it creates the agent definitions on startup."
            />
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {agents.data.map((a) => (
              <AgentCard key={a.key} agent={a} />
            ))}
          </div>
        ))}

      {tab === 'activity' && <RunsList showAgentFilter />}

      {tab === 'network' && (
        <Card>
          <CardHeader>
            <div>
              <CardTitle>How work flows</CardTitle>
              <CardDescription>
                Hand-offs are fixed rules in code: when the Stock Sentinel finds items that need replenishing,
                it hands exactly those products to the Replenishment Planner.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {graph.isPending ? (
              <Skeleton className="h-40" />
            ) : graph.isError ? (
              <ErrorState compact error={graph.error} onRetry={() => void graph.refetch()} />
            ) : (
              <NetworkView graph={graph.data} />
            )}
          </CardContent>
          <CardContent className="flex items-start gap-2 border-t border-hairline pt-4 text-xs text-fg-tertiary">
            <Sparkles className="mt-0.5 size-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
            Models never decide which agent runs next. The scheduler, event triggers and hand-offs are
            deterministic.
          </CardContent>
        </Card>
      )}
    </Page>
  );
}
