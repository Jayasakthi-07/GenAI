import { markReadSchema, notificationListSchema, notificationsQuerySchema } from '@stockroom/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Services } from '../../services';
import { actorFor, requireAuth } from '../plugins/auth';

export const notificationRoutes: FastifyPluginAsyncZod<{ services: Services }> = async (
  app,
  { services },
) => {
  const { notifications } = services;

  app.get(
    '/notifications',
    {
      preHandler: requireAuth,
      schema: {
        tags: ['notifications'],
        summary: 'Your recent notifications and the unread count',
        querystring: notificationsQuerySchema,
        response: { 200: notificationListSchema },
      },
    },
    (req) => notifications.list(actorFor(req), req.query),
  );

  app.post(
    '/notifications/read',
    {
      preHandler: requireAuth,
      schema: {
        tags: ['notifications'],
        summary: 'Mark some or all of your notifications as read',
        body: markReadSchema,
        response: { 200: z.object({ updated: z.number().int(), unread: z.number().int() }) },
      },
    },
    (req) => notifications.markRead(actorFor(req), req.body),
  );
};
