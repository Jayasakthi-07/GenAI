import { formatNumber, SALES_CHANNEL_LABELS, type SoDetail } from '@stockroom/shared';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { Ban, Check, ChevronLeft, Pencil, Truck } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { ReasonDialog } from '@/components/domain/reason-dialog';
import { SoStatusPill, Stat } from '@/components/domain/status';
import { PageLoading } from '@/components/feedback/page-loading';
import { ErrorState } from '@/components/feedback/states';
import { Page } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ConfirmDialog,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { TD, TH, THead, TR } from '@/components/ui/table';
import { salesOrderQuery, useCancelSo, useConfirmSo, useFulfillSo } from '@/features/sales/api';
import { date, dateTime, money } from '@/lib/format';
import { reportError } from '@/lib/forms';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/_app/sales-orders/$id')({
  staticData: { title: 'Sales order' },
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(salesOrderQuery(params.id)).catch(() => undefined),
  component: SoPage,
});

function SoPage() {
  const { id } = Route.useParams();
  const query = useQuery(salesOrderQuery(id));
  if (query.isPending) return <PageLoading />;
  if (query.isError)
    return (
      <Page>
        <Card>
          <ErrorState
            error={query.error}
            onRetry={() => void query.refetch()}
            title="Couldn’t open this sales order"
          />
        </Card>
      </Page>
    );
  return <SoView so={query.data} />;
}

