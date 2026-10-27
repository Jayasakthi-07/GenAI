import { formatNumber } from '@stockroom/shared';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Bot, ChevronRight, FileText } from 'lucide-react';
import { ForecastChart } from '@/components/charts/charts';
import { EmptyState, ErrorState } from '@/components/feedback/states';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/misc';
import { runsQuery } from '@/features/agents/api';
import { AgentAvatar, RunStatusPill } from '@/features/agents/ui';
import { Markdown } from '@/features/assistant/markdown';
import { insightQuery } from '@/features/insights/api';
import { longDate, shortDate } from '@/features/insights/shared';
import { latestBriefingQuery } from '@/features/reports/api';
import { ReportKpis, ReportSource } from '@/features/reports/report-view';
import { WriteReportButton } from '@/features/reports/write-report-button';
import { ago, today } from '@/lib/format';
import { useRunStepLabels } from '@/lib/live';

/** The first paragraphs of the latest daily briefing, with its headline figures. */
export function BriefingCard() {
  const q = useQuery(latestBriefingQuery);
  const r = q.data;
  const stale = r ? r.createdAt.slice(0, 10) < today() : false;
  const lead =
    r?.content.narrative
      .split(/\n\s*\n/)
      .slice(0, 2)
      .join('\n\n') ?? '';
  return (
    <Card className="flex h-full flex-col">
      <CardHeader>
        <div>
          <CardTitle>{stale || !r ? 'Latest briefing' : 'Today’s briefing'}</CardTitle>
          <CardDescription>
            {r ? `${r.title} · written ${ago(r.createdAt)}` : 'From the Report Writer'}
          </CardDescription>
        </div>
        {r && <ReportSource report={r} />}
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        {q.isPending ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        ) : q.isError ? (
          <ErrorState
            compact
            error={q.error}
            onRetry={() => void q.refetch()}
            title="Couldn’t load the briefing"
          />
        ) : !r ? (
          <EmptyState
            compact
            icon={<FileText strokeWidth={1.75} />}
            title="No briefing yet"
            description="The Report Writer writes one every morning from the day’s figures."
            action={<WriteReportButton variant="secondary" />}
          />
        ) : (
          <>
            <ReportKpis kpis={r.content.kpis.slice(0, 4)} />
            <Markdown text={lead} className="line-clamp-[8] text-[15px] leading-relaxed" />
            <div className="mt-auto flex flex-wrap items-center justify-between gap-2">
              <Link
                to="/reports/$id"
                params={{ id: r.id }}
                className="inline-flex items-center gap-1 text-sm font-medium text-accent-text hover:underline"
              >
                Read the briefing <ChevronRight className="size-4" strokeWidth={1.75} />
              </Link>
              {stale && <WriteReportButton variant="secondary" />}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

/** The latest agent runs, updating live as they progress. */
export function AgentActivityCard() {
  const q = useQuery(runsQuery({ pageSize: 6 }));
  const labels = useRunStepLabels();
  return (
    <Card className="flex flex-col overflow-hidden">
      <CardHeader>
        <div>
          <CardTitle>Agent activity</CardTitle>
          <CardDescription>What the agents did most recently</CardDescription>
        </div>
      </CardHeader>
      {q.isPending ? (
        <CardContent className="flex flex-col gap-3">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </CardContent>
      ) : q.isError ? (
        <ErrorState compact error={q.error} onRetry={() => void q.refetch()} />
      ) : q.data.data.length === 0 ? (
        <EmptyState
          compact
          icon={<Bot strokeWidth={1.75} />}
          title="No runs yet"
          description="Agents run on their schedules and when stock changes."
          action={
            <Link to="/agents" className="text-sm font-medium text-accent-text hover:underline">
              Open agents
            </Link>
          }
        />
      ) : (
        <ul className="flex-1 divide-y divide-hairline border-t border-hairline">
          {q.data.data.map((r) => {
            const active = r.status === 'QUEUED' || r.status === 'RUNNING';
            return (
              <li key={r.id}>
                <Link
                  to="/agents/runs/$id"
                  params={{ id: r.id }}
                  className="flex items-start gap-3 px-5 py-3 transition-colors hover:bg-neutral-soft"
                >
                  <AgentAvatar agentKey={r.agentKey} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">{r.agentName}</span>
                      <RunStatusPill status={r.status} />
                    </span>
                    <span className="mt-0.5 line-clamp-2 block text-xs text-fg-secondary">
                      {r.status === 'QUEUED'
                        ? 'Waiting to start…'
                        : active
                          ? (labels.get(r.id) ?? 'Working…')
                          : (r.summary ?? r.error ?? '')}
                    </span>
                    <span className="mt-0.5 block text-xs text-fg-tertiary tabular-nums">{ago(r.createdAt)}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

/** Units sold over the last four weeks against the Demand Forecaster's next four. */
export function DemandOutlookCard() {
  const q = useQuery(insightQuery('forecast', { days: 90 }));
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Sales and forecast</CardTitle>
          <CardDescription>Units a day, with the Demand Forecaster’s 80 % likely range</CardDescription>
        </div>
        {q.data?.medianWape !== null && q.data?.medianWape !== undefined && (
          <Link
            to="/analytics"
            search={{ tab: 'forecast' }}
            className="text-sm font-medium text-accent-text hover:underline"
          >
            {formatNumber(Math.max(0, 100 - q.data.medianWape), { decimals: 0 })} % accurate
          </Link>
        )}
      </CardHeader>
      <CardContent>
        {q.isPending ? (
          <Skeleton className="h-[260px]" />
        ) : q.isError ? (
          <ErrorState compact error={q.error} onRetry={() => void q.refetch()} />
        ) : q.data.products === 0 ? (
          <EmptyState
            compact
            icon={<Bot strokeWidth={1.75} />}
            title="No forecast yet"
            description="The Demand Forecaster runs every night."
          />
        ) : (
          <ForecastChart
            ariaLabel="Units sold per day for four weeks and the forecast for the next four"
            data={q.data.series}
            today={today()}
            formatValue={(v) => formatNumber(v)}
            formatTick={shortDate}
            formatLabel={longDate}
          />
        )}
      </CardContent>
    </Card>
  );
}
