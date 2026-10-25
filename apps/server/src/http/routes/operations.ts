import {
  cancelInputSchema,
  countApproveSchema,
  countLinesUpdateSchema,
  cycleCountDetailSchema,
  cycleCountInputSchema,
  cycleCountListItemSchema,
  cycleCountsQuerySchema,
  paginated,
  transferDetailSchema,
  transferInputSchema,
  transferListItemSchema,
  transfersQuerySchema,
} from '@stockroom/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { Services } from '../../services';
import { actorFor, requirePermission } from '../plugins/auth';
import { idParams } from './catalog';

const view = requirePermission('inventory.view');
const operate = requirePermission('stock.operate');

export const operationsRoutes: FastifyPluginAsyncZod<{ services: Services }> = async (app, { services }) => {
  const { transfers, cycleCounts } = services;

  /* Transfers */
  app.get(
    '/transfers',
    {
      preHandler: view,
      schema: {
        tags: ['transfers'],
        querystring: transfersQuerySchema,
        response: { 200: paginated(transferListItemSchema) },
      },
    },
    (req) => transfers.list(req.query),
  );
  app.post(
    '/transfers',
    {
      preHandler: operate,
      schema: {
        tags: ['transfers'],
        summary: 'Create a transfer (optionally ship it at once)',
        body: transferInputSchema,
        response: { 200: transferDetailSchema },
      },
    },
    (req) => transfers.create(actorFor(req), req.body),
  );
  app.get(
    '/transfers/:id',
    {
      preHandler: view,
      schema: { tags: ['transfers'], params: idParams, response: { 200: transferDetailSchema } },
    },
    (req) => transfers.get(req.params.id),
  );
  app.post(
    '/transfers/:id/ship',
    {
      preHandler: operate,
      schema: { tags: ['transfers'], params: idParams, response: { 200: transferDetailSchema } },
    },
    (req) => transfers.ship(actorFor(req), req.params.id),
  );
  app.post(
    '/transfers/:id/receive',
    {
      preHandler: operate,
      schema: { tags: ['transfers'], params: idParams, response: { 200: transferDetailSchema } },
    },
    (req) => transfers.receive(actorFor(req), req.params.id),
  );
  app.post(
    '/transfers/:id/cancel',
    {
      preHandler: operate,
      schema: {
        tags: ['transfers'],
        params: idParams,
        body: cancelInputSchema,
        response: { 200: transferDetailSchema },
      },
    },
    (req) => transfers.cancel(actorFor(req), req.params.id, req.body.reason),
  );

  /* Cycle counts */
  app.get(
    '/cycle-counts',
    {
      preHandler: view,
      schema: {
        tags: ['cycle counts'],
        querystring: cycleCountsQuerySchema,
        response: { 200: paginated(cycleCountListItemSchema) },
      },
    },
    (req) => cycleCounts.list(req.query),
  );
  app.post(
    '/cycle-counts',
    {
      preHandler: operate,
      schema: {
        tags: ['cycle counts'],
        summary: 'Start a count for chosen products or a category',
        body: cycleCountInputSchema,
        response: { 200: cycleCountDetailSchema },
      },
    },
    (req) => cycleCounts.create(actorFor(req), req.body),
  );
  app.get(
    '/cycle-counts/:id',
    {
      preHandler: view,
      schema: { tags: ['cycle counts'], params: idParams, response: { 200: cycleCountDetailSchema } },
    },
    (req) => cycleCounts.get(req.params.id),
  );
  app.patch(
    '/cycle-counts/:id/lines',
    {
      preHandler: operate,
      schema: {
        tags: ['cycle counts'],
        summary: 'Record counted quantities',
        params: idParams,
        body: countLinesUpdateSchema,
        response: { 200: cycleCountDetailSchema },
      },
    },
    (req) => cycleCounts.updateLines(actorFor(req), req.params.id, req.body),
  );
  app.post(
    '/cycle-counts/:id/submit',
    {
      preHandler: operate,
      schema: { tags: ['cycle counts'], params: idParams, response: { 200: cycleCountDetailSchema } },
    },
    (req) => cycleCounts.submit(actorFor(req), req.params.id),
  );
  app.post(
    '/cycle-counts/:id/approve',
    {
      preHandler: requirePermission('counts.approve'),
      schema: {
        tags: ['cycle counts'],
        summary: 'Post variances, or send chosen lines back for a recount',
        params: idParams,
        body: countApproveSchema,
        response: { 200: cycleCountDetailSchema },
      },
    },
    (req) => cycleCounts.approve(actorFor(req), req.params.id, req.body),
  );
  app.post(
    '/cycle-counts/:id/cancel',
    {
      preHandler: operate,
      schema: {
        tags: ['cycle counts'],
        params: idParams,
        body: cancelInputSchema,
        response: { 200: cycleCountDetailSchema },
      },
    },
    (req) => cycleCounts.cancel(actorFor(req), req.params.id, req.body.reason),
  );
};
