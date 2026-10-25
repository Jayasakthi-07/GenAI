import {
  aiStatusSchema,
  connectionTestSchema,
  latencyTestSchema,
  modelListSchema,
  modelRefSchema,
  modelsQuerySchema,
  okSchema,
  ollamaStatusSchema,
  probeResultSchema,
  providerCreateSchema,
  providerSchema,
  providerUpdateSchema,
  routingSchema,
  usageSchema,
} from '@stockroom/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Services } from '../../services';
import { actorFor, requirePermission } from '../plugins/auth';

const admin = requirePermission('ai.configure');
const configure = requirePermission('agents.configure');
const view = requirePermission('inventory.view');
const keyParams = z.object({ key: z.string().min(1).max(60) });

export const aiRoutes: FastifyPluginAsyncZod<{ services: Services }> = async (app, { services }) => {
  const { ai } = services;

  app.get(
    '/ai/status',
    {
      preHandler: view,
      schema: {
        tags: ['ai'],
        summary: 'Active model and provider health (model chip)',
        response: { 200: aiStatusSchema },
      },
    },
    (req) => ai.status(actorFor(req)),
  );
  app.get(
    '/ai/providers',
    {
      preHandler: admin,
      schema: {
        tags: ['ai'],
        summary: 'Providers; keys are never returned (last 4 only)',
        response: { 200: z.array(providerSchema) },
      },
    },
    (req) => ai.providers(actorFor(req)),
  );
  app.post(
    '/ai/providers',
    {
      preHandler: admin,
      schema: {
        tags: ['ai'],
        summary: 'Add a custom OpenAI-compatible endpoint',
        body: providerCreateSchema,
        response: { 200: providerSchema },
      },
    },
    (req) => ai.createProvider(actorFor(req), req.body),
  );
  app.patch(
    '/ai/providers/:key',
    {
      preHandler: admin,
      schema: {
        tags: ['ai'],
        summary: 'Enable, set the key or base URL, change limits',
        params: keyParams,
        body: providerUpdateSchema,
        response: { 200: providerSchema },
      },
    },
    (req) => ai.updateProvider(actorFor(req), req.params.key, req.body),
  );
  app.delete(
    '/ai/providers/:key',
    { preHandler: admin, schema: { tags: ['ai'], params: keyParams, response: { 200: okSchema } } },
    async (req) => {
      await ai.deleteProvider(actorFor(req), req.params.key);
      return { ok: true as const };
    },
  );
  app.post(
    '/ai/providers/:key/test',
    {
      preHandler: admin,
      schema: {
        tags: ['ai'],
        summary: 'Connection test',
        params: keyParams,
        response: { 200: connectionTestSchema },
      },
    },
    (req) => ai.test(actorFor(req), req.params.key),
  );
  app.get(
    '/ai/ollama',
    {
      preHandler: admin,
      schema: {
        tags: ['ai'],
        summary: 'Live Ollama status: version, models, loaded models',
        response: { 200: ollamaStatusSchema },
      },
    },
    (req) => ai.ollama(actorFor(req)),
  );
  app.get(
    '/ai/models',
    {
      preHandler: view,
      schema: {
        tags: ['ai'],
        summary: 'Models across enabled providers (live, cached)',
        querystring: modelsQuerySchema,
        response: { 200: modelListSchema },
      },
    },
    (req) => ai.models(actorFor(req), req.query),
  );
  app.post(
    '/ai/models/probe',
    {
      preHandler: configure,
      schema: {
        tags: ['ai'],
        summary: 'Test whether a model can call tools',
        body: modelRefSchema,
        response: { 200: probeResultSchema },
      },
    },
    (req) => ai.probe(actorFor(req), req.body.providerKey, req.body.modelId),
  );
  app.post(
    '/ai/models/latency-test',
    {
      preHandler: configure,
      schema: {
        tags: ['ai'],
        summary: 'Time to first token and total time',
        body: modelRefSchema,
        response: { 200: latencyTestSchema },
      },
    },
    (req) => ai.latencyTest(actorFor(req), req.body.providerKey, req.body.modelId),
  );
  app.get(
    '/ai/routing',
    { preHandler: view, schema: { tags: ['ai'], response: { 200: routingSchema } } },
    (req) => ai.routing(actorFor(req)),
  );
  app.put(
    '/ai/routing',
    {
      preHandler: configure,
      schema: {
        tags: ['ai'],
        summary: 'Default model, fallbacks, prefer local, per-agent overrides',
        body: routingSchema,
        response: { 200: routingSchema },
      },
    },
    (req) => ai.saveRouting(actorFor(req), req.body),
  );
  app.get(
    '/ai/usage',
    {
      preHandler: configure,
      schema: {
        tags: ['ai'],
        querystring: z.object({ days: z.coerce.number().int().min(1).max(90).default(14) }),
        response: { 200: usageSchema },
      },
    },
    (req) => ai.usage(actorFor(req), req.query.days),
  );
};
