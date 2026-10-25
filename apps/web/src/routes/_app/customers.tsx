import { zodResolver } from '@hookform/resolvers/zod';
import {
  type Customer,
  CUSTOMER_TYPE_LABELS,
  CUSTOMER_TYPES,
  customerInputSchema,
  formatNumber,
} from '@stockroom/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { Pencil, Plus, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { columnHelper, DataTable } from '@/components/data-table/data-table';
import { Pagination } from '@/components/data-table/pagination';
import {
  ClearFilters,
  DensityToggle,
  FilterMenu,
  SearchInput,
  Toolbar,
} from '@/components/data-table/toolbar';
import { ListPage, PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button, IconButton } from '@/components/ui/button';
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
import { Select } from '@/components/ui/select';
import { customersQuery, useSaveCustomer } from '@/features/sales/api';
import { useCan } from '@/lib/auth';
import { ago, money } from '@/lib/format';
import { reportError } from '@/lib/forms';
import { cleanSearch, enumListParam, listSearch } from '@/lib/list-search';

const searchSchema = z.object({ ...listSearch, type: enumListParam(CUSTOMER_TYPES) });
type Search = z.infer<typeof searchSchema>;

export const Route = createFileRoute('/_app/customers')({
  validateSearch: searchSchema,
  staticData: { title: 'Customers' },
  component: CustomersPage,
});

const col = columnHelper<Customer>();

function CustomersPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const can = useCan();
  const manage = can('customers.manage');
  const [editing, setEditing] = useState<Customer | 'new' | null>(null);
  const page = search.page ?? 1;
  const pageSize = search.pageSize ?? 50;
  const query = useQuery({
    ...customersQuery({ ...search, page, pageSize }),
    placeholderData: keepPreviousData,
  });
  const setSearch = (patch: Partial<Search>, keepPage = false) =>
    void navigate({
      search: (prev) => cleanSearch({ ...prev, ...(keepPage ? {} : { page: undefined }), ...patch }),
      replace: true,
    });
  const filtered = Boolean(search.q || search.type);

  const columns = useMemo(
    () => [
      col.accessor('name', {
        id: 'name',
        header: 'Customer',
        enableSorting: true,
        meta: { required: true, className: 'min-w-56' },
        cell: ({ row }) => (
          <div>
            <p className="font-medium">
              {row.original.name} {!row.original.isActive && <Badge>Inactive</Badge>}
            </p>
            <p className="text-xs text-fg-tertiary">
              {row.original.code}
              {row.original.city ? ` · ${row.original.city}` : ''}
            </p>
          </div>
        ),
      }),
      col.accessor('type', {
        id: 'type',
        header: 'Type',
        cell: (c) => <span className="text-fg-secondary">{CUSTOMER_TYPE_LABELS[c.getValue()]}</span>,
      }),
      col.accessor('orderCount', {
        id: 'orders',
        header: 'Orders',
        meta: { numeric: true },
        cell: ({ row }) => (
          <Link
            to="/sales-orders"
            search={{ customerId: row.original.id }}
            onClick={(e) => e.stopPropagation()}
            className="hover:underline"
          >
            {formatNumber(row.original.orderCount)}
          </Link>
        ),
      }),
      col.accessor('revenue90d', {
        id: 'revenue',
        header: 'Revenue · 90 days',
        meta: { numeric: true },
        cell: (c) => money(c.getValue()),
      }),
      col.accessor('lastOrderAt', {
        id: 'lastOrderAt',
        header: 'Last order',
        cell: (c) => <span className="text-fg-secondary">{ago(c.getValue())}</span>,
      }),
      col.accessor('phone', {
        id: 'contact',
        header: 'Contact',
        cell: ({ row }) => (
          <span className="text-fg-secondary">
            {row.original.phone ?? '—'}
            {row.original.email && (
              <span className="block text-xs text-fg-tertiary">{row.original.email}</span>
            )}
          </span>
        ),
      }),
      col.display({
        id: 'actions',
        header: () => <span className="sr-only">Actions</span>,
        meta: { className: 'w-12' },
        cell: ({ row }) =>
          manage ? (
            <IconButton
              label={`Edit ${row.original.name}`}
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                setEditing(row.original);
              }}
            >
              <Pencil strokeWidth={1.75} />
            </IconButton>
          ) : null,
      }),
    ],
    [manage],
  );

  return (
    <ListPage>
      <PageHeader
        title="Customers"
        description="Who buys from you, how often, and how much."
        actions={
          manage && (
            <Button variant="primary" onClick={() => setEditing('new')}>
              <Plus strokeWidth={1.75} /> New customer
            </Button>
          )
        }
      />
      <Toolbar>
        <SearchInput
          value={search.q}
          onChange={(q) => setSearch({ q })}
          placeholder="Name, code or city…"
          className="w-full sm:w-64"
        />
        <FilterMenu
          label="Type"
          value={search.type}
          onChange={(v) => setSearch({ type: v as Search['type'] })}
          options={CUSTOMER_TYPES.map((t) => ({ value: t, label: CUSTOMER_TYPE_LABELS[t] }))}
        />
        <ClearFilters show={filtered} onClear={() => void navigate({ search: {}, replace: true })} />
        <div className="ml-auto">
          <DensityToggle />
        </div>
      </Toolbar>
      <DataTable
        label="Customers"
        columns={columns}
        data={query.data?.data}
        getRowId={(c) => c.id}
        isLoading={query.isPending}
        isFetching={query.isFetching && !query.isPending}
        error={query.error}
        onRetry={() => void query.refetch()}
        sort={search.sort}
        onSortChange={(sort) => setSearch({ sort })}
        onRowClick={(c) => void navigate({ to: '/sales-orders', search: { customerId: c.id } })}
        empty={{
          icon: <Users strokeWidth={1.75} />,
          title: filtered ? 'No customers match' : 'No customers yet',
        }}
        renderCard={(c) => (
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{c.name}</p>
              <p className="truncate text-xs text-fg-tertiary">
                {CUSTOMER_TYPE_LABELS[c.type]} · {formatNumber(c.orderCount)} orders
              </p>
            </div>
            <span className="tabular text-sm">{money(c.revenue90d)}</span>
          </div>
        )}
        footer={
          <Pagination
            page={page}
            pageSize={pageSize}
            total={query.data?.meta.total}
            noun="customers"
            onPageChange={(p) => setSearch({ page: p }, true)}
            onPageSizeChange={(s) => setSearch({ pageSize: s })}
          />
        }
      />
      <CustomerDialog
        customer={editing === 'new' ? undefined : (editing ?? undefined)}
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
      />
    </ListPage>
  );
}

