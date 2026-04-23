# Health & Metrics

## `GET /healthz`

A liveness probe. Returns `200` as long as the Express event loop is
responsive.

```bash
curl -sf http://localhost:4000/healthz
# {"ok":true}
```

The Docker healthcheck in `api/Dockerfile:26-27` polls this endpoint via
`fetch('http://127.0.0.1:4000/healthz')` every 10 seconds.

Caddy does not proxy `/healthz` externally — it is reachable only on the
API's own port (and via the Docker network). Container-level health state
is visible with `docker compose ps`.

### Deeper checks

There is no `/readyz` or dependency-probing endpoint. The philosophy here
is that upstream dependencies (VT, Gemini) have their own latency and
availability characteristics that don't correlate with our ability to
serve requests — gating liveness on them would cause false positives.

The closer equivalent to "can we actually do a scan?" is the smoke
script at `scripts/smoke.sh`.

---

## `GET /metrics`

Prometheus scrape endpoint. Served by `prom-client`. Content-type is
`text/plain; version=0.0.4` (or whatever `registry.contentType` is on the
installed version).

```bash
curl -s http://localhost:4000/metrics | head -20
```

### Exposed metrics

| Metric | Type | Labels | What it measures |
|---|---|---|---|
| `webtest_upload_total` | counter | `result = accepted \| rejected` | File upload attempts |
| `webtest_vt_request_total` | counter | `outcome = ok \| retry \| fail` | Individual VT API requests |
| `webtest_chat_messages_total` | counter | — | User messages POSTed to `/messages` |
| `webtest_rate_limit_rejected_total` | counter | `bucket` | Rate-limit rejections, per bucket |
| `webtest_upload_duration_seconds` | histogram | — | Wall time for the upload request handler |
| `webtest_gemini_first_token_ms` | histogram | — | Latency from chat POST to the first streamed token |

In addition, `collectDefaultMetrics({ register: registry })` enables the
standard Node metrics: `process_*` (CPU, memory, resident set), `nodejs_*`
(heap size, GC durations, event-loop lag), and the default process-level
counters.

### Scraping

The endpoint is intentionally **not publicly routed** — the `Caddyfile`
does not forward `/metrics` to the outside world. The smoke script
verifies the negative case:

```bash
# Must return something other than 200 on the public hostname.
STATUS=$(curl -s -o /dev/null -w '%{http_code}' https://<host>/metrics)
[[ "$STATUS" != "200" ]]
```

See `scripts/smoke.sh:29-35`.

To scrape `/metrics` in production, the intended path is to run a
Prometheus sidecar *inside* the Docker network and point it at
`api:4000/metrics`. That change would also need a deliberate
`basic_auth` directive on Caddy if the metrics are ever to be externally
surfaced.

### Example output

```text
# HELP webtest_upload_total File upload attempts
# TYPE webtest_upload_total counter
webtest_upload_total{result="accepted"} 12
webtest_upload_total{result="rejected"} 1

# HELP webtest_gemini_first_token_ms Latency from chat POST to first Gemini token
# TYPE webtest_gemini_first_token_ms histogram
webtest_gemini_first_token_ms_bucket{le="100"} 0
webtest_gemini_first_token_ms_bucket{le="250"} 0
webtest_gemini_first_token_ms_bucket{le="500"} 2
webtest_gemini_first_token_ms_bucket{le="1000"} 8
...
```

### Suggested alerts

These are indicative — wire them up if a Prometheus/Alertmanager stack is
introduced.

| Alert | Expression | Severity |
|---|---|---|
| VT failure rate elevated | `rate(webtest_vt_request_total{outcome="fail"}[5m]) / rate(webtest_vt_request_total[5m]) > 0.05` | warning |
| Upload rejection spike | `rate(webtest_upload_total{result="rejected"}[5m]) > 0.2` | info |
| First-token p95 slow | `histogram_quantile(0.95, sum by (le) (rate(webtest_gemini_first_token_ms_bucket[5m]))) > 4000` | warning |
| Rate-limit pressure | `sum(rate(webtest_rate_limit_rejected_total[1m])) > 1` | info |
| Event loop lag | `nodejs_eventloop_lag_seconds > 0.1` | warning |