function SoView({ so }: { so: SoDetail }) {
  const confirm = useConfirmSo();
  const cancel = useCancelSo();
  const [confirming, setConfirming] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [fulfilling, setFulfilling] = useState(false);
  const can = (a: SoDetail['allowedActions'][number]) => so.allowedActions.includes(a);
  const ordered = so.lines.reduce((a, l) => a + l.quantity, 0);
  const shipped = so.lines.reduce((a, l) => a + l.quantityFulfilled, 0);
  const short = so.lines.filter((l) => l.quantity - l.quantityFulfilled > l.available);

  return (
    <Page className="max-w-6xl">
      <Link
        to="/sales-orders"
        className="inline-flex items-center gap-1 text-sm text-fg-secondary hover:text-fg"
      >
        <ChevronLeft className="size-4" strokeWidth={1.75} /> Sales orders
      </Link>
      <div className="mt-3 flex flex-col gap-4 pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-2xl font-semibold tracking-tighter sm:text-3xl">{so.number}</h2>
            <SoStatusPill status={so.status} />
          </div>
          <p className="mt-1.5 text-base text-fg-secondary">
            {so.customer?.name ?? 'Walk-in customer'} · {SALES_CHANNEL_LABELS[so.channel]} · from{' '}
            {so.warehouse.name}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {can('cancel') && (
            <Button variant="secondary" onClick={() => setCancelling(true)}>
              <Ban strokeWidth={1.75} /> Cancel
            </Button>
          )}
          {can('edit') && (
            <Button variant="secondary" asChild>
              <Link to="/sales-orders/$id/edit" params={{ id: so.id }}>
                <Pencil strokeWidth={1.75} /> Edit
              </Link>
            </Button>
          )}
          {can('confirm') && (
            <Button variant="primary" onClick={() => setConfirming(true)}>
              <Check strokeWidth={1.75} /> Confirm
            </Button>
          )}
          {can('fulfill') && (
            <Button variant="primary" onClick={() => setFulfilling(true)}>
              <Truck strokeWidth={1.75} /> Ship
            </Button>
          )}
        </div>
      </div>

      <Card className="mb-4 grid grid-cols-2 gap-x-6 gap-y-4 p-5 sm:grid-cols-4">
        <Stat
          label="Total"
          value={money(so.total)}
          sub={`${money(so.taxTotal)} GST${Number(so.discountTotal) ? ` · ${money(so.discountTotal)} off` : ''}`}
        />
        <Stat label="Ordered" value={date(so.orderDate)} sub={`by ${so.createdBy.name}`} />
        <Stat
          label="Shipped"
          value={`${formatNumber(shipped)} / ${formatNumber(ordered)}`}
          sub={so.fulfilledAt ? `Completed ${dateTime(so.fulfilledAt)}` : undefined}
        />
        <Stat
          label="Stock"
          value={short.length ? `${short.length} short` : 'Available'}
          tone={short.length ? 'warning' : 'success'}
          sub={
            so.status === 'CONFIRMED' || so.status === 'PARTIALLY_FULFILLED'
              ? 'Reserved for this order'
              : 'At the shipping warehouse'
          }
        />
      </Card>

      <Card className="overflow-hidden">
        <CardHeader className="pb-3">
          <CardTitle>
            {so.lineCount} {so.lineCount === 1 ? 'line' : 'lines'}
          </CardTitle>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-separate border-spacing-0 text-sm">
            <THead>
              <tr>
                <TH className="pl-5">Product</TH>
                <TH numeric>Ordered</TH>
                <TH numeric>Shipped</TH>
                <TH numeric>Available</TH>
                <TH numeric>Price</TH>
                <TH numeric className="pr-5">
                  Amount
                </TH>
              </tr>
            </THead>
            <tbody>
              {so.lines.map((l) => {
                const open = l.quantity - l.quantityFulfilled;
                return (
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
                    <TD numeric>
                      {formatNumber(l.quantity)}{' '}
                      <span className="text-xs text-fg-tertiary">{l.product.unit}</span>
                    </TD>
                    <TD numeric className={cn(open === 0 && 'text-success')}>
                      {formatNumber(l.quantityFulfilled)}
                    </TD>
                    <TD numeric className={cn(open > 0 && l.available < open && 'text-danger')}>
                      {open > 0 ? formatNumber(l.available) : '—'}
                    </TD>
                    <TD numeric>
                      {money(l.unitPrice)}
                      {Number(l.discount) > 0 && (
                        <span className="block text-xs text-fg-tertiary">−{money(l.discount)}</span>
                      )}
                    </TD>
                    <TD numeric className="pr-5 font-medium">
                      {money(l.lineTotal)}
                    </TD>
                  </TR>
                );
              })}
            </tbody>
          </table>
        </div>
        <dl className="ml-auto grid w-full max-w-72 grid-cols-2 gap-y-1 border-t border-hairline px-5 py-4 text-sm">
          <dt className="text-fg-secondary">Subtotal</dt>
          <dd className="text-right tabular">{money(so.subtotal)}</dd>
          {Number(so.discountTotal) > 0 && (
            <>
              <dt className="text-fg-secondary">Discount</dt>
              <dd className="text-right tabular">−{money(so.discountTotal)}</dd>
            </>
          )}
          <dt className="text-fg-secondary">GST</dt>
          <dd className="text-right tabular">{money(so.taxTotal)}</dd>
          <dt className="border-t border-hairline pt-1.5 font-semibold">Total</dt>
          <dd className="border-t border-hairline pt-1.5 text-right tabular font-semibold">
            {money(so.total)}
          </dd>
        </dl>
        {so.notes && (
          <p className="border-t border-hairline px-5 py-3 text-sm text-fg-secondary">{so.notes}</p>
        )}
      </Card>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Confirm ${so.number}?`}
        description={`${formatNumber(ordered)} units are reserved at ${so.warehouse.name}, so nobody else can sell them.`}
        confirmLabel="Confirm and reserve"
        loading={confirm.isPending}
        onConfirm={() =>
          confirm.mutate(so.id, {
            onSuccess: () => (toast.success(`${so.number} confirmed`), setConfirming(false)),
            onError: (e) => (reportError(e, undefined, 'Couldn’t confirm'), setConfirming(false)),
          })
        }
      />
      <ReasonDialog
        open={cancelling}
        onOpenChange={setCancelling}
        title={`Cancel ${so.number}?`}
        description={
          so.status === 'CONFIRMED' ? 'The reserved stock is released.' : 'The draft is discarded.'
        }
        confirmLabel="Cancel order"
        loading={cancel.isPending}
        onConfirm={(reason) =>
          cancel.mutate(
            { id: so.id, reason },
            {
              onSuccess: () => (toast.success(`${so.number} cancelled`), setCancelling(false)),
              onError: (e) => reportError(e, undefined, 'Couldn’t cancel'),
            },
          )
        }
      />
      <FulfillDialog so={so} open={fulfilling} onOpenChange={setFulfilling} />
    </Page>
  );
}

function FulfillDialog({
  so,
  open,
  onOpenChange,
}: {
  so: SoDetail;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const fulfill = useFulfillSo();
  const pending = so.lines.filter((l) => l.quantity > l.quantityFulfilled);
  const [qty, setQty] = useState<Record<string, string>>({});
  const value = (id: string, fallback: number) => qty[id] ?? String(fallback);
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) setQty({});
      }}
    >
      <DialogContent>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const lines = pending.map((l) => ({
              lineId: l.id,
              quantity: Math.max(
                0,
                Math.round(Number(value(l.id, Math.min(l.quantity - l.quantityFulfilled, l.available))) || 0),
              ),
            }));
            if (!lines.some((l) => l.quantity > 0)) return toast.error('Enter at least one quantity to ship');
            fulfill.mutate(
              { id: so.id, lines },
              {
                onSuccess: (r) => {
                  toast.success(
                    r.status === 'FULFILLED' ? `${so.number} shipped in full` : `${so.number} partly shipped`,
                  );
                  onOpenChange(false);
                  setQty({});
                },
                onError: (err) => reportError(err, undefined, 'Couldn’t ship'),
              },
            );
          }}
        >
          <DialogHeader>
            <DialogTitle>Ship {so.number}</DialogTitle>
            <DialogDescription>
              Stock leaves {so.warehouse.name}, earliest-expiring batches first. Ship less to leave the rest
              open.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-2">
            {pending.map((l) => {
              const open = l.quantity - l.quantityFulfilled;
              return (
                <div key={l.id} className="grid grid-cols-[1fr_110px] items-center gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{l.product.name}</p>
                    <p className="tabular text-xs text-fg-tertiary">
                      {formatNumber(open)} to ship · {formatNumber(l.available)} available
                    </p>
                  </div>
                  <Input
                    type="number"
                    min={0}
                    max={open}
                    aria-label={`Quantity to ship of ${l.product.name}`}
                    value={value(l.id, Math.min(open, l.available))}
                    onChange={(e) => setQty((q) => ({ ...q, [l.id]: e.target.value }))}
                    className="text-right tabular"
                  />
                </div>
              );
            })}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={fulfill.isPending}>
              Ship
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
