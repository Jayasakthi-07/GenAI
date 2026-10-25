import type { AuditEntry } from '@stockroom/shared';
import { Link } from '@tanstack/react-router';
import { Bot, ChevronRight, Cpu, FlaskConical, UserRound } from 'lucide-react';
import { useState } from 'react';
import { dateTime } from '@/lib/format';
import { cn } from '@/lib/utils';

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

const HIDDEN_KEYS = new Set(['id', 'createdAt', 'updatedAt', 'passwordHash']);

function flatten(value: unknown, prefix = '', out: Record<string, string> = {}): Record<string, string> {
  if (value === null || value === undefined) {
    if (prefix) out[prefix] = '—';
    return out;
  }
  if (Array.isArray(value)) {
    if (value.every((v) => typeof v !== 'object' || v === null))
      out[prefix] = value.length ? value.join(', ') : '—';
    else value.forEach((v, i) => flatten(v, `${prefix}[${i + 1}]`, out));
    return out;
  }
  if (typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, Json>)) {
      if (HIDDEN_KEYS.has(k)) continue;
      flatten(v, prefix ? `${prefix}.${k}` : k, out);
    }
    return out;
  }
  out[prefix || 'value'] = typeof value === 'string' ? value : JSON.stringify(value);
  return out;
}

const label = (key: string) =>
  key
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\./g, ' › ')
    .replace(/^./, (c) => c.toUpperCase());

/** Field-by-field before → after, showing only what changed (or everything for creates). */
export function AuditDiff({ before, after }: { before: unknown; after: unknown }) {
  const b = flatten(before);
  const a = flatten(after);
  const keys = [...new Set([...Object.keys(b), ...Object.keys(a)])].filter((k) => b[k] !== a[k]);
  if (!keys.length) return <p className="text-xs text-fg-tertiary">No field-level details recorded.</p>;
  const hasBefore = before !== null && before !== undefined;
  return (
    <div className="overflow-x-auto rounded-md border border-hairline">
      <table className="w-full text-xs">
        <thead className="bg-surface-2 text-fg-secondary">
          <tr>
            <th className="px-3 py-1.5 text-left font-medium">Field</th>
            {hasBefore && <th className="px-3 py-1.5 text-left font-medium">Before</th>}
            <th className="px-3 py-1.5 text-left font-medium">{hasBefore ? 'After' : 'Value'}</th>
          </tr>
        </thead>
        <tbody>
          {keys.slice(0, 60).map((k) => (
            <tr key={k} className="border-t border-hairline align-top">
              <td className="px-3 py-1.5 whitespace-nowrap text-fg-secondary">{label(k)}</td>
              {hasBefore && (
                <td className="px-3 py-1.5 break-all text-danger line-through decoration-danger/40">
                  {b[k] ?? '—'}
                </td>
              )}
              <td className={cn('px-3 py-1.5 break-all', hasBefore && 'text-success')}>{a[k] ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const ICONS = { USER: UserRound, AGENT: Bot, SYSTEM: Cpu, SIMULATOR: FlaskConical } as const;

/** Links an audit row to the record it changed, when that record has a page. */
function EntityLink({ type, id }: { type: string; id: string | null }) {
  const cls = 'text-accent-text hover:underline';
  if (!id) return <span>{type}</span>;
  switch (type) {
    case 'Product':
      return (
        <Link to="/products/$id" params={{ id }} className={cls}>
          Product
        </Link>
      );
    case 'PurchaseOrder':
      return (
        <Link to="/purchase-orders/$id" params={{ id }} className={cls}>
          Purchase order
        </Link>
      );
    case 'SalesOrder':
      return (
        <Link to="/sales-orders/$id" params={{ id }} className={cls}>
          Sales order
        </Link>
      );
    case 'Transfer':
      return (
        <Link to="/transfers/$id" params={{ id }} className={cls}>
          Transfer
        </Link>
      );
    case 'CycleCount':
      return (
        <Link to="/cycle-counts/$id" params={{ id }} className={cls}>
          Cycle count
        </Link>
      );
    case 'Supplier':
      return (
        <Link to="/suppliers/$id" params={{ id }} className={cls}>
          Supplier
        </Link>
      );
    default:
      return <span>{type.replace(/([a-z])([A-Z])/g, '$1 $2')}</span>;
  }
}

/** One audit row: who, what, when, with an expandable diff. */
export function AuditItem({ entry, showEntity = false }: { entry: AuditEntry; showEntity?: boolean }) {
  const [open, setOpen] = useState(false);
  const Icon = ICONS[entry.actorType];
  const hasDetails = entry.before !== null || entry.after !== null;
  return (
    <li className="px-4 py-3 sm:px-5">
      <div className="flex items-start gap-3">
        <span
          className={cn(
            'mt-0.5 grid size-7 shrink-0 place-items-center rounded-full',
            entry.actorType === 'AGENT'
              ? 'bg-accent-soft text-accent-text'
              : 'bg-neutral-soft text-fg-secondary',
          )}
        >
          <Icon className="size-3.5" strokeWidth={1.75} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm">
            <span className="font-medium">{entry.actorName}</span>{' '}
            <span className="text-fg-secondary">{entry.summary ?? entry.action}</span>
          </p>
          <p className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-fg-tertiary">
            <time dateTime={entry.createdAt}>{dateTime(entry.createdAt)}</time>
            <span className="font-mono">{entry.action}</span>
            {showEntity && <EntityLink type={entry.entityType} id={entry.entityId} />}
          </p>
          {hasDetails && (
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-accent-text hover:underline"
            >
              <ChevronRight
                className={cn('size-3.5 transition-transform', open && 'rotate-90')}
                strokeWidth={2}
              />
              {open ? 'Hide changes' : 'Show changes'}
            </button>
          )}
          {open && (
            <div className="mt-2">
              <AuditDiff before={entry.before} after={entry.after} />
            </div>
          )}
        </div>
      </div>
    </li>
  );
}
