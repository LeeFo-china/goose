#!/usr/bin/env bash
set -euo pipefail

BUN_BIN="${BUN_BIN:-bun}"

DEPLOY_JOB_STATUS="${DEPLOY_JOB_STATUS:-manual}" \
GITHUB_WORKSPACE="${GITHUB_WORKSPACE:-$(pwd)}" \
"$BUN_BIN" scripts/deploy-notify.ts

