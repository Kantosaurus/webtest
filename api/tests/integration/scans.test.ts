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

describe('GET /api/scans/:id/events', () => {
  it('streams a result event once VT analysis completes', async () => {
    let polls = 0;
    server.use(
      http.post('https://www.virustotal.com/api/v3/files', () =>
        HttpResponse.json({ data: { id: 'a-sse' } }),
      ),
      http.get('https://www.virustotal.com/api/v3/analyses/a-sse', () => {
        polls++;
        if (polls < 2) {
          return HttpResponse.json({
            data: {
              id: 'a-sse',
              attributes: {
                status: 'queued',
                stats: { malicious: 0, suspicious: 0, undetected: 0, harmless: 0 },
              },
            },
          });
        }
        return HttpResponse.json({
          data: {
            id: 'a-sse',
            attributes: {
              status: 'completed',
              stats: { malicious: 2, suspicious: 0, undetected: 50, harmless: 0 },
              results: {},
            },
          },
        });
      }),
    );
    const agent = await signup();
    const up = await agent.post('/api/scans').attach('file', Buffer.from('x'), 'x.js');
    const scanId = up.body.scanId as number;

    const res = await agent
      .get(`/api/scans/${scanId}/events`)
      .buffer(true)
      .parse((r, cb) => {
        let data = '';
        r.on('data', (c: Buffer) => (data += c.toString()));
        r.on('end', () => cb(null, data));
      });
    expect(res.status).toBe(200);
    expect(String(res.body)).toContain('event: result');
    expect(String(res.body)).toContain('"status":"completed"');
  }, 30_000);

  it('emits result immediately if scan is already completed in DB', async () => {
    // Pre-populate a completed scan by running one full cycle first
    server.use(
      http.post('https://www.virustotal.com/api/v3/files', () =>
        HttpResponse.json({ data: { id: 'a-done' } }),
      ),
      http.get('https://www.virustotal.com/api/v3/analyses/a-done', () =>
        HttpResponse.json({
          data: {
            id: 'a-done',
            attributes: {
              status: 'completed',
              stats: { malicious: 0, suspicious: 0, undetected: 1, harmless: 0 },
              results: {},
            },
          },
        }),
      ),
    );
    const agent = await signup();
    const up = await agent.post('/api/scans').attach('file', Buffer.from('y'), 'y.js');
    const scanId = up.body.scanId as number;

    // First SSE: completes via polling and updates DB
    const first = await agent
      .get(`/api/scans/${scanId}/events`)
      .buffer(true)
      .parse((r, cb) => {
        let d = '';
        r.on('data', (c: Buffer) => (d += c.toString()));
        r.on('end', () => cb(null, d));
      });
    expect(String(first.body)).toContain('event: result');

    // Second SSE: should short-circuit from DB state, no VT polling
    const second = await agent
      .get(`/api/scans/${scanId}/events`)
      .buffer(true)
      .parse((r, cb) => {
        let d = '';
        r.on('data', (c: Buffer) => (d += c.toString()));
        r.on('end', () => cb(null, d));
      });
    expect(String(second.body)).toContain('event: result');
  }, 30_000);

  it('404s if scan does not belong to the user', async () => {
    server.use(
      http.post('https://www.virustotal.com/api/v3/files', () =>
        HttpResponse.json({ data: { id: 'a-owner' } }),
      ),
    );
    const userA = await signup();
    const up = await userA.post('/api/scans').attach('file', Buffer.from('z'), 'z.js');
    const scanId = up.body.scanId as number;

    const userB = await signup();
    const res = await userB.get(`/api/scans/${scanId}/events`);
    expect(res.status).toBe(404);
  });
});
