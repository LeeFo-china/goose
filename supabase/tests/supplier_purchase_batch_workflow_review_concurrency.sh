#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
container="${TASK8_POSTGRES_CONTAINER:-supabase_db_gooes}"
database="gooes_task8_review_${$}"
WAIT_ATTEMPTS="${TASK8_WAIT_ATTEMPTS:-200}"
wait_interval="${TASK8_WAIT_INTERVAL:-0.05}"
gate_shell_pid=""

psql_db() {
  docker exec -i "$container" psql -U postgres -d "$database" -X \
    --set ON_ERROR_STOP=1 "$@"
}

psql_scalar() {
  psql_db --tuples-only --no-align --quiet --command "$1"
}

lock_diagnostics() {
  psql_db --command "select pid, application_name, state,
      wait_event_type, wait_event, pg_blocking_pids(pid) as blocking_pids
    from pg_stat_activity
    where datname = current_database()
    order by application_name;" >&2 || true
}

wait_for_condition() {
  local description="$1"
  local query="$2"
  local attempt
  for ((attempt = 1; attempt <= WAIT_ATTEMPTS; attempt += 1)); do
    if [[ "$(psql_scalar "$query")" == "t" ]]; then
      return 0
    fi
    sleep "$wait_interval"
  done
  echo "Timed out waiting for $description" >&2
  lock_diagnostics
  return 1
}

wait_for_blocked_by() {
  local waiter="$1"
  local blocker="$2"
  wait_for_condition "$waiter blocked by $blocker" "select exists (
    select 1
    from pg_stat_activity as waiting
    where waiting.datname = current_database()
      and waiting.application_name = '$waiter'
      and waiting.wait_event_type = 'Lock'
      and exists (
        select 1
        from unnest(pg_blocking_pids(waiting.pid)) as blocked_by(pid)
        join pg_stat_activity as blocking on blocking.pid = blocked_by.pid
        where blocking.application_name = '$blocker'
      )
  );"
}

start_gate() {
  local application_name="$1"
  local gate_key="$2"
  psql_db --command "set application_name = '$application_name';
    set statement_timeout = '30s';
    select pg_advisory_lock(hashtextextended('$gate_key', 6720240826142000));
    select pg_sleep(30);" >/dev/null 2>&1 &
  gate_shell_pid=$!
  wait_for_condition "$application_name advisory gate" "select exists (
    select 1
    from pg_stat_activity as activity
    join pg_locks as held on held.pid = activity.pid
    where activity.datname = current_database()
      and activity.application_name = '$application_name'
      and held.locktype = 'advisory'
      and held.granted
  );"
}

wait_for_owner_on_gate() {
  local owner="$1"
  local gate="$2"
  wait_for_blocked_by "$owner" "$gate"
  wait_for_condition "$owner target advisory lock" "select exists (
    select 1
    from pg_stat_activity as activity
    join pg_locks as held on held.pid = activity.pid
    where activity.datname = current_database()
      and activity.application_name = '$owner'
      and held.locktype = 'advisory'
      and held.granted
  );"
}

release_gate() {
  local application_name="$1"
  psql_scalar "select pg_terminate_backend(pid)
    from pg_stat_activity
    where datname = current_database()
      and application_name = '$application_name';" >/dev/null
  if [[ -n "$gate_shell_pid" ]]; then
    wait "$gate_shell_pid" 2>/dev/null || true
    gate_shell_pid=""
  fi
}

cleanup() {
  docker exec "$container" dropdb -U postgres --if-exists --force "$database" \
    >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker exec "$container" createdb -U postgres "$database"
psql_db < "$repo_root/supabase/tests/supplier_purchase_batch_workflow_review_concurrency_fixture.sql"
psql_db < "$repo_root/supabase/migrations/20260830114000_create_supplier_purchase_batch_workflow_review.sql"
psql_db < "$repo_root/supabase/tests/supplier_purchase_batch_workflow_review_behavior.sql"

tenant="82000000-0000-4000-8000-000000000001"
project="82000000-0000-4000-8000-000000000002"
submitter="82000000-0000-4000-8000-000000000003"
actor="82000000-0000-4000-8000-000000000004"
actor_user="82000000-0000-4000-8000-000000000005"

# Same key: observe legacy holding the command advisory before starting the
# workflow caller, then observe the workflow caller waiting on that exact owner.
psql_db --command "select public.test_seed_workflow_review(
  '82000000-0000-4000-8000-000000000010',
  '82000000-0000-4000-8000-000000000020',
  '82000000-0000-4000-8000-000000000030',
  '$tenant', '$project', '$submitter');" >/dev/null
start_gate "task8_same_gate" "task8-gate:same-key"
psql_db --command "set application_name = 'task8_same_legacy';
  set statement_timeout = '15s'; begin;
  select pg_advisory_xact_lock(hashtextextended(
    'supplier-purchase-batch-command:$tenant:82000000-0000-4000-8000-000000000010:review:same-key',
    6720240826142000));
  select pg_advisory_xact_lock(hashtextextended(
    'task8-gate:same-key', 6720240826142000));
  select public.review_supplier_purchase_batch(
    '82000000-0000-4000-8000-000000000010', '$tenant', 2,
    'approve', null, false, '$actor_user', '$actor', 'same-key');
  commit;" >/dev/null &
