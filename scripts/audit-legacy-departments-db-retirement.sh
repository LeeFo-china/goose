#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$ROOT_DIR"

supabase db query \
  --linked \
  --file scripts/audit-legacy-departments-db-retirement.sql \
  --output json
