# VirusTotal + Gemini File Scanner

A small, production-shaped web app that lets a user upload a file, scans it with VirusTotal, streams the result back via Server-Sent Events, and lets the user chat with a Gemini-powered assistant that explains the result in plain language.

Built as a take-home for CloudsineAI. The assignment prompt lives at [`docs/assignment.md`](docs/assignment.md).

---

## Stack

**Frontend** — Next.js 15 (App Router) · React 19 · TypeScript · Tailwind · Shadcn UI · TanStack Query · `react-markdown` + `remark-gfm` + `rehype-highlight`
**Backend** — Node.js 22 · Express · TypeScript · `busboy` + `form-data` (streaming upload) · `@google/generative-ai` · `pino` · `express-rate-limit` · `zod`
**Infra** — Docker Compose (Podman-compatible) · Caddy for auto-HTTPS · GitHub Actions CI+CD · AWS EC2
**Tests** — Vitest (unit, via `msw`) · Playwright (e2e smoke)

---

## Architecture

```
┌─────────────────────────────────────────────┐
│  EC2 host (Ubuntu 24.04, t3.small)          │
│                                             │
│  ┌────────┐   ┌─────────┐   ┌─────────┐     │
│  │ caddy  │──▶│  web    │──▶│  api    │     │
│  │ :80    │   │ Next.js │   │ Express │     │
│  │ :443   │   │ :3000   │   │ :4000   │     │
│  └────────┘   └─────────┘   └─────────┘     │
│                                   │         │
│                                   ├──▶ VirusTotal API
│                                   └──▶ Gemini API
└─────────────────────────────────────────────┘
```

