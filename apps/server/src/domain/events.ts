import { EventEmitter } from 'node:events';

/**
 * Domain events. Services emit them after their transaction commits; the orchestrator
 * (agent triggers) and the SSE hub subscribe. Phases add events as features land.
 */
export interface DomainEvents {
  'user.signed_in': { userId: string };
  'user.password_changed': { userId: string };
}

export type DomainEventName = keyof DomainEvents;

export interface DomainEventEnvelope<K extends DomainEventName = DomainEventName> {
  name: K;
  payload: DomainEvents[K];
  at: string;
}

export class EventBus {
  private readonly emitter = new EventEmitter({ captureRejections: true });

  constructor() {
    this.emitter.setMaxListeners(50);
  }

  emit<K extends DomainEventName>(name: K, payload: DomainEvents[K]): void {
    const envelope: DomainEventEnvelope<K> = { name, payload, at: new Date().toISOString() };
    this.emitter.emit(name, envelope);
    this.emitter.emit('*', envelope);
  }

  on<K extends DomainEventName>(name: K, listener: (event: DomainEventEnvelope<K>) => void): () => void {
    this.emitter.on(name, listener);
    return () => this.emitter.off(name, listener);
  }

  onAny(listener: (event: DomainEventEnvelope) => void): () => void {
    this.emitter.on('*', listener);
    return () => this.emitter.off('*', listener);
  }
}
