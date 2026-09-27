import { API_PREFIX, type ErrorCode } from '@stockroom/shared';

/** Error thrown for any non-2xx API response, carrying the server's { code, message, details }. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode | 'NETWORK_ERROR',
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** Field-level messages from a VALIDATION_ERROR, keyed by field path. */
  get fields(): Record<string, string> {
    const details = this.details as { fields?: Record<string, string> } | undefined;
    return details?.fields ?? {};
  }
}

type Query = Record<string, string | number | boolean | undefined | null>;

function buildUrl(path: string, query?: Query): string {
  const url = `${API_PREFIX}${path}`;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== '') params.set(k, String(v));
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

let onUnauthenticated: (() => void) | null = null;
/** Registered by the router: a 401 on an authenticated page sends the user to sign in. */
export function setUnauthenticatedHandler(handler: () => void) {
  onUnauthenticated = handler;
}

async function request<T>(
  method: string,
  path: string,
  options: { body?: unknown; query?: Query; signal?: AbortSignal } = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(buildUrl(path, options.query), {
      method,
      credentials: 'same-origin',
      headers: options.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
    });
  } catch (error) {
    if ((error as Error).name === 'AbortError') throw error;
    throw new ApiError(0, 'NETWORK_ERROR', 'Can’t reach the Stockroom server. Is it running?');
  }

  if (response.status === 204) return undefined as T;
  const text = await response.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : undefined;
  } catch {
    data = undefined; // Not JSON: a proxy or gateway error page.
  }
  // The dev proxy answers 502/504 without our envelope when the API isn't running.
  if (!response.ok && data === undefined && [502, 503, 504].includes(response.status)) {
    throw new ApiError(response.status, 'NETWORK_ERROR', 'Can’t reach the Stockroom server. Is it running?');
  }

  if (!response.ok) {
    const envelope = (
      data as { error?: { code?: ErrorCode; message?: string; details?: unknown } } | undefined
    )?.error;
    const error = new ApiError(
      response.status,
      envelope?.code ?? 'INTERNAL',
      envelope?.message ?? `Request failed (${response.status})`,
      envelope?.details,
    );
    if (response.status === 401 && !path.startsWith('/auth/')) onUnauthenticated?.();
    throw error;
  }
  return data as T;
}

export const api = {
  get: <T>(path: string, query?: Query, signal?: AbortSignal) => request<T>('GET', path, { query, signal }),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, { body: body ?? {} }),
  patch: <T>(path: string, body: unknown) => request<T>('PATCH', path, { body }),
  put: <T>(path: string, body: unknown) => request<T>('PUT', path, { body }),
  delete: <T>(path: string) => request<T>('DELETE', path),
};
