import {
  categoryInputSchema,
  categorySchema,
  okSchema,
  reasonCodeInputSchema,
  reasonCodeSchema,
  savedViewInputSchema,
  savedViewSchema,
  unitInputSchema,
  unitSchema,
  warehouseInputSchema,
  warehouseSchema,
} from '@stockroom/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Services } from '../../services';
import { actorFor, requireAuth, requirePermission } from '../plugins/auth';

export const idParams = z.object({ id: z.uuid() });
const view = requirePermission('inventory.view');

export const catalogRoutes: FastifyPluginAsyncZod<{ services: Services }> = async (app, { services }) => {
  const { catalog } = services;

  /* Units */
  app.get(
    '/units',
    {
      preHandler: view,
      schema: { tags: ['catalog'], summary: 'Units of measure', response: { 200: z.array(unitSchema) } },
    },
    () => catalog.units(),
  );
  app.post(
    '/units',
    { preHandler: view, schema: { tags: ['catalog'], body: unitInputSchema, response: { 200: unitSchema } } },
    (req) => catalog.saveUnit(actorFor(req), req.body),
  );
  app.patch(
    '/units/:id',
    {
      preHandler: view,
      schema: { tags: ['catalog'], params: idParams, body: unitInputSchema, response: { 200: unitSchema } },
    },
    (req) => catalog.saveUnit(actorFor(req), req.body, req.params.id),
  );
  app.delete(
    '/units/:id',
    { preHandler: view, schema: { tags: ['catalog'], params: idParams, response: { 200: okSchema } } },
    async (req) => {
      await catalog.deleteUnit(actorFor(req), req.params.id);
      return { ok: true as const };
    },
  );

  /* Categories */
  app.get(
    '/categories',
    {
      preHandler: view,
      schema: {
        tags: ['catalog'],
        summary: 'All categories (flat; build the tree from parentId)',
        response: { 200: z.array(categorySchema) },
      },
    },
    () => catalog.categories(),
  );
  app.post(
    '/categories',
    {
      preHandler: view,
      schema: { tags: ['catalog'], body: categoryInputSchema, response: { 200: categorySchema } },
    },
    (req) => catalog.saveCategory(actorFor(req), req.body),
  );
  app.patch(
    '/categories/:id',
    {
      preHandler: view,
      schema: {
        tags: ['catalog'],
        params: idParams,
        body: categoryInputSchema,
        response: { 200: categorySchema },
      },
    },
    (req) => catalog.saveCategory(actorFor(req), req.body, req.params.id),
  );
  app.delete(
    '/categories/:id',
    { preHandler: view, schema: { tags: ['catalog'], params: idParams, response: { 200: okSchema } } },
    async (req) => {
      await catalog.deleteCategory(actorFor(req), req.params.id);
      return { ok: true as const };
    },
  );

  /* Warehouses */
  app.get(
    '/warehouses',
    { preHandler: view, schema: { tags: ['catalog'], response: { 200: z.array(warehouseSchema) } } },
    () => catalog.warehouses(),
  );
  app.post(
    '/warehouses',
    {
      preHandler: view,
      schema: { tags: ['catalog'], body: warehouseInputSchema, response: { 200: warehouseSchema } },
    },
    (req) => catalog.saveWarehouse(actorFor(req), req.body),
  );
  app.patch(
    '/warehouses/:id',
    {
      preHandler: view,
      schema: {
        tags: ['catalog'],
        params: idParams,
        body: warehouseInputSchema,
        response: { 200: warehouseSchema },
      },
    },
    (req) => catalog.saveWarehouse(actorFor(req), req.body, req.params.id),
  );

  /* Reason codes */
  app.get(
    '/reason-codes',
    { preHandler: view, schema: { tags: ['catalog'], response: { 200: z.array(reasonCodeSchema) } } },
    () => catalog.reasonCodes(),
  );
  app.post(
    '/reason-codes',
    {
      preHandler: view,
      schema: { tags: ['catalog'], body: reasonCodeInputSchema, response: { 200: reasonCodeSchema } },
    },
    (req) => catalog.saveReasonCode(actorFor(req), req.body),
  );
  app.patch(
    '/reason-codes/:id',
    {
      preHandler: view,
      schema: {
        tags: ['catalog'],
        params: idParams,
        body: reasonCodeInputSchema,
        response: { 200: reasonCodeSchema },
      },
    },
    (req) => catalog.saveReasonCode(actorFor(req), req.body, req.params.id),
  );

  /* Saved views (per user) */
  app.get(
    '/saved-views',
    {
      preHandler: requireAuth,
      schema: {
        tags: ['catalog'],
        querystring: z.object({ page: z.string().max(40) }),
        response: { 200: z.array(savedViewSchema) },
      },
    },
    (req) => catalog.savedViews(actorFor(req), req.query.page),
  );
  app.post(
    '/saved-views',
    {
      preHandler: requireAuth,
      schema: { tags: ['catalog'], body: savedViewInputSchema, response: { 200: savedViewSchema } },
    },
    (req) => catalog.saveView(actorFor(req), req.body),
  );
  app.patch(
    '/saved-views/:id',
    {
      preHandler: requireAuth,
      schema: {
        tags: ['catalog'],
        params: idParams,
        body: savedViewInputSchema,
        response: { 200: savedViewSchema },
      },
    },
    (req) => catalog.saveView(actorFor(req), req.body, req.params.id),
  );
  app.delete(
    '/saved-views/:id',
    { preHandler: requireAuth, schema: { tags: ['catalog'], params: idParams, response: { 200: okSchema } } },
    async (req) => {
      await catalog.deleteView(actorFor(req), req.params.id);
      return { ok: true as const };
    },
  );
};
