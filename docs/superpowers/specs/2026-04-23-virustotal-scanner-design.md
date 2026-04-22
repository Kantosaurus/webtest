# VirusTotal + Gemini File Scanner — Design

**Status:** Draft for review
**Date:** 2026-04-23
**Context:** CloudsineAI take-home assignment (see `README.md` at repo root)

---

## 1. Objective

Build a web application that lets an authenticated user upload a file, scans it via the VirusTotal API, presents the results, and lets the user chat with a Gemini-powered assistant that explains those results in plain language.

The application is deployed to AWS EC2 via a fully automated GitHub Actions pipeline. All services run in containers and are compatible with both Docker Compose and Podman.

## 2. Scope

**In scope**
- Email/password authentication (self-signup, bcrypt, httpOnly session cookies)
- File upload up to 32 MB, streamed directly to VirusTotal (never touches disk)
- Asynchronous scan progress surfaced to the browser via Server-Sent Events
- Scan history persisted per user in PostgreSQL
- Full chat UI per scan: streamed responses, markdown rendering, stop-generating, regenerate, persisted transcripts
- Containerized services orchestrated by `docker-compose.yml`, Podman-compatible
- GitHub Actions CI (lint + typecheck + unit + integration + e2e) and CD (build, push to GHCR, SSH-deploy to EC2)
- EC2 bootstrap script, HTTPS via Caddy, daily Postgres backups

**Out of scope**
- Password reset / email verification / MFA
- OAuth providers
- Admin dashboard, audit logs
- Metrics, tracing, external log aggregation
- Multi-region or horizontally-scaled deployment
- Rich admin features (user management, rate-limit tuning UI)

## 3. Architecture

Four containers on a single EC2 host:

```
┌─────────────────────────────────────────────────────────┐
│  EC2 host (Ubuntu 24.04, t3.small)                      │
│                                                         │
│  ┌────────┐   ┌─────────┐   ┌─────────┐   ┌─────────┐   │
│  │ caddy  │──▶│  web    │──▶│  api    │──▶│  db     │   │
│  │ :80    │   │ Next.js │   │ Express │   │Postgres │   │
│  │ :443   │   │ :3000   │   │ :4000   │   │ :5432   │   │
│  └────────┘   └─────────┘   └─────────┘   └─────────┘   │
│                                   │                     │
│                                   ├──▶ VirusTotal API   │
│                                   └──▶ Gemini API       │
└─────────────────────────────────────────────────────────┘
```

- **`caddy`** — reverse proxy with automatic Let's Encrypt HTTPS; forwards `/*` to `web`.
- **`web`** — Next.js 15 (App Router), React, Tailwind, Shadcn UI. Server Components where possible; Client Components for interactive bits (upload, SSE subscribers, chat).
- **`api`** — Express.js + TypeScript. Owns auth, file upload, VT integration, Gemini integration, DB access, SSE endpoints.
- **`db`** — PostgreSQL 16, single named volume `webtest_pgdata`.

All containers run as non-root users and bind no privileged ports internally, so the same compose file runs unchanged under `podman compose`.

**Why a separate `api` service instead of Next.js Route Handlers:** clearer separation for evaluators, independently scalable, each image stays tight (no Next.js bundle in the API image), and it matches the "Express backend" spec constraint from the user.

## 4. Data model

Four tables in Postgres. `CITEXT` extension required for case-insensitive emails.

```sql
users (
  id            BIGSERIAL PRIMARY KEY,
  email         CITEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,        -- bcrypt, cost 12
  created_at    TIMESTAMPTZ DEFAULT now()
)

session (                              -- managed by connect-pg-simple
  sid    VARCHAR PRIMARY KEY,
  sess   JSON NOT NULL,
  expire TIMESTAMPTZ NOT NULL
)

scans (
  id              BIGSERIAL PRIMARY KEY,
  user_id         BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  vt_analysis_id  TEXT UNIQUE NOT NULL,
  file_name       TEXT NOT NULL,
  file_sha256     TEXT NOT NULL,
  file_size       BIGINT NOT NULL,
  status          TEXT NOT NULL CHECK (status IN ('queued','running','completed','failed')),
  result          JSONB,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX scans_user_created_idx ON scans (user_id, created_at DESC);

messages (
  id         BIGSERIAL PRIMARY KEY,
  scan_id    BIGINT NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
  role       TEXT NOT NULL CHECK (role IN ('user','assistant','system')),
  content    TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX messages_scan_created_idx ON messages (scan_id, created_at);
```

Migrations live in `api/migrations/`, numbered SQL files, applied by `node-pg-migrate` via a one-shot `migrate` service in compose that runs before `api` starts.

## 5. API surface

All routes are served by the Express `api` service, mounted under `/api`. All responses are JSON except SSE endpoints.

