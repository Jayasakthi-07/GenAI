import { formatNumber } from '@stockroom/shared';
import { createFileRoute, Link } from '@tanstack/react-router';
import { ChevronRight, FolderTree, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { EmptyState, ErrorState } from '@/components/feedback/states';
import { Button, IconButton } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ConfirmDialog,
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/misc';
import { Select } from '@/components/ui/select';
import {
  type CategoryNode,
  useCategoryTree,
  useDeleteCategory,
  useSaveCategory,
} from '@/features/catalog/api';
import { useCan } from '@/lib/auth';
import { reportError } from '@/lib/forms';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/_app/settings/categories')({
  staticData: { title: 'Categories' },
  component: CategoriesSettings,
});

function CategoriesSettings() {
  const tree = useCategoryTree();
  const can = useCan();
  const manage = can('catalog.manage');
  const [editing, setEditing] = useState<{ node?: CategoryNode; parentId?: string | null } | null>(null);
  const [deleting, setDeleting] = useState<CategoryNode | null>(null);
  const remove = useDeleteCategory();
  const total = (n: CategoryNode): number => n.productCount + n.children.reduce((a, c) => a + total(c), 0);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-4">
        <div>
          <CardTitle>Categories</CardTitle>
          <CardDescription>
            Two levels work best: a department and its aisles. Categories with products or subcategories can’t
            be deleted.
          </CardDescription>
        </div>
        {manage && (
          <Button variant="primary" size="sm" onClick={() => setEditing({ parentId: null })}>
            <Plus strokeWidth={1.75} /> Add category
          </Button>
        )}
      </CardHeader>
      {tree.isPending ? (
        <Skeleton className="m-5 mt-0 h-48" />
      ) : tree.isError ? (
        <ErrorState compact error={tree.error} onRetry={() => void tree.refetch()} />
      ) : tree.flat.length === 0 ? (
        <EmptyState compact icon={<FolderTree strokeWidth={1.75} />} title="No categories yet" />
      ) : (
        <ul className="divide-y divide-hairline border-t border-hairline">
          {tree.flat.map((c) => (
            <li
              key={c.id}
              className={cn(
                'group flex items-center gap-2 py-2.5 pr-3',
                c.depth === 0 ? 'bg-surface-2/60 pl-5' : 'pl-11',
              )}
            >
              {c.depth > 0 && <ChevronRight className="size-3.5 text-fg-tertiary" strokeWidth={1.75} />}
              <div className="min-w-0 flex-1">
                <p className={cn('truncate text-sm', c.depth === 0 && 'font-semibold')}>{c.name}</p>
                {c.description && <p className="truncate text-xs text-fg-tertiary">{c.description}</p>}
              </div>
              <Link
                to="/products"
                search={{ categoryId: c.id }}
                className="tabular text-xs text-fg-secondary hover:text-accent-text hover:underline"
              >
                {formatNumber(total(c))} products
              </Link>
              {manage && (
                <span className="flex opacity-100 transition-opacity sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
                  {c.depth === 0 && (
                    <IconButton
                      label={`Add a subcategory to ${c.name}`}
                      size="sm"
                      onClick={() => setEditing({ parentId: c.id })}
                    >
                      <Plus strokeWidth={1.75} />
                    </IconButton>
                  )}
                  <IconButton label={`Edit ${c.name}`} size="sm" onClick={() => setEditing({ node: c })}>
                    <Pencil strokeWidth={1.75} />
                  </IconButton>
                  <IconButton label={`Delete ${c.name}`} size="sm" onClick={() => setDeleting(c)}>
                    <Trash2 strokeWidth={1.75} />
                  </IconButton>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      <CategoryDialog state={editing} roots={tree.roots} onClose={() => setEditing(null)} />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete ${deleting?.name ?? ''}?`}
        description="This can’t be undone."
        confirmLabel="Delete"
        tone="danger"
        loading={remove.isPending}
        onConfirm={() =>
          deleting &&
          remove.mutate(deleting.id, {
            onSuccess: () => (toast.success('Category deleted'), setDeleting(null)),
            onError: (e) => (reportError(e, undefined, 'Couldn’t delete'), setDeleting(null)),
          })
        }
      />
    </Card>
  );
}

function CategoryDialog({
  state,
  roots,
  onClose,
}: {
  state: { node?: CategoryNode; parentId?: string | null } | null;
  roots: CategoryNode[];
  onClose: () => void;
}) {
  const save = useSaveCategory();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [parentId, setParentId] = useState<string>('none');
  const [key, setKey] = useState<string | null>(null);
  const k = state ? (state.node?.id ?? `new:${state.parentId ?? 'root'}`) : null;
  if (state && key !== k) {
    setKey(k);
    setName(state.node?.name ?? '');
    setDescription(state.node?.description ?? '');
    setParentId(state.node?.parentId ?? state.parentId ?? 'none');
  }
  const close = () => (onClose(), setKey(null));
  return (
    <Dialog open={state !== null} onOpenChange={(o) => !o && close()}>
      <DialogContent size="sm" aria-describedby={undefined}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate(
              {
                id: state?.node?.id,
                name: name.trim(),
                description: description.trim() || null,
                parentId: parentId === 'none' ? null : parentId,
              },
              {
                onSuccess: () => (toast.success('Category saved'), close()),
                onError: (err) => reportError(err, undefined, 'Couldn’t save the category'),
              },
            );
          }}
        >
          <DialogHeader>
            <DialogTitle>{state?.node ? `Edit ${state.node.name}` : 'Add category'}</DialogTitle>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-4">
            <Field label="Name" required>
              <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={80} />
            </Field>
            <Field label="Parent">
              <Select
                value={parentId}
                onValueChange={setParentId}
                options={[
                  { value: 'none', label: 'None (top level)' },
                  ...roots
                    .filter((r) => r.id !== state?.node?.id)
                    .map((r) => ({ value: r.id, label: r.name })),
                ]}
              />
            </Field>
            <Field label="Description">
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                maxLength={300}
              />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={save.isPending} disabled={!name.trim()}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
