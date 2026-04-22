#!/usr/bin/env bash
# Daily Postgres dump -- deployed to /opt/webtest/backup-db.sh, run via cron by the deploy user.
set -euo pipefail

cd /opt/webtest

STAMP=$(date -u +%F_%H%MZ)
OUT="backups/${STAMP}.sql.gz"

docker compose exec -T db pg_dump -U "${POSTGRES_USER:-webtest}" "${POSTGRES_DB:-webtest}" | gzip > "$OUT"

# Retain 7 days
find backups -type f -name '*.sql.gz' -mtime +7 -delete

echo "[$(date -u +%FT%TZ)] backup ${OUT} ($(du -h "$OUT" | awk '{print $1}'))"
