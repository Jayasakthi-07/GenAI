import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import fastifyCookie from '@fastify/cookie';
import fastifyCors from '@fastify/cors';
import fastifyHelmet from '@fastify/helmet';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import { type AgentKey, API_PREFIX, APP_NAME, APP_TITLE, APP_VERSION } from '@stockroom/shared';
import Fastify, { type FastifyServerOptions, LogController } from 'fastify';
import {
  jsonSchemaTransform,
  jsonSchemaTransformObject,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { AGENT_MODULES } from './agents/definitions';
import { AgentOrchestrator } from './agents/orchestrator';
import { type Env, findRepoRoot } from './config/env';
import type { Db } from './db/client';
import { EventBus } from './domain/events';
import { authPlugin } from './http/plugins/auth';
import { errorsPlugin } from './http/plugins/errors';
import { agentRoutes } from './http/routes/agents';
import { aiRoutes } from './http/routes/ai';
import { assistantRoutes } from './http/routes/assistant';
import { alertRoutes } from './http/routes/alerts';
import { authRoutes } from './http/routes/auth';
import { catalogRoutes } from './http/routes/catalog';
import { dashboardRoutes, meRoutes } from './http/routes/dashboard';
import { eventRoutes } from './http/routes/events';
import { insightRoutes } from './http/routes/insights';
import { notificationRoutes } from './http/routes/notifications';
import { operationsRoutes } from './http/routes/operations';
import { productRoutes } from './http/routes/products';
import { reportRoutes } from './http/routes/reports';
import { purchasingRoutes } from './http/routes/purchasing';
import { salesRoutes } from './http/routes/sales';
import { settingsRoutes } from './http/routes/settings';
import { simulationRoutes } from './http/routes/simulation';
import { stockRoutes } from './http/routes/stock';
import { systemRoutes } from './http/routes/system';
import { createServices, type Services, uploadsDir } from './services';

export interface BuildAppOptions {
  env: Env;
  prisma: Db;
  logger?: FastifyServerOptions['logger'];
  /** Serve the built SPA from apps/web/dist (production). */
  serveWeb?: boolean;
  /** Start the agent scheduler (pg-boss). Off in tests unless a test needs it. */
  startAgents?: boolean;
}

export async function buildApp({
  env,
  prisma,
  logger = false,
  serveWeb = false,
  startAgents = false,
}: BuildAppOptions) {
  const app = Fastify({
    logger,
    // One concise line per request is logged in onResponse below instead of Fastify's two.
    logController: new LogController({ disableRequestLogging: true }),
    bodyLimit: 10 * 1024 * 1024,
    routerOptions: { ignoreTrailingSlash: true },
    // Event streams stay open; close them on shutdown instead of waiting.
    forceCloseConnections: true,
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  const bus = new EventBus();
  const services: Services = createServices({ prisma, bus, env });
  await services.ai.init();
  await services.agents.ensureDefinitions();
  const orchestrator = new AgentOrchestrator({
    env,
    bus,
    services,
    gateway: services.llm,
    log: app.log,
    modules: AGENT_MODULES,
  });
  app.decorate('services', services);
  app.decorate('bus', bus);
  app.decorate('orchestrator', orchestrator);

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
      await api.register(catalogRoutes, { services });
      await api.register(productRoutes, { services });
      await api.register(stockRoutes, { services });
      await api.register(operationsRoutes, { services });
      await api.register(purchasingRoutes, { services });
      await api.register(salesRoutes, { services });
      await api.register(alertRoutes, { services });
      await api.register(settingsRoutes, { services });
      await api.register(aiRoutes, { services });
      await api.register(agentRoutes, { services, orchestrator });
      await api.register(eventRoutes, { bus });
      await api.register(assistantRoutes, { services });
      await api.register(reportRoutes, { services });
      await api.register(insightRoutes, { services });
      await api.register(notificationRoutes, { services });
      await api.register(simulationRoutes, { services });
    },
    { prefix: API_PREFIX },
  );

  // Product images. Only files the product service wrote live here (random names, image types only).
  const uploads = uploadsDir();
  mkdirSync(uploads, { recursive: true });
  await app.register(fastifyStatic, {
    root: uploads,
    prefix: '/uploads/',
    decorateReply: false,
    index: false,
    dotfiles: 'deny',
    maxAge: '1h',
  });

  if (serveWeb) {
    const webDist = resolve(findRepoRoot(), 'apps/web/dist');
    if (!existsSync(resolve(webDist, 'index.html'))) {
      throw new Error(`The web app isn't built (${webDist} is missing). Run \`pnpm build\` first.`);
    }
    // Files are looked up per request, so a rebuild is served without a restart. Unknown page
    // URLs fall back to index.html (see the errors plugin); hashed assets are cached for good.
    await app.register(fastifyStatic, {
      root: webDist,
      wildcard: true,
      index: 'index.html',
      setHeaders: (reply, path) => {
        reply.header(
          'Cache-Control',
          /[\\/]assets[\\/]/.test(path) ? 'public, max-age=31536000, immutable' : 'no-cache',
        );
      },
    });
  }

  services.notifications.start((err) => app.log.error({ err }, 'Couldn’t deliver a notification'));
  app.addHook('onClose', () => services.notifications.stop());
  services.simulation.setLogger((err, message) => app.log.error({ err }, message));
  app.addHook('onClose', () => services.simulation.halt());

  if (startAgents) {
    // Agents replace the interim stock watcher: the Stock Sentinel runs at startup and on its triggers.
    await orchestrator.start({
      startupRuns: ['stock_sentinel', ...(await services.agents.missingOutputs())],
    });
    app.addHook('onClose', () => orchestrator.stop());
    services.ai.startHealthMonitor();
    app.addHook('onClose', async () => services.ai.stopHealthMonitor());
    services.simulation.setAgentRequester((key, reason) => orchestrator.request(key as AgentKey, reason));
    await services.simulation.resume();
    services.demo.onReset({
      before: () => orchestrator.stop(),
      after: async () =>
        orchestrator.start({
          startupRuns: ['stock_sentinel', ...(await services.agents.missingOutputs())],
          purgeQueued: true,
        }),
    });
  }

  return app;
}

declare module 'fastify' {
  interface FastifyInstance {
    services: Services;
    bus: EventBus;
    orchestrator: AgentOrchestrator;
  }
}

export type App = Awaited<ReturnType<typeof buildApp>>;
