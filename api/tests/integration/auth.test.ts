import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { startTestDb } from './setup.js';

let stop: () => Promise<void>;
let app: import('express').Express;

beforeAll(async () => {
  const db = await startTestDb();
  process.env.DATABASE_URL = db.url;
  process.env.SESSION_SECRET = 'a'.repeat(40);
  process.env.VT_API_KEY = 'x';
  process.env.GEMINI_API_KEY = 'x';
  process.env.NODE_ENV = 'test';
  stop = db.stop;
  const mod = await import('../../src/app.js');
  app = mod.buildApp();
}, 120_000);

afterAll(async () => {
  await stop();
});

describe('auth', () => {
  it('registers, fetches me, logs out, logs back in', async () => {
    const agent = request.agent(app);

    const reg = await agent
      .post('/api/auth/register')
      .send({ email: 'a@example.com', password: 'hunter22!' });
    expect(reg.status).toBe(201);
    expect(reg.body.email).toBe('a@example.com');

    const me1 = await agent.get('/api/auth/me');
    expect(me1.status).toBe(200);
    expect(me1.body.email).toBe('a@example.com');

    const logout = await agent.post('/api/auth/logout');
    expect(logout.status).toBe(204);

    const me2 = await agent.get('/api/auth/me');
    expect(me2.status).toBe(401);

    const login = await agent
      .post('/api/auth/login')
      .send({ email: 'a@example.com', password: 'hunter22!' });
    expect(login.status).toBe(200);
  });

  it('rejects weak password at registration', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'b@example.com', password: 'x' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('rejects duplicate email registration', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ email: 'c@example.com', password: 'hunter22!' });
    const dup = await request(app)
      .post('/api/auth/register')
      .send({ email: 'c@example.com', password: 'hunter22!' });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('CONFLICT');
  });

  it('rejects login with wrong password', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ email: 'd@example.com', password: 'hunter22!' });
    const bad = await request(app)
      .post('/api/auth/login')
      .send({ email: 'd@example.com', password: 'wrong1234' });
    expect(bad.status).toBe(401);
  });

  it('rejects login for non-existent email', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'ghost@example.com', password: 'hunter22!' });
    expect(res.status).toBe(401);
  });

  it('rejects missing fields at registration', async () => {
    const res = await request(app).post('/api/auth/register').send({ email: 'x@example.com' });
    expect(res.status).toBe(400);
  });
});
