import {
  cancelInputSchema,
  customerInputSchema,
  customerSchema,
  customersQuerySchema,
  paginated,
  soDetailSchema,
  soFulfillSchema,
  soInputSchema,
  soListItemSchema,
  soListQuerySchema,
} from '@stockroom/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { Services } from '../../services';
import { actorFor, requirePermission } from '../plugins/auth';
import { idParams } from './catalog';

const view = requirePermission('inventory.view');
const createSo = requirePermission('sales_orders.create');
const manageCustomers = requirePermission('customers.manage');

export const salesRoutes: FastifyPluginAsyncZod<{ services: Services }> = async (app, { services }) => {
  const { sales } = services;

  /* Customers */
  app.get(
    '/customers',
    {
      preHandler: view,
      schema: {
        tags: ['sales'],
        querystring: customersQuerySchema,
        response: { 200: paginated(customerSchema) },
      },
    },
    (req) => sales.customers(req.query),
  );
  app.post(
    '/customers',
    {
      preHandler: manageCustomers,
      schema: { tags: ['sales'], body: customerInputSchema, response: { 200: customerSchema } },
    },
    (req) => sales.saveCustomer(actorFor(req), req.body),
  );
  app.patch(
    '/customers/:id',
    {
      preHandler: manageCustomers,
      schema: {
        tags: ['sales'],
        params: idParams,
        body: customerInputSchema,
        response: { 200: customerSchema },
      },
    },
    (req) => sales.saveCustomer(actorFor(req), req.body, req.params.id),
  );

  /* Sales orders */
  app.get(
    '/sales-orders',
    {
      preHandler: view,
      schema: {
        tags: ['sales'],
        querystring: soListQuerySchema,
        response: { 200: paginated(soListItemSchema) },
      },
    },
    (req) => sales.list(req.query),
  );
  app.post(
    '/sales-orders',
    {
      preHandler: createSo,
      schema: {
        tags: ['sales'],
        summary: 'Create a draft (optionally confirm it, reserving stock)',
        body: soInputSchema,
        response: { 200: soDetailSchema },
      },
    },
    (req) => sales.create(actorFor(req), req.body),
  );
  app.get(
    '/sales-orders/:id',
    { preHandler: view, schema: { tags: ['sales'], params: idParams, response: { 200: soDetailSchema } } },
    (req) => sales.get(actorFor(req), req.params.id),
  );
  app.patch(
    '/sales-orders/:id',
    {
      preHandler: createSo,
      schema: {
        tags: ['sales'],
        summary: 'Edit a draft',
        params: idParams,
        body: soInputSchema,
        response: { 200: soDetailSchema },
      },
    },
    (req) => sales.update(actorFor(req), req.params.id, req.body),
  );
  app.post(
    '/sales-orders/:id/confirm',
    {
      preHandler: createSo,
      schema: {
        tags: ['sales'],
        summary: 'Confirm and reserve stock',
        params: idParams,
        response: { 200: soDetailSchema },
      },
    },
    (req) => sales.confirm(actorFor(req), req.params.id),
  );
  app.post(
    '/sales-orders/:id/fulfill',
    {
      preHandler: requirePermission('stock.operate'),
      schema: {
        tags: ['sales'],
        summary: 'Ship all or part of the order',
        params: idParams,
        body: soFulfillSchema,
        response: { 200: soDetailSchema },
      },
    },
    (req) => sales.fulfill(actorFor(req), req.params.id, req.body),
  );
  app.post(
    '/sales-orders/:id/cancel',
    {
      preHandler: createSo,
      schema: {
        tags: ['sales'],
        summary: 'Cancel and release reserved stock',
        params: idParams,
        body: cancelInputSchema,
        response: { 200: soDetailSchema },
      },
    },
    (req) => sales.cancel(actorFor(req), req.params.id, req.body.reason),
  );
};
