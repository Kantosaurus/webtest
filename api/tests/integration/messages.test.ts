import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { buildApp } from '../../src/app.js';
import { __resetForTests, createScan, updateScanStatus } from '../../src/services/scans.js';
import {
  __setGeminiFactoryForTests,
  type createGeminiClient,
} from '../../src/services/gemini.js';

type Factory = typeof createGeminiClient;

const stubFactory = (tokens: string[]): Factory =>
  (() => ({
    async *stream() {
      for (const t of tokens) yield t;
    },
  })) as unknown as Factory;

beforeEach(() => __resetForTests());
afterEach(() => __setGeminiFactoryForTests(null));

describe('messages endpoints', () => {
  it('POST streams tokens then done and appends assistant message', async () => {
    __setGeminiFactoryForTests(stubFactory(['Hello ', 'world']));

    const scan = createScan({ vtAnalysisId: 'a', fileName: 'f', fileSha256: 'h', fileSize: 1 });
    updateScanStatus(scan.id, 'completed', { attributes: { stats: {}, results: {} } });

    const r = await request(buildApp())
      .post(`/api/scans/${scan.id}/messages`)
      .send({ content: 'what is it?' });

    expect(r.status).toBe(200);
    expect(r.text).toContain('event: token');
    expect(r.text).toContain('Hello');
    expect(r.text).toContain('event: done');
  });

  it('GET returns empty list for a new scan', async () => {
    const scan = createScan({ vtAnalysisId: 'a', fileName: 'f', fileSha256: 'h', fileSize: 1 });
    const r = await request(buildApp()).get(`/api/scans/${scan.id}/messages`);
    expect(r.status).toBe(200);
    expect(r.body).toEqual([]);
  });

  it('DELETE removes a message', async () => {
    __setGeminiFactoryForTests(stubFactory(['x']));

    const scan = createScan({ vtAnalysisId: 'a', fileName: 'f', fileSha256: 'h', fileSize: 1 });
    updateScanStatus(scan.id, 'completed', { attributes: { stats: {}, results: {} } });
    await request(buildApp()).post(`/api/scans/${scan.id}/messages`).send({ content: 'hi' });
    const list = await request(buildApp()).get(`/api/scans/${scan.id}/messages`);
    const msgId = list.body[0]?.id as string;
    const d = await request(buildApp()).delete(`/api/scans/${scan.id}/messages/${msgId}`);
    expect(d.status).toBe(204);
  });

  it('POST rejects content > 4000 chars', async () => {
    const scan = createScan({ vtAnalysisId: 'a', fileName: 'f', fileSha256: 'h', fileSize: 1 });
    const r = await request(buildApp())
      .post(`/api/scans/${scan.id}/messages`)
      .send({ content: 'x'.repeat(4001) });
    expect(r.status).toBe(400);
  });
});
