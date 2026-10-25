import {
  MOVEMENT_LABELS,
  MOVEMENT_TYPES,
  type MovementType,
  type ReasonCode,
  type ReasonDirection,
} from '@stockroom/shared';
import { createFileRoute } from '@tanstack/react-router';
import { ListChecks, Pencil, Plus } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { EmptyState, ErrorState } from '@/components/feedback/states';
import { Badge } from '@/components/ui/badge';
import { Button, IconButton } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox, Switch } from '@/components/ui/checkbox';
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
import { Skeleton } from '@/components/ui/misc';
import { SegmentedControl } from '@/components/ui/tabs';
import { useReasonCodes, useSaveReasonCode } from '@/features/catalog/api';
import { useCan } from '@/lib/auth';
import { reportError } from '@/lib/forms';

export const Route = createFileRoute('/_app/settings/reason-codes')({
  staticData: { title: 'Reason codes' },
  component: ReasonCodesSettings,
});

const DIRECTION_LABELS: Record<ReasonDirection, string> = {
  IN: 'Adds stock',
  OUT: 'Removes stock',
  BOTH: 'Either way',
};
// Receipts, sales and transfers have their own documents; reasons apply to manual changes.
const REASON_TYPES: MovementType[] = MOVEMENT_TYPES.filter((t) =>
  ['ISSUE', 'ADJUSTMENT', 'WRITE_OFF', 'RETURN', 'COUNT_CORRECTION'].includes(t),
);

function ReasonCodesSettings() {
  const q = useReasonCodes();
  const can = useCan();
  const manage = can('catalog.manage');
  const [editing, setEditing] = useState<ReasonCode | 'new' | null>(null);
  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-4">
        <div>
          <CardTitle>Reason codes</CardTitle>
          <CardDescription>
            Every manual stock change records why. The Anomaly Auditor uses these to spot patterns like
            repeated damage.
          </CardDescription>
        </div>
        {manage && (
          <Button variant="primary" size="sm" onClick={() => setEditing('new')}>
            <Plus strokeWidth={1.75} /> Add reason
          </Button>
        )}
      </CardHeader>
      {q.isPending ? (
        <Skeleton className="m-5 mt-0 h-40" />
      ) : q.isError ? (
        <ErrorState compact error={q.error} onRetry={() => void q.refetch()} />
      ) : q.data.length === 0 ? (
        <EmptyState compact icon={<ListChecks strokeWidth={1.75} />} title="No reason codes yet" />
      ) : (
        <ul className="divide-y divide-hairline border-t border-hairline">
          {q.data.map((r) => (
            <li key={r.id} className="flex items-center gap-3 px-5 py-3">
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                  {r.label} {!r.isActive && <Badge>Inactive</Badge>}
                </p>
                <p className="mt-0.5 text-xs text-fg-tertiary">
                  <span className="font-mono">{r.code}</span> · {DIRECTION_LABELS[r.direction]} ·{' '}
                  {r.appliesTo.map((t) => MOVEMENT_LABELS[t]).join(', ')}
                </p>
              </div>
              {manage && (
                <IconButton label={`Edit ${r.label}`} onClick={() => setEditing(r)}>
                  <Pencil strokeWidth={1.75} />
                </IconButton>
              )}
            </li>
          ))}
        </ul>
      )}
      <ReasonDialog
        reason={editing === 'new' ? undefined : (editing ?? undefined)}
        open={editing !== null}
        onClose={() => setEditing(null)}
      />
    </Card>
  );
}

function ReasonDialog({
  reason,
  open,
  onClose,
}: {
  reason?: ReasonCode;
  open: boolean;
  onClose: () => void;
}) {
  const save = useSaveReasonCode();
  const [code, setCode] = useState('');
  const [label, setLabel] = useState('');
  const [direction, setDirection] = useState<ReasonDirection>('OUT');
  const [appliesTo, setAppliesTo] = useState<MovementType[]>(['ADJUSTMENT']);
  const [active, setActive] = useState(true);
  const [key, setKey] = useState<string | null>(null);
  const k = open ? (reason?.id ?? 'new') : null;
  if (open && key !== k) {
    setKey(k);
    setCode(reason?.code ?? '');
    setLabel(reason?.label ?? '');
    setDirection(reason?.direction ?? 'OUT');
    setAppliesTo(reason?.appliesTo ?? ['ADJUSTMENT']);
    setActive(reason?.isActive ?? true);
  }
  const close = () => (onClose(), setKey(null));
  const valid = code.trim() && label.trim() && appliesTo.length > 0;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent aria-describedby={undefined}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate(
              {
                id: reason?.id,
                code: code.trim().toUpperCase(),
                label: label.trim(),
                direction,
                appliesTo,
                isActive: active,
              },
              {
                onSuccess: () => (toast.success('Reason saved'), close()),
                onError: (err) => reportError(err, undefined, 'Couldn’t save'),
              },
            );
          }}
        >
          <DialogHeader>
            <DialogTitle>{reason ? `Edit ${reason.label}` : 'Add reason'}</DialogTitle>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-4">
            <div className="grid grid-cols-[160px_1fr] gap-3">
              <Field label="Code" required>
                <Input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className="font-mono uppercase"
                  maxLength={30}
                  disabled={Boolean(reason)}
                />
              </Field>
              <Field label="Label" required>
                <Input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={80} />
              </Field>
            </div>
            <Field label="Direction">
              <SegmentedControl
                aria-label="Direction"
                value={direction}
                onValueChange={setDirection}
                options={(['OUT', 'IN', 'BOTH'] as const).map((d) => ({
                  value: d,
                  label: DIRECTION_LABELS[d],
                }))}
              />
            </Field>
            <fieldset>
              <legend className="mb-2 text-sm font-medium">Used for</legend>
              <div className="grid grid-cols-2 gap-2">
                {REASON_TYPES.map((t) => (
                  <label key={t} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={appliesTo.includes(t)}
                      onCheckedChange={(v) =>
                        setAppliesTo((cur) => (v === true ? [...cur, t] : cur.filter((x) => x !== t)))
                      }
                    />
                    {MOVEMENT_LABELS[t]}
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="flex items-center justify-between text-sm">
              <span className="font-medium">Active</span>
              <Switch checked={active} onCheckedChange={setActive} />
            </label>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={save.isPending} disabled={!valid}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
