#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
container="${TASK9_POSTGRES_CONTAINER:-supabase_db_gooes}"
database="gooes_task9_withdraw_${$}"
WAIT_ATTEMPTS="${TASK9_WAIT_ATTEMPTS:-200}"
wait_interval="${TASK9_WAIT_INTERVAL:-0.05}"
gate_pid=""

psql_db() {
  docker exec -i "$container" psql -U postgres -d "$database" -X \
    --set ON_ERROR_STOP=1 "$@"
}

psql_scalar() {
  psql_db --tuples-only --no-align --quiet --command "$1"
}

wait_for_condition() {
  local description="$1"
  local query="$2"
  local attempt
  for ((attempt = 1; attempt <= WAIT_ATTEMPTS; attempt += 1)); do
    if [[ "$(psql_scalar "$query")" == "t" ]]; then return 0; fi
    sleep "$wait_interval"
  done
  echo "Timed out waiting for $description" >&2
  psql_db --command "select pid, application_name, wait_event_type,
    wait_event, pg_blocking_pids(pid) from pg_stat_activity
    where datname=current_database();" >&2 || true
  return 1
}

cleanup() {
  if [[ -n "$gate_pid" ]]; then wait "$gate_pid" 2>/dev/null || true; fi
  docker exec "$container" dropdb -U postgres --if-exists --force "$database" \
    >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker exec "$container" createdb -U postgres "$database"
psql_db < "$repo_root/supabase/tests/supplier_purchase_batch_workflow_withdraw_fixture.sql"
psql_db < "$repo_root/supabase/migrations/20260830115000_create_supplier_purchase_batch_workflow_withdraw.sql"

tenant="84000000-0000-4000-8000-000000000001"
project="84000000-0000-4000-8000-000000000002"
actor="84000000-0000-4000-8000-000000000003"
actor_user="84000000-0000-4000-8000-000000000004"

psql_db --command "select public.test_seed_withdraw(
  '84000000-0000-4000-8000-000000000010',
  '84000000-0000-4000-8000-000000000011',
  '84000000-0000-4000-8000-000000000012',
  '84000000-0000-4000-8000-000000000013',
  '84000000-0000-4000-8000-000000000014',
  '84000000-0000-4000-8000-000000000015',
  '84000000-0000-4000-8000-000000000016',
  '$tenant', '$project', '$actor');" >/dev/null

psql_db --command "set application_name='task9_withdraw_gate';
  select pg_advisory_lock(hashtextextended(
    'supplier-purchase-batch-command:$tenant:84000000-0000-4000-8000-000000000010:withdraw:withdraw-same-key',
    6720240826142000));
  select pg_sleep(30);" >/dev/null 2>&1 &
gate_pid=$!
wait_for_condition "withdraw gate" "select exists (
  select 1 from pg_stat_activity as activity
  join pg_locks as held on held.pid=activity.pid
  where activity.datname=current_database()
    and activity.application_name='task9_withdraw_gate'
    and held.locktype='advisory' and held.granted);"

for caller in task9_withdraw_same_a task9_withdraw_same_b; do
  psql_db --command "set application_name='$caller'; set statement_timeout='15s';
    select public.withdraw_supplier_purchase_batch_workflow(
      '$tenant', '84000000-0000-4000-8000-000000000010', 2, null,
      '$actor_user', '$actor', 'withdraw-same-key');" >/dev/null &
  if [[ "$caller" == "task9_withdraw_same_a" ]]; then
    same_a_pid=$!
  else
    same_b_pid=$!
  fi
done
wait_for_condition "both same-key callers blocked" "select count(*)=2
  from pg_stat_activity as waiting
  where waiting.datname=current_database()
    and waiting.application_name in
      ('task9_withdraw_same_a','task9_withdraw_same_b')
    and waiting.wait_event_type='Lock'
    and cardinality(pg_blocking_pids(waiting.pid)) > 0;"
psql_scalar "select pg_terminate_backend(pid) from pg_stat_activity
  where datname=current_database()
    and application_name='task9_withdraw_gate';" >/dev/null
wait "$gate_pid" 2>/dev/null || true
gate_pid=""
wait "$same_a_pid"
wait "$same_b_pid"

psql_db --command "do \$verify\$ begin
  if (select count(*) from public.supplier_purchase_batch_command_events
      where purchase_batch_id='84000000-0000-4000-8000-000000000010'
        and command_type='withdraw') <> 1
    or not exists (select 1 from public.supplier_purchase_batches
      where id='84000000-0000-4000-8000-000000000010'
        and status='draft' and version=3) then
    raise exception 'same-key double withdrawal mismatch';
  end if;
end \$verify\$;" >/dev/null

psql_db --command "select public.test_seed_withdraw(
  '84000000-0000-4000-8000-000000000020',
  '84000000-0000-4000-8000-000000000021',
  '84000000-0000-4000-8000-000000000022',
  '84000000-0000-4000-8000-000000000023',
  '84000000-0000-4000-8000-000000000024',
  '84000000-0000-4000-8000-000000000025',
  '84000000-0000-4000-8000-000000000026',
  '$tenant', '$project', '$actor');" >/dev/null

for key in withdraw-different-a withdraw-different-b; do
  psql_db --command "set application_name='task9_$key';
    set statement_timeout='15s'; do \$call\$ begin
      perform public.withdraw_supplier_purchase_batch_workflow(
        '$tenant', '84000000-0000-4000-8000-000000000020', 2, null,
        '$actor_user', '$actor', '$key');
    exception when sqlstate 'P0001' then
      if sqlerrm <> 'SUPPLIER_PURCHASE_BATCH_WITHDRAW_NOT_ALLOWED' then
        raise;
      end if;
    end \$call\$;" >/dev/null &
  if [[ "$key" == "withdraw-different-a" ]]; then
    different_a_pid=$!
  else
    different_b_pid=$!
  fi
done
wait "$different_a_pid"
wait "$different_b_pid"

psql_db --command "do \$verify\$ begin
  if (select count(*) from public.supplier_purchase_batch_command_events
      where purchase_batch_id='84000000-0000-4000-8000-000000000020'
        and command_type='withdraw') <> 1
    or not exists (select 1 from public.supplier_purchase_batches
      where id='84000000-0000-4000-8000-000000000020'
        and status='draft' and version=3) then
    raise exception 'different-key double withdrawal mismatch';
  end if;
end \$verify\$;" >/dev/null

echo "SUPPLIER_PURCHASE_BATCH_WORKFLOW_WITHDRAW_CONCURRENCY_OK"
