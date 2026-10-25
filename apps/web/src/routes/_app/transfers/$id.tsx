import { formatNumber } from '@stockroom/shared';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { ArrowRight, ChevronLeft, PackageCheck, Truck, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { ReasonDialog } from '@/components/domain/reason-dialog';
import { type TimelineEvent, Timeline } from '@/components/domain/timeline';
import { TransferStatusPill } from '@/components/domain/status';
import { PageLoading } from '@/components/feedback/page-loading';
import { ErrorState } from '@/components/feedback/states';
import { Page } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/dialog';
import { TD, TH, THead, TR } from '@/components/ui/table';
import {
  transferQuery,
  useCancelTransfer,
  useReceiveTransfer,
  useShipTransfer,
} from '@/features/operations/api';
import { useCan } from '@/lib/auth';
import { reportError } from '@/lib/forms';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/_app/transfers/$id')({
  staticData: { title: 'Transfer' },
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(transferQuery(params.id)).catch(() => undefined),
  component: TransferPage,
});

function TransferPage() {
  const { id } = Route.useParams();
  const query = useQuery(transferQuery(id));
  const can = useCan();
  const ship = useShipTransfer();
  const receive = useReceiveTransfer();
  const cancel = useCancelTransfer();
  const [confirm, setConfirm] = useState<null | 'ship' | 'receive'>(null);
  const [cancelling, setCancelling] = useState(false);

  if (query.isPending) return <PageLoading />;
  if (query.isError)
    return (
      <Page>
        <Card>
          <ErrorState
            error={query.error}
            onRetry={() => void query.refetch()}
            title="Couldn’t open this transfer"
          />
        </Card>
      </Page>
    );
  const t = query.data;
  const canOperate = can('stock.operate');
  const events: TimelineEvent[] = [
    { at: t.createdAt, label: 'Created', by: t.createdBy.name },
    ...(t.shippedAt
      ? [{ at: t.shippedAt, label: `Shipped from ${t.from.name}`, tone: 'accent' as const }]
      : []),
    ...(t.receivedAt
      ? [{ at: t.receivedAt, label: `Received at ${t.to.name}`, tone: 'success' as const }]
      : []),
    ...(t.cancelledAt
      ? [
          {
            at: t.cancelledAt,
            label: t.shippedAt ? 'Cancelled — stock returned to source' : 'Cancelled',
            tone: 'danger' as const,
          },
        ]
      : []),
  ];

  const run = (action: 'ship' | 'receive') => {
    const m = action === 'ship' ? ship : receive;
    m.mutate(t.id, {
      onSuccess: () => {
        toast.success(action === 'ship' ? `${t.number} shipped` : `${t.number} received at ${t.to.name}`);
        setConfirm(null);
      },
      onError: (e) => (
        reportError(e, undefined, action === 'ship' ? 'Couldn’t ship' : 'Couldn’t receive'),
        setConfirm(null)
      ),
    });
  };

  return (
    <Page className="max-w-5xl">
      <Link
        to="/transfers"
        className="inline-flex items-center gap-1 text-sm text-fg-secondary hover:text-fg"
      >
        <ChevronLeft className="size-4" strokeWidth={1.75} /> Transfers
      </Link>
      <div className="mt-3 flex flex-col gap-4 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-semibold tracking-tighter sm:text-3xl">{t.number}</h2>
            <TransferStatusPill status={t.status} />
          </div>
          <p className="mt-1.5 flex items-center gap-1.5 text-base text-fg-secondary">
            {t.from.name} <ArrowRight className="size-4" strokeWidth={1.75} /> {t.to.name}
          </p>
          {t.reason && <p className="mt-1 text-sm text-fg-tertiary">{t.reason}</p>}
        </div>
        {canOperate && (
          <div className="flex flex-wrap gap-2">
            {(t.status === 'DRAFT' || t.status === 'IN_TRANSIT') && (
              <Button variant="secondary" onClick={() => setCancelling(true)}>
                <X strokeWidth={1.75} /> Cancel
              </Button>
            )}
            {t.status === 'DRAFT' && (
              <Button variant="primary" onClick={() => setConfirm('ship')}>
                <Truck strokeWidth={1.75} /> Ship
              </Button>
            )}
            {t.status === 'IN_TRANSIT' && (
              <Button variant="primary" onClick={() => setConfirm('receive')}>
                <PackageCheck strokeWidth={1.75} /> Receive
              </Button>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="overflow-hidden lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle>
              {formatNumber(t.totalUnits)} units · {t.lineCount} {t.lineCount === 1 ? 'product' : 'products'}
            </CardTitle>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full border-separate border-spacing-0 text-sm">
              <THead>
                <tr>
                  <TH className="pl-5">Product</TH>
                  <TH numeric>Quantity</TH>
                  {t.status === 'DRAFT' && (
                    <TH numeric className="pr-5">
                      Available at {t.from.code}
                    </TH>
                  )}
                </tr>
              </THead>
              <tbody>
                {t.lines.map((l) => (
                  <TR key={l.id} className="[&:last-child_td]:border-b-0">
                    <TD className="pl-5">
                      <Link
                        to="/products/$id"
                        params={{ id: l.product.id }}
                        className="font-medium hover:underline"
                      >
                        {l.product.name}
                      </Link>
                      <p className="text-xs text-fg-tertiary">{l.product.sku}</p>
                    </TD>
                    <TD numeric className={t.status === 'DRAFT' ? '' : 'pr-5'}>
                      {formatNumber(l.quantity)}{' '}
                      <span className="text-xs text-fg-tertiary">{l.product.unit}</span>
                    </TD>
                    {t.status === 'DRAFT' && (
                      <TD numeric className={cn('pr-5', l.availableAtSource < l.quantity && 'text-danger')}>
                        {formatNumber(l.availableAtSource)}
                      </TD>
                    )}
                  </TR>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>History</CardTitle>
          </CardHeader>
          <CardContent>
            <Timeline events={events} />
          </CardContent>
        </Card>
      </div>

      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm === 'ship' ? `Ship ${t.number}?` : `Receive ${t.number}?`}
        description={
          confirm === 'ship'
            ? `${formatNumber(t.totalUnits)} units leave ${t.from.name} now, earliest-expiring batches first.`
            : `${formatNumber(t.totalUnits)} units are added to ${t.to.name} with their batches and costs.`
        }
        confirmLabel={confirm === 'ship' ? 'Ship now' : 'Receive'}
        loading={ship.isPending || receive.isPending}
        onConfirm={() => confirm && run(confirm)}
      />
      <ReasonDialog
        open={cancelling}
        onOpenChange={setCancelling}
        title={`Cancel ${t.number}?`}
        description={
          t.status === 'IN_TRANSIT'
            ? `The ${formatNumber(t.totalUnits)} units in transit go back to ${t.from.name}.`
            : 'Nothing has moved yet.'
        }
        confirmLabel="Cancel transfer"
        loading={cancel.isPending}
        onConfirm={(reason) =>
          cancel.mutate(
            { id: t.id, reason },
            {
              onSuccess: () => (toast.success(`${t.number} cancelled`), setCancelling(false)),
              onError: (e) => reportError(e, undefined, 'Couldn’t cancel'),
            },
          )
        }
      />
    </Page>
  );
}