type Values = z.input<typeof customerInputSchema>;

function CustomerDialog({
  customer,
  open,
  onOpenChange,
}: {
  customer?: Customer;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{customer ? `Edit ${customer.name}` : 'New customer'}</DialogTitle>
        </DialogHeader>
        {open && <CustomerForm customer={customer} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function CustomerForm({ customer, onDone }: { customer?: Customer; onDone: () => void }) {
  const save = useSaveCustomer();
  const form = useForm<Values, unknown, z.output<typeof customerInputSchema>>({
    resolver: zodResolver(customerInputSchema),
    defaultValues: {
      code: customer?.code ?? '',
      name: customer?.name ?? '',
      type: customer?.type ?? 'RETAIL',
      email: customer?.email ?? '',
      phone: customer?.phone ?? '',
      city: customer?.city ?? '',
      gstin: customer?.gstin ?? '',
      isActive: customer?.isActive ?? true,
    },
  });
  const { register, control, formState } = form;
  const e = formState.errors;
  const submit = form.handleSubmit((values) =>
    save.mutate(
      { ...values, id: customer?.id },
      {
        onSuccess: (c) => {
          toast.success(customer ? 'Customer saved' : `Added ${c.name}`);
          onDone();
        },
        onError: (err) => reportError(err, form, 'Couldn’t save the customer'),
      },
    ),
  );
  return (
    <form onSubmit={(ev) => void submit(ev)} noValidate className="contents">
      <DialogBody className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Name" required error={e.name?.message} className="sm:col-span-2">
          <Input {...register('name')} />
        </Field>
        <Field label="Code" required error={e.code?.message}>
          <Input {...register('code')} className="font-mono uppercase" />
        </Field>
        <Field label="Type" required error={e.type?.message}>
          <Controller
            control={control}
            name="type"
            render={({ field }) => (
              <Select
                value={field.value}
                onValueChange={field.onChange}
                options={CUSTOMER_TYPES.map((t) => ({ value: t, label: CUSTOMER_TYPE_LABELS[t] }))}
              />
            )}
          />
        </Field>
        <Field label="Phone" error={e.phone?.message}>
          <Input type="tel" {...register('phone')} />
        </Field>
        <Field label="Email" error={e.email?.message}>
          <Input type="email" {...register('email')} />
        </Field>
        <Field label="City" error={e.city?.message}>
          <Input {...register('city')} />
        </Field>
        <Field label="GSTIN" error={e.gstin?.message}>
          <Input {...register('gstin')} className="font-mono uppercase" maxLength={15} />
        </Field>
        <label className="flex items-center justify-between gap-4 text-sm sm:col-span-2">
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
          {customer ? 'Save' : 'Add customer'}
        </Button>
      </DialogFooter>
    </form>
  );
}
