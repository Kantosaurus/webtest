import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { Readable } from 'node:stream';
import { uploadToVt, getAnalysis } from '../../src/services/virustotal.js';

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
});
