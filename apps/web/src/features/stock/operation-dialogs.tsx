import { zodResolver } from '@hookform/resolvers/zod';
import {
  adjustInputSchema,
  formatNumber,
  issueInputSchema,
  receiveInputSchema,
  writeOffInputSchema,
} from '@stockroom/shared';
import { useQuery } from '@tanstack/react-query';
import { Minus, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Controller, useFieldArray, useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import {
  type PickedProduct,
  ProductPicker,
  ReasonSelect,
  WarehouseSelect,
} from '@/components/domain/pickers';
import { Button, IconButton } from '@/components/ui/button';
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
import { Select } from '@/components/ui/select';
import { SegmentedControl } from '@/components/ui/tabs';
import { useWarehouses } from '@/features/catalog/api';
import { useCan } from '@/lib/auth';
import { date } from '@/lib/format';
import { reportError } from '@/lib/forms';
import {
  batchesQuery,
  fefoQuery,
  useAdjustStock,
  useIssueStock,
  useReceiveStock,
  useWriteOffStock,
} from './api';

export type StockOp = 'receive' | 'issue' | 'adjust' | 'write-off';

interface OpProps {
  onDone: () => void;
  product?: PickedProduct;
  warehouseId?: string;
  batchId?: string;
}

const TITLES: Record<StockOp, { title: string; description: string }> = {
  receive: {
    title: 'Receive stock',
    description: 'Goods that arrived without a purchase order — e.g. a supplier’s top-up delivery.',
  },
  issue: {
    title: 'Issue stock',
    description: 'Stock leaving for internal use, samples or promotions. Picked first-expiry-first-out.',
  },
  adjust: {
    title: 'Adjust stock',
    description: 'Correct a balance after finding damage, a miscount or a data-entry error.',
  },
  'write-off': {
    title: 'Write off stock',
    description: 'Remove expired, damaged or rejected stock. Its cost is recorded as a loss.',
  },
};

/** One dialog host for the four manual stock operations. */
export function StockOperationDialog({
  op,
  onClose,
  product,
  warehouseId,
  batchId,
}: {
  op: StockOp | null;
  onClose: () => void;
  product?: PickedProduct;
  warehouseId?: string;
  batchId?: string;
}) {
  // Keep the last form mounted while the dialog animates out.
  const [shown, setShown] = useState<StockOp | null>(op);
  if (op && op !== shown) setShown(op);
  const t = shown ? TITLES[shown] : null;
  const props = { onDone: onClose, product, warehouseId, batchId };
  return (
    <Dialog open={op !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent size={shown === 'receive' || shown === 'issue' ? 'lg' : 'md'}>
        {t && (
          <DialogHeader>
            <DialogTitle>{t.title}</DialogTitle>
            <DialogDescription>{t.description}</DialogDescription>
          </DialogHeader>
        )}
        {shown === 'receive' && <ReceiveForm key={`r-${op}`} {...props} />}
        {shown === 'issue' && <IssueForm key={`i-${op}`} {...props} />}
        {shown === 'adjust' && <AdjustForm key={`a-${op}`} {...props} />}
        {shown === 'write-off' && <WriteOffForm key={`w-${op}`} {...props} />}
      </DialogContent>
    </Dialog>
  );
}

function useDefaultWarehouse(preset?: string) {
  const warehouses = useWarehouses();
  return preset ?? warehouses.data?.find((w) => w.isDefault)?.id ?? warehouses.data?.[0]?.id ?? '';
}

function usePicked(initial?: PickedProduct) {
  const [picked, setPicked] = useState<Record<string, PickedProduct>>(
    initial ? { [initial.id]: initial } : {},
  );
  return [picked, (p: PickedProduct) => setPicked((prev) => ({ ...prev, [p.id]: p }))] as const;
}

function success(message: string, count: number) {
  toast.success(message, {
    description: `${formatNumber(count)} ledger ${count === 1 ? 'entry' : 'entries'} recorded`,
  });
}

/* ── Receive ────────────────────────────────────────────────────────────── */

type ReceiveValues = z.input<typeof receiveInputSchema>;

function ReceiveForm({ onDone, product, warehouseId }: OpProps) {
  const defaultWarehouse = useDefaultWarehouse(warehouseId);
  const [picked, pick] = usePicked(product);
  const receive = useReceiveStock();
  const form = useForm<ReceiveValues, unknown, z.output<typeof receiveInputSchema>>({
    resolver: zodResolver(receiveInputSchema),
    defaultValues: {
      warehouseId: defaultWarehouse,
      reference: '',
      note: '',
      lines: [
        {
          productId: product?.id ?? '',
          quantity: '' as unknown as number,
          unitCost: product?.costPrice ? String(Number(product.costPrice)) : '',
          batchNo: '',
          expiryDate: '',
        },
      ],
    },
  });
  const { control, register, formState, setValue, setError } = form;
  const lines = useFieldArray({ control, name: 'lines' });
  const values = useWatch({ control, name: 'lines' });
  useEffect(() => {
    if (!form.getValues('warehouseId') && defaultWarehouse) setValue('warehouseId', defaultWarehouse);
  }, [defaultWarehouse, form, setValue]);

  const submit = form.handleSubmit((input) => {
    let missing = false;
    input.lines.forEach((l, i) => {
      if (!picked[l.productId]?.trackExpiry) return;
      if (!l.batchNo) {
        setError(`lines.${i}.batchNo`, { message: 'Required' });
        missing = true;
      }
      if (!l.expiryDate) {
        setError(`lines.${i}.expiryDate`, { message: 'Required' });
        missing = true;
      }
    });
    if (missing) return;
    receive.mutate(
      {
        ...input,
        lines: input.lines.map((l) => ({
          ...l,
          batchNo: l.batchNo || null,
          expiryDate: l.expiryDate || null,
        })),
      },
      {
        onSuccess: (r) => {
          success(
            `Received ${formatNumber(input.lines.reduce((a, l) => a + Number(l.quantity), 0))} units`,
            r.movements.length,
          );
          onDone();
        },
        onError: (e) => reportError(e, form, 'Couldn’t receive the stock'),
      },
    );
  });

  return (
    <form onSubmit={(e) => void submit(e)} noValidate className="contents">
      <DialogBody className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Warehouse" required error={formState.errors.warehouseId?.message}>
            <Controller
              control={control}
              name="warehouseId"
              render={({ field }) => <WarehouseSelect value={field.value} onChange={field.onChange} />}
            />
          </Field>
          <Field
            label="Reference"
            hint="Delivery challan or invoice number"
            error={formState.errors.reference?.message}
          >
            <Input {...register('reference')} placeholder="DC-2291" />
          </Field>
        </div>

        <div className="flex flex-col gap-3">
          {lines.fields.map((f, i) => {
            const p = picked[values[i]?.productId ?? ''];
            const err = formState.errors.lines?.[i];
            return (
              <div key={f.id} className="rounded-lg border border-hairline p-3">
                <div className="grid grid-cols-[1fr_auto] items-start gap-3">
                  <Field label="Product" required error={err?.productId?.message}>
                    <Controller
                      control={control}
                      name={`lines.${i}.productId`}
                      render={({ field }) => (
                        <ProductPicker
                          value={p ?? null}
                          exclude={values.map((v) => v.productId).filter((id) => id && id !== field.value)}
                          onChange={(np) => {
                            pick(np);
                            field.onChange(np.id);
                            if (!form.getValues(`lines.${i}.unitCost`) && np.costPrice)
                              setValue(`lines.${i}.unitCost`, String(Number(np.costPrice)));
                          }}
                        />
                      )}
                    />
                  </Field>
                  <IconButton
                    label="Remove line"
                    className="mt-6"
                    disabled={lines.fields.length === 1}
                    onClick={() => lines.remove(i)}
                  >
                    <Trash2 strokeWidth={1.75} />
                  </IconButton>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Field label="Quantity" required error={err?.quantity?.message}>
                    <Input
                      type="number"
                      min={1}
                      {...register(`lines.${i}.quantity`)}
                      className="tabular"
                      trailing={p ? <span className="text-xs">{p.unit}</span> : undefined}
                    />
                  </Field>
                  <Field label="Unit cost" required error={err?.unitCost?.message}>
                    <Input
                      {...register(`lines.${i}.unitCost`)}
                      inputMode="decimal"
                      leading={<span className="text-sm">₹</span>}
                      className="tabular"
                    />
                  </Field>
                  {p?.trackExpiry && (
                    <>
                      <Field label="Batch" required error={err?.batchNo?.message}>
                        <Input {...register(`lines.${i}.batchNo`)} className="font-mono" />
                      </Field>
                      <Field label="Expiry" required error={err?.expiryDate?.message}>
                        <Input type="date" {...register(`lines.${i}.expiryDate`)} />
                      </Field>
                    </>
                  )}
                </div>
              </div>
            );
          })}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="self-start"
            onClick={() =>
              lines.append({
                productId: '',
                quantity: '' as unknown as number,
                unitCost: '',
                batchNo: '',
                expiryDate: '',
              })
            }
          >
            <Plus strokeWidth={1.75} /> Add line
          </Button>
          {formState.errors.lines?.root?.message && (
            <p className="text-xs text-danger">{formState.errors.lines.root.message}</p>
          )}
        </div>
        <Field label="Note" error={formState.errors.note?.message}>
          <Textarea {...register('note')} rows={2} />
        </Field>
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={receive.isPending}>
          Receive stock
        </Button>
      </DialogFooter>
    </form>
  );
}

/* ── Issue ──────────────────────────────────────────────────────────────── */

type IssueValues = z.input<typeof issueInputSchema>;

function IssueForm({ onDone, product, warehouseId }: OpProps) {
  const defaultWarehouse = useDefaultWarehouse(warehouseId);
  const [picked, pick] = usePicked(product);
  const issue = useIssueStock();
  const form = useForm<IssueValues, unknown, z.output<typeof issueInputSchema>>({
    resolver: zodResolver(issueInputSchema),
    defaultValues: {
      warehouseId: defaultWarehouse,
      reasonCodeId: '',
      note: '',
      lines: [{ productId: product?.id ?? '', quantity: '' as unknown as number }],
    },
  });
  const { control, register, formState, setValue } = form;
  const lines = useFieldArray({ control, name: 'lines' });
  const values = useWatch({ control, name: 'lines' });
  const wh = useWatch({ control, name: 'warehouseId' });
  useEffect(() => {
    if (!form.getValues('warehouseId') && defaultWarehouse) setValue('warehouseId', defaultWarehouse);
  }, [defaultWarehouse, form, setValue]);

  const submit = form.handleSubmit((input) =>
    issue.mutate(input, {
      onSuccess: (r) => {
        success(
          `Issued ${formatNumber(input.lines.reduce((a, l) => a + Number(l.quantity), 0))} units`,
          r.movements.length,
        );
        onDone();
      },
      onError: (e) => reportError(e, form, 'Couldn’t issue the stock'),
    }),
  );

  return (
    <form onSubmit={(e) => void submit(e)} noValidate className="contents">
      <DialogBody className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="From warehouse" required error={formState.errors.warehouseId?.message}>
            <Controller
              control={control}
              name="warehouseId"
              render={({ field }) => <WarehouseSelect value={field.value} onChange={field.onChange} />}
            />
          </Field>
          <Field label="Reason" required error={formState.errors.reasonCodeId?.message}>
            <Controller
              control={control}
              name="reasonCodeId"
              render={({ field }) => (
                <ReasonSelect type="ISSUE" direction="OUT" value={field.value} onChange={field.onChange} />
              )}
            />
          </Field>
        </div>
        <div className="flex flex-col gap-2">
          {lines.fields.map((f, i) => {
            const pid = values[i]?.productId ?? '';
            const p = picked[pid];
            const err = formState.errors.lines?.[i];
            return (
              <div key={f.id} className="grid grid-cols-[1fr_110px_auto] items-start gap-3">
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
                        warehouseId={wh || undefined}
                        exclude={values.map((v) => v.productId).filter((id) => id && id !== field.value)}
                        onChange={(np) => (pick(np), field.onChange(np.id))}
                      />
                    )}
                  />
                </Field>
                <Field
                  label={i === 0 ? 'Quantity' : ''}
                  error={err?.quantity?.message}
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
                {p?.trackExpiry && wh && Number(values[i]?.quantity) > 0 && (
                  <FefoHint productId={p.id} warehouseId={wh} quantity={Number(values[i]?.quantity)} />
                )}
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
            <Plus strokeWidth={1.75} /> Add line
          </Button>
        </div>
        <Field label="Note" error={formState.errors.note?.message}>
          <Textarea {...register('note')} rows={2} placeholder="Who took it and why" />
        </Field>
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={issue.isPending}>
          Issue stock
        </Button>
      </DialogFooter>
    </form>
  );
}

/** Shows which batches a pick would take, before it happens. */
function FefoHint({
  productId,
  warehouseId,
  quantity,
}: {
  productId: string;
  warehouseId: string;
  quantity: number;
}) {
  const plan = useQuery(fefoQuery(productId, warehouseId, quantity));
  if (!plan.data) return null;
  return (
    <p className="col-span-3 -mt-1 text-xs text-fg-secondary">
      {plan.data.allocations.length ? 'Takes ' : ''}
      {plan.data.allocations
        .map((a) => `${formatNumber(a.take)} from ${a.batchNo} (exp. ${date(a.expiryDate)})`)
        .join(', ')}
      {plan.data.shortfall > 0 && (
        <span className="text-danger"> — {formatNumber(plan.data.shortfall)} short</span>
      )}
    </p>
  );
}

/* ── Adjust ─────────────────────────────────────────────────────────────── */

type AdjustValues = z.input<typeof adjustInputSchema>;

function AdjustForm({ onDone, product, warehouseId }: OpProps) {
  const defaultWarehouse = useDefaultWarehouse(warehouseId);
  const [picked, pick] = usePicked(product);
  const can = useCan();
  const adjust = useAdjustStock();
  const [direction, setDirection] = useState<'IN' | 'OUT'>('OUT');
  const [amount, setAmount] = useState('');
  const form = useForm<AdjustValues, unknown, z.output<typeof adjustInputSchema>>({
    resolver: zodResolver(adjustInputSchema),
    defaultValues: {
      warehouseId: defaultWarehouse,
      productId: product?.id ?? '',
      quantity: 0,
      reasonCodeId: '',
      batchNo: '',
      expiryDate: '',
      note: '',
    },
  });
  const { control, register, formState, setValue } = form;
  const productId = useWatch({ control, name: 'productId' });
  const wh = useWatch({ control, name: 'warehouseId' });
  const p = picked[productId];
  useEffect(() => {
    if (!form.getValues('warehouseId') && defaultWarehouse) setValue('warehouseId', defaultWarehouse);
  }, [defaultWarehouse, form, setValue]);
  useEffect(() => {
    const n = Number(amount);
    setValue('quantity', Number.isFinite(n) && n > 0 ? (direction === 'IN' ? n : -n) : 0);
  }, [amount, direction, setValue]);

  const submit = form.handleSubmit((input) =>
    adjust.mutate(
      { ...input, batchNo: input.batchNo || null, expiryDate: input.expiryDate || null },
      {
        onSuccess: (r) => {
          success(
            `Adjusted by ${input.quantity > 0 ? '+' : ''}${formatNumber(Number(input.quantity))}`,
            r.movements.length,
          );
          onDone();
        },
        onError: (e) => reportError(e, form, 'Couldn’t adjust the stock'),
      },
    ),
  );

  return (
    <form onSubmit={(e) => void submit(e)} noValidate className="contents">
      <DialogBody className="flex flex-col gap-4">
        <Field label="Warehouse" required error={formState.errors.warehouseId?.message}>
          <Controller
            control={control}
            name="warehouseId"
            render={({ field }) => <WarehouseSelect value={field.value} onChange={field.onChange} />}
          />
        </Field>
        <Field label="Product" required error={formState.errors.productId?.message}>
          <Controller
            control={control}
            name="productId"
            render={({ field }) => (
              <ProductPicker
                value={p ?? null}
                warehouseId={direction === 'OUT' ? wh || undefined : undefined}
                onChange={(np) => (pick(np), field.onChange(np.id))}
              />
            )}
          />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[auto_1fr]">
          <Field label="Change">
            <SegmentedControl
              aria-label="Direction"
              value={direction}
              onValueChange={setDirection}
              options={[
                { value: 'OUT', label: 'Remove', icon: <Minus strokeWidth={2} /> },
                { value: 'IN', label: 'Add', icon: <Plus strokeWidth={2} /> },
              ]}
              className="h-9"
            />
          </Field>
          <Field
            label="Quantity"
            required
            error={formState.errors.quantity?.message}
            hint={!can('stock.adjust.large') ? 'Larger changes need a manager.' : undefined}
          >
            <Input
              type="number"
              min={1}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="tabular"
              trailing={p ? <span className="text-xs">{p.unit}</span> : undefined}
            />
          </Field>
        </div>
        <Field label="Reason" required error={formState.errors.reasonCodeId?.message}>
          <Controller
            control={control}
            name="reasonCodeId"
            render={({ field }) => (
              <ReasonSelect
                type="ADJUSTMENT"
                direction={direction}
                value={field.value}
                onChange={field.onChange}
              />
            )}
          />
        </Field>
        {p?.trackExpiry && direction === 'IN' && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Batch" required error={formState.errors.batchNo?.message}>
              <Input {...register('batchNo')} className="font-mono" />
            </Field>
            <Field label="Expiry" required error={formState.errors.expiryDate?.message}>
              <Input type="date" {...register('expiryDate')} />
            </Field>
          </div>
        )}
        <Field label="Note" error={formState.errors.note?.message}>
          <Textarea {...register('note')} rows={2} placeholder="What happened" />
        </Field>
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={adjust.isPending}>
          Record adjustment
        </Button>
      </DialogFooter>
    </form>
  );
}

/* ── Write-off ──────────────────────────────────────────────────────────── */

type WriteOffValues = z.input<typeof writeOffInputSchema>;

function WriteOffForm({ onDone, product, warehouseId, batchId }: OpProps) {
  const defaultWarehouse = useDefaultWarehouse(warehouseId);
  const [picked, pick] = usePicked(product);
  const writeOff = useWriteOffStock();
  const form = useForm<WriteOffValues, unknown, z.output<typeof writeOffInputSchema>>({
    resolver: zodResolver(writeOffInputSchema),
    defaultValues: {
      warehouseId: defaultWarehouse,
      productId: product?.id ?? '',
      quantity: '' as unknown as number,
      reasonCodeId: '',
      batchId: batchId ?? null,
      note: '',
    },
  });
  const { control, register, formState, setValue } = form;
  const productId = useWatch({ control, name: 'productId' });
  const wh = useWatch({ control, name: 'warehouseId' });
  const p = picked[productId];
  useEffect(() => {
    if (!form.getValues('warehouseId') && defaultWarehouse) setValue('warehouseId', defaultWarehouse);
  }, [defaultWarehouse, form, setValue]);
  const batches = useQuery({
    ...batchesQuery({ productId, warehouseId: wh, pageSize: 100, sort: 'expiryDate:asc' }),
    enabled: Boolean(p?.trackExpiry && wh),
  });

  const submit = form.handleSubmit((input) =>
    writeOff.mutate(input, {
      onSuccess: (r) => {
        success(`Wrote off ${formatNumber(Number(input.quantity))} units`, r.movements.length);
        onDone();
      },
      onError: (e) => reportError(e, form, 'Couldn’t write off the stock'),
    }),
  );

  return (
    <form onSubmit={(e) => void submit(e)} noValidate className="contents">
      <DialogBody className="flex flex-col gap-4">
        <Field label="Warehouse" required error={formState.errors.warehouseId?.message}>
          <Controller
            control={control}
            name="warehouseId"
            render={({ field }) => <WarehouseSelect value={field.value} onChange={field.onChange} />}
          />
        </Field>
        <Field label="Product" required error={formState.errors.productId?.message}>
          <Controller
            control={control}
            name="productId"
            render={({ field }) => (
              <ProductPicker
                value={p ?? null}
                warehouseId={wh || undefined}
                onChange={(np) => (pick(np), setValue('batchId', null), field.onChange(np.id))}
              />
            )}
          />
        </Field>
        {p?.trackExpiry && (
          <Field
            label="Batch"
            hint="Leave on “Earliest expiry first” to take the oldest stock, expired batches included."
          >
            <Controller
              control={control}
              name="batchId"
              render={({ field }) => (
                <Select
                  value={field.value ?? 'auto'}
                  onValueChange={(v) => field.onChange(v === 'auto' ? null : v)}
                  options={[
                    { value: 'auto', label: 'Earliest expiry first' },
                    ...(batches.data?.data ?? []).map((b) => ({
                      value: b.id,
                      label: `${b.batchNo} · ${formatNumber(b.quantity)} left`,
                      description: b.expiryDate
                        ? `${b.status === 'EXPIRED' ? 'Expired' : 'Expires'} ${date(b.expiryDate)}`
                        : undefined,
                    })),
                  ]}
                />
              )}
            />
          </Field>
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Quantity" required error={formState.errors.quantity?.message}>
            <Input
              type="number"
              min={1}
              {...register('quantity')}
              className="tabular"
              trailing={p ? <span className="text-xs">{p.unit}</span> : undefined}
            />
          </Field>
          <Field label="Reason" required error={formState.errors.reasonCodeId?.message}>
            <Controller
              control={control}
              name="reasonCodeId"
              render={({ field }) => (
                <ReasonSelect
                  type="WRITE_OFF"
                  direction="OUT"
                  value={field.value}
                  onChange={field.onChange}
                />
              )}
            />
          </Field>
        </div>
        <Field label="Note" error={formState.errors.note?.message}>
          <Textarea {...register('note')} rows={2} />
        </Field>
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" variant="danger" loading={writeOff.isPending}>
          Write off
        </Button>
      </DialogFooter>
    </form>
  );
}
