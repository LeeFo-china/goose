#!/usr/bin/env bash
set -uo pipefail

PM2_BIN="${PM2_BIN:-pm2}"

echo "=== Health Checks ==="

API_STATUS="$(curl -s -o /tmp/goose-notify-api-health.txt -w "%{http_code}" http://127.0.0.1:3000/ 2>/dev/null || echo "000")"
ADMIN_STATUS="$(curl -s -o /tmp/goose-notify-admin-health.html -w "%{http_code}" http://127.0.0.1:3010/dashboard 2>/dev/null || echo "000")"

echo "goose_http_status=$API_STATUS"
echo "goose_admin_http_status=$ADMIN_STATUS"

echo ""
echo "=== PM2 Summary ==="
"$PM2_BIN" list 2>&1 || true

echo ""
echo "=== Service Ports ==="
if command -v ss >/dev/null 2>&1; then
  ss -lntp | grep -E ':(3000|3010)\b' || echo "No services listening on 3000/3010"
else
  echo "ss command not found"
fi

echo ""
echo "=== Recent Deploy Trace ==="
tail -80 /tmp/goose-deploy-trace.log 2>/dev/null || echo "No deploy trace found"

rm -f /tmp/goose-notify-api-health.txt /tmp/goose-notify-admin-health.html 2>/dev/null || true

