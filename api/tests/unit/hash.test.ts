import { describe, it, expect } from 'vitest';
import { Readable, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createSha256Transform, createByteCounter } from '../../src/lib/hash.js';

describe('hash/size transforms', () => {
  it('computes sha256 and byte count while passing data through', async () => {
    const input = Readable.from(Buffer.from('hello world'));
    const hasher = createSha256Transform();
    const counter = createByteCounter();
    const sinkChunks: Buffer[] = [];
    const sink = new Writable({
      write(chunk, _enc, cb) {
        sinkChunks.push(chunk);
        cb();
      },
    });
    await pipeline(input, hasher, counter, sink);
    expect(hasher.digest()).toBe(
      'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9',
    );
    expect(counter.bytes).toBe(11);
    expect(Buffer.concat(sinkChunks).toString()).toBe('hello world');
  });

  it('enforces max bytes if configured', async () => {
    const input = Readable.from(Buffer.from('x'.repeat(100)));
    const counter = createByteCounter({ max: 50 });
    const sink = new Writable({
      write(_c, _e, cb) {
        cb();
      },
    });
    await expect(pipeline(input, counter, sink)).rejects.toThrow(/file too large/i);
  });

  it('handles multi-chunk streams correctly', async () => {
    const chunks = ['hel', 'lo ', 'wor', 'ld'];
    const input = Readable.from(chunks.map((c) => Buffer.from(c)));
    const hasher = createSha256Transform();
    const counter = createByteCounter();
    const sink = new Writable({
      write(_c, _e, cb) {
        cb();
      },
    });
    await pipeline(input, hasher, counter, sink);
    expect(hasher.digest()).toBe(
      'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9',
    );
    expect(counter.bytes).toBe(11);
  });
});
