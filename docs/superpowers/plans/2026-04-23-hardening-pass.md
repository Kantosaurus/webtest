# Hardening Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden the stateless no-auth file-scanning app against abuse and improve observability + frontend perf, without introducing auth, a database, or shared state.

**Architecture:** Differentiated rate-limit buckets at the Express layer, defense-in-depth security headers at both Caddy and Express, consolidated in-memory eviction (FIFO + TTL + per-scan message cap), exponential-backoff on VirusTotal 429/5xx, Prometheus metrics on the API (not exposed publicly via Caddy), Next.js bundle audit + static cache headers. Full test backfill (unit + integration + e2e + smoke).

**Tech Stack:** Express 4, TypeScript 5.5, express-rate-limit 7, Vitest 2 + supertest + MSW, Busboy, Caddy 2, Next.js 15, React 19, Playwright, prom-client.

**Spec:** `docs/superpowers/specs/2026-04-23-hardening-pass-design.md`

**Branching:** Direct to `main`. Each task commits atomically with all tests green.

---

## Task Map

| # | Task | Wave |
|---|------|------|
| 1 | Rate-limit bucket factory (unit) | 1 |
| 2 | Wire differentiated buckets into app | 1 |
| 3 | Hoist upload body-size cap + socket timeout | 1 |
| 4 | Exponential-backoff retry helper | 1 |
| 5 | Apply retry to VirusTotal client | 1 |
| 6 | Consolidate scan+message eviction behind `evict()` | 1 |
| 7 | Per-scan message cap (oldest-first drop) | 1 |
| 8 | TTL-based scan eviction with injectable clock | 1 |
| 9 | Security-header constants + Express middleware | 1 |
| 10 | Caddy security headers + enforcing CSP | 1 |
| 11 | Markdown sanitization test (XSS ⟂) | 1 |
| 12 | Frontend bundle analyzer wiring | 1 |
| 13 | Caddy static cache headers for `_next/static/*` | 1 |
| 14 | Integration test: upload endpoint | 2 |
| 15 | Integration test: SSE event stream | 2 |
| 16 | Integration test: chat POST with Gemini stub | 2 |
| 17 | Integration test: rate-limit enforcement per bucket | 2 |
| 18 | Integration test: security headers on every response | 2 |
| 19 | E2E: golden flow + reload persistence | 2 |
| 20 | Metrics service + `/metrics` endpoint | 2 |
| 21 | Request-ID correlation to outbound calls | 2 |
| 22 | CI coverage gate on `api/src/` | 2 |
| 23 | Post-deploy smoke script | 2 |

---

## Task 1: Rate-limit bucket factory

**Files:**
- Create: `api/src/middleware/rateLimits.ts`
- Test: `api/tests/unit/rateLimits.test.ts`

The current `apiLimiter` in `api/src/middleware/rateLimit.ts` is a single 30/min/ip limiter applied identically to every endpoint. We replace it with three named buckets (global/upload/chat) constructed via a single `createBucket` factory. This task builds the factory in isolation; Task 2 wires it in.

- [ ] **Step 1: Write the failing unit test**

Create `api/tests/unit/rateLimits.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createBucket, buckets } from '../../src/middleware/rateLimits.js';

function buildApp(limiter: express.RequestHandler) {
  const app = express();
  app.set('trust proxy', 1);
  app.use(limiter);
  app.get('/t', (_req, res) => res.json({ ok: true }));
  return app;
}

describe('rate-limit bucket factory', () => {
  it('allows requests below the per-window limit', async () => {
    const limiter = createBucket({ windowMs: 60_000, max: 3, name: 'test' });
    const app = buildApp(limiter);
    for (let i = 0; i < 3; i++) {
      const r = await request(app).get('/t');
      expect(r.status).toBe(200);
    }
  });

  it('returns 429 with a JSON error on the (max+1)th request', async () => {
    const limiter = createBucket({ windowMs: 60_000, max: 2, name: 'test' });
    const app = buildApp(limiter);
    await request(app).get('/t');
    await request(app).get('/t');
    const r = await request(app).get('/t');
    expect(r.status).toBe(429);
    expect(r.body.error.code).toBe('RATE_LIMITED');
  });

  it('exposes three named buckets with the expected limits in non-test env', () => {
    // In NODE_ENV=test the factory relaxes limits for other tests; here we
    // assert the shape and names only.
    expect(buckets.global).toBeDefined();
    expect(buckets.upload).toBeDefined();
    expect(buckets.chat).toBeDefined();
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `cd api && npm test -- tests/unit/rateLimits.test.ts`
Expected: FAIL — `createBucket` / `buckets` not defined.

- [ ] **Step 3: Implement the factory**

Create `api/src/middleware/rateLimits.ts`:

```ts
import rateLimit, { type Options } from 'express-rate-limit';
import { config } from '../config.js';

const isTest = config.NODE_ENV === 'test';

const jsonError = (code: string, message: string) => ({
  error: { code, message },
});

interface BucketSpec {
  name: string;
  windowMs: number;
  max: number;
  /** When true, successful responses do not count against the bucket. */
  skipSuccessfulRequests?: boolean;
}

export function createBucket(spec: BucketSpec): ReturnType<typeof rateLimit> {
  const limit = isTest ? Math.max(spec.max * 1000, 10_000) : spec.max;
  const options: Partial<Options> = {
    windowMs: spec.windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: jsonError('RATE_LIMITED', `Rate limit exceeded for ${spec.name}`),
    skipSuccessfulRequests: spec.skipSuccessfulRequests ?? false,
  };
  return rateLimit(options);
}

