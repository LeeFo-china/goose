\set ON_ERROR_STOP on

DO $compatibility$
DECLARE
  v_tenant uuid := '85000000-0000-4000-8000-000000000001';
  v_project uuid := '85000000-0000-4000-8000-000000000006';
  v_submit_user uuid := '85000000-0000-4000-8000-000000000002';
  v_submitter uuid := '85000000-0000-4000-8000-000000000003';
  v_review_user uuid := '85000000-0000-4000-8000-000000000004';
  v_reviewer uuid := '85000000-0000-4000-8000-000000000005';
  v_sku uuid := '85000000-0000-4000-8000-000000000026';
  v_cost_category uuid := '85000000-0000-4000-8000-000000000029';
  v_direct_first_batch uuid := '85000000-0000-4000-8000-000000000080';
  v_legacy_first_batch uuid := '85000000-0000-4000-8000-000000000090';
  v_reject_batch uuid := '85000000-0000-4000-8000-0000000000a0';
  v_raw_legacy_batch uuid := '85000000-0000-4000-8000-0000000000b0';
  v_task uuid;
  v_result jsonb;
BEGIN
  -- Direct workflow task completion first, then the old review route payload.
  v_result := public.save_supplier_purchase_batch_draft(
    v_direct_first_batch, v_tenant, v_project, 0, 'Task10 direct first', NULL,
    NULL, jsonb_build_array(jsonb_build_object(
      'supplier_sku_id', v_sku, 'cost_category_id', v_cost_category,
      'quantity', '1'
    )), v_submit_user, v_submitter, 'production-compat-direct-save'
  );
  v_result := public.submit_supplier_purchase_batch_with_workflow(
    v_direct_first_batch, v_tenant, 1, v_submit_user, v_submitter,
    'production-compat-direct-submit'
  );
  SELECT task.id INTO STRICT v_task
  FROM public.workflow_instances AS instance
  JOIN public.workflow_tasks AS task ON task.instance_id = instance.id
  WHERE instance.tenant_id = v_tenant
    AND instance.subject_type = 'supplier_purchase_batch'
    AND instance.subject_id = v_direct_first_batch::text
    AND instance.status = 'running' AND task.status = 'pending';
  BEGIN
    PERFORM public.complete_supplier_purchase_batch_workflow_task(
      v_tenant, v_direct_first_batch, v_task, 'approve', NULL,
      jsonb_build_object(
        'compat_source', 'forged', 'compat_expected_version', 2,
        'reason', NULL
      ), v_review_user, v_reviewer, 'production-compat-invalid-source'
    );
    RAISE EXCEPTION 'bad compatibility source unexpectedly completed';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM <> 'SUPPLIER_IDEMPOTENCY_CONFLICT' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.complete_supplier_purchase_batch_workflow_task(
      v_tenant, v_direct_first_batch, v_task, 'approve', NULL,
      jsonb_build_object(
        'compat_source', 'supplier_purchase_batch_review',
        'compat_expected_version', 3, 'reason', NULL
      ), v_review_user, v_reviewer, 'production-compat-invalid-version'
    );
    RAISE EXCEPTION 'wrong compatibility version unexpectedly completed';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM <> 'SUPPLIER_IDEMPOTENCY_CONFLICT' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.complete_supplier_purchase_batch_workflow_task(
      v_tenant, v_direct_first_batch, v_task, 'approve', NULL,
      jsonb_build_object(
        'compat_source', 'supplier_purchase_batch_review', 'reason', NULL
      ), v_review_user, v_reviewer, 'production-compat-single-field'
    );
    RAISE EXCEPTION 'single compatibility field unexpectedly completed';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM <> 'SUPPLIER_IDEMPOTENCY_CONFLICT' THEN RAISE; END IF;
  END;
  IF NOT EXISTS (
      SELECT 1 FROM public.supplier_purchase_batches
      WHERE id = v_direct_first_batch
        AND status = 'pending_approval' AND version = 2
    ) OR NOT EXISTS (
      SELECT 1 FROM public.workflow_tasks
      WHERE id = v_task AND status = 'pending'
    ) OR EXISTS (
      SELECT 1 FROM public.supplier_purchase_batch_command_events
      WHERE purchase_batch_id = v_direct_first_batch
        AND idempotency_key IN (
          'production-compat-invalid-source',
          'production-compat-invalid-version',
          'production-compat-single-field'
        )
    )
  THEN
    RAISE EXCEPTION 'invalid compatibility metadata mutated production facts';
  END IF;
  v_result := public.complete_supplier_purchase_batch_workflow_task(
    v_tenant, v_direct_first_batch, v_task, 'approve', NULL,
    jsonb_build_object('reason', NULL), v_review_user, v_reviewer,
    'production-compat-direct-first'
  );
  IF v_result->>'status' <> 'ordered' OR v_result->>'idempotent' <> 'false' THEN
    RAISE EXCEPTION 'direct-first completion failed: %', v_result;
  END IF;
  v_result := public.complete_supplier_purchase_batch_workflow_task(
    v_tenant, v_direct_first_batch, v_task, 'approve', NULL,
    jsonb_build_object(
      'compat_source', 'supplier_purchase_batch_review',
      'compat_expected_version', 2,
      'reason', NULL
    ), v_review_user, v_reviewer, 'production-compat-direct-first'
  );
  IF v_result->>'status' <> 'ordered' OR v_result->>'idempotent' <> 'true' THEN
    RAISE EXCEPTION 'legacy replay after direct completion failed: %', v_result;
  END IF;

  -- The compatibility route can win the race and the direct route can replay.
  v_result := public.save_supplier_purchase_batch_draft(
    v_legacy_first_batch, v_tenant, v_project, 0, 'Task10 legacy first', NULL,
    NULL, jsonb_build_array(jsonb_build_object(
      'supplier_sku_id', v_sku, 'cost_category_id', v_cost_category,
      'quantity', '1'
    )), v_submit_user, v_submitter, 'production-compat-legacy-save'
  );
  v_result := public.submit_supplier_purchase_batch_with_workflow(
    v_legacy_first_batch, v_tenant, 1, v_submit_user, v_submitter,
    'production-compat-legacy-submit'
  );
  SELECT task.id INTO STRICT v_task
  FROM public.workflow_instances AS instance
  JOIN public.workflow_tasks AS task ON task.instance_id = instance.id
  WHERE instance.tenant_id = v_tenant
    AND instance.subject_type = 'supplier_purchase_batch'
    AND instance.subject_id = v_legacy_first_batch::text
    AND instance.status = 'running' AND task.status = 'pending';
  v_result := public.complete_supplier_purchase_batch_workflow_task(
    v_tenant, v_legacy_first_batch, v_task, 'approve', NULL,
    jsonb_build_object(
      'compat_source', 'supplier_purchase_batch_review',
      'compat_expected_version', 2,
      'reason', NULL
    ), v_review_user, v_reviewer, 'production-compat-legacy-first'
  );
  IF v_result->>'status' <> 'ordered' OR v_result->>'idempotent' <> 'false' THEN
    RAISE EXCEPTION 'legacy-first completion failed: %', v_result;
  END IF;
  v_result := public.complete_supplier_purchase_batch_workflow_task(
    v_tenant, v_legacy_first_batch, v_task, 'approve', NULL,
    jsonb_build_object('reason', NULL), v_review_user, v_reviewer,
    'production-compat-legacy-first'
  );
  IF v_result->>'status' <> 'ordered' OR v_result->>'idempotent' <> 'true' THEN
    RAISE EXCEPTION 'direct replay after legacy completion failed: %', v_result;
  END IF;
  BEGIN
    PERFORM public.complete_supplier_purchase_batch_workflow_task(
      v_tenant, v_legacy_first_batch, v_task, 'approve', NULL,
      jsonb_build_object(
        'compat_source', 'supplier_purchase_batch_review',
        'compat_expected_version', 3,
        'reason', NULL
      ), v_review_user, v_reviewer, 'production-compat-legacy-first'
    );
    RAISE EXCEPTION 'changed legacy expected_version unexpectedly replayed';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM <> 'SUPPLIER_IDEMPOTENCY_CONFLICT' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.complete_supplier_purchase_batch_workflow_task(
      v_tenant, v_legacy_first_batch, v_task, 'approve', NULL,
      jsonb_build_object('reason', NULL, 'business', 'changed'),
      v_review_user, v_reviewer, 'production-compat-legacy-first'
    );
    RAISE EXCEPTION 'changed business output unexpectedly replayed';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM <> 'SUPPLIER_IDEMPOTENCY_CONFLICT' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.complete_supplier_purchase_batch_workflow_task(
      v_tenant, v_legacy_first_batch, v_task, 'approve', NULL,
      jsonb_build_object(
        'compat_source', 'supplier_purchase_batch_review',
        'compat_expected_version', 2,
        'reason', NULL
      ), v_review_user, v_reviewer, 'production-compat-terminal-new-key'
    );
    RAISE EXCEPTION 'terminal task unexpectedly accepted a different key';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM <> 'WORKFLOW_TASK_NOT_PENDING' THEN RAISE; END IF;
  END;

  -- A pre-Task10 pure legacy event is adopted by the current workflow task.
  v_result := public.save_supplier_purchase_batch_draft(
    v_raw_legacy_batch, v_tenant, v_project, 0, 'Task10 raw legacy', NULL,
    NULL, jsonb_build_array(jsonb_build_object(
      'supplier_sku_id', v_sku, 'cost_category_id', v_cost_category,
      'quantity', '1'
    )), v_submit_user, v_submitter, 'production-compat-raw-save'
  );
  v_result := public.submit_supplier_purchase_batch_with_workflow(
    v_raw_legacy_batch, v_tenant, 1, v_submit_user, v_submitter,
    'production-compat-raw-submit'
  );
  SELECT task.id INTO STRICT v_task
  FROM public.workflow_instances AS instance
  JOIN public.workflow_tasks AS task ON task.instance_id = instance.id
  WHERE instance.tenant_id = v_tenant
    AND instance.subject_type = 'supplier_purchase_batch'
    AND instance.subject_id = v_raw_legacy_batch::text
    AND instance.status = 'running' AND task.status = 'pending';
  v_result := public.review_supplier_purchase_batch(
    v_raw_legacy_batch, v_tenant, 2, 'approve', NULL, false,
    v_review_user, v_reviewer, 'production-compat-raw-key'
  );
  v_result := public.complete_supplier_purchase_batch_workflow_task(
    v_tenant, v_raw_legacy_batch, v_task, 'approve', NULL,
    jsonb_build_object(
      'compat_source', 'supplier_purchase_batch_review',
      'compat_expected_version', 2, 'reason', NULL
    ), v_review_user, v_reviewer, 'production-compat-raw-key'
  );
  IF NOT EXISTS (
    SELECT 1 FROM public.workflow_instances
    WHERE tenant_id = v_tenant
      AND subject_id = v_raw_legacy_batch::text AND status = 'completed'
  ) OR NOT EXISTS (
    SELECT 1 FROM public.supplier_purchase_batch_command_events
    WHERE purchase_batch_id = v_raw_legacy_batch
      AND idempotency_key = 'production-compat-raw-key'
      AND request ? 'workflow_task_result'
  ) THEN
    RAISE EXCEPTION 'raw legacy event was not adopted: %', v_result;
  END IF;
  v_result := public.complete_supplier_purchase_batch_workflow_task(
    v_tenant, v_raw_legacy_batch, v_task, 'approve', NULL,
    jsonb_build_object(
      'compat_source', 'supplier_purchase_batch_review',
      'compat_expected_version', 2, 'reason', NULL
    ), v_review_user, v_reviewer, 'production-compat-raw-key'
  );
  IF v_result->>'status' <> 'ordered' OR v_result->>'idempotent' <> 'true' THEN
    RAISE EXCEPTION 'adopted raw legacy event did not replay: %', v_result;
  END IF;
  BEGIN
    PERFORM public.complete_supplier_purchase_batch_workflow_task(
      v_tenant, v_raw_legacy_batch, v_task, 'reject', 'changed',
      jsonb_build_object(
        'compat_source', 'supplier_purchase_batch_review',
        'compat_expected_version', 2, 'reason', 'changed'
      ), v_review_user, v_reviewer, 'production-compat-raw-key'
    );
    RAISE EXCEPTION 'changed raw legacy payload unexpectedly replayed';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM <> 'SUPPLIER_IDEMPOTENCY_CONFLICT' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.complete_supplier_purchase_batch_workflow_task(
      v_tenant, v_raw_legacy_batch, v_task, 'approve', 'changed',
      jsonb_build_object(
        'compat_source', 'supplier_purchase_batch_review',
        'compat_expected_version', 2, 'reason', 'changed'
      ), v_review_user, v_reviewer, 'production-compat-raw-key'
    );
    RAISE EXCEPTION 'changed raw legacy reason unexpectedly replayed';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM <> 'SUPPLIER_IDEMPOTENCY_CONFLICT' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.complete_supplier_purchase_batch_workflow_task(
      v_tenant, v_raw_legacy_batch, v_task, 'approve', NULL,
      jsonb_build_object(
        'compat_source', 'supplier_purchase_batch_review',
        'compat_expected_version', 3, 'reason', NULL
      ), v_review_user, v_reviewer, 'production-compat-raw-key'
    );
    RAISE EXCEPTION 'changed raw legacy expected version unexpectedly replayed';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM <> 'SUPPLIER_IDEMPOTENCY_CONFLICT' THEN RAISE; END IF;
  END;

  -- Reject terminal results receive the same compatibility replay treatment.
  v_result := public.save_supplier_purchase_batch_draft(
    v_reject_batch, v_tenant, v_project, 0, 'Task10 reject replay', NULL,
    NULL, jsonb_build_array(jsonb_build_object(
      'supplier_sku_id', v_sku, 'cost_category_id', v_cost_category,
      'quantity', '1'
    )), v_submit_user, v_submitter, 'production-compat-reject-save'
  );
  v_result := public.submit_supplier_purchase_batch_with_workflow(
    v_reject_batch, v_tenant, 1, v_submit_user, v_submitter,
    'production-compat-reject-submit'
  );
  SELECT task.id INTO STRICT v_task
  FROM public.workflow_instances AS instance
  JOIN public.workflow_tasks AS task ON task.instance_id = instance.id
  WHERE instance.tenant_id = v_tenant
    AND instance.subject_type = 'supplier_purchase_batch'
    AND instance.subject_id = v_reject_batch::text
    AND instance.status = 'running' AND task.status = 'pending';
  v_result := public.complete_supplier_purchase_batch_workflow_task(
    v_tenant, v_reject_batch, v_task, 'reject', 'Task10 reject',
    jsonb_build_object('reason', 'Task10 reject'),
    v_review_user, v_reviewer, 'production-compat-reject'
  );
  v_result := public.complete_supplier_purchase_batch_workflow_task(
    v_tenant, v_reject_batch, v_task, 'reject', 'Task10 reject',
    jsonb_build_object(
      'compat_source', 'supplier_purchase_batch_review',
      'compat_expected_version', 2,
      'reason', 'Task10 reject'
    ), v_review_user, v_reviewer, 'production-compat-reject'
  );
  IF v_result->>'status' <> 'rejected' OR v_result->>'idempotent' <> 'true' THEN
    RAISE EXCEPTION 'terminal reject compatibility replay failed: %', v_result;
  END IF;
END
$compatibility$;

SELECT 'SUPPLIER_PURCHASE_BATCH_WORKFLOW_REVIEW_COMPAT_PRODUCTION_OK';
