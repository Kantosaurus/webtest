# 20 · API Reference

Authoritative wire contract for the Webtest HTTP API.

The API is private by design — it is reachable only from the `web`
container inside the Docker network, and all public calls go through the
Next.js rewrite rule at `web/next.config.mjs:19-23`. There is no
versioning scheme; all endpoints live under `/api/...`.

- [Conventions](./conventions.md) — headers, IDs, encodings, status-code
  conventions
- [Scans](./scans.md) — `POST /api/scans`, `GET /api/scans/:id`
- [Scan Events (SSE)](./scan-events.md) — `GET /api/scans/:id/events`
- [Messages (Chat, SSE)](./messages.md) — list / send / delete
- [Health & Metrics](./health-and-metrics.md) — `GET /healthz`, `GET /metrics`
- [Errors](./errors.md) — error envelope and `ErrorCode` union
- [Rate Limits](./rate-limits.md) — buckets, headers, test-mode relaxation
- [Data Models](./data-models.md) — shared object shapes

## Endpoint summary

| Method | Path | Purpose | Rate-limit bucket(s) |
|---|---|---|---|
| `POST` | `/api/scans` | Upload a file, start a scan | `global`, `upload`, `uploadHourly` |
| `GET` | `/api/scans/:id` | Fetch a scan by id | `global` |
| `GET` | `/api/scans/:id/events` | SSE stream of scan status | `global` |
| `GET` | `/api/scans/:id/messages` | List conversation history | `global` |
| `POST` | `/api/scans/:id/messages` | Send a user message, stream assistant reply | `global`, `chat` |
| `DELETE` | `/api/scans/:id/messages/:msgId` | Remove a message | `global` |
| `GET` | `/healthz` | Liveness probe | — |
| `GET` | `/metrics` | Prometheus scrape endpoint (not publicly routed) | — |
