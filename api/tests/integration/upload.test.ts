import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { buildApp } from '../../src/app.js';

describe('upload endpoint hardening', () => {
  it('rejects non-multipart content-type with 400', async () => {
    const app = buildApp();
    const r = await request(app)
      .post('/api/scans')
      .set('content-type', 'application/json')
      .send({ not: 'allowed' });
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('rejects oversize uploads by content-length before streaming', async () => {
    const app = buildApp();
    const r = await request(app)
      .post('/api/scans')
      .set('content-type', 'multipart/form-data; boundary=x')
      .set('content-length', String(33 * 1024 * 1024));
    expect(r.status).toBe(413);
    expect(r.body.error.code).toBe('FILE_TOO_LARGE');
  });
});
