import { LlmError } from './errors';
import type { ProviderSettings } from './types';

/** Longest we wait for a free per-minute slot before treating it like a 429 and falling back. */
const MAX_RPM_WAIT_MS = 8_000;

/**
 * Free tiers are small. Per provider: a requests-per-minute window, a concurrency limit (Ollama 1,
 * because a laptop GPU serves one request at a time) and a daily call budget. Exceeding the daily
 * budget is treated like a rate limit so the router falls back to the next model.
 */
export class ProviderBudget {
  private readonly recent: number[] = [];
  private active = 0;
  private readonly waiters: Array<() => void> = [];

  constructor(
    private settings: ProviderSettings,
    private readonly callsToday: () => Promise<number>,
  ) {}

  update(settings: ProviderSettings) {
    this.settings = settings;
  }

  /** Waits for capacity and returns a release function. */
  async acquire(signal?: AbortSignal): Promise<() => void> {
    const s = this.settings;
    if (s.dailyBudget > 0 && (await this.callsToday()) >= s.dailyBudget) {
      throw new LlmError('budget_exceeded', `Daily budget of ${s.dailyBudget} calls used up.`);
    }
    if (s.rpm > 0) {
      const now = Date.now();
      while (this.recent.length && now - this.recent[0]! > 60_000) this.recent.shift();
      if (this.recent.length >= s.rpm) {
        const wait = 60_000 - (now - this.recent[0]!);
        if (wait > MAX_RPM_WAIT_MS)
          throw new LlmError('budget_exceeded', `Limit of ${s.rpm} requests per minute reached.`, {
            retryAfterMs: wait,
          });
        await sleep(wait, signal);
      }
      this.recent.push(Date.now());
    }
    const limit = Math.max(1, s.concurrency);
    while (this.active >= limit) {
      await new Promise<void>((resolve, reject) => {
        const onAbort = () => reject(new LlmError('cancelled', 'The request was cancelled.'));
        signal?.addEventListener('abort', onAbort, { once: true });
        this.waiters.push(() => {
          signal?.removeEventListener('abort', onAbort);
          resolve();
        });
      });
    }
    this.active++;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.active--;
      this.waiters.shift()?.();
    };
  }

  get inFlight() {
    return this.active;
  }
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new LlmError('cancelled', 'The request was cancelled.'));
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(t);
        reject(new LlmError('cancelled', 'The request was cancelled.'));
      },
      { once: true },
    );
  });
}

/** Exponential backoff with full jitter: random(0, min(cap, base·2^attempt)). */
export function backoffMs(attempt: number, base = 600, cap = 8_000): number {
  return Math.round(Math.random() * Math.min(cap, base * 2 ** attempt));
}
