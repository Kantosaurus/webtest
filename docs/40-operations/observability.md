# Observability

Three pillars: **logs**, **metrics**, and the **smoke check**. No
distributed tracing is wired in today (the system is a single process);
the request-id plumbing makes adding OpenTelemetry later a small lift.

## Logs

### Format

- **Production:** JSON on stdout, emitted by `pino` with the default
  ECS-adjacent schema.
- **Development:** pretty-printed via `pino-pretty` iff the module is
  installed. In the production image it isn't (`npm ci --omit=dev`
  prunes dev deps), so `NODE_ENV=development` in the prod image will
  still produce JSON — a conscious fallback rather than a hard crash.

### Fields

Every log line carries at least:

- `level` — `trace | debug | info | warn | error | fatal`
- `time` — unix epoch in ms
- `pid`, `hostname` (auto)
- `reqId` — the `req.requestId` of the handling request (HTTP-scoped
  lines) or the `reqId` option of an upstream call (VT / Gemini)

### Redaction

`pino` is configured to strip these paths on its way out:

```ts
redact: {
  paths: ['req.headers.cookie', 'req.headers.authorization',
          '*.password', '*.password_hash'],
  remove: true,
}
```

The app does not currently read request cookies, but the redaction
remains as a safety net should cookies ever be introduced.

### Following logs

```bash
# On the host
ssh deploy@<host>
cd /opt/webtest
docker compose logs -f api       # or web, caddy
```

To filter by request id:

```bash
docker compose logs api --no-color | jq 'select(.reqId == "<id>")'
```

### Notable log events

| Event | Source | Level | Trigger |
|---|---|---|---|
| `VT http error` | `services/virustotal.ts` | warn | Non-OK response from VT (pre-retry) |
| `VT poll error` | `routes/scanEvents.ts` | warn | VT returned an error during the SSE poll |
| `gemini chunk error` | `services/gemini.ts` | warn | Gemini stream chunk failed to parse |
| `gemini stream error` | `routes/messages.ts` | warn | Gemini generation threw — user sees "Retry" |
| `app error` | `middleware/error.ts` | warn | An `AppError` was thrown (expected failure) |
| `unhandled error` | `middleware/error.ts` | error | An unclassified exception bubbled up (check stack) |

## Metrics

Served on `/metrics` (not publicly routed — see
[ADR-0011](../10-architecture/design-decisions.md#adr-0011-metrics-is-not-publicly-routed)).

### Custom metrics

| Metric | Type | Labels | Notes |
|---|---|---|---|
| `webtest_upload_total` | counter | `result = accepted \| rejected` | Increments per upload attempt |
| `webtest_vt_request_total` | counter | `outcome = ok \| retry \| fail` | Counted once per individual VT call (including retries) |
| `webtest_chat_messages_total` | counter | — | User-initiated chat messages |
| `webtest_rate_limit_rejected_total` | counter | `bucket` | Per-bucket rejection count |
| `webtest_upload_duration_seconds` | histogram | — | Wall time for the upload request handler |
| `webtest_gemini_first_token_ms` | histogram | — | Ingest→first-token latency |

### Default metrics

`collectDefaultMetrics({ register: registry })` provides:

- `process_cpu_*`, `process_resident_memory_bytes`, `process_open_fds`
- `nodejs_heap_*`, `nodejs_gc_*`, `nodejs_eventloop_lag_seconds`
- `nodejs_version_info` (gauge keyed by semver)

See [Health & Metrics](../20-api-reference/health-and-metrics.md) for
the full exposure contract and suggested alerts.

## Request-ID correlation

Every inbound request is tagged with a UUIDv4 (or the client-provided
`X-Request-Id`, whichever is present). The id:

- Is returned to the client in the `X-Request-Id` response header.
- Is present on every `pino-http` log line for that request.
- Is forwarded as the `reqId` option to every VT / Gemini call, so any
  upstream warn is correlatable to the originating request.

This is the primary tool for incident triage: *"user reports error
around 12:33 UTC → pull logs by `reqId`"*.

## Smoke check

`scripts/smoke.sh` is a user-space test that validates invariants any
deploy must hold. Runnable against any reachable hostname:

```bash
bash scripts/smoke.sh https://<public-hostname>
```

### Checks

1. **`/healthz` returns 200 with the expected JSON.**
2. **Security headers are present on `/`:**
   `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
   `Referrer-Policy: ...`.
3. **Oversized upload is rejected at the edge.** Sends a
   `Content-Length` of 33 MB and asserts a 413 response.
4. **`/metrics` is not publicly routed.** Asserts any response other
   than 200 on the public hostname.

Exit code is zero on success; non-zero on any single check's failure.
Intended to be run:

- As the final step of a manual deploy.
- As a periodic cron / external monitor.
- In CI against the dev-compose stack (not currently wired in; good
  future work).

## Suggested dashboards

If/when a metrics stack is set up (Prometheus + Grafana), the
dashboards that would pay for themselves:

1. **Scan health** — `webtest_upload_total` rate split by `result`;
   `webtest_vt_request_total` rate split by `outcome`; 2xx/4xx/5xx
   rate on `/api/scans`.
2. **LLM latency** — p50/p95 of `webtest_gemini_first_token_ms`;
   chat messages per minute; count of `event: error` SSE frames
   (requires an additional counter).
3. **Node health** — heap size, event-loop lag, resident memory,
   open FDs.

## What's deliberately not here

- **No APM vendor.** Datadog / New Relic / Honeycomb integrations are
  all viable, but a single-host hobby-scale deploy doesn't justify
  the cost or the configuration surface.
- **No error-tracking service.** Sentry is a reasonable future
  addition; the hook would be in `middleware/error.ts:11` (where
  unhandled errors are logged). Scope today: structured logs are
  enough.
- **No tracing.** OpenTelemetry would pair well with the request-id
  plumbing; the refactor is mechanical — wrap Express with
  `@opentelemetry/instrumentation-express` and add trace context to
  outbound fetches.
