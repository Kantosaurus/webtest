# Setup

## Prerequisites

| Tool | Version | Notes |
|---|---|---|
| **Node.js** | 22.x | `22.11+` is fine; older minors may work but CI pins 22 |
| **npm** | 10.x | Bundled with Node 22 |
| **Docker** | 24+ with Compose v2 | Podman works too — `podman compose` honours the same `docker-compose.yml` |
| **A VirusTotal key** | — | Free from <https://www.virustotal.com/gui/my-apikey> |
| **A Gemini key** | — | Free from <https://aistudio.google.com/apikey> |

### Optional

- **Playwright browsers** — installed via `npx playwright install chromium`
  once per machine if you run e2e tests outside CI.
- **jq, curl, bash** — for the smoke script.

## Environment

From the repo root:

```bash
cp .env.example .env
```

Open `.env` and fill in the two required keys. Leave `PUBLIC_HOSTNAME`
as `localhost` for local work.

## Bring up the stack

The base compose file is production-shaped. For local iteration, add
the `.dev.yml` override so Playwright (or you) can reach the web and
api containers directly on host ports `3000` / `4000`.

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build
```

Then visit <http://localhost>. Caddy fronts the app on port 80; the
dev override additionally publishes `web:3000` and `api:4000` for
direct access.

### First-time behaviour to expect

- The first build downloads about ~300 MB of base images.
- The first scan against VT will use one of your quota calls; expect
  VT to take 10–30 seconds for engines to finish.
- The Gemini first response may be slower than subsequent ones due to
  model warm-up.

### Tear down

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml down
# Add -v to also drop volumes (resets Caddy's local state; fine in dev)
```

## Running workspaces directly (not in Docker)

For fast iteration, run `api` and `web` directly:

```bash
# Terminal 1 — api
cd api
npm ci
VT_API_KEY=... GEMINI_API_KEY=... npm run dev

# Terminal 2 — web
cd web
npm ci
INTERNAL_API_BASE=http://localhost:4000 npm run dev
```

The `web` dev server proxies `/api/*` to `INTERNAL_API_BASE`, so this
layout matches the Docker wire flow without the container overhead.

### Hot reload

- **api** — `tsx watch` reloads on save.
- **web** — `next dev` reloads on save.

## Code checks

Run these before pushing (CI will fail if they do):

```bash
# api
cd api
npm run lint
npm run typecheck
npm test
npm run test:cov      # full coverage gate

# web
cd web
npm run lint
npm run typecheck
npm run build         # catches SSR / static analysis issues
```

## Playwright

```bash
# Bring up the dev stack first (see above)
cd web
E2E_BASE_URL=http://localhost:3000 npx playwright test
```

If you're on a fresh machine: `npx playwright install chromium`.

To debug a flaky test: `PWDEBUG=1 npx playwright test --debug`.

## Smoke check

```bash
bash scripts/smoke.sh http://localhost
```

See [Observability → Smoke check](../40-operations/observability.md#smoke-check)
for what it asserts.

## Editor setup

Any editor that understands TypeScript works. Recommended settings:

- **Format on save** — Prettier is configured in both workspaces.
- **ESLint** — both workspaces have their own configs; your editor
  should pick them up per-project.
- **TypeScript** — use the workspace version, not the bundled one,
  so version mismatches between `api` (TS 5.5) and `web` don't bite.

## Windows note

`next build` with `output: 'standalone'` can fail at
`Collecting build traces` on Windows without Developer Mode (Windows
symlink policy). Workarounds:

1. Enable Developer Mode in Windows settings.
2. Or, run only the Docker build on Windows (the build runs inside a
   Linux container, unaffected).
3. Or, run `next dev` for UI work — the standalone output is only
   produced on `next build`.
