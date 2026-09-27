import { type Permission, SESSION_COOKIE, type SessionUser } from '@stockroom/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { type Actor, assertCan } from '../../domain/actor';
import { AppError, unauthenticated } from '../../domain/errors';
import type { Services } from '../../services';

declare module 'fastify' {
  interface FastifyRequest {
    user: SessionUser | null;
    sessionId: string | null;
    sessionToken: string | null;
  }
}

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export interface AuthPluginOptions {
  services: Services;
  allowedOrigins: string[];
  secureCookies: boolean;
  sessionTtlHours: number;
}

export const authPlugin = fp(
  async (app: FastifyInstance, opts: AuthPluginOptions) => {
    app.decorateRequest('user', null);
    app.decorateRequest('sessionId', null);
    app.decorateRequest('sessionToken', null);

    // CSRF defence on top of SameSite cookies: browsers always send Origin on state-changing requests.
    app.addHook('onRequest', async (request) => {
      if (!MUTATING.has(request.method) || !request.url.startsWith('/api/')) return;
      const origin = request.headers.origin;
      if (origin && !opts.allowedOrigins.includes(origin)) {
        throw new AppError('FORBIDDEN', 'Request origin is not allowed.');
      }
    });

    app.addHook('onRequest', async (request) => {
      const raw = request.cookies[SESSION_COOKIE];
      if (!raw) return;
      const unsigned = request.unsignCookie(raw);
      if (!unsigned.valid || !unsigned.value) return;
      const session = await opts.services.auth.resolveSession(unsigned.value);
      if (!session) return;
      request.user = session.user;
      request.sessionId = session.sessionId;
      request.sessionToken = unsigned.value;
    });

    app.decorateReply('setSessionCookie', function (this: FastifyReply, token: string, expiresAt: Date) {
      void this.setCookie(SESSION_COOKIE, token, {
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
        secure: opts.secureCookies,
        signed: true,
        expires: expiresAt,
      });
    });

    app.decorateReply('clearSessionCookie', function (this: FastifyReply) {
      void this.clearCookie(SESSION_COOKIE, { path: '/' });
    });
  },
  { name: 'auth', dependencies: ['@fastify/cookie'] },
);

declare module 'fastify' {
  interface FastifyReply {
    setSessionCookie(token: string, expiresAt: Date): void;
    clearSessionCookie(): void;
  }
}

/** preHandler: rejects anonymous requests. */
export async function requireAuth(request: FastifyRequest): Promise<void> {
  if (!request.user) throw unauthenticated();
}

/** preHandler factory: rejects requests whose role lacks the permission. */
export function requirePermission(permission: Permission) {
  return async (request: FastifyRequest): Promise<void> => {
    if (!request.user) throw unauthenticated();
    assertCan(actorFor(request), permission);
  };
}

/** The Actor for the signed-in user of this request. */
export function actorFor(request: FastifyRequest): Actor {
  const user = request.user;
  if (!user) throw unauthenticated();
  return { type: 'user', userId: user.id, role: user.role, name: user.name, ip: request.ip };
}
