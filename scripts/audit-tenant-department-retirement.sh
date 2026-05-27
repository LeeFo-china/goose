#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$ROOT_DIR"

set -a
[ -f .env.local ] && source .env.local
[ -f .env ] && source .env
set +a

supabase db query \
  --linked \
  --file scripts/audit-tenant-department-retirement.sql \
  --output json
