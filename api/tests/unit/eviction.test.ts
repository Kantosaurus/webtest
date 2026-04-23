import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  __resetForTests,
  createScan,
  evict,
  getScan,
  sweepExpired,
  TTL_MS,
} from '../../src/services/scans.js';
import { appendMessage, listMessages } from '../../src/services/messages.js';

beforeEach(() => __resetForTests());

describe('evict()', () => {
  it('removes the scan and its messages together', () => {
    const s = createScan({ vtAnalysisId: 'a', fileName: 'f', fileSha256: 'h', fileSize: 1 });
    appendMessage({ scanId: s.id, role: 'user', content: 'hi' });
    expect(listMessages(s.id)).toHaveLength(1);

    evict(s.id);

    expect(listMessages(s.id)).toHaveLength(0);
    expect(getScan(s.id)).toBeNull();
  });

  it('is a no-op for unknown scan ids', () => {
    expect(() => evict('does-not-exist')).not.toThrow();
  });
});

describe('per-scan message cap', () => {
  it('drops oldest messages when the cap is exceeded', () => {
    const s = createScan({ vtAnalysisId: 'a', fileName: 'f', fileSha256: 'h', fileSize: 1 });
    for (let i = 0; i < 205; i++) {
      appendMessage({ scanId: s.id, role: 'user', content: `msg-${i}` });
    }
    const list = listMessages(s.id);
    expect(list).toHaveLength(200);
    expect(list[0]?.content).toBe('msg-5');
    expect(list[list.length - 1]?.content).toBe('msg-204');
  });
});

afterEach(() => vi.useRealTimers());

describe('TTL eviction', () => {
  it('drops scans older than TTL when sweepExpired runs', () => {
    vi.useFakeTimers();
    const t0 = new Date('2026-04-23T00:00:00Z').getTime();
    vi.setSystemTime(t0);
    const s = createScan({ vtAnalysisId: 'a', fileName: 'f', fileSha256: 'h', fileSize: 1 });
    expect(getScan(s.id)).not.toBeNull();

    vi.setSystemTime(t0 + TTL_MS + 1000);
    sweepExpired();

    expect(getScan(s.id)).toBeNull();
  });

  it('does not drop recently-touched scans', () => {
    vi.useFakeTimers();
    const t0 = new Date('2026-04-23T00:00:00Z').getTime();
    vi.setSystemTime(t0);
    const s = createScan({ vtAnalysisId: 'a', fileName: 'f', fileSha256: 'h', fileSize: 1 });
    vi.setSystemTime(t0 + 5 * 60_000);
    sweepExpired();
    expect(getScan(s.id)).not.toBeNull();
  });
});
