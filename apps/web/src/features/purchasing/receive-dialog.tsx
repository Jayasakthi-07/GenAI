import { formatNumber, type PoDetail } from '@stockroom/shared';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { reportError } from '@/lib/forms';
import { useReceivePo } from './api';

interface LineState {
  received: string;
  rejected: string;
  rejectReason: string;
  unitCost: string;
  batchNo: string;
  expiryDate: string;
}

/** Goods receipt against a PO: what arrived, what was rejected, at the invoiced cost, into batches for tracked products. */
export function ReceivePoDialog({
  po,
  open,
  onOpenChange,
}: {
  po: PoDetail;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Receive {po.number}</DialogTitle>
          <DialogDescription>
            From {po.supplier.name} into {po.warehouse.name}. Enter what actually arrived; the rest stays
            open.
          </DialogDescription>
        </DialogHeader>
        {open && <ReceiveForm po={po} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function ReceiveForm({ po, onDone }: { po: PoDetail; onDone: () => void }) {
  const receive = useReceivePo(po.id);
  const open = po.lines.filter((l) => l.remaining > 0);
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<Record<string, LineState>>(() =>
    Object.fromEntries(
      open.map((l) => [
        l.id,
        {
          received: String(l.remaining),
          rejected: '0',
          rejectReason: '',
          unitCost: String(Number(l.unitCost)),
          batchNo: '',
          expiryDate: '',
        },
      ]),
    ),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (id: string, patch: Partial<LineState>) =>
    setLines((s) => ({ ...s, [id]: { ...s[id]!, ...patch } }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    const payload = open.flatMap((l) => {
      const s = lines[l.id]!;
      const received = Math.max(0, Math.round(Number(s.received) || 0));
      const rejected = Math.max(0, Math.round(Number(s.rejected) || 0));
      if (received + rejected === 0) return [];
      if (received + rejected > l.remaining) next[`${l.id}.received`] = `Only ${l.remaining} outstanding`;
      if (rejected > 0 && !s.rejectReason.trim()) next[`${l.id}.rejectReason`] = 'Say why';
      if (l.product.trackExpiry && received > 0) {
        if (!s.batchNo.trim()) next[`${l.id}.batchNo`] = 'Required';
        if (!s.expiryDate) next[`${l.id}.expiryDate`] = 'Required';
      }
      return [
        {
          purchaseOrderLineId: l.id,
          quantityReceived: received,
          quantityRejected: rejected,
          rejectReason: s.rejectReason.trim() || null,
          unitCost: s.unitCost || null,
          batchNo: s.batchNo.trim() || null,
          expiryDate: s.expiryDate || null,
        },
      ];
    });
    setErrors(next);
    if (Object.keys(next).length) return;
    if (!payload.length) return toast.error('Enter at least one received quantity');
    receive.mutate(
      { notes: notes || null, lines: payload },
      {
        onSuccess: (r) => {
          const grn = r.receipts.at(-1);
          toast.success(`Received into ${po.warehouse.name}`, {
            description: `${grn?.number ?? 'Goods receipt'} · ${r.status === 'RECEIVED' ? 'order complete' : 'more to come'}`,
          });
          onDone();
        },
        onError: (err) => reportError(err, undefined, 'Couldn’t record the receipt'),
      },
    );
  };

  return (
    <form onSubmit={submit} noValidate className="contents">
      <DialogBody className="flex flex-col gap-3">
        {open.map((l) => {
          const s = lines[l.id]!;
          return (
            <div key={l.id} className="rounded-lg border border-hairline p-3">
              <div className="flex items-baseline justify-between gap-3">
                <p className="min-w-0 truncate text-sm font-medium">{l.product.name}</p>
                <p className="shrink-0 tabular text-xs text-fg-secondary">
                  {formatNumber(l.remaining)} of {formatNumber(l.quantityOrdered)} {l.product.unit}{' '}
                  outstanding
                </p>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Field label="Received" error={errors[`${l.id}.received`]}>
                  <Input
                    type="number"
                    min={0}
                    value={s.received}
                    onChange={(e) => set(l.id, { received: e.target.value })}
                    className="tabular"
                  />
                </Field>
                <Field label="Rejected">
                  <Input
                    type="number"
                    min={0}
                    value={s.rejected}
                    onChange={(e) => set(l.id, { rejected: e.target.value })}
                    className="tabular"
                  />
                </Field>
                <Field label="Invoiced cost" hint={`Ordered at ₹${Number(l.unitCost)}`}>
                  <Input
                    value={s.unitCost}
                    onChange={(e) => set(l.id, { unitCost: e.target.value })}
                    inputMode="decimal"
                    leading={<span className="text-sm">₹</span>}
                    className="tabular"
                  />
                </Field>
                {Number(s.rejected) > 0 && (
                  <Field label="Why rejected" error={errors[`${l.id}.rejectReason`]}>
                    <Input
                      value={s.rejectReason}
                      onChange={(e) => set(l.id, { rejectReason: e.target.value })}
                      placeholder="Damaged cartons"
                    />
                  </Field>
                )}
                {l.product.trackExpiry && (
                  <>
                    <Field label="Batch" error={errors[`${l.id}.batchNo`]}>
                      <Input
                        value={s.batchNo}
                        onChange={(e) => set(l.id, { batchNo: e.target.value })}
                        className="font-mono"
                      />
                    </Field>
                    <Field label="Expiry" error={errors[`${l.id}.expiryDate`]}>
                      <Input
                        type="date"
                        value={s.expiryDate}
                        onChange={(e) => set(l.id, { expiryDate: e.target.value })}
                      />
                    </Field>
                  </>
                )}
              </div>
            </div>
          );
        })}
        <Field label="Notes">
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Invoice number, vehicle, anything unusual"
          />
        </Field>
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={receive.isPending}>
          Record receipt
        </Button>
      </DialogFooter>
    </form>
  );
}