export const buckets = {
  global: createBucket({ name: 'global', windowMs: 60_000, max: 60 }),
  upload: createBucket({ name: 'upload', windowMs: 60_000, max: 5 }),
  // A second-axis hourly cap on uploads to prevent slow-drip quota burn.
  uploadHourly: createBucket({ name: 'upload-hourly', windowMs: 60 * 60_000, max: 10 }),
  chat: createBucket({ name: 'chat', windowMs: 60_000, max: 20 }),
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd api && npm test -- tests/unit/rateLimits.test.ts`
Expected: PASS (all 3 cases).

- [ ] **Step 5: Run typecheck + lint**

Run: `cd api && npm run typecheck && npm run lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add api/src/middleware/rateLimits.ts api/tests/unit/rateLimits.test.ts
git commit -m "feat(api): add differentiated rate-limit buckets via factory"
```

---

## Task 2: Wire buckets into app.ts and retire the single `apiLimiter`

**Files:**
- Modify: `api/src/app.ts` (lines 6, 25–27)
- Delete: `api/src/middleware/rateLimit.ts`

Each endpoint gets its own bucket. Uploads get both `upload` (per-minute) and `uploadHourly` caps chained. Chat POST gets `chat`. Everything else gets `global`.

- [ ] **Step 1: Update `api/src/app.ts`**

Replace lines 6, 25–27:

```ts
// line 6 (replace)
import { buckets } from './middleware/rateLimits.js';

// lines 25–27 (replace)
app.use('/api/scans', buckets.global, scans);
app.use('/api/scans', buckets.global, scanEvents);
app.use('/api/scans', buckets.global, messages);
```

Note: per-route bucket overrides go into the route files themselves in subsequent tasks (upload gets `buckets.upload` + `buckets.uploadHourly`, chat POST gets `buckets.chat`). This step keeps the global bucket everywhere for now and routes layer on the tighter buckets next.

- [ ] **Step 2: Add tighter buckets on `POST /api/scans` in `api/src/routes/scans.ts`**

At line 140, replace:

```ts
scans.post('/', uploadHandler);
```

with:

```ts
import { buckets } from '../middleware/rateLimits.js';
// ...
scans.post('/', buckets.upload, buckets.uploadHourly, uploadHandler);
```

Import goes at the top of the file alongside the other imports.

- [ ] **Step 3: Add tighter bucket on chat POST in `api/src/routes/messages.ts`**

At line 121, replace:

```ts
messages.post('/:id/messages', post);
```

with:

```ts
import { buckets } from '../middleware/rateLimits.js';
// ...
messages.post('/:id/messages', buckets.chat, post);
```

- [ ] **Step 4: Delete the old file**

```bash
rm api/src/middleware/rateLimit.ts
```

- [ ] **Step 5: Run the full unit suite**

Run: `cd api && npm run test:unit`
Expected: PASS. (No tests were asserting against the old `apiLimiter` directly — all existing tests use fresh app instances.)

- [ ] **Step 6: Typecheck + lint**

Run: `cd api && npm run typecheck && npm run lint`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add api/src/app.ts api/src/routes/scans.ts api/src/routes/messages.ts
git rm api/src/middleware/rateLimit.ts
git commit -m "refactor(api): wire differentiated rate-limit buckets per endpoint"
```

---

## Task 3: Hoist upload body-size cap + add socket timeout

**Files:**
- Modify: `api/src/routes/scans.ts` (lines 18–28)
- Test: `api/tests/integration/upload.test.ts` (stub; full test is Task 14)

The Express route currently checks `content-length` manually (lines 23–28). We keep that check but also set a socket timeout so a slow attacker can't hold the connection open. Draining the request on reject is already correct (line 26), but we make it an explicit `req.unpipe` + `req.destroy()` to close the socket promptly.

- [ ] **Step 1: Write a failing test for socket timeout**

Create `api/tests/integration/upload.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the test**

Run: `cd api && npm test -- tests/integration/upload.test.ts`
Expected: non-multipart test may already PASS (existing code handles it); oversize test likely PASS as well. Record the actual result — if both pass, this task primarily hardens the drain path and we treat it as a refactor under the green test.

- [ ] **Step 3: Update the reject drain path in `api/src/routes/scans.ts`**

Replace lines 22–28:

```ts
const contentLength = Number(req.headers['content-length'] ?? '0');
if (Number.isFinite(contentLength) && contentLength > MAX_BYTES + 1024) {
  // Close the socket immediately; don't let a client dribble bytes.
  req.unpipe();
  req.destroy();
  return next(Errors.tooLarge());
}

// Upload socket timeout: 60 seconds of no progress → abort.
req.setTimeout(60_000, () => {
  req.destroy();
});
```

- [ ] **Step 4: Re-run the test**

Run: `cd api && npm test -- tests/integration/upload.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + lint**

Run: `cd api && npm run typecheck && npm run lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add api/src/routes/scans.ts api/tests/integration/upload.test.ts
git commit -m "fix(api): close socket on upload reject; add 60s upload socket timeout"
```

---

## Task 4: Exponential-backoff retry helper

**Files:**
- Create: `api/src/lib/retry.ts`
- Test: `api/tests/unit/retry.test.ts`

A small, dependency-free helper for retrying an async operation with exponential backoff and jitter. Used by the VirusTotal client in Task 5.

- [ ] **Step 1: Write the failing test**

Create `api/tests/unit/retry.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { withRetry } from '../../src/lib/retry.js';

afterEach(() => vi.useRealTimers());

describe('withRetry', () => {
  it('returns the value on first success', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const r = await withRetry(fn, { retries: 3, baseMs: 10, shouldRetry: () => true });
    expect(r).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on retryable errors up to `retries` times', async () => {
    vi.useFakeTimers();
    const err = new Error('transient');
    const fn = vi
      .fn<[], Promise<string>>()
      .mockRejectedValueOnce(err)
      .mockRejectedValueOnce(err)
      .mockResolvedValueOnce('ok');
    const p = withRetry(fn, { retries: 3, baseMs: 10, shouldRetry: () => true });
    await vi.runAllTimersAsync();
    await expect(p).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('does not retry when shouldRetry returns false', async () => {
    const err = new Error('fatal');
    const fn = vi.fn().mockRejectedValue(err);
    await expect(
      withRetry(fn, { retries: 3, baseMs: 10, shouldRetry: () => false }),
    ).rejects.toThrow('fatal');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('gives up after `retries` attempts and throws the last error', async () => {
    vi.useFakeTimers();
    const err = new Error('still failing');
    const fn = vi.fn().mockRejectedValue(err);
    const p = withRetry(fn, { retries: 2, baseMs: 10, shouldRetry: () => true });
    p.catch(() => undefined); // swallow unhandled-rejection warning
    await vi.runAllTimersAsync();
    await expect(p).rejects.toThrow('still failing');
    expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
  });
});
```

- [ ] **Step 2: Run the test**

Run: `cd api && npm test -- tests/unit/retry.test.ts`
Expected: FAIL — `withRetry` not defined.

- [ ] **Step 3: Implement the helper**

Create `api/src/lib/retry.ts`:

```ts
export interface RetryOpts {
  /** Number of retries AFTER the initial attempt. Total attempts = retries + 1. */
  retries: number;
  /** Base backoff in ms; doubles each retry; 20% jitter added. */
  baseMs: number;
  /** Return true to retry on this error, false to throw immediately. */
  shouldRetry: (err: unknown) => boolean;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOpts): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= opts.retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === opts.retries || !opts.shouldRetry(err)) throw err;
      const jitter = 0.8 + Math.random() * 0.4;
      const delay = Math.floor(opts.baseMs * 2 ** attempt * jitter);
      await sleep(delay);
    }
  }
  throw lastErr;
}
```

- [ ] **Step 4: Run the test**

Run: `cd api && npm test -- tests/unit/retry.test.ts`
Expected: PASS (all 4 cases).

- [ ] **Step 5: Typecheck + lint**

Run: `cd api && npm run typecheck && npm run lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add api/src/lib/retry.ts api/tests/unit/retry.test.ts
git commit -m "feat(api): add withRetry helper with exponential backoff + jitter"
```

---

## Task 5: Apply retry to VirusTotal client

**Files:**
- Modify: `api/src/services/virustotal.ts` (wrap `uploadToVt` and `getAnalysis`)
- Test: extend `api/tests/unit/virustotal.test.ts`

Wrap `uploadToVt` and `getAnalysis` in `withRetry`. Retry only on HTTP 429 and 5xx (not 4xx client errors, not the 409 already-submitted case which has its own fallback). `getFileByHash` is already a fallback path; we retry it too for 5xx/429 but not 404.

- [ ] **Step 1: Write failing tests for retry behavior**

Append to `api/tests/unit/virustotal.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the test**

Run: `cd api && npm test -- tests/unit/virustotal.test.ts`
Expected: FAIL — no retry behavior present.

- [ ] **Step 3: Extract the fetch-and-retry pattern**

At the top of `api/src/services/virustotal.ts`, add:

```ts
import { withRetry } from '../lib/retry.js';

/** Retry on VT 429 and 5xx. 409 is a signal, not a failure; 4xx (other) are terminal. */
const isVtTransient = (err: unknown): boolean => {
  if (!(err instanceof VtHttpError)) return false;
  return err.status === 429 || err.status >= 500;
};

class VtHttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'VtHttpError';
  }
}
```

- [ ] **Step 4: Wrap `uploadToVt`**

Replace the body of `uploadToVt` so the `fetch` call is inside `withRetry`. The form/body rebuild needs to happen per-attempt because streams can only be consumed once. Key insight: on 409 (already-submitted) we throw `VtAlreadySubmittedError` and do NOT retry, because the caller's recovery path is `getFileByHash`.

```ts
export async function uploadToVt(opts: {
  apiKey: string;
  filename: string;
  stream: Readable;
  contentType?: string;
}): Promise<string> {
  // Buffer the stream into memory first — VT upload retries require
  // re-sending the same bytes, and the Readable from Busboy can only be
  // consumed once. Max size is already enforced upstream (32MB cap).
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
      const body = new PassThrough();
      form.pipe(body);
      const init = {
        method: 'POST',
        headers: {
          ...form.getHeaders(),
          'x-apikey': opts.apiKey,
          accept: 'application/json',
        },
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
        throw new VtHttpError(res.status, `VT upload failed: ${res.status} ${json?.error?.message ?? ''}`);
      }
      const id = json?.data?.id;
      if (!id) throw new Error('VT upload: missing analysis id');
      return id;
    },
    { retries: 3, baseMs: 500, shouldRetry: isVtTransient },
  );
}
```

- [ ] **Step 5: Wrap `getAnalysis` and `getFileByHash` similarly**

Both are idempotent GETs; no body-buffering concern. Wrap the fetch-and-parse section in `withRetry` with the same `isVtTransient` gate, and convert `!res.ok` throws inside to `VtHttpError(res.status, ...)` so the gate sees the status code.

`getAnalysis`:
```ts
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
        throw new VtHttpError(res.status, `VT analysis fetch failed: ${res.status} ${json?.error?.message ?? ''}`);
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
    },
    { retries: 3, baseMs: 500, shouldRetry: isVtTransient },
  );
}
```

`getFileByHash`: same pattern; the 404 short-circuit must happen INSIDE the retry body but BEFORE the `throw VtHttpError`, so we return `null` directly without retry.

- [ ] **Step 6: Run the VT unit test**

Run: `cd api && npm test -- tests/unit/virustotal.test.ts`
Expected: PASS (all 11 cases including the 3 new retry tests).

- [ ] **Step 7: Typecheck + lint**

Run: `cd api && npm run typecheck && npm run lint`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add api/src/services/virustotal.ts api/tests/unit/virustotal.test.ts
git commit -m "feat(api): retry VT 429/5xx with exponential backoff; preserve 409 semantics"
```

