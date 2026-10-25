import { formatNumber, type Unit } from '@stockroom/shared';
import { createFileRoute } from '@tanstack/react-router';
import { Pencil, Plus, Ruler, Trash2 } from 'lucide-react';
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
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/misc';
import { useDeleteUnit, useSaveUnit, useUnits } from '@/features/catalog/api';
import { useCan } from '@/lib/auth';
import { reportError } from '@/lib/forms';

export const Route = createFileRoute('/_app/settings/units')({
  staticData: { title: 'Units' },
  component: UnitsSettings,
});

function UnitsSettings() {
  const q = useUnits();
  const can = useCan();
  const manage = can('catalog.manage');
  const [editing, setEditing] = useState<Unit | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Unit | null>(null);
  const remove = useDeleteUnit();
  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-4">
        <div>
          <CardTitle>Units of measure</CardTitle>
          <CardDescription>
            Quantities are whole numbers in the product’s unit (a 5 kg bag is one “bag”).
          </CardDescription>
        </div>
        {manage && (
          <Button variant="primary" size="sm" onClick={() => setEditing('new')}>
            <Plus strokeWidth={1.75} /> Add unit
          </Button>
        )}
      </CardHeader>
      {q.isPending ? (
        <Skeleton className="m-5 mt-0 h-32" />
      ) : q.isError ? (
        <ErrorState compact error={q.error} onRetry={() => void q.refetch()} />
      ) : q.data.length === 0 ? (
        <EmptyState compact icon={<Ruler strokeWidth={1.75} />} title="No units yet" />
      ) : (
        <ul className="grid grid-cols-1 divide-y divide-hairline border-t border-hairline sm:grid-cols-2 sm:divide-y-0">
          {q.data.map((u) => (
            <li
              key={u.id}
              className="group flex items-center gap-3 border-hairline px-5 py-2.5 sm:border-b sm:odd:border-r"
            >
              <span className="w-14 font-mono text-sm">{u.code}</span>
              <span className="min-w-0 flex-1 truncate text-sm">{u.name}</span>
              <span className="tabular text-xs text-fg-tertiary">{formatNumber(u.productCount)}</span>
              {manage && (
                <span className="flex opacity-100 transition-opacity sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
                  <IconButton label={`Edit ${u.name}`} size="sm" onClick={() => setEditing(u)}>
                    <Pencil strokeWidth={1.75} />
                  </IconButton>
                  <IconButton
                    label={`Delete ${u.name}`}
                    size="sm"
                    disabled={u.productCount > 0}
                    onClick={() => setDeleting(u)}
                  >
                    <Trash2 strokeWidth={1.75} />
                  </IconButton>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      <UnitDialog
        unit={editing === 'new' ? undefined : (editing ?? undefined)}
        open={editing !== null}
        onClose={() => setEditing(null)}
      />
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
            onSuccess: () => (toast.success('Unit deleted'), setDeleting(null)),
            onError: (e) => (reportError(e, undefined, 'Couldn’t delete'), setDeleting(null)),
          })
        }
      />
    </Card>
  );
}

function UnitDialog({ unit, open, onClose }: { unit?: Unit; open: boolean; onClose: () => void }) {
  const save = useSaveUnit();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [key, setKey] = useState<string | null>(null);
  const k = open ? (unit?.id ?? 'new') : null;
  if (open && key !== k) {
    setKey(k);
    setCode(unit?.code ?? '');
    setName(unit?.name ?? '');
  }
  const close = () => (onClose(), setKey(null));
  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent size="sm" aria-describedby={undefined}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate(
              { id: unit?.id, code: code.trim().toLowerCase(), name: name.trim() },
              {
                onSuccess: () => (toast.success('Unit saved'), close()),
                onError: (err) => reportError(err, undefined, 'Couldn’t save'),
              },
            );
          }}
        >
          <DialogHeader>
            <DialogTitle>{unit ? `Edit ${unit.name}` : 'Add unit'}</DialogTitle>
          </DialogHeader>
          <DialogBody className="grid grid-cols-[110px_1fr] gap-3">
            <Field label="Code" required hint="e.g. box">
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="font-mono lowercase"
                maxLength={20}
                autoFocus
              />
            </Field>
            <Field label="Name" required>
              <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={close}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              loading={save.isPending}
              disabled={!code.trim() || !name.trim()}
            >
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
