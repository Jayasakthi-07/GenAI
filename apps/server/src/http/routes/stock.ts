import {
  adjustInputSchema,
  batchesQuerySchema,
  batchSchema,
  cursorPage,
  fefoQuerySchema,
  fefoResultSchema,
  issueInputSchema,
  movementSchema,
  movementsQuerySchema,
  paginated,
  receiveInputSchema,
  stockOperationResultSchema,
  stockPositionSchema,
  stockPositionsQuerySchema,
  stockSummarySchema,
  writeOffInputSchema,
} from '@stockroom/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Services } from '../../services';
import { actorFor, requirePermission } from '../plugins/auth';

const view = requirePermission('inventory.view');
const operate = requirePermission('stock.operate');

export const stockRoutes: FastifyPluginAsyncZod<{ services: Services }> = async (app, { services }) => {
  const { inventory } = services;
  const result = async (ids: Promise<string[]>) => ({ movements: await inventory.movementsByIds(await ids) });

  app.get(
    '/stock/positions',
    {
      preHandler: view,
      schema: {
        tags: ['stock'],
        summary: 'Stock position per product and warehouse',
        querystring: stockPositionsQuerySchema,
        response: { 200: paginated(stockPositionSchema) },
      },
    },
    (req) => inventory.positions(req.query),
  );
  app.get(
    '/stock/summary',
    {
      preHandler: view,
      schema: {
        tags: ['stock'],
        querystring: z.object({ warehouseId: z.uuid().optional() }),
        response: { 200: stockSummarySchema },
      },
    },
    (req) => inventory.summary(req.query.warehouseId),
  );
  app.get(
    '/stock/movements',
    {
      preHandler: view,
      schema: {
        tags: ['stock'],
        summary: 'The stock ledger (newest first, cursor paging)',
        querystring: movementsQuerySchema,
        response: { 200: cursorPage(movementSchema) },
      },
    },
    (req) => inventory.movements(req.query),
  );
  app.get(
    '/stock/batches',
    {
      preHandler: view,
      schema: {
        tags: ['stock'],
        summary: 'Batches with expiry status',
        querystring: batchesQuerySchema,
        response: { 200: paginated(batchSchema) },
      },
    },
    (req) => inventory.batches(req.query),
  );
  app.get(
    '/stock/fefo',
    {
      preHandler: view,
      schema: {
        tags: ['stock'],
        summary: 'Which batches a pick of this size would use (first expiry, first out)',
        querystring: fefoQuerySchema,
        response: { 200: fefoResultSchema },
      },
    },
    (req) => inventory.fefo(req.query.productId, req.query.warehouseId, Number(req.query.quantity)),
  );

  app.post(
    '/stock/receive',
    {
      preHandler: operate,
      schema: {
        tags: ['stock'],
        summary: 'Receive stock without a purchase order',
        body: receiveInputSchema,
        response: { 200: stockOperationResultSchema },
      },
    },
    (req) => result(inventory.receive(actorFor(req), req.body)),
  );
  app.post(
    '/stock/issue',
    {
      preHandler: operate,
      schema: {
        tags: ['stock'],
        summary: 'Issue stock for internal use, samples and similar',
        body: issueInputSchema,
        response: { 200: stockOperationResultSchema },
      },
    },
    (req) => result(inventory.issue(actorFor(req), req.body)),
  );
  app.post(
    '/stock/adjust',
    {
      preHandler: operate,
      schema: {
        tags: ['stock'],
        summary: 'Correct a balance with a reason',
        body: adjustInputSchema,
        response: { 200: stockOperationResultSchema },
      },
    },
    (req) => result(inventory.adjust(actorFor(req), req.body)),
  );
  app.post(
    '/stock/write-off',
    {
      preHandler: requirePermission('stock.write_off'),
      schema: {
        tags: ['stock'],
        summary: 'Write off damaged or expired stock',
        body: writeOffInputSchema,
        response: { 200: stockOperationResultSchema },
      },
    },
    (req) => result(inventory.writeOff(actorFor(req), req.body)),
  );
};