### Auth
```
POST   /api/auth/register   { email, password } → 201, sets session cookie
POST   /api/auth/login      { email, password } → 200, sets session cookie
POST   /api/auth/logout                         → 204, clears cookie
GET    /api/auth/me                             → { id, email } | 401
```

Sessions are httpOnly, `SameSite=Strict`, `Secure` in production, 7-day expiry, stored in Postgres via `connect-pg-simple`.

### Scans (auth required; ownership enforced by `WHERE user_id = $session.userId`)
```
POST   /api/scans                  multipart/form-data, single "file" field
                                   → 202 { scanId, analysisId, status: "queued" }

GET    /api/scans                  → [{ id, fileName, status, createdAt }, ...]
                                     (newest first, limit 50)

GET    /api/scans/:id              → { id, fileName, fileSha256, fileSize,
                                        status, result, createdAt, updatedAt }

GET    /api/scans/:id/events       text/event-stream
                                   events: status | result | error
                                   (server polls VT internally; 2s interval,
                                    150s cap; closes connection on terminal state)
```

### Chat (auth + ownership required)
```
GET    /api/scans/:id/messages     → [{ id, role, content, createdAt }, ...]
                                     (excludes role='system')

POST   /api/scans/:id/messages     { content } → text/event-stream
                                   events: token | done | error
                                   (persists user message on receipt;
                                    persists assistant message on success only)

DELETE /api/scans/:id/messages/:msgId   → 204
                                   (used for "regenerate": drop last assistant,
                                    then re-POST the previous user content)
```

### Health
```
GET    /healthz                    → 200 { ok: true } if DB ping succeeds
```

### Cross-cutting
- Rate limits via `express-rate-limit`, per-IP, in-memory: 10 req/min on `/api/auth/*`, 30 req/min elsewhere.
- Request IDs attached by middleware; echoed in `X-Request-Id` response header.
- Errors return `{ error: { code, message } }` with stable `code` strings (e.g., `FILE_TOO_LARGE`, `UNAUTHORIZED`, `NOT_FOUND`, `SCAN_FAILED`).

## 6. Key flows

### 6.1 Upload → VirusTotal (streaming, no disk)

1. Browser POSTs `multipart/form-data` with one `file` field.
2. `busboy` parses the multipart stream; the file field's readable stream is piped through two `Transform`s: a streaming SHA-256 hasher and a byte counter.
3. The output is piped into a `form-data` body that is sent as the request body of `POST https://www.virustotal.com/api/v3/files`.
4. If the byte counter exceeds 32 MB, the pipeline is destroyed with an error → the request is rejected with `413 FILE_TOO_LARGE`. `busboy` is also configured with the same limit as defense-in-depth.
5. On VT success, the server inserts a `scans` row with `status='queued'`, `vt_analysis_id`, `file_name` (sanitized for display only), `file_sha256`, `file_size`.
6. Response: `202 { scanId, analysisId, status: 'queued' }`.

A single `AbortController` wraps both the incoming and outbound requests so a client disconnect or VT failure cleanly tears down both sides. No temporary file is created at any point.

### 6.2 Scan status via SSE

1. Browser opens `EventSource('/api/scans/:id/events')`.
2. Server first reads the current row. If `status` is terminal (`completed`/`failed`), it emits one event with the final state and closes.
3. Otherwise, server polls `GET /api/v3/analyses/:vt_analysis_id` every 2 seconds, up to 150 seconds total.
4. Each poll result is translated into a `status` event (`queued` → `running`) or a terminal `result`/`error` event.
5. On terminal event, server `UPDATE scans SET status, result, updated_at`, then closes the stream.
6. `req.on('close')` cancels the poll loop if the browser disconnects; `EventSource` reconnects automatically and the server re-checks DB state, short-circuiting if the scan is already terminal.

### 6.3 Chat with Gemini

1. Browser sends `POST /api/scans/:id/messages` with `{ content }`.
2. Server verifies ownership, inserts the user message.
3. Server builds the Gemini request:
   - **System prompt** (static, injected every turn): explains the role, mandates on-topic responses about this file's scan, instructs the model to politely redirect off-topic questions.
   - **Scan context** (static per scan): filename, SHA-256, status, verdict counts (malicious/suspicious/harmless/undetected), top 5 engine names that flagged the file. Derived from `scans.result`, not the raw JSON.
   - **Conversation history**: all prior `messages` rows for this scan, ordered ascending.
   - **New user turn**: the just-inserted message.
4. Server calls `gemini.generateContentStream(...)` and streams each chunk as a `token` event.
5. On stream end, server inserts the assistant message and emits a `done` event with `{ msgId, fullText }`.
6. On `req.on('close')` (user clicked Stop), server aborts the Gemini stream and does **not** persist the assistant message. Tokens already delivered to the client remain in the UI.

