import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { securityHeaders } from '../../src/middleware/securityHeaders.js';

function app() {
  const a = express();
  a.use(securityHeaders);
  a.get('/t', (_req, res) => res.json({ ok: true }));
  return a;
}

describe('securityHeaders middleware', () => {
  it('sets X-Content-Type-Options: nosniff', async () => {
    const r = await request(app()).get('/t');
    expect(r.headers['x-content-type-options']).toBe('nosniff');
  });

  it('sets X-Frame-Options: DENY', async () => {
    const r = await request(app()).get('/t');
    expect(r.headers['x-frame-options']).toBe('DENY');
  });

  it('sets Referrer-Policy', async () => {
    const r = await request(app()).get('/t');
    expect(r.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
  });

  it('sets Permissions-Policy', async () => {
    const r = await request(app()).get('/t');
    expect(r.headers['permissions-policy']).toContain('camera=()');
  });

  it('does not set HSTS outside production', async () => {
    const r = await request(app()).get('/t');
    expect(r.headers['strict-transport-security']).toBeUndefined();
  });
});
