import { zodResolver } from '@hookform/resolvers/zod';
import {
  formatPercent,
  PRODUCT_STATUS_LABELS,
  PRODUCT_STATUSES,
  type ProductDetail,
  productInputSchema,
} from '@stockroom/shared';
import { useQuery } from '@tanstack/react-query';
import { Controller, useForm, useWatch } from 'react-hook-form';
import type { z } from 'zod';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/checkbox';
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { useCategoryTree, useUnits } from '@/features/catalog/api';
import { allSuppliersQuery } from '@/features/purchasing/api';
import { cn } from '@/lib/utils';

export type ProductFormValues = z.input<typeof productInputSchema>;
export type ProductFormOutput = z.output<typeof productInputSchema>;

const GST_RATES = ['0', '5', '12', '18', '28'];

export function productDefaults(p?: ProductDetail): ProductFormValues {
  return {
    sku: p?.sku ?? '',
    name: p?.name ?? '',
    description: p?.description ?? '',
    barcode: p?.barcode ?? '',
    brand: p?.brand ?? '',
    categoryId: p?.category.id ?? '',
    unitId: p?.unitId ?? '',
    costPrice: p ? Number(p.costPrice).toString() : '',
    sellingPrice: p ? Number(p.sellingPrice).toString() : '',
    mrp: p?.mrp ? Number(p.mrp).toString() : '',
    taxRate: p ? Number(p.taxRate) : 5,
    tags: p?.tags ?? [],
    status: p?.status ?? 'ACTIVE',
    trackExpiry: p?.trackExpiry ?? false,
    shelfLifeDays: p?.shelfLifeDays ?? null,
    leadTimeDays: p?.leadTimeDays ?? null,
    reorderPoint: p?.reorderPoint ?? null,
    safetyStock: p?.safetyStock ?? null,
    maxStock: p?.maxStock ?? null,
    preferredSupplierId: p?.preferredSupplier?.id ?? null,
  };
}

export function useProductForm(product?: ProductDetail) {
  return useForm<ProductFormValues, unknown, ProductFormOutput>({
    resolver: zodResolver(productInputSchema),
    defaultValues: productDefaults(product),
    mode: 'onTouched',
  });
}

const intField = (v: string) => (v === '' ? null : Number(v));

/**
 * Every product field in four groups. Used full-page for new products and in a sheet for edits,
 * so the rules (margins, MRP, shelf life) read the same everywhere.
 */
