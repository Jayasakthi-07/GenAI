import { zodResolver } from '@hookform/resolvers/zod';
import { type SupplierDetail, supplierInputSchema } from '@stockroom/shared';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { reportError } from '@/lib/forms';
import { useSaveSupplier } from './api';

type Values = z.input<typeof supplierInputSchema>;

export function SupplierDialog({
  open,
  onOpenChange,
  supplier,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  supplier?: SupplierDetail;
  onSaved?: (s: SupplierDetail) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{supplier ? `Edit ${supplier.name}` : 'New supplier'}</DialogTitle>
        </DialogHeader>
        {open && <SupplierForm supplier={supplier} onDone={() => onOpenChange(false)} onSaved={onSaved} />}
      </DialogContent>
    </Dialog>
  );
}

function SupplierForm({
  supplier,
  onDone,
  onSaved,
}: {
  supplier?: SupplierDetail;
  onDone: () => void;
  onSaved?: (s: SupplierDetail) => void;
}) {
  const save = useSaveSupplier();
  const form = useForm<Values, unknown, z.output<typeof supplierInputSchema>>({
    resolver: zodResolver(supplierInputSchema),
    defaultValues: {
      code: supplier?.code ?? '',
      name: supplier?.name ?? '',
      contactName: supplier?.contactName ?? '',
      email: supplier?.email ?? '',
      phone: supplier?.phone ?? '',
      city: supplier?.city ?? '',
      address: supplier?.address ?? '',
      gstin: supplier?.gstin ?? '',
      paymentTermsDays: supplier?.paymentTermsDays ?? 30,
      isActive: supplier?.isActive ?? true,
      notes: supplier?.notes ?? '',
    },
  });
  const { register, control, formState } = form;
  const e = formState.errors;
  const submit = form.handleSubmit((values) =>
    save.mutate(
      { ...values, id: supplier?.id },
      {
        onSuccess: (s) => {
          toast.success(supplier ? 'Supplier saved' : `Added ${s.name}`);
          onSaved?.(s);
          onDone();
        },
        onError: (err) => reportError(err, form, 'Couldn’t save the supplier'),
      },
    ),
  );
  return (
    <form onSubmit={(ev) => void submit(ev)} noValidate className="contents">
      <DialogBody className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Name" required error={e.name?.message}>
          <Input {...register('name')} />
        </Field>
        <Field label="Code" required error={e.code?.message} hint="Short and unique, e.g. NGM">
          <Input {...register('code')} className="font-mono uppercase" />
        </Field>
        <Field label="Contact person" error={e.contactName?.message}>
          <Input {...register('contactName')} />
        </Field>
        <Field label="Email" error={e.email?.message}>
          <Input type="email" {...register('email')} />
        </Field>
        <Field label="Phone" error={e.phone?.message}>
          <Input type="tel" {...register('phone')} />
        </Field>
        <Field label="City" error={e.city?.message}>
          <Input {...register('city')} />
        </Field>
        <Field label="Address" error={e.address?.message} className="sm:col-span-2">
          <Input {...register('address')} />
        </Field>
        <Field label="GSTIN" error={e.gstin?.message}>
          <Input {...register('gstin')} className="font-mono uppercase" maxLength={15} />
        </Field>
        <Field label="Payment terms (days)" error={e.paymentTermsDays?.message}>
          <Input type="number" min={0} max={180} {...register('paymentTermsDays')} className="tabular" />
        </Field>
        <Field label="Notes" error={e.notes?.message} className="sm:col-span-2">
          <Textarea {...register('notes')} rows={2} />
        </Field>
        <label className="flex items-center justify-between gap-4 text-sm sm:col-span-2">
          <span>
            <span className="font-medium">Active</span>
            <span className="block text-fg-secondary">
              Inactive suppliers can’t receive new purchase orders.
            </span>
          </span>
          <Controller
            control={control}
            name="isActive"
            render={({ field }) => <Switch checked={Boolean(field.value)} onCheckedChange={field.onChange} />}
          />
        </label>
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={save.isPending}>
          {supplier ? 'Save' : 'Add supplier'}
        </Button>
      </DialogFooter>
    </form>
  );
}
