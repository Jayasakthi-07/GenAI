import { EventEmitter } from 'node:events';

/**
 * Domain events. Services emit them after their transaction commits; the orchestrator
 * (agent triggers) and the SSE hub subscribe.
 */
export interface DomainEvents {
  'user.signed_in': { userId: string };
  'user.password_changed': { userId: string };
  'stock.changed': {
    productId: string;
    warehouseId: string;
    onHand: number;
    available: number;
    movementType: string;
    quantity: number;
  };
  'stock.adjusted': { productId: string; warehouseId: string; quantity: number; reasonCode: string | null };
  'sale.recorded': { salesOrderId: string; warehouseId: string };
  'so.status_changed': { salesOrderId: string; number: string; status: string };
  'po.status_changed': { purchaseOrderId: string; number: string; status: string };
  'po.received': { purchaseOrderId: string; goodsReceiptId: string; supplierId: string };
  'transfer.status_changed': { transferId: string; number: string; status: string };
  'count.completed': { cycleCountId: string; warehouseId: string };
  'alert.created': { alertId: string; type: string; severity: string };
  'alert.updated': { alertId: string; status: string };
  'catalog.changed': {
    entity: 'product' | 'category' | 'unit' | 'warehouse' | 'reason_code' | 'supplier' | 'customer';
    id?: string;
  };
  'settings.changed': { scope: 'organization' | 'ai' | 'agents' };
  'action.created': { actionId: string; agentKey: string; type: string; status: string };
  'action.decided': { actionId: string; status: string };
  'action.executed': { actionId: string; status: string; result?: unknown };
  'agent.run.queued': { runId: string; agentKey: string; trigger: string };
  'agent.run.started': { runId: string; agentKey: string };
  'agent.run.step': { runId: string; agentKey: string; seq: number; type: string; label: string };
  'agent.run.finished': { runId: string; agentKey: string; status: string; summary: string | null };
  'agent.run.handoff': { fromRunId: string; fromAgent: string; toAgent: string; productIds: string[] };
  'forecast.updated': { count: number };
  'report.created': { reportId: string; type: string };
  'notification.created': {
    notificationId: string;
    userId: string;
    title: string;
    severity: string | null;
    link: string | null;
  };
  'simulation.state': {
    running: boolean;
    speed: number;
    scenario: string | null;
    simulatedDay: string | null;
  };
  'ai.status': { providerKey: string; health: string };
}

export type DomainEventName = keyof DomainEvents;

export interface DomainEventEnvelope<K extends DomainEventName = DomainEventName> {
  name: K;
  payload: DomainEvents[K];
  at: string;
}

export type Emit = <K extends DomainEventName>(name: K, payload: DomainEvents[K]) => void;

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
