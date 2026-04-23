# Configuration Reference

Every environment variable consumed by the application, where it's
read, and what happens if it's wrong. The zod schema in
`api/src/config.ts:4-15` is authoritative for the API side.

## API variables

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `NODE_ENV` | no | `development` | `development`, `test`, or `production`. Enables HSTS, disables pretty logs, relaxes rate-limit math in test |
| `LOG_LEVEL` | no | `info` | Pino level: `trace \| debug \| info \| warn \| error \| fatal` |
| `API_PORT` | no | `4000` | HTTP listen port |
| `VT_API_KEY` | **yes** | — | VirusTotal v3 API key. Read only at startup via `config.VT_API_KEY` |
| `GEMINI_API_KEY` | **yes** | — | Google AI Studio API key |
| `GEMINI_MODEL` | no | `gemini-2.5-flash` | Model id. Override to migrate past a deprecation without rebuilding |
| `PUBLIC_HOSTNAME` | no | `localhost` | Advisory only for the API; meaningful for Caddy |

### Behaviour on missing required vars

The zod schema validates at `process.env` parse time. If `VT_API_KEY`
or `GEMINI_API_KEY` is empty or absent, the API process exits
immediately with a zod error — the container restart loop is the only
symptom. Check `docker compose logs api` for the schema error.

## Web variables

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `NODE_ENV` | no | `production` in the runtime image | `next` uses this to pick dev/prod behaviours |
| `INTERNAL_API_BASE` | no | `http://api:4000` | Destination of the `/api/*` rewrite |
| `NEXT_TELEMETRY_DISABLED` | no | `1` in the runtime image | Opts out of Next's anonymous telemetry |
| `HOSTNAME` | no | `0.0.0.0` in the runtime image | Bind address of the standalone server |
| `PORT` | no | `3000` | Listen port |

## Caddy variables

Read from the compose `environment:` block and substituted into the
`Caddyfile`:

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `PUBLIC_HOSTNAME` | **yes** in prod | `localhost` | The hostname Caddy requests a cert for |
| `ACME_EMAIL` | **yes** in prod | `admin@localhost` | Contact email for Let's Encrypt; missing address may be rate-limited |

## Compose variables

Read by `docker compose` itself from the environment or `.env`:

| Variable | Default | Purpose |
|---|---|---|
| `IMAGE_TAG` | `latest` | Tag to apply to locally-built `webtest-*` images |
| `API_IMAGE` | `ghcr.io/owner/webtest-api:latest` | Override the API image (prod overlay) |
| `WEB_IMAGE` | `ghcr.io/owner/webtest-web:latest` | Override the web image (prod overlay) |
| `NODE_ENV` | `production` | Propagated into all services |
| `LOG_LEVEL` | `info` | Propagated into `api` |

The production deploy sets `API_IMAGE` and `WEB_IMAGE` to the current
commit SHA in `deploy.yml`. Local dev leaves them at the default so
the local build is used.

## `.env` file

The canonical `.env` lives at `/opt/webtest/.env` on the production
host, with mode `0600` owned by `deploy`. A reference template exists
at `.env.example` in the repo root:

```bash
# /opt/webtest/.env
VT_API_KEY=<virustotal-api-key>
GEMINI_API_KEY=<gemini-api-key>
PUBLIC_HOSTNAME=webtest.example.org
ACME_EMAIL=ops@example.org

# Optional
# NODE_ENV=production
# LOG_LEVEL=info
# GEMINI_MODEL=gemini-2.5-flash
```

## Secrets that are *not* env vars

- **Caddy's TLS certs** — stored in the `caddy_data` Docker volume.
- **GHA secrets** — see [CI/CD → Required secrets](./ci-cd.md#required-secrets).

## Verifying configuration

```bash
# Dump the effective compose config (secrets redacted is your job in review)
ssh deploy@<host>
cd /opt/webtest
docker compose -f docker-compose.yml -f docker-compose.prod.yml config
```

## Changing configuration

### Without a rebuild

Anything that's read at process startup (all the values above) is
picked up on a simple restart:

```bash
docker compose restart api   # or web, or caddy for Caddyfile changes
```

### With a rebuild

Neither the API nor the web image bakes configuration in at build
time. A rebuild is only needed when source changes — see
[CI/CD](./ci-cd.md) for the standard flow.

## Known hazards

- **Don't set `NODE_ENV=development` on the production image.** The
  image was built with `npm ci --omit=dev`, so `pino-pretty` is
  missing. The logger falls back to JSON gracefully, but other tools
  that assume dev deps exist (e.g. tsx) will not be present.
- **Don't put `secure: true` on session cookies.** See the memory
  rule in [Design Decisions ADR-0009](../10-architecture/design-decisions.md#adr-0009--secure-auto-on-cookies-legacy-guard).
- **Don't hardcode Gemini model names.** Use `GEMINI_MODEL` (see
  ADR-0006).
