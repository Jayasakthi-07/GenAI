import {
  actionSchema,
  type ChatStreamEvent,
  chatMessageSchema,
  conversationDetailSchema,
  conversationSchema,
  renameConversationSchema,
  sendMessageSchema,
} from '@stockroom/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { chatTurn } from '../../agents/assistant/chat';
import type { Actor } from '../../domain/actor';
import { AppError } from '../../domain/errors';
import type { Services } from '../../services';
import { actorFor, requirePermission } from '../plugins/auth';
import { idParams } from './catalog';

const view = requirePermission('inventory.view');
const cardParams = z.object({ messageId: z.uuid(), cardId: z.uuid() });

export const assistantRoutes: FastifyPluginAsyncZod<{ services: Services }> = async (app, { services }) => {
  const { chat } = services;
  const userActor = (actor: Actor) => {
    if (actor.type !== 'user') throw new AppError('UNAUTHENTICATED', 'Please sign in to use the Assistant.');
    return actor;
  };

  app.get(
    '/assistant/conversations',
    { preHandler: view, schema: { tags: ['assistant'], response: { 200: z.array(conversationSchema) } } },
    (req) => chat.list(actorFor(req)),
  );
  app.post(
    '/assistant/conversations',
    {
      preHandler: view,
      schema: { tags: ['assistant'], body: z.object({}).optional(), response: { 201: conversationSchema } },
    },
    async (req, reply) => reply.code(201).send(await chat.create(actorFor(req))),
  );
  app.get(
    '/assistant/conversations/:id',
    {
      preHandler: view,
      schema: { tags: ['assistant'], params: idParams, response: { 200: conversationDetailSchema } },
    },
    (req) => chat.get(actorFor(req), req.params.id),
  );
  app.patch(
    '/assistant/conversations/:id',
    {
      preHandler: view,
      schema: {
        tags: ['assistant'],
        params: idParams,
        body: renameConversationSchema,
        response: { 200: conversationSchema },
      },
    },
    (req) => chat.rename(actorFor(req), req.params.id, req.body.title),
  );
  app.delete(
    '/assistant/conversations/:id',
    { preHandler: view, schema: { tags: ['assistant'], params: idParams } },
    async (req, reply) => {
      await chat.remove(actorFor(req), req.params.id);
      return reply.code(204).send();
    },
  );

  /** Streams the reply as newline-delimited JSON events (see ChatStreamEvent). */
  app.post(
    '/assistant/conversations/:id/messages',
    {
      preHandler: view,
      schema: {
        tags: ['assistant'],
        summary: 'Ask a question; the reply streams back as NDJSON events',
        params: idParams,
        body: sendMessageSchema,
      },
    },
    async (req, reply) => {
      const actor = userActor(actorFor(req));
      await chat.summary(actor, req.params.id); // 404 before the stream starts
      const controller = new AbortController();
      let finished = false;
      req.raw.on('close', () => {
        if (!finished) controller.abort('client closed');
      });
      reply.hijack();
      const res = reply.raw;
      res.writeHead(200, {
        'Content-Type': 'application/x-ndjson; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'X-Accel-Buffering': 'no',
      });
      const send = (e: ChatStreamEvent) => {
        if (!res.writableEnded) res.write(`${JSON.stringify(e)}\n`);
      };
      try {
        for await (const event of chatTurn(
          { services, gateway: services.llm, log: req.log },
          actor,
          req.params.id,
          req.body.content,
          { model: req.body.model, signal: controller.signal },
        ))
          send(event);
      } catch (e) {
        req.log.error({ err: e }, 'assistant stream failed');
        send({ type: 'error', message: e instanceof Error ? e.message : 'Something went wrong.' });
      } finally {
        finished = true;
        res.end();
      }
    },
  );

  app.post(
    '/assistant/messages/:messageId/cards/:cardId/confirm',
    {
      preHandler: view,
      schema: {
        tags: ['assistant'],
        summary: 'Carry out a drafted change, as you',
        params: cardParams,
        response: { 200: z.object({ message: chatMessageSchema, action: actionSchema.nullable() }) },
      },
    },
    async (req) => {
      const actor = userActor(actorFor(req));
      const { messageId, cardId } = req.params;
      const { card, message } = await chat.card(actor, messageId, cardId);
      if (card.status !== 'pending')
        throw new AppError('INVALID_STATE_TRANSITION', 'This change was already decided.');
      try {
        const action = await services.actions.confirmFromChat(actor, {
          type: card.type,
          payload: card.payload,
          rationale: card.rationale,
          modelUsed: message.modelUsed,
          dataUsed: [],
          runId: message.runId,
        });
        const failed = action.status === 'FAILED';
        return {
          message: await chat.updateCard(actor, messageId, cardId, {
            status: failed ? 'failed' : 'confirmed',
            result: action.result,
            error: action.error,
          }),
          action,
        };
      } catch (e) {
        // Permission and validation errors are shown on the card as well as returned.
        const text = e instanceof Error ? e.message : 'Couldn’t carry this out.';
        await chat.updateCard(actor, messageId, cardId, { error: text });
        throw e;
      }
    },
  );
  app.post(
    '/assistant/messages/:messageId/cards/:cardId/dismiss',
    {
      preHandler: view,
      schema: { tags: ['assistant'], params: cardParams, response: { 200: chatMessageSchema } },
    },
    async (req) => {
      const actor = userActor(actorFor(req));
      const { card } = await chat.card(actor, req.params.messageId, req.params.cardId);
      if (card.status !== 'pending')
        throw new AppError('INVALID_STATE_TRANSITION', 'This change was already decided.');
      return chat.updateCard(actor, req.params.messageId, req.params.cardId, { status: 'dismissed' });
    },
  );
};