**Regenerate** is handled entirely client-side: the UI deletes the last assistant message (`DELETE /api/scans/:id/messages/:msgId`) and re-POSTs the previous user content. No special endpoint.

## 7. Frontend structure

```
app/
├── (auth)/
│   ├── login/page.tsx
│   └── register/page.tsx
├── (app)/
│   ├── layout.tsx               # top nav; middleware-gated
│   ├── page.tsx                 # dashboard: upload + history table
│   └── scans/[id]/page.tsx      # scan detail + chat
├── layout.tsx                   # root; Tailwind + Shadcn providers
└── globals.css

components/
├── ui/                          # shadcn primitives
├── upload/                      # UploadDropzone, ScanProgress (SSE)
├── scans/                       # ScansTable, ScanResult
├── chat/                        # ChatPanel, MessageList, MessageBubble,
│                                # MarkdownRenderer, Composer, useChatStream
└── auth/                        # LoginForm, RegisterForm

lib/
├── api.ts                       # typed fetch wrapper, credentials: 'include'
├── sse.ts                       # fetch-based SSE parser (for POST streams)
└── types.ts                     # Scan, Message, User, VtResult
```

- `middleware.ts` checks for the session cookie on `(app)` routes and redirects to `/login` if missing. Cookie validity is re-verified by the API on each call.
- **Server state** via TanStack Query (scans list, scan detail, messages). **UI state** via React local state.
- **Markdown rendering:** `react-markdown` + `remark-gfm` + `rehype-highlight`, wrapped to match Tailwind typography.
- **Auto-scroll** during streaming follows the ChatGPT pattern: stick to bottom by default; if the user scrolls up, stop auto-scrolling and show a "Jump to latest" button that re-engages it.
- **Stop / Send button** toggles during streaming. Stop calls `AbortController.abort()` on the in-flight fetch.

## 8. Security

- **No disk writes for user files.** Streams directly from the request into the outbound VT request via `busboy` → `form-data`.
- **Upload limits:** `busboy` enforces 32 MB at the parser level; a streaming byte counter enforces it again inside the pipeline as defense-in-depth. One file per request. Content-Type must start with `multipart/form-data`.
- **Filename sanitization:** only used for display. Stored as-is but rendered with React (auto-escaped); never used as a path.
- **Password storage:** bcrypt, cost factor 12.
- **Sessions:** httpOnly, `SameSite=Strict`, `Secure` in production, rotating secret in `.env`.
- **CSRF:** SameSite=Strict cookies + state-changing routes require `Content-Type: application/json` (or `multipart/form-data` for uploads) and reject simple-form CSRF by Content-Type. Same-origin deployment behind Caddy means the browser never cross-origins to the API.
- **Ownership checks:** every `:id` route includes `AND user_id = $session.userId` in its query. No IDOR.
- **Secrets:** `VT_API_KEY`, `GEMINI_API_KEY`, `SESSION_SECRET`, `POSTGRES_PASSWORD` in `.env` on the EC2 host (not in GHA).
- **Rate limiting:** per-IP, in-memory: 10/min on auth, 30/min elsewhere.
- **Gemini prompt scoping:** system prompt constrains the model to scan-related topics and instructs it to redirect off-topic questions; prevents turning the app into a general-purpose chatbot.

## 9. Testing strategy

Three tiers, each with a defined purpose.

| Tier | Tool | Scope | What runs |
|------|------|-------|-----------|
| Unit | Vitest | Pure functions | VT client (mocked fetch), Gemini prompt builder, SSE parser, password utils |
| Integration | Vitest + Testcontainers + msw | API routes with real Postgres, mocked external APIs | Auth flow, upload happy/size-reject, scan ownership isolation, chat persistence, SSE event ordering |
| E2E | Playwright | Full stack via `docker compose up` | Two smoke tests: register→upload→see result; open scan→ask chatbot→see streamed answer |

Not doing: snapshot tests, visual regression, coverage thresholds.

## 10. CI/CD

### `ci.yml` — on pull_request and push
```
jobs: lint → typecheck → test-unit → test-integration → test-e2e
```
Runs in parallel where possible (lint/typecheck/test-unit independent; integration and e2e depend on their service dependencies).

### `deploy.yml` — on push to main, requires ci.yml green
```
jobs:
  build-images:
    - docker buildx build web, api with tags: ghcr.io/<user>/<app>-{web,api}:{sha,latest}
    - docker push
  deploy-ec2:
    needs: build-images
    - ssh to EC2 (appleboy/ssh-action)
    - cd /opt/webtest
    - export IMAGE_SHA=${{ github.sha }}
    - docker compose pull && docker compose up -d
      # the one-shot `migrate` service in compose runs migrations before
      # `api` starts (see §12); no explicit migrate command needed here
    - docker image prune -f
```

