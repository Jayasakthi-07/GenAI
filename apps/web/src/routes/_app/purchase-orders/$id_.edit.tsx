import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { ChevronLeft } from 'lucide-react';
import { toast } from 'sonner';
import { PageLoading } from '@/components/feedback/page-loading';
import { ErrorState } from '@/components/feedback/states';
import { Page, PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { purchaseOrderQuery, useUpdatePo } from '@/features/purchasing/api';
import { PoFields, usePoForm } from '@/features/purchasing/po-form';
import { reportError } from '@/lib/forms';
import type { PoDetail } from '@stockroom/shared';

export const Route = createFileRoute('/_app/purchase-orders/$id_/edit')({
  staticData: { title: 'Edit purchase order' },
  component: EditPoPage,
});

function EditPoPage() {
  const { id } = Route.useParams();
  const query = useQuery(purchaseOrderQuery(id));
  if (query.isPending) return <PageLoading />;
  if (query.isError)
    return (
      <Page>
        <Card>
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        </Card>
      </Page>
    );
  if (query.data.status !== 'DRAFT')
    return (
      <Page>
        <Card className="p-6 text-sm">
          {query.data.number} is no longer a draft, so it can’t be edited.{' '}
          <Link to="/purchase-orders/$id" params={{ id }} className="text-accent-text hover:underline">
            Back to the order
          </Link>
        </Card>
      </Page>
    );
  return <EditForm po={query.data} />;
}

function EditForm({ po }: { po: PoDetail }) {
  const navigate = useNavigate();
  const form = usePoForm(po);
  const update = useUpdatePo(po.id);
  const save = (submit: boolean) =>
    form.handleSubmit((values) =>
      update.mutate(
        { ...values, expectedDate: values.expectedDate || null, submit },
        {
          onSuccess: (p) => {
            toast.success(submit ? `${p.number} submitted` : 'Draft saved');
            void navigate({ to: '/purchase-orders/$id', params: { id: p.id } });
          },
          onError: (e) => reportError(e, form, 'Couldn’t save the order'),
        },
      ),
    )();
  return (
    <Page className="max-w-5xl">
      <PageHeader
        eyebrow={
          <Link
            to="/purchase-orders/$id"
            params={{ id: po.id }}
            className="inline-flex items-center gap-1 hover:text-fg"
          >
            <ChevronLeft className="size-4" strokeWidth={1.75} /> {po.number}
          </Link>
        }
        title={`Edit ${po.number}`}
      />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save(true);
        }}
        noValidate
      >
        <PoFields form={form} po={po} />
        <div className="sticky bottom-0 z-10 -mx-4 mt-4 flex justify-end gap-2 border-t border-hairline px-4 py-3 material sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
          <Button
            type="button"
            variant="secondary"
            onClick={() => void save(false)}
            loading={update.isPending && !update.variables?.submit}
          >
            Save draft
          </Button>
          <Button
            type="submit"
            variant="primary"
            loading={update.isPending && Boolean(update.variables?.submit)}
          >
            Submit
          </Button>
        </div>
      </form>
    </Page>
  );
}
