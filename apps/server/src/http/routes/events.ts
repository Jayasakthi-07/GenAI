import type { ServerResponse } from 'node:http';
import type { FastifyPluginAsync } from 'fastify';
import type { DomainEventEnvelope, DomainEventName, EventBus } from '../../domain/events';
import { requirePermission } from '../plugins/auth';

/** Internal events that never leave the server. */
const PRIVATE = new Set<DomainEventName>(['user.signed_in', 'user.password_changed']);
const HEARTBEAT_MS = 25_000;

/**
 * Server-sent events: every domain event (ids and statuses only) to signed-in clients, which
 * invalidate the matching queries. Notifications go only to their recipient.
 */
export const eventRoutes: FastifyPluginAsync<{ bus: EventBus }> = async (app, { bus }) => {
  const clients = new Set<ServerResponse>();
  app.addHook('onClose', async () => {
    for (const c of clients) c.end();
    clients.clear();
  });

  app.get(
    '/events',
    { preHandler: requirePermission('inventory.view'), schema: { hide: true } },
    (req, reply) => {
      const userId = req.user?.id;
      reply.hijack();
      const res = reply.raw;
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      res.write('retry: 3000\n\n');
      clients.add(res);
      const send = (e: DomainEventEnvelope) => {
        if (PRIVATE.has(e.name)) return;
        if (e.name === 'notification.created' && (e.payload as { userId: string }).userId !== userId) return;
        res.write(`event: ${e.name}\ndata: ${JSON.stringify({ payload: e.payload, at: e.at })}\n\n`);
      };
      const off = bus.onAny(send);
      const ping = setInterval(() => res.write(': ping\n\n'), HEARTBEAT_MS);
      ping.unref();
      req.raw.on('close', () => {
        off();
        clearInterval(ping);
        clients.delete(res);
      });
    },
  );
};
