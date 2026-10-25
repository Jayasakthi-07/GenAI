import { zodResolver } from '@hookform/resolvers/zod';
import { transferInputSchema } from '@stockroom/shared';
import { useNavigate } from '@tanstack/react-router';
import { ArrowRight, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Controller, useFieldArray, useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import { type PickedProduct, ProductPicker, WarehouseSelect } from '@/components/domain/pickers';
import { Button, IconButton } from '@/components/ui/button';
import { Switch } from '@/components/ui/checkbox';
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
import { Input } from '@/components/ui/input';
import { reportError } from '@/lib/forms';
import { useCreateTransfer } from './api';

type Values = z.input<typeof transferInputSchema>;

export function NewTransferDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>New transfer</DialogTitle>
          <DialogDescription>
            Move stock between warehouses. Shipping takes it out of the source; receiving adds it at the
            destination.
          </DialogDescription>
        </DialogHeader>
        {open && <TransferForm onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function TransferForm({ onDone }: { onDone: () => void }) {
  const navigate = useNavigate();
  const create = useCreateTransfer();
  const [picked, setPicked] = useState<Record<string, PickedProduct>>({});
  const form = useForm<Values, unknown, z.output<typeof transferInputSchema>>({
    resolver: zodResolver(transferInputSchema),
    defaultValues: {
      fromWarehouseId: '',
      toWarehouseId: '',
      reason: '',
      lines: [{ productId: '', quantity: '' as unknown as number }],
      ship: true,
    },
  });
  const { control, register, formState } = form;
  const lines = useFieldArray({ control, name: 'lines' });
  const values = useWatch({ control, name: 'lines' });
  const [from, to, ship] = useWatch({ control, name: ['fromWarehouseId', 'toWarehouseId', 'ship'] });

  const submit = form.handleSubmit((input) =>
    create.mutate(input, {
      onSuccess: (t) => {
        toast.success(`${t.number} ${t.status === 'IN_TRANSIT' ? 'shipped' : 'saved as a draft'}`);
        onDone();
        void navigate({ to: '/transfers/$id', params: { id: t.id } });
      },
      onError: (e) => reportError(e, form, 'Couldn’t create the transfer'),
    }),
  );

  return (
    <form onSubmit={(e) => void submit(e)} noValidate className="contents">
      <DialogBody className="flex flex-col gap-4">
        <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-[1fr_auto_1fr]">
          <Field label="From" required error={formState.errors.fromWarehouseId?.message}>
            <Controller
              control={control}
              name="fromWarehouseId"
              render={({ field }) => (
                <WarehouseSelect value={field.value} onChange={field.onChange} exclude={to} />
              )}
            />
          </Field>
          <ArrowRight className="mt-8 hidden size-4 text-fg-tertiary sm:block" strokeWidth={1.75} />
          <Field label="To" required error={formState.errors.toWarehouseId?.message}>
            <Controller
              control={control}
              name="toWarehouseId"
              render={({ field }) => (
                <WarehouseSelect value={field.value} onChange={field.onChange} exclude={from} />
              )}
            />
          </Field>
        </div>
        <div className="flex flex-col gap-2">
          {lines.fields.map((f, i) => {
            const pid = values[i]?.productId ?? '';
            const p = picked[pid];
            const err = formState.errors.lines?.[i];
            const over = p?.available !== undefined && Number(values[i]?.quantity) > p.available;
            return (
              <div key={f.id} className="grid grid-cols-[1fr_120px_auto] items-start gap-3">
                <Field
                  label={i === 0 ? 'Product' : ''}
                  error={err?.productId?.message}
                  className={i === 0 ? '' : '[&>div:first-child]:hidden'}
                >
                  <Controller
                    control={control}
                    name={`lines.${i}.productId`}
                    render={({ field }) => (
                      <ProductPicker
                        value={p ?? null}
                        warehouseId={from || undefined}
                        placeholder={from ? 'Choose a product…' : 'Choose the source warehouse first'}
                        exclude={values.map((v) => v.productId).filter((id) => id && id !== field.value)}
                        onChange={(np) => (
                          setPicked((prev) => ({ ...prev, [np.id]: np })),
                          field.onChange(np.id)
                        )}
                      />
                    )}
                  />
                </Field>
                <Field
                  label={i === 0 ? 'Quantity' : ''}
                  error={err?.quantity?.message ?? (over ? `Only ${p?.available} available` : undefined)}
                  className={i === 0 ? '' : '[&>div:first-child]:hidden'}
                >
                  <Input type="number" min={1} {...register(`lines.${i}.quantity`)} className="tabular" />
                </Field>
                <IconButton
                  label="Remove line"
                  className={i === 0 ? 'mt-6' : ''}
                  disabled={lines.fields.length === 1}
                  onClick={() => lines.remove(i)}
                >
                  <Trash2 strokeWidth={1.75} />
                </IconButton>
              </div>
            );
          })}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="self-start"
            onClick={() => lines.append({ productId: '', quantity: '' as unknown as number })}
          >
            <Plus strokeWidth={1.75} /> Add product
          </Button>
          {formState.errors.lines?.root?.message && (
            <p className="text-xs text-danger">{formState.errors.lines.root.message}</p>
          )}
        </div>
        <Field label="Reason" error={formState.errors.reason?.message}>
          <Input {...register('reason')} placeholder="e.g. Rebalance ahead of Diwali" />
        </Field>
        <label className="flex items-center justify-between gap-4 text-sm">
          <span>
            <span className="font-medium">Ship now</span>
            <span className="block text-fg-secondary">
              Take the stock out of the source warehouse immediately.
            </span>
          </span>
          <Controller
            control={control}
            name="ship"
            render={({ field }) => <Switch checked={Boolean(field.value)} onCheckedChange={field.onChange} />}
          />
        </label>
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={create.isPending}>
          {ship ? 'Create and ship' : 'Save draft'}
        </Button>
      </DialogFooter>
    </form>
  );
}
