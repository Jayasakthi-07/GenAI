import { formatNumber, type PoAction, type PoDetail } from '@stockroom/shared';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import {
  Ban,
  Check,
  ChevronLeft,
  Download,
  FileText,
  Lock,
  PackageCheck,
  Pencil,
  Send,
  Undo2,
  Upload,
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { AiMarker } from '@/components/ai/ai-marker';
import { ReasonDialog } from '@/components/domain/reason-dialog';
import { PoStatusPill, Stat } from '@/components/domain/status';
import { Timeline } from '@/components/domain/timeline';
import { PageLoading } from '@/components/feedback/page-loading';
import { ErrorState } from '@/components/feedback/states';
import { Page } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/dialog';
import { TD, TH, THead, TR } from '@/components/ui/table';
import {
  type PoTransition,
  purchaseOrderQuery,
  usePoTransition,
  usePoWithReason,
} from '@/features/purchasing/api';
import { ReceivePoDialog } from '@/features/purchasing/receive-dialog';
import { downloadFile, openInNewTab } from '@/lib/download';
import { date, dateTime, money } from '@/lib/format';
import { reportError } from '@/lib/forms';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/_app/purchase-orders/$id')({
  staticData: { title: 'Purchase order' },
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(purchaseOrderQuery(params.id)).catch(() => undefined),
  component: PoPage,
});

function PoPage() {
  const { id } = Route.useParams();
  const query = useQuery(purchaseOrderQuery(id));
  if (query.isPending) return <PageLoading />;
  if (query.isError)
    return (
      <Page>
        <Card>
          <ErrorState
            error={query.error}
            onRetry={() => void query.refetch()}
            title="Couldn’t open this purchase order"
          />
        </Card>
      </Page>
    );
  return <PoView po={query.data} />;
}

const CONFIRM: Record<PoTransition, { title: string; body: string; label: string; done: string }> = {
  submit: {
    title: 'Submit for approval?',
    body: 'Orders under the approval limit are approved straight away.',
    label: 'Submit',
    done: 'Submitted',
  },
  approve: {
    title: 'Approve this order?',
    body: 'It can then be sent to the supplier. Its quantities count as “on order”.',
    label: 'Approve',
    done: 'Approved',
  },
  send: {
    title: 'Mark as sent?',
    body: 'Record that the order went to the supplier (email or phone). Download the PDF to attach it.',
    label: 'Mark as sent',
    done: 'Marked as sent',
  },
};

