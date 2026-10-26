export type LlmErrorCode =
  | 'rate_limited'
  | 'invalid_key'
  | 'timeout'
  | 'network'
  | 'server'
  | 'bad_request'
  | 'model_not_found'
  | 'no_tools'
  | 'cancelled'
  | 'budget_exceeded'
  | 'no_model';

const RETRYABLE: LlmErrorCode[] = ['rate_limited', 'timeout', 'network', 'server'];
/** Errors that mean "try another model" rather than "this request is wrong". */
const FALLBACK: LlmErrorCode[] = [
  ...RETRYABLE,
  'invalid_key',
  'model_not_found',
  'budget_exceeded',
  'no_tools',
];

/** A provider failure in neutral terms. Messages never contain keys. */
export class LlmError extends Error {
  constructor(
    readonly code: LlmErrorCode,
    message: string,
    readonly options: {
      status?: number;
      retryAfterMs?: number;
      providerKey?: string;
      lastCode?: LlmErrorCode;
    } = {},
  ) {
    super(message);
    this.name = 'LlmError';
  }

  get retryable() {
    return RETRYABLE.includes(this.code);
  }

  get retryAfterMs(): number | undefined {
    return this.options.retryAfterMs;
  }

  get canFallBack() {
    return FALLBACK.includes(this.code);
  }
}

/** Maps an HTTP status (plus body text) to a neutral error. */
export function errorFromStatus(
  status: number,
  body: string,
  providerName: string,
  retryAfter?: string | null,
): LlmError {
  const text = body.slice(0, 300).replace(/\s+/g, ' ');
  const retryAfterMs = parseRetryAfter(retryAfter);
  if (status === 401 || status === 403)
    return new LlmError('invalid_key', `${providerName} rejected the API key.`, { status });
  if (status === 429)
    return new LlmError('rate_limited', `${providerName} is rate-limiting requests.`, {
      status,
      retryAfterMs,
    });
  if (status === 404)
    return new LlmError('model_not_found', `${providerName}: model not found. ${text}`.trim(), { status });
  if (status === 408 || status === 504)
    return new LlmError('timeout', `${providerName} timed out.`, { status });
  if (status >= 500)
    return new LlmError('server', `${providerName} had a server error (${status}).`, {
      status,
      retryAfterMs,
    });
  if (/tool|function/i.test(text) && /support/i.test(text))
    return new LlmError('no_tools', `${providerName}: this model doesn’t support tool calls.`, { status });
  return new LlmError('bad_request', `${providerName} refused the request (${status}): ${text}`, { status });
}

export function parseRetryAfter(value: string | null | undefined): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const at = Date.parse(value);
  return Number.isFinite(at) ? Math.max(0, at - Date.now()) : undefined;
}

/** Turns fetch/abort failures into neutral errors. */
export function errorFromException(error: unknown, providerName: string): LlmError {
  if (error instanceof LlmError) return error;
  const e = error as { name?: string; message?: string; cause?: { code?: string } };
  if (e.name === 'TimeoutError') return new LlmError('timeout', `${providerName} didn’t respond in time.`);
  if (e.name === 'AbortError') return new LlmError('cancelled', 'The request was cancelled.');
  const code = e.cause?.code ?? '';
  if (
    [
      'ECONNREFUSED',
      'ENOTFOUND',
      'EAI_AGAIN',
      'ECONNRESET',
      'UND_ERR_CONNECT_TIMEOUT',
      'UND_ERR_SOCKET',
    ].includes(code) ||
    /fetch failed/i.test(e.message ?? '')
  ) {
    return new LlmError(
      'network',
      `Can’t reach ${providerName}${code === 'ECONNREFUSED' ? ' (connection refused)' : ''}.`,
    );
  }
  return new LlmError('server', `${providerName}: ${(e.message ?? 'unexpected error').slice(0, 200)}`);
}
