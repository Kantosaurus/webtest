# Deployment (AWS EC2)

This document describes the one-time host setup and the automated deploy flow.

## Architecture

- AWS EC2 instance (Ubuntu 24.04 LTS, `t3.small`, Elastic IP attached).
- Docker Compose runs four services: `db` (Postgres 16), `migrate` (one-shot), `api` (Express), `web` (Next.js), `caddy` (reverse proxy with auto-HTTPS via Let's Encrypt).
- Images are built by GitHub Actions and pulled from GitHub Container Registry (`ghcr.io`).
- Deployment is triggered automatically on push to `main` via `.github/workflows/deploy.yml`.

## One-time host setup

1. **Launch the instance.** Ubuntu 24.04 LTS, `t3.small`, attach an Elastic IP, security group open to TCP 22 (your IP), 80, 443.

2. **Copy the bootstrap script and run it.** From your laptop:
   ```bash
   scp scripts/bootstrap-ec2.sh ubuntu@<elastic-ip>:/tmp/
   ssh ubuntu@<elastic-ip> "sudo bash /tmp/bootstrap-ec2.sh"
   ```
   The script installs Docker + Compose, creates a `deploy` user in the `docker` group, enables UFW with ports 22/80/443 open, and installs a nightly `pg_dump` cron at 03:00 UTC.

3. **Paste your GHA deploy public key.** From the machine that generated the GHA deploy keypair:
   ```bash
   ssh ubuntu@<elastic-ip> "sudo -u deploy tee -a /home/deploy/.ssh/authorized_keys" < ~/.ssh/gha_deploy.pub
   ```

4. **Copy runtime files to `/opt/webtest/`**:
   ```bash
   scp docker-compose.yml docker-compose.prod.yml Caddyfile .env.example scripts/backup-db.sh \
       deploy@<elastic-ip>:/opt/webtest/
   ```
   Then SSH in and fill in `.env`:
   ```bash
   ssh deploy@<elastic-ip>
   cd /opt/webtest
   mv .env.example .env
   vim .env                       # fill in VT_API_KEY, GEMINI_API_KEY, SESSION_SECRET, PUBLIC_HOSTNAME, ACME_EMAIL
   chmod 600 .env
   chmod +x backup-db.sh
   ```

5. **Point DNS at the Elastic IP.** Either use a free DuckDNS subdomain (`myapp.duckdns.org`) or a real domain. Set `PUBLIC_HOSTNAME` in `.env` to the DNS name; Caddy will acquire a Let's Encrypt cert automatically on first boot.

## Required GitHub Actions secrets

Settings -> Secrets and variables -> Actions:

| Secret | Description |
|---|---|
| `EC2_HOST` | Elastic IP or DNS name of the host |
| `EC2_USER` | `deploy` |
| `EC2_SSH_KEY` | Private half of the keypair whose public half is in `/home/deploy/.ssh/authorized_keys` |
| `GHCR_TOKEN` | GitHub PAT with `read:packages` scope (for the EC2-side `docker login`) |
| `VT_API_KEY` | VirusTotal API key (only used by the CI `e2e` job, not for deploy) |
| `GEMINI_API_KEY` | Gemini API key (only used by the CI `e2e` job, not for deploy) |

App runtime secrets live in `/opt/webtest/.env` on the host — they never pass through GHA.

## First deploy

Push to `main`. The `deploy.yml` workflow:
1. Builds `api` and `web` images with `docker/build-push-action`.
2. Tags them with the commit SHA and `latest`, pushes to `ghcr.io`.
3. SSHes into EC2 as `deploy`, runs `docker compose -f docker-compose.yml -f docker-compose.prod.yml pull && up -d`.

Watch the workflow at `Actions -> Deploy`.

## Rollback

Re-run a prior successful `Deploy` workflow run with the **Run workflow** button (uses `workflow_dispatch`). It will push the old SHA's images and restart the stack.

For a hot rollback without GHA:
```bash
ssh deploy@<host>
cd /opt/webtest
export API_IMAGE=ghcr.io/<owner>/<repo>-api:<old-sha>
export WEB_IMAGE=ghcr.io/<owner>/<repo>-web:<old-sha>
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

## Operations

- **Logs:** `ssh deploy@<host>` then `cd /opt/webtest && docker compose logs -f api` (or `web`, `db`, `caddy`).
- **Health:** `curl -sf https://<host>/ > /dev/null && echo OK`.
- **Shell into the API:** `docker compose exec api sh`.
- **psql into the DB:** `docker compose exec db psql -U webtest webtest`.

## Backup & restore

A nightly dump runs at 03:00 UTC via `/etc/cron.d/webtest-backup`, producing `/opt/webtest/backups/YYYY-MM-DD_HHMMZ.sql.gz`. Retention is 7 days (older files auto-deleted).

To restore:
```bash
ssh deploy@<host>
cd /opt/webtest
gunzip -c backups/2026-04-23_0300Z.sql.gz | docker compose exec -T db psql -U webtest webtest
```

## Troubleshooting

- **Caddy can't acquire a cert.** Confirm the DNS points to the EC2 IP, UFW allows 80/443, and `ACME_EMAIL` is set. First-boot cert acquisition takes up to a minute.
- **Healthchecks flapping.** `docker compose ps` shows per-service health. Look at `docker compose logs api` for stack traces, or `docker compose exec db psql -U webtest webtest -c 'select 1'` to sanity-check Postgres.
- **Image pull fails on EC2.** Re-run `docker login ghcr.io` with a fresh PAT.
