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

admin_scalar() {
  admin_psql --tuples-only --no-align --quiet --command "$1"
}

wait_for_condition() {
  local description="$1"
  local query="$2"
  local attempt
  for ((attempt = 1; attempt <= 200; attempt += 1)); do
    if [[ "$(admin_scalar "$query")" == "t" ]]; then return 0; fi
    sleep 0.05
  done
  echo "Timed out waiting for $description" >&2
  admin_psql --command "select pid, application_name, wait_event_type,
    wait_event, pg_blocking_pids(pid) from pg_stat_activity
    where datname=current_database();" >&2 || true
  return 1
}

round_gate_pid=""
round_gate_dir=""
round_gate_open=""

cleanup() {
  if [[ -n "$round_gate_pid" ]]; then
    admin_scalar "select pg_terminate_backend(pid) from pg_stat_activity
      where datname=current_database()
        and application_name='task9_production_round_gate';" >/dev/null || true
  fi
  if [[ -n "$round_gate_open" ]]; then
    exec 3>&- || true
  fi
  if [[ -n "$round_gate_pid" ]]; then
    wait "$round_gate_pid" 2>/dev/null || true
  fi
  if [[ -n "$round_gate_dir" ]]; then rmdir "$round_gate_dir" 2>/dev/null || true; fi
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
admin_psql < \
  "$repo_root/supabase/tests/supplier_purchase_batch_workflow_review_compat_production_fixture.sql"

tenant="85000000-0000-4000-8000-000000000001"
project="85000000-0000-4000-8000-000000000006"
submit_user="85000000-0000-4000-8000-000000000002"
submitter="85000000-0000-4000-8000-000000000003"
review_user="85000000-0000-4000-8000-000000000004"
reviewer="85000000-0000-4000-8000-000000000005"
sku="85000000-0000-4000-8000-000000000026"
cost_category="85000000-0000-4000-8000-000000000029"
round_batch="85000000-0000-4000-8000-000000000070"

admin_psql --command "select public.save_supplier_purchase_batch_draft(
  '$round_batch', '$tenant', '$project', 0, 'Task9 concurrent round', null,
  null, jsonb_build_array(jsonb_build_object(
    'supplier_sku_id', '$sku'::uuid,
    'cost_category_id', '$cost_category'::uuid,
    'quantity', '1'
  )), '$submit_user', '$submitter', 'production-round-save-1'
);" >/dev/null
admin_psql --command "select public.submit_supplier_purchase_batch_with_workflow(
  '$round_batch', '$tenant', 1, '$submit_user', '$submitter',
  'production-round-submit-1'
);" >/dev/null
old_task="$(admin_scalar "select task.id
  from public.workflow_instances as instance
  join public.workflow_tasks as task on task.instance_id=instance.id
  where instance.tenant_id='$tenant'
    and instance.subject_type='supplier_purchase_batch'
    and instance.subject_id='$round_batch'
    and instance.status='running'
    and task.status='pending';")"
if [[ -z "$old_task" ]]; then
  echo "Missing pending round-one workflow task" >&2
  exit 1
fi

# This interactive psql session holds the gate without a timing guess. The
# writer has acquired the batch advisory only once pg_locks shows it waiting.
round_gate_dir="$(mktemp -d "${TMPDIR:-/tmp}/gooes-task9-round.XXXXXX")"
mkfifo "$round_gate_dir/input"
docker exec -e PGPASSWORD="$admin_password" -i "$container" \
  psql -h 127.0.0.1 -U "$admin_user" -d "$database" -X \
  --set ON_ERROR_STOP=1 < "$round_gate_dir/input" >/dev/null &
round_gate_pid=$!
exec 3>"$round_gate_dir/input"
round_gate_open="true"
printf "set application_name='task9_production_round_gate';\n" >&3
printf "select pg_advisory_lock(hashtextextended('task9-production-round-gate', 6720240826142000));\n" >&3
wait_for_condition "production round gate" "select exists (
  select 1 from pg_stat_activity as activity
  join pg_locks as held on held.pid=activity.pid
  where activity.datname=current_database()
    and activity.application_name='task9_production_round_gate'
    and held.locktype='advisory' and held.granted
);"

admin_psql --command "set application_name='task9_production_round_writer';
  set statement_timeout='15s'; begin;
  select pg_advisory_xact_lock(hashtextextended(
    'supplier-purchase-batch-id:$round_batch', 6720240826142000
  ));
  select pg_advisory_xact_lock(hashtextextended(
    'task9-production-round-gate', 6720240826142000
  ));
  select public.withdraw_supplier_purchase_batch_workflow(
    '$tenant', '$round_batch', 2, null,
    '$submit_user', '$submitter', 'production-round-withdraw'
  );
  select public.save_supplier_purchase_batch_draft(
    '$round_batch', '$tenant', '$project', 3, 'Task9 concurrent resubmit',
    null, null, jsonb_build_array(jsonb_build_object(
      'supplier_sku_id', '$sku'::uuid,
      'cost_category_id', '$cost_category'::uuid,
      'quantity', '2'
    )), '$submit_user', '$submitter', 'production-round-save-2'
  );
  select public.submit_supplier_purchase_batch_with_workflow(
    '$round_batch', '$tenant', 4, '$submit_user', '$submitter',
    'production-round-submit-2'
  );
  commit;" >/dev/null &
round_writer_pid=$!
wait_for_condition "round writer batch advisory" "select exists (
  select 1 from pg_stat_activity as activity
  join pg_locks as held on held.pid=activity.pid
  where activity.datname=current_database()
    and activity.application_name='task9_production_round_writer'
    and activity.wait_event_type='Lock'
    and held.locktype='advisory' and held.granted
);"

admin_psql --command "set application_name='task9_production_old_task_completion';
  set statement_timeout='15s'; do \$completion\$
  begin
    perform public.complete_supplier_purchase_batch_workflow_task(
      '$tenant', '$round_batch', '$old_task', 'approve', null, '{}'::jsonb,
      '$review_user', '$reviewer', 'production-round-old-task'
    );
    raise exception 'old task completion unexpectedly advanced';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'SUPPLIER_PURCHASE_BATCH_APPROVAL_ROUND_STALE' then
      raise;
    end if;
  end
  \$completion\$;" >/dev/null &
round_completion_pid=$!
wait_for_condition "old task completion blocked by round writer" "select exists (
  select 1 from pg_stat_activity as waiting
  join pg_stat_activity as blocker
    on blocker.pid = any(pg_blocking_pids(waiting.pid))
  where waiting.datname=current_database()
    and waiting.application_name='task9_production_old_task_completion'
    and waiting.wait_event_type='Lock'
    and blocker.application_name='task9_production_round_writer'
);"
admin_scalar "select pg_terminate_backend(pid) from pg_stat_activity
  where datname=current_database()
    and application_name='task9_production_round_gate';" >/dev/null
exec 3>&-
round_gate_open=""
wait "$round_gate_pid" 2>/dev/null || true
round_gate_pid=""
rm "$round_gate_dir/input"
rmdir "$round_gate_dir"
round_gate_dir=""
wait "$round_writer_pid"
wait "$round_completion_pid"

admin_psql --command "do \$verify\$
begin
  if not exists (
    select 1 from public.supplier_purchase_batches
    where id='$round_batch' and status='pending_approval'
      and version = 5 and approval_round = 2
  ) then
    raise exception 'concurrent round writer did not commit round 2';
  end if;
end
\$verify\$;" >/dev/null

echo "SUPPLIER_PURCHASE_BATCH_WORKFLOW_WITHDRAW_PRODUCTION_CONCURRENCY_OK"
