import {
  ACTION_TYPE_LABELS,
  ACTION_TYPES,
  type ActionDto,
  AGENT_KEYS,
  AGENT_LABELS,
  type AgentKey,
} from '@stockroom/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { Bot, Inbox } from 'lucide-react';
import { z } from 'zod';
import { Pagination } from '@/components/data-table/pagination';
import { EmptyState, ErrorState } from '@/components/feedback/states';
import { Page, PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/misc';
import { Select } from '@/components/ui/select';
import { Sheet, SheetBody, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { SegmentedControl } from '@/components/ui/tabs';
import { ActionDetail } from '@/features/agents/action-detail';
import { actionCountsQuery, actionQuery, actionsQuery } from '@/features/agents/api';
import { ActionStatusPill, AgentAvatar } from '@/features/agents/ui';
import { ago, moneyWhole } from '@/lib/format';
import { cleanSearch, enumParam, idParam, pageParam } from '@/lib/list-search';
import { useMediaQuery } from '@/lib/use-media-query';
import { cn } from '@/lib/utils';

const searchSchema = z.object({
  view: z.enum(['waiting', 'decided']).optional().catch(undefined),
  agentKey: enumParam(AGENT_KEYS),
  type: enumParam(ACTION_TYPES),
  page: pageParam,
  id: idParam,
});
type Search = z.infer<typeof searchSchema>;

export const Route = createFileRoute('/_app/approvals')({
  validateSearch: searchSchema,
  staticData: { title: 'Approvals' },
  component: ApprovalsPage,
});

const DECIDED = ['APPROVED', 'EXECUTED', 'REJECTED', 'FAILED', 'EXPIRED'];
const PAGE_SIZE = 25;

function ApprovalsPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const desktop = useMediaQuery('(min-width: 1024px)');
  const view = search.view ?? 'waiting';
  const page = search.page ?? 1;
  const list = useQuery({
    ...actionsQuery({
      status: view === 'waiting' ? ['PENDING'] : DECIDED,
      agentKey: search.agentKey,
      type: search.type,
      page,
      pageSize: PAGE_SIZE,
    }),
    placeholderData: keepPreviousData,
  });
  const counts = useQuery(actionCountsQuery);
  const setSearch = (patch: Partial<Search>) =>
    void navigate({ search: (prev) => cleanSearch({ ...prev, ...patch }), replace: true });
  const rows = list.data?.data ?? [];
  // On desktop the first proposal is open by default; on phones only an explicit choice opens the sheet.
  const selectedId = search.id ?? (desktop ? rows[0]?.id : undefined);
  const fromList = rows.find((r) => r.id === selectedId);
  const detail = useQuery({
    ...actionQuery(selectedId ?? ''),
    enabled: !!selectedId,
    initialData: fromList,
  });
  const filtered = Boolean(search.agentKey || search.type);
  const afterDecision = () => {
    const next = rows.find((r) => r.id !== selectedId);
    setSearch({ id: view === 'waiting' ? next?.id : selectedId });
  };

  return (
    <Page>
      <PageHeader
        title="Approvals"
        description="Agents propose; you decide. Approving carries the proposal out straight away, as the agent on your behalf."
        actions={
          <SegmentedControl
            aria-label="Show"
            value={view}
            onValueChange={(v) =>
              setSearch({ view: v === 'waiting' ? undefined : v, page: undefined, id: undefined })
            }
            options={[
              {
                value: 'waiting',
                label: `Waiting${counts.data?.pending ? ` · ${counts.data.pending}` : ''}`,
              },
              { value: 'decided', label: 'Decided' },
            ]}
          />
        }
      />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(320px,420px)_1fr]">
        <section aria-label="Proposals" className="flex min-w-0 flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            <Select
              aria-label="Agent"
              value={search.agentKey ?? 'all'}
              onValueChange={(v) =>
                setSearch({ agentKey: v === 'all' ? undefined : (v as AgentKey), page: undefined })
              }
              options={[
                { value: 'all', label: 'All agents' },
                ...AGENT_KEYS.filter((k) => k !== 'assistant').map((k) => ({
                  value: k,
                  label: AGENT_LABELS[k],
                })),
              ]}
              className="w-48"
            />
            <Select
              aria-label="Type"
              value={search.type ?? 'all'}
              onValueChange={(v) =>
                setSearch({
                  type: v === 'all' ? undefined : (v as (typeof ACTION_TYPES)[number]),
                  page: undefined,
                })
              }
              options={[
                { value: 'all', label: 'All types' },
                ...ACTION_TYPES.map((t) => ({ value: t, label: ACTION_TYPE_LABELS[t] })),
              ]}
              className="w-44"
            />
          </div>
          {list.isPending ? (
            <div className="flex flex-col gap-2">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-24 rounded-lg" />
              ))}
            </div>
          ) : list.isError ? (
            <Card>
              <ErrorState error={list.error} onRetry={() => void list.refetch()} />
            </Card>
          ) : rows.length === 0 ? (
            <Card>
              <EmptyState
                icon={<Inbox strokeWidth={1.75} />}
                title={
                  filtered
                    ? 'No proposals match'
                    : view === 'waiting'
                      ? 'Nothing is waiting for you'
                      : 'No decisions yet'
                }
                description={
                  filtered
                    ? 'Try another agent or type.'
                    : view === 'waiting'
                      ? 'When an agent proposes a purchase order, transfer or setting change, it appears here with its reasoning and expected impact.'
                      : 'Approved, rejected and expired proposals are kept here.'
                }
                action={
                  filtered ? (
                    <Button
                      variant="secondary"
                      onClick={() => setSearch({ agentKey: undefined, type: undefined })}
                    >
                      Clear filters
                    </Button>
                  ) : (
                    <Button variant="secondary" asChild>
                      <Link to="/agents">
                        <Bot strokeWidth={1.75} /> Open the agents
                      </Link>
                    </Button>
                  )
                }
              />
            </Card>
          ) : (
            <>
              <ul className="flex flex-col gap-2">
                {rows.map((a) => (
                  <li key={a.id}>
                    <ProposalRow
                      action={a}
                      selected={a.id === selectedId}
                      onSelect={() => setSearch({ id: a.id })}
                    />
                  </li>
                ))}
              </ul>
              {(list.data?.meta.total ?? 0) > PAGE_SIZE && (
                <Card className="overflow-hidden">
                  <Pagination
                    page={page}
                    pageSize={PAGE_SIZE}
                    total={list.data?.meta.total}
                    onPageChange={(p) => setSearch({ page: p, id: undefined })}
                    noun="proposals"
                  />
                </Card>
              )}
            </>
          )}
        </section>

        {desktop && (
          <section aria-label="Proposal" className="min-w-0">
            {selectedId && detail.data ? (
              <Card className="sticky top-20 p-6">
                <ActionDetail action={detail.data} onDecided={afterDecision} />
              </Card>
            ) : selectedId && detail.isPending ? (
              <Skeleton className="h-96 rounded-lg" />
            ) : rows.length ? (
              <Card className="p-6 text-sm text-fg-secondary">Choose a proposal to see the details.</Card>
            ) : null}
          </section>
        )}
      </div>

      {!desktop && (
        <Sheet open={!!search.id} onOpenChange={(o) => !o && setSearch({ id: undefined })}>
          <SheetContent>
            <SheetTitle className="sr-only">Proposal</SheetTitle>
            <SheetBody>
              {detail.data ? (
                <ActionDetail action={detail.data} onDecided={() => setSearch({ id: undefined })} />
              ) : (
                <Skeleton className="h-80" />
              )}
            </SheetBody>
          </SheetContent>
        </Sheet>
      )}
    </Page>
  );
}

