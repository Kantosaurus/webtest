# Design Decisions

Architecture Decision Records (ADRs) for the choices that are load-bearing
for the system's shape. Each record follows a short format: **Status /
Context / Decision / Consequences**.

The records are numbered in the order the decisions were made; renumbering
on rewrite is avoided so external references stay valid.

---

## ADR-0001 — Stream uploads directly to VirusTotal

**Status:** Accepted.

**Context.** The browser uploads a file up to 32 MB. We need to send that
file to VirusTotal and also compute its SHA-256 so we can fall back to
`GET /files/{hash}` on a 409 dedup response.

**Decision.** Do not write the file to disk or buffer it in memory before
forwarding. Pipe the incoming multipart stream through a `sha256` transform
and a byte counter, and pass the resulting `PassThrough` as the body of the
outbound `fetch` to VirusTotal. Hash is finalised after the stream ends.

Implementation: `api/src/routes/scans.ts:53-67` composes the transforms;
`api/src/services/virustotal.ts:59-118` sends the stream.

**Consequences.**

- *Pro.* No disk I/O, no temp-file cleanup, no scratch directory to harden.
- *Pro.* The byte counter can reject oversize files mid-stream — we never
  allocate more than one chunk at a time inside the API.
- *Con.* The retry-ability story is more subtle: we must buffer the stream
  once into memory so retries can resend the same bytes. The 32 MB cap
  makes that acceptable; a larger cap would require an alternative.

---

## ADR-0002 — SSE over WebSockets for all streaming

**Status:** Accepted.

**Context.** Two streams to the browser: scan status updates (server polls
VT, pushes state changes) and Gemini token streaming. Both are one-way,
low-throughput, and short-lived.

**Decision.** Use Server-Sent Events (`text/event-stream`) for both. Share
a single `SseWriter` adapter on the server (`api/src/lib/sse.ts`) and a
single `readSse` async generator on the client (`web/lib/sse.ts`).

**Consequences.**

- *Pro.* Works over plain HTTP. No special handling in Caddy — just
  `X-Accel-Buffering: no` on the response headers to disable response
  buffering. No WebSocket upgrade ceremony.
- *Pro.* Browser `EventSource` handles reconnection and `Last-Event-ID`
  automatically for the scan events stream.
- *Pro.* Uniform wire contract between the two streams makes both the
  server writer and the client reader trivial.
- *Con.* SSE is unidirectional. If we ever need user→server streaming
  (voice input, typing indicators), we'll need a different channel. For
  this product, we never do.

---

## ADR-0003 — Stateless, in-memory store

**Status:** Accepted.

**Context.** The assignment does not require persistence. Scans and chat
history are valuable only within the lifetime of a session.

**Decision.** Keep everything in a pair of `Map` instances inside the API
process. Bound both stores: 500-entry LRU cap on scans, 1-hour TTL since
last update, 200-message cap per conversation. Start a background sweep to
evict expired scans. No Postgres, no Redis, no SQLite.

**Consequences.**

- *Pro.* Zero moving parts. No schema to migrate, no connection pool to
  manage, no persistent volume to back up.
- *Pro.* Restart is a safe, fast recovery — the app *is* the database.
- *Pro.* Privacy property is trivial to explain: "nothing is stored."
- *Con.* No historical view for a returning user. The UI copy makes this
  explicit ("scans live only for the length of a session").
- *Con.* Horizontal scale-out is not free — routing must be sticky so the
  same scan id hits the same process. Not a concern on a single host.

---

## ADR-0004 — Split `api` and `web` into separate containers

**Status:** Accepted.

**Context.** Could have built Next.js API routes instead of running a
standalone Express process.

**Decision.** Two containers. The `api` image contains only the Express
backend; the `web` image contains only the Next.js standalone bundle.
Communication across the Docker network via rewrites in `next.config.mjs`.

**Consequences.**

- *Pro.* Each image stays tight — no Next.js bundle in the API image, no
  Express deps in the web image.
- *Pro.* Independent scaling: the API could be scaled to N replicas behind
  Caddy if we ever added a shared store (out of scope here).
- *Pro.* Easier to review — backend and frontend concerns are physically
  separated.
- *Con.* Two Dockerfiles to maintain. Two healthchecks. Two log streams.

---

## ADR-0005 — Caddy for reverse proxy and TLS

**Status:** Accepted.

**Context.** We need TLS on the public endpoint, a sensible default for
static caching (`/_next/static/*`), and enforced security headers for HTML
responses.

