import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { Readable } from 'node:stream';
import {
  uploadToVt,
  getAnalysis,
  getFileByHash,
  VtAlreadySubmittedError,
} from '../../src/services/virustotal.js';

const server = setupServer();
beforeEach(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  server.close();
});

describe('virustotal client', () => {
  it('uploads a stream and returns analysis id', async () => {
    server.use(
      http.post('https://www.virustotal.com/api/v3/files', async ({ request }) => {
        expect(request.headers.get('x-apikey')).toBe('key-abc');
        expect(request.headers.get('content-type')).toMatch(/^multipart\/form-data/);
        return HttpResponse.json({ data: { id: 'analysis-xyz' } }, { status: 200 });
      }),
    );
    const stream = Readable.from(Buffer.from('file bytes'));
    const id = await uploadToVt({
      apiKey: 'key-abc',
      filename: 'sample.js',
      stream,
    });
    expect(id).toBe('analysis-xyz');
  });

  it('fetches an analysis by id', async () => {
    server.use(
      http.get('https://www.virustotal.com/api/v3/analyses/analysis-xyz', ({ request }) => {
        expect(request.headers.get('x-apikey')).toBe('key-abc');
        return HttpResponse.json({
          data: {
            id: 'analysis-xyz',
            attributes: {
              status: 'completed',
              stats: { malicious: 1, suspicious: 0, undetected: 60, harmless: 0 },
              results: {},
            },
          },
        });
      }),
    );
    const r = await getAnalysis({ apiKey: 'key-abc', analysisId: 'analysis-xyz' });
    expect(r.status).toBe('completed');
    expect(r.stats.malicious).toBe(1);
  });

  it('throws on non-2xx upload response', async () => {
    server.use(
      http.post('https://www.virustotal.com/api/v3/files', () =>
        HttpResponse.json({ error: { message: 'unauthorized' } }, { status: 401 }),
      ),
    );
    await expect(
      uploadToVt({
        apiKey: 'bad',
        filename: 'f',
        stream: Readable.from(Buffer.from('x')),
      }),
    ).rejects.toThrow();
  });

  it('normalizes queued/running statuses', async () => {
    server.use(
      http.get('https://www.virustotal.com/api/v3/analyses/a-q', () =>
        HttpResponse.json({
          data: {
            id: 'a-q',
            attributes: {
              status: 'queued',
              stats: { malicious: 0, suspicious: 0, undetected: 0, harmless: 0 },
            },
          },
        }),
      ),
    );
    const r = await getAnalysis({ apiKey: 'k', analysisId: 'a-q' });
    expect(r.status).toBe('queued');
  });

  it('throws VtAlreadySubmittedError on upload 409 so callers can recover', async () => {
    server.use(
      http.post('https://www.virustotal.com/api/v3/files', () =>
        HttpResponse.json(
          {
            error: {
              code: 'AlreadyExistsError',
              message: 'Already being submitted for scanning',
            },
          },
          { status: 409 },
        ),
      ),
    );
    await expect(
      uploadToVt({
        apiKey: 'k',
        filename: 'f',
        stream: Readable.from(Buffer.from('x')),
      }),
    ).rejects.toBeInstanceOf(VtAlreadySubmittedError);
  });

  it('getFileByHash returns analysis id and cached stats/results', async () => {
    server.use(
      http.get('https://www.virustotal.com/api/v3/files/abc123', ({ request }) => {
        expect(request.headers.get('x-apikey')).toBe('k');
        return HttpResponse.json({
          data: {
            id: 'abc123',
            type: 'file',
            attributes: {
              last_analysis_id: 'analysis-from-cache',
              last_analysis_stats: {
                malicious: 3,
                suspicious: 0,
                undetected: 55,
                harmless: 0,
              },
              last_analysis_results: {
                Kaspersky: {
                  engine_name: 'Kaspersky',
                  category: 'malicious',
                  result: 'Trojan',
                },
              },
            },
          },
        });
      }),
    );
    const r = await getFileByHash({ apiKey: 'k', hash: 'abc123' });
    expect(r).not.toBeNull();
    expect(r?.analysisId).toBe('analysis-from-cache');
    expect(r?.stats?.malicious).toBe(3);
    expect(Object.keys(r?.results ?? {})).toContain('Kaspersky');
  });

  it('getFileByHash returns null when VT has never seen the file (404)', async () => {
    server.use(
      http.get('https://www.virustotal.com/api/v3/files/missing', () =>
        HttpResponse.json({ error: { message: 'not found' } }, { status: 404 }),
      ),
    );
    const r = await getFileByHash({ apiKey: 'k', hash: 'missing' });
    expect(r).toBeNull();
  });

  it('getFileByHash returns null when the file exists but has no analysis yet', async () => {
    server.use(
      http.get('https://www.virustotal.com/api/v3/files/no-analysis', () =>
        HttpResponse.json({
          data: { id: 'no-analysis', type: 'file', attributes: {} },
        }),
      ),
    );
    const r = await getFileByHash({ apiKey: 'k', hash: 'no-analysis' });
    expect(r).toBeNull();
  });

  it('retries uploadToVt on 5xx and eventually succeeds', async () => {
    let call = 0;
    server.use(
      http.post('https://www.virustotal.com/api/v3/files', () => {
        call++;
        if (call < 3) {
          return HttpResponse.json({ error: { message: 'upstream' } }, { status: 503 });
        }
        return HttpResponse.json({ data: { id: 'a-retry' } });
      }),
    );
    const id = await uploadToVt({
      apiKey: 'k',
      filename: 'f',
      stream: Readable.from(Buffer.from('x')),
    });
    expect(id).toBe('a-retry');
    expect(call).toBe(3);
  });

  it('does not retry uploadToVt on 401 client errors', async () => {
    let call = 0;
    server.use(
      http.post('https://www.virustotal.com/api/v3/files', () => {
        call++;
        return HttpResponse.json({ error: { message: 'unauthorized' } }, { status: 401 });
      }),
    );
    await expect(
      uploadToVt({ apiKey: 'bad', filename: 'f', stream: Readable.from(Buffer.from('x')) }),
    ).rejects.toThrow();
    expect(call).toBe(1);
  });

  it('retries getAnalysis on 429 and eventually succeeds', async () => {
    let call = 0;
    server.use(
      http.get('https://www.virustotal.com/api/v3/analyses/a-rate', () => {
        call++;
        if (call < 2) return HttpResponse.json({ error: { message: 'rate' } }, { status: 429 });
        return HttpResponse.json({
          data: {
            id: 'a-rate',
            attributes: {
              status: 'completed',
              stats: { malicious: 0, suspicious: 0, undetected: 1, harmless: 0 },
            },
          },
        });
      }),
    );
    const r = await getAnalysis({ apiKey: 'k', analysisId: 'a-rate' });
    expect(r.status).toBe('completed');
    expect(call).toBe(2);
  });
});
