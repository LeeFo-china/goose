\set ON_ERROR_STOP on

DO $behavior$
DECLARE
  v_result jsonb;
  v_request jsonb;
  v_fingerprint text;
  v_error text;
  v_status text;
  v_tenant uuid := '83000000-0000-4000-8000-000000000001';
  v_project uuid := '83000000-0000-4000-8000-000000000002';
  v_actor uuid := '83000000-0000-4000-8000-000000000003';
  v_other_actor uuid := '83000000-0000-4000-8000-000000000005';
  v_user uuid := '83000000-0000-4000-8000-000000000004';
BEGIN
  PERFORM public.test_seed_withdraw(
    '83000000-0000-4000-8000-000000000010',
    '83000000-0000-4000-8000-000000000011',
    '83000000-0000-4000-8000-000000000012',
    '83000000-0000-4000-8000-000000000013',
    '83000000-0000-4000-8000-000000000014',
    '83000000-0000-4000-8000-000000000015',
    '83000000-0000-4000-8000-000000000016',
    v_tenant, v_project, v_actor
  );
  v_result := public.withdraw_supplier_purchase_batch_workflow(
    v_tenant, '83000000-0000-4000-8000-000000000010', 2, NULL,
    v_user, v_actor, 'withdraw-purchase'
  );
  IF v_result->>'status' <> 'withdrawn'
    OR v_result->>'idempotent' <> 'false'
    OR v_result->'batch'->>'status' <> 'draft'
    OR v_result->>'version' <> '3'
    OR v_result->'workflow_state'->>'instance_status' <> 'canceled'
  THEN RAISE EXCEPTION 'purchase withdraw result mismatch: %', v_result; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.workflow_tasks
      WHERE id='83000000-0000-4000-8000-000000000012' AND status='canceled')
    OR NOT EXISTS (SELECT 1 FROM public.workflow_instances
      WHERE id='83000000-0000-4000-8000-000000000011' AND status='canceled')
    OR NOT EXISTS (SELECT 1 FROM public.project_cost_commitments
      WHERE id='83000000-0000-4000-8000-000000000016' AND status='released')
    OR NOT EXISTS (SELECT 1 FROM public.supplier_purchase_requisitions
      WHERE id='83000000-0000-4000-8000-000000000015' AND status='cancelled')
    OR NOT EXISTS (SELECT 1 FROM public.supplier_purchase_batch_items
      WHERE id='83000000-0000-4000-8000-000000000014')
    OR NOT EXISTS (SELECT 1 FROM public.workflow_transition_logs
      WHERE instance_id='83000000-0000-4000-8000-000000000011'
        AND action='withdraw')
  THEN RAISE EXCEPTION 'withdraw persistence mismatch'; END IF;

  v_result := public.withdraw_supplier_purchase_batch_workflow(
    v_tenant, '83000000-0000-4000-8000-000000000010', 2, NULL,
    v_user, v_actor, 'withdraw-purchase'
  );
  IF v_result->>'idempotent' <> 'true'
    OR (SELECT count(*) FROM public.supplier_purchase_batch_command_events
      WHERE purchase_batch_id='83000000-0000-4000-8000-000000000010'
        AND command_type='withdraw') <> 1
  THEN RAISE EXCEPTION 'withdraw replay mismatch: %', v_result; END IF;
  BEGIN
    PERFORM public.withdraw_supplier_purchase_batch_workflow(
      v_tenant, '83000000-0000-4000-8000-000000000010', 2, 'different',
      v_user, v_actor, 'withdraw-purchase');
    RAISE EXCEPTION 'different payload unexpectedly succeeded';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM <> 'SUPPLIER_IDEMPOTENCY_CONFLICT' THEN RAISE; END IF;
  END;

  FOREACH v_status IN ARRAY ARRAY['ordered', 'cancelled', 'rejected', 'draft']
  LOOP
    UPDATE public.supplier_purchase_batches
    SET status=v_status
    WHERE id='83000000-0000-4000-8000-000000000010';
    BEGIN
      PERFORM public.withdraw_supplier_purchase_batch_workflow(
        v_tenant, '83000000-0000-4000-8000-000000000010', 3, NULL,
        v_user, v_actor, 'withdraw-disallowed-' || v_status);
      RAISE EXCEPTION 'disallowed withdrawal unexpectedly succeeded: %',
        v_status;
    EXCEPTION WHEN SQLSTATE 'P0001' THEN
      IF SQLERRM <> 'SUPPLIER_PURCHASE_BATCH_WITHDRAW_NOT_ALLOWED' THEN
        RAISE;
      END IF;
    END;
  END LOOP;
  IF EXISTS (SELECT 1 FROM public.supplier_purchase_batch_command_events
      WHERE purchase_batch_id='83000000-0000-4000-8000-000000000010'
        AND idempotency_key LIKE 'withdraw-disallowed-%')
  THEN RAISE EXCEPTION 'disallowed withdrawal persisted an event'; END IF;

  PERFORM public.test_seed_withdraw(
    '83000000-0000-4000-8000-000000000020',
    '83000000-0000-4000-8000-000000000021',
    '83000000-0000-4000-8000-000000000022',
    '83000000-0000-4000-8000-000000000023',
    '83000000-0000-4000-8000-000000000024',
    '83000000-0000-4000-8000-000000000025',
    '83000000-0000-4000-8000-000000000026',
    v_tenant, v_project, v_actor, 'finance_review'
  );
  BEGIN
    PERFORM public.withdraw_supplier_purchase_batch_workflow(
      v_tenant, '83000000-0000-4000-8000-000000000020', 2, NULL,
      v_user, v_actor, 'withdraw-finance-missing');
    RAISE EXCEPTION 'finance withdrawal without reason unexpectedly succeeded';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM <> 'SUPPLIER_PURCHASE_BATCH_WITHDRAW_REASON_REQUIRED' THEN
      RAISE;
    END IF;
  END;
  IF NOT EXISTS (SELECT 1 FROM public.supplier_purchase_batches
      WHERE id='83000000-0000-4000-8000-000000000020'
        AND status='pending_approval' AND version=2)
  THEN RAISE EXCEPTION 'finance reason failure mutated batch'; END IF;

  BEGIN
    PERFORM public.withdraw_supplier_purchase_batch_workflow(
      v_tenant, '83000000-0000-4000-8000-000000000020', 2, '非提交人',
      v_user, v_other_actor, 'withdraw-wrong-submitter');
    RAISE EXCEPTION 'non-submitter unexpectedly withdrew batch';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM <> 'FORBIDDEN' THEN RAISE; END IF;
  END;

  DELETE FROM public.test_permission_scopes
  WHERE employee_id=v_actor AND project_id=v_project
    AND permission='project.update';
  BEGIN
    PERFORM public.withdraw_supplier_purchase_batch_workflow(
      v_tenant, '83000000-0000-4000-8000-000000000020', 2, '调整',
      v_user, v_actor, 'withdraw-finance-forbidden');
    RAISE EXCEPTION 'missing permission unexpectedly succeeded';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM <> 'FORBIDDEN' THEN RAISE; END IF;
  END;
  INSERT INTO public.test_permission_scopes VALUES
    (v_actor, v_project, 'project.update');
  v_result := public.withdraw_supplier_purchase_batch_workflow(
    v_tenant, '83000000-0000-4000-8000-000000000020', 2, '调整',
    v_user, v_actor, 'withdraw-finance'
  );
  IF v_result->>'status' <> 'withdrawn' THEN
    RAISE EXCEPTION 'finance withdrawal failed: %', v_result;
  END IF;

  INSERT INTO public.supplier_purchase_batches VALUES (
    '83000000-0000-4000-8000-000000000030', v_tenant, v_project,
    'rejected', 3, 1, NULL, 'unchecked', '{}'::jsonb, v_actor, 1,
    v_actor, now(), v_other_actor, now(), 'fixture rejected'
  );
  v_result := public.save_supplier_purchase_batch_draft(
    '83000000-0000-4000-8000-000000000030', v_tenant, v_project, 3,
    'fixture-non-saved', NULL, NULL, '[]'::jsonb, v_user, v_actor,
    'rejected-save-failure'
  );
  IF v_result->>'status' <> 'state_conflict'
    OR NOT EXISTS (SELECT 1 FROM public.supplier_purchase_batches
      WHERE id='83000000-0000-4000-8000-000000000030'
        AND status='rejected' AND version=3)
  THEN RAISE EXCEPTION 'rejected non-save was not restored'; END IF;
  v_result := public.save_supplier_purchase_batch_draft(
    '83000000-0000-4000-8000-000000000030', v_tenant, v_project, 3,
    'fixture-non-saved', NULL, NULL, '[]'::jsonb, v_user, v_actor,
    'rejected-save-failure'
  );
  IF v_result->>'status' <> 'state_conflict' THEN
    RAISE EXCEPTION 'rejected failure did not replay';
  END IF;
  BEGIN
    PERFORM public.save_supplier_purchase_batch_draft(
      '83000000-0000-4000-8000-000000000030', v_tenant, v_project, 3,
      'fixture-raise', NULL, NULL, '[]'::jsonb, v_user, v_actor,
      'rejected-save-raise');
  EXCEPTION WHEN OTHERS THEN v_error := SQLERRM;
  END;
  IF v_error <> 'FIXTURE_SAVE_RAISED'
    OR NOT EXISTS (SELECT 1 FROM public.supplier_purchase_batches
      WHERE id='83000000-0000-4000-8000-000000000030'
        AND status='rejected' AND version=3)
    OR EXISTS (SELECT 1 FROM public.supplier_purchase_batch_command_events
      WHERE idempotency_key='rejected-save-raise')
  THEN RAISE EXCEPTION 'raised rejected save did not roll back'; END IF;
  v_result := public.save_supplier_purchase_batch_draft(
    '83000000-0000-4000-8000-000000000030', v_tenant, v_project, 3,
    'saved-after-reject', NULL, NULL, '[]'::jsonb, v_user, v_actor,
    'rejected-save-success'
  );
  IF v_result->>'status' <> 'saved'
    OR v_result->'batch'->>'status' <> 'draft'
  THEN RAISE EXCEPTION 'rejected save did not enter draft: %', v_result; END IF;

  INSERT INTO public.supplier_purchase_batches VALUES (
    '83000000-0000-4000-8000-000000000040', v_tenant, v_project,
    'rejected', 3, 1, NULL, 'unchecked', '{}'::jsonb, v_actor, 1,
    v_actor, now(), v_other_actor, now(), 'fixture rejected'
  );
  v_result := public.cancel_supplier_purchase_batch(
    '83000000-0000-4000-8000-000000000040', v_tenant, 3, '取消',
    v_user, v_actor, 'cancel-rejected'
  );
  IF v_result->>'status' <> 'cancelled'
    OR v_result->'batch'->>'status' <> 'cancelled'
  THEN RAISE EXCEPTION 'rejected cancel failed: %', v_result; END IF;

  INSERT INTO public.supplier_purchase_batches VALUES (
    '83000000-0000-4000-8000-000000000050', v_tenant, v_project,
    'pending_approval', 2, 1, now(), 'within_budget', '{}'::jsonb, v_actor, 1,
    v_actor, now(), NULL, NULL, NULL
  );
  v_result := public.cancel_supplier_purchase_batch(
    '83000000-0000-4000-8000-000000000050', v_tenant, 2, '取消',
    v_user, v_actor, 'cancel-pending'
  );
  IF v_result->>'status' <> 'state_conflict'
    OR NOT EXISTS (SELECT 1 FROM public.supplier_purchase_batches
      WHERE id='83000000-0000-4000-8000-000000000050'
        AND status='pending_approval')
  THEN RAISE EXCEPTION 'pending cancel boundary failed: %', v_result; END IF;

  v_request := jsonb_build_object(
    'tenant_id', v_tenant,
    'batch_id', '83000000-0000-4000-8000-000000000010'::uuid,
    'task_id', '83000000-0000-4000-8000-000000000012'::uuid,
    'action', 'reject',
    'reason', '旧轮次驳回',
    'output', jsonb_build_object('source', 'test'),
    'approval_round', 1,
    'actor_user_id', v_user,
    'actor_employee_id', v_other_actor
  );
  v_fingerprint := encode(extensions.digest(
    convert_to(v_request::text, 'UTF8'), 'sha256'
  ), 'hex');
  INSERT INTO public.supplier_purchase_batch_command_events(
    tenant_id, purchase_batch_id, command_type, idempotency_key,
    request_fingerprint, request, actor_user_id, actor_employee_id,
    result, result_version
  ) VALUES (
    v_tenant, '83000000-0000-4000-8000-000000000010', 'review',
    'old-task-success', v_fingerprint,
    v_request || jsonb_build_object(
      'workflow_task_fingerprint', v_fingerprint,
      'workflow_task_result', jsonb_build_object(
        'status', 'rejected', 'idempotent', false,
        'version', 3, 'workflow_state', jsonb_build_object(
          'instance_status', 'completed', 'pending_task_count', 0
        )
      )
    ),
    v_user, v_other_actor,
    jsonb_build_object('status', 'rejected', 'idempotent', false), 3
  );

  UPDATE public.supplier_purchase_batches
  SET status='pending_approval', version=4, approval_round=2
  WHERE id='83000000-0000-4000-8000-000000000010';
  v_result := public.complete_supplier_purchase_batch_workflow_task(
    v_tenant, '83000000-0000-4000-8000-000000000010',
    '83000000-0000-4000-8000-000000000012', 'reject', '旧轮次驳回',
    jsonb_build_object('source', 'test'), v_user, v_other_actor,
    'old-task-success'
  );
  IF v_result->>'status' <> 'rejected'
    OR v_result->>'idempotent' <> 'true'
  THEN RAISE EXCEPTION 'old-round task replay mismatch: %', v_result; END IF;
  BEGIN
    PERFORM public.complete_supplier_purchase_batch_workflow_task(
      v_tenant, '83000000-0000-4000-8000-000000000010',
      '83000000-0000-4000-8000-000000000012', 'approve', NULL,
      jsonb_build_object('source', 'test'), v_user, v_other_actor,
      'old-task-success');
    RAISE EXCEPTION 'different old-round payload unexpectedly replayed';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM <> 'SUPPLIER_IDEMPOTENCY_CONFLICT' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.complete_supplier_purchase_batch_workflow_task(
      v_tenant, '83000000-0000-4000-8000-000000000010',
      '83000000-0000-4000-8000-000000000012', 'approve', NULL,
      '{}'::jsonb, v_user, v_actor, 'old-task-new-round');
    RAISE EXCEPTION 'old round task unexpectedly advanced';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM <> 'SUPPLIER_PURCHASE_BATCH_APPROVAL_ROUND_STALE' THEN
      RAISE;
    END IF;
  END;
END
$behavior$;

SELECT 'SUPPLIER_PURCHASE_BATCH_WORKFLOW_WITHDRAW_BEHAVIOR_OK';
