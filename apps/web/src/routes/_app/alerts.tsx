import {
  type Alert,
  ALERT_STATUS_LABELS,
  ALERT_STATUSES,
  ALERT_TYPE_LABELS,
  ALERT_TYPES,
  formatNumber,
  SEVERITIES,
  SEVERITY_LABELS,
  type AlertStatus,
} from '@stockroom/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import type { RowSelectionState } from '@tanstack/react-table';
import { BellOff, Check, CircleCheck, Clock, ExternalLink, RefreshCw } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import { AiMarker } from '@/components/ai/ai-marker';
import { columnHelper, DataTable } from '@/components/data-table/data-table';
import { BulkBar, Pagination } from '@/components/data-table/pagination';
import {
  ClearFilters,
  DensityToggle,
  FilterMenu,
  SearchInput,
  Toolbar,
} from '@/components/data-table/toolbar';
import { ReasonDialog } from '@/components/domain/reason-dialog';
import { SeverityPill } from '@/components/domain/status';
import { ListPage, PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/menus';
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useWarehouses } from '@/features/catalog/api';
import { alertCountsQuery, alertsQuery, useAlertBulk, useRunStockCheck } from '@/features/alerts/api';
import { useCan } from '@/lib/auth';
import { ago, dateTime } from '@/lib/format';
import { reportError } from '@/lib/forms';
import { cleanSearch, enumListParam, idParam, listSearch } from '@/lib/list-search';
import { cn } from '@/lib/utils';

const searchSchema = z.object({
  ...listSearch,
  status: enumListParam(ALERT_STATUSES),
  severity: enumListParam(SEVERITIES),
  type: enumListParam(ALERT_TYPES),
  warehouseId: idParam,
  productId: idParam,
});
type Search = z.infer<typeof searchSchema>;

export const Route = createFileRoute('/_app/alerts')({
  validateSearch: searchSchema,
  staticData: { title: 'Alerts' },
  component: AlertsPage,
});

const col = columnHelper<Alert>();
const BAR: Record<string, string> = {
  CRITICAL: 'bg-danger',
  HIGH: 'bg-danger/70',
  MEDIUM: 'bg-warning',
  LOW: 'bg-fg-tertiary',
  INFO: 'bg-hairline-strong',
};

const SNOOZES = [
  { label: '4 hours', hours: 4 },
  { label: 'Until tomorrow', hours: 18 },
  { label: '3 days', hours: 72 },
  { label: '1 week', hours: 168 },
];
const snoozeUntil = (hours: number) => new Date(Date.now() + hours * 3_600_000).toISOString();

function AlertsPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const can = useCan();
  const warehouses = useWarehouses();
  const page = search.page ?? 1;
  const pageSize = search.pageSize ?? 50;
  const query = useQuery({
    ...alertsQuery({ ...search, page, pageSize }),
    placeholderData: keepPreviousData,
  });
  const counts = useQuery(alertCountsQuery);
  const bulk = useAlertBulk();
  const check = useRunStockCheck();
  const [selection, setSelection] = useState<RowSelectionState>({});
  const [open, setOpen] = useState<Alert | null>(null);
  const [resolving, setResolving] = useState<string[] | null>(null);
  const setSearch = (patch: Partial<Search>, keepPage = false) =>
    void navigate({
      search: (prev) => cleanSearch({ ...prev, ...(keepPage ? {} : { page: undefined }), ...patch }),
      replace: true,
    });
  const filtered = Boolean(
    search.q || search.status || search.severity || search.type || search.warehouseId || search.productId,
  );
  const selected = Object.keys(selection).filter((k) => selection[k]);
  // Selection belongs to one page of results.
  const [selectionFor, setSelectionFor] = useState(query.data);
  if (query.data !== selectionFor) {
    setSelectionFor(query.data);
    setSelection({});
  }

  const act = (input: Parameters<typeof bulk.mutate>[0], done: string) =>
    bulk.mutate(input, {
      onSuccess: (r) => {
        toast.success(`${done} ${formatNumber(r.updated)} ${r.updated === 1 ? 'alert' : 'alerts'}`);
        setSelection({});
        setOpen(null);
        setResolving(null);
      },
      onError: (e) => reportError(e, undefined, 'Couldn’t update the alerts'),
    });

  const columns = useMemo(
    () => [
      col.display({
        id: 'bar',
        header: () => <span className="sr-only">Severity</span>,
        meta: { className: 'w-1 !px-0', required: true },
        cell: ({ row }) => (
          <span className={cn('block h-8 w-1 rounded-full', BAR[row.original.severity])} aria-hidden />
        ),
      }),
      col.accessor('title', {
        id: 'title',
        header: 'Alert',
        meta: { required: true, className: 'min-w-72' },
        cell: ({ row }) => (
          <div className="min-w-0">
            <p
              className={cn(
                'truncate font-medium',
                row.original.status === 'RESOLVED' &&
                  'text-fg-secondary line-through decoration-hairline-strong',
              )}
            >
              {row.original.title}
            </p>
            <p className="truncate text-xs text-fg-tertiary">{row.original.message}</p>
          </div>
        ),
      }),
      col.accessor('severity', {
        id: 'severity',
        header: 'Severity',
        enableSorting: true,
        cell: (c) => <SeverityPill severity={c.getValue()} />,
      }),
      col.accessor('type', {
        id: 'type',
        header: 'Type',
        cell: (c) => (
          <span className="whitespace-nowrap text-fg-secondary">{ALERT_TYPE_LABELS[c.getValue()]}</span>
        ),
      }),
      col.accessor((a) => a.warehouse?.code ?? '—', {
        id: 'warehouse',
        header: 'Where',
        cell: (c) => <span className="text-fg-secondary">{c.getValue()}</span>,
      }),
      col.accessor('status', {
        id: 'status',
        header: 'Status',
        cell: ({ row }) => (
          <span className="text-xs whitespace-nowrap text-fg-secondary">
            {ALERT_STATUS_LABELS[row.original.status]}
            {row.original.status === 'SNOOZED' && row.original.snoozedUntil && (
              <span className="block text-fg-tertiary">until {dateTime(row.original.snoozedUntil)}</span>
            )}
          </span>
        ),
      }),
      col.accessor('createdAt', {
        id: 'createdAt',
        header: 'Raised',
        enableSorting: true,
        cell: (c) => <span className="whitespace-nowrap text-fg-secondary">{ago(c.getValue())}</span>,
      }),
    ],
    [],
  );

  const summary = counts.data;
  return (
    <ListPage>
      <PageHeader
        title="Alerts"
        description={
          summary
            ? `${formatNumber(summary.open)} open · ${formatNumber(summary.bySeverity.CRITICAL)} critical · ${formatNumber(summary.bySeverity.HIGH)} high`
            : 'What needs attention, most urgent first.'
        }
        actions={
          can('agents.run') && (
            <Button
              variant="secondary"
              loading={check.isPending}
              onClick={() =>
                check.mutate(undefined, {
                  onSuccess: (r) =>
                    toast.success('Stock check finished', {
                      description: `${r.created} new · ${r.updated} updated · ${r.resolved} resolved (${r.durationMs} ms)`,
                    }),
                  onError: (e) => reportError(e, undefined, 'Stock check failed'),
                })
              }
            >
              <RefreshCw strokeWidth={1.75} /> Check stock now
            </Button>
          )
        }
      />
      <Toolbar>
        <SearchInput
          value={search.q}
          onChange={(q) => setSearch({ q })}
          placeholder="Title, message or SKU…"
          className="w-full sm:w-64"
        />
        <FilterMenu
          label="Status"
          value={search.status}
          onChange={(v) => setSearch({ status: v as AlertStatus[] | undefined })}
          options={ALERT_STATUSES.map((s) => ({ value: s, label: ALERT_STATUS_LABELS[s] }))}
        />
        <FilterMenu
          label="Severity"
          value={search.severity}
          onChange={(v) => setSearch({ severity: v as Search['severity'] })}
          options={[...SEVERITIES]
            .reverse()
            .map((s) => ({
              value: s,
              label: SEVERITY_LABELS[s],
              hint: summary ? formatNumber(summary.bySeverity[s]) : undefined,
            }))}
        />
        <FilterMenu
          label="Type"
          value={search.type}
          onChange={(v) => setSearch({ type: v as Search['type'] })}
          options={ALERT_TYPES.map((t) => ({
            value: t,
            label: ALERT_TYPE_LABELS[t],
            hint: summary?.byType[t] ? formatNumber(summary.byType[t]) : undefined,
          }))}
        />
        <FilterMenu
          label="Warehouse"
          multiple={false}
          value={search.warehouseId}
          onChange={(v) => setSearch({ warehouseId: v?.[0] })}
          options={(warehouses.data ?? []).map((w) => ({ value: w.id, label: w.name }))}
        />
        <ClearFilters show={filtered} onClear={() => void navigate({ search: {}, replace: true })} />
        <div className="ml-auto">
          <DensityToggle />
        </div>
      </Toolbar>
      <DataTable
        label="Alerts"
        columns={columns}
        data={query.data?.data}
        getRowId={(a) => a.id}
        isLoading={query.isPending}
        isFetching={query.isFetching && !query.isPending}
        error={query.error}
        onRetry={() => void query.refetch()}
        sort={search.sort}
        onSortChange={(sort) => setSearch({ sort })}
        selection={selection}
        onSelectionChange={setSelection}
        onRowClick={setOpen}
        empty={
          filtered
            ? {
                icon: <BellOff strokeWidth={1.75} />,
                title: 'No alerts match',
                description: 'Resolved alerts are hidden unless you filter by status.',
              }
            : {
                icon: <CircleCheck strokeWidth={1.75} />,
                title: 'All clear',
                description:
                  'No open alerts. The Stock Sentinel checks again every 15 minutes and after every stock change.',
              }
        }
        renderCard={(a) => (
          <div className="flex gap-3">
            <span className={cn('w-1 shrink-0 rounded-full', BAR[a.severity])} aria-hidden />
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium">{a.title}</p>
                <SeverityPill severity={a.severity} />
              </div>
              <p className="mt-0.5 line-clamp-2 text-xs text-fg-secondary">{a.message}</p>
              <p className="mt-1 text-xs text-fg-tertiary">
                {ALERT_TYPE_LABELS[a.type]} · {ago(a.createdAt)}
              </p>
            </div>
          </div>
        )}
        footer={
          <Pagination
            page={page}
            pageSize={pageSize}
            total={query.data?.meta.total}
            noun="alerts"
            onPageChange={(p) => setSearch({ page: p }, true)}
            onPageSizeChange={(s) => setSearch({ pageSize: s })}
          />
        }
      />

      <BulkBar count={selected.length} onClear={() => setSelection({})}>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => act({ action: 'acknowledge', ids: selected }, 'Acknowledged')}
        >
          <Check strokeWidth={1.75} /> Acknowledge
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="secondary" size="sm">
              <Clock strokeWidth={1.75} /> Snooze
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center" side="top">
            {SNOOZES.map((s) => (
              <DropdownMenuItem
                key={s.label}
                onSelect={() =>
                  act({ action: 'snooze', ids: selected, until: snoozeUntil(s.hours) }, 'Snoozed')
                }
              >
                {s.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button variant="secondary" size="sm" onClick={() => setResolving(selected)}>
          <CircleCheck strokeWidth={1.75} /> Resolve
        </Button>
      </BulkBar>

      <AlertSheet
        alert={open}
        onClose={() => setOpen(null)}
        onAct={act}
        onResolve={(id) => setResolving([id])}
        pending={bulk.isPending}
      />
      <ReasonDialog
        open={resolving !== null}
        onOpenChange={(o) => !o && setResolving(null)}
        title={
          resolving && resolving.length > 1 ? `Resolve ${resolving.length} alerts?` : 'Resolve this alert?'
        }
        description="Rule-based alerts reopen if the condition comes back."
        confirmLabel="Resolve"
        tone="primary"
        optional
        loading={bulk.isPending}
        onConfirm={(resolution) =>
          resolving && act({ action: 'resolve', ids: resolving, resolution: resolution || null }, 'Resolved')
        }
      />
    </ListPage>
  );
}

function AlertSheet({
  alert: a,
  onClose,
  onAct,
  onResolve,
  pending,
}: {
  alert: Alert | null;
  onClose: () => void;
  onAct: (input: Parameters<ReturnType<typeof useAlertBulk>['mutate']>[0], done: string) => void;
  onResolve: (id: string) => void;
  pending: boolean;
}) {
  const data = a ? Object.entries(a.data).filter(([, v]) => v !== null && typeof v !== 'object') : [];
  return (
    <Sheet open={a !== null} onOpenChange={(o) => !o && onClose()}>
      <SheetContent>
        {a && (
          <>
            <SheetHeader>
              <div className="flex items-center gap-2">
                <SeverityPill severity={a.severity} />
                <span className="text-xs text-fg-tertiary">
                  {ALERT_TYPE_LABELS[a.type]} · priority {a.priority}
                </span>
              </div>
              <SheetTitle className="mt-1">{a.title}</SheetTitle>
              <SheetDescription>{a.message}</SheetDescription>
            </SheetHeader>
            <SheetBody className="flex flex-col gap-5">
              {a.explanation && (
                <section>
                  <div className="mb-1.5 flex items-center gap-2">
                    <h3 className="text-sm font-semibold">Why it matters</h3>
                    <AiMarker source={a.explanationSource === 'AI' ? 'ai' : 'rule'} model={a.modelUsed} />
                  </div>
                  <p className="text-sm text-fg-secondary">{a.explanation}</p>
                </section>
              )}
              {data.length > 0 && (
                <section>
                  <h3 className="mb-1.5 text-sm font-semibold">Data used</h3>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-md bg-surface-2 p-3 text-sm">
                    {data.map(([k, v]) => (
                      <div key={k} className="contents">
                        <dt className="text-fg-secondary">
                          {k.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase())}
                        </dt>
                        <dd className="text-right tabular">
                          {typeof v === 'number'
                            ? formatNumber(v, { decimals: Number.isInteger(v) ? 0 : 1 })
                            : String(v)}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </section>
              )}
              <section className="text-sm text-fg-secondary">
                <p>Raised {dateTime(a.createdAt)}</p>
                {a.acknowledgedAt && (
                  <p>
                    Acknowledged {dateTime(a.acknowledgedAt)}
                    {a.acknowledgedBy ? ` by ${a.acknowledgedBy}` : ''}
                  </p>
                )}
                {a.resolvedAt && (
                  <p>
                    {a.autoResolved
                      ? 'Resolved automatically'
                      : `Resolved${a.resolvedBy ? ` by ${a.resolvedBy}` : ''}`}{' '}
                    {dateTime(a.resolvedAt)}
                    {a.resolution ? ` — ${a.resolution}` : ''}
                  </p>
                )}
              </section>
              {a.product && (
                <Button variant="secondary" asChild className="self-start">
                  <Link to="/products/$id" params={{ id: a.product.id }} search={{ tab: 'stock' }}>
                    <ExternalLink strokeWidth={1.75} /> Open {a.product.name}
                  </Link>
                </Button>
              )}
              {a.supplier && (
                <Button variant="secondary" asChild className="self-start">
                  <Link to="/suppliers/$id" params={{ id: a.supplier.id }}>
                    <ExternalLink strokeWidth={1.75} /> Open {a.supplier.name}
                  </Link>
                </Button>
              )}
            </SheetBody>
            {a.status !== 'RESOLVED' && (
              <SheetFooter>
                {a.status === 'OPEN' && (
                  <Button
                    variant="secondary"
                    disabled={pending}
                    onClick={() => onAct({ action: 'acknowledge', ids: [a.id] }, 'Acknowledged')}
                  >
                    <Check strokeWidth={1.75} /> Acknowledge
                  </Button>
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="secondary" disabled={pending}>
                      <Clock strokeWidth={1.75} /> Snooze
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent side="top">
                    {SNOOZES.map((s) => (
                      <DropdownMenuItem
                        key={s.label}
                        onSelect={() =>
                          onAct({ action: 'snooze', ids: [a.id], until: snoozeUntil(s.hours) }, 'Snoozed')
                        }
                      >
                        {s.label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button variant="primary" disabled={pending} onClick={() => onResolve(a.id)}>
                  <CircleCheck strokeWidth={1.75} /> Resolve
                </Button>
              </SheetFooter>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
