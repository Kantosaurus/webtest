# Runbooks

Operational procedures for the incidents an on-call engineer is most
likely to face. Each runbook is designed to be followed top-to-bottom,
with grep-able headings, so it works when paged at 3 AM.

---

## RB-01 · The site is down

**Symptom:** browser returns `ERR_CONNECTION_REFUSED` or the TLS
handshake fails.

### Triage

1. Confirm from a second network (mobile tether, public Wi-Fi) that
   it isn't your local DNS.
2. Check the EC2 instance status in AWS console. Reboot if it's
   stopped.
3. SSH in as `deploy`:
   ```bash
   ssh deploy@<host>
   cd /opt/webtest
   docker compose ps
   ```

### Decision tree

- **All containers `Up (healthy)`.** The issue is networking or DNS.
  Check UFW (`sudo ufw status`), the security group, and the DNS
  record.
- **`caddy` is restarting.** Likely a cert-acquisition or config
  error. See RB-03.
- **`web` or `api` is restarting.** Logs:
  ```bash
  docker compose logs --tail=100 web api
  ```
  A common cause is a missing env var — verify `/opt/webtest/.env`
  still exists and contains `VT_API_KEY` and `GEMINI_API_KEY`.

### Last-resort recovery

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml down
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
bash /opt/webtest/scripts/smoke.sh https://<host>    # if smoke.sh is present
```

---

## RB-02 · VirusTotal is failing

**Symptom:** users report "Scan failed" or `webtest_vt_request_total{outcome=fail}`
spikes.

### Triage

1. SSH in and grep logs:
   ```bash
   docker compose logs api | jq 'select(.msg == "VT http error")' | tail
   ```
2. Identify the `status` field on those warns.

### Decision tree

- **401 / 403.** `VT_API_KEY` is wrong, missing, or rotated. Update
  `/opt/webtest/.env` and restart `api`:
  ```bash
  docker compose restart api
  ```
- **429 (even with low volume).** Check the VT dashboard for the
  key's quota. Free tier is 4 req/min, 500/day. If quota is
  genuinely low, wait; otherwise consider upgrading the key.
- **5xx.** VT is down. There's nothing to do on our side; the retry
  policy (3 attempts, jittered) is already doing its best. Watch
  VT's [status page](https://status.virustotal.com/).
- **`VtAlreadySubmittedError` in logs but no `SCAN_FAILED` spike.**
  This is the 409 → hash-lookup recovery path working as intended.
  No action.

---

## RB-03 · Caddy cert acquisition failed

**Symptom:** browser shows a TLS certificate error, or Caddy logs
show ACME errors.

### Triage

```bash
docker compose logs caddy | grep -iE 'acme|certificate|tls' | tail -50
```

### Common causes

- **DNS doesn't point to the EC2 IP.** ACME HTTP-01 requires the
  public hostname to resolve to the host Caddy is running on. Verify
  with `dig <host>`.
- **Port 80 not open.** HTTP-01 challenges land on `:80`. Check UFW
  and the AWS security group.
- **`ACME_EMAIL` unset.** Caddy uses the email for rate-limited ZeroSSL
  fallback. Missing, and things stall. Fix in `.env` and restart.
- **Rate-limited by Let's Encrypt.** You have hit the 5 duplicate
  certs/week cap. Wait, or temporarily configure `tls internal` in
  `Caddyfile` while you sort the underlying issue.

### Forcing a re-issue

Remove the stored certificate and let Caddy re-acquire:

```bash
docker compose exec caddy sh -c 'rm -rf /data/caddy/certificates/*/<host>*'
docker compose restart caddy
```

---

## RB-04 · Out of disk

**Symptom:** `No space left on device`. Uploads fail; container
restarts fail.

### Triage

```bash
df -h
docker system df -v
```

### Resolution

Most of the time this is dangling images from prior deploys that the
automatic `docker image prune -f` missed.

```bash
docker image prune -af
docker volume prune -f   # BUT read the list first — caddy_data has certs!
```

Do **not** delete the `caddy_data` or `caddy_config` volumes. They
hold the TLS certificates.

---

## RB-05 · Deploy failed

**Symptom:** `deploy.yml` shows a red run; site may be healthy (old
version) or broken (half-deployed).

### Triage (from GitHub)

1. Open the failed run. Identify which job failed.
2. If **build** failed → no images were pushed; production is still
   running the prior deploy's images. Fix forward in code.
3. If **deploy** failed → examine the `ssh-action` log. The `docker
   compose pull` or `up -d` may have failed for a transient reason
   (GHCR rate limit, ssh hiccup). Re-run the workflow with
   **Run workflow** on the same ref.

### If the site is broken

Roll back to the last known good image set:

```bash
ssh deploy@<host>
cd /opt/webtest
export API_IMAGE=ghcr.io/<owner>/<repo>-api:<last-good-sha>
export WEB_IMAGE=ghcr.io/<owner>/<repo>-web:<last-good-sha>
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
bash scripts/smoke.sh https://<host>
```

---

## RB-06 · Gemini chat stream fails

**Symptom:** users report seeing "Model stream failed" or the retry
button on the chat panel.

### Triage

```bash
docker compose logs api | jq 'select(.msg == "gemini stream error")' | tail
```

### Decision tree

- **Auth error (401 / 403).** `GEMINI_API_KEY` is rotated or invalid.
  Update `.env` and restart `api`.
- **404 on the model.** The pinned `GEMINI_MODEL` has been
  deprecated. Pick a current model from Google's docs and update
  `.env`. The point of pinning via env is exactly so you don't need
  to rebuild.
- **Rate-limited.** Chat bucket on our side won't be the cause; this
  is the upstream key's limit. Consider requesting quota.
- **Network error on the first chunk.** Usually transient. The UI
  retry will re-drive.

---

## RB-07 · Memory is climbing

**Symptom:** `process_resident_memory_bytes` is trending up over
hours/days.

### Triage

The app's in-memory store is bounded by design (500 scans, 1h TTL).
Unbounded growth points to a leak.

```bash
# Snapshot heap
docker compose exec api node -e "require('v8').writeHeapSnapshot('/tmp/heap.heapsnapshot')"
# Copy to your laptop
docker compose cp api:/tmp/heap.heapsnapshot .
# Open in Chrome DevTools → Memory → Load
```

### Likely suspects

- An SSE stream that does not detach on client disconnect.
- A `setInterval` that doesn't `.unref()`.
- A `Buffer` accumulated in `uploadToVt` that doesn't get GC'd.

The usual mitigation is `docker compose restart api` while the root
cause is investigated. State loss is acceptable.

---

## RB-08 · Secret rotation

### VT / Gemini keys

1. Generate a new key upstream.
2. SSH in and update `/opt/webtest/.env`.
3. `docker compose restart api`.
4. Run smoke:
   ```bash
   bash scripts/smoke.sh https://<host>
   ```
5. Delete the old key upstream.

### GHA secrets

- **`EC2_SSH_KEY`** — generate a new keypair on an ephemeral
  workstation, paste the new public key into
  `/home/deploy/.ssh/authorized_keys`, update the private key in GHA
  secrets, then remove the old public key from the host.
- **`GHCR_TOKEN`** — generate a new PAT with `read:packages`,
  update in GHA, trigger a deploy to confirm `docker login` works,
  revoke the old PAT.

---

## RB-09 · Post-incident

Every incident deserves a short write-up saved next to the ADRs at
`docs/10-architecture/design-decisions.md` (add a new numbered
record) or a dated note under `docs/superpowers/` if it's a longer
retrospective. Capture:

- What happened (symptoms, customer impact, start/end times).
- How we found out.
- What we did.
- What we'd change (code / process).
