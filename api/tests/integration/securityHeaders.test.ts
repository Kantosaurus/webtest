import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { buildApp } from '../../src/app.js';

describe('security headers on every response', () => {
  const paths = ['/healthz', '/api/scans/nonexistent'];
  for (const p of paths) {
    it(`sets expected headers on GET ${p}`, async () => {
      const r = await request(buildApp()).get(p);
      expect(r.headers['x-content-type-options']).toBe('nosniff');
      expect(r.headers['x-frame-options']).toBe('DENY');
      expect(r.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    });
  }
});
