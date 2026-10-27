import type { ApiError } from '@stockroom/shared';
import type { FastifyError, FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { hasZodFastifySchemaValidationErrors, isResponseSerializationError } from 'fastify-type-provider-zod';
import { describeDbError } from '../../db/client';
import { AppError } from '../../domain/errors';

type Envelope = ApiError['error'];

function fieldErrors(
  issues: ReadonlyArray<{ instancePath?: string; path?: PropertyKey[]; message?: string }>,
) {
  const fields: Record<string, string> = {};
  for (const issue of issues) {
    const path =
      issue.path?.map(String).join('.') ?? issue.instancePath?.replace(/^\//, '').replaceAll('/', '.') ?? '';
    const key = path || '_';
    fields[key] ??= issue.message ?? 'Invalid value';
  }
  return fields;
}

function prismaCode(error: unknown): string | undefined {
  if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string') {
    return /^P\d{4}$/.test(error.code) ? error.code : undefined;
  }
  return undefined;
}

function isDbConnectionError(error: unknown): boolean {
  const text = error instanceof Error ? `${error.name} ${error.message}` : String(error);
  return /ECONNREFUSED|Can't reach database|connection terminated|DatabaseNotReachable|ETIMEDOUT/i.test(text);
}

/** Central error handler: every failure leaves the API as { error: { code, message, details? } }. */
export const errorsPlugin = fp(
  async (app: FastifyInstance, opts: { databaseUrl: string; spaFallback?: boolean }) => {
    app.setErrorHandler((error: FastifyError, request, reply) => {
      let status = 500;
      let body: Envelope;

      if (error instanceof AppError) {
        status = error.statusCode;
        body = { code: error.code, message: error.message, details: error.details };
      } else if (hasZodFastifySchemaValidationErrors(error)) {
        status = 400;
        const fields = fieldErrors(
          error.validation.map((v) => ({ instancePath: v.instancePath, message: v.message })),
        );
        body = { code: 'VALIDATION_ERROR', message: 'Some fields need attention.', details: { fields } };
      } else if (isResponseSerializationError(error)) {
        request.log.error({ err: error, issues: error.cause.issues }, 'response failed its schema');
        body = { code: 'INTERNAL', message: 'Something went wrong on our side. The error has been logged.' };
      } else if (error.statusCode === 429) {
        status = 429;
        body = { code: 'RATE_LIMITED', message: 'Too many attempts. Please wait a minute and try again.' };
      } else if (prismaCode(error) === 'P2002') {
        status = 409;
        body = { code: 'CONFLICT', message: 'A record with the same unique value already exists.' };
      } else if (prismaCode(error) === 'P2025') {
        status = 404;
        body = { code: 'NOT_FOUND', message: 'That record no longer exists.' };
      } else if (isDbConnectionError(error)) {
        status = 503;
        request.log.error({ err: error }, 'database unavailable');
        body = { code: 'DB_UNAVAILABLE', message: describeDbError(error, opts.databaseUrl) };
      } else if (error.statusCode && error.statusCode >= 400 && error.statusCode < 500) {
        // Fastify's own client errors (bad JSON, unsupported media type, body too large, …).
        status = error.statusCode;
        body = { code: status === 404 ? 'NOT_FOUND' : 'VALIDATION_ERROR', message: error.message };
      } else {
        request.log.error({ err: error }, 'unhandled error');
        body = { code: 'INTERNAL', message: 'Something went wrong on our side. The error has been logged.' };
      }

      if (status >= 500 && error instanceof AppError) request.log.warn({ code: error.code }, error.message);
      void reply.status(status).send({ error: body });
    });

    // One not-found handler for the whole app: JSON for the API, index.html for client-side routes.
    app.setNotFoundHandler((request, reply) => {
      if (
        opts.spaFallback &&
        request.method === 'GET' &&
        !request.url.startsWith('/api/') &&
        !request.url.startsWith('/uploads/') &&
        // A missing file (an old build's script) gets a real 404, not the page as "JavaScript".
        !/\.[a-z0-9]+$/i.test(request.url.split('?')[0] ?? '')
      ) {
        return reply.type('text/html').sendFile('index.html');
      }
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: `No route for ${request.method} ${request.url.split('?')[0]}.` },
      });
    });
  },
  { name: 'errors' },
);