same_legacy_pid=$!
wait_for_owner_on_gate "task8_same_legacy" "task8_same_gate"
psql_db --command "set application_name = 'task8_same_workflow';
  set statement_timeout = '15s';
  select public.complete_supplier_purchase_batch_workflow_task(
    '$tenant', '82000000-0000-4000-8000-000000000010',
    '82000000-0000-4000-8000-000000000030', 'approve', null,
    '{}'::jsonb, '$actor_user', '$actor', 'same-key');" >/dev/null &
same_workflow_pid=$!
wait_for_blocked_by "task8_same_workflow" "task8_same_legacy"
release_gate "task8_same_gate"
wait "$same_legacy_pid"
wait "$same_workflow_pid"
psql_db --command "do \$verify\$ begin
  if not exists (select 1 from public.workflow_instances
    where id='82000000-0000-4000-8000-000000000020'
      and status='completed' and current_node_key='approved_end')
    or not exists (select 1 from public.supplier_purchase_batch_command_events
      where purchase_batch_id='82000000-0000-4000-8000-000000000010'
        and request ? 'workflow_task_result') then
    raise exception 'same-key legacy/workflow serialization failed';
  end if;
end \$verify\$;" >/dev/null

# Different keys: observe legacy holding the batch advisory before workflow
# starts. Workflow must wait there, before taking the batch row.
psql_db --command "select public.test_seed_workflow_review(
  '82000000-0000-4000-8000-000000000011',
  '82000000-0000-4000-8000-000000000021',
  '82000000-0000-4000-8000-000000000031',
  '$tenant', '$project', '$submitter');" >/dev/null
start_gate "task8_different_gate" "task8-gate:different-key"
psql_db --command "set application_name = 'task8_different_legacy';
  set statement_timeout = '15s'; begin;
  select pg_advisory_xact_lock(hashtextextended(
    'supplier-purchase-batch-id:82000000-0000-4000-8000-000000000011',
    6720240826142000));
  select pg_advisory_xact_lock(hashtextextended(
    'task8-gate:different-key', 6720240826142000));
  select public.review_supplier_purchase_batch(
    '82000000-0000-4000-8000-000000000011', '$tenant', 2,
    'approve', null, false, '$actor_user', '$actor', 'legacy-key');
  commit;" >/dev/null &
different_legacy_pid=$!
wait_for_owner_on_gate "task8_different_legacy" "task8_different_gate"
psql_db --command "set application_name = 'task8_different_workflow';
  set statement_timeout = '15s'; do \$workflow\$ begin
  perform public.complete_supplier_purchase_batch_workflow_task(
    '$tenant', '82000000-0000-4000-8000-000000000011',
    '82000000-0000-4000-8000-000000000031', 'approve', null,
    '{}'::jsonb, '$actor_user', '$actor', 'workflow-key');
  raise exception 'different-key workflow unexpectedly succeeded';
exception when sqlstate 'P0001' then
  if sqlerrm <> 'SUPPLIER_PURCHASE_BATCH_STATE_CONFLICT' then raise; end if;
end \$workflow\$;" >/dev/null &
different_workflow_pid=$!
wait_for_blocked_by "task8_different_workflow" "task8_different_legacy"
release_gate "task8_different_gate"
wait "$different_legacy_pid"
wait "$different_workflow_pid"

# The fixture review models the production lock order: project budget advisory
# first, then deterministic commitment rows. Holding the budget gate while the
# workflow reaches that advisory proves it has not prelocked the commitment.
psql_db --command "select public.test_seed_workflow_review(
  '82000000-0000-4000-8000-000000000012',
  '82000000-0000-4000-8000-000000000022',
  '82000000-0000-4000-8000-000000000032',
  '$tenant', '$project', '$submitter');
  insert into public.project_cost_commitments values (
    '82000000-0000-4000-8000-000000000040', '$tenant', '$project', 'reserved');" \
  >/dev/null
start_gate "task8_project_gate" "task8-gate:same-project"
psql_db --command "set application_name = 'task8_budget_owner';
  set statement_timeout = '15s'; begin;
  select pg_advisory_xact_lock(hashtextextended(
    'test-project-budget:$tenant:$project', 6720240826142000));
  select pg_advisory_xact_lock(hashtextextended(
    'task8-gate:same-project', 6720240826142000));
  select id from public.project_cost_commitments
    where tenant_id='$tenant' and project_id='$project'
    order by id for update;
  commit;" >/dev/null &
budget_owner_pid=$!
wait_for_owner_on_gate "task8_budget_owner" "task8_project_gate"
psql_db --command "set application_name = 'task8_project_workflow';
  set statement_timeout = '15s';
  select public.complete_supplier_purchase_batch_workflow_task(
    '$tenant', '82000000-0000-4000-8000-000000000012',
    '82000000-0000-4000-8000-000000000032', 'approve', null,
    '{}'::jsonb, '$actor_user', '$actor', 'project-budget');" >/dev/null &
project_workflow_pid=$!
wait_for_blocked_by "task8_project_workflow" "task8_budget_owner"
release_gate "task8_project_gate"
wait "$budget_owner_pid"
wait "$project_workflow_pid"

echo "SUPPLIER_PURCHASE_BATCH_WORKFLOW_REVIEW_CONCURRENCY_OK"
