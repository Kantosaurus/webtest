import rateLimit, { type Options } from 'express-rate-limit';
import { rateLimitRejectedTotal } from '../services/metrics.js';

const isTest = process.env.NODE_ENV === 'test';

const jsonError = (code: string, message: string) => ({
  error: { code, message },
});

interface BucketSpec {
  name: string;
  windowMs: number;
  max: number;
  skipSuccessfulRequests?: boolean;
}

export function createBucket(spec: BucketSpec): ReturnType<typeof rateLimit> {
  const options: Partial<Options> = {
    windowMs: spec.windowMs,
    limit: spec.max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skipSuccessfulRequests: spec.skipSuccessfulRequests ?? false,
    handler: (_req, res, _next, optionsUsed) => {
      rateLimitRejectedTotal.inc({ bucket: spec.name });
      res
        .status(optionsUsed.statusCode)
        .json(jsonError('RATE_LIMITED', `Rate limit exceeded for ${spec.name}`));
    },
  };
  return rateLimit(options);
}

const relax = (max: number): number => (isTest ? Math.max(max * 1000, 10_000) : max);

export const buckets = {
  global: createBucket({ name: 'global', windowMs: 60_000, max: relax(60) }),
  upload: createBucket({ name: 'upload', windowMs: 60_000, max: relax(5) }),
  uploadHourly: createBucket({ name: 'upload-hourly', windowMs: 60 * 60_000, max: relax(10) }),
  chat: createBucket({ name: 'chat', windowMs: 60_000, max: relax(20) }),
};

export function __createBucketForTests(spec: {
  windowMs: number;
  max: number;
  name: string;
}): ReturnType<typeof rateLimit> {
  return createBucket(spec);
}
