import type { FastifyBaseLogger } from 'fastify';
import type { EventBus } from '../domain/events';
import type { AlertService } from '../services/alert.service';

/**
 * Keeps rule-based stock alerts current until the agent scheduler (Phase 4) takes over:
 * a debounced check after stock changes, and a periodic one for time-based conditions
 * (expiry dates approaching, POs becoming overdue).
 */
export function startStockWatch(
  bus: EventBus,
  alerts: AlertService,
  log: FastifyBaseLogger,
  opts = { debounceMs: 4000, intervalMs: 15 * 60_000 },
) {
  let timer: NodeJS.Timeout | null = null;
  let running = false;
  let again = false;

  const run = async (why: string) => {
    if (running) {
      again = true;
      return;
    }
    running = true;
    try {
      const r = await alerts.runStockCheck({ type: 'system', reason: 'stock-watch' });
      if (r.created || r.resolved)
        log.info({ why, created: r.created, resolved: r.resolved, ms: r.durationMs }, 'stock check');
    } catch (error) {
      log.error({ err: error }, 'stock check failed');
    } finally {
      running = false;
      if (again) {
        again = false;
        schedule('follow-up');
      }
    }
  };

  const schedule = (why: string) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void run(why), opts.debounceMs);
  };

  const unsubscribe = [
    bus.on('stock.changed', () => schedule('stock.changed')),
    bus.on('po.status_changed', () => schedule('po.status_changed')),
  ];
  const interval = setInterval(() => void run('interval'), opts.intervalMs);
  interval.unref();
  schedule('startup');

  return () => {
    unsubscribe.forEach((u) => u());
    clearInterval(interval);
    if (timer) clearTimeout(timer);
  };
}