export function ProductFields({
  form,
  compact = false,
  trackExpiryLocked,
}: {
  form: ReturnType<typeof useProductForm>;
  compact?: boolean;
  /** Stock exists, so expiry tracking can't be switched (batches would no longer add up). */
  trackExpiryLocked?: boolean;
}) {
  const { register, control, formState } = form;
  const errors = formState.errors;
  const categories = useCategoryTree();
  const units = useUnits();
  const suppliers = useQuery(allSuppliersQuery);
  const [cost, price, trackExpiry] = useWatch({
    control,
    name: ['costPrice', 'sellingPrice', 'trackExpiry'],
  });
  const margin =
    Number(price) > 0 && Number(cost) >= 0 ? (Number(price) - Number(cost)) / Number(price) : null;

  const section = (title: string, description: string, body: React.ReactNode) =>
    compact ? (
      <section className="flex flex-col gap-4">
        <h3 className="text-sm font-semibold text-fg-secondary">{title}</h3>
        {body}
      </section>
    ) : (
      <Card>
        <CardHeader>
          <div>
            <CardTitle>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">{body}</CardContent>
      </Card>
    );

  const grid = cn(
    'grid gap-4',
    compact ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
  );

  return (
    <div className={cn('flex flex-col', compact ? 'gap-6' : 'gap-4')}>
      {section(
        'Basics',
        'How the product is named and found.',
        <>
          <div className={grid}>
            <Field
              label="Name"
              required
              error={errors.name?.message}
              className={compact ? 'sm:col-span-2' : 'sm:col-span-2'}
            >
              <Input {...register('name')} placeholder="e.g. Ponni Boiled Rice 5 kg" />
            </Field>
            <Field label="SKU" required error={errors.sku?.message}>
              <Input
                {...register('sku')}
                placeholder="STP-RIC-001"
                className="font-mono"
                autoCapitalize="characters"
              />
            </Field>
            <Field label="Category" required error={errors.categoryId?.message}>
              <Controller
                control={control}
                name="categoryId"
                render={({ field }) => (
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                    placeholder="Choose a category"
                    options={categories.flat.map((c) => ({ value: c.id, label: c.path }))}
                  />
                )}
              />
            </Field>
            <Field label="Unit" required error={errors.unitId?.message}>
              <Controller
                control={control}
                name="unitId"
                render={({ field }) => (
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                    placeholder="Choose a unit"
                    options={(units.data ?? []).map((u) => ({ value: u.id, label: u.name }))}
                  />
                )}
              />
            </Field>
            <Field label="Brand" error={errors.brand?.message}>
              <Input {...register('brand')} />
            </Field>
            <Field label="Barcode" error={errors.barcode?.message} hint="EAN or UPC, optional">
              <Input {...register('barcode')} inputMode="numeric" className="font-mono" />
            </Field>
            <Field label="Status" error={errors.status?.message}>
              <Controller
                control={control}
                name="status"
                render={({ field }) => (
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                    options={PRODUCT_STATUSES.map((s) => ({ value: s, label: PRODUCT_STATUS_LABELS[s] }))}
                  />
                )}
              />
            </Field>
            <Field label="Tags" hint="Separate with commas" className={compact ? 'sm:col-span-2' : undefined}>
              <Controller
                control={control}
                name="tags"
                render={({ field }) => (
                  <Input
                    defaultValue={(field.value ?? []).join(', ')}
                    onBlur={(e) => {
                      field.onChange(
                        e.target.value
                          .split(',')
                          .map((t) => t.trim().toLowerCase())
                          .filter(Boolean),
                      );
                      field.onBlur();
                    }}
                    placeholder="staple, festive"
                  />
                )}
              />
            </Field>
          </div>
          <Field label="Description" error={errors.description?.message}>
            <Textarea {...register('description')} rows={2} />
          </Field>
        </>,
      )}

      {section(
        'Pricing',
        'Amounts in rupees. Selling price below cost is refused for active products.',
        <div className={grid}>
          <Field label="Cost price" required error={errors.costPrice?.message}>
            <Input
              {...register('costPrice')}
              inputMode="decimal"
              leading={<span className="text-sm">₹</span>}
              className="tabular"
            />
          </Field>
          <Field
            label="Selling price"
            required
            error={errors.sellingPrice?.message}
            hint={margin !== null && !errors.sellingPrice ? `Margin ${formatPercent(margin)}` : undefined}
          >
            <Input
              {...register('sellingPrice')}
              inputMode="decimal"
              leading={<span className="text-sm">₹</span>}
              className="tabular"
            />
          </Field>
          <Field label="MRP" error={errors.mrp?.message} hint="Maximum retail price, optional">
            <Input
              {...register('mrp')}
              inputMode="decimal"
              leading={<span className="text-sm">₹</span>}
              className="tabular"
            />
          </Field>
          <Field label="GST rate" error={errors.taxRate?.message}>
            <Controller
              control={control}
              name="taxRate"
              render={({ field }) => (
                <Select
                  value={String(Number(field.value ?? 0))}
                  onValueChange={(v) => field.onChange(Number(v))}
                  options={GST_RATES.map((r) => ({ value: r, label: `${r}%` }))}
                />
              )}
            />
          </Field>
        </div>,
      )}

      {section(
        'Replenishment',
        'Defaults for every warehouse; each warehouse can override them on the product page.',
        <div className={grid}>
          <Field
            label="Reorder point"
            error={errors.reorderPoint?.message}
            hint="Reorder when available + on order falls to this"
          >
            <Input
              type="number"
              min={0}
              {...register('reorderPoint', { setValueAs: intField })}
              className="tabular"
            />
          </Field>
          <Field label="Safety stock" error={errors.safetyStock?.message}>
            <Input
              type="number"
              min={0}
              {...register('safetyStock', { setValueAs: intField })}
              className="tabular"
            />
          </Field>
          <Field
            label="Max stock"
            error={errors.maxStock?.message}
            hint="Above twice this counts as overstock"
          >
            <Input
              type="number"
              min={0}
              {...register('maxStock', { setValueAs: intField })}
              className="tabular"
            />
          </Field>
          <Field label="Lead time (days)" error={errors.leadTimeDays?.message}>
            <Input
              type="number"
              min={0}
              {...register('leadTimeDays', { setValueAs: intField })}
              className="tabular"
            />
          </Field>
          <Field
            label="Preferred supplier"
            error={errors.preferredSupplierId?.message}
            className={compact ? 'sm:col-span-2' : 'sm:col-span-2'}
          >
            <Controller
              control={control}
              name="preferredSupplierId"
              render={({ field }) => (
                <Select
                  value={field.value ?? 'none'}
                  onValueChange={(v) => field.onChange(v === 'none' ? null : v)}
                  options={[
                    { value: 'none', label: 'None' },
                    ...(suppliers.data?.data ?? [])
                      .filter((s) => s.isActive)
                      .map((s) => ({ value: s.id, label: s.name })),
                  ]}
                />
              )}
            />
          </Field>
        </div>,
      )}

      {section(
        'Expiry',
        'Expiry-tracked products are received in batches and picked first-expiry-first-out.',
        <div className={grid}>
          <label
            className={cn(
              'flex items-center justify-between gap-4 text-sm sm:col-span-2',
              trackExpiryLocked && 'opacity-60',
            )}
          >
            <span>
              <span className="font-medium">Track batches and expiry dates</span>
              {trackExpiryLocked && (
                <span className="block text-fg-secondary">Can’t change while the product has stock.</span>
              )}
            </span>
            <Controller
              control={control}
              name="trackExpiry"
              render={({ field }) => (
                <Switch
                  checked={Boolean(field.value)}
                  onCheckedChange={field.onChange}
                  disabled={trackExpiryLocked}
                />
              )}
            />
          </label>
          {trackExpiry && (
            <Field label="Shelf life (days)" required error={errors.shelfLifeDays?.message}>
              <Input
                type="number"
                min={1}
                {...register('shelfLifeDays', { setValueAs: intField })}
                className="tabular"
              />
            </Field>
          )}
        </div>,
      )}
    </div>
  );
}
