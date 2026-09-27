import {
  dashboardOverviewQuerySchema,
  dashboardOverviewSchema,
  updatePreferencesSchema,
  userPreferencesSchema,
} from '@stockroom/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { Services } from '../../services';
import { actorFor, requireAuth, requirePermission } from '../plugins/auth';

export const dashboardRoutes: FastifyPluginAsyncZod<{ services: Services }> = async (app, { services }) => {
  app.get(
    '/dashboard/overview',
    {
      preHandler: requirePermission('inventory.view'),
      schema: {
        tags: ['dashboard'],
        summary: 'KPIs, value and sales trends, category mix and top movers',
        querystring: dashboardOverviewQuerySchema,
        response: { 200: dashboardOverviewSchema },
      },
    },
    async (request) => services.dashboard.overview(request.query.days),
  );
};

export const meRoutes: FastifyPluginAsyncZod<{ services: Services }> = async (app, { services }) => {
  app.patch(
    '/me/preferences',
    {
      preHandler: requireAuth,
      schema: {
        tags: ['auth'],
        summary: 'Update your theme, density and sidebar preferences',
        body: updatePreferencesSchema,
        response: { 200: userPreferencesSchema },
      },
    },
    async (request) => services.users.updatePreferences(actorFor(request), request.body),
  );
};
