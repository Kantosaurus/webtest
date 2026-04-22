import { describe, it, expect } from 'vitest';
import { PassThrough } from 'node:stream';
import type { Response } from 'express';
import { SseWriter } from '../../src/lib/sse.js';

function fakeRes(): { sink: PassThrough; res: Response } {
  const sink = new PassThrough();
  const res = {
    setHeader: (_n: string, _v: string) => undefined,
    write: (s: string) => sink.write(s),
    flushHeaders: () => undefined,
    end: () => sink.end(),
  } as unknown as Response;
  return { sink, res };
}

describe('SseWriter', () => {
  it('formats events with name + JSON-encoded data', () => {
    const { sink, res } = fakeRes();
    const chunks: Buffer[] = [];
    sink.on('data', (c) => chunks.push(c));
    const sse = new SseWriter(res);
    sse.event('status', { state: 'running' });
    sse.event('result', { ok: true });
    const text = Buffer.concat(chunks).toString();
    expect(text).toContain('event: status\n');
    expect(text).toContain('data: {"state":"running"}\n\n');
    expect(text).toContain('event: result\n');
    expect(text).toContain('data: {"ok":true}\n\n');
  });

  it('writes comments as heartbeats', () => {
    const { sink, res } = fakeRes();
    const chunks: Buffer[] = [];
    sink.on('data', (c) => chunks.push(c));
    const sse = new SseWriter(res);
    sse.comment('ping');
    expect(Buffer.concat(chunks).toString()).toBe(': ping\n\n');
  });

  it('close() ends the response', () => {
    const { sink, res } = fakeRes();
    let ended = false;
    sink.on('end', () => (ended = true));
    sink.on('data', () => undefined);
    const sse = new SseWriter(res);
    sse.event('x', {});
    sse.close();
    // Allow microtask to settle
    return new Promise<void>((resolve) => setImmediate(() => {
      expect(ended).toBe(true);
      resolve();
    }));
  });
});
