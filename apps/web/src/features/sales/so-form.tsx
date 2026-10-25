import { zodResolver } from '@hookform/resolvers/zod';
import { SALES_CHANNEL_LABELS, SALES_CHANNELS, type SoDetail, soInputSchema } from '@stockroom/shared';
import { useQuery } from '@tanstack/react-query';
import Decimal from 'decimal.js';
import { Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Controller, useFieldArray, useForm, useWatch } from 'react-hook-form';
import type { z } from 'zod';
import { type PickedProduct, ProductPicker, WarehouseSelect } from '@/components/domain/pickers';
import { IconButton, Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { useWarehouses } from '@/features/catalog/api';
import { money } from '@/lib/format';
import { cn } from '@/lib/utils';
import { allCustomersQuery } from './api';

export type SoFormValues = z.input<typeof soInputSchema>;
export type SoFormOutput = z.output<typeof soInputSchema>;

const blankLine = { productId: '', quantity: '' as unknown as number, unitPrice: '', discount: '' };

export function useSoForm(so?: SoDetail) {
  return useForm<SoFormValues, unknown, SoFormOutput>({
    resolver: zodResolver(soInputSchema),
    defaultValues: so
      ? {
          customerId: so.customer?.id ?? '',
          warehouseId: so.warehouse.id,
          channel: so.channel,
          notes: so.notes ?? '',
          lines: so.lines.map((l) => ({
            productId: l.product.id,
            quantity: l.quantity,
            unitPrice: String(Number(l.unitPrice)),
            discount: Number(l.discount) ? String(Number(l.discount)) : '',
          })),
          confirm: false,
        }
      : {
          customerId: '',
          warehouseId: '',
          channel: 'WHOLESALE',
          notes: '',
          lines: [blankLine],
          confirm: false,
        },
  });
}

/** Customer, warehouse, channel and lines; prices default to the selling price and availability is shown per line. */
export function SoFields({ form, so }: { form: ReturnType<typeof useSoForm>; so?: SoDetail }) {
  const { control, register, formState, setValue, getValues } = form;
  const e = formState.errors;
  const customers = useQuery(allCustomersQuery);
  const warehouses = useWarehouses();
  const lines = useFieldArray({ control, name: 'lines' });
  const values = useWatch({ control, name: 'lines' });
  const warehouseId = useWatch({ control, name: 'warehouseId' });
  const [picked, setPicked] = useState<Record<string, PickedProduct>>(() =>
    Object.fromEntries(
      (so?.lines ?? []).map((l) => [
        l.product.id,
        { ...l.product, available: l.available, taxRate: l.taxRate, sellingPrice: l.unitPrice },
      ]),
    ),
  );

  useEffect(() => {
    if (!getValues('warehouseId')) {
      const def = warehouses.data?.find((w) => w.isDefault) ?? warehouses.data?.[0];
      if (def) setValue('warehouseId', def.id);
    }
  }, [warehouses.data, getValues, setValue]);

  let gross = new Decimal(0);
  let discount = new Decimal(0);
  let tax = new Decimal(0);
  for (const l of values) {
    const q = Number(l.quantity);
    const price = Number(l.unitPrice || picked[l.productId]?.sellingPrice || 0);
    if (!Number.isFinite(q) || q <= 0 || !Number.isFinite(price)) continue;
    const lg = new Decimal(price).mul(q).toDecimalPlaces(2);
    const d = Decimal.min(new Decimal(Number(l.discount) || 0), lg);
    gross = gross.plus(lg);
    discount = discount.plus(d);
    tax = tax.plus(
      lg
        .minus(d)
        .mul(Number(picked[l.productId]?.taxRate ?? 0))
        .div(100)
        .toDecimalPlaces(2),
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="grid grid-cols-1 gap-4 pt-5 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Customer" required error={e.customerId?.message} className="lg:col-span-2">
            <Controller
              control={control}
              name="customerId"
              render={({ field }) => (
                <Select
                  value={field.value}
                  onValueChange={field.onChange}
                  placeholder="Choose a customer"
                  options={(customers.data?.data ?? [])
                    .filter((c) => c.isActive || c.id === field.value)
                    .map((c) => ({ value: c.id, label: c.name, description: c.city ?? undefined }))}
                />
              )}
            />
          </Field>
          <Field label="Ship from" required error={e.warehouseId?.message}>
            <Controller
              control={control}
              name="warehouseId"
              render={({ field }) => <WarehouseSelect value={field.value} onChange={field.onChange} />}
            />
          </Field>
          <Field label="Channel" required error={e.channel?.message}>
            <Controller
              control={control}
              name="channel"
              render={({ field }) => (
                <Select
                  value={field.value}
                  onValueChange={field.onChange}
                  options={SALES_CHANNELS.map((c) => ({ value: c, label: SALES_CHANNEL_LABELS[c] }))}
                />
              )}
            />
          </Field>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader className="pb-3">
          <CardTitle>Lines</CardTitle>
        </CardHeader>
        <div className="flex flex-col divide-y divide-hairline border-t border-hairline">
          {lines.fields.map((f, i) => {
            const v = values[i];
            const p = picked[v?.productId ?? ''];
            const qty = Number(v?.quantity);
            const err = e.lines?.[i];
            const short = p?.available !== undefined && qty > p.available;
            const price = Number(v?.unitPrice || p?.sellingPrice || 0);
            const amount = qty > 0 ? new Decimal(price).mul(qty).minus(Number(v?.discount) || 0) : null;
            return (
              <div
                key={f.id}
                className="grid grid-cols-2 items-start gap-3 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_96px_120px_110px_110px_auto]"
              >
                <Field
                  label="Product"
                  required
                  error={err?.productId?.message}
                  className="col-span-2 sm:col-span-1"
                >
                  <Controller
                    control={control}
                    name={`lines.${i}.productId`}
                    render={({ field }) => (
                      <ProductPicker
                        value={p ?? null}
                        warehouseId={warehouseId || undefined}
                        exclude={values.map((x) => x.productId).filter((id) => id && id !== field.value)}
                        onChange={(np) => {
                          setPicked((prev) => ({ ...prev, [np.id]: np }));
                          field.onChange(np.id);
                          if (np.sellingPrice)
                            setValue(`lines.${i}.unitPrice`, String(Number(np.sellingPrice)));
                        }}
                      />
                    )}
                  />
                </Field>
                <Field
                  label="Quantity"
                  required
                  error={err?.quantity?.message ?? (short ? `${p?.available} available` : undefined)}
                >
                  <Input
                    type="number"
                    min={1}
                    {...register(`lines.${i}.quantity`)}
                    className={cn('tabular', short && 'border-warning')}
                  />
                </Field>
                <Field label="Unit price" error={err?.unitPrice?.message}>
                  <Input
                    {...register(`lines.${i}.unitPrice`)}
                    inputMode="decimal"
                    leading={<span className="text-sm">₹</span>}
                    className="tabular"
                  />
                </Field>
                <Field label="Discount" error={err?.discount?.message}>
                  <Input
                    {...register(`lines.${i}.discount`)}
                    inputMode="decimal"
                    leading={<span className="text-sm">₹</span>}
                    className="tabular"
                    placeholder="0"
                  />
                </Field>
                <div className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium">Amount</span>
                  <span className="flex h-9 items-center justify-end tabular text-sm font-medium">
                    {amount && amount.gte(0) ? money(amount.toFixed(2)) : '—'}
                  </span>
                </div>
                <IconButton
                  label="Remove line"
                  className="mt-6 justify-self-end"
                  disabled={lines.fields.length === 1}
                  onClick={() => lines.remove(i)}
                >
                  <Trash2 strokeWidth={1.75} />
                </IconButton>
              </div>
            );
          })}
        </div>
        <div className="flex flex-col gap-4 border-t border-hairline px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
          <Button type="button" variant="ghost" size="sm" onClick={() => lines.append(blankLine)}>
            <Plus strokeWidth={1.75} /> Add line
          </Button>
          <dl className="grid w-full max-w-64 grid-cols-2 gap-y-1 text-sm sm:ml-auto">
            <dt className="text-fg-secondary">Subtotal</dt>
            <dd className="text-right tabular">{money(gross.toFixed(2))}</dd>
            {discount.gt(0) && (
              <>
                <dt className="text-fg-secondary">Discount</dt>
                <dd className="text-right tabular">−{money(discount.toFixed(2))}</dd>
              </>
            )}
            <dt className="text-fg-secondary">GST</dt>
            <dd className="text-right tabular">{money(tax.toFixed(2))}</dd>
            <dt className="border-t border-hairline pt-1.5 font-semibold">Total</dt>
            <dd className="border-t border-hairline pt-1.5 text-right tabular font-semibold">
              {money(gross.minus(discount).plus(tax).toFixed(2))}
            </dd>
          </dl>
        </div>
        {e.lines?.root?.message && <p className="px-5 pb-3 text-xs text-danger">{e.lines.root.message}</p>}
      </Card>

      <Card>
        <CardContent className="pt-5">
          <Field label="Notes" error={e.notes?.message}>
            <Textarea {...register('notes')} rows={2} />
          </Field>
        </CardContent>
      </Card>
    </div>
  );
}
