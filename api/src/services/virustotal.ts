import FormData from 'form-data';
import { PassThrough, type Readable } from 'node:stream';
import { withRetry } from '../lib/retry.js';
import { vtRequestTotal } from './metrics.js';

const VT_BASE = 'https://www.virustotal.com/api/v3';

export interface AnalysisStats {
  malicious: number;
  suspicious: number;
  undetected: number;
  harmless: number;
}

export interface Analysis {
  id: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  stats: AnalysisStats;
  results?: Record<string, { category: string; result: string | null; engine_name: string }>;
  raw: unknown;
}

/**
 * Thrown when VirusTotal rejects a POST /files with 409 because the file is
 * already being analyzed (typically from a concurrent upload, since VT dedupes
 * by hash globally). The caller can recover by fetching the existing analysis
 * via `getFileByHash` using the SHA-256 of the file just uploaded.
 */
export class VtAlreadySubmittedError extends Error {
  constructor(public readonly vtMessage: string) {
    super(`VT already scanning: ${vtMessage}`);
    this.name = 'VtAlreadySubmittedError';
  }
}

class VtHttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'VtHttpError';
  }
}

/** Retry on VT 429 and 5xx. 409 is a signal, not a failure; other 4xx are terminal. */
const isVtTransient = (err: unknown): boolean => {
  if (!(err instanceof VtHttpError)) return false;
  return err.status === 429 || err.status >= 500;
};

const vtShouldRetry = (err: unknown): boolean => {
  const retryable = isVtTransient(err);
  vtRequestTotal.inc({ outcome: retryable ? 'retry' : 'fail' });
  return retryable;
};

export async function uploadToVt(opts: {
  apiKey: string;
  filename: string;
  stream: Readable;
  contentType?: string;
}): Promise<string> {
  // Buffer the stream into memory so retries can re-send the same bytes.
  // Max upload size is capped at 32MB upstream, so worst-case memory use is
  // bounded by that * the upload rate limit.
  const chunks: Buffer[] = [];
  for await (const chunk of opts.stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const bodyBuf = Buffer.concat(chunks);

  return withRetry(
    async () => {
      const form = new FormData();
      form.append('file', bodyBuf, {
        filename: opts.filename,
        contentType: opts.contentType ?? 'application/octet-stream',
      });
      // form-data's CombinedStream emits a mix of Buffer and string chunks, which
      // undici's fetch body consumer cannot handle natively. Pipe through a
      // PassThrough (which emits only Buffers) so the body is correctly framed.
      const body = new PassThrough();
      form.pipe(body);
      const init = {
        method: 'POST',
        headers: { ...form.getHeaders(), 'x-apikey': opts.apiKey, accept: 'application/json' },
        body,
        duplex: 'half',
      } as unknown as RequestInit;
      const res = await fetch(`${VT_BASE}/files`, init);
      const json = (await res.json()) as {
        data?: { id?: string };
        error?: { code?: string; message?: string };
      };
      if (res.status === 409) {
        throw new VtAlreadySubmittedError(json?.error?.message ?? 'already being scanned');
      }
      if (!res.ok) {
        throw new VtHttpError(
          res.status,
          `VT upload failed: ${res.status} ${json?.error?.message ?? ''}`,
        );
      }
      const id = json?.data?.id;
      if (!id) throw new Error('VT upload: missing analysis id');
      vtRequestTotal.inc({ outcome: 'ok' });
      return id;
    },
    { retries: 3, baseMs: 500, shouldRetry: vtShouldRetry },
  );
}

export interface FileByHashResult {
  analysisId: string;
  stats?: AnalysisStats;
  results?: Analysis['results'];
  raw: unknown;
}

/**
 * Look up a file by SHA-256 (or SHA-1/MD5). Returns the most recent analysis
 * id and cached stats/results if VT has seen this file before, or null if it
 * hasn't. Used as a fallback when POST /files returns 409.
 */
export async function getFileByHash(opts: {
  apiKey: string;
  hash: string;
}): Promise<FileByHashResult | null> {
  return withRetry(
    async () => {
      const res = await fetch(`${VT_BASE}/files/${opts.hash}`, {
        headers: { 'x-apikey': opts.apiKey, accept: 'application/json' },
      });
      if (res.status === 404) return null;
      const json = (await res.json()) as {
        data?: {
          attributes?: {
            last_analysis_id?: string;
            last_analysis_stats?: AnalysisStats;
            last_analysis_results?: Analysis['results'];
          };
        };
        error?: { message?: string };
      };
      if (!res.ok) {
        throw new VtHttpError(
          res.status,
          `VT file lookup failed: ${res.status} ${json?.error?.message ?? ''}`,
        );
      }
      const analysisId = json?.data?.attributes?.last_analysis_id;
      if (!analysisId) return null;
      vtRequestTotal.inc({ outcome: 'ok' });
      return {
        analysisId,
        stats: json.data?.attributes?.last_analysis_stats,
        results: json.data?.attributes?.last_analysis_results,
        raw: json.data,
      };
    },
    { retries: 3, baseMs: 500, shouldRetry: vtShouldRetry },
  );
}

export async function getAnalysis(opts: {
  apiKey: string;
  analysisId: string;
}): Promise<Analysis> {
  return withRetry(
    async () => {
      const res = await fetch(`${VT_BASE}/analyses/${opts.analysisId}`, {
        headers: { 'x-apikey': opts.apiKey, accept: 'application/json' },
      });
      const json = (await res.json()) as {
        data?: {
          id?: string;
          attributes?: {
            status?: string;
            stats?: AnalysisStats;
            results?: Analysis['results'];
          };
        };
        error?: { message?: string };
      };
      if (!res.ok) {
        throw new VtHttpError(
          res.status,
          `VT analysis fetch failed: ${res.status} ${json?.error?.message ?? ''}`,
        );
      }
      const a = json?.data?.attributes;
      const id = json?.data?.id;
      if (!a || !id) throw new Error('VT analysis: malformed response');
      const rawStatus = a.status ?? 'queued';
      const status: Analysis['status'] =
        rawStatus === 'completed' ? 'completed' : rawStatus === 'queued' ? 'queued' : 'running';
      vtRequestTotal.inc({ outcome: 'ok' });
      return {
        id,
        status,
        stats: a.stats ?? { malicious: 0, suspicious: 0, undetected: 0, harmless: 0 },
        results: a.results,
        raw: json.data,
      };
    },
    { retries: 3, baseMs: 500, shouldRetry: vtShouldRetry },
  );
}
