export class RetryError extends Error {
  constructor(message: string, readonly attempts: number, readonly cause?: unknown) {
    super(message);
  }
}

/** Bounded retries with exponential backoff and jitter. */
export async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  opts: { retries?: number; baseMs?: number; maxMs?: number; shouldRetry?: (e: unknown) => boolean; sleep?: (ms: number) => Promise<void> } = {},
): Promise<T> {
  const { retries = 2, baseMs = 400, maxMs = 4000, shouldRetry = () => true } = opts;
  const sleep = opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  let last: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn(attempt);
    } catch (e) {
      last = e;
      if (attempt === retries || !shouldRetry(e)) break;
      const delay = Math.min(maxMs, baseMs * 2 ** attempt) * (0.75 + Math.random() * 0.5);
      await sleep(delay);
    }
  }
  throw new RetryError(`failed after retries: ${(last as Error)?.message ?? last}`, retries + 1, last);
}

export class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

/** Retry on network errors, 429 and 5xx; not on other 4xx. */
export const isRetryableHttp = (e: unknown) => !(e instanceof HttpError) || e.status === 429 || e.status >= 500;