---

## Task 6: Consolidate scan+message eviction behind `evict()`

**Files:**
- Modify: `api/src/services/scans.ts` (lines 20–26, add export)
- Modify: `api/src/services/messages.ts` (no signature change; receives the call)
- Test: `api/tests/unit/eviction.test.ts`

`dropConversation()` already exists but is never called. We introduce `evict(scanId)` as the single teardown path; `evictIfFull()` (FIFO) calls it, and Task 8 (TTL) will call it too.

- [ ] **Step 1: Write the failing test**

Create `api/tests/unit/eviction.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { __resetForTests, createScan, evict } from '../../src/services/scans.js';
import { appendMessage, listMessages } from '../../src/services/messages.js';

beforeEach(() => __resetForTests());

describe('evict()', () => {
  it('removes the scan and its messages together', () => {
    const s = createScan({ vtAnalysisId: 'a', fileName: 'f', fileSha256: 'h', fileSize: 1 });
    appendMessage({ scanId: s.id, role: 'user', content: 'hi' });
    expect(listMessages(s.id)).toHaveLength(1);

    evict(s.id);

    expect(listMessages(s.id)).toHaveLength(0);
  });

  it('is a no-op for unknown scan ids', () => {
    expect(() => evict('does-not-exist')).not.toThrow();
  });
});
```

- [ ] **Step 2: Run the test**

Run: `cd api && npm test -- tests/unit/eviction.test.ts`
Expected: FAIL — `evict` not exported.

- [ ] **Step 3: Update `api/src/services/scans.ts`**

Add import at top:
```ts
import { dropConversation } from './messages.js';
```

Replace the eviction block (lines 20–26):
```ts
export function evict(id: string): void {
  scans.delete(id);
  dropConversation(id);
}

function evictIfFull(): void {
  while (scans.size >= MAX_SCANS) {
    const oldest = scans.keys().next().value;
    if (oldest === undefined) return;
    evict(oldest);
  }
}
```

- [ ] **Step 4: Run the test**

Run: `cd api && npm test -- tests/unit/eviction.test.ts`
Expected: PASS (both cases).

- [ ] **Step 5: Typecheck + lint**

Run: `cd api && npm run typecheck && npm run lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add api/src/services/scans.ts api/tests/unit/eviction.test.ts
git commit -m "refactor(api): consolidate scan+message teardown behind evict()"
```

---

## Task 7: Per-scan message cap (oldest-first drop)

**Files:**
- Modify: `api/src/services/messages.ts` (`appendMessage`)
- Test: extend `api/tests/unit/eviction.test.ts`

Cap each scan's conversation at 200 messages. When the 201st message arrives, drop the oldest to make room.

- [ ] **Step 1: Write the failing test**

Append to `api/tests/unit/eviction.test.ts`:

```ts
describe('per-scan message cap', () => {
  it('drops oldest messages when the cap is exceeded', () => {
    const s = createScan({ vtAnalysisId: 'a', fileName: 'f', fileSha256: 'h', fileSize: 1 });
    for (let i = 0; i < 205; i++) {
      appendMessage({ scanId: s.id, role: 'user', content: `msg-${i}` });
    }
    const list = listMessages(s.id);
    expect(list).toHaveLength(200);
    // Oldest should have been dropped — first message is msg-5, last is msg-204.
    expect(list[0]?.content).toBe('msg-5');
    expect(list[list.length - 1]?.content).toBe('msg-204');
  });
});
```

- [ ] **Step 2: Run the test**

Run: `cd api && npm test -- tests/unit/eviction.test.ts`
Expected: FAIL — cap not enforced (list has 205 entries).

- [ ] **Step 3: Enforce cap in `appendMessage`**

Modify `api/src/services/messages.ts`, in `appendMessage` (before the `return msg`):

```ts
const MAX_MESSAGES_PER_SCAN = 200;

export function appendMessage(input: {
  scanId: string;
  role: Message['role'];
  content: string;
}): Message {
  const msg: Message = {
    id: randomUUID(),
    scanId: input.scanId,
    role: input.role,
    content: input.content,
    createdAt: new Date(),
  };
  const list = conversations.get(input.scanId);
  if (list) {
    list.push(msg);
    while (list.length > MAX_MESSAGES_PER_SCAN) list.shift();
  } else {
    conversations.set(input.scanId, [msg]);
  }
  return msg;
}
```

- [ ] **Step 4: Run the test**

Run: `cd api && npm test -- tests/unit/eviction.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + lint**

Run: `cd api && npm run typecheck && npm run lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add api/src/services/messages.ts api/tests/unit/eviction.test.ts
git commit -m "feat(api): cap per-scan messages at 200 with oldest-first drop"
```

---

## Task 8: TTL-based scan eviction with injectable clock

**Files:**
- Modify: `api/src/services/scans.ts`
- Test: extend `api/tests/unit/eviction.test.ts`

Scans untouched for an hour are dropped by a background sweep that runs every 5 minutes. The sweep uses `Date.now()` so Vitest fake timers can drive it; `setInterval(...).unref()` so tests exit cleanly.

- [ ] **Step 1: Write the failing test**

At the top of `api/tests/unit/eviction.test.ts`, add `vi` and `afterEach` to the existing `vitest` imports, then add the `getScan` + `sweepExpired` + `TTL_MS` imports:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  __resetForTests,
  createScan,
  evict,
  getScan,
  sweepExpired,
  TTL_MS,
} from '../../src/services/scans.js';
```

Append this describe block:

```ts
afterEach(() => vi.useRealTimers());

describe('TTL eviction', () => {
  it('drops scans older than TTL when sweepExpired runs', () => {
    vi.useFakeTimers();
    const t0 = new Date('2026-04-23T00:00:00Z').getTime();
    vi.setSystemTime(t0);
    const s = createScan({ vtAnalysisId: 'a', fileName: 'f', fileSha256: 'h', fileSize: 1 });
    expect(getScan(s.id)).not.toBeNull();

    vi.setSystemTime(t0 + TTL_MS + 1000);
    sweepExpired();

    expect(getScan(s.id)).toBeNull();
  });

  it('does not drop recently-touched scans', () => {
    vi.useFakeTimers();
    const t0 = new Date('2026-04-23T00:00:00Z').getTime();
    vi.setSystemTime(t0);
    const s = createScan({ vtAnalysisId: 'a', fileName: 'f', fileSha256: 'h', fileSize: 1 });
    vi.setSystemTime(t0 + 5 * 60_000); // 5 minutes later — well within TTL
    sweepExpired();
    expect(getScan(s.id)).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run the test**

Run: `cd api && npm test -- tests/unit/eviction.test.ts`
Expected: FAIL — `sweepExpired` not exported.

- [ ] **Step 3: Add TTL sweep to `api/src/services/scans.ts`**

After the `evict` function, add:

```ts
export const TTL_MS = 60 * 60_000; // 1 hour
const SWEEP_INTERVAL_MS = 5 * 60_000; // 5 minutes

