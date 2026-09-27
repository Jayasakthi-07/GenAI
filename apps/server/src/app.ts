import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import fastifyCookie from '@fastify/cookie';
import fastifyCors from '@fastify/cors';
import fastifyHelmet from '@fastify/helmet';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import { API_PREFIX, APP_NAME, APP_TITLE, APP_VERSION } from '@stockroom/shared';
import Fastify, { type FastifyServerOptions, LogController } from 'fastify';
import {
  jsonSchemaTransform,
  jsonSchemaTransformObject,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { type Env, findRepoRoot } from './config/env';
import type { Db } from './db/client';
import { EventBus } from './domain/events';
import { authPlugin } from './http/plugins/auth';
import { errorsPlugin } from './http/plugins/errors';
import { authRoutes } from './http/routes/auth';
import { dashboardRoutes, meRoutes } from './http/routes/dashboard';
import { systemRoutes } from './http/routes/system';
import { createServices, type Services } from './services';

export interface BuildAppOptions {
  env: Env;
  prisma: Db;
  logger?: FastifyServerOptions['logger'];
  /** Serve the built SPA from apps/web/dist (production). */
  serveWeb?: boolean;
}

export async function buildApp({ env, prisma, logger = false, serveWeb = false }: BuildAppOptions) {
  const app = Fastify({
    logger,
    // One concise line per request is logged in onResponse below instead of Fastify's two.
    logController: new LogController({ disableRequestLogging: true }),
    bodyLimit: 10 * 1024 * 1024,
    routerOptions: { ignoreTrailingSlash: true },
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  const bus = new EventBus();
  const services: Services = createServices({ prisma, bus, env });
  app.decorate('services', services);
  app.decorate('bus', bus);

  // One concise line per API request instead of Fastify's two verbose ones.
  app.addHook('onResponse', async (request, reply) => {
    if (!request.url.startsWith('/api/') || request.url.startsWith('/api/docs')) return;
    request.log.info(
      {
        method: request.method,
        url: request.url,
        status: reply.statusCode,
        ms: Math.round(reply.elapsedTime),
      },
      'request',
    );
  });

  await app.register(errorsPlugin, { databaseUrl: env.DATABASE_URL, spaFallback: serveWeb });
  await app.register(fastifyHelmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        // Radix, Sonner and Recharts inject small <style> elements.
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        fontSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        upgradeInsecureRequests: null,
      },
    },
    // Local HTTP only; HSTS would break http://127.0.0.1 in some browsers.
    strictTransportSecurity: false,
    crossOriginEmbedderPolicy: false,
  });
  await app.register(fastifyCors, { origin: env.allowedOrigins, credentials: true });
  await app.register(fastifyCookie, { secret: env.COOKIE_SECRET });
  await app.register(fastifyRateLimit, { global: false });
  await app.register(authPlugin, {
    services,
    allowedOrigins: env.allowedOrigins,
    secureCookies: false,
    sessionTtlHours: env.SESSION_TTL_HOURS,
  });

  await app.register(fastifySwagger, {
    openapi: {
      info: { title: `${APP_NAME} API`, description: APP_TITLE, version: APP_VERSION },
      servers: [{ url: '/' }],
      components: {
        securitySchemes: { session: { type: 'apiKey', in: 'cookie', name: 'sr_session' } },
      },
    },
    transform: jsonSchemaTransform,
    transformObject: jsonSchemaTransformObject,
  });
  await app.register(fastifySwaggerUi, {
    routePrefix: '/api/docs',
    uiConfig: { docExpansion: 'list', deepLinking: true, defaultModelsExpandDepth: 0 },
    staticCSP: true,
    transformStaticCSP: (header) => header,
  });

  await app.register(
    async (api) => {
      await api.register(systemRoutes, { prisma, demoMode: env.DEMO_MODE });
      await api.register(authRoutes, { services });
      await api.register(meRoutes, { services });
      await api.register(dashboardRoutes, { services });
    },
    { prefix: API_PREFIX },
  );

  if (serveWeb) {
    const webDist = resolve(findRepoRoot(), 'apps/web/dist');
    if (!existsSync(resolve(webDist, 'index.html'))) {
      throw new Error(`The web app isn't built (${webDist} is missing). Run \`pnpm build\` first.`);
    }
    // Unknown non-API GETs fall back to index.html (see the errors plugin).
    await app.register(fastifyStatic, { root: webDist, wildcard: false, index: 'index.html' });
  }

  return app;
}

declare module 'fastify' {
  interface FastifyInstance {
    services: Services;
    bus: EventBus;
  }
}

export type App = Awaited<ReturnType<typeof buildApp>>;
