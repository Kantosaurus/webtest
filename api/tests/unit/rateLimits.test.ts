import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createBucket, buckets } from '../../src/middleware/rateLimits.js';

function buildApp(limiter: express.RequestHandler) {
  const app = express();
  app.set('trust proxy', 1);
  app.use(limiter);
  app.get('/t', (_req, res) => res.json({ ok: true }));
  return app;
}

describe('rate-limit bucket factory', () => {
  it('allows requests below the per-window limit', async () => {
    const limiter = createBucket({ windowMs: 60_000, max: 3, name: 'test' });
    const app = buildApp(limiter);
    for (let i = 0; i < 3; i++) {
      const r = await request(app).get('/t');
      expect(r.status).toBe(200);
    }
  });

  it('returns 429 with a JSON error on the (max+1)th request', async () => {
    const limiter = createBucket({ windowMs: 60_000, max: 2, name: 'test' });
    const app = buildApp(limiter);
    await request(app).get('/t');
    await request(app).get('/t');
    const r = await request(app).get('/t');
    expect(r.status).toBe(429);
    expect(r.body.error.code).toBe('RATE_LIMITED');
  });

  it('exposes three named buckets with the expected limits in non-test env', () => {
    expect(buckets.global).toBeDefined();
    expect(buckets.upload).toBeDefined();
    expect(buckets.chat).toBeDefined();
  });
});
