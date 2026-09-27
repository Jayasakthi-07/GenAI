import type { ErrorCode } from '@stockroom/shared';

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INVALID_STATE_TRANSITION: 409,
  INSUFFICIENT_STOCK: 409,
  RATE_LIMITED: 429,
  DB_UNAVAILABLE: 503,
  AI_PROVIDER_UNAVAILABLE: 503,
  AI_INVALID_KEY: 400,
  AI_RATE_LIMITED: 429,
  AI_MODEL_NO_TOOLS: 422,
  INTERNAL: 500,
};

/** The only error type services throw on purpose. Everything else becomes INTERNAL. */
export class AppError extends Error {
  readonly statusCode: number;

  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
    this.statusCode = STATUS_BY_CODE[code];
  }
}

export const notFound = (what: string) => new AppError('NOT_FOUND', `${what} wasn't found.`);
export const forbidden = (message = 'You don’t have permission to do that.') =>
  new AppError('FORBIDDEN', message);
export const unauthenticated = (message = 'Please sign in to continue.') =>
  new AppError('UNAUTHENTICATED', message);
export const conflict = (message: string, details?: unknown) => new AppError('CONFLICT', message, details);
export const invalidTransition = (from: string, to: string, what = 'This record') =>
  new AppError('INVALID_STATE_TRANSITION', `${what} can’t move from ${from} to ${to}.`, { from, to });