Three services in one `docker-compose.yml`. Caddy terminates TLS (auto Let's Encrypt) and reverse-proxies to `web`. The browser talks to `web`, which rewrites `/api/*` to the internal `api:4000`. The `api` service streams uploads directly to VirusTotal (nothing touches disk), polls VT until the scan is terminal, keeps scans and chat history in a bounded in-memory map, and streams Gemini responses token-by-token over SSE.

**Design decisions** — the full rationale lives in [`docs/superpowers/specs/2026-04-23-virustotal-scanner-design.md`](docs/superpowers/specs/2026-04-23-virustotal-scanner-design.md). The step-by-step plan that shaped the implementation lives at [`docs/superpowers/plans/2026-04-23-virustotal-scanner.md`](docs/superpowers/plans/2026-04-23-virustotal-scanner.md). (Those artifacts describe an earlier, auth+Postgres variant of the design; the current code is a scope-reduced, stateless rework of the same skeleton.)

---

## Quick start (local)

```bash
git clone <this repo>
cd webtest
cp .env.example .env
# edit .env — at minimum fill in:
#   VT_API_KEY      (free key from https://www.virustotal.com/gui/my-apikey)
#   GEMINI_API_KEY  (free key from https://aistudio.google.com/apikey)
docker compose up -d --build
```

Then visit **http://localhost** (Caddy fronts the app on port 80). Drop one of the files in `files/` (e.g. `newegg_magecart_skimmer.js`) onto the upload zone, and watch the scan run.

If you also want the API and web services exposed on their own host ports (useful for backend debugging or running Playwright against `http://localhost:3000` directly), add the dev override:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build
# web → localhost:3000, api → localhost:4000
```

Works identically under Podman — replace `docker` with `podman` in the commands above. Images run as a non-root user and bind no privileged ports, so `podman compose` works without changes.

### Environment variables

| Name | Purpose |
|---|---|
| `VT_API_KEY` | VirusTotal v3 API key |
| `GEMINI_API_KEY` | Google AI Studio (Gemini) API key |
| `NODE_ENV`, `LOG_LEVEL` | `development` / `production`, pino level |
| `PUBLIC_HOSTNAME`, `ACME_EMAIL` | Production Caddy — the hostname whose cert Let's Encrypt issues, and the contact email |

---

## Testing

**API — unit tests**
```bash
cd api && npm test
```
Covers streaming hash/byte-counter transforms, VirusTotal client (mocked via `msw`), SSE writer, Gemini prompt builder.

**Web — Playwright e2e smoke**
```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build
cd web && E2E_BASE_URL=http://localhost:3000 npx playwright test
```
Covers: upload → see result; open scan → chat → streamed reply.

**All of the above also run in CI** via `.github/workflows/ci.yml` on every push and PR.

---

## Deployment (AWS EC2)

Auto-deploys to EC2 on every push to `main` via `.github/workflows/deploy.yml`. Images are built with `docker/build-push-action`, pushed to GHCR, and pulled on the host via SSH from a dedicated `deploy` user.

See [`docs/deployment.md`](docs/deployment.md) for the one-time host bootstrap, required GitHub Actions secrets, and operational runbooks (logs, rollback).

---

## Design rationale & trade-offs

- **Stream uploads directly to VirusTotal.** The incoming multipart stream passes through a sha256 hasher and a byte counter and into the outbound request to VT. Nothing is written to disk. Defense-in-depth: a 32 MB limit is enforced at `busboy`, at the byte counter, and via `Content-Length` pre-check.
- **SSE over long-polling.** Two natural fits for SSE: (1) scan progress (server polls VT, pushes `queued` / `running` / `result` events) and (2) Gemini token streaming. One uniform wire contract, no WebSocket ceremony.
- **Stateless, in-memory state.** Scans and chat history live in bounded Maps on the API process — no database, no login, no sessions. Scans are per-process and expire when the container restarts or the 500-entry cap evicts them. Zero persistence is the point: the app exists as a live analysis tool, not a history service.
- **Split `api` and `web` into separate containers.** Each image stays tight (no Next.js bundle in the API image, no Express deps in the web image). Clearer separation for review; independently scalable.
- **Dark-first UI, OKLCH palette, Commissioner + Geist Mono.** The design DNA captured in `.impeccable.md` — "analytical instrument" aesthetic, restraint over decoration, typography-led hierarchy. No gradient text, no card-in-card, no glassmorphism.

---

## Known limitations

- **VirusTotal free tier:** 4 requests/minute, 500/day. The server polls scan status at 2s; a single scan uses roughly 5–15 polls depending on how quickly VT completes. Concurrent uploads can exhaust the budget.
- **Gemini conversation history is unbounded (per scan).** For very long chats the prompt grows until the model's context limit. Summarization of older turns would be the natural next step.
- **Production `next.config.mjs` uses `output: 'standalone'`.** This fails at the `Collecting build traces` step on Windows without Developer Mode (Windows symlink policy) — Linux (CI + Docker) builds are unaffected.

---

## Repository layout

```
api/                  # Express + TypeScript backend
  src/
    routes/           # scans, scanEvents (SSE), messages, health
    services/         # virustotal, gemini, scans (in-memory), messages (in-memory)
    lib/              # errors, hash transforms, SSE writer, prompt builder
    middleware/       # error, rateLimit, requestId
  tests/
    unit/             # hash, virustotal, sse, promptBuilder
web/                  # Next.js 15 App Router
  app/
    page.tsx          # dashboard with upload zone
    scans/[id]/       # scan detail + chat
  components/
    ui/               # shadcn primitives
    upload/ scans/ chat/ nav/
  lib/                # api client, sse reader, types
  tests/e2e/          # playwright smoke
scripts/              # bootstrap-ec2.sh
docs/                 # assignment prompt + design spec + plan + deployment runbook
files/                # sample test files (real malware + benign libs)
.github/workflows/    # ci.yml, deploy.yml
docker-compose.yml, docker-compose.dev.yml, docker-compose.prod.yml
Caddyfile
.env.example
```

---

## Submission

The assignment prompt is preserved at [`docs/assignment.md`](docs/assignment.md). This repository satisfies each of its requirements and implements both bonus sections (Dockerization with separate dev/prod configs, full CI/CD pipeline with auto-deploy).
