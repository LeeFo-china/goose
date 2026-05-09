#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$ROOT_DIR"

rg -n \
  'from\("(customers|projects|employees|project_logs|expense_requests)"\)|from\('\''(customers|projects|employees|project_logs|expense_requests)'\''\)' \
  apps/api/src \
  -g '!node_modules'
