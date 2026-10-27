import { formatNumber, type ReportContent, type ReportDto } from '@stockroom/shared';
import { Link } from '@tanstack/react-router';
import { ArrowUpRight, ChevronRight } from 'lucide-react';
import { AiMarker } from '@/components/ai/ai-marker';
import { SeverityPill } from '@/components/domain/status';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { AgentAvatar } from '@/features/agents/ui';
import { Markdown } from '@/features/assistant/markdown';
import { ago } from '@/lib/format';
import { cn } from '@/lib/utils';

const toneClass = {
  good: 'text-success',
  bad: 'text-danger',
  neutral: 'text-fg-tertiary',
} as const;

export function ReportKpis({ kpis, className }: { kpis: ReportContent['kpis']; className?: string }) {
  return (
    <dl
      className={cn(
        'grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-hairline bg-hairline sm:grid-cols-4',
        className,
      )}
    >
      {kpis.map((k) => (
        <div key={k.key} className="bg-surface px-4 py-3">
          <dt className="text-xs text-fg-secondary">{k.label}</dt>
          <dd className="mt-1 text-lg font-semibold tracking-tight tabular-nums">{k.value}</dd>
          {k.change && <dd className={cn('text-xs tabular-nums', toneClass[k.tone])}>{k.change}</dd>}
        </div>
      ))}
    </dl>
  );
}

export function ReportSource({ report }: { report: Pick<ReportDto, 'narrativeSource' | 'modelUsed'> }) {
  return report.narrativeSource === 'AI' ? <AiMarker model={report.modelUsed} /> : <AiMarker source="rule" />;
}

/** The full report: figures first, then the narrative, then what needs attention. */
export function ReportBody({ report }: { report: ReportDto }) {
  const c = report.content;
  return (
    <div className="flex flex-col gap-4">
      <ReportKpis kpis={c.kpis} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Briefing</CardTitle>
              <ReportSource report={report} />
            </CardHeader>
            <CardContent>
              <Markdown text={c.narrative} className="text-[15px] leading-relaxed" />
              <p className="mt-4 text-xs text-fg-tertiary">
                {report.narrativeSource === 'AI'
                  ? 'Written by the Report Writer from the figures on this page. Numbers come from Stockroom, not the model.'
                  : 'Generated from the figures on this page by rules, because no AI model was available.'}
              </p>
            </CardContent>
          </Card>

          {c.risks.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Most urgent</CardTitle>
              </CardHeader>
              <ul className="divide-y divide-hairline border-t border-hairline">
                {c.risks.map((r, i) => {
                  const body = (
                    <>
                      <SeverityPill severity={r.severity} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium">{r.title}</span>
                        <span className="block text-sm text-fg-secondary">{r.detail}</span>
                      </span>
                    </>
                  );
                  return (
                    <li key={i}>
                      {r.link ? (
                        <Link
                          to={r.link}
                          className="flex items-start gap-3 px-5 py-3 transition-colors hover:bg-neutral-soft"
                        >
                          {body}
                          <ChevronRight
                            className="mt-0.5 size-4 shrink-0 text-fg-tertiary"
                            strokeWidth={1.75}
                          />
                        </Link>
                      ) : (
                        <div className="flex items-start gap-3 px-5 py-3">{body}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}

          {c.agentActivity.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>What the agents did</CardTitle>
              </CardHeader>
              <div className="overflow-x-auto border-t border-hairline">
                <Table>
                  <THead>
                    <TR>
                      <TH>Agent</TH>
                      <TH className="text-right">Runs</TH>
                      <TH className="text-right">With AI</TH>
                      <TH className="text-right">Proposals</TH>
                      <TH className="text-right">Executed</TH>
                      <TH className="text-right">Rejected</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {c.agentActivity.map((a) => (
                      <TR key={a.agentKey}>
                        <TD>
                          <Link
                            to="/agents/$key"
                            params={{ key: a.agentKey }}
                            className="inline-flex items-center gap-2 font-medium hover:underline"
                          >
                            <AgentAvatar agentKey={a.agentKey} size="sm" />
                            {a.agent}
                          </Link>
                        </TD>
                        <TD className="text-right tabular-nums">{formatNumber(a.runs)}</TD>
                        <TD className="text-right tabular-nums">{formatNumber(a.aiRuns)}</TD>
                        <TD className="text-right tabular-nums">{formatNumber(a.proposals)}</TD>
                        <TD className="text-right tabular-nums">{formatNumber(a.executed)}</TD>
                        <TD className="text-right tabular-nums">{formatNumber(a.rejected)}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </div>
            </Card>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          {c.changes.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>What changed</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="flex flex-col gap-2 text-sm">
                  {c.changes.map((line, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="mt-2 size-1 shrink-0 rounded-full bg-fg-tertiary" aria-hidden />
                      <span className="text-fg-secondary">{line}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader>
              <CardTitle>Waiting for a decision</CardTitle>
            </CardHeader>
            {c.pendingDecisions.length === 0 ? (
              <CardContent>
                <p className="text-sm text-fg-secondary">Nothing was waiting when this was written.</p>
              </CardContent>
            ) : (
              <ul className="divide-y divide-hairline border-t border-hairline">
                {c.pendingDecisions.map((p) => (
                  <li key={p.id}>
                    <Link
                      to="/approvals"
                      search={{ id: p.id }}
                      className="flex items-start gap-2 px-5 py-3 transition-colors hover:bg-neutral-soft"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium">{p.title}</span>
                        <span className="block text-xs text-fg-tertiary">
                          {p.agent} · {ago(p.createdAt)}
                        </span>
                      </span>
                      <ArrowUpRight className="mt-0.5 size-4 shrink-0 text-fg-tertiary" strokeWidth={1.75} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
