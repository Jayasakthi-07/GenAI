import { paginated, reportListItemSchema, reportSchema, reportsQuerySchema } from '@stockroom/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { Services } from '../../services';
import { requirePermission } from '../plugins/auth';
import { idParams } from './catalog';

const view = requirePermission('inventory.view');

export const reportRoutes: FastifyPluginAsyncZod<{ services: Services }> = async (app, { services }) => {
  const { reports } = services;
  app.get(
    '/reports',
    {
      preHandler: view,
      schema: {
        tags: ['reports'],
        querystring: reportsQuerySchema,
        response: { 200: paginated(reportListItemSchema) },
      },
    },
    (req) => reports.list(req.query),
  );
  app.get(
    '/reports/:id',
    { preHandler: view, schema: { tags: ['reports'], params: idParams, response: { 200: reportSchema } } },
    (req) => reports.get(req.params.id),
  );
};
