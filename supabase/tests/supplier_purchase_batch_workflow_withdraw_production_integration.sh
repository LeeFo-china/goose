#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
container="${TASK9_POSTGRES_CONTAINER:-supabase_db_gooes}"
source_database="${TASK9_SOURCE_DATABASE:-postgres}"
database="gooes_task9_production_${$}"
admin_user="${TASK9_POSTGRES_ADMIN_USER:-supabase_admin}"
admin_password="${TASK9_POSTGRES_ADMIN_PASSWORD:-postgres}"

admin_psql() {
  docker exec -e PGPASSWORD="$admin_password" -i "$container" \
    psql -h 127.0.0.1 -U "$admin_user" -d "$database" -X \
    --set ON_ERROR_STOP=1 "$@"
}

cleanup() {
  docker exec -e PGPASSWORD="$admin_password" "$container" \
    dropdb -h 127.0.0.1 -U "$admin_user" --if-exists --force "$database" \
    >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker exec -e PGPASSWORD="$admin_password" "$container" \
  createdb -h 127.0.0.1 -U "$admin_user" "$database"

# Clone the real local Supabase schema and installed functions without copying
# mutable developer data. The deterministic fixture below is the only data
# difference from production; no workflow or purchase RPC is replaced.
docker exec "$container" pg_dump -U postgres -d "$source_database" \
  --schema-only --no-owner --no-privileges |
  admin_psql >/dev/null

migrations=(
  20260830100000_standardize_new_tenant_organization_template.sql
  20260830110000_add_supplier_purchase_batch_workflow_foundation.sql
  20260830111000_extend_supplier_workflow_rollout_command.sql
  20260830112000_seed_supplier_purchase_batch_workflow.sql
  20260830113000_create_supplier_purchase_batch_workflow_submit.sql
  20260830113500_list_supplier_purchase_batch_workflow_projection.sql
  20260830113600_list_accessible_supplier_purchase_batch_workflow_tasks.sql
  20260830113700_fix_supplier_purchase_batch_workflow_task_pagination.sql
  20260830113800_fix_supplier_purchase_batch_budget_preflight.sql
  20260830114000_create_supplier_purchase_batch_workflow_review.sql
  20260830115000_create_supplier_purchase_batch_workflow_withdraw.sql
)
for migration in "${migrations[@]}"; do
  admin_psql < "$repo_root/supabase/migrations/$migration" >/dev/null
done

admin_psql < \
  "$repo_root/supabase/tests/supplier_purchase_batch_workflow_withdraw_production_fixture.sql"
