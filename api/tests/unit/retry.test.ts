import { describe, it, expect, vi, afterEach } from 'vitest';
import { withRetry } from '../../src/lib/retry.js';

afterEach(() => vi.useRealTimers());

describe('withRetry', () => {
  it('returns the value on first success', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const r = await withRetry(fn, { retries: 3, baseMs: 10, shouldRetry: () => true });
    expect(r).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on retryable errors up to `retries` times', async () => {
    vi.useFakeTimers();
    const err = new Error('transient');
    const fn = vi
      .fn<[], Promise<string>>()
      .mockRejectedValueOnce(err)
      .mockRejectedValueOnce(err)
      .mockResolvedValueOnce('ok');
    const p = withRetry(fn, { retries: 3, baseMs: 10, shouldRetry: () => true });
    await vi.runAllTimersAsync();
    await expect(p).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('does not retry when shouldRetry returns false', async () => {
    const err = new Error('fatal');
    const fn = vi.fn().mockRejectedValue(err);
    await expect(
      withRetry(fn, { retries: 3, baseMs: 10, shouldRetry: () => false }),
    ).rejects.toThrow('fatal');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('gives up after `retries` attempts and throws the last error', async () => {
    vi.useFakeTimers();
    const err = new Error('still failing');
    const fn = vi.fn().mockRejectedValue(err);
    const p = withRetry(fn, { retries: 2, baseMs: 10, shouldRetry: () => true });
    p.catch(() => undefined);
    await vi.runAllTimersAsync();
    await expect(p).rejects.toThrow('still failing');
    expect(fn).toHaveBeenCalledTimes(3);
  });
});
