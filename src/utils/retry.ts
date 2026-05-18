// Exponential-backoff retry with jitter. Used for aggregator fetches
// since Walrus aggregators can occasionally cold-cache.

export interface RetryOptions {
  /** Max attempts including the first. Default: 3. */
  attempts?: number;
  /** Base delay in ms. Default: 250. */
  baseMs?: number;
  /** Max delay cap in ms. Default: 5_000. */
  maxMs?: number;
  /** Predicate — return true to retry, false to fail fast. Default: retry all errors. */
  shouldRetry?: (err: unknown) => boolean;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {},
): Promise<T> {
  const attempts = Math.max(1, opts.attempts ?? 3);
  const baseMs = opts.baseMs ?? 250;
  const maxMs = opts.maxMs ?? 5_000;
  const shouldRetry = opts.shouldRetry ?? (() => true);

  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i === attempts - 1 || !shouldRetry(err)) break;
      const exp = Math.min(maxMs, baseMs * 2 ** i);
      // Full jitter — proven to spread retry storms thinnest.
      const delay = Math.floor(Math.random() * exp);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}
