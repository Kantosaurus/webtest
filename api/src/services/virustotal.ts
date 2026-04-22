import FormData from 'form-data';
import type { Readable } from 'node:stream';

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

export async function uploadToVt(opts: {
  apiKey: string;
  filename: string;
  stream: Readable;
  contentType?: string;
}): Promise<string> {
  const form = new FormData();
  form.append('file', opts.stream, {
    filename: opts.filename,
    contentType: opts.contentType ?? 'application/octet-stream',
  });
  // form-data is a Node stream; fetch (undici) accepts it as a body and will
  // stream it through without buffering the full payload in memory.
  const res = await fetch(`${VT_BASE}/files`, {
    method: 'POST',
    headers: { ...form.getHeaders(), 'x-apikey': opts.apiKey, accept: 'application/json' },
    // @ts-expect-error undici's fetch accepts Node.js Readable streams as body
    body: form,
    // @ts-expect-error undici-specific option to allow streaming request body
    duplex: 'half',
  });
  const json = (await res.json()) as {
    data?: { id?: string };
    error?: { message?: string };
  };
  if (!res.ok) {
    throw new Error(`VT upload failed: ${res.status} ${json?.error?.message ?? ''}`);
  }
  const id = json?.data?.id;
  if (!id) throw new Error('VT upload: missing analysis id');
  return id;
}

export async function getAnalysis(opts: {
  apiKey: string;
  analysisId: string;
}): Promise<Analysis> {
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
    throw new Error(`VT analysis fetch failed: ${res.status} ${json?.error?.message ?? ''}`);
  }
  const a = json?.data?.attributes;
  const id = json?.data?.id;
  if (!a || !id) throw new Error('VT analysis: malformed response');
  const rawStatus = a.status ?? 'queued';
  const status: Analysis['status'] =
    rawStatus === 'completed' ? 'completed' : rawStatus === 'queued' ? 'queued' : 'running';
  return {
    id,
    status,
    stats: a.stats ?? { malicious: 0, suspicious: 0, undetected: 0, harmless: 0 },
    results: a.results,
    raw: json.data,
  };
}
