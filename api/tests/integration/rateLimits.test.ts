import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { __createBucketForTests } from '../../src/middleware/rateLimits.js';

function appWith(limiter: express.RequestHandler) {
  const app = express();
  app.set('trust proxy', 1);
  app.use(limiter);
  app.get('/t', (_req, res) => res.json({ ok: true }));
  return app;
}

describe('rate-limit buckets — production behavior', () => {
  it('global bucket allows 60/min and rejects the 61st', async () => {
    const bucket = __createBucketForTests({ windowMs: 60_000, max: 60, name: 'global' });
    const app = appWith(bucket);
    for (let i = 0; i < 60; i++) {
      const r = await request(app).get('/t');
      expect(r.status).toBe(200);
    }
    const r = await request(app).get('/t');
    expect(r.status).toBe(429);
  });

  it('upload bucket allows 5/min', async () => {
    const bucket = __createBucketForTests({ windowMs: 60_000, max: 5, name: 'upload' });
    const app = appWith(bucket);
    for (let i = 0; i < 5; i++) expect((await request(app).get('/t')).status).toBe(200);
    expect((await request(app).get('/t')).status).toBe(429);
  });

  it('chat bucket allows 20/min', async () => {
    const bucket = __createBucketForTests({ windowMs: 60_000, max: 20, name: 'chat' });
    const app = appWith(bucket);
    for (let i = 0; i < 20; i++) expect((await request(app).get('/t')).status).toBe(200);
    expect((await request(app).get('/t')).status).toBe(429);
  });
});
