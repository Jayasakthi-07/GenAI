import {
  okSchema,
  organizationSchema,
  organizationUpdateSchema,
  resetPasswordSchema,
  searchQuerySchema,
  searchResultSchema,
  userCreateSchema,
  userListItemSchema,
  userUpdateSchema,
} from '@stockroom/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Services } from '../../services';
import { actorFor, requirePermission } from '../plugins/auth';
import { idParams } from './catalog';

const manageUsers = requirePermission('users.manage');

export const settingsRoutes: FastifyPluginAsyncZod<{ services: Services }> = async (app, { services }) => {
  app.get(
    '/search',
    {
      preHandler: requirePermission('inventory.view'),
      schema: {
        tags: ['search'],
        summary: 'Find products, suppliers, customers and documents',
        querystring: searchQuerySchema,
        response: { 200: z.array(searchResultSchema) },
      },
    },
    (req) => services.search.search(actorFor(req), req.query.q),
  );

  app.get(
    '/settings/organization',
    {
      preHandler: requirePermission('inventory.view'),
      schema: { tags: ['settings'], response: { 200: organizationSchema } },
    },
    (req) => services.settings.organization(actorFor(req)),
  );
  app.patch(
    '/settings/organization',
    {
      preHandler: requirePermission('organization.manage'),
      schema: {
        tags: ['settings'],
        summary: 'Organization profile and operational settings',
        body: organizationUpdateSchema,
        response: { 200: organizationSchema },
      },
    },
    (req) => services.settings.updateOrganization(actorFor(req), req.body),
  );

  app.get(
    '/users',
    { preHandler: manageUsers, schema: { tags: ['users'], response: { 200: z.array(userListItemSchema) } } },
    (req) => services.users.list(actorFor(req)),
  );
  app.post(
    '/users',
    {
      preHandler: manageUsers,
      schema: { tags: ['users'], body: userCreateSchema, response: { 200: userListItemSchema } },
    },
    (req) => services.users.create(actorFor(req), req.body),
  );
  app.patch(
    '/users/:id',
    {
      preHandler: manageUsers,
      schema: {
        tags: ['users'],
        params: idParams,
        body: userUpdateSchema,
        response: { 200: userListItemSchema },
      },
    },
    (req) => services.users.update(actorFor(req), req.params.id, req.body),
  );
  app.post(
    '/users/:id/reset-password',
    {
      preHandler: manageUsers,
      schema: {
        tags: ['users'],
        summary: 'Set a temporary password and sign the user out',
        params: idParams,
        body: resetPasswordSchema,
        response: { 200: okSchema },
      },
    },
    async (req) => {
      await services.users.resetPassword(actorFor(req), req.params.id, req.body.password);
      return { ok: true as const };
    },
  );
};