function ProposalRow({
  action: a,
  selected,
  onSelect,
}: {
  action: ActionDto;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected ? 'true' : undefined}
      className={cn(
        'flex w-full gap-3 rounded-lg border bg-surface p-4 text-left shadow-card transition-colors',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]',
        selected ? 'border-accent ring-1 ring-accent' : 'border-hairline hover:border-hairline-strong',
      )}
    >
      <AgentAvatar agentKey={a.agent.key} size="sm" />
      <span className="min-w-0 flex-1">
        <span className="flex items-start justify-between gap-2">
          <span className="text-sm font-semibold">{a.title}</span>
          {a.expectedImpact.cost && (
            <span className="shrink-0 tabular text-sm font-medium">{moneyWhole(a.expectedImpact.cost)}</span>
          )}
        </span>
        <span className="mt-0.5 line-clamp-2 block text-xs text-fg-secondary">{a.summary}</span>
        <span className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-fg-tertiary">
          {a.status !== 'PENDING' && <ActionStatusPill status={a.status} />}
          <span>{a.agent.name}</span>
          <span aria-hidden>·</span>
          <span>{ago(a.createdAt)}</span>
          {a.riskLevel !== 'LOW' && (
            <span className={a.riskLevel === 'HIGH' ? 'text-danger' : 'text-warning'}>
              {a.riskLevel === 'HIGH' ? 'High risk' : 'Medium risk'}
            </span>
          )}
          {a.rationaleSource === 'RULE' && <span>Rule-based</span>}
        </span>
      </span>
    </button>
  );
}