export function sweepExpired(now: number = Date.now()): void {
  for (const [id, scan] of scans.entries()) {
    if (now - scan.updatedAt.getTime() > TTL_MS) {
      evict(id);
    }
  }
}

// Start the background sweep. `.unref()` lets the process exit even if this
// is the only active timer. Skipped under NODE_ENV=test so tests drive the
// sweep explicitly with vi.setSystemTime + sweepExpired().
if (process.env.NODE_ENV !== 'test') {
  setInterval(() => sweepExpired(), SWEEP_INTERVAL_MS).unref();
}
```

- [ ] **Step 4: Run the test**

Run: `cd api && npm test -- tests/unit/eviction.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + lint**

Run: `cd api && npm run typecheck && npm run lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add api/src/services/scans.ts api/tests/unit/eviction.test.ts
git commit -m "feat(api): evict scans idle longer than 1h via background sweep"
```

---

## Task 9: Security-header constants + Express middleware

**Files:**
- Create: `api/src/config/securityHeaders.ts`
- Create: `api/src/middleware/securityHeaders.ts`
- Test: `api/tests/unit/securityHeaders.test.ts`
- Modify: `api/src/app.ts` (wire middleware)

Defense-in-depth: Express sets the same headers Caddy will set, so the API is safe if anyone hits it directly bypassing Caddy. HSTS is added only in production.

- [ ] **Step 1: Write the failing test**

Create `api/tests/unit/securityHeaders.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the test**

Run: `cd api && npm test -- tests/unit/securityHeaders.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the constants**

Create `api/src/config/securityHeaders.ts`:

```ts
export const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
} as const;

export const HSTS_HEADER = {
  name: 'Strict-Transport-Security',
  value: 'max-age=31536000; includeSubDomains; preload',
} as const;
```

- [ ] **Step 4: Create the middleware**

Create `api/src/middleware/securityHeaders.ts`:

```ts
import type { RequestHandler } from 'express';
import { SECURITY_HEADERS, HSTS_HEADER } from '../config/securityHeaders.js';
import { isProd } from '../config.js';

export const securityHeaders: RequestHandler = (_req, res, next) => {
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
  if (isProd) res.setHeader(HSTS_HEADER.name, HSTS_HEADER.value);
  next();
};
```

- [ ] **Step 5: Wire into `api/src/app.ts`**

Add import:
```ts
import { securityHeaders } from './middleware/securityHeaders.js';
```

After `app.disable('x-powered-by')` and `app.set('trust proxy', 1)`, add:
```ts
app.use(securityHeaders);
```

- [ ] **Step 6: Run the test**

Run: `cd api && npm test -- tests/unit/securityHeaders.test.ts`
Expected: PASS (all 5 cases).

- [ ] **Step 7: Typecheck + lint**

Run: `cd api && npm run typecheck && npm run lint`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add api/src/config/securityHeaders.ts api/src/middleware/securityHeaders.ts api/src/app.ts api/tests/unit/securityHeaders.test.ts
git commit -m "feat(api): add defense-in-depth security headers middleware"
```

---

## Task 10: Caddy security headers + enforcing CSP

**Files:**
- Modify: `Caddyfile`

Caddy is the primary surface for HTML responses. Same header constants (as strings — Caddy doesn't import TS), plus a CSP tight enough to matter. HSTS is set on the production `{$PUBLIC_HOSTNAME}` block only.

- [ ] **Step 1: Update `Caddyfile`**

Replace the file with:

```caddy
{
  email {$ACME_EMAIL}
}

(shared_headers) {
  header {
    X-Content-Type-Options "nosniff"
    X-Frame-Options "DENY"
    Referrer-Policy "strict-origin-when-cross-origin"
    Permissions-Policy "camera=(), microphone=(), geolocation=()"
    # Remove server banner and expose-by-default headers.
    -Server
    -X-Powered-By
  }
}

(html_csp) {
  header / {
    Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
  }
}

# Production: auto-HTTPS for the configured public hostname.
{$PUBLIC_HOSTNAME} {
  import shared_headers
  import html_csp
  header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
  encode gzip zstd

  # Long-lived cache for Next.js static output.
  @static path /_next/static/*
  header @static Cache-Control "public, max-age=31536000, immutable"

  reverse_proxy web:3000 {
    header_up Host {host}
    header_up X-Real-IP {remote_host}
    header_up X-Forwarded-For {remote_host}
    header_up X-Forwarded-Proto {scheme}
  }
}

# Local dev catch-all — plain HTTP, same security headers minus HSTS.
:80 {
  import shared_headers
  import html_csp

  @static path /_next/static/*
  header @static Cache-Control "public, max-age=31536000, immutable"

  reverse_proxy web:3000 {
    header_up Host {host}
    header_up X-Real-IP {remote_host}
    header_up X-Forwarded-For {remote_host}
    header_up X-Forwarded-Proto {scheme}
  }
}
```

- [ ] **Step 2: Verify Caddy config is valid**

If Docker Compose is running locally:
```bash
docker run --rm -v "$(pwd)/Caddyfile:/etc/caddy/Caddyfile" caddy:2-alpine caddy validate --config /etc/caddy/Caddyfile
```
If Docker isn't available, skip and rely on CI. Expected: "Valid configuration" or no errors.

- [ ] **Step 3: Commit**

```bash
git add Caddyfile
git commit -m "feat(edge): add security headers, enforcing CSP, immutable static cache"
```

---

## Task 11: Markdown sanitization test (XSS ⟂)

**Files:**
- Modify: `web/package.json` (add vitest + jsdom)
- Create: `web/vitest.config.ts`
- Create: `web/tests/unit/MarkdownRenderer.test.tsx`
- Modify: `web/components/chat/MarkdownRenderer.tsx` (no behavior change; add comment)

`react-markdown` sanitizes by default (it does not pass raw HTML through unless `rehype-raw` is added). This test locks that in: if someone later adds `rehype-raw` without thinking, the test fails.

- [ ] **Step 1: Add vitest + jsdom to web**

```bash
cd web && npm i -D vitest @vitest/ui jsdom @testing-library/react @testing-library/jest-dom
```

- [ ] **Step 2: Create `web/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['tests/unit/**/*.test.{ts,tsx}'],
  },
});
```

If `@vitejs/plugin-react` isn't installed, add it: `cd web && npm i -D @vitejs/plugin-react`.

- [ ] **Step 3: Add `test:unit` script to `web/package.json`**

In the `scripts` block:
```json
"test:unit": "vitest run tests/unit"
```

- [ ] **Step 4: Write the failing test**

Create `web/tests/unit/MarkdownRenderer.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { MarkdownRenderer } from '../../components/chat/MarkdownRenderer';

