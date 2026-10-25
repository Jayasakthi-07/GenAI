import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { ChevronLeft } from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';
import { Page, PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { useCreatePo } from '@/features/purchasing/api';
import { PoFields, usePoForm } from '@/features/purchasing/po-form';
import { reportError } from '@/lib/forms';
import { idParam } from '@/lib/list-search';

export const Route = createFileRoute('/_app/purchase-orders/new')({
  validateSearch: z.object({ supplierId: idParam }),
  staticData: { title: 'New purchase order' },
  component: NewPoPage,
});

function NewPoPage() {
  const { supplierId } = Route.useSearch();
  const navigate = useNavigate();
  const form = usePoForm(undefined, supplierId);
  const create = useCreatePo();

  const save = (submit: boolean) =>
    form.handleSubmit((values) =>
      create.mutate(
        { ...values, expectedDate: values.expectedDate || null, submit },
        {
          onSuccess: (po) => {
            toast.success(
              po.status === 'APPROVED'
                ? `${po.number} approved automatically`
                : po.status === 'PENDING_APPROVAL'
                  ? `${po.number} sent for approval`
                  : `${po.number} saved as a draft`,
              po.status === 'APPROVED'
                ? { description: 'It’s below the approval limit. Send it to the supplier when ready.' }
                : undefined,
            );
            void navigate({ to: '/purchase-orders/$id', params: { id: po.id } });
          },
          onError: (e) => reportError(e, form, 'Couldn’t save the order'),
        },
      ),
    )();

  return (
    <Page className="max-w-5xl">
      <PageHeader
        eyebrow={
          <Link to="/purchase-orders" className="inline-flex items-center gap-1 hover:text-fg">
            <ChevronLeft className="size-4" strokeWidth={1.75} /> Purchase orders
          </Link>
        }
        title="New purchase order"
      />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save(true);
        }}
        noValidate
      >
        <PoFields form={form} />
        <div className="sticky bottom-0 z-10 -mx-4 mt-4 flex justify-end gap-2 border-t border-hairline px-4 py-3 material sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
          <Button
            type="button"
            variant="secondary"
            onClick={() => void save(false)}
            loading={create.isPending && !create.variables?.submit}
          >
            Save draft
          </Button>
          <Button
            type="submit"
            variant="primary"
            loading={create.isPending && Boolean(create.variables?.submit)}
          >
            Submit
          </Button>
        </div>
      </form>
    </Page>
  );
}