function PoView({ po }: { po: PoDetail }) {
  const transition = usePoTransition();
  const withReason = usePoWithReason();
  const [confirm, setConfirm] = useState<PoTransition | null>(null);
  const [reasonFor, setReasonFor] = useState<null | 'reject' | 'cancel' | 'close'>(null);
  const [receiving, setReceiving] = useState(false);
  const can = (a: PoAction) => po.allowedActions.includes(a);
  const ordered = po.lines.reduce((a, l) => a + l.quantityOrdered, 0);
  const received = po.lines.reduce((a, l) => a + l.quantityReceived, 0);
  const byAgent = po.createdBy.type === 'AGENT';

  const pdf = () =>
    toast.promise(downloadFile(`/purchase-orders/${po.id}/pdf`, { download: '1' }), {
      loading: 'Preparing PDF…',
      success: 'Download started',
      error: (e: Error) => e.message,
    });

  return (
    <Page className="max-w-6xl">
      <Link
        to="/purchase-orders"
        className="inline-flex items-center gap-1 text-sm text-fg-secondary hover:text-fg"
      >
        <ChevronLeft className="size-4" strokeWidth={1.75} /> Purchase orders
      </Link>
      <div className="mt-3 flex flex-col gap-4 pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-2xl font-semibold tracking-tighter sm:text-3xl">{po.number}</h2>
            <PoStatusPill status={po.status} />
            {po.overdue && <span className="text-sm font-medium text-danger">Overdue</span>}
          </div>
          <p className="mt-1.5 text-base text-fg-secondary">
            <Link to="/suppliers/$id" params={{ id: po.supplier.id }} className="text-fg hover:underline">
              {po.supplier.name}
            </Link>{' '}
            → {po.warehouse.name}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" onClick={() => openInNewTab(`/purchase-orders/${po.id}/pdf`)}>
            <FileText strokeWidth={1.75} /> PDF
          </Button>
          <Button variant="ghost" onClick={pdf} aria-label="Download PDF">
            <Download strokeWidth={1.75} />
          </Button>
          {can('cancel') && (
            <Button variant="secondary" onClick={() => setReasonFor('cancel')}>
              <Ban strokeWidth={1.75} /> Cancel
            </Button>
          )}
          {can('close') && (
            <Button variant="secondary" onClick={() => setReasonFor('close')}>
              <Lock strokeWidth={1.75} /> {po.status === 'PARTIALLY_RECEIVED' ? 'Close short' : 'Close'}
            </Button>
          )}
          {can('edit') && (
            <Button variant="secondary" asChild>
              <Link to="/purchase-orders/$id/edit" params={{ id: po.id }}>
                <Pencil strokeWidth={1.75} /> Edit
              </Link>
            </Button>
          )}
          {can('reject') && (
            <Button variant="secondary" onClick={() => setReasonFor('reject')}>
              <Undo2 strokeWidth={1.75} /> Send back
            </Button>
          )}
          {can('submit') && (
            <Button variant="primary" onClick={() => setConfirm('submit')}>
              <Upload strokeWidth={1.75} /> Submit
            </Button>
          )}
          {can('approve') && (
            <Button variant="primary" onClick={() => setConfirm('approve')}>
              <Check strokeWidth={1.75} /> Approve
            </Button>
          )}
          {can('send') && (
            <Button variant="primary" onClick={() => setConfirm('send')}>
              <Send strokeWidth={1.75} /> Mark as sent
            </Button>
          )}
          {can('receive') && (
            <Button variant="primary" onClick={() => setReceiving(true)}>
              <PackageCheck strokeWidth={1.75} /> Receive
            </Button>
          )}
        </div>
      </div>

      {byAgent && po.rationale && (
        <Card className="mb-4 border-accent/30 bg-accent-soft/40 p-4">
          <div className="flex items-center gap-2">
            <AiMarker />
            <span className="text-sm font-medium">Drafted by {po.createdBy.name}</span>
          </div>
          <p className="mt-2 text-sm text-fg-secondary">{po.rationale}</p>
        </Card>
      )}

      <Card className="mb-4 grid grid-cols-2 gap-x-6 gap-y-4 p-5 sm:grid-cols-4">
        <Stat
          label="Total"
          value={money(po.total)}
          sub={`${money(po.subtotal)} + ${money(po.taxTotal)} GST`}
        />
        <Stat label="Ordered" value={date(po.orderDate)} sub={`by ${po.createdBy.name}`} />
        <Stat
          label="Expected"
          value={date(po.expectedDate)}
          tone={po.overdue ? 'danger' : undefined}
          sub={po.overdue ? 'Overdue' : undefined}
        />
        <Stat
          label="Received"
          value={`${formatNumber(received)} / ${formatNumber(ordered)}`}
          sub={`${Math.round(po.receivedRatio * 100)}% incl. rejected`}
        />
      </Card>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="flex flex-col gap-4 xl:col-span-2">
          <Card className="overflow-hidden">
            <CardHeader className="pb-3">
              <CardTitle>
                {po.lineCount} {po.lineCount === 1 ? 'line' : 'lines'}
              </CardTitle>
            </CardHeader>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-separate border-spacing-0 text-sm">
                <THead>
                  <tr>
                    <TH className="pl-5">Product</TH>
                    <TH numeric>Ordered</TH>
                    <TH numeric>Received</TH>
                    <TH numeric>Unit cost</TH>
                    <TH numeric>GST</TH>
                    <TH numeric className="pr-5">
                      Amount
                    </TH>
                  </tr>
                </THead>
                <tbody>
                  {po.lines.map((l) => (
                    <TR key={l.id} className="[&:last-child_td]:border-b-0">
                      <TD className="pl-5">
                        <Link
                          to="/products/$id"
                          params={{ id: l.product.id }}
                          className="font-medium hover:underline"
                        >
                          {l.product.name}
                        </Link>
                        <p className="text-xs text-fg-tertiary">
                          {l.product.sku}
                          {l.supplierSku && <span className="font-mono"> · {l.supplierSku}</span>}
                        </p>
                        {l.rationale && (
                          <p className="mt-1 flex items-start gap-1.5 text-xs text-fg-secondary">
                            <AiMarker className="shrink-0" /> {l.rationale}
                          </p>
                        )}
                      </TD>
                      <TD numeric>
                        {formatNumber(l.quantityOrdered)}{' '}
                        <span className="text-xs text-fg-tertiary">{l.product.unit}</span>
                      </TD>
                      <TD numeric>
                        <span className={cn(l.remaining === 0 && 'text-success')}>
                          {formatNumber(l.quantityReceived)}
                        </span>
                        {l.quantityRejected > 0 && (
                          <span className="block text-xs text-danger">
                            {formatNumber(l.quantityRejected)} rejected
                          </span>
                        )}
                        {l.remaining > 0 && l.quantityReceived + l.quantityRejected > 0 && (
                          <span className="block text-xs text-fg-tertiary">
                            {formatNumber(l.remaining)} to come
                          </span>
                        )}
                      </TD>
                      <TD numeric>{money(l.unitCost)}</TD>
                      <TD numeric className="text-fg-secondary">
                        {Number(l.taxRate)}%
                      </TD>
                      <TD numeric className="pr-5 font-medium">
                        {money(l.lineTotal)}
                      </TD>
                    </TR>
                  ))}
                </tbody>
              </table>
            </div>
            <dl className="ml-auto grid w-full max-w-72 grid-cols-2 gap-y-1 border-t border-hairline px-5 py-4 text-sm">
              <dt className="text-fg-secondary">Subtotal</dt>
              <dd className="text-right tabular">{money(po.subtotal)}</dd>
              <dt className="text-fg-secondary">GST</dt>
              <dd className="text-right tabular">{money(po.taxTotal)}</dd>
              <dt className="border-t border-hairline pt-1.5 font-semibold">Total</dt>
              <dd className="border-t border-hairline pt-1.5 text-right tabular font-semibold">
                {money(po.total)}
              </dd>
            </dl>
          </Card>

          {po.receipts.length > 0 && (
            <Card className="overflow-hidden">
              <CardHeader className="pb-3">
                <CardTitle>Goods receipts</CardTitle>
              </CardHeader>
              <ul className="divide-y divide-hairline border-t border-hairline">
                {po.receipts.map((r) => (
                  <li key={r.id} className="px-5 py-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="text-sm font-medium">{r.number}</p>
                      <p className="text-xs text-fg-tertiary">
                        {dateTime(r.receivedAt)} · {r.receivedBy}
                      </p>
                    </div>
                    <ul className="mt-1.5 flex flex-col gap-1 text-sm text-fg-secondary">
                      {r.lines.map((l) => (
                        <li key={l.id} className="flex flex-wrap justify-between gap-2">
                          <span>
                            {l.product.name}
                            {l.batchNo && (
                              <span className="ml-1.5 font-mono text-xs text-fg-tertiary">{l.batchNo}</span>
                            )}
                            {l.expiryDate && (
                              <span className="text-xs text-fg-tertiary"> · exp. {date(l.expiryDate)}</span>
                            )}
                          </span>
                          <span className="tabular">
                            {formatNumber(l.quantityReceived)} @ {money(l.unitCost)}
                            {l.quantityRejected > 0 && (
                              <span className="text-danger">
                                {' '}
                                · {l.quantityRejected} rejected{l.rejectReason ? ` (${l.rejectReason})` : ''}
                              </span>
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                    {r.notes && <p className="mt-1 text-xs text-fg-tertiary">{r.notes}</p>}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>History</CardTitle>
            </CardHeader>
            <CardContent>
              <Timeline
                events={po.timeline.map((e) => ({
                  ...e,
                  tone: /^Cancelled/.test(e.label)
                    ? 'danger'
                    : /^Received|^Approved/.test(e.label)
                      ? 'success'
                      : /^Sent/.test(e.label)
                        ? 'accent'
                        : 'neutral',
                }))}
              />
            </CardContent>
          </Card>
          {po.notes && (
            <Card>
              <CardHeader>
                <CardTitle>Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm whitespace-pre-line text-fg-secondary">{po.notes}</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm ? CONFIRM[confirm].title : ''}
        description={confirm ? CONFIRM[confirm].body : ''}
        confirmLabel={confirm ? CONFIRM[confirm].label : ''}
        loading={transition.isPending}
        onConfirm={() =>
          confirm &&
          transition.mutate(
            { id: po.id, action: confirm },
            {
              onSuccess: (p) => {
                toast.success(`${CONFIRM[confirm].done}`, {
                  description:
                    p.status === 'APPROVED' && confirm === 'submit'
                      ? 'Below the approval limit, so it was approved automatically.'
                      : undefined,
                });
                setConfirm(null);
              },
              onError: (e) => (reportError(e, undefined, 'That didn’t work'), setConfirm(null)),
            },
          )
        }
      />
      <ReasonDialog
        open={reasonFor !== null}
        onOpenChange={(o) => !o && setReasonFor(null)}
        title={
          reasonFor === 'reject'
            ? 'Send back for changes?'
            : reasonFor === 'cancel'
              ? `Cancel ${po.number}?`
              : po.status === 'PARTIALLY_RECEIVED'
                ? 'Close short?'
                : `Close ${po.number}?`
        }
        description={
          reasonFor === 'reject'
            ? 'It returns to draft with your note so the buyer can change it.'
            : reasonFor === 'cancel'
              ? 'Nothing has been received; the order stops counting as on order.'
              : po.status === 'PARTIALLY_RECEIVED'
                ? 'The outstanding quantities are dropped; what was received stays.'
                : 'Everything has arrived. Closing archives the order.'
        }
        confirmLabel={
          reasonFor === 'reject' ? 'Send back' : reasonFor === 'cancel' ? 'Cancel order' : 'Close order'
        }
        tone={reasonFor === 'reject' ? 'primary' : 'danger'}
        optional={reasonFor === 'close'}
        loading={withReason.isPending}
        onConfirm={(reason) =>
          reasonFor &&
          withReason.mutate(
            { id: po.id, action: reasonFor, reason },
            {
              onSuccess: () => {
                toast.success(
                  reasonFor === 'reject'
                    ? 'Sent back to draft'
                    : reasonFor === 'cancel'
                      ? `${po.number} cancelled`
                      : `${po.number} closed`,
                );
                setReasonFor(null);
              },
              onError: (e) => reportError(e, undefined, 'That didn’t work'),
            },
          )
        }
      />
      <ReceivePoDialog po={po} open={receiving} onOpenChange={setReceiving} />
    </Page>
  );
}
