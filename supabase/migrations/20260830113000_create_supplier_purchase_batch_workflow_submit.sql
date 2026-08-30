-- Atomically submit a supplier purchase batch and start its tenant workflow.
-- Rollback: revoke the dedicated RPC first. Forward-fix any runtime records;
-- never delete command events, requisitions, commitments, or workflow history.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

CREATE FUNCTION public.__gooes_supplier_workflow_node_has_approver(
  p_tenant_id uuid,
  p_node jsonb
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rule text := NULLIF(pg_catalog.btrim(p_node->'config'->>'assignee_rule'), '');
  v_assignee_id text := NULLIF(pg_catalog.btrim(p_node->'config'->>'assignee_id'), '');
  v_permission_code text := COALESCE(
    NULLIF(pg_catalog.btrim(
      p_node->'config'->>'assignee_permission_code'
    ), ''),
    NULLIF(pg_catalog.btrim(
      p_node->'config'->'required_permissions'->>0
    ), '')
  );
  v_uuid_pattern constant text :=
    '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
BEGIN
  IF p_tenant_id IS NULL
    OR p_node IS NULL
    OR p_node->>'node_type' <> 'approval'
  THEN
    RETURN false;
  END IF;

  IF v_rule = 'employee' AND v_assignee_id ~* v_uuid_pattern THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.employees AS employee
      WHERE employee.id = v_assignee_id::uuid
        AND employee.tenant_id = p_tenant_id
        AND employee.status = 'active'
    );
  END IF;

  IF v_rule = 'role' AND v_assignee_id IS NOT NULL THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.employees AS employee
      JOIN public.employee_roles AS employee_role
        ON employee_role.employee_id = employee.id
      JOIN public.roles AS role_record
        ON role_record.id = employee_role.role_id
       AND role_record.code = v_assignee_id
       AND role_record.status = 'active'
       AND (
         role_record.tenant_id = p_tenant_id
         OR role_record.tenant_id IS NULL
       )
      WHERE employee.tenant_id = p_tenant_id
        AND employee.status = 'active'
        AND (
          v_permission_code IS NULL
          OR (
            NOT EXISTS (
              SELECT 1
              FROM public.employee_permission_overrides AS denied_override
              JOIN public.permissions AS denied_permission
                ON denied_permission.id = denied_override.permission_id
               AND denied_permission.code = v_permission_code
               AND denied_permission.status = 'active'
              WHERE denied_override.employee_id = employee.id
                AND denied_override.effect = 'deny'
            )
            AND (
              EXISTS (
                SELECT 1
                FROM public.role_permissions AS role_permission
                JOIN public.permissions AS permission_record
                  ON permission_record.id = role_permission.permission_id
                 AND permission_record.code = v_permission_code
                 AND permission_record.status = 'active'
                WHERE role_permission.role_id = role_record.id
              )
              OR EXISTS (
                SELECT 1
                FROM public.employee_permission_overrides AS allowed_override
                JOIN public.permissions AS allowed_permission
                  ON allowed_permission.id = allowed_override.permission_id
                 AND allowed_permission.code = v_permission_code
                 AND allowed_permission.status = 'active'
                WHERE allowed_override.employee_id = employee.id
                  AND allowed_override.effect = 'allow'
              )
            )
          )
        )
    );
  END IF;

  IF v_permission_code IS NULL THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.employees AS employee
    WHERE employee.tenant_id = p_tenant_id
      AND employee.status = 'active'
      AND NOT EXISTS (
        SELECT 1
        FROM public.employee_permission_overrides AS denied_override
        JOIN public.permissions AS denied_permission
          ON denied_permission.id = denied_override.permission_id
         AND denied_permission.code = v_permission_code
         AND denied_permission.status = 'active'
        WHERE denied_override.employee_id = employee.id
          AND denied_override.effect = 'deny'
      )
      AND (
        EXISTS (
          SELECT 1
          FROM public.employee_permission_overrides AS allowed_override
          JOIN public.permissions AS allowed_permission
            ON allowed_permission.id = allowed_override.permission_id
           AND allowed_permission.code = v_permission_code
           AND allowed_permission.status = 'active'
          WHERE allowed_override.employee_id = employee.id
            AND allowed_override.effect = 'allow'
        )
        OR EXISTS (
          SELECT 1
          FROM public.employee_roles AS employee_role
          JOIN public.roles AS role_record
            ON role_record.id = employee_role.role_id
           AND role_record.status = 'active'
           AND (
             role_record.tenant_id = p_tenant_id
             OR role_record.tenant_id IS NULL
           )
          JOIN public.role_permissions AS role_permission
            ON role_permission.role_id = role_record.id
          JOIN public.permissions AS permission_record
            ON permission_record.id = role_permission.permission_id
           AND permission_record.code = v_permission_code
           AND permission_record.status = 'active'
          WHERE employee_role.employee_id = employee.id
        )
      )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.__gooes_supplier_workflow_node_has_approver(
  uuid, jsonb
) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.submit_supplier_purchase_batch_with_workflow(
  p_batch_id uuid,
  p_tenant_id uuid,
  p_expected_version integer,
  p_actor_user_id uuid,
  p_actor_employee_id uuid,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_batch public.supplier_purchase_batches%ROWTYPE;
  v_event public.supplier_purchase_batch_command_events%ROWTYPE;
  v_setting public.tenant_supplier_settings%ROWTYPE;
  v_definition public.workflow_definitions%ROWTYPE;
  v_version public.workflow_versions%ROWTYPE;
  v_subject_state public.workflow_subject_states%ROWTYPE;
  v_request jsonb;
  v_fingerprint text;
  v_purchase_node jsonb;
  v_finance_node jsonb;
  v_start_node jsonb;
  v_start_edge jsonb;
  v_submit_result jsonb;
  v_start_result jsonb;
  v_result jsonb;
  v_changed_count integer;
  v_instance_id uuid;
BEGIN
  IF p_batch_id IS NULL OR p_tenant_id IS NULL
    OR p_expected_version IS NULL OR p_expected_version <= 0
    OR p_actor_user_id IS NULL OR p_actor_employee_id IS NULL
    OR p_idempotency_key IS NULL OR pg_catalog.btrim(p_idempotency_key) = ''
    OR p_idempotency_key <> pg_catalog.btrim(p_idempotency_key)
    OR pg_catalog.char_length(p_idempotency_key) > 120
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'SUPPLIER_PURCHASE_BATCH_VALIDATION_ERROR';
  END IF;

  v_request := pg_catalog.jsonb_build_object(
    'tenant_id', p_tenant_id,
    'batch_id', p_batch_id,
    'expected_version', p_expected_version,
    'actor_user_id', p_actor_user_id,
    'actor_employee_id', p_actor_employee_id
  );
  v_fingerprint := pg_catalog.encode(extensions.digest(
    pg_catalog.convert_to(v_request::text, 'UTF8'),
    'sha256'
  ), 'hex');

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'supplier-purchase-batch-command:' || p_tenant_id::text || ':' ||
      p_batch_id::text || ':submit:' || p_idempotency_key,
    6720240826142000
  ));

  SELECT event.*
  INTO v_event
  FROM public.supplier_purchase_batch_command_events AS event
  WHERE event.tenant_id = p_tenant_id
    AND event.purchase_batch_id = p_batch_id
    AND event.command_type = 'submit'
    AND event.idempotency_key = p_idempotency_key
  FOR UPDATE;

  IF FOUND THEN
    IF v_event.request_fingerprint IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'SUPPLIER_IDEMPOTENCY_CONFLICT';
    END IF;
    IF v_event.result->'workflow_state' IS NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'SUPPLIER_PURCHASE_BATCH_WORKFLOW_CONFLICT';
    END IF;
    RETURN v_event.result || pg_catalog.jsonb_build_object(
      'idempotent', true
    );
  END IF;

  SELECT setting.*
  INTO v_setting
  FROM public.tenant_supplier_settings AS setting
  WHERE setting.tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND OR NOT v_setting.module_enabled
    OR NOT v_setting.procurement_snapshot_v1_enabled
    OR NOT v_setting.purchase_batch_workflow_enabled
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_PURCHASE_BATCH_WORKFLOW_CONFLICT';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'supplier-purchase-batch-id:' || p_batch_id::text,
    6720240826142000
  ));

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
  IF v_batch.version <> p_expected_version THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_PURCHASE_BATCH_VERSION_CONFLICT';
  END IF;
  IF v_batch.status <> 'draft' THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_PURCHASE_BATCH_STATE_CONFLICT';
  END IF;

  PERFORM project.id
  FROM public.projects AS project
  WHERE project.id = v_batch.project_id
    AND project.tenant_id = p_tenant_id
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_PURCHASE_BATCH_PROJECT_INVALID';
  END IF;

  PERFORM public.assert_supplier_purchase_order_actor(
    p_tenant_id,
    p_actor_user_id,
    p_actor_employee_id
  );

  SELECT definition.*
  INTO v_definition
  FROM public.workflow_definitions AS definition
  WHERE definition.tenant_id = p_tenant_id
    AND definition.workflow_key = 'supplier_purchase_batch_approval'
    AND definition.status = 'active'
    AND definition.active_version_id IS NOT NULL
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_PURCHASE_BATCH_WORKFLOW_MISSING';
  END IF;

  SELECT version.*
  INTO v_version
  FROM public.workflow_versions AS version
  WHERE version.id = v_definition.active_version_id
    AND version.tenant_id = p_tenant_id
    AND version.definition_id = v_definition.id
    AND version.status = 'published'
  FOR SHARE;

  IF NOT FOUND
    OR v_version.snapshot->>'workflow_key' IS DISTINCT FROM
      'supplier_purchase_batch_approval'
    OR v_version.snapshot->>'subject_type' IS DISTINCT FROM
      'supplier_purchase_batch'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_PURCHASE_BATCH_WORKFLOW_MISSING';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.workflow_instances AS instance
    WHERE instance.tenant_id = p_tenant_id
      AND instance.subject_type = 'supplier_purchase_batch'
      AND instance.subject_id = p_batch_id::text
      AND instance.status = 'running'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_PURCHASE_BATCH_WORKFLOW_CONFLICT';
  END IF;

  SELECT node
  INTO v_start_node
  FROM pg_catalog.jsonb_array_elements(
    COALESCE(v_version.snapshot->'nodes', '[]'::jsonb)
  ) AS node
  WHERE node->>'node_type' = 'start'
  ORDER BY node->>'id'
  LIMIT 1;

  SELECT edge
  INTO v_start_edge
  FROM pg_catalog.jsonb_array_elements(
    COALESCE(v_version.snapshot->'edges', '[]'::jsonb)
  ) AS edge
  WHERE edge->>'source_node_id' = v_start_node->>'id'
  ORDER BY COALESCE((edge->>'priority')::integer, 100), edge->>'id'
  LIMIT 1;

  SELECT node
  INTO v_purchase_node
  FROM pg_catalog.jsonb_array_elements(
    COALESCE(v_version.snapshot->'nodes', '[]'::jsonb)
  ) AS node
  WHERE node->>'node_key' = 'purchase_review'
    AND node->>'node_type' = 'approval'
  LIMIT 1;

  SELECT node
  INTO v_finance_node
  FROM pg_catalog.jsonb_array_elements(
    COALESCE(v_version.snapshot->'nodes', '[]'::jsonb)
  ) AS node
  WHERE node->>'node_key' = 'finance_review'
    AND node->>'node_type' = 'approval'
  LIMIT 1;

  IF v_start_node IS NULL OR v_start_edge IS NULL
    OR v_purchase_node IS NULL
    OR v_start_edge->>'target_node_id' IS DISTINCT FROM
      v_purchase_node->>'id'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_PURCHASE_BATCH_WORKFLOW_MISSING';
  END IF;

  IF NOT public.__gooes_supplier_workflow_node_has_approver(
    p_tenant_id,
    v_purchase_node
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_PURCHASE_BATCH_WORKFLOW_NO_APPROVER';
  END IF;

  v_submit_result := public.submit_supplier_purchase_batch(
    p_batch_id,
    p_tenant_id,
    p_expected_version,
    p_actor_user_id,
    p_actor_employee_id,
    p_idempotency_key
  );

  IF v_submit_result->>'status' <> 'submitted' THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = COALESCE(
        v_submit_result->>'error_code',
        'SUPPLIER_PURCHASE_BATCH_WORKFLOW_CONFLICT'
      );
  END IF;

  SELECT batch.*
  INTO v_batch
  FROM public.supplier_purchase_batches AS batch
  WHERE batch.id = p_batch_id
    AND batch.tenant_id = p_tenant_id
  FOR UPDATE;

  IF v_batch.budget_status NOT IN ('within_budget', 'over_budget') THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_PURCHASE_BATCH_WORKFLOW_CONFLICT';
  END IF;

  IF v_batch.budget_status = 'over_budget' AND (
    v_finance_node IS NULL
    OR NOT public.__gooes_supplier_workflow_node_has_approver(
      p_tenant_id,
      v_finance_node
    )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_PURCHASE_BATCH_WORKFLOW_NO_APPROVER';
  END IF;

  UPDATE public.supplier_purchase_batches AS batch
  SET approval_round = batch.approval_round + 1
  WHERE batch.id = p_batch_id
    AND batch.tenant_id = p_tenant_id
    AND batch.version = (v_submit_result->>'version')::integer
    AND batch.status = 'pending_approval'
  RETURNING batch.* INTO v_batch;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_PURCHASE_BATCH_VERSION_CONFLICT';
  END IF;

  v_start_result := public.start_workflow_instance(
    p_tenant_id,
    v_definition.id,
    'supplier_purchase_batch',
    p_batch_id::text,
    pg_catalog.jsonb_build_object(
      'batch_id', p_batch_id,
      'batch_version', v_batch.version,
      'approval_round', v_batch.approval_round,
      'budget_status', v_batch.budget_status,
      'project_id', v_batch.project_id,
      'submitted_by_employee_id', p_actor_employee_id
    ),
    p_actor_employee_id
  );

  IF COALESCE((v_start_result->>'ok')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = CASE v_start_result->>'reason'
        WHEN 'running_instance_exists' THEN
          'SUPPLIER_PURCHASE_BATCH_WORKFLOW_CONFLICT'
        ELSE 'SUPPLIER_PURCHASE_BATCH_WORKFLOW_MISSING'
      END;
  END IF;

  v_instance_id := (v_start_result->'instance'->>'id')::uuid;

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
  WHERE instance.id = v_instance_id
    AND instance.tenant_id = p_tenant_id
    AND instance.status = 'running'
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

  IF v_subject_state.id IS NULL OR v_subject_state.pending_task_count < 1 THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_PURCHASE_BATCH_WORKFLOW_NO_APPROVER';
  END IF;

  v_result := v_submit_result || pg_catalog.jsonb_build_object(
    'batch', public.supplier_purchase_batch_to_jsonb(v_batch),
    'requisition_ids', v_submit_result->'requisition_ids',
    'workflow_state', pg_catalog.jsonb_build_object(
      'definition_id', v_subject_state.definition_id,
      'instance_id', v_subject_state.instance_id,
      'instance_status', v_subject_state.instance_status,
      'current_node_key', v_subject_state.current_node_key,
      'current_node_title', v_subject_state.current_node_title,
      'current_business_kind', v_subject_state.current_business_kind,
      'pending_task_count', v_subject_state.pending_task_count
    ),
    'version', v_batch.version,
    'idempotent', false
  );

  UPDATE public.supplier_purchase_batch_command_events AS event
  SET
    result = v_result,
    result_version = v_batch.version
  WHERE event.tenant_id = p_tenant_id
    AND event.purchase_batch_id = p_batch_id
    AND event.command_type = 'submit'
    AND event.idempotency_key = p_idempotency_key
    AND event.request_fingerprint = v_fingerprint;

  GET DIAGNOSTICS v_changed_count = ROW_COUNT;
  IF v_changed_count <> 1 THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_PURCHASE_BATCH_WORKFLOW_CONFLICT';
  END IF;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_supplier_purchase_batch_with_workflow(
  uuid, uuid, integer, uuid, uuid, text
) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.submit_supplier_purchase_batch_with_workflow(
  uuid, uuid, integer, uuid, uuid, text
) TO service_role;

COMMENT ON FUNCTION public.submit_supplier_purchase_batch_with_workflow(
  uuid, uuid, integer, uuid, uuid, text
) IS 'Atomically submits a supplier purchase batch, starts its published tenant approval workflow, and refreshes workflow_subject_states.';

COMMIT;
