\set ON_ERROR_STOP on

DO $behavior$
DECLARE
  v_tenant uuid := '81000000-0000-4000-8000-000000000001';
  v_project uuid := '81000000-0000-4000-8000-000000000002';
  v_submitter uuid := '81000000-0000-4000-8000-000000000003';
  v_actor uuid := '81000000-0000-4000-8000-000000000004';
  v_user uuid := '81000000-0000-4000-8000-000000000005';
  v_finance_task uuid;
  v_result jsonb;
BEGIN
  PERFORM public.test_seed_workflow_review(
    '81000000-0000-4000-8000-000000000010',
    '81000000-0000-4000-8000-000000000020',
    '81000000-0000-4000-8000-000000000030',
    v_tenant, v_project, v_submitter
  );
  v_result := public.complete_supplier_purchase_batch_workflow_task(
    v_tenant, '81000000-0000-4000-8000-000000000010',
    '81000000-0000-4000-8000-000000000030', 'approve', NULL,
    '{}'::jsonb, v_user, v_actor, 'within-approve'
  );
  IF v_result->>'status' <> 'ordered'
    OR v_result->'workflow_state'->>'instance_status' <> 'completed'
    OR v_result->'workflow_state'->>'current_node_key' <> 'approved_end'
    OR (v_result->'workflow_state'->>'pending_task_count')::integer <> 0
  THEN
    RAISE EXCEPTION 'within-budget terminal semantics failed: %', v_result;
  END IF;
  v_result := public.complete_supplier_purchase_batch_workflow_task(
    v_tenant, '81000000-0000-4000-8000-000000000010',
    '81000000-0000-4000-8000-000000000030', 'approve', NULL,
    '{}'::jsonb, v_user, v_actor, 'within-approve'
  );
  IF (v_result->>'idempotent')::boolean IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'workflow replay failed: %', v_result;
  END IF;
  v_result := public.review_supplier_purchase_batch(
    '81000000-0000-4000-8000-000000000010', v_tenant, 2,
    'approve', NULL, false, v_user, v_actor, 'within-approve'
  );
  IF (v_result->>'idempotent')::boolean IS DISTINCT FROM true
    OR v_result ? 'workflow_state'
  THEN
    RAISE EXCEPTION 'legacy replay envelope was overwritten: %', v_result;
  END IF;

  PERFORM public.test_seed_workflow_review(
    '81000000-0000-4000-8000-000000000011',
    '81000000-0000-4000-8000-000000000021',
    '81000000-0000-4000-8000-000000000031',
    v_tenant, v_project, v_submitter
  );
  v_result := public.complete_supplier_purchase_batch_workflow_task(
    v_tenant, '81000000-0000-4000-8000-000000000011',
    '81000000-0000-4000-8000-000000000031', 'reject', '数量错误',
    '{}'::jsonb, v_user, v_actor, 'reject'
  );
  IF v_result->>'status' <> 'rejected'
    OR v_result->'workflow_state'->>'instance_status' <> 'completed'
    OR v_result->'workflow_state'->>'current_node_key' <> 'rejected_end'
    OR (v_result->'workflow_state'->>'pending_task_count')::integer <> 0
  THEN
    RAISE EXCEPTION 'reject terminal semantics failed: %', v_result;
  END IF;

  PERFORM public.test_seed_workflow_review(
    '81000000-0000-4000-8000-000000000012',
    '81000000-0000-4000-8000-000000000022',
    '81000000-0000-4000-8000-000000000032',
    v_tenant, v_project, v_submitter, 'over_budget'
  );
  v_result := public.complete_supplier_purchase_batch_workflow_task(
    v_tenant, '81000000-0000-4000-8000-000000000012',
    '81000000-0000-4000-8000-000000000032', 'approve', NULL,
    '{}'::jsonb, v_user, v_actor, 'over-budget'
  );
  IF v_result->>'status' <> 'pending_approval'
    OR v_result->'workflow_state'->>'instance_status' <> 'running'
    OR v_result->'workflow_state'->>'current_node_key' <> 'finance_review'
    OR (v_result->'workflow_state'->>'pending_task_count')::integer <> 1
  THEN
    RAISE EXCEPTION 'over-budget transition semantics failed: %', v_result;
  END IF;
  SELECT task.id INTO STRICT v_finance_task
  FROM public.workflow_tasks AS task
  WHERE task.instance_id = '81000000-0000-4000-8000-000000000022'
    AND task.node_key = 'finance_review'
    AND task.status = 'pending';
  v_result := public.complete_supplier_purchase_batch_workflow_task(
    v_tenant, '81000000-0000-4000-8000-000000000012',
    v_finance_task, 'approve', NULL,
    '{}'::jsonb, v_user, v_actor, 'finance-approve'
  );
  IF v_result->>'status' <> 'ordered'
    OR v_result->'workflow_state'->>'instance_status' <> 'completed'
    OR v_result->'workflow_state'->>'current_node_key' <> 'approved_end'
    OR (v_result->'workflow_state'->>'pending_task_count')::integer <> 0
  THEN
    RAISE EXCEPTION 'finance approve terminal semantics failed: %', v_result;
  END IF;

  PERFORM public.test_seed_workflow_review(
    '81000000-0000-4000-8000-000000000014',
    '81000000-0000-4000-8000-000000000024',
    '81000000-0000-4000-8000-000000000034',
    v_tenant, v_project, v_submitter, 'over_budget', 'finance_review'
  );
  v_result := public.complete_supplier_purchase_batch_workflow_task(
    v_tenant, '81000000-0000-4000-8000-000000000014',
    '81000000-0000-4000-8000-000000000034', 'reject', '财务驳回',
    '{}'::jsonb, v_user, v_actor, 'finance-reject'
  );
  IF v_result->>'status' <> 'rejected'
    OR v_result->'workflow_state'->>'instance_status' <> 'completed'
    OR v_result->'workflow_state'->>'current_node_key' <> 'rejected_end'
    OR (v_result->'workflow_state'->>'pending_task_count')::integer <> 0
  THEN
    RAISE EXCEPTION 'finance reject terminal semantics failed: %', v_result;
  END IF;

  PERFORM public.test_seed_workflow_review(
    '81000000-0000-4000-8000-000000000013',
    '81000000-0000-4000-8000-000000000023',
    '81000000-0000-4000-8000-000000000033',
    v_tenant, v_project, v_submitter
  );
  BEGIN
    PERFORM public.complete_supplier_purchase_batch_workflow_task(
      v_tenant, '81000000-0000-4000-8000-000000000013',
      '81000000-0000-4000-8000-000000000033', 'approve', NULL,
      '{"force_bad_graph":true}'::jsonb, v_user, v_actor, 'bad-graph'
    );
    RAISE EXCEPTION 'bad graph was not rejected';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM <> 'SUPPLIER_PURCHASE_BATCH_WORKFLOW_CONFLICT' THEN RAISE; END IF;
  END;
  IF NOT EXISTS (
    SELECT 1 FROM public.supplier_purchase_batches
    WHERE id = '81000000-0000-4000-8000-000000000013'
      AND status = 'pending_approval' AND version = 2
  ) OR EXISTS (
    SELECT 1 FROM public.supplier_purchase_batch_command_events
    WHERE purchase_batch_id = '81000000-0000-4000-8000-000000000013'
  ) THEN
    RAISE EXCEPTION 'bad graph purchase mutation did not roll back';
  END IF;
END
$behavior$;

SELECT 'SUPPLIER_PURCHASE_BATCH_WORKFLOW_REVIEW_BEHAVIOR_OK';
