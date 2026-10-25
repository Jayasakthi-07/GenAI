import { type CycleCountDetail, formatNumber, formatPercent } from '@stockroom/shared';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { CheckCheck, ChevronLeft, RotateCcw, Save, Send, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ReasonDialog } from '@/components/domain/reason-dialog';
import { CountStatusPill, Stat } from '@/components/domain/status';
import { PageLoading } from '@/components/feedback/page-loading';
import { ErrorState } from '@/components/feedback/states';
import { Page } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { ConfirmDialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { TD, TH, THead, TR } from '@/components/ui/table';
import {
  cycleCountQuery,
  useApproveCount,
  useCancelCount,
  useSubmitCount,
  useUpdateCountLines,
} from '@/features/operations/api';
import { useCan } from '@/lib/auth';
import { date, money } from '@/lib/format';
import { reportError } from '@/lib/forms';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/_app/cycle-counts/$id')({
  staticData: { title: 'Cycle count' },
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(cycleCountQuery(params.id)).catch(() => undefined),
  component: CountPage,
});

function CountPage() {
  const { id } = Route.useParams();
  const query = useQuery(cycleCountQuery(id));
  if (query.isPending) return <PageLoading />;
  if (query.isError)
    return (
      <Page>
        <Card>
          <ErrorState
            error={query.error}
            onRetry={() => void query.refetch()}
            title="Couldn’t open this count"
          />
        </Card>
      </Page>
    );
  return <CountView count={query.data} />;
}

const countsOf = (c: CycleCountDetail) =>
  Object.fromEntries(c.lines.map((l) => [l.id, l.countedQty?.toString() ?? '']));

