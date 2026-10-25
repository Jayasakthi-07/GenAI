import { formatNumber, formatPercent } from '@stockroom/shared';
import { useQuery } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { Activity } from 'lucide-react';
import { useState } from 'react';
import { BarsChart } from '@/components/charts/charts';
import { Stat } from '@/components/domain/status';
import { EmptyState, ErrorState } from '@/components/feedback/states';
import { StatusPill } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/misc';
import { SegmentedControl } from '@/components/ui/tabs';
import { TD, TH, THead, TR } from '@/components/ui/table';
import { ago } from '@/lib/format';
import { usageQuery } from './api';

/** Calls, failures, latency and tokens per provider and agent. */
export function UsageCard() {
  const [days, setDays] = useState<'7' | '14' | '30'>('14');
  const q = useQuery(usageQuery(Number(days)));
  const u = q.data;
  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <div>
          <CardTitle>Usage</CardTitle>
          <CardDescription>
            Agent and assistant calls. Tests and probes appear in the recent list only.
          </CardDescription>
        </div>
        <SegmentedControl
          aria-label="Period"
          size="sm"
          value={days}
          onValueChange={setDays}
          options={[
            { value: '7', label: '7D' },
            { value: '14', label: '14D' },
            { value: '30', label: '30D' },
          ]}
        />
      </CardHeader>
      {q.isPending ? (
        <Skeleton className="m-5 mt-0 h-48" />
      ) : q.isError ? (
        <ErrorState compact error={q.error} onRetry={() => void q.refetch()} />
      ) : (
        u && (
          <>
            <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-5">
              <Stat label="Calls" value={formatNumber(u.totals.calls)} />
              <Stat
                label="Succeeded"
                value={
                  u.totals.calls ? formatPercent(u.totals.succeeded / u.totals.calls, { decimals: 0 }) : '—'
                }
                tone={u.totals.calls && u.totals.failed / u.totals.calls > 0.2 ? 'warning' : undefined}
              />
              <Stat
                label="Avg latency"
                value={
                  u.totals.avgLatencyMs !== null
                    ? `${formatNumber(u.totals.avgLatencyMs / 1000, { decimals: 1 })} s`
                    : '—'
                }
              />
              <Stat
                label="Tokens"
                value={formatNumber(u.totals.promptTokens + u.totals.completionTokens, { compact: true })}
                sub={`${formatNumber(u.totals.promptTokens, { compact: true })} in · ${formatNumber(u.totals.completionTokens, { compact: true })} out`}
              />
              <Stat label="Served by fallback" value={formatNumber(u.totals.fallbacks)} />
            </CardContent>
            {u.totals.calls > 0 ? (
              <CardContent className="pt-0">
                <BarsChart
                  ariaLabel="Model calls per day"
                  data={u.byDay.map((d) => ({ ...d, label: format(parseISO(d.date), 'd MMM') }))}
                  xKey="label"
                  series={[
                    { key: 'succeeded', label: 'Succeeded' },
                    { key: 'failed', label: 'Failed', color: 'var(--danger)' },
                  ]}
                  formatValue={(v) => formatNumber(v)}
                  height={180}
                />
              </CardContent>
            ) : (
              <EmptyState
                compact
                icon={<Activity strokeWidth={1.75} />}
                title="No agent calls yet"
                description="Agents record every model call here, with the model that actually answered."
              />
            )}
            {u.byProvider.length > 0 && (
              <div className="overflow-x-auto border-t border-hairline">
                <table className="w-full min-w-[560px] border-separate border-spacing-0 text-sm">
                  <THead>
                    <tr>
                      <TH className="pl-5">Provider</TH>
                      <TH numeric>Calls</TH>
                      <TH numeric>Failed</TH>
                      <TH numeric>Avg latency</TH>
                      <TH numeric className="pr-5">
                        Today / budget
                      </TH>
                    </tr>
                  </THead>
                  <tbody>
                    {u.byProvider.map((p) => (
                      <TR key={p.providerKey} className="[&:last-child_td]:border-b-0">
                        <TD density="compact" className="pl-5 font-medium">
                          {p.providerKey}
                        </TD>
                        <TD numeric density="compact">
                          {formatNumber(p.calls)}
                        </TD>
                        <TD
                          numeric
                          density="compact"
                          className={p.failed ? 'text-danger' : 'text-fg-tertiary'}
                        >
                          {formatNumber(p.failed)}
                        </TD>
                        <TD numeric density="compact">
                          {p.avgLatencyMs !== null
                            ? `${formatNumber(p.avgLatencyMs / 1000, { decimals: 1 })} s`
                            : '—'}
                        </TD>
                        <TD numeric density="compact" className="pr-5">
                          {formatNumber(p.today)}
                          {p.dailyBudget ? ` / ${formatNumber(p.dailyBudget)}` : ''}
                        </TD>
                      </TR>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {u.recent.length > 0 && (
              <details className="border-t border-hairline">
                <summary className="cursor-pointer px-5 py-3 text-sm text-fg-secondary select-none hover:text-fg">
                  Recent calls
                </summary>
                <ul className="divide-y divide-hairline border-t border-hairline text-sm">
                  {u.recent.map((r) => (
                    <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-2">
                      <StatusPill
                        tone={
                          r.status === 'SUCCESS'
                            ? 'success'
                            : r.status === 'RATE_LIMITED' || r.status === 'BUDGET_EXCEEDED'
                              ? 'warning'
                              : 'danger'
                        }
                      >
                        {r.status.toLowerCase().replace('_', ' ')}
                      </StatusPill>
                      <span className="font-mono text-xs">{r.modelId}</span>
                      <span className="text-xs text-fg-tertiary">
                        {r.providerKey} · {r.purpose.toLowerCase().replace('_', ' ')}
                        {r.agentKey ? ` · ${r.agentKey.replace(/_/g, ' ')}` : ''}
                        {r.isFallback ? ' · fallback' : ''}
                      </span>
                      <span className="ml-auto tabular text-xs text-fg-tertiary">
                        {formatNumber(r.latencyMs)} ms
                        {r.tokens !== null ? ` · ${formatNumber(r.tokens)} tok` : ''} · {ago(r.startedAt)}
                      </span>
                      {r.errorMessage && <p className="w-full text-xs text-danger">{r.errorMessage}</p>}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </>
        )
      )}
    </Card>
  );
}
