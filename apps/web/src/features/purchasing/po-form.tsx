import { zodResolver } from '@hookform/resolvers/zod';
import { formatNumber, type PoDetail, poInputSchema } from '@stockroom/shared';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import Decimal from 'decimal.js';
import { Plus, Trash2, TriangleAlert } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Controller, useFieldArray, useForm, useWatch } from 'react-hook-form';
import type { z } from 'zod';
import { type PickedProduct, ProductPicker, WarehouseSelect } from '@/components/domain/pickers';
import { Button, IconButton } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { useWarehouses } from '@/features/catalog/api';
import { money } from '@/lib/format';
import { allSuppliersQuery, supplierCatalogQuery } from './api';

export type PoFormValues = z.input<typeof poInputSchema>;
export type PoFormOutput = z.output<typeof poInputSchema>;

const blankLine = {
  productId: '',
  quantityOrdered: '' as unknown as number,
  unitCost: '',
  taxRate: undefined,
};

export function usePoForm(po?: PoDetail, supplierId?: string) {
  return useForm<PoFormValues, unknown, PoFormOutput>({
    resolver: zodResolver(poInputSchema),
    defaultValues: po
      ? {
          supplierId: po.supplier.id,
          warehouseId: po.warehouse.id,
          expectedDate: po.expectedDate ?? '',
          notes: po.notes ?? '',
          lines: po.lines.map((l) => ({
            productId: l.product.id,
            quantityOrdered: l.quantityOrdered,
            unitCost: String(Number(l.unitCost)),
            taxRate: Number(l.taxRate),
          })),
          submit: false,
        }
      : {
          supplierId: supplierId ?? '',
          warehouseId: '',
          expectedDate: '',
          notes: '',
          lines: [blankLine],
          submit: false,
        },
  });
}

