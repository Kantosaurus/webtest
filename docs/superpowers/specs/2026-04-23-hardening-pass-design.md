# Hardening Pass — Design

**Date:** 2026-04-23
**Status:** Approved for implementation
**Scope:** Security + performance hardening of the existing Next.js/Express app
**Branching:** Direct to `main`, subagent-driven execution in two parallel waves

---

## Context

`webtest` is a stateless no-auth web app: a Next.js 15 / React 19 frontend, an Express 4 / TypeScript API, Caddy reverse proxy, Docker Compose on a single t3.small EC2. External services: VirusTotal (file scanning) and Google Gemini (chat). All state is in-memory.

A survey of the codebase flagged ~15 issues across security, correctness, and performance. This spec captures the subset we're fixing in this pass (Critical + High + Medium severity).

### Explicit scope decisions (locked before design)

- **Threat model**: Scan UUIDs are capability tokens. No authentication or per-scan authorization. Share-a-URL is a feature. Hardening targets abuse paths, not access control.
- **Scale target**: Single EC2 forever. In-memory stores stay. No Redis, no shared state.
- **Severity cutoff**: Critical + High + Medium. Low-severity polish items (timing-attack hardening on scan lookup, startup error message ergonomics) are deferred.
- **Out of scope**: adding auth, adding a database, horizontal scaling work, unrelated refactors.

---

## 1 — Fix list

### 1.1 Abuse surface & rate limiting

Files: `api/src/app.ts`, new `api/src/middleware/rateLimits.ts`, `api/src/routes/scans.ts`, `api/src/services/virustotal.ts`

- Replace the single `apiLimiter` (30/min/ip for everything) with three differentiated buckets:
  - `global`: 60 requests/minute/IP — baseline for reads (`GET` scans, messages, health)
  - `upload`: 5 requests/minute/IP **and** 10 requests/hour/IP — caps VT quota burn
  - `chat`: 20 requests/minute/IP — caps Gemini token burn
- Add an Express-level body-size cap on `POST /api/scans` that rejects before Busboy opens a stream.
- Fix the rejected-upload drain path in `scans.ts` so the socket closes promptly (current code silently drains with `req.on('data', () => undefined)`; add an explicit socket timeout of 60s on the upload endpoint).
- VirusTotal client: exponential backoff on HTTP 429 and 5xx (base 500ms, factor 2, jitter, max 3 retries). 409 handling (existing GET-by-hash fallback) is preserved.

### 1.2 Memory correctness

Files: `api/src/services/scans.ts`, `api/src/services/messages.ts`

- `dropConversation(scanId)` is defined but never invoked — wire it into `evictIfFull()` so message arrays evict with their scan. No silent orphaning.
- Consolidate eviction behind a single `evict(scanId)` helper that tears down scan record + messages together.
- Per-scan message cap of 200 entries, oldest-first drop (prevents a single long conversation from dominating memory).
- Add a TTL axis alongside FIFO: drop scans untouched for more than 1 hour. Background sweep every 5 minutes; `setInterval` with `.unref()` so tests exit cleanly.

### 1.3 Edge hardening

Files: `Caddyfile`, new `api/src/middleware/securityHeaders.ts`, shared constants module, `web/app/layout.tsx` (verify meta is consistent)

- Caddy (primary): `Strict-Transport-Security` (prod only, `max-age=31536000; includeSubDomains; preload`), `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`.
- Express middleware (defense-in-depth): same headers so the API is safe if someone hits it directly.
- Content-Security-Policy (enforcing, applied at Caddy for HTML responses):
  - `default-src 'self'`
  - `script-src 'self' 'unsafe-inline'` (the `NO_FLASH` inline theme script requires `unsafe-inline`; acceptable because no user input reaches it)
  - `style-src 'self' 'unsafe-inline'` (Tailwind + shadcn inline styles)
  - `img-src 'self' data:` (Next.js image placeholders)
  - `connect-src 'self'` (all external calls are server-side)
  - `frame-ancestors 'none'`
- Markdown rendering: confirm `react-markdown` default sanitization is active; configure `rehype-highlight` with `ignoreMissing: true`. Add a unit test that feeds a `<script>` tag through the renderer and asserts it's stripped.

### 1.4 Observability

Files: `api/src/app.ts`, new `api/src/services/metrics.ts`, optional `prom-client` dependency

- `GET /metrics` endpoint on the API in Prometheus text format. Caddy does **not** add a public route for `/metrics` — it remains reachable only on the internal Docker network (port 4000), accessible via `docker exec` or a host-local scraper. No auth on the endpoint itself; isolation is provided by not proxying it.
- Counters:
  - `webtest_upload_total{result="accepted|rejected"}`
  - `webtest_vt_request_total{outcome="ok|retry|fail"}`
  - `webtest_chat_messages_total`
  - `webtest_chat_tokens_total` (from Gemini response metadata)
  - `webtest_rate_limit_rejected_total{bucket="global|upload|chat"}`
- Histograms: upload duration, VT roundtrip, Gemini first-token latency.
- Correlate pino `requestId` into the VT and Gemini outbound HTTP calls so upstream traces can be stitched together.

