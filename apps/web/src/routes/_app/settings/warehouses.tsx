import { zodResolver } from '@hookform/resolvers/zod';
import { formatNumber, type Warehouse, warehouseInputSchema } from '@stockroom/shared';
import { createFileRoute } from '@tanstack/react-router';
import { Pencil, Plus, Star, Warehouse as WarehouseIcon } from 'lucide-react';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import { EmptyState, ErrorState } from '@/components/feedback/states';
import { Badge } from '@/components/ui/badge';
import { Button, IconButton } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/misc';
import { useSaveWarehouse, useWarehouses } from '@/features/catalog/api';
import { useCan } from '@/lib/auth';
import { money } from '@/lib/format';
import { reportError } from '@/lib/forms';

export const Route = createFileRoute('/_app/settings/warehouses')({
  staticData: { title: 'Warehouses' },
  component: WarehousesSettings,
});

function WarehousesSettings() {
  const q = useWarehouses();
  const can = useCan();
  const manage = can('organization.manage');
  const [editing, setEditing] = useState<Warehouse | 'new' | null>(null);
  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-4">
        <div>
          <CardTitle>Warehouses</CardTitle>
          <CardDescription>
            The default warehouse is pre-selected in forms. A warehouse with stock can’t be deactivated.
          </CardDescription>
        </div>
        {manage && (
          <Button variant="primary" size="sm" onClick={() => setEditing('new')}>
            <Plus strokeWidth={1.75} /> Add warehouse
          </Button>
        )}
      </CardHeader>
      {q.isPending ? (
        <Skeleton className="m-5 mt-0 h-32" />
      ) : q.isError ? (
        <ErrorState compact error={q.error} onRetry={() => void q.refetch()} />
      ) : q.data.length === 0 ? (
        <EmptyState compact icon={<WarehouseIcon strokeWidth={1.75} />} title="No warehouses yet" />
      ) : (
        <ul className="divide-y divide-hairline border-t border-hairline">
          {q.data.map((w) => (
            <li key={w.id} className="flex items-center gap-4 px-5 py-3">
              <div className="grid size-9 shrink-0 place-items-center rounded-md bg-neutral-soft font-mono text-xs font-semibold text-fg-secondary">
                {w.code}
              </div>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                  {w.name}
                  {w.isDefault && (
                    <Badge tone="accent">
                      <Star className="fill-current" /> Default
                    </Badge>
                  )}
                  {!w.isActive && <Badge>Inactive</Badge>}
                </p>
                <p className="truncate text-xs text-fg-tertiary">{w.address ?? w.city}</p>
              </div>
              <div className="hidden text-right text-sm sm:block">
                <p className="tabular">{money(w.stockValue)}</p>
                <p className="tabular text-xs text-fg-tertiary">{formatNumber(w.skuCount)} products</p>
              </div>
              {manage && (
                <IconButton label={`Edit ${w.name}`} onClick={() => setEditing(w)}>
                  <Pencil strokeWidth={1.75} />
                </IconButton>
              )}
            </li>
          ))}
        </ul>
      )}
      <WarehouseDialog
        warehouse={editing === 'new' ? undefined : (editing ?? undefined)}
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
      />
    </Card>
  );
}

type Values = z.input<typeof warehouseInputSchema>;

function WarehouseDialog({
  warehouse,
  open,
  onOpenChange,
}: {
  warehouse?: Warehouse;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{warehouse ? `Edit ${warehouse.name}` : 'Add warehouse'}</DialogTitle>
        </DialogHeader>
        {open && <WarehouseForm warehouse={warehouse} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function WarehouseForm({ warehouse, onDone }: { warehouse?: Warehouse; onDone: () => void }) {
  const save = useSaveWarehouse();
  const form = useForm<Values, unknown, z.output<typeof warehouseInputSchema>>({
    resolver: zodResolver(warehouseInputSchema),
    defaultValues: {
      code: warehouse?.code ?? '',
      name: warehouse?.name ?? '',
      city: warehouse?.city ?? '',
      address: warehouse?.address ?? '',
      isActive: warehouse?.isActive ?? true,
      isDefault: warehouse?.isDefault ?? false,
    },
  });
  const { register, control, formState } = form;
  const e = formState.errors;
  const submit = form.handleSubmit((v) =>
    save.mutate(
      { ...v, id: warehouse?.id },
      {
        onSuccess: () => (toast.success(warehouse ? 'Warehouse saved' : 'Warehouse added'), onDone()),
        onError: (err) => reportError(err, form, 'Couldn’t save the warehouse'),
      },
    ),
  );
  return (
    <form onSubmit={(ev) => void submit(ev)} noValidate className="contents">
      <DialogBody className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Name" required error={e.name?.message}>
          <Input {...register('name')} />
        </Field>
        <Field label="Code" required error={e.code?.message} hint="Short, e.g. CHN">
          <Input {...register('code')} className="font-mono uppercase" maxLength={10} />
        </Field>
        <Field label="City" required error={e.city?.message}>
          <Input {...register('city')} />
        </Field>
        <Field label="Address" error={e.address?.message}>
          <Input {...register('address')} />
        </Field>
        <label className="flex items-center justify-between gap-4 text-sm">
          <span className="font-medium">Default warehouse</span>
          <Controller
            control={control}
            name="isDefault"
            render={({ field }) => <Switch checked={Boolean(field.value)} onCheckedChange={field.onChange} />}
          />
        </label>
        <label className="flex items-center justify-between gap-4 text-sm">
          <span className="font-medium">Active</span>
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
          Save
        </Button>
      </DialogFooter>
    </form>
  );
}
