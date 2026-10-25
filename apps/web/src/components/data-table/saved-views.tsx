import { useQuery } from '@tanstack/react-query';
import { Bookmark, BookmarkPlus, Check, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button, IconButton } from '@/components/ui/button';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/menus';
import { Switch } from '@/components/ui/checkbox';
import { savedViewsQuery, useDeleteView, useSaveView } from '@/features/catalog/api';
import { reportError } from '@/lib/forms';

/**
 * Named filter + sort combinations for a list page, saved to the user's account.
 * `state` is the page's URL search (minus the page number).
 */
export function SavedViews({
  page,
  current,
  onApply,
}: {
  page: string;
  current: Record<string, unknown>;
  onApply: (state: Record<string, unknown>) => void;
}) {
  const views = useQuery(savedViewsQuery(page));
  const save = useSaveView(page);
  const remove = useDeleteView(page);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [isDefault, setIsDefault] = useState(false);
  const { page: _page, ...state } = current;
  const active = views.data?.find((v) => sameState(v.state, state));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    save.mutate(
      { page, name: name.trim(), state, isDefault },
      {
        onSuccess: (v) => {
          toast.success(`Saved “${v.name}”`);
          setOpen(false);
          setName('');
          setIsDefault(false);
        },
        onError: (err) => reportError(err, undefined, 'Couldn’t save the view'),
      },
    );
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="secondary" size="sm">
            <Bookmark strokeWidth={1.75} />
            <span className="max-w-32 truncate">{active ? active.name : 'Views'}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel>Saved views</DropdownMenuLabel>
          {views.data?.length ? (
            views.data.map((v) => (
              <DropdownMenuItem key={v.id} onSelect={() => onApply(v.state)} className="group pr-1">
                {active?.id === v.id ? <Check className="!text-accent-text" /> : <Bookmark />}
                <span className="min-w-0 flex-1 truncate">{v.name}</span>
                {v.isDefault && <span className="text-xs text-fg-tertiary">Default</span>}
                <IconButton
                  label={`Delete view ${v.name}`}
                  size="sm"
                  className="opacity-0 group-data-[highlighted]:opacity-100"
                  onClick={(e) => {
                    e.stopPropagation();
                    remove.mutate(v.id, {
                      onError: (err) => reportError(err, undefined, 'Couldn’t delete the view'),
                    });
                  }}
                >
                  <Trash2 />
                </IconButton>
              </DropdownMenuItem>
            ))
          ) : (
            <p className="px-2.5 pb-2 text-sm text-fg-tertiary">Save filters and sorting you use often.</p>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setOpen(true)}>
            <BookmarkPlus /> Save current view…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="sm" aria-describedby={undefined}>
          <form onSubmit={submit}>
            <DialogHeader>
              <DialogTitle>Save view</DialogTitle>
            </DialogHeader>
            <DialogBody className="flex flex-col gap-4">
              <Field label="Name" required>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Low stock in Chennai"
                  autoFocus
                  maxLength={60}
                />
              </Field>
              <label className="flex items-center justify-between gap-3 text-sm">
                <span>Open this view by default</span>
                <Switch checked={isDefault} onCheckedChange={setIsDefault} />
              </label>
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" loading={save.isPending} disabled={!name.trim()}>
                Save view
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function sameState(a: Record<string, unknown>, b: Record<string, unknown>) {
  return JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b));
}
function sortKeys(o: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(o).sort(([x], [y]) => x.localeCompare(y)));
}
