import type { DomainEventName, DomainEvents, Emit, EventBus } from '../domain/events';
import type { Db, Tx } from './client';

/**
 * Runs `fn` in one database transaction. Events emitted through `emit` are delivered only after
 * the transaction commits, so subscribers never see changes that were rolled back.
 */
export async function inTransaction<T>(
  prisma: Db,
  bus: EventBus,
  fn: (tx: Tx, emit: Emit) => Promise<T>,
): Promise<T> {
  const pending: Array<{ name: DomainEventName; payload: DomainEvents[DomainEventName] }> = [];
  const emit: Emit = (name, payload) => {
    pending.push({ name, payload });
  };
  const result = await prisma.$transaction((tx) => fn(tx, emit), { maxWait: 10_000, timeout: 30_000 });
  for (const e of pending) bus.emit(e.name, e.payload);
  return result;
}
