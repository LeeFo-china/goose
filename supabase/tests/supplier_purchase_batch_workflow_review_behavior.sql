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

  -- Legacy /review may win the same-key race only for a branch that the
  -- workflow node itself delegates. Purchase approval over budget does not.
  PERFORM public.test_seed_workflow_review(
    '81000000-0000-4000-8000-000000000015',
    '81000000-0000-4000-8000-000000000025',
    '81000000-0000-4000-8000-000000000035',
    v_tenant, v_project, v_submitter, 'over_budget'
  );
  PERFORM public.review_supplier_purchase_batch(
    '81000000-0000-4000-8000-000000000015', v_tenant, 2,
    'approve', NULL, false, v_user, v_actor, 'legacy-overbudget-first'
  );
  BEGIN
    PERFORM public.complete_supplier_purchase_batch_workflow_task(
      v_tenant, '81000000-0000-4000-8000-000000000015',
      '81000000-0000-4000-8000-000000000035', 'approve', NULL,
      '{}'::jsonb, v_user, v_actor, 'legacy-overbudget-first'
    );
    RAISE EXCEPTION 'workflow adopted an incompatible legacy branch';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM <> 'SUPPLIER_PURCHASE_BATCH_WORKFLOW_CONFLICT' THEN RAISE; END IF;
  END;
  IF NOT EXISTS (
    SELECT 1 FROM public.workflow_instances
    WHERE id = '81000000-0000-4000-8000-000000000025'
      AND status = 'running' AND current_node_key = 'purchase_review'
  ) OR NOT EXISTS (
    SELECT 1 FROM public.workflow_tasks
    WHERE id = '81000000-0000-4000-8000-000000000035'
      AND status = 'pending'
  ) OR EXISTS (
    SELECT 1 FROM public.workflow_tasks
    WHERE instance_id = '81000000-0000-4000-8000-000000000025'
      AND node_key = 'finance_review'
  ) THEN
    RAISE EXCEPTION 'incompatible legacy adoption advanced workflow';
  END IF;

  -- Controlled residual before Task 10: workflow-only over-budget events use
  -- a task fingerprint, so raw legacy /review with the same key must conflict.
  -- Task 10 routing must ship in the same release as this migration.
  PERFORM public.test_seed_workflow_review(
    '81000000-0000-4000-8000-000000000016',
    '81000000-0000-4000-8000-000000000026',
    '81000000-0000-4000-8000-000000000036',
    v_tenant, v_project, v_submitter, 'over_budget'
  );
  PERFORM public.complete_supplier_purchase_batch_workflow_task(
    v_tenant, '81000000-0000-4000-8000-000000000016',
    '81000000-0000-4000-8000-000000000036', 'approve', NULL,
    '{}'::jsonb, v_user, v_actor, 'workflow-overbudget-first'
  );
  BEGIN
    PERFORM public.review_supplier_purchase_batch(
      '81000000-0000-4000-8000-000000000016', v_tenant, 2,
      'approve', NULL, false, v_user, v_actor, 'workflow-overbudget-first'
    );
    RAISE EXCEPTION 'raw legacy replay accepted a workflow-only event';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM <> 'SUPPLIER_IDEMPOTENCY_CONFLICT' THEN RAISE; END IF;
  END;
  IF NOT EXISTS (
    SELECT 1 FROM public.workflow_instances
    WHERE id = '81000000-0000-4000-8000-000000000026'
      AND status = 'running' AND current_node_key = 'finance_review'
  ) OR (
    SELECT count(*) FROM public.workflow_tasks
    WHERE instance_id = '81000000-0000-4000-8000-000000000026'
      AND node_key = 'finance_review' AND status = 'pending'
  ) <> 1 THEN
    RAISE EXCEPTION 'raw legacy conflict changed workflow-only state';
  END IF;

  -- Allowed legacy-first adoption remains valid for finance approval, reject,
  -- and revision-required results.
  PERFORM public.test_seed_workflow_review(
    '81000000-0000-4000-8000-000000000017',
    '81000000-0000-4000-8000-000000000027',
    '81000000-0000-4000-8000-000000000037',
    v_tenant, v_project, v_submitter, 'over_budget', 'finance_review'
  );
  PERFORM public.review_supplier_purchase_batch(
    '81000000-0000-4000-8000-000000000017', v_tenant, 2,
    'approve', NULL, true, v_user, v_actor, 'finance-adopt'
  );
  v_result := public.complete_supplier_purchase_batch_workflow_task(
    v_tenant, '81000000-0000-4000-8000-000000000017',
    '81000000-0000-4000-8000-000000000037', 'approve', NULL,
    '{}'::jsonb, v_user, v_actor, 'finance-adopt'
  );
  IF v_result->>'status' <> 'ordered'
    OR v_result->'workflow_state'->>'current_node_key' <> 'approved_end'
  THEN
    RAISE EXCEPTION 'finance legacy adoption failed: %', v_result;
  END IF;

  PERFORM public.test_seed_workflow_review(
    '81000000-0000-4000-8000-000000000018',
    '81000000-0000-4000-8000-000000000028',
    '81000000-0000-4000-8000-000000000038',
    v_tenant, v_project, v_submitter
  );
  PERFORM public.review_supplier_purchase_batch(
    '81000000-0000-4000-8000-000000000018', v_tenant, 2,
    'reject', '驳回', false, v_user, v_actor, 'reject-adopt'
  );
  v_result := public.complete_supplier_purchase_batch_workflow_task(
    v_tenant, '81000000-0000-4000-8000-000000000018',
    '81000000-0000-4000-8000-000000000038', 'reject', '驳回',
    '{}'::jsonb, v_user, v_actor, 'reject-adopt'
  );
  IF v_result->>'status' <> 'rejected'
    OR v_result->'workflow_state'->>'current_node_key' <> 'rejected_end'
  THEN
    RAISE EXCEPTION 'reject legacy adoption failed: %', v_result;
  END IF;

  PERFORM public.test_seed_workflow_review(
    '81000000-0000-4000-8000-000000000019',
    '81000000-0000-4000-8000-000000000029',
    '81000000-0000-4000-8000-000000000039',
    v_tenant, v_project, v_submitter
  );
  PERFORM public.review_supplier_purchase_batch(
    '81000000-0000-4000-8000-000000000019', v_tenant, 2,
    'approve', 'fixture-revision-required', false,
    v_user, v_actor, 'revision-adopt'
  );
  IF NOT EXISTS (
    SELECT 1 FROM public.supplier_purchase_batches
    WHERE id = '81000000-0000-4000-8000-000000000019'
      AND status = 'draft'
      AND budget_status = 'unchecked'
      AND version = 3
      AND submitted_by_employee_id IS NULL
  ) THEN
    RAISE EXCEPTION 'purchase revision fixture did not model production state';
  END IF;
  v_result := public.complete_supplier_purchase_batch_workflow_task(
    v_tenant, '81000000-0000-4000-8000-000000000019',
    '81000000-0000-4000-8000-000000000039', 'approve',
    'fixture-revision-required', '{}'::jsonb,
    v_user, v_actor, 'revision-adopt'
  );
  IF v_result->>'status' <> 'revision_required'
    OR v_result->'workflow_state'->>'instance_status' <> 'canceled'
    OR (v_result->'workflow_state'->>'pending_task_count')::integer <> 0
  THEN
    RAISE EXCEPTION 'purchase revision legacy adoption failed: %', v_result;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.supplier_purchase_batches
    WHERE id = '81000000-0000-4000-8000-000000000019'
      AND status = 'draft' AND budget_status = 'unchecked' AND version = 3
  ) OR NOT EXISTS (
    SELECT 1 FROM public.workflow_instances
    WHERE id = '81000000-0000-4000-8000-000000000029'
      AND status = 'canceled'
  ) OR NOT EXISTS (
    SELECT 1 FROM public.workflow_tasks
    WHERE id = '81000000-0000-4000-8000-000000000039'
      AND status = 'canceled' AND completed_by = v_actor
  ) OR NOT EXISTS (
    SELECT 1 FROM public.workflow_instance_nodes
    WHERE instance_id = '81000000-0000-4000-8000-000000000029'
      AND status = 'canceled' AND completed_by = v_actor
  ) OR NOT EXISTS (
    SELECT 1 FROM public.workflow_subject_states
    WHERE instance_id = '81000000-0000-4000-8000-000000000029'
      AND instance_status = 'canceled' AND pending_task_count = 0
  ) OR NOT EXISTS (
    SELECT 1 FROM public.workflow_transition_logs
    WHERE instance_id = '81000000-0000-4000-8000-000000000029'
      AND action = 'revision_required'
  ) THEN
    RAISE EXCEPTION 'purchase revision cancellation chain was incomplete';
  END IF;

  PERFORM public.test_seed_workflow_review(
    '81000000-0000-4000-8000-000000000040',
    '81000000-0000-4000-8000-000000000050',
    '81000000-0000-4000-8000-000000000060',
    v_tenant, v_project, v_submitter, 'over_budget', 'finance_review'
  );
  PERFORM public.review_supplier_purchase_batch(
    '81000000-0000-4000-8000-000000000040', v_tenant, 2,
    'approve', 'fixture-revision-required', true,
    v_user, v_actor, 'finance-revision-adopt'
  );
  IF NOT EXISTS (
    SELECT 1 FROM public.supplier_purchase_batches
    WHERE id = '81000000-0000-4000-8000-000000000040'
      AND status = 'draft'
      AND budget_status = 'unchecked'
      AND version = 3
      AND submitted_by_employee_id IS NULL
  ) THEN
    RAISE EXCEPTION 'finance revision fixture did not model production state';
  END IF;
  v_result := public.complete_supplier_purchase_batch_workflow_task(
    v_tenant, '81000000-0000-4000-8000-000000000040',
    '81000000-0000-4000-8000-000000000060', 'approve',
    'fixture-revision-required', '{}'::jsonb,
    v_user, v_actor, 'finance-revision-adopt'
  );
  IF v_result->>'status' <> 'revision_required'
    OR v_result->'workflow_state'->>'instance_status' <> 'canceled'
    OR (v_result->'workflow_state'->>'pending_task_count')::integer <> 0
  THEN
    RAISE EXCEPTION 'finance revision legacy adoption failed: %', v_result;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.supplier_purchase_batches
    WHERE id = '81000000-0000-4000-8000-000000000040'
      AND status = 'draft' AND budget_status = 'unchecked' AND version = 3
  ) OR NOT EXISTS (
    SELECT 1 FROM public.workflow_instances
    WHERE id = '81000000-0000-4000-8000-000000000050'
      AND status = 'canceled'
  ) OR NOT EXISTS (
    SELECT 1 FROM public.workflow_tasks
    WHERE id = '81000000-0000-4000-8000-000000000060'
      AND status = 'canceled' AND completed_by = v_actor
  ) OR NOT EXISTS (
    SELECT 1 FROM public.workflow_instance_nodes
    WHERE instance_id = '81000000-0000-4000-8000-000000000050'
      AND status = 'canceled' AND completed_by = v_actor
  ) OR NOT EXISTS (
    SELECT 1 FROM public.workflow_subject_states
    WHERE instance_id = '81000000-0000-4000-8000-000000000050'
      AND instance_status = 'canceled' AND pending_task_count = 0
  ) OR NOT EXISTS (
    SELECT 1 FROM public.workflow_transition_logs
    WHERE instance_id = '81000000-0000-4000-8000-000000000050'
      AND action = 'revision_required'
  ) THEN
    RAISE EXCEPTION 'finance revision cancellation chain was incomplete';
  END IF;
END
$behavior$;

SELECT 'SUPPLIER_PURCHASE_BATCH_WORKFLOW_REVIEW_BEHAVIOR_OK';