function CountView({ count: c }: { count: CycleCountDetail }) {
  const can = useCan();
  const save = useUpdateCountLines(c.id);
  const submit = useSubmitCount();
  const approve = useApproveCount();
  const cancel = useCancelCount();
  const [draft, setDraft] = useState<Record<string, string>>(() => countsOf(c));
  const [recount, setRecount] = useState<Set<string>>(new Set());
  const [draftFor, setDraftFor] = useState(c);
  const [confirmApprove, setConfirmApprove] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const open = c.status === 'OPEN';
  const review = c.status === 'IN_REVIEW';
  const canApprove = can('counts.approve');

  // Fresh server data replaces local edits (after save, submit or a recount).
  if (c !== draftFor) {
    setDraftFor(c);
    setDraft(countsOf(c));
    setRecount(new Set());
  }

  const changed = useMemo(
    () =>
      c.lines
        .filter((l) => (draft[l.id] ?? '') !== (l.countedQty?.toString() ?? ''))
        .map((l) => ({
          id: l.id,
          countedQty:
            draft[l.id] === '' || draft[l.id] === undefined
              ? null
              : Math.max(0, Math.round(Number(draft[l.id]))),
        })),
    [c.lines, draft],
  );
  const counted = c.lines.filter((l) => (draft[l.id] ?? '') !== '').length;
  const allCounted = counted === c.lines.length;
  const variances = c.lines.filter((l) => (l.variance ?? 0) !== 0);

  const saveCounts = (then?: () => void) => {
    if (!changed.length) return then?.();
    save.mutate(
      { lines: changed },
      {
        onSuccess: () =>
          then
            ? then()
            : toast.success(`Saved ${changed.length} ${changed.length === 1 ? 'count' : 'counts'}`),
        onError: (e) => reportError(e, undefined, 'Couldn’t save the counts'),
      },
    );
  };
  const submitCount = () =>
    saveCounts(() =>
      submit.mutate(c.id, {
        onSuccess: () => toast.success(`${c.number} submitted for review`),
        onError: (e) => reportError(e, undefined, 'Couldn’t submit'),
      }),
    );

  return (
    <Page className="max-w-6xl">
      <Link
        to="/cycle-counts"
        className="inline-flex items-center gap-1 text-sm text-fg-secondary hover:text-fg"
      >
        <ChevronLeft className="size-4" strokeWidth={1.75} /> Cycle counts
      </Link>
      <div className="mt-3 flex flex-col gap-4 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-semibold tracking-tighter sm:text-3xl">{c.number}</h2>
            <CountStatusPill status={c.status} />
          </div>
          <p className="mt-1.5 text-base text-fg-secondary">
            {c.warehouse.name}
            {c.reason ? ` · ${c.reason}` : ''}
            {c.dueDate ? ` · due ${date(c.dueDate)}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {(open || review) && can('stock.operate') && (
            <Button variant="ghost" onClick={() => setCancelling(true)}>
              <X strokeWidth={1.75} /> Cancel count
            </Button>
          )}
          {open && can('stock.operate') && (
            <>
              <Button
                variant="secondary"
                onClick={() => saveCounts()}
                disabled={!changed.length}
                loading={save.isPending && !submit.isPending}
              >
                <Save strokeWidth={1.75} /> Save
              </Button>
              <Button
                variant="primary"
                onClick={submitCount}
                disabled={!allCounted}
                loading={submit.isPending}
              >
                <Send strokeWidth={1.75} /> Submit for review
              </Button>
            </>
          )}
          {review && canApprove && (
            <>
              <Button
                variant="secondary"
                disabled={!recount.size}
                loading={approve.isPending && recount.size > 0}
                onClick={() =>
                  approve.mutate(
                    { id: c.id, recountLineIds: [...recount] },
                    {
                      onSuccess: () => toast.success(`${recount.size} line(s) sent back for a recount`),
                      onError: (e) => reportError(e, undefined, 'Couldn’t send back'),
                    },
                  )
                }
              >
                <RotateCcw strokeWidth={1.75} /> Recount {recount.size || ''}
              </Button>
              <Button variant="primary" onClick={() => setConfirmApprove(true)} disabled={recount.size > 0}>
                <CheckCheck strokeWidth={1.75} /> Approve
              </Button>
            </>
          )}
        </div>
      </div>

      <Card className="mb-4 grid grid-cols-2 gap-x-6 gap-y-4 p-5 sm:grid-cols-4">
        <Stat label="Products" value={formatNumber(c.lineCount)} />
        <Stat
          label="Counted"
          value={`${formatNumber(open ? counted : c.countedCount)} / ${formatNumber(c.lineCount)}`}
        />
        <Stat
          label="Differences"
          value={open ? '—' : formatNumber(c.varianceCount)}
          sub={open ? 'Shown after submitting' : undefined}
        />
        <Stat
          label="Net value"
          value={open ? '—' : money(c.varianceValue)}
          tone={!open && Number(c.varianceValue) < 0 ? 'danger' : undefined}
          sub={
            c.status === 'COMPLETED'
              ? `Posted${c.approvedBy ? ` by ${c.approvedBy}` : ''}`
              : review
                ? 'Posts on approval'
                : undefined
          }
        />
      </Card>

      {open && (
        <p className="mb-3 text-sm text-fg-secondary">
          Count what’s on the shelf. Expected quantities are hidden until you submit, so they don’t influence
          the count.
        </p>
      )}

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-separate border-spacing-0 text-sm">
            <THead>
              <tr>
                {review && canApprove && <TH className="w-10 pl-5" aria-label="Recount" />}
                <TH className={cn(!(review && canApprove) && 'pl-5')}>Product</TH>
                {!open && <TH numeric>Expected</TH>}
                <TH numeric className={open ? 'pr-5' : undefined}>
                  Counted
                </TH>
                {!open && (
                  <>
                    <TH numeric>Difference</TH>
                    <TH numeric className="pr-5">
                      Value
                    </TH>
                  </>
                )}
              </tr>
            </THead>
            <tbody>
              {c.lines.map((l) => {
                const diff = l.variance ?? 0;
                return (
                  <TR
                    key={l.id}
                    className={cn(
                      '[&:last-child_td]:border-b-0',
                      l.status === 'RECOUNT' && 'bg-warning-soft/50',
                    )}
                    selected={recount.has(l.id)}
                  >
                    {review && canApprove && (
                      <TD className="pl-5">
                        <Checkbox
                          aria-label={`Recount ${l.product.name}`}
                          checked={recount.has(l.id)}
                          onCheckedChange={(v) =>
                            setRecount((s) => {
                              const next = new Set(s);
                              if (v === true) next.add(l.id);
                              else next.delete(l.id);
                              return next;
                            })
                          }
                        />
                      </TD>
                    )}
                    <TD className={cn(!(review && canApprove) && 'pl-5')}>
                      <p className="font-medium">
                        {l.product.name} {l.status === 'RECOUNT' && <Badge tone="warning">Recount</Badge>}
                      </p>
                      <p className="text-xs text-fg-tertiary">{l.product.sku}</p>
                    </TD>
                    {!open && (
                      <TD numeric className="text-fg-secondary">
                        {formatNumber(l.expectedQty)}
                      </TD>
                    )}
                    <TD numeric className={open ? 'pr-5' : undefined}>
                      {open ? (
                        <Input
                          type="number"
                          min={0}
                          inputMode="numeric"
                          aria-label={`Counted ${l.product.name}`}
                          value={draft[l.id] ?? ''}
                          onChange={(e) => setDraft((d) => ({ ...d, [l.id]: e.target.value }))}
                          className="ml-auto h-8 w-24 text-right tabular"
                          trailing={<span className="text-xs">{l.product.unit}</span>}
                        />
                      ) : (
                        formatNumber(l.countedQty ?? 0)
                      )}
                    </TD>
                    {!open && (
                      <>
                        <TD
                          numeric
                          className={cn('font-medium', diff < 0 && 'text-danger', diff > 0 && 'text-success')}
                        >
                          {diff === 0 ? (
                            <span className="font-normal text-fg-tertiary">—</span>
                          ) : (
                            `${diff > 0 ? '+' : '−'}${formatNumber(Math.abs(diff))}`
                          )}
                          {diff !== 0 && l.variancePct !== null && (
                            <span className="block text-xs font-normal">
                              {formatPercent(l.variancePct, { signed: true })}
                            </span>
                          )}
                        </TD>
                        <TD numeric className="pr-5">
                          {l.varianceValue && Number(l.varianceValue) !== 0 ? (
                            money(l.varianceValue)
                          ) : (
                            <span className="text-fg-tertiary">—</span>
                          )}
                        </TD>
                      </>
                    )}
                  </TR>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <ConfirmDialog
        open={confirmApprove}
        onOpenChange={setConfirmApprove}
        title={`Approve ${c.number}?`}
        description={
          variances.length
            ? `${variances.length} ${variances.length === 1 ? 'difference' : 'differences'} worth ${money(c.varianceValue)} will be posted to the ledger as count corrections.`
            : 'Everything matched; the count will be closed with no corrections.'
        }
        confirmLabel="Approve and post"
        loading={approve.isPending}
        onConfirm={() =>
          approve.mutate(
            { id: c.id, recountLineIds: [] },
            {
              onSuccess: () => (toast.success(`${c.number} approved`), setConfirmApprove(false)),
              onError: (e) => (reportError(e, undefined, 'Couldn’t approve'), setConfirmApprove(false)),
            },
          )
        }
      />
      <ReasonDialog
        open={cancelling}
        onOpenChange={setCancelling}
        title={`Cancel ${c.number}?`}
        description="No stock changes; the counts are discarded."
        confirmLabel="Cancel count"
        loading={cancel.isPending}
        onConfirm={(reason) =>
          cancel.mutate(
            { id: c.id, reason },
            {
              onSuccess: () => (toast.success(`${c.number} cancelled`), setCancelling(false)),
              onError: (e) => reportError(e, undefined, 'Couldn’t cancel'),
            },
          )
        }
      />
    </Page>
  );
}
