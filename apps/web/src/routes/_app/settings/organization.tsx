import { zodResolver } from '@hookform/resolvers/zod';
import { type OrganizationDto, organizationUpdateSchema } from '@stockroom/shared';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { Lock } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import { ErrorState } from '@/components/feedback/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/misc';
import { organizationQuery, useSaveOrganization } from '@/features/settings/api';
import { useCan } from '@/lib/auth';
import { reportError } from '@/lib/forms';

export const Route = createFileRoute('/_app/settings/organization')({
  staticData: { title: 'Organization' },
  component: OrganizationSettings,
});

function OrganizationSettings() {
  const q = useQuery(organizationQuery);
  if (q.isPending) return <Skeleton className="h-96 rounded-lg" />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  return <OrgForm org={q.data} />;
}

type Values = z.input<typeof organizationUpdateSchema>;

function OrgForm({ org }: { org: OrganizationDto }) {
  const can = useCan();
  const editable = can('organization.manage');
  const save = useSaveOrganization();
  const form = useForm<Values, unknown, z.output<typeof organizationUpdateSchema>>({
    resolver: zodResolver(organizationUpdateSchema),
    defaultValues: {
      name: org.name,
      legalName: org.legalName ?? '',
      gstin: org.gstin ?? '',
      address: org.address ?? '',
      settings: org.settings,
    },
  });
  const { register, formState } = form;
  const e = formState.errors;
  const s = e.settings;
  const submit = form.handleSubmit((values) =>
    save.mutate(values, {
      onSuccess: (o) => {
        toast.success('Organization settings saved');
        form.reset({
          name: o.name,
          legalName: o.legalName ?? '',
          gstin: o.gstin ?? '',
          address: o.address ?? '',
          settings: o.settings,
        });
      },
      onError: (err) => reportError(err, form, 'Couldn’t save'),
    }),
  );

  return (
    <form onSubmit={(ev) => void submit(ev)} noValidate>
      <fieldset disabled={!editable} className="flex flex-col gap-4">
        {!editable && (
          <p className="flex items-center gap-2 rounded-md bg-neutral-soft px-3 py-2 text-sm text-fg-secondary">
            <Lock className="size-4" strokeWidth={1.75} /> Only admins can change organization settings.
          </p>
        )}
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Profile</CardTitle>
              <CardDescription>
                Shown on purchase orders and reports. Currency is {org.currency}, numbers use {org.locale},
                times are {org.timezone}.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Name" required error={e.name?.message}>
              <Input {...register('name')} />
            </Field>
            <Field label="Legal name" error={e.legalName?.message}>
              <Input {...register('legalName')} />
            </Field>
            <Field label="GSTIN" error={e.gstin?.message}>
              <Input {...register('gstin')} className="font-mono uppercase" maxLength={15} />
            </Field>
            <Field label="Address" error={e.address?.message} className="sm:col-span-2">
              <Textarea {...register('address')} rows={2} />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Replenishment</CardTitle>
              <CardDescription>
                Used by the Replenishment Planner to compute reorder points, safety stock and order
                quantities.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field
              label="Service level"
              error={s?.serviceLevel?.message}
              hint="Chance of not running out during a lead time, e.g. 0.95"
            >
              <Input
                type="number"
                step="0.01"
                min={0.5}
                max={0.999}
                {...register('settings.serviceLevel')}
                className="tabular"
              />
            </Field>
            <Field
              label="Monthly purchasing budget"
              error={s?.replenishmentBudgetInr?.message}
              hint="The planner trims drafts to stay within it"
            >
              <Input
                type="number"
                min={0}
                {...register('settings.replenishmentBudgetInr')}
                leading={<span className="text-sm">₹</span>}
                className="tabular"
              />
            </Field>
            <Field
              label="Cost per order"
              error={s?.orderCostInr?.message}
              hint="Paperwork and handling for one PO (EOQ)"
            >
              <Input
                type="number"
                min={0}
                {...register('settings.orderCostInr')}
                leading={<span className="text-sm">₹</span>}
                className="tabular"
              />
            </Field>
            <Field
              label="Holding cost rate"
              error={s?.holdingRate?.message}
              hint="Yearly, as a fraction of unit cost, e.g. 0.2"
            >
              <Input
                type="number"
                step="0.01"
                min={0.01}
                max={1}
                {...register('settings.holdingRate')}
                className="tabular"
              />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Alerts and controls</CardTitle>
              <CardDescription>Thresholds the Stock Sentinel and the stock services apply.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Expiry warning (days)" error={s?.expiryWarningDays?.message}>
              <Input type="number" min={1} {...register('settings.expiryWarningDays')} className="tabular" />
            </Field>
            <Field label="Overstock above (days of cover)" error={s?.overstockDays?.message}>
              <Input type="number" min={30} {...register('settings.overstockDays')} className="tabular" />
            </Field>
            <Field label="Dead stock after (days without sales)" error={s?.deadStockDays?.message}>
              <Input type="number" min={30} {...register('settings.deadStockDays')} className="tabular" />
            </Field>
            <Field
              label="Repeat alerts after (hours)"
              error={s?.alertDedupeHours?.message}
              hint="An item isn’t re-alerted for the same thing sooner"
            >
              <Input type="number" min={1} {...register('settings.alertDedupeHours')} className="tabular" />
            </Field>
            <Field
              label="Large adjustment (units)"
              error={s?.largeAdjustmentUnits?.message}
              hint="Bigger adjustments need a manager"
            >
              <Input
                type="number"
                min={1}
                {...register('settings.largeAdjustmentUnits')}
                className="tabular"
              />
            </Field>
            <Field
              label="PO approval above"
              error={s?.poApprovalThresholdInr?.message}
              hint="Smaller orders are approved automatically"
            >
              <Input
                type="number"
                min={0}
                {...register('settings.poApprovalThresholdInr')}
                leading={<span className="text-sm">₹</span>}
                className="tabular"
              />
            </Field>
            <Field label="Daily briefing at" error={s?.briefingTime?.message} hint={`In ${org.timezone}`}>
              <Input type="time" {...register('settings.briefingTime')} className="tabular" />
            </Field>
          </CardContent>
        </Card>
      </fieldset>
      {editable && (
        <div className="sticky bottom-0 z-10 mt-4 flex justify-end gap-2 border-t border-hairline py-3 material">
          <Button
            type="button"
            variant="secondary"
            disabled={!formState.isDirty}
            onClick={() => form.reset()}
          >
            Discard
          </Button>
          <Button type="submit" variant="primary" loading={save.isPending} disabled={!formState.isDirty}>
            Save changes
          </Button>
        </div>
      )}
    </form>
  );
}
