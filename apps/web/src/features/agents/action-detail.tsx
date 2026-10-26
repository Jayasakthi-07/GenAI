import { ACTION_TYPE_LABELS, type ActionDto, formatNumber } from '@stockroom/shared';
import { Link } from '@tanstack/react-router';
import { ArrowRight, Check, ExternalLink, Pencil, TriangleAlert, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { AiMarker } from '@/components/ai/ai-marker';
import { ReasonDialog } from '@/components/domain/reason-dialog';
import { RiskPill } from '@/components/domain/score';
import { Stat } from '@/components/domain/status';
import { Button } from '@/components/ui/button';
import { TD, TH, THead, TR } from '@/components/ui/table';
import { useCan } from '@/lib/auth';
import { ago, dateTime, money, moneyWhole } from '@/lib/format';
import { reportError } from '@/lib/forms';
import { cn } from '@/lib/utils';
import { useApproveAction, useRejectAction } from './api';
import { EditActionDialog } from './edit-action-dialog';
import { ActionStatusPill, AgentAvatar } from './ui';

/** Link to whatever an executed proposal created or changed. */
function ResultLink({ result }: { result: Record<string, unknown> }) {
  const id = typeof result.id === 'string' ? result.id : null;
  if (!id) return null;
  const label = typeof result.number === 'string' ? result.number : null;
  const cls =
    'inline-flex items-center gap-1.5 self-start text-sm font-medium text-accent-text hover:underline';
  const icon = <ExternalLink className="size-4" strokeWidth={1.75} aria-hidden />;
  switch (result.entity) {
    case 'PurchaseOrder':
      return (
        <Link to="/purchase-orders/$id" params={{ id }} className={cls}>
          {icon} Open {label ?? 'the purchase order'}
        </Link>
      );
    case 'Transfer':
      return (
        <Link to="/transfers/$id" params={{ id }} className={cls}>
          {icon} Open {label ?? 'the transfer'}
        </Link>
      );
    case 'CycleCount':
      return (
        <Link to="/cycle-counts/$id" params={{ id }} className={cls}>
          {icon} Open {label ?? 'the count'}
        </Link>
      );
    case 'Product':
      return (
        <Link to="/products/$id" params={{ id }} className={cls}>
          {icon} Open the product
        </Link>
      );
    default:
      return null;
  }
}

const cover = (n: number | null | undefined) =>
  n === null || n === undefined ? '—' : `${formatNumber(n, { decimals: n > 0 && n < 10 ? 1 : 0 })} d`;

/** Everything a person needs to decide: what, why, the expected impact, and the data behind it. */
export function ActionDetail({ action: a, onDecided }: { action: ActionDto; onDecided?: () => void }) {
  const can = useCan();
  const approve = useApproveAction();
  const reject = useRejectAction();
  const [rejecting, setRejecting] = useState(false);
  const [editing, setEditing] = useState(false);
  const i = a.expectedImpact;
  const d = a.display;
  const decidable = a.status === 'PENDING' && can('actions.approve');

  const doApprove = (payload?: Record<string, unknown>) =>
    approve.mutate(
      { id: a.id, payload },
      {
        onSuccess: (done) => {
          setEditing(false);
          if (done.status === 'FAILED') {
            toast.error('Approved, but it couldn’t be carried out', { description: done.error ?? undefined });
          } else {
            const n = typeof done.result?.number === 'string' ? done.result.number : null;
            toast.success(n ? `${n} created` : 'Approved and done', { description: done.title });
          }
          onDecided?.();
        },
        onError: (e) => reportError(e, undefined, 'Couldn’t approve'),
      },
    );

  const stats: Array<{ label: string; value: React.ReactNode }> = [];
  if (i.cost) stats.push({ label: 'Cost (incl. tax)', value: moneyWhole(i.cost) });
  if (i.units) stats.push({ label: 'Units', value: formatNumber(i.units) });
  if (i.daysOfCoverBefore !== undefined && i.daysOfCoverBefore !== null)
    stats.push({
      label: 'Cover (lowest line)',
      value: (
        <span className="inline-flex items-center gap-1.5">
          {cover(i.daysOfCoverBefore)}
          <ArrowRight className="size-4 text-fg-tertiary" strokeWidth={1.75} aria-label="becomes" />
          {cover(i.daysOfCoverAfter)}
        </span>
      ),
    });
  if (i.stockoutsPrevented)
    stats.push({ label: 'Stockouts prevented', value: formatNumber(i.stockoutsPrevented) });
  if (i.valueRecovered)
    stats.push({
      label: a.type === 'MARKDOWN_PRICE' ? 'Stock value at new price' : 'Value moved',
      value: moneyWhole(i.valueRecovered),
    });

  return (
    <article className="@container flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-fg-secondary">
          <AgentAvatar agentKey={a.agent.key} size="sm" />
          <span className="font-medium text-fg">{a.agent.name}</span>
          <span aria-hidden>·</span>
          <span>{ACTION_TYPE_LABELS[a.type]}</span>
          <span aria-hidden>·</span>
          <span>{ago(a.createdAt)}</span>
        </div>
        <h3 className="text-xl font-semibold tracking-tight">{a.title}</h3>
        <p className="text-sm text-fg-secondary">{a.summary}</p>
        <div className="flex flex-wrap items-center gap-2">
          <ActionStatusPill status={a.status} />
          <RiskPill risk={a.riskLevel} />
          {a.autoExecuted && <span className="text-xs text-fg-tertiary">Ran automatically (Act mode)</span>}
        </div>
      </header>

      {stats.length > 0 && (
        <div className="grid grid-cols-2 gap-4 rounded-lg bg-surface-2 p-4 @xl:grid-cols-4">
          {stats.map((s) => (
            <Stat key={s.label} label={s.label} value={s.value} />
          ))}
        </div>
      )}

      {(i.notes?.length ?? 0) > 0 && (
        <ul className="flex flex-col gap-1.5 rounded-lg bg-warning-soft px-4 py-3 text-sm text-warning">
          {i.notes?.map((n) => (
            <li key={n} className="flex gap-2">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} aria-hidden />
              <span>{n}</span>
            </li>
          ))}
        </ul>
      )}

      <section>
        <div className="mb-1.5 flex items-center gap-2">
          <h4 className="text-sm font-semibold">Why</h4>
          <AiMarker source={a.rationaleSource === 'AI' ? 'ai' : 'rule'} model={a.modelUsed} />
        </div>
        <p className="text-sm whitespace-pre-line text-fg-secondary">{a.rationale}</p>
      </section>

      {(d.supplier || d.warehouse || d.fromWarehouse || d.product) && (
        <section className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          {d.supplier && <Where label="Supplier" value={d.supplier.name} />}
          {d.warehouse && <Where label="Warehouse" value={`${d.warehouse.name} (${d.warehouse.code})`} />}
          {d.fromWarehouse && d.toWarehouse && (
            <Where label="Route" value={`${d.fromWarehouse.code} → ${d.toWarehouse.code}`} />
          )}
          {d.product && <Where label="Product" value={`${d.product.name} · ${d.product.sku}`} />}
        </section>
      )}

      {d.lines.length > 0 && (
        <>
          {/* Narrow (sheet on a phone): one card per line. */}
          <ul className="flex flex-col divide-y divide-hairline rounded-lg border border-hairline @xl:hidden">
            {d.lines.map((l) => (
              <li key={l.product.id} className="flex flex-col gap-1 px-4 py-3 text-sm">
                <span className="flex items-start justify-between gap-3">
                  <span className="min-w-0 font-medium">{l.product.name}</span>
                  {a.type !== 'CREATE_CYCLE_COUNT' && (
                    <span className="shrink-0 tabular">
                      {formatNumber(l.quantity)} {l.product.unit}
                    </span>
                  )}
                </span>
                <span className="flex flex-wrap justify-between gap-x-3 tabular text-xs text-fg-tertiary">
                  <span>{l.product.sku}</span>
                  <span>
                    {l.unitCost ? `${money(l.unitCost)} each · ${l.lineTotal ? money(l.lineTotal) : ''}` : ''}
                    {l.available !== null
                      ? `${l.unitCost ? ' · ' : ''}${formatNumber(l.available)} available`
                      : ''}
                  </span>
                </span>
                {l.rationale && <span className="text-xs text-fg-secondary">{l.rationale}</span>}
              </li>
            ))}
          </ul>
          <section className="hidden overflow-x-auto rounded-lg border border-hairline @xl:block">
            <table className="w-full min-w-[520px] border-separate border-spacing-0 text-sm">
              <THead>
                <tr>
                  <TH className="pl-4">Product</TH>
                  {a.type !== 'CREATE_CYCLE_COUNT' && <TH numeric>Qty</TH>}
                  {d.lines.some((l) => l.unitCost) && <TH numeric>Unit cost</TH>}
                  {d.lines.some((l) => l.lineTotal) && <TH numeric>Total</TH>}
                  <TH numeric className="pr-4">
                    Available
                  </TH>
                </tr>
              </THead>
              <tbody>
                {d.lines.map((l) => (
                  <TR key={l.product.id} className="[&:last-child_td]:border-b-0">
                    <TD density="compact" className="pl-4">
                      <span className="block font-medium">{l.product.name}</span>
                      <span className="block text-xs text-fg-tertiary">
                        {l.product.sku}
                        {l.rationale ? ` · ${l.rationale}` : ''}
                      </span>
                    </TD>
                    {a.type !== 'CREATE_CYCLE_COUNT' && (
                      <TD numeric density="compact">
                        {formatNumber(l.quantity)} {l.product.unit}
                      </TD>
                    )}
                    {d.lines.some((x) => x.unitCost) && (
                      <TD numeric density="compact">
                        {l.unitCost ? money(l.unitCost) : '—'}
                      </TD>
                    )}
                    {d.lines.some((x) => x.lineTotal) && (
                      <TD numeric density="compact">
                        {l.lineTotal ? money(l.lineTotal) : '—'}
                      </TD>
                    )}
                    <TD numeric density="compact" className="pr-4 text-fg-secondary">
                      {l.available === null ? '—' : formatNumber(l.available)}
                    </TD>
                  </TR>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}

      {d.changes.length > 0 && (
        <section className="flex flex-col gap-1.5">
          {d.changes.map((c) => (
            <div
              key={c.label}
              className="flex items-center justify-between gap-4 rounded-md bg-surface-2 px-4 py-2.5 text-sm"
            >
              <span className="text-fg-secondary">{c.label}</span>
              <span className="inline-flex items-center gap-2 tabular">
                <span className="text-fg-tertiary line-through decoration-hairline-strong">{c.before}</span>
                <ArrowRight className="size-4 text-fg-tertiary" strokeWidth={1.75} aria-label="becomes" />
                <span className="font-medium">{c.after}</span>
              </span>
            </div>
          ))}
        </section>
      )}

      {a.dataUsed.length > 0 && (
        <section>
          <h4 className="mb-1.5 text-sm font-semibold">Data used</h4>
          <ul className="flex flex-col gap-1 text-sm text-fg-secondary">
            {a.dataUsed.map((c, n) => (
              <li key={`${c.tool}-${n}`} className="flex gap-2">
                <span className="mt-2 size-1 shrink-0 rounded-full bg-fg-tertiary" aria-hidden />
                <span>
                  {c.label}
                  {c.detail ? <span className="text-fg-tertiary"> ({c.detail})</span> : null}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {(a.decidedAt || a.error || a.result) && (
        <section className="flex flex-col gap-1 rounded-lg border border-hairline px-4 py-3 text-sm">
          {a.decidedAt && (
            <p>
              {a.status === 'REJECTED' ? 'Rejected' : a.status === 'EXPIRED' ? 'Expired' : 'Approved'}
              {a.decidedBy ? ` by ${a.decidedBy}` : ''} · {dateTime(a.decidedAt)}
              {a.editedPayload ? ' · edited before approval' : ''}
            </p>
          )}
          {a.decisionReason && <p className="text-fg-secondary">“{a.decisionReason}”</p>}
          {a.error && <p className="text-danger">{a.error}</p>}
          {a.result && <ResultLink result={a.result} />}
        </section>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-hairline pt-4">
        {a.runId && (
          <Button variant="ghost" size="sm" asChild>
            <Link to="/agents/runs/$id" params={{ id: a.runId }}>
              See how the agent decided
            </Link>
          </Button>
        )}
        {decidable && (
          <div className="ml-auto flex flex-wrap gap-2">
            <Button variant="secondary" disabled={approve.isPending} onClick={() => setRejecting(true)}>
              <X strokeWidth={1.75} /> Reject
            </Button>
            {a.type !== 'CHANGE_PREFERRED_SUPPLIER' && (
              <Button variant="secondary" disabled={approve.isPending} onClick={() => setEditing(true)}>
                <Pencil strokeWidth={1.75} /> Edit
              </Button>
            )}
            <Button variant="primary" loading={approve.isPending && !editing} onClick={() => doApprove()}>
              <Check strokeWidth={1.75} /> Approve
            </Button>
          </div>
        )}
      </div>

      <ReasonDialog
        open={rejecting}
        onOpenChange={setRejecting}
        title="Reject this proposal?"
        description={`${a.agent.name} reads your reason on its next run and won’t propose the same thing for three days.`}
        confirmLabel="Reject"
        loading={reject.isPending}
        onConfirm={(reason) =>
          reject.mutate(
            { id: a.id, reason },
            {
              onSuccess: () => {
                setRejecting(false);
                toast.success('Rejected', {
                  description: `${a.agent.name} will take your reason into account.`,
                });
                onDecided?.();
              },
              onError: (e) => reportError(e, undefined, 'Couldn’t reject'),
            },
          )
        }
      />
      <EditActionDialog
        action={a}
        open={editing}
        onOpenChange={setEditing}
        loading={approve.isPending}
        onApprove={(payload) => doApprove(payload)}
      />
    </article>
  );
}

function Where({ label, value }: { label: string; value: string }) {
  return (
    <span className={cn('min-w-0')}>
      <span className="text-fg-tertiary">{label} </span>
      <span className="font-medium">{value}</span>
    </span>
  );
}
