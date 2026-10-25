import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { ChevronLeft } from 'lucide-react';
import { toast } from 'sonner';
import { Page, PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { useCreateProduct } from '@/features/products/api';
import { ProductFields, useProductForm } from '@/features/products/product-form';
import { reportError } from '@/lib/forms';

export const Route = createFileRoute('/_app/products/new')({
  staticData: { title: 'New product' },
  component: NewProductPage,
});

function NewProductPage() {
  const navigate = useNavigate();
  const form = useProductForm();
  const create = useCreateProduct();

  const submit = form.handleSubmit((values) =>
    create.mutate(values, {
      onSuccess: (p) => {
        toast.success(`Added ${p.name}`);
        void navigate({ to: '/products/$id', params: { id: p.id } });
      },
      onError: (e) => reportError(e, form, 'Couldn’t add the product'),
    }),
  );

  return (
    <Page className="max-w-5xl">
      <PageHeader
        eyebrow={
          <Link to="/products" className="inline-flex items-center gap-1 hover:text-fg">
            <ChevronLeft className="size-4" strokeWidth={1.75} /> Products
          </Link>
        }
        title="New product"
        description="Stock starts at zero; receive it from a purchase order or the Stock page."
      />
      <form onSubmit={(e) => void submit(e)} noValidate>
        <ProductFields form={form} />
        <div className="sticky bottom-0 z-10 -mx-4 mt-4 flex justify-end gap-2 border-t border-hairline px-4 py-3 material sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
          <Button type="button" variant="secondary" asChild>
            <Link to="/products">Cancel</Link>
          </Button>
          <Button type="submit" variant="primary" loading={create.isPending}>
            Add product
          </Button>
        </div>
      </form>
    </Page>
  );
}
