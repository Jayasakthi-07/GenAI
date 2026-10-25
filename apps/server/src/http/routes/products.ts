import {
  auditEntrySchema,
  auditQuerySchema,
  bulkResultSchema,
  cursorPage,
  importPreviewSchema,
  importRequestSchema,
  importResultSchema,
  movementSchema,
  movementsQuerySchema,
  paginated,
  productBulkSchema,
  productDetailSchema,
  productInputSchema,
  productListItemSchema,
  productListQuerySchema,
  productStockSchema,
  RISK_LEVELS,
} from '@stockroom/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Services } from '../../services';
import { actorFor, requirePermission } from '../plugins/auth';
import { idParams } from './catalog';

const view = requirePermission('inventory.view');
const nullableInt = z.number().int().min(0).nullable();

const productSupplierSchema = z.object({
  id: z.uuid(),
  supplier: z.object({ id: z.uuid(), name: z.string(), code: z.string() }),
  supplierScore: z.number().nullable(),
  riskLevel: z.enum(RISK_LEVELS).nullable(),
  supplierActive: z.boolean(),
  supplierSku: z.string().nullable(),
  unitCost: z.string(),
  moq: z.number().int(),
  packSize: z.number().int(),
  leadTimeDays: z.number().int(),
  isActive: z.boolean(),
  isPreferred: z.boolean(),
  lastPurchaseCost: z.string().nullable(),
  lastPurchasedAt: z.string().nullable(),
});

export const productRoutes: FastifyPluginAsyncZod<{ services: Services }> = async (app, { services }) => {
  const { products } = services;

  app.get(
    '/products',
    {
      preHandler: view,
      schema: {
        tags: ['products'],
        summary: 'Search, filter and sort products',
        querystring: productListQuerySchema,
        response: { 200: paginated(productListItemSchema) },
      },
    },
    (req) => products.list(req.query),
  );

  app.get(
    '/products/export',
    {
      preHandler: view,
      schema: {
        tags: ['products'],
        summary: 'Download the (filtered) product list as CSV or Excel',
        querystring: productListQuerySchema.extend({ format: z.enum(['csv', 'xlsx']).default('csv') }),
      },
    },
    async (req, reply) => {
      const { format, ...q } = req.query;
      const file = await products.export(q, format);
      return reply
        .header('Content-Type', file.contentType)
        .header('Content-Disposition', `attachment; filename="${file.filename}"`)
        .send(file.body);
    },
  );

  app.post(
    '/products/import/preview',
    {
      preHandler: requirePermission('catalog.manage'),
      schema: {
        tags: ['products'],
        summary: 'Validate a CSV without importing',
        body: importRequestSchema,
        response: { 200: importPreviewSchema },
      },
    },
    (req) => products.previewImport(req.body.csv, req.body.updateExisting),
  );
  app.post(
    '/products/import/commit',
    {
      preHandler: requirePermission('catalog.manage'),
      schema: {
        tags: ['products'],
        summary: 'Import the valid rows of a CSV',
        body: importRequestSchema,
        response: { 200: importResultSchema },
      },
    },
    (req) => products.commitImport(actorFor(req), req.body.csv, req.body.updateExisting),
  );

  app.post(
    '/products/bulk',
    {
      preHandler: requirePermission('catalog.manage'),
      schema: {
        tags: ['products'],
        summary: 'Bulk status, category or tag changes',
        body: productBulkSchema,
        response: { 200: bulkResultSchema },
      },
    },
    async (req) => ({ updated: await products.bulk(actorFor(req), req.body) }),
  );

  app.post(
    '/products',
    {
      preHandler: view,
      schema: { tags: ['products'], body: productInputSchema, response: { 200: productDetailSchema } },
    },
    (req) => products.create(actorFor(req), req.body),
  );
  app.get(
    '/products/:id',
    {
      preHandler: view,
      schema: { tags: ['products'], params: idParams, response: { 200: productDetailSchema } },
    },
    (req) => products.get(req.params.id),
  );
  app.patch(
    '/products/:id',
    {
      preHandler: view,
      schema: {
        tags: ['products'],
        params: idParams,
        body: productInputSchema,
        response: { 200: productDetailSchema },
      },
    },
    (req) => products.update(actorFor(req), req.params.id, req.body),
  );

  app.put(
    '/products/:id/image',
    {
      preHandler: view,
      bodyLimit: 3 * 1024 * 1024,
      schema: {
        tags: ['products'],
        summary: 'Upload an image as a data URL (PNG, JPEG or WebP, up to 2 MB)',
        params: idParams,
        body: z.object({ dataUrl: z.string().max(3_000_000) }),
        response: { 200: productDetailSchema },
      },
    },
    (req) => products.setImage(actorFor(req), req.params.id, req.body.dataUrl),
  );
  app.delete(
    '/products/:id/image',
    {
      preHandler: view,
      schema: { tags: ['products'], params: idParams, response: { 200: productDetailSchema } },
    },
    (req) => products.removeImage(actorFor(req), req.params.id),
  );

  app.get(
    '/products/:id/stock',
    {
      preHandler: view,
      schema: { tags: ['products'], params: idParams, response: { 200: z.array(productStockSchema) } },
    },
    (req) => products.stock(req.params.id),
  );
  app.patch(
    '/products/:id/stock/:warehouseId',
    {
      preHandler: view,
      schema: {
        tags: ['products'],
        summary: 'Set the reorder point, safety stock and max stock at one warehouse',
        params: z.object({ id: z.uuid(), warehouseId: z.uuid() }),
        body: z.object({ reorderPoint: nullableInt, safetyStock: nullableInt, maxStock: nullableInt }),
        response: { 200: z.array(productStockSchema) },
      },
    },
    (req) => products.updateStockParams(actorFor(req), req.params.id, req.params.warehouseId, req.body),
  );
  app.get(
    '/products/:id/movements',
    {
      preHandler: view,
      schema: {
        tags: ['products'],
        params: idParams,
        querystring: movementsQuerySchema,
        response: { 200: cursorPage(movementSchema) },
      },
    },
    (req) => services.inventory.movements({ ...req.query, productId: req.params.id }),
  );
  app.get(
    '/products/:id/sales',
    {
      preHandler: view,
      schema: {
        tags: ['products'],
        params: idParams,
        querystring: z.object({ days: z.coerce.number().int().min(7).max(730).default(90) }),
        response: {
          200: z.array(z.object({ date: z.string(), quantity: z.number().int(), revenue: z.number() })),
        },
      },
    },
    (req) => products.sales(req.params.id, req.query.days),
  );
  app.get(
    '/products/:id/suppliers',
    {
      preHandler: view,
      schema: { tags: ['products'], params: idParams, response: { 200: z.array(productSupplierSchema) } },
    },
    (req) => products.suppliers(req.params.id),
  );
  app.get(
    '/products/:id/activity',
    {
      preHandler: view,
      schema: {
        tags: ['products'],
        params: idParams,
        querystring: auditQuerySchema,
        response: { 200: cursorPage(auditEntrySchema) },
      },
    },
    (req) =>
      services.audit.list(actorFor(req), req.query, { entityType: 'Product', entityId: req.params.id }),
  );
};
