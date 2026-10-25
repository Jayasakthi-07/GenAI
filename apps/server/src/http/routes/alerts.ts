import {
  alertBulkSchema,
  alertCountsSchema,
  alertResolveSchema,
  alertSchema,
  alertSnoozeSchema,
  alertsQuerySchema,
  auditEntrySchema,
  auditFacetsSchema,
  auditQuerySchema,
  bulkResultSchema,
  cursorPage,
  paginated,
  stockCheckResultSchema,
} from '@stockroom/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { Services } from '../../services';
import { actorFor, requirePermission } from '../plugins/auth';
import { idParams } from './catalog';

const view = requirePermission('inventory.view');

export const alertRoutes: FastifyPluginAsyncZod<{ services: Services }> = async (app, { services }) => {
  const { alerts, audit } = services;

  app.get(
    '/alerts',
    {
      preHandler: view,
      schema: {
        tags: ['alerts'],
        summary: 'Open alerts by priority (filter by status to see history)',
        querystring: alertsQuerySchema,
        response: { 200: paginated(alertSchema) },
      },
    },
    (req) => alerts.list(req.query),
  );
  app.get(
    '/alerts/counts',
    { preHandler: view, schema: { tags: ['alerts'], response: { 200: alertCountsSchema } } },
    () => alerts.counts(),
  );
  app.post(
    '/alerts/check',
    {
      preHandler: requirePermission('agents.run'),
      schema: {
        tags: ['alerts'],
        summary: 'Run the rule-based stock check now',
        response: { 200: stockCheckResultSchema },
      },
    },
    async (req) => {
      const { created, updated, resolved, findings, durationMs } = await alerts.runStockCheck(actorFor(req));
      return { created, updated, resolved, findings, durationMs };
    },
  );
  app.post(
    '/alerts/bulk',
    {
      preHandler: view,
      schema: { tags: ['alerts'], body: alertBulkSchema, response: { 200: bulkResultSchema } },
    },
    async (req) => ({
      updated: await alerts.bulk(actorFor(req), req.body),
    }),
  );
  app.get(
    '/alerts/:id',
    { preHandler: view, schema: { tags: ['alerts'], params: idParams, response: { 200: alertSchema } } },
    (req) => alerts.get(req.params.id),
  );
  app.post(
    '/alerts/:id/acknowledge',
    { preHandler: view, schema: { tags: ['alerts'], params: idParams, response: { 200: alertSchema } } },
    async (req) => {
      await alerts.acknowledge(actorFor(req), [req.params.id]);
      return alerts.get(req.params.id);
    },
  );
  app.post(
    '/alerts/:id/snooze',
    {
      preHandler: view,
      schema: { tags: ['alerts'], params: idParams, body: alertSnoozeSchema, response: { 200: alertSchema } },
    },
    async (req) => {
      await alerts.snooze(actorFor(req), [req.params.id], new Date(req.body.until));
      return alerts.get(req.params.id);
    },
  );
  app.post(
    '/alerts/:id/resolve',
    {
      preHandler: view,
      schema: {
        tags: ['alerts'],
        params: idParams,
        body: alertResolveSchema,
        response: { 200: alertSchema },
      },
    },
    async (req) => {
      await alerts.resolve(actorFor(req), [req.params.id], req.body.resolution);
      return alerts.get(req.params.id);
    },
  );

  /* Audit log */
  app.get(
    '/audit-log',
    {
      preHandler: requirePermission('audit.view'),
      schema: {
        tags: ['audit'],
        summary: 'Every change, by people, agents and the system (cursor paging)',
        querystring: auditQuerySchema,
        response: { 200: cursorPage(auditEntrySchema) },
      },
    },
    (req) => audit.list(actorFor(req), req.query),
  );
  app.get(
    '/audit-log/facets',
    {
      preHandler: requirePermission('audit.view'),
      schema: { tags: ['audit'], response: { 200: auditFacetsSchema } },
    },
    (req) => audit.facets(actorFor(req)),
  );
};