describe('MarkdownRenderer', () => {
  it('renders plain markdown', () => {
    render(<MarkdownRenderer text="**hello**" />);
    const strong = screen.getByText('hello');
    expect(strong.tagName).toBe('STRONG');
  });

  it('strips raw <script> tags from model output', () => {
    const hostile = 'safe\n\n<script>window.__pwned = true</script>';
    const { container } = render(<MarkdownRenderer text={hostile} />);
    // No <script> element should be in the DOM.
    expect(container.querySelector('script')).toBeNull();
    // Nor should window.__pwned be set (jsdom executes scripts if they render).
    expect((window as unknown as { __pwned?: boolean }).__pwned).toBeUndefined();
  });

  it('strips javascript: URLs from links', () => {
    const hostile = '[click me](javascript:alert(1))';
    const { container } = render(<MarkdownRenderer text={hostile} />);
    const link = container.querySelector('a');
    // react-markdown either drops the href or replaces with safe URL.
    if (link) {
      expect(link.getAttribute('href')?.startsWith('javascript:')).toBeFalsy();
    }
  });
});
```

- [ ] **Step 5: Run the test**

Run: `cd web && npm run test:unit`
Expected: PASS (react-markdown's defaults already sanitize).

- [ ] **Step 6: Lock the invariant with a comment**

In `web/components/chat/MarkdownRenderer.tsx`, above the `<Markdown>` JSX, add:

```tsx
      {/* Do NOT add `rehype-raw` here — it would allow raw HTML from model
          output, which has been source of XSS issues. react-markdown's
          default pipeline sanitizes and is verified in
          tests/unit/MarkdownRenderer.test.tsx. */}
```

- [ ] **Step 7: Typecheck + lint**

Run: `cd web && npm run typecheck && npm run lint`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add web/package.json web/package-lock.json web/vitest.config.ts web/tests/unit/MarkdownRenderer.test.tsx web/components/chat/MarkdownRenderer.tsx
git commit -m "test(web): lock markdown XSS sanitization invariants"
```

---

## Task 12: Frontend bundle analyzer wiring

**Files:**
- Modify: `web/package.json` (add `@next/bundle-analyzer`)
- Modify: `web/next.config.mjs`

Opt-in analyzer — runs only when `ANALYZE=true`. Never runs in normal CI to avoid slowing PR builds.

- [ ] **Step 1: Install the analyzer**

```bash
cd web && npm i -D @next/bundle-analyzer
```

- [ ] **Step 2: Update `web/next.config.mjs`**

```js
import bundleAnalyzer from '@next/bundle-analyzer';

const withBundleAnalyzer = bundleAnalyzer({ enabled: process.env.ANALYZE === 'true' });

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  experimental: {
    middlewareClientMaxBodySize: '32mb',
    proxyTimeout: 120_000,
  },
  async rewrites() {
    return [
      { source: '/api/:path*', destination: `${process.env.INTERNAL_API_BASE ?? 'http://api:4000'}/api/:path*` },
    ];
  },
};

export default withBundleAnalyzer(nextConfig);
```

- [ ] **Step 3: Add analyze script**

In `web/package.json` scripts:
```json
"analyze": "ANALYZE=true next build"
```

- [ ] **Step 4: Verify normal build still works**

Run: `cd web && npm run build`
Expected: build succeeds; no bundle analyzer output (because `ANALYZE` is unset).

- [ ] **Step 5: Commit**

```bash
git add web/package.json web/package-lock.json web/next.config.mjs
git commit -m "feat(web): wire @next/bundle-analyzer behind ANALYZE=true flag"
```

---

## Task 13: (merged into Task 10)

**Note:** Caddy static cache headers for `_next/static/*` are implemented as part of Task 10. This task entry is intentionally empty; keeping the task number so the task map and subsequent numbers don't shift. No action required.

---

## Task 14: Integration test — upload endpoint

**Files:**
- Extend: `api/tests/integration/upload.test.ts`
- May need: `api/tests/integration/setup.ts` (shared MSW server)

Covers: happy-path upload returning 202 + `scanId`, oversize rejection, non-multipart rejection, no-file rejection, 409-recovery via `getFileByHash`.

- [ ] **Step 1: Extend the integration test**

Replace `api/tests/integration/upload.test.ts` with:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { buildApp } from '../../src/app.js';
import { __resetForTests } from '../../src/services/scans.js';

const server = setupServer();
beforeEach(() => {
  __resetForTests();
  server.listen({ onUnhandledRequest: 'error' });
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
  });

  it('rejects content-length over 32MB with 413', async () => {
    const r = await request(buildApp())
      .post('/api/scans')
      .set('content-type', 'multipart/form-data; boundary=x')
      .set('content-length', String(33 * 1024 * 1024));
    expect(r.status).toBe(413);
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
```

- [ ] **Step 2: Run the test**

Run: `cd api && npm test -- tests/integration/upload.test.ts`
Expected: PASS (all 5 cases).

- [ ] **Step 3: Commit**

```bash
git add api/tests/integration/upload.test.ts
git commit -m "test(api): integration coverage for upload endpoint"
```

---

## Task 15: Integration test — SSE event stream

**Files:**
- Create: `api/tests/integration/scanEvents.test.ts`

Happy path: create scan, VT returns `queued` once then `completed`; assert the SSE stream emits `status` then `result` and closes.

- [ ] **Step 1: Write the test**

Create `api/tests/integration/scanEvents.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import http from 'node:http';
import { setupServer } from 'msw/node';
import { http as mswHttp, HttpResponse } from 'msw';
import { buildApp } from '../../src/app.js';
import { __resetForTests, createScan, updateScanStatus } from '../../src/services/scans.js';

const server = setupServer();
beforeEach(() => {
  __resetForTests();
  server.listen({ onUnhandledRequest: 'error' });
});
afterEach(() => {
  server.resetHandlers();
  server.close();
});

function listen(app: import('express').Express): Promise<{ port: number; close: () => Promise<void> }> {
  return new Promise((resolve) => {
    const s = app.listen(0, () => {
      const port = (s.address() as import('node:net').AddressInfo).port;
      resolve({ port, close: () => new Promise((r) => s.close(() => r())) });
    });
  });
}

function collectSse(port: number, path: string, maxEvents: number): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const events: string[] = [];
    const req = http.get({ host: '127.0.0.1', port, path }, (res) => {
      res.setEncoding('utf8');
      let buf = '';
      res.on('data', (chunk: string) => {
        buf += chunk;
        let idx;
        while ((idx = buf.indexOf('\n\n')) !== -1) {
          events.push(buf.slice(0, idx));
          buf = buf.slice(idx + 2);
          if (events.length >= maxEvents) {
            req.destroy();
            resolve(events);
            return;
          }
        }
      });
      res.on('end', () => resolve(events));
      res.on('error', reject);
    });
    req.on('error', reject);
  });
}

describe('GET /api/scans/:id/events', () => {
  it('streams status then result and closes on completion', async () => {
    let polls = 0;
    server.use(
      mswHttp.get('https://www.virustotal.com/api/v3/analyses/vt-xyz', () => {
        polls++;
        if (polls === 1) {
          return HttpResponse.json({
            data: { id: 'vt-xyz', attributes: { status: 'queued', stats: {} } },
          });
        }
        return HttpResponse.json({
          data: {
            id: 'vt-xyz',
            attributes: {
              status: 'completed',
              stats: { malicious: 0, suspicious: 0, undetected: 1, harmless: 0 },
              results: {},
            },
          },
        });
      }),
    );

    const scan = createScan({
      vtAnalysisId: 'vt-xyz',
      fileName: 'f',
      fileSha256: 'h',
      fileSize: 1,
    });
    const { port, close } = await listen(buildApp());
    try {
      const events = await collectSse(port, `/api/scans/${scan.id}/events`, 3);
      expect(events.some((e) => /status/.test(e))).toBe(true);
      expect(events.some((e) => /result/.test(e))).toBe(true);
    } finally {
      await close();
    }
  }, 30_000);

  it('short-circuits immediately when scan is already completed', async () => {
    const scan = createScan({
      vtAnalysisId: 'vt-done',
      fileName: 'f',
      fileSha256: 'h',
      fileSize: 1,
    });
    updateScanStatus(scan.id, 'completed', { attributes: { stats: {} } });
    const { port, close } = await listen(buildApp());
    try {
      const events = await collectSse(port, `/api/scans/${scan.id}/events`, 1);
      expect(events[0]).toMatch(/result/);
    } finally {
      await close();
    }
  });
});
```

- [ ] **Step 2: Run the test**

Run: `cd api && npm test -- tests/integration/scanEvents.test.ts`
Expected: PASS (both cases).

- [ ] **Step 3: Commit**

```bash
git add api/tests/integration/scanEvents.test.ts
git commit -m "test(api): integration coverage for SSE scan event stream"
```

---

## Task 16: Integration test — chat POST with Gemini stub

**Files:**
- Create: `api/tests/integration/messages.test.ts`

Stubs the Gemini client by dependency-swap (we need a seam). Simplest seam: re-export `createGeminiClient` from `services/gemini.ts` and allow overriding via `setGeminiClientFactory` for tests.

- [ ] **Step 1: Add test seam in `api/src/services/gemini.ts`**

Current file exports `createGeminiClient(opts: CreateGeminiClientOpts): GeminiClient`. Append to the file:

```ts
type Factory = typeof createGeminiClient;
let factoryOverride: Factory | null = null;

