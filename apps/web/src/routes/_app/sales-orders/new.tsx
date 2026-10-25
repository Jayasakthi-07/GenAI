import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { ChevronLeft } from 'lucide-react';
import { toast } from 'sonner';
import { Page, PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { useCreateSo } from '@/features/sales/api';
import { SoFields, useSoForm } from '@/features/sales/so-form';
import { reportError } from '@/lib/forms';

export const Route = createFileRoute('/_app/sales-orders/new')({
  staticData: { title: 'New sales order' },
  component: NewSoPage,
});

function NewSoPage() {
  const navigate = useNavigate();
  const form = useSoForm();
  const create = useCreateSo();
  const save = (confirm: boolean) =>
    form.handleSubmit((values) =>
      create.mutate(
        { ...values, confirm },
        {
          onSuccess: (so) => {
            toast.success(
              so.status === 'CONFIRMED'
                ? `${so.number} confirmed — stock reserved`
                : `${so.number} saved as a draft`,
            );
            void navigate({ to: '/sales-orders/$id', params: { id: so.id } });
          },
          onError: (e) => reportError(e, form, 'Couldn’t save the order'),
        },
      ),
    )();

  return (
    <Page className="max-w-5xl">
      <PageHeader
        eyebrow={
          <Link to="/sales-orders" className="inline-flex items-center gap-1 hover:text-fg">
            <ChevronLeft className="size-4" strokeWidth={1.75} /> Sales orders
          </Link>
        }
        title="New sales order"
      />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save(true);
        }}
        noValidate
      >
        <SoFields form={form} />
        <div className="sticky bottom-0 z-10 -mx-4 mt-4 flex justify-end gap-2 border-t border-hairline px-4 py-3 material sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
          <Button
            type="button"
            variant="secondary"
            onClick={() => void save(false)}
            loading={create.isPending && !create.variables?.confirm}
          >
            Save draft
          </Button>
          <Button
            type="submit"
            variant="primary"
            loading={create.isPending && Boolean(create.variables?.confirm)}
          >
            Confirm order
          </Button>
        </div>
      </form>
    </Page>
  );
}
