# Troubleshooting

Common failure modes you'll hit while developing locally, each with a
root cause and a fix.

---

## Uploads hang or fail with `NetworkError when attempting to fetch resource`

**Cause.** Next 15 caps request bodies through its rewrite pipeline
at 10 MB and its proxy timeout at 30 s by default. Uploads above 10
MB silently truncate; the upstream socket resets and the browser
surfaces a network error.

**Fix.** Confirm `web/next.config.mjs:16-17` still contains:

```ts
experimental: {
  middlewareClientMaxBodySize: '32mb',
  proxyTimeout: 120_000,
}
```

If you've rebased through a version bump, re-assert these options.

---

## `api` container exits immediately with a zod error

**Cause.** Missing or empty required env var (`VT_API_KEY`,
`GEMINI_API_KEY`).

**Fix.** Check `docker compose logs api`. Fix `.env`, then
`docker compose up -d` (compose will restart the container with the
corrected env).

---

## `next build` fails on Windows at "Collecting build traces"

**Cause.** `output: 'standalone'` uses symlinks that require
Developer Mode on Windows.

**Fix.** Any one of:

1. Enable Developer Mode in Windows settings.
2. Use `next dev` during UI development — the standalone output is
   only produced on `next build`.
3. Let Docker build the image (Linux inside, unaffected).

---

## Scans stay "queued" forever

**Cause.** The VT analysis ID is valid but the poll is returning
transient errors, or the VT API is degraded.

**Fix.**

- Open `docker compose logs api` and grep for `VT poll error`. That
  log line tells you what VT returned.
- If it's a 429, wait for the minute-window to reset (4 req/min on
  the free tier).
- If it's a 5xx, it's VT's problem — retries are already happening.
  The 150 s safety ceiling will mark the scan `failed` if VT never
  recovers.

---

## Chat keeps saying "Model stream failed"

**Cause.** Usually one of: invalid `GEMINI_API_KEY`, a deprecated
`GEMINI_MODEL`, or a transient network error on the first chunk.

**Fix.**

1. `docker compose logs api | grep -i gemini`.
2. For auth errors: rotate the key.
3. For 404 on the model: update `GEMINI_MODEL` in `.env` to a
   current model and restart `api` (no rebuild).
4. For transient: use the in-UI retry.

---

## `docker compose up` reports "Cannot start service caddy: Ports are not available"

**Cause.** Something else on your machine is already bound to 80 or
443 — commonly another local web server or a previous compose run
that didn't tear down cleanly.

**Fix.**

```bash
# Find the squatter
sudo lsof -i :80
sudo lsof -i :443

# Clean up a previous compose run
docker compose -f docker-compose.yml -f docker-compose.dev.yml down
```

---

## Playwright tests hang at "Boot stack"

**Cause.** The web container healthcheck hasn't become healthy — most
often because the API isn't starting (secret missing) or the image
hasn't been rebuilt after a source change.

**Fix.**

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml logs --tail=100
```

Check for zod errors, API bind failures, or a `npm ci` error at
build time. Rebuild with `--build --no-cache` as a last resort.

---

## `pino-pretty` missing / logs look like raw JSON in dev

**Cause.** Running the production image (`--omit=dev`) with
`NODE_ENV=development` — the pretty transport isn't installed.

**Fix.** Either:

- Use `NODE_ENV=production` with the prod image (the fallback is
  deliberate), or
- Rebuild the dev workspace with `npm ci` (no `--omit=dev`) and run
  with `tsx` directly.

---

## Scan page says "Scan not found"

**Cause.** The scan id was evicted from the in-memory store —
either:

- It's been more than 1 hour since its last update.
- More than 500 scans have been created since.
- The `api` container restarted.

All three are expected. Start a new scan.

---

## The halftone backdrop on the landing page is flickering

**Cause.** Possibly mismatched `prefers-reduced-motion` detection,
or a canvas-related rendering issue in the browser.

**Fix.**

1. In dev tools, toggle *Emulate CSS media type* → *Reduce motion*.
   Confirm the animation pauses.
2. If it still flickers with reduced motion, that's a bug —
   `HalftoneField.tsx`'s animation gate is the first place to look.

---

## `npm ci` fails with `EACCES` on Windows

**Cause.** Usually a stale `node_modules` from a previous permission
set, or antivirus / OneDrive locking files.

**Fix.**

- Exclude the repo from antivirus real-time scanning.
- Close the repo out of OneDrive, or move it outside the OneDrive
  folder.
- Delete `node_modules` with `rm -rf` in Git Bash (not File Explorer
  — File Explorer will fail on long paths).

---

## The `.dark` class isn't applied on first paint

**Cause.** The no-flash inline script in `app/layout.tsx` is being
blocked by CSP, or `localStorage.theme` isn't set.

**Fix.**

- Confirm in DevTools that the script executes (look in the Elements
  tab for the `<script>` tag).
- Ensure the CSP allows `'unsafe-inline'` for scripts (it does by
  default in `Caddyfile`; a stricter CSP would need a nonce — see
  [Security → Future hardening](../40-operations/security.md#future-hardening)).

---

## I see `DeprecationWarning: The 'punycode' module is deprecated`

**Cause.** Node 22 deprecates built-in punycode. The warning comes
from a transitive dependency, not our code.

**Fix.** Ignore it until the upstream dep upgrades. It does not
affect behaviour.
