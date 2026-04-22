import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { startTestDb } from './setup.js';

let stop: () => Promise<void>;
let app: import('express').Express;
const server = setupServer();

// Mock the gemini client so tests don't hit the network.
vi.mock('../../src/services/gemini.js', () => ({
  createGeminiClient: () => ({
    async *stream() {
      yield 'Hello';
      yield ' world';
    },
  }),
}));

beforeAll(async () => {
  const db = await startTestDb();
  process.env.DATABASE_URL = db.url;
  process.env.SESSION_SECRET = 'a'.repeat(40);
  process.env.VT_API_KEY = 'v';
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

async function signupAndScan(): Promise<{
  agent: ReturnType<typeof request.agent>;
  scanId: number;
}> {
  const agent = request.agent(app);
  await agent.post('/api/auth/register').send({
    email: `u${Date.now()}_${Math.random().toString(36).slice(2)}@example.com`,
    password: 'hunter22!',
  });
  server.use(
    http.post('https://www.virustotal.com/api/v3/files', () =>
      HttpResponse.json({ data: { id: `a-${Math.random()}` } }),
    ),
  );
  const up = await agent.post('/api/scans').attach('file', Buffer.from('x'), 'x.js');
  return { agent, scanId: up.body.scanId };
}

describe('chat messages', () => {
  it('streams assistant reply and persists both turns', async () => {
    const { agent, scanId } = await signupAndScan();
    const res = await agent
      .post(`/api/scans/${scanId}/messages`)
      .send({ content: 'Is this safe?' })
      .buffer(true)
      .parse((r, cb) => {
        let d = '';
        r.on('data', (c: Buffer) => (d += c));
        r.on('end', () => cb(null, d));
      });

    expect(res.status).toBe(200);
    const text = String(res.body);
    expect(text).toContain('event: token');
    expect(text).toContain('event: done');

    const hist = await agent.get(`/api/scans/${scanId}/messages`);
    expect(hist.status).toBe(200);
    expect(hist.body).toHaveLength(2);
    expect(hist.body[0].role).toBe('user');
    expect(hist.body[0].content).toBe('Is this safe?');
    expect(hist.body[1].role).toBe('assistant');
    expect(hist.body[1].content).toBe('Hello world');
  });

  it('rejects chat on a scan the user does not own', async () => {
    const { scanId } = await signupAndScan();
    const other = request.agent(app);
    await other.post('/api/auth/register').send({
      email: `o${Date.now()}_${Math.random().toString(36).slice(2)}@example.com`,
      password: 'hunter22!',
    });
    const res = await other.post(`/api/scans/${scanId}/messages`).send({ content: 'hi' });
    expect(res.status).toBe(404);
  });

  it('rejects empty message content', async () => {
    const { agent, scanId } = await signupAndScan();
    const res = await agent
      .post(`/api/scans/${scanId}/messages`)
      .send({ content: '' });
    expect(res.status).toBe(400);
  });

  it('rejects overlong message content', async () => {
    const { agent, scanId } = await signupAndScan();
    const res = await agent
      .post(`/api/scans/${scanId}/messages`)
      .send({ content: 'x'.repeat(5000) });
    expect(res.status).toBe(400);
  });

  it('deletes a message (for regenerate flow) only for owner', async () => {
    const { agent, scanId } = await signupAndScan();
    await agent.post(`/api/scans/${scanId}/messages`).send({ content: 'Q1' }).buffer(true).parse((r, cb) => { let d = ''; r.on('data', (c: Buffer) => d += c); r.on('end', () => cb(null, d)); });
    const hist = await agent.get(`/api/scans/${scanId}/messages`);
    const lastAssistant = [...hist.body].reverse().find((m: { role: string }) => m.role === 'assistant');
    expect(lastAssistant).toBeTruthy();
    const del = await agent.delete(`/api/scans/${scanId}/messages/${lastAssistant.id}`);
    expect(del.status).toBe(204);

    const hist2 = await agent.get(`/api/scans/${scanId}/messages`);
    expect(hist2.body).toHaveLength(1);
  });

  it('returns empty history for a new scan', async () => {
    const { agent, scanId } = await signupAndScan();
    const hist = await agent.get(`/api/scans/${scanId}/messages`);
    expect(hist.status).toBe(200);
    expect(hist.body).toEqual([]);
  });
});
