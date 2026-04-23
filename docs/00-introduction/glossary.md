# Glossary

Short definitions for terms used across the codebase and this manual.

### Analysis ID
The identifier that VirusTotal returns from `POST /files` (or the
`last_analysis_id` attribute from `GET /files/{hash}`). Used by
[`getAnalysis()`](../../api/src/services/virustotal.ts) to poll scan progress.

### Caddy
The HTTP server used as the public-facing reverse proxy. Terminates TLS,
serves static assets with aggressive `Cache-Control`, and sets security
headers for non-API responses. Configuration lives in `Caddyfile`.

### Chat turn
One user message plus its assistant reply. Turns are stored under a scan's
`conversationId` in the in-memory `messages` service.

### CSP
Content Security Policy. Set by Caddy at the HTML response layer. See
[Security](../40-operations/security.md) for the policy in force.

### Engine
One of the antivirus / analysis engines that VirusTotal runs against a file.
Their per-engine verdict appears in the `results` object of the analysis
response; the aggregate counts appear in `stats`.

### Gemini
Google's generative AI family. The app uses `@google/generative-ai` to stream
tokens; the exact model is pinned in the `GEMINI_MODEL` environment variable
(default `gemini-2.5-flash`).

### Golden flow
Shorthand for the two user-visible paths that matter:
1. **Upload → scan progress → verdict** (covered by the SSE scan events).
2. **Verdict → first assistant reply** (covered by chat SSE).
The smoke script exercises both.

### HSTS
`Strict-Transport-Security` header. Only sent in production (where Caddy has
an actual certificate), never in development — sending it from HTTP would be
a no-op, but sending it from a mis-configured HTTPS deployment would pin
browsers to a broken host.

### Idempotent upload
VirusTotal deduplicates files globally by hash, so two uploads of the same
file produce the same analysis. Our server takes advantage of this: when
VirusTotal returns `409 Already being scanned`, we fall back to
`GET /files/{sha256}` and resume with the existing analysis. See
[VT 409 Recovery](../10-architecture/design-decisions.md#adr-0007-vt-409-is-a-signal-not-a-failure).

### OKLCH
A perceptually uniform colour space used throughout the design system. All
palette colours are authored as `oklch(lightness chroma hue)` so that
steps in lightness feel even to the eye. See
[Design System](../30-frontend/design-system.md).

### Request ID
A UUIDv4 assigned to every inbound HTTP request by the `requestId` middleware.
Echoed back as `X-Request-Id`, stamped on every log line via `pino-http`, and
forwarded to VirusTotal and Gemini calls as the `reqId` option so upstream
errors can be correlated end-to-end.

### SSE
Server-Sent Events. A one-way streaming contract over ordinary HTTP where the
response body is an infinite stream of `event: <name>\ndata: <json>\n\n`
frames. Used for scan progress and Gemini token streaming.

### Stateless store
The in-memory `Map` holding scans (and, scoped by scan id, chat turns). There
is no database. Entries are subject to a 1-hour TTL sweep and a 500-entry LRU
cap. A container restart drops all state.

### Terminal status
A scan status that will never change again: `completed` or `failed`. The
SSE event stream closes as soon as a terminal status is reached.

### Verdict
The user-facing summary of a completed scan: `Malicious`, `Suspicious`,
`Clean`, or `Failed`. Derived from the VirusTotal `stats` object by
[`computeVerdict`](../../web/components/scans/ScanRail.tsx).

### VirusTotal (VT)
[virustotal.com](https://www.virustotal.com/). The upstream multi-engine file
scanning service the app integrates with. We use the v3 public API.
