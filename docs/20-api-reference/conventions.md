# Conventions

## Base URL

From the browser, the API is always addressed relatively as `/api/*`. The
Next.js rewrite at `web/next.config.mjs:19-23` forwards to
`${INTERNAL_API_BASE}/api/*`, where `INTERNAL_API_BASE` defaults to
`http://api:4000` inside Docker.

From a tool running on the host (curl, Playwright), you can address the
API directly on port 4000 if the dev compose override is active.

## Request headers

| Header | Purpose | Notes |
|---|---|---|
| `Content-Type` | `application/json` for JSON bodies, `multipart/form-data` for uploads | Rejected with 400 if upload is not multipart |
| `Content-Length` | Required by the upload pre-check | `> 32 MB + 1 KB` triggers early `413 FILE_TOO_LARGE` |
| `X-Request-Id` | Optional caller-provided request id | Copied to `req.requestId`; echoed back on the response |
| `Accept` | Respected by content-negotiation where applicable | SSE endpoints always return `text/event-stream` regardless of `Accept` |

## Response headers

| Header | Value / Purpose |
|---|---|
| `X-Request-Id` | Always echoed, either the client-provided value or a server-generated UUIDv4 |
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `DENY` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains; preload` (production only) |
| `RateLimit-*` | draft-7 rate-limit headers on any limited endpoint |
| `X-Accel-Buffering` | `no` on SSE responses |

Security headers are applied by the `securityHeaders` middleware at
`api/src/middleware/securityHeaders.ts:6-9` and mirrored by the Caddy
reverse proxy.

## Content types

- JSON bodies are parsed with `express.json({ limit: '100kb' })`. Requests
  whose JSON body exceeds that limit receive a 413 from Express itself
  (bypassing our error envelope — rare enough to be acceptable).
- Upload bodies are parsed by `busboy`. Only one file per request; other
  parts are ignored.

## Identifiers

- **Scan id** — UUIDv4 (`randomUUID()` from `node:crypto`).
- **Message id** — UUIDv4. Message ids are unique within a conversation;
  there is no cross-scan lookup.
- **VT analysis id** — opaque string from VirusTotal.
- **Request id** — UUIDv4 per request unless the client supplies its own
  `X-Request-Id`.

## Timestamps

All timestamps returned by the API are ISO-8601 strings in UTC (produced
by `Date.prototype.toISOString()`).

## Status codes

| Code | Semantics |
|---|---|
| **200** | Resource returned, or (for SSE) stream will follow |
| **202** | Scan accepted; the body contains the scan id |
| **204** | Resource deleted |
| **400** | Validation error — body shape or content-type mismatch |
| **404** | Unknown scan or message id |
| **413** | Upload too large (Content-Length or streamed bytes) |
| **429** | Rate-limited (bucket named in the message) |
| **502** | Upstream (VT) failure — `SCAN_FAILED` |
| **500** | Unexpected error (pino logs full stack; caller gets a generic message) |

Every non-2xx response returns the [error envelope](./errors.md).

## Pagination

No endpoints paginate. Lists returned are bounded by design:

- `GET /scans/:id/messages` — up to 200 messages per conversation.
- No endpoint enumerates all scans; scans are only addressable by their
  UUIDv4 id.

## Idempotency

- **Uploads** are idempotent in effect thanks to VT's global
  deduplication: re-uploading the same bytes will recover the same
  analysis id (see [ADR-0007](../10-architecture/design-decisions.md#adr-0007-vt-409-is-a-signal-not-a-failure)).
- **Chat** is *not* idempotent. Every POST appends a new user turn and
  generates a new assistant reply.
- **Delete** is idempotent: the second delete on the same message id
  returns 404, consistent with the semantics of "the resource no longer
  exists".

## Concurrency

There is no request-level locking. Two concurrent uploads of the same
bytes from two different clients will both attempt to POST to VT; the
second will receive 409 and fall back to the hash lookup. Both clients
end up with distinct scan ids but equivalent results.

The chat endpoint guards against overlapping streams at the *client*
level (the UI disables the composer while `streaming`), but the server
does not serialise them. If two POSTs to `/messages` arrive back-to-back,
they will interleave — the second will run while the first is still
streaming, and the stored conversation will contain both user turns
followed by both assistant turns, in arrival order.
