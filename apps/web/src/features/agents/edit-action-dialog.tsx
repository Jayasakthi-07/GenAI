import { type ActionDto, formatNumber } from '@stockroom/shared';
import { Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button, IconButton } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';

type Line = { productId: string; quantity: number; unitCost?: string; rationale?: string | null };
type Payload = Record<string, unknown> & { lines?: Line[]; productIds?: string[] };

const clone = (p: Record<string, unknown>): Payload => JSON.parse(JSON.stringify(p)) as Payload;
const intOrNull = (v: string) => (v.trim() === '' ? null : Math.max(0, Math.round(Number(v))));

/**
 * Edit-and-approve: change quantities, prices or settings, then approve in one step. The server
 * re-validates (MOQ, pack size, stock at the source) and recomputes the impact.
 */
export function EditActionDialog({
  action: a,
  open,
  onOpenChange,
  loading,
  onApprove,
}: {
  action: ActionDto;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loading: boolean;
  onApprove: (payload: Record<string, unknown>) => void;
}) {
  const [draft, setDraft] = useState<Payload>(() => clone(a.editedPayload ?? a.payload));
  const [openedFor, setOpenedFor] = useState<string | null>(null);
  if (open && openedFor !== a.id) {
    setOpenedFor(a.id);
    setDraft(clone(a.editedPayload ?? a.payload));
  }
  if (!open && openedFor !== null) setOpenedFor(null);

  const names = new Map(a.display.lines.map((l) => [l.product.id, l.product]));
  const setLine = (i: number, patch: Partial<Line>) =>
    setDraft((d) => ({ ...d, lines: d.lines?.map((l, j) => (j === i ? { ...l, ...patch } : l)) }));
  const removeLine = (i: number) => setDraft((d) => ({ ...d, lines: d.lines?.filter((_, j) => j !== i) }));
  const lines = draft.lines ?? [];
  const valid =
    (a.type !== 'CREATE_PURCHASE_ORDER' && a.type !== 'CREATE_TRANSFER') ||
    (lines.length > 0 && lines.every((l) => Number.isInteger(l.quantity) && l.quantity > 0));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) onApprove(draft);
          }}
        >
          <DialogHeader>
            <DialogTitle>Edit and approve</DialogTitle>
            <DialogDescription>
              {a.title}. Your changes are recorded and shared with the agent.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-4">
            {(a.type === 'CREATE_PURCHASE_ORDER' || a.type === 'CREATE_TRANSFER') && (
              <ul className="flex flex-col divide-y divide-hairline rounded-lg border border-hairline">
                {lines.map((l, i) => {
                  const p = names.get(l.productId);
                  return (
                    <li key={l.productId} className="flex flex-wrap items-end gap-3 px-3 py-2.5">
                      <div className="min-w-40 flex-1">
                        <p className="text-sm font-medium">{p?.name ?? 'Product'}</p>
                        <p className="text-xs text-fg-tertiary">{p?.sku}</p>
                      </div>
                      <Field label="Quantity" className="w-28">
                        <Input
                          type="number"
                          inputMode="numeric"
                          min={1}
                          step={1}
                          value={Number.isFinite(l.quantity) ? l.quantity : ''}
                          onChange={(e) => setLine(i, { quantity: Math.round(Number(e.target.value)) })}
                          className="text-right tabular"
                        />
                      </Field>
                      {a.type === 'CREATE_PURCHASE_ORDER' && (
                        <Field label="Unit cost (₹)" className="w-32">
                          <Input
                            inputMode="decimal"
                            value={l.unitCost ?? ''}
                            onChange={(e) => setLine(i, { unitCost: e.target.value })}
                            className="text-right tabular"
                          />
                        </Field>
                      )}
                      <IconButton
                        label={`Remove ${p?.name ?? 'line'}`}
                        disabled={lines.length === 1}
                        onClick={() => removeLine(i)}
                      >
                        <Trash2 strokeWidth={1.75} />
                      </IconButton>
                    </li>
                  );
                })}
              </ul>
            )}
            {a.type === 'CREATE_CYCLE_COUNT' && (
              <ul className="flex flex-col divide-y divide-hairline rounded-lg border border-hairline">
                {(draft.productIds ?? []).map((id) => (
                  <li key={id} className="flex items-center gap-3 px-3 py-2">
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {names.get(id)?.name ?? id}{' '}
                      <span className="text-fg-tertiary">{names.get(id)?.sku}</span>
                    </span>
                    <IconButton
                      label="Remove from the count"
                      disabled={(draft.productIds ?? []).length === 1}
                      onClick={() =>
                        setDraft((d) => ({ ...d, productIds: d.productIds?.filter((x) => x !== id) }))
                      }
                    >
                      <Trash2 strokeWidth={1.75} />
                    </IconButton>
                  </li>
                ))}
              </ul>
            )}
            {a.type === 'UPDATE_REORDER_PARAMS' && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                {(
                  [
                    ['reorderPoint', 'Reorder point'],
                    ['safetyStock', 'Safety stock'],
                    ['maxStock', 'Max stock'],
                  ] as const
                ).map(([key, label]) => (
                  <Field
                    key={key}
                    label={label}
                    hint={key === 'maxStock' ? 'Leave empty for no maximum' : undefined}
                  >
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      value={
                        draft[key] === null || draft[key] === undefined ? '' : String(draft[key] as number)
                      }
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          [key]:
                            key === 'maxStock' ? intOrNull(e.target.value) : (intOrNull(e.target.value) ?? 0),
                        }))
                      }
                      className="text-right tabular"
                    />
                  </Field>
                ))}
              </div>
            )}
            {a.type === 'MARKDOWN_PRICE' && (
              <Field label="New selling price (₹)" hint="Must stay at or above the cost price">
                <Input
                  inputMode="decimal"
                  value={typeof draft.newPrice === 'string' ? draft.newPrice : ''}
                  onChange={(e) => setDraft((d) => ({ ...d, newPrice: e.target.value }))}
                  className="w-40 text-right tabular"
                />
              </Field>
            )}
            {(a.type === 'CREATE_PURCHASE_ORDER' || a.type === 'CREATE_TRANSFER') && (
              <p className="text-xs text-fg-tertiary">
                {formatNumber(lines.reduce((s, l) => s + (Number.isFinite(l.quantity) ? l.quantity : 0), 0))}{' '}
                units in {lines.length} line{lines.length === 1 ? '' : 's'}. Supplier minimums and pack sizes
                are checked when you approve.
              </p>
            )}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={loading} disabled={!valid}>
              Approve with changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
