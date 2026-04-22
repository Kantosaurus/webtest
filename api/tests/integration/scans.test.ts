import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { startTestDb } from './setup.js';

let stop: () => Promise<void>;
let app: import('express').Express;
const server = setupServer();

beforeAll(async () => {
  const db = await startTestDb();
  process.env.DATABASE_URL = db.url;
  process.env.SESSION_SECRET = 'a'.repeat(40);
  process.env.VT_API_KEY = 'vt-key';
  process.env.GEMINI_API_KEY = 'g';
  process.env.NODE_ENV = 'test';
  stop = db.stop;
  server.listen({ onUnhandledRequest: 'bypass' });
  const mod = await import('../../src/app.js');
  app = mod.buildApp();
}, 120_000);

afterEach(() => server.resetHandlers());
afterAll(async () => {
  server.close();
  await stop();
});

async function signup(): Promise<ReturnType<typeof request.agent>> {
  const agent = request.agent(app);
  await agent.post('/api/auth/register').send({
    email: `u${Date.now()}_${Math.random().toString(36).slice(2)}@example.com`,
    password: 'hunter22!',
  });
  return agent;
}

describe('POST /api/scans', () => {
  it('streams upload to VT and persists scan', async () => {
    server.use(
      http.post('https://www.virustotal.com/api/v3/files', () =>
        HttpResponse.json({ data: { id: 'analysis-1' } }),
      ),
    );
    const agent = await signup();
    const res = await agent
      .post('/api/scans')
      .attach('file', Buffer.from('console.log(1)'), {
        filename: 'sample.js',
        contentType: 'application/javascript',
      });
    expect(res.status).toBe(202);
    expect(res.body.analysisId).toBe('analysis-1');
    expect(res.body.scanId).toBeGreaterThan(0);
    expect(res.body.status).toBe('queued');
  });

  it('rejects >32MB upload', async () => {
    const big = Buffer.alloc(33 * 1024 * 1024, 1);
    const agent = await signup();
    const res = await agent.post('/api/scans').attach('file', big, 'big.bin');
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('FILE_TOO_LARGE');
  }, 60_000);

  it('401 when not authenticated', async () => {
    const res = await request(app)
      .post('/api/scans')
      .attach('file', Buffer.from('x'), 'x.txt');
    expect(res.status).toBe(401);
  });

  it('400 when request is not multipart/form-data', async () => {
    const agent = await signup();
    const res = await agent
      .post('/api/scans')
      .set('Content-Type', 'application/json')
      .send({ nope: true });
    expect(res.status).toBe(400);
  });

  it('lists scans for the current user', async () => {
    server.use(
      http.post('https://www.virustotal.com/api/v3/files', () =>
        HttpResponse.json({ data: { id: `a-${Math.random()}` } }),
      ),
    );
    const agent = await signup();
    await agent.post('/api/scans').attach('file', Buffer.from('a'), 'a.js');
    await agent.post('/api/scans').attach('file', Buffer.from('b'), 'b.js');
    const res = await agent.get('/api/scans');
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(2);
    expect(res.body[0]).toHaveProperty('fileName');
    expect(res.body[0]).toHaveProperty('status');
  });

  it('isolates scans between users (ownership check)', async () => {
    server.use(
      http.post('https://www.virustotal.com/api/v3/files', () =>
        HttpResponse.json({ data: { id: `a-${Math.random()}` } }),
      ),
    );
    const userA = await signup();
    const up = await userA.post('/api/scans').attach('file', Buffer.from('a'), 'a.js');
    const scanId = up.body.scanId;

    const userB = await signup();
    const res = await userB.get(`/api/scans/${scanId}`);
    expect(res.status).toBe(404);
  });
});
