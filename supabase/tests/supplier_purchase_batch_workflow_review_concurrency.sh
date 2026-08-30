#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
container="${TASK8_POSTGRES_CONTAINER:-supabase_db_gooes}"
database="gooes_task8_review_${$}"

psql_db() {
  docker exec -i "$container" psql -U postgres -d "$database" -X \
    --set ON_ERROR_STOP=1 "$@"
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

# Same key: legacy wins the command advisory lock. The workflow call must adopt
# the purchase result, finish the task, and preserve the legacy replay envelope.
psql_db --command "select public.test_seed_workflow_review(
  '82000000-0000-4000-8000-000000000010',
  '82000000-0000-4000-8000-000000000020',
  '82000000-0000-4000-8000-000000000030',
  '$tenant', '$project', '$submitter');" >/dev/null
psql_db --command "set statement_timeout='10s'; begin;
  select pg_advisory_xact_lock(hashtextextended(
    'supplier-purchase-batch-command:$tenant:82000000-0000-4000-8000-000000000010:review:same-key',
    6720240826142000));
  select pg_sleep(1);
  select public.review_supplier_purchase_batch(
    '82000000-0000-4000-8000-000000000010', '$tenant', 2,
    'approve', null, false, '$actor_user', '$actor', 'same-key');
  commit;" >/dev/null &
same_legacy_pid=$!
sleep 0.2
psql_db --command "set statement_timeout='10s';
  select public.complete_supplier_purchase_batch_workflow_task(
    '$tenant', '82000000-0000-4000-8000-000000000010',
    '82000000-0000-4000-8000-000000000030', 'approve', null,
    '{}'::jsonb, '$actor_user', '$actor', 'same-key');" >/dev/null
wait "$same_legacy_pid"
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

# Different keys: legacy owns the batch advisory before touching the batch row.
# The workflow call must wait before its row locks and settle as a state conflict,
# rather than deadlocking after taking the batch row first.
psql_db --command "select public.test_seed_workflow_review(
  '82000000-0000-4000-8000-000000000011',
  '82000000-0000-4000-8000-000000000021',
  '82000000-0000-4000-8000-000000000031',
  '$tenant', '$project', '$submitter');" >/dev/null
psql_db --command "set statement_timeout='10s'; begin;
  select pg_advisory_xact_lock(hashtextextended(
    'supplier-purchase-batch-id:82000000-0000-4000-8000-000000000011',
    6720240826142000));
  select pg_sleep(1);
  select public.review_supplier_purchase_batch(
    '82000000-0000-4000-8000-000000000011', '$tenant', 2,
    'approve', null, false, '$actor_user', '$actor', 'legacy-key');
  commit;" >/dev/null &
different_legacy_pid=$!
sleep 0.2
psql_db --command "set statement_timeout='10s'; do \$workflow\$ begin
  perform public.complete_supplier_purchase_batch_workflow_task(
    '$tenant', '82000000-0000-4000-8000-000000000011',
    '82000000-0000-4000-8000-000000000031', 'approve', null,
    '{}'::jsonb, '$actor_user', '$actor', 'workflow-key');
  raise exception 'different-key workflow unexpectedly succeeded';
exception when sqlstate 'P0001' then
  if sqlerrm <> 'SUPPLIER_PURCHASE_BATCH_STATE_CONFLICT' then raise; end if;
end \$workflow\$;" >/dev/null
wait "$different_legacy_pid"

# Same project: a submit-shaped session owns the canonical project budget lock,
# then reaches for the commitment row. The old wrapper would already own that
# row while waiting for the budget lock; the fixed wrapper leaves it available.
psql_db --command "select public.test_seed_workflow_review(
  '82000000-0000-4000-8000-000000000012',
  '82000000-0000-4000-8000-000000000022',
  '82000000-0000-4000-8000-000000000032',
  '$tenant', '$project', '$submitter');
  insert into public.project_cost_commitments values (
    '82000000-0000-4000-8000-000000000040', '$tenant', '$project', 'reserved');" \
  >/dev/null
psql_db --command "set statement_timeout='10s'; begin;
  select pg_advisory_xact_lock(hashtextextended(
    'test-project-budget:$tenant:$project', 6720240826142000));
  select pg_sleep(1);
  select id from public.project_cost_commitments
    where tenant_id='$tenant' and project_id='$project' for update;
  commit;" >/dev/null &
budget_owner_pid=$!
sleep 0.2
psql_db --command "set statement_timeout='10s';
  select public.complete_supplier_purchase_batch_workflow_task(
    '$tenant', '82000000-0000-4000-8000-000000000012',
    '82000000-0000-4000-8000-000000000032', 'approve', null,
    '{}'::jsonb, '$actor_user', '$actor', 'project-budget');" >/dev/null
wait "$budget_owner_pid"

echo "SUPPLIER_PURCHASE_BATCH_WORKFLOW_REVIEW_CONCURRENCY_OK"
