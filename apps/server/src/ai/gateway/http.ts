import { errorFromException, errorFromStatus } from './errors';

/**
 * fetch with an idle timeout: the timer resets whenever data arrives, so slow-but-streaming local
 * models aren't cut off, while a hung connection still fails.
 */
export class IdleTimer {
  private readonly controller = new AbortController();
  private timer: NodeJS.Timeout | undefined;
  readonly signal: AbortSignal;

  constructor(
    private readonly ms: number,
    outer?: AbortSignal,
  ) {
    this.signal = outer ? AbortSignal.any([outer, this.controller.signal]) : this.controller.signal;
    this.touch();
  }

  touch() {
    clearTimeout(this.timer);
    this.timer = setTimeout(
      () => this.controller.abort(new DOMException('Timed out', 'TimeoutError')),
      this.ms,
    );
  }

  clear() {
    clearTimeout(this.timer);
  }
}

export interface HttpOptions {
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs: number;
  signal?: AbortSignal;
  providerName: string;
}

export async function httpJson<T>(url: string, opts: HttpOptions): Promise<T> {
  const idle = new IdleTimer(opts.timeoutMs, opts.signal);
  try {
    const res = await fetch(url, {
      method: opts.method ?? (opts.body === undefined ? 'GET' : 'POST'),
      headers: {
        ...(opts.body === undefined ? {} : { 'content-type': 'application/json' }),
        ...opts.headers,
      },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: idle.signal,
    });
    const text = await res.text();
    if (!res.ok) throw errorFromStatus(res.status, text, opts.providerName, res.headers.get('retry-after'));
    return (text ? JSON.parse(text) : {}) as T;
  } catch (error) {
    throw errorFromException(abortReason(idle.signal, error), opts.providerName);
  } finally {
    idle.clear();
  }
}

/** Streams a response body line by line (NDJSON and SSE are both line-based). */
export async function* httpLines(url: string, opts: HttpOptions): AsyncGenerator<string> {
  const idle = new IdleTimer(opts.timeoutMs, opts.signal);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...opts.headers },
      body: JSON.stringify(opts.body),
      signal: idle.signal,
    });
    if (!res.ok || !res.body) {
      throw errorFromStatus(res.status, await res.text(), opts.providerName, res.headers.get('retry-after'));
    }
    const decoder = new TextDecoder();
    let buffer = '';
    for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
      idle.touch();
      buffer += decoder.decode(chunk, { stream: true });
      let nl: number;
      while ((nl = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, nl).replace(/\r$/, '');
        buffer = buffer.slice(nl + 1);
        if (line.trim()) yield line;
      }
    }
    if (buffer.trim()) yield buffer;
  } catch (error) {
    throw errorFromException(abortReason(idle.signal, error), opts.providerName);
  } finally {
    idle.clear();
  }
}

function abortReason(signal: AbortSignal, error: unknown): unknown {
  // fetch reports our idle abort as a generic AbortError; surface the timeout instead.
  const reason: unknown = signal.reason;
  if (signal.aborted && reason instanceof DOMException && reason.name === 'TimeoutError') return reason;
  return error;
}
