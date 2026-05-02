#!/usr/bin/env bash
set -euo pipefail

TRACE_FILE="${DEPLOY_TRACE_FILE:-/tmp/goose-deploy-trace.log}"

if [ ! -f "$TRACE_FILE" ]; then
  echo "Deploy trace not found: $TRACE_FILE"
  exit 0
fi

tail -120 "$TRACE_FILE"

