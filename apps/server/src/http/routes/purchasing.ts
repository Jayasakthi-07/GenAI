import {
  paginated,
  poDetailSchema,
  poInputSchema,
  poListItemSchema,
  poListQuerySchema,
  poReasonSchema,
  poReceiveSchema,
  supplierDetailSchema,
  supplierInputSchema,
  supplierListItemSchema,
  supplierProductInputSchema,
  supplierProductSchema,
  supplierScorecardSchema,
  suppliersQuerySchema,
} from '@stockroom/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { renderPurchaseOrderPdf } from '../../reports/pdf/purchase-order';
import type { Services } from '../../services';
import { actorFor, requirePermission } from '../plugins/auth';
import { idParams } from './catalog';

const view = requirePermission('inventory.view');
const manageSuppliers = requirePermission('suppliers.manage');
const createPo = requirePermission('purchase_orders.create');
const approvePo = requirePermission('purchase_orders.approve');
const linkParams = z.object({ id: z.uuid(), linkId: z.uuid() });

export const purchasingRoutes: FastifyPluginAsyncZod<{ services: Services }> = async (app, { services }) => {
  const { suppliers, purchaseOrders: pos } = services;

  /* Suppliers */
  app.get(
    '/suppliers',
    {
      preHandler: view,
      schema: {
        tags: ['suppliers'],
        summary: 'Suppliers with live scores',
        querystring: suppliersQuerySchema,
        response: { 200: paginated(supplierListItemSchema) },
      },
    },
    (req) => suppliers.list(req.query),
  );
  app.post(
    '/suppliers',
    {
      preHandler: manageSuppliers,
      schema: { tags: ['suppliers'], body: supplierInputSchema, response: { 200: supplierDetailSchema } },
    },
    (req) => suppliers.save(actorFor(req), req.body),
  );
  app.get(
    '/suppliers/:id',
    {
      preHandler: view,
      schema: { tags: ['suppliers'], params: idParams, response: { 200: supplierDetailSchema } },
    },
    (req) => suppliers.get(req.params.id),
  );
  app.patch(
    '/suppliers/:id',
    {
      preHandler: manageSuppliers,
      schema: {
        tags: ['suppliers'],
        params: idParams,
        body: supplierInputSchema,
        response: { 200: supplierDetailSchema },
      },
    },
    (req) => suppliers.save(actorFor(req), req.body, req.params.id),
  );
  app.get(
    '/suppliers/:id/catalog',
    {
      preHandler: view,
      schema: {
        tags: ['suppliers'],
        summary: 'Products this supplier sells, with terms',
        params: idParams,
        response: { 200: z.array(supplierProductSchema) },
      },
    },
    (req) => suppliers.catalog(req.params.id),
  );
  app.post(
    '/suppliers/:id/catalog',
    {
      preHandler: manageSuppliers,
      schema: {
        tags: ['suppliers'],
        params: idParams,
        body: supplierProductInputSchema,
        response: { 200: z.array(supplierProductSchema) },
      },
    },
    (req) => suppliers.saveCatalogItem(actorFor(req), req.params.id, req.body),
  );
  app.patch(
    '/suppliers/:id/catalog/:linkId',
    {
      preHandler: manageSuppliers,
      schema: {
        tags: ['suppliers'],
        params: linkParams,
        body: supplierProductInputSchema,
        response: { 200: z.array(supplierProductSchema) },
      },
    },
    (req) => suppliers.saveCatalogItem(actorFor(req), req.params.id, req.body, req.params.linkId),
  );
  app.delete(
    '/suppliers/:id/catalog/:linkId',
    {
      preHandler: manageSuppliers,
      schema: { tags: ['suppliers'], params: linkParams, response: { 200: z.array(supplierProductSchema) } },
    },
    (req) => suppliers.removeCatalogItem(actorFor(req), req.params.id, req.params.linkId),
  );
  app.get(
    '/suppliers/:id/scorecard',
    {
      preHandler: view,
      schema: {
        tags: ['suppliers'],
        summary: 'Deterministic score, its breakdown and history',
        params: idParams,
        response: { 200: supplierScorecardSchema },
      },
    },
    (req) => suppliers.scorecard(req.params.id),
  );

  /* Purchase orders */
  app.get(
    '/purchase-orders',
    {
      preHandler: view,
      schema: {
        tags: ['purchase orders'],
        querystring: poListQuerySchema,
        response: { 200: paginated(poListItemSchema) },
      },
    },
    (req) => pos.list(req.query),
  );
  app.post(
    '/purchase-orders',
    {
      preHandler: createPo,
      schema: {
        tags: ['purchase orders'],
        summary: 'Create a draft (optionally submit it)',
        body: poInputSchema,
        response: { 200: poDetailSchema },
      },
    },
    (req) => pos.create(actorFor(req), req.body),
  );
  app.get(
    '/purchase-orders/:id',
    {
      preHandler: view,
      schema: { tags: ['purchase orders'], params: idParams, response: { 200: poDetailSchema } },
    },
    (req) => pos.get(actorFor(req), req.params.id),
  );
  app.patch(
    '/purchase-orders/:id',
    {
      preHandler: createPo,
      schema: {
        tags: ['purchase orders'],
        summary: 'Edit a draft',
        params: idParams,
        body: poInputSchema,
        response: { 200: poDetailSchema },
      },
    },
    (req) => pos.update(actorFor(req), req.params.id, req.body),
  );
  app.post(
    '/purchase-orders/:id/submit',
    {
      preHandler: createPo,
      schema: { tags: ['purchase orders'], params: idParams, response: { 200: poDetailSchema } },
    },
    (req) => pos.submit(actorFor(req), req.params.id),
  );
  app.post(
    '/purchase-orders/:id/approve',
    {
      preHandler: approvePo,
      schema: { tags: ['purchase orders'], params: idParams, response: { 200: poDetailSchema } },
    },
    (req) => pos.approve(actorFor(req), req.params.id),
  );
  app.post(
    '/purchase-orders/:id/reject',
    {
      preHandler: approvePo,
      schema: {
        tags: ['purchase orders'],
        summary: 'Return to draft with a reason',
        params: idParams,
        body: poReasonSchema,
        response: { 200: poDetailSchema },
      },
    },
    (req) => pos.reject(actorFor(req), req.params.id, req.body.reason),
  );
  app.post(
    '/purchase-orders/:id/send',
    {
      preHandler: createPo,
      schema: {
        tags: ['purchase orders'],
        summary: 'Mark as sent to the supplier',
        params: idParams,
        response: { 200: poDetailSchema },
      },
    },
    (req) => pos.send(actorFor(req), req.params.id),
  );
  app.post(
    '/purchase-orders/:id/cancel',
    {
      preHandler: createPo,
      schema: {
        tags: ['purchase orders'],
        params: idParams,
        body: poReasonSchema,
        response: { 200: poDetailSchema },
      },
    },
    (req) => pos.cancel(actorFor(req), req.params.id, req.body.reason),
  );
  app.post(
    '/purchase-orders/:id/close',
    {
      preHandler: createPo,
      schema: {
        tags: ['purchase orders'],
        summary: 'Close, including short-closing a partial receipt',
        params: idParams,
        body: z.object({ reason: z.string().trim().max(300).optional().nullable() }),
        response: { 200: poDetailSchema },
      },
    },
    (req) => pos.close(actorFor(req), req.params.id, req.body.reason),
  );
  app.post(
    '/purchase-orders/:id/receipts',
    {
      preHandler: requirePermission('stock.operate'),
      schema: {
        tags: ['purchase orders'],
        summary: 'Receive goods (partial receipts allowed)',
        params: idParams,
        body: poReceiveSchema,
        response: { 200: poDetailSchema },
      },
    },
    (req) => pos.receive(actorFor(req), req.params.id, req.body),
  );
  app.get(
    '/purchase-orders/:id/pdf',
    {
      preHandler: view,
      schema: {
        tags: ['purchase orders'],
        summary: 'Printable PDF',
        params: idParams,
        querystring: z.object({ download: z.enum(['0', '1']).default('0') }),
      },
    },
    async (req, reply) => {
      const data = await pos.forPdf(req.params.id);
      const pdf = await renderPurchaseOrderPdf(data);
      const disposition = req.query.download === '1' ? 'attachment' : 'inline';
      return reply
        .header('Content-Type', 'application/pdf')
        .header('Content-Disposition', `${disposition}; filename="${data.po.number}.pdf"`)
        .send(pdf);
    },
  );
};
