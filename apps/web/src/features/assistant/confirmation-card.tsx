import { ACTION_TYPE_LABELS, type ConfirmationCard, formatNumber } from '@stockroom/shared';
import { Link } from '@tanstack/react-router';
import { ArrowRight, Check, CircleCheck, ExternalLink, TriangleAlert, X } from 'lucide-react';
import { toast } from 'sonner';
import { RiskPill } from '@/components/domain/score';
import { Button } from '@/components/ui/button';
import { money, moneyWhole } from '@/lib/format';
import { reportError } from '@/lib/forms';
import { cn } from '@/lib/utils';
import { useConfirmCard, useDismissCard } from './api';

/** A drafted change. Nothing happens until the person presses Confirm; it then runs as them. */
export function ConfirmationCardView({ card: c, messageId }: { card: ConfirmationCard; messageId: string }) {
  const confirm = useConfirmCard();
  const dismiss = useDismissCard();
  const d = c.display;
  const pending = c.status === 'pending';
  const busy = confirm.isPending || dismiss.isPending;
  const entity = c.result && typeof c.result.entity === 'string' ? c.result.entity : null;
  const resultId = typeof c.result?.id === 'string' ? c.result.id : null;
  const number = typeof c.result?.number === 'string' ? c.result.number : null;

  return (
    <section
      aria-label={`Confirm: ${c.title}`}
      className={cn(
        'flex flex-col gap-3 rounded-xl border p-4',
        pending ? 'border-accent/40 bg-accent-soft/40' : 'border-hairline bg-surface-2',
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-medium text-fg-tertiary">
            {ACTION_TYPE_LABELS[c.type]} · needs your confirmation
          </p>
          <p className="text-sm font-semibold">{c.title}</p>
          <p className="text-xs text-fg-secondary">{c.summary}</p>
        </div>
        <RiskPill risk={c.riskLevel} />
      </div>

      {d.lines.length > 0 && (
        <ul className="flex flex-col divide-y divide-hairline rounded-lg border border-hairline bg-surface text-sm">
          {d.lines.slice(0, 8).map((l) => (
            <li key={l.product.id} className="flex items-center justify-between gap-3 px-3 py-2">
              <span className="min-w-0">
                <span className="block truncate font-medium">{l.product.name}</span>
                <span className="block text-xs text-fg-tertiary">
                  {l.product.sku}
                  {l.available !== null ? ` · ${formatNumber(l.available)} available` : ''}
                </span>
              </span>
              <span className="shrink-0 text-right tabular">
                {l.quantity > 0 && (
                  <span className="block">
                    {formatNumber(l.quantity)} {l.product.unit}
                  </span>
                )}
                {l.lineTotal && <span className="block text-xs text-fg-tertiary">{money(l.lineTotal)}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
      {d.changes.map((ch) => (
        <p key={ch.label} className="flex items-center justify-between gap-3 text-sm">
          <span className="text-fg-secondary">{ch.label}</span>
          <span className="inline-flex items-center gap-2 tabular">
            <span className="text-fg-tertiary">{ch.before}</span>
            <ArrowRight className="size-4 text-fg-tertiary" strokeWidth={1.75} aria-label="becomes" />
            <span className="font-medium">{ch.after}</span>
          </span>
        </p>
      ))}
      {(c.impact.cost || d.supplier || d.warehouse) && (
        <p className="text-xs text-fg-secondary">
          {[
            d.supplier?.name,
            d.warehouse ? `for ${d.warehouse.code}` : null,
            c.impact.cost ? `${moneyWhole(c.impact.cost)} incl. tax` : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      )}
      {(c.impact.notes?.length ?? 0) > 0 && (
        <ul className="flex flex-col gap-1 text-xs text-warning">
          {c.impact.notes?.map((n) => (
            <li key={n} className="flex gap-1.5">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
              {n}
            </li>
          ))}
        </ul>
      )}
      {c.error && <p className="text-xs text-danger">{c.error}</p>}

      {pending ? (
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() =>
              dismiss.mutate(
                { messageId, cardId: c.id },
                { onError: (e) => reportError(e, undefined, 'Couldn’t dismiss') },
              )
            }
          >
            <X strokeWidth={1.75} /> Not now
          </Button>
          <Button
            variant="primary"
            size="sm"
            loading={confirm.isPending}
            disabled={busy}
            onClick={() =>
              confirm.mutate(
                { messageId, cardId: c.id },
                {
                  onSuccess: (r) =>
                    r.action?.status === 'FAILED'
                      ? toast.error('It couldn’t be carried out', {
                          description: r.action.error ?? undefined,
                        })
                      : toast.success(
                          typeof r.action?.result?.number === 'string'
                            ? `${r.action.result.number} created`
                            : 'Done',
                          { description: c.title },
                        ),
                  onError: (e) => reportError(e, undefined, 'Couldn’t carry this out'),
                },
              )
            }
          >
            <Check strokeWidth={1.75} /> Confirm
          </Button>
        </div>
      ) : (
        <p className="flex flex-wrap items-center gap-2 text-xs text-fg-secondary">
          {c.status === 'confirmed' ? (
            <>
              <CircleCheck className="size-4 text-success" strokeWidth={1.75} aria-hidden /> Done
              {resultId && entity === 'PurchaseOrder' && (
                <Link
                  to="/purchase-orders/$id"
                  params={{ id: resultId }}
                  className="inline-flex items-center gap-1 font-medium text-accent-text hover:underline"
                >
                  <ExternalLink className="size-3.5" strokeWidth={1.75} /> {number ?? 'Open'}
                </Link>
              )}
              {resultId && entity === 'Transfer' && (
                <Link
                  to="/transfers/$id"
                  params={{ id: resultId }}
                  className="inline-flex items-center gap-1 font-medium text-accent-text hover:underline"
                >
                  <ExternalLink className="size-3.5" strokeWidth={1.75} /> {number ?? 'Open'}
                </Link>
              )}
              {resultId && entity === 'CycleCount' && (
                <Link
                  to="/cycle-counts/$id"
                  params={{ id: resultId }}
                  className="inline-flex items-center gap-1 font-medium text-accent-text hover:underline"
                >
                  <ExternalLink className="size-3.5" strokeWidth={1.75} /> {number ?? 'Open'}
                </Link>
              )}
              {resultId && entity === 'Product' && (
                <Link
                  to="/products/$id"
                  params={{ id: resultId }}
                  className="inline-flex items-center gap-1 font-medium text-accent-text hover:underline"
                >
                  <ExternalLink className="size-3.5" strokeWidth={1.75} /> Open the product
                </Link>
              )}
            </>
          ) : c.status === 'failed' ? (
            <span className="text-danger">Couldn’t be carried out.</span>
          ) : (
            'Dismissed.'
          )}
        </p>
      )}
    </section>
  );
}