**Decision.** Use Caddy 2 with its built-in ACME (Let's Encrypt)
integration. Configure a single `Caddyfile` with a shared-headers snippet
and an HTML-CSP snippet, applied to both the production hostname and a
local dev `:80` catch-all.

**Consequences.**

- *Pro.* Auto-HTTPS works out-of-the-box given a real DNS name and open
  ports 80/443; no certbot cronjob.
- *Pro.* Sane CSP, HSTS, X-Frame-Options, Referrer-Policy, and
  Permissions-Policy defaults are enforced at the edge, before anything
  reaches the app.
- *Con.* Adds a runtime dependency we would not need if we fronted with
  Nginx from the distro. Considered acceptable — Caddy's ergonomics are
  substantially better for a one-host deploy.

---

## ADR-0006 — Pin Gemini model via environment variable, not code

**Status:** Accepted.

**Context.** Google's generative-ai models are versioned and deprecated on
a vendor-driven schedule. Hardcoding a model name into the source is a
latent production incident: when the vendor retires the model, the app
starts 404-ing without any code change on our side.

**Decision.** Default `GEMINI_MODEL=gemini-2.5-flash` in `api/src/config.ts`,
but allow any override via environment. The same principle is applied to
any future vendor-provided model names (OpenAI, Anthropic, etc.).

**Consequences.**

- *Pro.* Hotfix a model deprecation with a single `.env` change and a
  container restart — no rebuild, no redeploy.
- *Pro.* Reproducibility — a deployment records which model it used in
  its env, which is visible in the container's `docker compose config`.
- *Con.* Makes the "what model am I running" question require an env
  lookup. Minor.

---

## ADR-0007 — VT 409 is a signal, not a failure

**Status:** Accepted.

**Context.** VirusTotal deduplicates files by content hash globally. If
the same file has been uploaded by any user in the last few seconds, the
second upload receives `409 Already being scanned`. Treating this as a
generic HTTP failure would cause our app to report a scan failure for a
file VirusTotal is currently happily processing.

**Decision.** Catch the 409 branch in `virustotal.ts` and throw a typed
`VtAlreadySubmittedError`. In the upload route, recover by calling
`GET /files/{sha256}` with the SHA-256 computed from our own stream, and
resume with the existing `last_analysis_id`. If the hash lookup also
misses, surface `SCAN_FAILED` with a retry-in-a-moment message.

**Consequences.**

- *Pro.* Popular files (sample malware, well-known libs) still produce
  sensible scans instead of spurious 502s.
- *Pro.* The recovery path opportunistically reuses a cached terminal
  analysis, making repeated scans of the same file effectively instant.
- *Con.* Introduces a second VT call on every 409 path — a 4 req/min
  budget can be exhausted faster under a tight loop of identical
  uploads. The `uploadHourly` bucket absorbs this in practice.

---

## ADR-0008 — Request-ID propagation through vendor calls

**Status:** Accepted.

**Context.** When a VT or Gemini call fails, we need to be able to correlate
the upstream error to a specific inbound HTTP request. Pino's
`req.requestId` gives us that on the inbound side; we need it on the
outbound side too.

**Decision.** Accept `reqId` on every `virustotal.ts` / `gemini.ts` function,
attach it to any `logger.warn` calls on upstream failure, and thread it
through from the originating route handler.

**Consequences.**

- *Pro.* A single grep by request id ties together every log line for a
  request, including upstream errors.
- *Pro.* Zero performance cost — it's a string in an option bag.
- *Con.* The `reqId` parameter is load-bearing for observability but has
  no functional effect, which makes it easy to forget on a new call site.
  Tests catch the common ones.

---

## ADR-0009 — `secure: 'auto'` on cookies (legacy guard)

**Status:** Accepted (preemptive / policy).

**Context.** The app does not currently issue cookies, but the memory rule
[Cookie secure:true trap](../../MEMORY/feedback_cookie_secure_trap.md)
reflects a prior incident where `express-session` with `secure: true` over
HTTP (behind a misconfigured proxy) silently drops `Set-Cookie`.

**Decision.** If cookies are ever introduced, use `secure: 'auto'` and
verify behaviour behind both HTTP (dev) and HTTPS (prod) before rollout.

**Consequences.** Forward-looking. No current code is affected.

---

## ADR-0010 — Dual enforcement of security headers

**Status:** Accepted.

**Context.** Caddy sets security headers at the edge, but so does the
Express middleware. Is one sufficient?

**Decision.** Enforce security headers at both layers. Caddy provides CSP
and sane defaults for all HTML/static responses; the Express middleware
ensures API responses carry `X-Content-Type-Options`, `X-Frame-Options`,
`Referrer-Policy`, and `Permissions-Policy` even if the request bypasses
Caddy (dev mode, direct port forwards, or a future change in topology).

**Consequences.**

- *Pro.* Defence in depth — if a new topology forgets to run traffic
  through Caddy, headers are still present.
- *Pro.* The smoke script can assert headers on `/healthz` and
  `/api/scans` regardless of which process responds.
- *Con.* Minor duplication between `Caddyfile` and `api/src/config/securityHeaders.ts`.
  The values in both are constant — drift is easy to see in review.

---

## ADR-0011 — `/metrics` is not publicly routed

**Status:** Accepted.

**Context.** `prom-client` emits default process metrics on `/metrics`
that, while mostly harmless, expose internal signals (open handles, GC
pauses) an attacker does not need.

**Decision.** The API exposes `/metrics` on its own port (4000), but
`Caddyfile` does not proxy `/metrics` to the outside world. The smoke
script verifies the negative case: `/metrics` on the public hostname must
not return 200.

**Consequences.**

- *Pro.* Scrapers inside the Docker network can still reach it (e.g. a
  future Prometheus sidecar).
- *Pro.* The public surface is minimised.
- *Con.* Adding external monitoring will need a deliberate change —
  either a `basic_auth` directive in Caddy or a dedicated internal
  scraper.
