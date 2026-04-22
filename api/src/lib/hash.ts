import { Transform } from 'node:stream';
import { createHash, type Hash } from 'node:crypto';

export interface Sha256Transform extends Transform {
  digest: () => string;
}

export function createSha256Transform(): Sha256Transform {
  const hasher: Hash = createHash('sha256');
  const t = new Transform({
    transform(chunk, _enc, cb) {
      hasher.update(chunk);
      cb(null, chunk);
    },
  }) as Sha256Transform;
  t.digest = () => hasher.digest('hex');
  return t;
}

export interface ByteCounterTransform extends Transform {
  bytes: number;
}

export function createByteCounter(opts: { max?: number } = {}): ByteCounterTransform {
  let total = 0;
  const t = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      total += chunk.length;
      if (opts.max != null && total > opts.max) {
        cb(new Error('file too large'));
        return;
      }
      cb(null, chunk);
    },
  }) as ByteCounterTransform;
  Object.defineProperty(t, 'bytes', { get: () => total });
  return t;
}
