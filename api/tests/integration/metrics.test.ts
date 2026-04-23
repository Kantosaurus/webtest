import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { buildApp } from '../../src/app.js';

describe('/metrics endpoint', () => {
  it('returns Prometheus text format with expected counters', async () => {
    const r = await request(buildApp()).get('/metrics');
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toMatch(/^text\/plain/);
    expect(r.text).toContain('webtest_upload_total');
    expect(r.text).toContain('webtest_chat_messages_total');
    expect(r.text).toContain('webtest_rate_limit_rejected_total');
    expect(r.text).toContain('process_cpu_user_seconds_total');
  });
});