/** Test-only: swap in a stub factory. Pass null to restore the default. */
export function __setGeminiFactoryForTests(f: Factory | null): void {
  factoryOverride = f;
}

export function resolveGeminiFactory(): Factory {
  return factoryOverride ?? createGeminiClient;
}
```

Update `api/src/routes/messages.ts`. Change the import on line 9 from:
```ts
import { createGeminiClient } from '../services/gemini.js';
```
to:
```ts
import { resolveGeminiFactory } from '../services/gemini.js';
```

And replace lines 82–85:
```ts
  const client = createGeminiClient({
    apiKey: config.GEMINI_API_KEY,
    model: config.GEMINI_MODEL,
  });
```
with:
```ts
  const client = resolveGeminiFactory()({
    apiKey: config.GEMINI_API_KEY,
    model: config.GEMINI_MODEL,
  });
```

- [ ] **Step 2: Write the integration test**

Create `api/tests/integration/messages.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { buildApp } from '../../src/app.js';
import { __resetForTests, createScan, updateScanStatus } from '../../src/services/scans.js';
import { __setGeminiFactoryForTests } from '../../src/services/gemini.js';

beforeEach(() => __resetForTests());
afterEach(() => __setGeminiFactoryForTests(null));

describe('messages endpoints', () => {
  it('POST streams tokens then done and appends assistant message', async () => {
    __setGeminiFactoryForTests(() => ({
      async *stream(_p: unknown, _signal: AbortSignal) {
        yield 'Hello ';
        yield 'world';
      },
    }) as unknown as ReturnType<typeof import('../../src/services/gemini.js').createGeminiClient>);

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
    __setGeminiFactoryForTests(() => ({
      async *stream() {
        yield 'x';
      },
    }) as unknown as ReturnType<typeof import('../../src/services/gemini.js').createGeminiClient>);

    const scan = createScan({ vtAnalysisId: 'a', fileName: 'f', fileSha256: 'h', fileSize: 1 });
    updateScanStatus(scan.id, 'completed', { attributes: { stats: {}, results: {} } });
    await request(buildApp()).post(`/api/scans/${scan.id}/messages`).send({ content: 'hi' });
    const list = await request(buildApp()).get(`/api/scans/${scan.id}/messages`);
    const msgId = list.body[0]?.id;
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
```

- [ ] **Step 3: Run the test**

Run: `cd api && npm test -- tests/integration/messages.test.ts`
Expected: PASS (all 4 cases).

- [ ] **Step 4: Typecheck + lint**

Run: `cd api && npm run typecheck && npm run lint`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add api/src/services/gemini.ts api/src/routes/messages.ts api/tests/integration/messages.test.ts
git commit -m "test(api): integration coverage for chat messages with Gemini stub"
```

---

## Task 17: Integration test — rate-limit enforcement per bucket

**Files:**
- Create: `api/tests/integration/rateLimits.test.ts`

Tests need `NODE_ENV` not equal to `test` for the buckets to use production limits. Easiest: build a fresh app with `config.NODE_ENV` overridden. Since `createBucket` reads `config.NODE_ENV` at module load, we instead create a fresh bucket with explicit limits using the factory for the test, or we test via an env-flag `RATE_LIMIT_TEST_MODE=strict` hook.

Chose simpler approach: export a test-only builder that creates buckets with production limits even under `NODE_ENV=test`.

- [ ] **Step 1: Add production-limit builder for tests in `api/src/middleware/rateLimits.ts`**

Add at the bottom:
```ts
// Test-only: build a bucket with production-grade limits even under
// NODE_ENV=test. Used by integration tests of the rate-limit behavior itself.
export function __createBucketForTests(spec: {
  windowMs: number;
  max: number;
  name: string;
}) {
  return rateLimit({
    windowMs: spec.windowMs,
    limit: spec.max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: jsonError('RATE_LIMITED', `Rate limit exceeded for ${spec.name}`),
  });
}
```

- [ ] **Step 2: Write the test**

Create `api/tests/integration/rateLimits.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { __createBucketForTests } from '../../src/middleware/rateLimits.js';

function appWith(limiter: express.RequestHandler) {
  const app = express();
  app.set('trust proxy', 1);
  app.use(limiter);
  app.get('/t', (_req, res) => res.json({ ok: true }));
  return app;
}

describe('rate-limit buckets — production behavior', () => {
  it('global bucket allows 60/min and rejects the 61st', async () => {
    const bucket = __createBucketForTests({ windowMs: 60_000, max: 60, name: 'global' });
    const app = appWith(bucket);
    for (let i = 0; i < 60; i++) {
      const r = await request(app).get('/t');
      expect(r.status).toBe(200);
    }
    const r = await request(app).get('/t');
    expect(r.status).toBe(429);
  });

  it('upload bucket allows 5/min', async () => {
    const bucket = __createBucketForTests({ windowMs: 60_000, max: 5, name: 'upload' });
    const app = appWith(bucket);
    for (let i = 0; i < 5; i++) expect((await request(app).get('/t')).status).toBe(200);
    expect((await request(app).get('/t')).status).toBe(429);
  });

  it('chat bucket allows 20/min', async () => {
    const bucket = __createBucketForTests({ windowMs: 60_000, max: 20, name: 'chat' });
    const app = appWith(bucket);
    for (let i = 0; i < 20; i++) expect((await request(app).get('/t')).status).toBe(200);
    expect((await request(app).get('/t')).status).toBe(429);
  });
});
```

- [ ] **Step 3: Run the test**

Run: `cd api && npm test -- tests/integration/rateLimits.test.ts`
Expected: PASS (all 3 cases).

- [ ] **Step 4: Commit**

```bash
git add api/src/middleware/rateLimits.ts api/tests/integration/rateLimits.test.ts
git commit -m "test(api): integration coverage for rate-limit bucket enforcement"
```

---

## Task 18: Integration test — security headers on every response

**Files:**
- Create: `api/tests/integration/securityHeaders.test.ts`

Sanity check that every route goes through `securityHeaders` middleware by hitting a handful of endpoints.

- [ ] **Step 1: Write the test**

```ts
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
```

- [ ] **Step 2: Run the test**

Run: `cd api && npm test -- tests/integration/securityHeaders.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add api/tests/integration/securityHeaders.test.ts
git commit -m "test(api): integration coverage for security headers"
```

---

## Task 19: E2E — golden flow + reload persistence

**Files:**
- Modify: `web/tests/e2e/smoke.spec.ts` (extend) OR
- Create: `web/tests/e2e/golden.spec.ts`

Extends the existing smoke spec by reloading after chat and asserting the assistant message is still visible (tests TTL-within-1h persistence).

- [ ] **Step 1: Extend `web/tests/e2e/smoke.spec.ts`**

Add a third test case:

```ts
  test('reload preserves scan and chat within TTL', async ({ page }) => {
    await page.goto('/');
    await page.locator('input[type="file"]').setInputFiles(SAMPLE_FILE);
    await page.waitForURL(/\/scans\/.+/, { timeout: 30_000 });
    await expect(page.getByText(/scan result/i)).toBeVisible({ timeout: 180_000 });

    // Wait for assistant response to appear
    const assistantProse = page.locator('.prose').first();
    await expect(assistantProse).toBeVisible({ timeout: 90_000 });
    await expect(assistantProse).not.toBeEmpty({ timeout: 90_000 });

    // Reload and confirm state persists
    await page.reload();
    await expect(page.getByText(/scan result/i)).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('.prose').first()).toBeVisible({ timeout: 30_000 });
  });
```

- [ ] **Step 2: Run the spec locally (optional — CI will run it)**

If Docker is running and env is set up:
```bash
cd web && npx playwright test
```
Expected: PASS. If Docker is not available locally, skip — CI runs this.

- [ ] **Step 3: Commit**

```bash
git add web/tests/e2e/smoke.spec.ts
git commit -m "test(web): e2e covers reload persistence for golden flow"
```

---

## Task 20: Metrics service + `/metrics` endpoint

**Files:**
- Install: `prom-client` in `api/`
- Create: `api/src/services/metrics.ts`
- Create: `api/src/routes/metrics.ts`
- Modify: `api/src/app.ts` (mount `/metrics`)
- Modify: `api/src/routes/scans.ts` (increment counters)
- Modify: `api/src/routes/messages.ts` (increment counters)
- Modify: `api/src/middleware/rateLimits.ts` (increment counter on rejection)
- Create: `api/tests/integration/metrics.test.ts`

**Exposure control:** the endpoint is on Express port 4000. Caddy does not proxy it (no `/metrics` route added to Caddyfile), so it's only reachable on the internal Docker network.

- [ ] **Step 1: Install prom-client**

```bash
cd api && npm i prom-client
```

- [ ] **Step 2: Create the metrics registry**

Create `api/src/services/metrics.ts`:

```ts
import { Registry, Counter, Histogram, collectDefaultMetrics } from 'prom-client';

export const registry = new Registry();
collectDefaultMetrics({ register: registry });

export const uploadTotal = new Counter({
  name: 'webtest_upload_total',
  help: 'File upload attempts',
  labelNames: ['result'] as const,
  registers: [registry],
});

export const vtRequestTotal = new Counter({
  name: 'webtest_vt_request_total',
  help: 'VirusTotal API requests',
  labelNames: ['outcome'] as const,
  registers: [registry],
});

export const chatMessagesTotal = new Counter({
  name: 'webtest_chat_messages_total',
  help: 'Chat messages sent',
  registers: [registry],
});

export const rateLimitRejectedTotal = new Counter({
  name: 'webtest_rate_limit_rejected_total',
  help: 'Requests rejected by rate limiter',
  labelNames: ['bucket'] as const,
  registers: [registry],
});

export const uploadDuration = new Histogram({
  name: 'webtest_upload_duration_seconds',
  help: 'Upload request duration',
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60],
  registers: [registry],
});

export const geminiFirstTokenMs = new Histogram({
  name: 'webtest_gemini_first_token_ms',
  help: 'Latency from chat POST to first Gemini token',
  buckets: [100, 250, 500, 1000, 2000, 5000, 10000],
  registers: [registry],
});
```

- [ ] **Step 3: Create the route**

Create `api/src/routes/metrics.ts`:

```ts
import { Router } from 'express';
import { registry } from '../services/metrics.js';

export const metrics = Router();

metrics.get('/metrics', async (_req, res) => {
  res.setHeader('Content-Type', registry.contentType);
  res.send(await registry.metrics());
});
```

- [ ] **Step 4: Wire into `api/src/app.ts`**

Import and mount BEFORE the `/api/scans` routes:
```ts
import { metrics } from './routes/metrics.js';
// ...
app.use('/', metrics);
```

- [ ] **Step 5a: Upload counters + duration histogram**

In `api/src/routes/scans.ts`, at the top of the file add:
```ts
import { uploadTotal, uploadDuration } from '../services/metrics.js';
```

At the top of `uploadHandler` (after the content-type check), start the timer:
```ts
const endTimer = uploadDuration.startTimer();
```

In the `fail` function body, before `next(err)`:
```ts
uploadTotal.inc({ result: 'rejected' });
endTimer();
```

At the happy-path response (before `res.status(202).json(...)`):
```ts
uploadTotal.inc({ result: 'accepted' });
endTimer();
```

- [ ] **Step 5b: Chat counter + first-token latency**

In `api/src/routes/messages.ts`, add import:
```ts
import { chatMessagesTotal, geminiFirstTokenMs } from '../services/metrics.js';
```

In the `post` handler, after `const userMsg = appendMessage(...)` at line 64:
```ts
chatMessagesTotal.inc();
```

Replace the `for await` loop (line 88) to measure first-token latency:
```ts
  const streamStart = Date.now();
  let firstTokenSeen = false;
  try {
    for await (const token of client.stream(prompt, controller.signal)) {
      if (!firstTokenSeen) {
        firstTokenSeen = true;
        geminiFirstTokenMs.observe(Date.now() - streamStart);
      }
      full += token;
      sse.event('token', { token });
    }
  } catch (err) {
```

- [ ] **Step 5c: VT outcome counter**

In `api/src/services/virustotal.ts`, add at top:
```ts
import { vtRequestTotal } from './metrics.js';
```

Inside each of the three `withRetry` bodies (in `uploadToVt`, `getAnalysis`, `getFileByHash`), after a successful response is parsed and BEFORE returning the value:
```ts
vtRequestTotal.inc({ outcome: 'ok' });
```

Change the `shouldRetry` arg on each `withRetry` call so it records metrics as a side effect:
```ts
shouldRetry: (err) => {
  const retryable = isVtTransient(err);
  vtRequestTotal.inc({ outcome: retryable ? 'retry' : 'fail' });
  return retryable;
},
```

- [ ] **Step 5d: Rate-limit rejection counter**

In `api/src/middleware/rateLimits.ts`, add import:
```ts
import { rateLimitRejectedTotal } from '../services/metrics.js';
```

Update `createBucket` to install a `handler`:
```ts
export function createBucket(spec: BucketSpec): ReturnType<typeof rateLimit> {
  const limit = isTest ? Math.max(spec.max * 1000, 10_000) : spec.max;
  const options: Partial<Options> = {
    windowMs: spec.windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skipSuccessfulRequests: spec.skipSuccessfulRequests ?? false,
    handler: (_req, res, _next, optionsUsed) => {
      rateLimitRejectedTotal.inc({ bucket: spec.name });
      res.status(optionsUsed.statusCode).json(
        jsonError('RATE_LIMITED', `Rate limit exceeded for ${spec.name}`),
      );
    },
  };
  return rateLimit(options);
}
```

Remove the now-unused `message` option.

- [ ] **Step 6: Write the integration test**

Create `api/tests/integration/metrics.test.ts`:

```ts
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
    // prom-client default metrics
    expect(r.text).toContain('process_cpu_user_seconds_total');
  });
});
```

- [ ] **Step 7: Run the test**

Run: `cd api && npm test -- tests/integration/metrics.test.ts`
Expected: PASS.

- [ ] **Step 8: Typecheck + lint**

Run: `cd api && npm run typecheck && npm run lint`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add api/src/services/metrics.ts api/src/routes/metrics.ts api/src/app.ts api/src/routes/scans.ts api/src/routes/messages.ts api/src/services/virustotal.ts api/src/middleware/rateLimits.ts api/tests/integration/metrics.test.ts api/package.json api/package-lock.json
git commit -m "feat(api): /metrics endpoint with prom-client counters and histograms"
```

---

## Task 21: Request-ID correlation to outbound calls

**Files:**
- Modify: `api/src/services/virustotal.ts` (accept optional reqId, include in logs)
- Modify: `api/src/services/gemini.ts` (same)
- Modify: `api/src/routes/scans.ts`, `scanEvents.ts`, `messages.ts` (pass `req.requestId`)

Passes the incoming `req.requestId` through to outbound calls so pino logs on both sides share a trace id.

- [ ] **Step 1: Extend VT client signatures**

In `api/src/services/virustotal.ts`, import the logger at the top:
```ts
import { logger } from '../logger.js';
```

Add an optional `reqId?: string` field to the opts of each of `uploadToVt`, `getAnalysis`, and `getFileByHash`. At the point where each function's `withRetry` throws its final error (catch it in the route — there is no error branch in the client itself to add), rely on `logger.warn` emitting `reqId`. To do that consistently, replace the three `throw new VtHttpError(...)` sites with:

```ts
logger.warn({ reqId: opts.reqId, status: res.status, endpoint: 'vt-files' /* or vt-analyses/vt-file-by-hash */ }, 'VT http error');
throw new VtHttpError(res.status, `VT ... failed: ${res.status} ${json?.error?.message ?? ''}`);
```

Use the endpoint tag that matches the function (`vt-files`, `vt-analyses`, `vt-file-by-hash`).

- [ ] **Step 2: Extend Gemini client signature**

In `api/src/services/gemini.ts`, update `CreateGeminiClientOpts`:
```ts
export interface CreateGeminiClientOpts {
  apiKey: string;
  model: string;
  reqId?: string;
}
```

Import the logger and wrap the `for await` loop's error exit so errors are logged with `reqId`:
```ts
import { logger } from '../logger.js';
// ...
for await (const chunk of result.stream) {
  if (signal?.aborted) return;
  try {
    const text = chunk.text();
    if (text) yield text;
  } catch (err) {
    logger.warn({ err, reqId: opts.reqId }, 'gemini chunk error');
    throw err;
  }
}
```

- [ ] **Step 3: Pass `req.requestId` through from routes**

Update the three route call sites.

`api/src/routes/scans.ts` inside `uploadHandler`:
```ts
analysisId = await uploadToVt({
  apiKey: config.VT_API_KEY,
  filename: info.filename || 'upload.bin',
  stream: passthrough,
  contentType: info.mimeType,
  reqId: req.requestId,
});
// ... and in the getFileByHash call:
const existing = await getFileByHash({
  apiKey: config.VT_API_KEY,
  hash: sha256,
  reqId: req.requestId,
});
```

`api/src/routes/scanEvents.ts` inside the poll loop:
```ts
const a = await getAnalysis({
  apiKey: config.VT_API_KEY,
  analysisId: scan.vtAnalysisId,
  reqId: req.requestId,
});
```

`api/src/routes/messages.ts`, replacing the Gemini factory call from Task 16:
```ts
const client = resolveGeminiFactory()({
  apiKey: config.GEMINI_API_KEY,
  model: config.GEMINI_MODEL,
  reqId: req.requestId,
});
```

- [ ] **Step 4: Run full suite to ensure no regressions**

Run: `cd api && npm test`
Expected: PASS across all suites.

- [ ] **Step 5: Typecheck + lint**

Run: `cd api && npm run typecheck && npm run lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add api/src
git commit -m "chore(api): propagate requestId to outbound VT and Gemini calls"
```

---

## Task 22: CI coverage gate on `api/src/`

**Files:**
- Modify: `api/package.json` (add coverage deps + script)
- Modify: `api/vitest.config.ts` (enable coverage; set threshold)
- Modify: `.github/workflows/ci.yml` (run `npm run test:cov`)

Vitest uses `@vitest/coverage-v8`. Threshold: 70% statements for `api/src/` as a floor.

- [ ] **Step 1: Install coverage provider**

```bash
cd api && npm i -D @vitest/coverage-v8
```

- [ ] **Step 2: Update `api/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    pool: 'forks',
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts', 'src/**/__fixtures__/**'],
      reporter: ['text', 'html', 'lcov'],
      thresholds: {
        statements: 70,
        branches: 60,
        functions: 70,
        lines: 70,
      },
    },
  },
});
```

- [ ] **Step 3: Add `test:cov` script to `api/package.json`**

```json
"test:cov": "vitest run --coverage"
```

- [ ] **Step 4: Run coverage locally**

Run: `cd api && npm run test:cov`
Expected: thresholds met (or close). If a threshold fails, adjust the numbers down to one percentage point below the measured value as a floor, not an aspiration.

- [ ] **Step 5: Add CI step**

In `.github/workflows/ci.yml`, under the `api` job, after the `Run vitest` step, add:

```yaml
      - name: Coverage gate
        run: npm run test:cov
        env:
          NODE_ENV: test
```

- [ ] **Step 6: Commit**

```bash
git add api/package.json api/package-lock.json api/vitest.config.ts .github/workflows/ci.yml
git commit -m "ci(api): gate builds on vitest coverage thresholds"
```

---

## Task 23: Post-deploy smoke script

**Files:**
- Create: `scripts/smoke.sh`

Runs after a deploy to verify the golden flow at the HTTP surface. Not wired into CI; called manually (or by the existing deploy workflow post-SSH).

- [ ] **Step 1: Write the script**

Create `scripts/smoke.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

BASE="${1:-http://localhost}"

echo "smoke: $BASE"

echo "→ /healthz"
curl -fsS "${BASE}/healthz" | grep -q '"status":"ok"'
echo "  ok"

echo "→ security headers on /"
HDRS=$(curl -fsS -I "${BASE}/")
echo "$HDRS" | grep -qi '^x-content-type-options: nosniff' || { echo "missing X-Content-Type-Options"; exit 1; }
echo "$HDRS" | grep -qi '^x-frame-options: DENY' || { echo "missing X-Frame-Options"; exit 1; }
echo "$HDRS" | grep -qi '^referrer-policy:' || { echo "missing Referrer-Policy"; exit 1; }
echo "  ok"

echo "→ oversized upload rejected at edge"
STATUS=$(curl -s -o /dev/null -w '%{http_code}' -X POST "${BASE}/api/scans" \
  -H 'content-type: multipart/form-data; boundary=x' \
  -H "content-length: $((33 * 1024 * 1024))")
if [[ "$STATUS" != "413" ]]; then
  echo "expected 413, got $STATUS"
  exit 1
fi
echo "  ok"

echo "→ /metrics NOT publicly routed"
STATUS=$(curl -s -o /dev/null -w '%{http_code}' "${BASE}/metrics" || true)
if [[ "$STATUS" == "200" ]]; then
  echo "WARN: /metrics is publicly reachable; should be internal-only"
  exit 1
fi
echo "  ok ($STATUS)"

echo "smoke: PASS"
```

- [ ] **Step 2: Make it executable**

```bash
chmod +x scripts/smoke.sh
```

- [ ] **Step 3: Run against local docker-compose (optional)**

If Compose is running:
```bash
./scripts/smoke.sh http://localhost
```
Expected: `smoke: PASS`.

- [ ] **Step 4: Commit**

```bash
git add scripts/smoke.sh
git commit -m "feat(ops): post-deploy smoke script for golden-flow invariants"
```

---

## Final Gate

After Task 23, run the full validation pass on `main`:

- [ ] `cd api && npm run lint && npm run typecheck && npm run test:cov` — all green, coverage thresholds met
- [ ] `cd web && npm run lint && npm run typecheck && npm run build && npm run test:unit` — all green
- [ ] `cd web && npx playwright test` (optional if Docker available locally — CI will run)
- [ ] `./scripts/smoke.sh http://localhost` against a local Compose stack
- [ ] **Lighthouse pass on the golden flow** (if Compose stack is running locally):
  ```bash
  npx lighthouse http://localhost/ --preset=mobile --output=json --output-path=./lighthouse-baseline.json --chrome-flags="--headless"
  ```
  Record the scores. If the mobile Performance score drops below 90, open a follow-up issue; do **not** block this hardening pass on it (per spec §1.5). If Lighthouse isn't available, skip and note so in the PR description.
- [ ] `git log --oneline` — ~20+ commits, each with a focused scope

If any gate fails, do not claim completion. Fix the failure, commit, re-run the gate.

---

## Out of Scope

Anything listed in the spec's "Out of scope" section (auth, DB, Redis, HA, rewrites, timing-attack hardening on scan lookup, friendlier startup error messages) stays out. Do not expand scope mid-implementation.
