import {
  AGENT_KEYS,
  actionApproveSchema,
  actionCountsSchema,
  actionRejectSchema,
  actionSchema,
  actionsQuerySchema,
  agentGraphSchema,
  agentRunDetailSchema,
  agentRunSchema,
  agentSchema,
  agentUpdateSchema,
  paginated,
  runAgentSchema,
  runsQuerySchema,
} from '@stockroom/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { AgentOrchestrator } from '../../agents/orchestrator';
import type { Services } from '../../services';
import { actorFor, requirePermission } from '../plugins/auth';
import { idParams } from './catalog';

const view = requirePermission('inventory.view');
const keyParams = z.object({ key: z.enum(AGENT_KEYS) });

export const agentRoutes: FastifyPluginAsyncZod<{
  services: Services;
  orchestrator: AgentOrchestrator;
}> = async (app, { services, orchestrator }) => {
  const { agents, actions } = services;

  /* ── Agents ─────────────────────────────────────────────────────────── */
  app.get(
    '/agents',
    { preHandler: view, schema: { tags: ['agents'], response: { 200: z.array(agentSchema) } } },
    (req) => agents.list(actorFor(req)),
  );
  app.get(
    '/agents/graph',
    {
      preHandler: view,
      schema: {
        tags: ['agents'],
        summary: 'Agents and their hand-offs',
        response: { 200: agentGraphSchema },
      },
    },
    () => agents.graph(),
  );
  app.get(
    '/agents/:key',
    { preHandler: view, schema: { tags: ['agents'], params: keyParams, response: { 200: agentSchema } } },
    (req) => agents.get(actorFor(req), req.params.key),
  );
  app.patch(
    '/agents/:key',
    {
      preHandler: requirePermission('agents.configure'),
      schema: {
        tags: ['agents'],
        summary: 'Enable or disable, and edit prompt, schedule, autonomy, model and limits',
        params: keyParams,
        body: agentUpdateSchema,
        response: { 200: agentSchema },
      },
    },
    (req) => agents.update(actorFor(req), req.params.key, req.body),
  );
  app.post(
    '/agents/:key/run',
    {
      preHandler: requirePermission('agents.run'),
      schema: {
        tags: ['agents'],
        summary: 'Run now (returns the queued run; an already-waiting run is reused)',
        params: keyParams,
        body: runAgentSchema,
        response: { 202: z.object({ runId: z.uuid(), deduped: z.boolean() }) },
      },
    },
    async (req, reply) => {
      const user = req.user;
      const r = await orchestrator.enqueue(req.params.key, 'MANUAL', {
        userId: user?.id ?? null,
        userName: user?.name ?? null,
        note: req.body.note ?? null,
        model: req.body.model ?? null,
      });
      return reply.code(202).send(r);
    },
  );

  /* ── Runs ───────────────────────────────────────────────────────────── */
  app.get(
    '/agent-runs',
    {
      preHandler: view,
      schema: {
        tags: ['agents'],
        querystring: runsQuerySchema,
        response: { 200: paginated(agentRunSchema) },
      },
    },
    (req) => agents.runs(req.query),
  );
  app.get(
    '/agent-runs/:id',
    {
      preHandler: view,
      schema: { tags: ['agents'], params: idParams, response: { 200: agentRunDetailSchema } },
    },
    (req) => agents.run(req.params.id),
  );
  app.post(
    '/agent-runs/:id/cancel',
    {
      preHandler: requirePermission('agents.run'),
      schema: { tags: ['agents'], params: idParams, response: { 200: z.object({ cancelled: z.boolean() }) } },
    },
    async (req) => ({ cancelled: await orchestrator.cancel(req.params.id) }),
  );

  /* ── Proposals ──────────────────────────────────────────────────────── */
  app.get(
    '/actions',
    {
      preHandler: view,
      schema: {
        tags: ['approvals'],
        querystring: actionsQuerySchema,
        response: { 200: paginated(actionSchema) },
      },
    },
    (req) => actions.list(req.query),
  );
  app.get(
    '/actions/counts',
    { preHandler: view, schema: { tags: ['approvals'], response: { 200: actionCountsSchema } } },
    () => actions.counts(),
  );
  app.get(
    '/actions/:id',
    { preHandler: view, schema: { tags: ['approvals'], params: idParams, response: { 200: actionSchema } } },
    (req) => actions.get(req.params.id),
  );
  app.post(
    '/actions/:id/approve',
    {
      preHandler: requirePermission('actions.approve'),
      schema: {
        tags: ['approvals'],
        summary: 'Approve (optionally with an edited payload) and execute',
        params: idParams,
        body: actionApproveSchema,
        response: { 200: actionSchema },
      },
    },
    (req) => actions.approve(actorFor(req), req.params.id, req.body),
  );
  app.post(
    '/actions/:id/reject',
    {
      preHandler: requirePermission('actions.approve'),
      schema: {
        tags: ['approvals'],
        summary: 'Reject with a reason (fed back to the agent)',
        params: idParams,
        body: actionRejectSchema,
        response: { 200: actionSchema },
      },
    },
    (req) => actions.reject(actorFor(req), req.params.id, req.body.reason),
  );
};
