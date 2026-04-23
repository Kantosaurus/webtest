export interface RetryOpts {
  /** Number of retries AFTER the initial attempt. Total attempts = retries + 1. */
  retries: number;
  /** Base backoff in ms; doubles each retry; 20% jitter added. */
  baseMs: number;
  /** Return true to retry on this error, false to throw immediately. */
  shouldRetry: (err: unknown) => boolean;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOpts): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= opts.retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === opts.retries || !opts.shouldRetry(err)) throw err;
      const jitter = 0.8 + Math.random() * 0.4;
      const delay = Math.floor(opts.baseMs * 2 ** attempt * jitter);
      await sleep(delay);
    }
  }
  throw lastErr;
}
