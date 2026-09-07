#!/usr/bin/env bash
# Fixed local container only. Every schema/fixture change is rolled back.
set -euo pipefail
cd "$(dirname "$0")/.."
case "${1:-green}" in
  green|red) smoke_mode="${1:-green}" ;;
  *) printf '%s\n' 'Usage: bash scripts/smoke-h5-customer-leads.sh [green|red]' >&2; exit 2 ;;
esac
{
  printf '%s\n' 'BEGIN;' "SET LOCAL customer_lead_smoke.local_endpoint = '127.0.0.1:54322';"
  for migration_file in \
    supabase/migrations/20260906040943_tenant_customer_lead_permissions.sql \
    supabase/migrations/20260906043943_tenant_customer_lead_commands.sql
  do
    sed '/^BEGIN;$/d; /^COMMIT;$/d' "$migration_file"
  done
  sed -n '1,$p' scripts/smoke-h5-customer-leads-history.sql
  if [[ "$smoke_mode" = green ]]; then
    sed '/^BEGIN;$/d; /^COMMIT;$/d' supabase/migrations/20260906121818_tenant_h5_customer_leads.sql
  fi
  sed '/^BEGIN;$/d; /^ROLLBACK;$/d' scripts/smoke-h5-customer-leads.sql
  if [[ "$smoke_mode" = green ]]; then
    # Reuse the complete existing Douyin regression suite. Its sole H5 rejection
    # assertion now tests an actually unsupported source; the saved SQL is untouched.
    sed "/^BEGIN;$/d; /^ROLLBACK;$/d; s/'h5'/'unsupported'/g" scripts/smoke-customer-lead-commands.sql
  fi
  printf '%s\n' 'ROLLBACK;'
} | docker exec -i supabase_db_gooes psql -U postgres -d postgres -X -v ON_ERROR_STOP=1
