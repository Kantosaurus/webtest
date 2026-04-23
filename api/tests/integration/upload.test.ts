import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { buildApp } from '../../src/app.js';
import { __resetForTests } from '../../src/services/scans.js';

const server = setupServer();
beforeEach(() => {
  __resetForTests();
  server.listen({ onUnhandledRequest: 'bypass' });
});
afterEach(() => {
  server.resetHandlers();
  server.close();
});

describe('POST /api/scans', () => {
  it('rejects non-multipart with 400', async () => {
    const r = await request(buildApp())
      .post('/api/scans')
      .set('content-type', 'application/json')
      .send({ x: 1 });
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('rejects content-length over 32MB with 413', async () => {
    const r = await request(buildApp())
      .post('/api/scans')
      .set('content-type', 'multipart/form-data; boundary=x')
      .set('content-length', String(33 * 1024 * 1024));
    expect(r.status).toBe(413);
    expect(r.body.error.code).toBe('FILE_TOO_LARGE');
  });

  it('uploads a small file and returns 202 with scanId', async () => {
    server.use(
      http.post('https://www.virustotal.com/api/v3/files', () =>
        HttpResponse.json({ data: { id: 'a-happy' } }),
      ),
    );
    const r = await request(buildApp())
      .post('/api/scans')
      .attach('file', Buffer.from('hello world'), 'hello.txt');
    expect(r.status).toBe(202);
    expect(r.body.scanId).toBeDefined();
    expect(r.body.status).toBe('queued');
  });

  it('recovers from 409 by looking up the existing analysis by hash', async () => {
    server.use(
      http.post('https://www.virustotal.com/api/v3/files', () =>
        HttpResponse.json(
          { error: { code: 'AlreadyExistsError', message: 'dup' } },
          { status: 409 },
        ),
      ),
      http.get('https://www.virustotal.com/api/v3/files/:hash', () =>
        HttpResponse.json({
          data: {
            attributes: {
              last_analysis_id: 'cached-analysis',
              last_analysis_stats: { malicious: 0, suspicious: 0, undetected: 1, harmless: 0 },
            },
          },
        }),
      ),
    );
    const r = await request(buildApp())
      .post('/api/scans')
      .attach('file', Buffer.from('dup'), 'dup.txt');
    expect(r.status).toBe(202);
    expect(r.body.status).toBe('completed');
  });

  it('rejects multipart without any file', async () => {
    const r = await request(buildApp())
      .post('/api/scans')
      .field('notafile', 'bar');
    expect(r.status).toBe(400);
  });
});
