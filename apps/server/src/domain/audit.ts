import type { Tx } from '../db/client';
import { type Actor, actorColumns } from './actor';

const SECRET_KEYS = /password|secret|token|apikey|api_key|ciphertext/i;

/** Deep-copies a value for the audit log with secrets replaced. */
export function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') {
    if (value instanceof Date) return value.toISOString();
    if (Buffer.isBuffer(value) || value instanceof Uint8Array) return '[redacted]';
    // Prisma Decimal and similar value objects serialize through toJSON/toString.
    const withToJson = value as { toJSON?: unknown };
    if (typeof withToJson.toJSON === 'function') return (withToJson.toJSON as () => unknown).call(value);
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, SECRET_KEYS.test(k) ? '[redacted]' : redact(v)]),
    );
  }
  return value;
}

export interface AuditEntry {
  action: string;
  entityType: string;
  entityId?: string | null;
  summary?: string;
  before?: unknown;
  after?: unknown;
}

/** Writes an audit row inside the caller's transaction, so it commits or rolls back with the change. */
export async function writeAudit(tx: Tx, actor: Actor, entry: AuditEntry): Promise<void> {
  const cols = actorColumns(actor);
  await tx.auditLog.create({
    data: {
      actorType: cols.actorType,
      actorUserId: cols.actorUserId,
      agentKey: cols.agentKey,
      agentRunId: cols.agentRunId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      summary: entry.summary ?? null,
      before: entry.before === undefined ? undefined : (redact(entry.before) as object),
      after: entry.after === undefined ? undefined : (redact(entry.after) as object),
      ip: actor.type === 'user' ? (actor.ip ?? null) : null,
    },
  });
}