### 1.5 Frontend performance

Files: `web/next.config.mjs`, `web/app/**`, `web/package.json`, `Caddyfile`

- Run `@next/bundle-analyzer`; dynamic-import Radix dialog + toast (they're not above-the-fold) via `next/dynamic` with `ssr: false` where appropriate.
- Audit image assets; convert any raster formats to AVIF/WebP via `next/image` (it does this automatically if the source is served through it — verify all images are).
- Verify Caddy isn't stripping `Cache-Control` on `_next/static/*`. Add a Caddy route that sets `Cache-Control: public, max-age=31536000, immutable` for those paths if not already present.
- Lighthouse pass on the golden flow. Document the numbers; only fix regressions where the score drops below 90 on mobile.

---

## 2 — Cross-cutting patterns

- **Rate-limit bucket factory**: all three buckets are constructed from one `createBucket({ windowMs, max, key, skipSuccessfulRequests? })` factory in `api/src/middleware/rateLimits.ts`. One place to tune, one place to test.
- **Security headers**: Caddy has the canonical set; Express middleware imports the same header constants so they never drift. Constants live in `api/src/config/securityHeaders.ts` (values) and `Caddyfile` reads env vars where they differ (HSTS is prod-only).
- **Eviction**: scan + message stores expose a single `evict(scanId)` helper; the FIFO cap in `scans.ts` and the TTL sweep both call it. Tests assert both code paths tear down messages too.

---

## 3 — Testing strategy

Matches the user's standing preference: unit + integration + e2e + smoke.

- **Unit** (Vitest, `api/tests/unit/`): rate-limit bucket factory math, `evict()` consolidated teardown, VT backoff retry policy, security-headers middleware output, markdown sanitization.
- **Integration** (Vitest + supertest, `api/tests/integration/`): upload happy path, upload rejection (oversize, non-multipart), SSE event stream end-to-end with VT stubbed, chat POST with Gemini stubbed (streaming), per-bucket rate-limit enforcement, security headers on every response, `/metrics` scrape.
- **E2E** (Playwright, `web/e2e/`): golden flow — upload file → see scan result → post chat message → reload and confirm state persists within TTL.
- **Smoke** (post-deploy script): `/healthz` and `/metrics` reachable, Caddy serves expected security headers in prod, uploads of >32MB are rejected at the edge.
- **Coverage**: CI gate at 70% statement coverage on `api/src/` as a floor. Current coverage is near zero; this is a ratchet, not a bar.

---

## 4 — Sequencing inside the single branch

Execution uses subagent-driven-development with two waves.

### Wave 1 — parallel subagents (4 concurrent)

- **A**: rate-limit refactor + upload endpoint hardening + VT backoff (§1.1)
- **B**: memory correctness — eviction consolidation, per-scan message cap, TTL sweep (§1.2)
- **C**: security headers — Caddy config + Express middleware + CSP + markdown sanitization test (§1.3)
- **D**: frontend bundle audit + static cache headers + Lighthouse baseline (§1.5)

Gate between waves: full test suite green, lint + typecheck clean, DONE_WITH_CONCERNS triaged before proceeding.

### Wave 2 — parallel subagents (2 concurrent)

- **E**: integration + E2E test backfill (§3) — depends on Wave 1 because tests assert Wave 1 behavior
- **F**: observability — `/metrics` endpoint + request-ID correlation + histograms (§1.4)

### Final gate

- Full test suite green (unit + integration + E2E)
- Smoke script passes against a local Docker Compose stack
- Lighthouse scores recorded for comparison
- Coverage gate met
- One commit per subagent with clear scope; no squash

---

## 5 — Risks & rollback

- **Direct-to-main risk**: bad commits are user-visible until reverted. Mitigations: each subagent commits atomically (lint + test green before commit), CI runs on every push, the full suite runs between waves. If anything looks off after Wave 1 lands, we stop and triage before Wave 2. If the user prefers a PR gate instead, we can trivially open a branch and PR at execution time — the plan itself is branch-agnostic.
- **CSP might break a forgotten page**: we test the golden flow end-to-end in Playwright before enabling enforcement. A `Content-Security-Policy-Report-Only` pre-flight is available as an intermediate safety net if we hit surprises.
- **Rate-limit tuning**: the numbers in §1.1 are starting values. `/metrics` from this pass gives us the signal to retune after observing real traffic. Treat them as v0, not final.
- **TTL sweep edge cases**: the 1-hour TTL must use a monotonic clock (not wall time) so tests can fake it. Unit tests drive the sweep clock explicitly.
- **Bundle analyzer in CI**: opt-in only (env-flag gated) so it doesn't run on every build.

---

## 6 — Out of scope (explicitly)

- Adding authentication, sessions, or per-scan access control
- Introducing a database or persistent storage
- Redis or any shared-state infrastructure
- Horizontal scaling (load balancer, multiple instances)
- Rewriting the frontend for performance beyond low-hanging fruit
- Timing-attack hardening on scan-lookup (UUIDs make this negligible)
- Friendlier startup error messages on missing env vars (cosmetic, deferred)
