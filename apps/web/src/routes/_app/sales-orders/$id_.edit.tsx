import type { SoDetail } from '@stockroom/shared';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { ChevronLeft } from 'lucide-react';
import { toast } from 'sonner';
import { PageLoading } from '@/components/feedback/page-loading';
import { ErrorState } from '@/components/feedback/states';
import { Page, PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { salesOrderQuery, useUpdateSo } from '@/features/sales/api';
import { SoFields, useSoForm } from '@/features/sales/so-form';
import { reportError } from '@/lib/forms';

export const Route = createFileRoute('/_app/sales-orders/$id_/edit')({
  staticData: { title: 'Edit sales order' },
  component: EditSoPage,
});

function EditSoPage() {
  const { id } = Route.useParams();
  const query = useQuery(salesOrderQuery(id));
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
          <Link to="/sales-orders/$id" params={{ id }} className="text-accent-text hover:underline">
            Back to the order
          </Link>
        </Card>
      </Page>
    );
  return <EditForm so={query.data} />;
}

function EditForm({ so }: { so: SoDetail }) {
  const navigate = useNavigate();
  const form = useSoForm(so);
  const update = useUpdateSo(so.id);
  const save = (confirm: boolean) =>
    form.handleSubmit((values) =>
      update.mutate(
        { ...values, confirm },
        {
          onSuccess: (s) => {
            toast.success(confirm ? `${s.number} confirmed` : 'Draft saved');
            void navigate({ to: '/sales-orders/$id', params: { id: s.id } });
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
            to="/sales-orders/$id"
            params={{ id: so.id }}
            className="inline-flex items-center gap-1 hover:text-fg"
          >
            <ChevronLeft className="size-4" strokeWidth={1.75} /> {so.number}
          </Link>
        }
        title={`Edit ${so.number}`}
      />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save(true);
        }}
        noValidate
      >
        <SoFields form={form} so={so} />
        <div className="sticky bottom-0 z-10 -mx-4 mt-4 flex justify-end gap-2 border-t border-hairline px-4 py-3 material sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
          <Button
            type="button"
            variant="secondary"
            onClick={() => void save(false)}
            loading={update.isPending && !update.variables?.confirm}
          >
            Save draft
          </Button>
          <Button
            type="submit"
            variant="primary"
            loading={update.isPending && Boolean(update.variables?.confirm)}
          >
            Confirm order
          </Button>
        </div>
      </form>
    </Page>
  );
}
