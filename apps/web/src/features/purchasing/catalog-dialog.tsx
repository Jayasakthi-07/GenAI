import { zodResolver } from '@hookform/resolvers/zod';
import { type SupplierProduct, supplierProductInputSchema } from '@stockroom/shared';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import { type PickedProduct, ProductPicker } from '@/components/domain/pickers';
import { Button } from '@/components/ui/button';
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
import { useSaveCatalogItem } from './api';

type Values = z.input<typeof supplierProductInputSchema>;

/** Add a product to a supplier's catalog, or edit its terms. */
export function CatalogItemDialog({
  supplierId,
  item,
  open,
  onOpenChange,
}: {
  supplierId: string;
  item?: SupplierProduct;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{item ? `Terms for ${item.product.name}` : 'Add a product'}</DialogTitle>
          <DialogDescription>
            Minimum order must be a whole number of packs. Marking it preferred makes this supplier the
            default for new orders.
          </DialogDescription>
        </DialogHeader>
        {open && <Form supplierId={supplierId} item={item} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function Form({
  supplierId,
  item,
  onDone,
}: {
  supplierId: string;
  item?: SupplierProduct;
  onDone: () => void;
}) {
  const save = useSaveCatalogItem(supplierId);
  const [picked, setPicked] = useState<PickedProduct | null>(item ? item.product : null);
  const form = useForm<Values, unknown, z.output<typeof supplierProductInputSchema>>({
    resolver: zodResolver(supplierProductInputSchema),
    defaultValues: {
      productId: item?.product.id ?? '',
      supplierSku: item?.supplierSku ?? '',
      unitCost: item ? String(Number(item.unitCost)) : '',
      moq: item?.moq ?? 1,
      packSize: item?.packSize ?? 1,
      leadTimeDays: item?.leadTimeDays ?? 3,
      isActive: item?.isActive ?? true,
      isPreferred: item?.isPreferred ?? false,
    },
  });
  const { register, control, formState, setValue } = form;
  const e = formState.errors;
  const submit = form.handleSubmit((values) =>
    save.mutate(
      { ...values, linkId: item?.id },
      {
        onSuccess: () => {
          toast.success(item ? 'Terms saved' : `Added ${picked?.name ?? 'product'}`);
          onDone();
        },
        onError: (err) => reportError(err, form, 'Couldn’t save'),
      },
    ),
  );
  return (
    <form onSubmit={(ev) => void submit(ev)} noValidate className="contents">
      <DialogBody className="grid grid-cols-2 gap-4">
        <Field label="Product" required error={e.productId?.message} className="col-span-2">
          <Controller
            control={control}
            name="productId"
            render={({ field }) =>
              item ? (
                <Input value={`${item.product.name} (${item.product.sku})`} disabled />
              ) : (
                <ProductPicker
                  value={picked}
                  onChange={(p) => {
                    setPicked(p);
                    field.onChange(p.id);
                    if (!form.getValues('unitCost') && p.costPrice)
                      setValue('unitCost', String(Number(p.costPrice)));
                  }}
                />
              )
            }
          />
        </Field>
        <Field label="Supplier’s SKU" error={e.supplierSku?.message}>
          <Input {...register('supplierSku')} className="font-mono" />
        </Field>
        <Field label="Unit cost" required error={e.unitCost?.message}>
          <Input
            {...register('unitCost')}
            inputMode="decimal"
            leading={<span className="text-sm">₹</span>}
            className="tabular"
          />
        </Field>
        <Field label="Pack size" error={e.packSize?.message}>
          <Input type="number" min={1} {...register('packSize')} className="tabular" />
        </Field>
        <Field label="Minimum order" error={e.moq?.message}>
          <Input type="number" min={1} {...register('moq')} className="tabular" />
        </Field>
        <Field label="Lead time (days)" required error={e.leadTimeDays?.message}>
          <Input type="number" min={0} {...register('leadTimeDays')} className="tabular" />
        </Field>
        <div className="col-span-2 flex flex-col gap-3">
          <label className="flex items-center justify-between gap-4 text-sm">
            <span className="font-medium">Preferred supplier for this product</span>
            <Controller
              control={control}
              name="isPreferred"
              render={({ field }) => (
                <Switch checked={Boolean(field.value)} onCheckedChange={field.onChange} />
              )}
            />
          </label>
          <label className="flex items-center justify-between gap-4 text-sm">
            <span className="font-medium">Currently available from this supplier</span>
            <Controller
              control={control}
              name="isActive"
              render={({ field }) => (
                <Switch checked={Boolean(field.value)} onCheckedChange={field.onChange} />
              )}
            />
          </label>
        </div>
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={save.isPending}>
          {item ? 'Save' : 'Add to catalog'}
        </Button>
      </DialogFooter>
    </form>
  );
}
