#!/usr/bin/env bash
set -euo pipefail

BASE="${1:-http://localhost}"

echo "smoke: $BASE"

echo "→ /healthz"
curl -fsS "${BASE}/healthz" | grep -q '"status":"ok"'
echo "  ok"

echo "→ security headers on /"
HDRS=$(curl -fsS -I "${BASE}/")
echo "$HDRS" | grep -qi '^x-content-type-options: nosniff' || { echo "missing X-Content-Type-Options"; exit 1; }
echo "$HDRS" | grep -qi '^x-frame-options: DENY' || { echo "missing X-Frame-Options"; exit 1; }
echo "$HDRS" | grep -qi '^referrer-policy:' || { echo "missing Referrer-Policy"; exit 1; }
echo "  ok"

echo "→ oversized upload rejected at edge"
STATUS=$(curl -s -o /dev/null -w '%{http_code}' -X POST "${BASE}/api/scans" \
  -H 'content-type: multipart/form-data; boundary=x' \
  -H "content-length: $((33 * 1024 * 1024))")
if [[ "$STATUS" != "413" ]]; then
  echo "expected 413, got $STATUS"
  exit 1
fi
echo "  ok"

echo "→ /metrics NOT publicly routed"
STATUS=$(curl -s -o /dev/null -w '%{http_code}' "${BASE}/metrics" || true)
if [[ "$STATUS" == "200" ]]; then
  echo "WARN: /metrics is publicly reachable; should be internal-only"
  exit 1
fi
echo "  ok ($STATUS)"

echo "smoke: PASS"
