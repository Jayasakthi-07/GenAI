import { type QueryKey, useQueryClient } from '@tanstack/react-query';
import { useEffect, useSyncExternalStore } from 'react';
import { aiKeys } from '@/features/ai/api';
import { API_PREFIX } from '@stockroom/shared';
import { INVENTORY_ROOTS, queryKeys } from './query-keys';

const q = queryKeys;
const agentLists = [q.agents.all, q.runs.all] as const;

/** One map from server event to the data it makes stale. Everything realtime goes through it. */
const INVALIDATES: Record<string, readonly QueryKey[]> = {
  'stock.changed': INVENTORY_ROOTS,
  'sale.recorded': [q.salesOrders.all, q.dashboard.all],
  'so.status_changed': [q.salesOrders.all, q.stock.all, q.products.all, q.dashboard.all],
  'po.status_changed': [q.purchaseOrders.all, q.stock.all, q.products.all, q.suppliers.all, q.dashboard.all],
  'po.received': [q.purchaseOrders.all, q.stock.all, q.products.all, q.suppliers.all, q.dashboard.all],
  'transfer.status_changed': [q.transfers.all, q.stock.all],
  'count.completed': [q.cycleCounts.all, q.stock.all],
  'alert.created': [q.alerts.all, q.dashboard.all],
  'alert.updated': [q.alerts.all, q.dashboard.all],
  'catalog.changed': [q.catalog.all, q.products.all, q.suppliers.all, q.customers.all],
  'settings.changed': [q.agents.all, aiKeys.all],
  'action.created': [q.actions.all, q.dashboard.all, ...agentLists],
  'action.decided': [q.actions.all, q.dashboard.all, ...agentLists],
  'action.executed': [
    q.actions.all,
    q.purchaseOrders.all,
    q.transfers.all,
    q.cycleCounts.all,
    q.products.all,
    ...agentLists,
  ],
  'agent.run.queued': agentLists,
  'agent.run.started': agentLists,
  'agent.run.finished': [...agentLists, q.alerts.all],
  'agent.run.handoff': [q.agents.graph],
  'ai.status': [aiKeys.all],
};

/* ── Live step labels ("Comparing 3 suppliers…") for runs in progress ─── */
const steps = new Map<string, string>();
const listeners = new Set<() => void>();
let snapshot: ReadonlyMap<string, string> = new Map();
const publish = () => {
  snapshot = new Map(steps);
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
export const useRunStepLabels = () => useSyncExternalStore(subscribe, () => snapshot);

/* ── Connection state ──────────────────────────────────────────────────── */
type Connection = 'connecting' | 'open' | 'reconnecting';
let connection: Connection = 'connecting';
const connListeners = new Set<() => void>();
const setConnection = (c: Connection) => {
  connection = c;
  connListeners.forEach((l) => l());
};
export const useLiveConnection = () =>
  useSyncExternalStore(
    (l) => {
      connListeners.add(l);
      return () => connListeners.delete(l);
    },
    () => connection,
  );

/**
 * Opens the event stream for the signed-in session. Events are batched so a burst (a simulated
 * day of sales, a stock check that updates 40 alerts) causes one refetch per query, not dozens.
 */
export function useLiveEvents() {
  const qc = useQueryClient();
  useEffect(() => {
    const source = new EventSource(`${API_PREFIX}/events`);
    const pending = new Map<string, QueryKey>();
    let timer: ReturnType<typeof setTimeout> | null = null;
    let dropped = false;
    const flush = () => {
      timer = null;
      for (const queryKey of pending.values()) void qc.invalidateQueries({ queryKey });
      pending.clear();
    };
    const invalidate = (keys: readonly QueryKey[], delay = 500) => {
      for (const k of keys) pending.set(JSON.stringify(k), k);
      timer ??= setTimeout(flush, delay);
    };
    const data = (e: MessageEvent<string>) => {
      try {
        return (JSON.parse(e.data) as { payload: Record<string, unknown> }).payload;
      } catch {
        return {};
      }
    };

    for (const [name, keys] of Object.entries(INVALIDATES)) {
      source.addEventListener(name, (e: MessageEvent<string>) => {
        const p = data(e);
        if (name === 'agent.run.finished' && typeof p.runId === 'string') {
          steps.delete(p.runId);
          publish();
          invalidate([q.runs.detail(p.runId)], 100);
        }
        invalidate(keys, name === 'stock.changed' ? 1000 : 400);
      });
    }
    // Step events refresh only the run being watched, quickly, so its timeline grows live.
    source.addEventListener('agent.run.step', (e: MessageEvent<string>) => {
      const p = data(e);
      if (typeof p.runId !== 'string') return;
      if (typeof p.label === 'string') steps.set(p.runId, p.label);
      publish();
      invalidate([q.runs.detail(p.runId)], 150);
    });
    source.onopen = () => {
      setConnection('open');
      // Anything could have changed while the stream was down.
      if (dropped) void qc.invalidateQueries();
      dropped = false;
    };
    source.onerror = () => {
      dropped = true;
      setConnection('reconnecting');
    };
    return () => {
      if (timer) clearTimeout(timer);
      source.close();
    };
  }, [qc]);
}
