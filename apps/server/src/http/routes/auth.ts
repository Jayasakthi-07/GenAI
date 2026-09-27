import {
  changePasswordRequestSchema,
  loginRequestSchema,
  meResponseSchema,
  okSchema,
  sessionUserSchema,
} from '@stockroom/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { unauthenticated } from '../../domain/errors';
import type { Services } from '../../services';
import { actorFor, requireAuth } from '../plugins/auth';

export const authRoutes: FastifyPluginAsyncZod<{ services: Services }> = async (app, { services }) => {
  app.post(
    '/auth/login',
    {
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
      schema: {
        tags: ['auth'],
        summary: 'Sign in with email and password',
        body: loginRequestSchema,
        response: { 200: z.object({ user: sessionUserSchema }) },
      },
    },
    async (request, reply) => {
      const { user, token, expiresAt } = await services.auth.login(
        request.body.email,
        request.body.password,
        {
          ip: request.ip,
          userAgent: request.headers['user-agent'],
        },
      );
      reply.setSessionCookie(token, expiresAt);
      return { user };
    },
  );

  app.post(
    '/auth/logout',
    { schema: { tags: ['auth'], summary: 'Sign out of this session', response: { 200: okSchema } } },
    async (request, reply) => {
      if (request.sessionToken && request.user) {
        await services.auth.logout(request.sessionToken, actorFor(request));
      }
      reply.clearSessionCookie();
      return { ok: true as const };
    },
  );

  app.get(
    '/auth/session',
    {
      schema: {
        tags: ['auth'],
        summary: 'The current session, or null when signed out (never 401)',
        response: { 200: meResponseSchema.nullable() },
      },
    },
    async (request) => (request.user ? services.auth.me(request.user) : null),
  );

  app.get(
    '/auth/me',
    {
      preHandler: requireAuth,
      schema: {
        tags: ['auth'],
        summary: 'Current user, permissions and organization',
        response: { 200: meResponseSchema },
      },
    },
    async (request) => {
      if (!request.user) throw unauthenticated();
      return services.auth.me(request.user);
    },
  );

  app.post(
    '/auth/change-password',
    {
      preHandler: requireAuth,
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
      schema: {
        tags: ['auth'],
        summary: 'Change your password (signs out your other sessions)',
        body: changePasswordRequestSchema,
        response: { 200: okSchema },
      },
    },
    async (request) => {
      await services.auth.changePassword(actorFor(request), request.sessionId ?? '', request.body);
      return { ok: true as const };
    },
  );
};