- **Concurrency group** on `deploy.yml` prevents overlapping deploys.
- **Rollback** = re-run a previous successful `deploy.yml` run via `workflow_dispatch`.
- **Secrets in GHA:** `EC2_HOST`, `EC2_USER`, `EC2_SSH_KEY`, `EC2_KNOWN_HOSTS`, plus `GHCR_TOKEN` for the push step.
- App secrets live on the EC2 host in `.env`; GHA never sees them.

## 11. Deployment (EC2)

**Host:** Ubuntu 24.04 LTS, `t3.small` (free-tier eligible, sufficient RAM for Postgres + Next.js build).

**Bootstrap** (`scripts/bootstrap-ec2.sh`, run once):
- Install `docker`, `docker compose` plugin, `ufw`.
- `ufw allow 22,80,443`; deny everything else.
- Create `deploy` user, add GHA public key to `~deploy/.ssh/authorized_keys`, add to `docker` group.
- `mkdir -p /opt/webtest && chown deploy:deploy /opt/webtest`.
- Copy `docker-compose.yml`, `Caddyfile`, and `.env.example` into `/opt/webtest/`.
- Operator fills in `.env` by hand (VT, Gemini, Postgres, session secrets).

**Runtime layout on host:**
```
/opt/webtest/
├── docker-compose.yml
├── Caddyfile               # HTTPS, proxies to web
├── .env                    # secrets (0600, owned by deploy)
└── backups/                # nightly pg_dump output
```

**HTTPS:** Caddy acquires a free Let's Encrypt cert using a DuckDNS (or similar free-subdomain) hostname. No paid domain required for the submission.

**Backups:** `cron` on host runs `docker compose exec -T db pg_dump -U postgres webtest | gzip > /opt/webtest/backups/$(date +%F).sql.gz` daily; `find … -mtime +7 -delete` retention.

## 12. Containerization

**Per-service Dockerfiles:** multi-stage (`deps` → `build` → `runtime`). Runtime image is `node:22-alpine`, runs as UID 1001 non-root. `.dockerignore` excludes `node_modules`, `.git`, `.env*`, tests, docs.

**Compose services:**
- `caddy` (reverse proxy)
- `web` (Next.js)
- `api` (Express)
- `db` (Postgres, named volume)
- `migrate` (one-shot, `depends_on: db`, runs `node-pg-migrate up`)

**Healthchecks:** `api` pings `/healthz`; `web` pings `/`. `depends_on: condition: service_healthy` orders startup: `db` → `migrate` (completion) → `api` → `web` → `caddy`.

**Podman compatibility:** verified by running `podman compose up` locally; no host-bind mounts except the Caddy cert volume; no privileged ports inside containers; no `host.docker.internal` usage.

## 13. Observability

Minimal but real:
- `GET /healthz` on API, checks DB ping.
- `pino` structured JSON logging: one line per HTTP request with `reqId`, `userId` (if authed), `method`, `path`, `status`, `durationMs`. Errors include stack traces.
- `docker compose logs -f api` for live tailing; no external log aggregator.

## 14. Risks and open questions

- **Scope is aggressive for a take-home.** Full chat UI + SSE + streaming-to-VT + auth + auto-deploy is roughly 2–3× a typical assignment. If implementation time is tight, the revisable cuts (in order) are: e2e tests → regenerate button → stop-generating button → markdown code-highlighting → auto-HTTPS (fall back to HTTP for submission). Core flow (upload → result → one Gemini explanation) must remain intact.
- **VirusTotal free tier:** 4 requests/minute, 500/day. The server polls at 2s; a single scan uses ~5–15 polls. Burst of concurrent uploads would exhaust the budget. Out of scope to fix (single-user demo), but noted.
- **Gemini context window:** conversation history grows unbounded. For this scope we send the full transcript; if a conversation grows past ~30 turns we may need to summarize older messages. Flagged for implementation plan.
- **EC2 SSH key in GHA:** single point of failure. A hardened alternative (GHA OIDC → AWS IAM → SSM Run Command) avoids SSH entirely but triples the AWS setup work. Out of scope for v1.

## 15. Appendix: sample files

The repo ships `files/` with five test files:
- `forbes_magecart_skimmer.js`, `newegg_magecart_skimmer.js` — real-world malicious JS
- `obfuscated_cryptomine.js` — heavily obfuscated malicious sample
- `jquery-3.5.1.min.js`, `moment.min.js` — known-benign libraries

The e2e smoke test uses `newegg_magecart_skimmer.js` (smallest malicious sample; fastest VT turnaround via cache) to verify the full flow.
