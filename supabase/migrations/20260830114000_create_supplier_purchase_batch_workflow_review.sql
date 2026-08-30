-- Atomically completes purchase-batch approval tasks and the purchase command.
-- Rollback: revoke this RPC and disable the rollout flag. Preserve purchase
-- command events, workflow history, commitments, requisitions, and orders.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

CREATE FUNCTION public.complete_supplier_purchase_batch_workflow_task(
  p_tenant_id uuid,
  p_batch_id uuid,
  p_task_id uuid,
  p_action text,
  p_reason text,
  p_output jsonb,
  p_actor_user_id uuid,
  p_actor_employee_id uuid,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_instance_id uuid;
  v_instance public.workflow_instances%ROWTYPE;
  v_task public.workflow_tasks%ROWTYPE;
  v_batch public.supplier_purchase_batches%ROWTYPE;
  v_event public.supplier_purchase_batch_command_events%ROWTYPE;
  v_subject_state public.workflow_subject_states%ROWTYPE;
  v_action text := pg_catalog.btrim(COALESCE(p_action, ''));
  v_reason text := CASE
    WHEN p_reason IS NULL THEN NULL
    ELSE NULLIF(pg_catalog.btrim(p_reason), '')
  END;
  v_output jsonb := COALESCE(p_output, '{}'::jsonb);
  v_request jsonb;
  v_runtime_output jsonb;
  v_fingerprint text;
  v_legacy_request jsonb;
  v_legacy_fingerprint text;
  v_required_permission text;
  v_review_result jsonb;
  v_runtime_result jsonb;
  v_result jsonb;
  v_workflow_state jsonb;
  v_expected_runtime_status text;
  v_expected_next_node_key text;
  v_expected_task boolean;
  v_adopted_legacy_event boolean := false;
  v_expected_batch_version integer;
  v_changed_count integer;
  v_now timestamptz := pg_catalog.statement_timestamp();
BEGIN
  IF p_tenant_id IS NULL OR p_batch_id IS NULL OR p_task_id IS NULL
    OR v_action NOT IN ('approve', 'reject')
    OR (v_action = 'reject' AND v_reason IS NULL)
    OR (v_reason IS NOT NULL AND pg_catalog.char_length(v_reason) > 500)
    OR pg_catalog.jsonb_typeof(v_output) <> 'object'
    OR p_actor_user_id IS NULL OR p_actor_employee_id IS NULL
    OR p_idempotency_key IS NULL
    OR p_idempotency_key <> pg_catalog.btrim(p_idempotency_key)
    OR pg_catalog.char_length(p_idempotency_key) NOT BETWEEN 1 AND 120
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'SUPPLIER_PURCHASE_BATCH_VALIDATION_ERROR';
  END IF;

  -- Re-enter both legacy review advisory locks before any row lock. The
  -- delegated review calls are transaction-reentrant, while concurrent legacy
  -- callers with either the same or a different key cannot invert batch locks.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'supplier-purchase-batch-command:' || p_tenant_id::text || ':' ||
      p_batch_id::text || ':review:' || p_idempotency_key,
    6720240826142000
  ));
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'supplier-purchase-batch-id:' || p_batch_id::text,
    6720240826142000
  ));

  -- Resolve only the instance identity without a lock, then take every lock
  -- in the shared workflow/purchase order. The locked task is revalidated.
  SELECT task.instance_id
  INTO v_instance_id
  FROM public.workflow_tasks AS task
  WHERE task.id = p_task_id
    AND task.tenant_id = p_tenant_id;

  IF v_instance_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_PURCHASE_BATCH_WORKFLOW_MISSING';
  END IF;

  SELECT instance.*
  INTO v_instance
  FROM public.workflow_instances AS instance
  WHERE instance.id = v_instance_id
    AND instance.tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_PURCHASE_BATCH_WORKFLOW_MISSING';
  END IF;

  SELECT task.*
  INTO v_task
  FROM public.workflow_tasks AS task
  WHERE task.id = p_task_id
    AND task.tenant_id = p_tenant_id
    AND task.instance_id = v_instance.id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_PURCHASE_BATCH_WORKFLOW_MISSING';
  END IF;

  SELECT batch.*
  INTO v_batch
  FROM public.supplier_purchase_batches AS batch
  WHERE batch.id = p_batch_id
    AND batch.tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_PURCHASE_BATCH_NOT_FOUND';
  END IF;

  v_request := pg_catalog.jsonb_build_object(
    'tenant_id', p_tenant_id,
    'batch_id', p_batch_id,
    'task_id', p_task_id,
    'action', v_action,
    'reason', v_reason,
    'output', v_output,
    'approval_round', v_batch.approval_round,
    'actor_user_id', p_actor_user_id,
    'actor_employee_id', p_actor_employee_id
  );
  v_fingerprint := pg_catalog.encode(extensions.digest(
    pg_catalog.convert_to(v_request::text, 'UTF8'),
    'sha256'
  ), 'hex');

  v_expected_batch_version := CASE
    WHEN COALESCE(v_instance.context->>'batch_version', '') ~ '^[0-9]+$'
      THEN (v_instance.context->>'batch_version')::integer
    ELSE NULL
  END;
  v_legacy_request := pg_catalog.jsonb_build_object(
    'tenant_id', p_tenant_id,
    'batch_id', p_batch_id,
    'expected_version', v_expected_batch_version,
    'action', v_action,
    'remark', v_reason,
    'can_override_budget',
      v_action = 'approve' AND v_task.node_key = 'finance_review',
    'actor_user_id', p_actor_user_id,
    'actor_employee_id', p_actor_employee_id
  );
  v_legacy_fingerprint := pg_catalog.encode(extensions.digest(
    pg_catalog.convert_to(
      (v_legacy_request - 'can_override_budget')::text,
      'UTF8'
    ),
    'sha256'
  ), 'hex');

  -- A workflow replay carries its own fingerprint inside the legacy event.
  -- If the legacy endpoint won the same-key race, adopt its committed purchase
  -- result and finish only the workflow half of the atomic operation.
  SELECT event.*
  INTO v_event
  FROM public.supplier_purchase_batch_command_events AS event
  WHERE event.tenant_id = p_tenant_id
    AND event.purchase_batch_id = p_batch_id
    AND event.command_type = 'review'
    AND event.idempotency_key = p_idempotency_key
  FOR UPDATE;

  IF FOUND THEN
    IF v_event.request ? 'workflow_task_fingerprint'
      OR v_event.request ? 'task_id'
    THEN
      IF COALESCE(
        v_event.request->>'workflow_task_fingerprint',
        v_event.request_fingerprint
      ) IS DISTINCT FROM v_fingerprint THEN
        RAISE EXCEPTION USING
          ERRCODE = 'P0001',
          MESSAGE = 'SUPPLIER_IDEMPOTENCY_CONFLICT';
      END IF;
      RETURN COALESCE(
        v_event.request->'workflow_task_result',
        v_event.result
      ) || pg_catalog.jsonb_build_object(
        'idempotent', true
      );
    END IF;
    IF v_event.request_fingerprint IS DISTINCT FROM v_legacy_fingerprint THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'SUPPLIER_IDEMPOTENCY_CONFLICT';
    END IF;
    v_review_result := v_event.result;
    v_adopted_legacy_event := true;
  END IF;

  PERFORM public.assert_supplier_purchase_order_actor(
    p_tenant_id,
    p_actor_user_id,
    p_actor_employee_id
  );

  IF NOT EXISTS (
    SELECT 1
    FROM public.tenant_supplier_settings AS setting
    WHERE setting.tenant_id = p_tenant_id
      AND setting.module_enabled
      AND setting.procurement_snapshot_v1_enabled
      AND setting.purchase_batch_workflow_enabled
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_PURCHASE_BATCH_WORKFLOW_CONFLICT';
  END IF;

  IF v_instance.tenant_id IS DISTINCT FROM p_tenant_id
    OR v_instance.definition_id IS DISTINCT FROM v_task.definition_id
    OR v_instance.version_id IS DISTINCT FROM v_task.version_id
    OR v_instance.subject_type <> 'supplier_purchase_batch'
    OR v_instance.subject_id <> p_batch_id::text
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'FORBIDDEN';
  END IF;
  IF v_instance.status <> 'running' THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'WORKFLOW_TASK_NOT_PENDING';
  END IF;
  IF v_task.tenant_id IS DISTINCT FROM p_tenant_id
    OR v_task.status <> 'pending'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'WORKFLOW_TASK_NOT_PENDING';
  END IF;
  IF v_instance.current_node_key IS DISTINCT FROM v_task.node_key
    OR v_instance.current_node_id IS DISTINCT FROM v_task.node_id
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'WORKFLOW_NODE_NOT_CURRENT';
  END IF;
  IF v_task.node_key NOT IN ('purchase_review', 'finance_review')
    OR v_task.node_type <> 'approval'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_PURCHASE_BATCH_WORKFLOW_CONFLICT';
  END IF;
  IF COALESCE(v_instance.context->>'batch_version', '') !~ '^[0-9]+$'
    OR COALESCE(v_instance.context->>'approval_round', '') !~ '^[0-9]+$'
    OR (v_instance.context->>'approval_round')::integer <>
      v_batch.approval_round
    OR v_instance.context->>'project_id' IS DISTINCT FROM
      v_batch.project_id::text
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_PURCHASE_BATCH_APPROVAL_ROUND_STALE';
  END IF;
  IF NOT v_adopted_legacy_event
    AND v_batch.status <> 'pending_approval'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_PURCHASE_BATCH_STATE_CONFLICT';
  END IF;
  IF NOT v_adopted_legacy_event AND (
    v_expected_batch_version <> v_batch.version
    OR v_instance.context->>'budget_status' IS DISTINCT FROM
      v_batch.budget_status
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_PURCHASE_BATCH_APPROVAL_ROUND_STALE';
  END IF;
  IF v_adopted_legacy_event AND (
    v_batch.version <> v_expected_batch_version + 1
    OR CASE v_review_result->>'status'
      WHEN 'ordered' THEN v_action <> 'approve' OR v_batch.status <> 'ordered'
      WHEN 'rejected' THEN v_action <> 'reject' OR v_batch.status <> 'rejected'
      WHEN 'revision_required' THEN
        v_action <> 'approve' OR v_batch.status <> 'draft'
      ELSE true
    END
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_PURCHASE_BATCH_WORKFLOW_CONFLICT';
  END IF;
  IF COALESCE(
    v_instance.context->>'submitted_by_employee_id',
    v_batch.submitted_by_employee_id::text
  ) = p_actor_employee_id::text THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_PURCHASE_BATCH_SELF_REVIEW';
  END IF;

  v_required_permission := CASE v_task.node_key
    WHEN 'purchase_review' THEN 'supplier.purchase-requisition.approve'
    WHEN 'finance_review' THEN 'finance.budget.manage'
  END;

  IF v_task.assignee_employee_id IS NOT NULL
    AND v_task.assignee_employee_id <> p_actor_employee_id
  THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'FORBIDDEN';
  END IF;
  IF v_task.assignee_role_code IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.employee_roles AS employee_role
    JOIN public.roles AS role_record
      ON role_record.id = employee_role.role_id
     AND role_record.code = v_task.assignee_role_code
     AND role_record.status = 'active'
     AND (
       role_record.tenant_id = p_tenant_id
       OR role_record.tenant_id IS NULL
     )
    WHERE employee_role.employee_id = p_actor_employee_id
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'FORBIDDEN';
  END IF;
  IF v_task.assignee_permission_code IS NOT NULL
    AND NOT public.__gooes_employee_has_project_permission_scope(
      p_tenant_id,
      p_actor_employee_id,
      v_batch.project_id,
      v_task.assignee_permission_code
    )
  THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'FORBIDDEN';
  END IF;
  IF NOT public.__gooes_employee_has_project_permission_scope(
      p_tenant_id,
      p_actor_employee_id,
      v_batch.project_id,
      v_required_permission
    )
    OR NOT public.__gooes_employee_has_project_permission_scope(
      p_tenant_id,
      p_actor_employee_id,
      v_batch.project_id,
      'supplier.purchase-requisition.view'
    )
    OR NOT public.__gooes_employee_has_project_permission_scope(
      p_tenant_id,
      p_actor_employee_id,
      v_batch.project_id,
      'project.read'
    )
  THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'FORBIDDEN';
  END IF;
  IF v_task.node_key = 'finance_review'
    AND v_instance.context->>'budget_status' <> 'over_budget'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_PURCHASE_BATCH_WORKFLOW_CONFLICT';
  END IF;

  v_runtime_output := v_output || pg_catalog.jsonb_build_object(
    'reason', v_reason,
    'decision', CASE v_action
      WHEN 'approve' THEN 'approved'
      ELSE 'rejected'
    END,
    'budget_status', v_instance.context->>'budget_status',
    'approval_round', (v_instance.context->>'approval_round')::integer,
    'batch_version', v_expected_batch_version
  );

  IF v_action = 'reject'
    OR (v_task.node_key = 'purchase_review'
      AND v_instance.context->>'budget_status' = 'within_budget')
    OR v_task.node_key = 'finance_review'
  THEN
    IF NOT v_adopted_legacy_event THEN
      v_review_result := public.review_supplier_purchase_batch(
        p_batch_id,
        p_tenant_id,
        v_batch.version,
        v_action,
        v_reason,
        v_action = 'approve' AND v_task.node_key = 'finance_review',
        p_actor_user_id,
        p_actor_employee_id,
        p_idempotency_key
      );
    END IF;

    IF v_review_result->>'status' = 'revision_required' THEN
      UPDATE public.workflow_tasks AS task
      SET
        status = 'canceled',
        completed_by = p_actor_employee_id,
        completed_at = v_now
      WHERE task.tenant_id = p_tenant_id
        AND task.instance_id = v_instance.id
        AND task.status = 'pending';

      UPDATE public.workflow_instance_nodes AS node_run
      SET
        status = 'canceled',
        output = v_runtime_output || pg_catalog.jsonb_build_object(
          'error_code', v_review_result->>'error_code',
          'details', v_review_result->'details'
        ),
        completed_by = p_actor_employee_id,
        completed_at = v_now
      WHERE node_run.tenant_id = p_tenant_id
        AND node_run.instance_id = v_instance.id
        AND node_run.status = 'running';

      UPDATE public.workflow_instances AS instance
      SET
        status = 'canceled',
        completed_by = p_actor_employee_id,
        completed_at = v_now
      WHERE instance.id = v_instance.id
        AND instance.tenant_id = p_tenant_id
      RETURNING instance.* INTO v_instance;

      INSERT INTO public.workflow_transition_logs (
        tenant_id,
        instance_id,
        definition_id,
        version_id,
        source_node_id,
        source_node_key,
        target_node_id,
        target_node_key,
        edge_id,
        action,
        context,
        actor_employee_id
      ) VALUES (
        p_tenant_id,
        v_instance.id,
        v_instance.definition_id,
        v_instance.version_id,
        v_task.node_id,
        v_task.node_key,
        NULL,
        NULL,
        NULL,
        'revision_required',
        v_runtime_output || pg_catalog.jsonb_build_object(
          'error_code', v_review_result->>'error_code',
          'details', v_review_result->'details'
        ),
        p_actor_employee_id
      );
    ELSE
      IF (v_action = 'approve' AND v_review_result->>'status' <> 'ordered')
        OR (v_action = 'reject'
          AND v_review_result->>'status' <> 'rejected')
      THEN
        RAISE EXCEPTION USING
          ERRCODE = 'P0001',
          MESSAGE = COALESCE(
            v_review_result->>'error_code',
            'SUPPLIER_PURCHASE_BATCH_WORKFLOW_CONFLICT'
          );
      END IF;

      v_runtime_result := public.complete_workflow_instance_node(
        p_tenant_id,
        v_instance.definition_id,
        v_instance.id,
        v_task.node_key,
        v_action,
        v_runtime_output,
        p_actor_employee_id
      );
    END IF;
  ELSE
    -- The purchase approval of an over-budget batch only advances workflow.
    -- No purchase order or child requisition is mutated in this branch.
    v_runtime_result := public.complete_workflow_instance_node(
      p_tenant_id,
      v_instance.definition_id,
      v_instance.id,
      v_task.node_key,
      v_action,
      v_runtime_output,
      p_actor_employee_id
    );
  END IF;

  IF v_runtime_result IS NOT NULL THEN
    IF COALESCE((v_runtime_result->>'ok')::boolean, false) IS NOT TRUE THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = CASE v_runtime_result->>'reason'
          WHEN 'node_not_current' THEN 'WORKFLOW_NODE_NOT_CURRENT'
          WHEN 'instance_not_running' THEN 'WORKFLOW_TASK_NOT_PENDING'
          ELSE 'SUPPLIER_PURCHASE_BATCH_WORKFLOW_CONFLICT'
        END;
    END IF;
    IF v_task.node_key = 'purchase_review'
      AND v_action = 'approve'
      AND v_instance.context->>'budget_status' = 'over_budget'
    THEN
      v_expected_runtime_status := 'running';
      v_expected_next_node_key := 'finance_review';
      v_expected_task := true;
    ELSIF v_action = 'reject' THEN
      v_expected_runtime_status := 'completed';
      v_expected_next_node_key := 'rejected_end';
      v_expected_task := false;
    ELSE
      v_expected_runtime_status := 'completed';
      v_expected_next_node_key := 'approved_end';
      v_expected_task := false;
    END IF;

    IF v_runtime_result->'instance'->>'status' IS DISTINCT FROM
        v_expected_runtime_status
      OR v_runtime_result->'instance'->>'current_node_key' IS DISTINCT FROM
        v_expected_next_node_key
      OR v_runtime_result->'next_node'->>'node_key' IS DISTINCT FROM
        v_expected_next_node_key
      OR (v_expected_task AND (
        v_runtime_result->'next_node'->>'node_type' IS DISTINCT FROM 'approval'
        OR v_runtime_result->'task' IS NULL
        OR v_runtime_result->'task' = 'null'::jsonb
        OR v_runtime_result->'task'->>'node_key' IS DISTINCT FROM
          v_expected_next_node_key
        OR v_runtime_result->'task'->>'status' IS DISTINCT FROM 'pending'
      ))
      OR (NOT v_expected_task AND (
        v_runtime_result->'next_node'->>'node_type' IS DISTINCT FROM 'end'
        OR v_runtime_result->'task' IS DISTINCT FROM 'null'::jsonb
      ))
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'SUPPLIER_PURCHASE_BATCH_WORKFLOW_CONFLICT';
    END IF;
  END IF;

  INSERT INTO public.workflow_subject_states (
    tenant_id,
    subject_type,
    subject_id,
    definition_id,
    instance_id,
    instance_status,
    current_node_key,
    current_node_title,
    current_business_kind,
    pending_task_count
  )
  SELECT
    instance.tenant_id,
    instance.subject_type,
    instance.subject_id,
    instance.definition_id,
    instance.id,
    instance.status,
    instance.current_node_key,
    instance.current_node_snapshot->>'title',
    instance.current_node_snapshot->>'business_kind',
    (
      SELECT pg_catalog.count(*)::integer
      FROM public.workflow_tasks AS task
      WHERE task.tenant_id = instance.tenant_id
        AND task.instance_id = instance.id
        AND task.status = 'pending'
    )
  FROM public.workflow_instances AS instance
  WHERE instance.id = v_instance.id
    AND instance.tenant_id = p_tenant_id
  ON CONFLICT (tenant_id, subject_type, subject_id)
  DO UPDATE SET
    definition_id = EXCLUDED.definition_id,
    instance_id = EXCLUDED.instance_id,
    instance_status = EXCLUDED.instance_status,
    current_node_key = EXCLUDED.current_node_key,
    current_node_title = EXCLUDED.current_node_title,
    current_business_kind = EXCLUDED.current_business_kind,
    pending_task_count = EXCLUDED.pending_task_count
  RETURNING * INTO v_subject_state;

  v_workflow_state := pg_catalog.jsonb_build_object(
    'definition_id', v_subject_state.definition_id,
    'instance_id', v_subject_state.instance_id,
    'instance_status', v_subject_state.instance_status,
    'current_node_key', v_subject_state.current_node_key,
    'current_node_title', v_subject_state.current_node_title,
    'current_business_kind', v_subject_state.current_business_kind,
    'pending_task_count', v_subject_state.pending_task_count
  );

  SELECT batch.*
  INTO v_batch
  FROM public.supplier_purchase_batches AS batch
  WHERE batch.id = p_batch_id
    AND batch.tenant_id = p_tenant_id;

  IF v_review_result IS NULL THEN
    v_result := pg_catalog.jsonb_build_object(
      'status', 'pending_approval',
      'batch', public.supplier_purchase_batch_to_jsonb(v_batch),
      'version', v_batch.version,
      'workflow_state', v_workflow_state
    );
    v_result := public.record_supplier_purchase_batch_command_result(
      p_tenant_id,
      p_batch_id,
      'review',
      p_idempotency_key,
      v_fingerprint,
      v_request || pg_catalog.jsonb_build_object(
        'workflow_task_fingerprint', v_fingerprint
      ),
      p_actor_user_id,
      p_actor_employee_id,
      v_result,
      v_batch.version
    );
  ELSE
    v_result := v_review_result || pg_catalog.jsonb_build_object(
      'batch', public.supplier_purchase_batch_to_jsonb(v_batch),
      'version', v_batch.version,
      'workflow_state', v_workflow_state,
      'idempotent', false
    );

    -- Preserve the legacy fingerprint so the old endpoint can replay the same
    -- key, while nesting the stricter task fingerprint for workflow replays.
    UPDATE public.supplier_purchase_batch_command_events AS event
    SET
      request = event.request || pg_catalog.jsonb_build_object(
        'workflow_task_fingerprint', v_fingerprint,
        'workflow_task_request', v_request,
        'workflow_task_result', v_result
      )
    WHERE event.tenant_id = p_tenant_id
      AND event.purchase_batch_id = p_batch_id
      AND event.command_type = 'review'
      AND event.idempotency_key = p_idempotency_key
      AND event.request_fingerprint = v_legacy_fingerprint;

    GET DIAGNOSTICS v_changed_count = ROW_COUNT;
    IF v_changed_count <> 1 THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'SUPPLIER_PURCHASE_BATCH_WORKFLOW_CONFLICT';
    END IF;
  END IF;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_supplier_purchase_batch_workflow_task(
  uuid, uuid, uuid, text, text, jsonb, uuid, uuid, text
) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.complete_supplier_purchase_batch_workflow_task(
  uuid, uuid, uuid, text, text, jsonb, uuid, uuid, text
) TO service_role;

COMMENT ON FUNCTION public.complete_supplier_purchase_batch_workflow_task(
  uuid, uuid, uuid, text, text, jsonb, uuid, uuid, text
) IS 'Atomically completes a purchase-batch workflow approval task and its delegated purchase review command.';

COMMIT;