/** Supplier, destination and lines; costs default from the supplier's catalog and totals update as you type. */
export function PoFields({ form, po }: { form: ReturnType<typeof usePoForm>; po?: PoDetail }) {
  const { control, register, formState, setValue, getValues } = form;
  const e = formState.errors;
  const suppliers = useQuery(allSuppliersQuery);
  const warehouses = useWarehouses();
  const lines = useFieldArray({ control, name: 'lines' });
  const values = useWatch({ control, name: 'lines' });
  const supplierId = useWatch({ control, name: 'supplierId' });
  const catalog = useQuery({ ...supplierCatalogQuery(supplierId), enabled: Boolean(supplierId) });
  const terms = useMemo(() => new Map((catalog.data ?? []).map((c) => [c.product.id, c])), [catalog.data]);
  const [picked, setPicked] = useState<Record<string, PickedProduct>>(() =>
    Object.fromEntries((po?.lines ?? []).map((l) => [l.product.id, { ...l.product, taxRate: l.taxRate }])),
  );

  useEffect(() => {
    if (!getValues('warehouseId')) {
      const def = warehouses.data?.find((w) => w.isDefault) ?? warehouses.data?.[0];
      if (def) setValue('warehouseId', def.id);
    }
  }, [warehouses.data, getValues, setValue]);

  let subtotal = new Decimal(0);
  let tax = new Decimal(0);
  for (const l of values) {
    const q = Number(l.quantityOrdered);
    const c = Number(l.unitCost);
    if (!Number.isFinite(q) || !Number.isFinite(c) || q <= 0) continue;
    const lt = new Decimal(c).mul(q).toDecimalPlaces(2);
    const rate = Number(l.taxRate ?? picked[l.productId]?.taxRate ?? 0);
    subtotal = subtotal.plus(lt);
    tax = tax.plus(lt.mul(rate).div(100).toDecimalPlaces(2));
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="grid grid-cols-1 gap-4 pt-5 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Supplier" required error={e.supplierId?.message} className="lg:col-span-2">
            <Controller
              control={control}
              name="supplierId"
              render={({ field }) => (
                <Select
                  value={field.value}
                  onValueChange={field.onChange}
                  placeholder="Choose a supplier"
                  disabled={Boolean(po)}
                  options={(suppliers.data?.data ?? [])
                    .filter((s) => s.isActive || s.id === field.value)
                    .map((s) => ({ value: s.id, label: s.name, description: s.city ?? undefined }))}
                />
              )}
            />
          </Field>
          <Field label="Deliver to" required error={e.warehouseId?.message}>
            <Controller
              control={control}
              name="warehouseId"
              render={({ field }) => <WarehouseSelect value={field.value} onChange={field.onChange} />}
            />
          </Field>
          <Field
            label="Expected delivery"
            error={e.expectedDate?.message}
            hint="Blank uses the supplier’s lead time"
          >
            <Input type="date" {...register('expectedDate')} />
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
            const t = terms.get(v?.productId ?? '');
            const qty = Number(v?.quantityOrdered);
            const err = e.lines?.[i];
            const packWarning =
              t &&
              qty > 0 &&
              (qty < t.moq
                ? `Minimum order is ${t.moq}`
                : qty % t.packSize !== 0
                  ? `Sold in packs of ${t.packSize}`
                  : null);
            const lineTotal =
              qty > 0 && Number(v?.unitCost) >= 0 ? new Decimal(Number(v?.unitCost) || 0).mul(qty) : null;
            return (
              <div
                key={f.id}
                className="grid grid-cols-2 items-start gap-3 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_100px_130px_110px_auto]"
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
                        supplierId={supplierId || undefined}
                        placeholder={
                          supplierId ? 'Choose from this supplier’s catalog…' : 'Choose the supplier first'
                        }
                        exclude={values.map((x) => x.productId).filter((id) => id && id !== field.value)}
                        onChange={(np) => {
                          setPicked((prev) => ({ ...prev, [np.id]: np }));
                          field.onChange(np.id);
                          const term = terms.get(np.id);
                          setValue(
                            `lines.${i}.unitCost`,
                            String(Number(term?.unitCost ?? np.costPrice ?? 0)),
                          );
                          if (term && !getValues(`lines.${i}.quantityOrdered`))
                            setValue(`lines.${i}.quantityOrdered`, Math.max(term.moq, term.packSize));
                        }}
                      />
                    )}
                  />
                </Field>
                <Field label="Quantity" required error={err?.quantityOrdered?.message}>
                  <Input
                    type="number"
                    min={1}
                    {...register(`lines.${i}.quantityOrdered`)}
                    className="tabular"
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
                <div className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium">Amount</span>
                  <span className="flex h-9 items-center justify-end tabular text-sm font-medium">
                    {lineTotal ? money(lineTotal.toFixed(2)) : '—'}
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
                {(t || packWarning) && (
                  <p className="col-span-2 -mt-1 flex items-center gap-1.5 text-xs text-fg-tertiary sm:col-span-5">
                    {packWarning && (
                      <span className="inline-flex items-center gap-1 text-warning">
                        <TriangleAlert className="size-3.5" strokeWidth={1.75} /> {packWarning} ·
                      </span>
                    )}
                    {t &&
                      `List ${money(t.unitCost)} · pack ${formatNumber(t.packSize)} · MOQ ${formatNumber(t.moq)} · ${t.leadTimeDays}-day lead time`}
                    {p?.taxRate && ` · GST ${Number(p.taxRate)}%`}
                  </p>
                )}
              </div>
            );
          })}
        </div>
        <div className="flex flex-col gap-4 border-t border-hairline px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => lines.append(blankLine)}
            disabled={!supplierId}
          >
            <Plus strokeWidth={1.75} /> Add line
          </Button>
          <dl className="grid w-full max-w-64 grid-cols-2 gap-y-1 text-sm sm:ml-auto">
            <dt className="text-fg-secondary">Subtotal</dt>
            <dd className="text-right tabular">{money(subtotal.toFixed(2))}</dd>
            <dt className="text-fg-secondary">GST</dt>
            <dd className="text-right tabular">{money(tax.toFixed(2))}</dd>
            <dt className="border-t border-hairline pt-1.5 font-semibold">Total</dt>
            <dd className="border-t border-hairline pt-1.5 text-right tabular font-semibold">
              {money(subtotal.plus(tax).toFixed(2))}
            </dd>
          </dl>
        </div>
        {e.lines?.root?.message && <p className="px-5 pb-3 text-xs text-danger">{e.lines.root.message}</p>}
      </Card>

      <Card>
        <CardContent className="pt-5">
          <Field label="Notes for the supplier" error={e.notes?.message}>
            <Textarea {...register('notes')} rows={2} placeholder="Delivery window, packing instructions…" />
          </Field>
          {supplierId && catalog.data?.length === 0 && (
            <p className="mt-3 text-sm text-warning">
              This supplier has no products in its catalog yet.{' '}
              <Link
                to="/suppliers/$id"
                params={{ id: supplierId }}
                search={{ tab: 'catalog' }}
                className="underline"
              >
                Add some
              </Link>{' '}
              first.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
