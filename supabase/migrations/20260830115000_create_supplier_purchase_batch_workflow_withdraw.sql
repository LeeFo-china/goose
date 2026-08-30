-- Adds atomic workflow withdrawal and narrows the editable/cancelable batch
-- states. Rollback is a forward migration: keep command/workflow history,
-- disable the workflow rollout, then restore the prior RPC definitions only
-- after confirming no rejected draft or withdrawal commands remain in flight.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

ALTER TABLE public.supplier_purchase_batch_command_events
DROP CONSTRAINT supplier_purchase_batch_events_command_check;

ALTER TABLE public.supplier_purchase_batch_command_events
ADD CONSTRAINT supplier_purchase_batch_events_command_check CHECK (
  command_type IN ('save_draft', 'submit', 'review', 'cancel', 'withdraw')
);

CREATE FUNCTION public.withdraw_supplier_purchase_batch_workflow(
  p_tenant_id uuid,
  p_batch_id uuid,
  p_expected_version integer,
  p_reason text,
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
  v_reason text := CASE
    WHEN p_reason IS NULL THEN NULL
    ELSE NULLIF(pg_catalog.btrim(p_reason), '')
  END;
  v_request jsonb;
  v_fingerprint text;
  v_result jsonb;
  v_now timestamptz := pg_catalog.statement_timestamp();
BEGIN
  IF p_tenant_id IS NULL OR p_batch_id IS NULL
    OR p_expected_version IS NULL OR p_expected_version <= 0
    OR (v_reason IS NOT NULL AND pg_catalog.char_length(v_reason) > 500)
    OR p_actor_user_id IS NULL OR p_actor_employee_id IS NULL
    OR p_idempotency_key IS NULL
    OR p_idempotency_key <> pg_catalog.btrim(p_idempotency_key)
    OR pg_catalog.char_length(p_idempotency_key) NOT BETWEEN 1 AND 120
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'SUPPLIER_PURCHASE_BATCH_VALIDATION_ERROR';
  END IF;

  v_request := pg_catalog.jsonb_build_object(
    'tenant_id', p_tenant_id,
    'batch_id', p_batch_id,
    'expected_version', p_expected_version,
    'reason', v_reason,
    'actor_user_id', p_actor_user_id,
    'actor_employee_id', p_actor_employee_id
  );
  v_fingerprint := pg_catalog.encode(extensions.digest(
    pg_catalog.convert_to(v_request::text, 'UTF8'),
    'sha256'
  ), 'hex');

  -- Match every purchase command: command key, aggregate identity, then rows.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'supplier-purchase-batch-command:' || p_tenant_id::text || ':' ||
      p_batch_id::text || ':withdraw:' || p_idempotency_key,
    6720240826142000
  ));
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'supplier-purchase-batch-id:' || p_batch_id::text,
    6720240826142000
  ));

  -- Replay is deliberately before all business mutations and permission/state
  -- revalidation so a committed first result remains safely retryable.
  SELECT event.*
  INTO v_event
  FROM public.supplier_purchase_batch_command_events AS event
  WHERE event.tenant_id = p_tenant_id
    AND event.purchase_batch_id = p_batch_id
    AND event.command_type = 'withdraw'
    AND event.idempotency_key = p_idempotency_key
  FOR UPDATE;

  IF FOUND THEN
    IF v_event.request_fingerprint IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'SUPPLIER_IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN v_event.result || pg_catalog.jsonb_build_object(
      'idempotent', true
    );
  END IF;

  SELECT instance.id
  INTO v_instance_id
  FROM public.workflow_instances AS instance
  WHERE instance.tenant_id = p_tenant_id
    AND instance.subject_type = 'supplier_purchase_batch'
    AND instance.subject_id = p_batch_id::text
    AND instance.status = 'running'
  ORDER BY instance.created_at DESC, instance.id DESC
  LIMIT 1;

  IF v_instance_id IS NOT NULL THEN
    SELECT instance.*
    INTO v_instance
    FROM public.workflow_instances AS instance
    WHERE instance.id = v_instance_id
      AND instance.tenant_id = p_tenant_id
    FOR UPDATE;

    SELECT task.*
    INTO v_task
    FROM public.workflow_tasks AS task
    WHERE task.tenant_id = p_tenant_id
      AND task.instance_id = v_instance.id
      AND task.status = 'pending'
    ORDER BY task.created_at, task.id
    LIMIT 1
    FOR UPDATE;

    PERFORM task.id
    FROM public.workflow_tasks AS task
    WHERE task.tenant_id = p_tenant_id
      AND task.instance_id = v_instance.id
      AND task.status = 'pending'
    ORDER BY task.created_at, task.id
    FOR UPDATE;
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
  IF v_batch.status <> 'pending_approval' THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_PURCHASE_BATCH_WITHDRAW_NOT_ALLOWED';
  END IF;
  IF v_batch.version <> p_expected_version THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_PURCHASE_BATCH_VERSION_CONFLICT';
  END IF;
  IF v_instance.id IS NULL OR v_instance.status <> 'running'
    OR v_instance.subject_type <> 'supplier_purchase_batch'
    OR v_instance.subject_id <> p_batch_id::text
    OR v_task.id IS NULL OR v_task.status <> 'pending'
    OR v_instance.current_node_id IS DISTINCT FROM v_task.node_id
    OR v_instance.current_node_key IS DISTINCT FROM v_task.node_key
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_PURCHASE_BATCH_WORKFLOW_CONFLICT';
  END IF;
  IF COALESCE(v_instance.context->>'approval_round', '') !~ '^[0-9]+$'
    OR (v_instance.context->>'approval_round')::integer <>
      v_batch.approval_round
    OR COALESCE(v_instance.context->>'batch_version', '') !~ '^[0-9]+$'
    OR (v_instance.context->>'batch_version')::integer <> v_batch.version
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_PURCHASE_BATCH_APPROVAL_ROUND_STALE';
  END IF;
  IF v_batch.submitted_by_employee_id IS DISTINCT FROM p_actor_employee_id
    OR v_instance.context->>'submitted_by_employee_id' IS DISTINCT FROM
      p_actor_employee_id::text
  THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'FORBIDDEN';
  END IF;
  IF v_instance.current_node_key = 'finance_review' AND v_reason IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_PURCHASE_BATCH_WITHDRAW_REASON_REQUIRED';
  END IF;

  PERFORM public.assert_supplier_purchase_order_actor(
    p_tenant_id,
    p_actor_user_id,
    p_actor_employee_id
  );
  IF NOT public.__gooes_employee_has_project_permission_scope(
      p_tenant_id,
      p_actor_employee_id,
      v_batch.project_id,
      'supplier.purchase-requisition.manage'
    )
    OR NOT public.__gooes_employee_has_project_permission_scope(
      p_tenant_id,
      p_actor_employee_id,
      v_batch.project_id,
      'project.update'
    )
  THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'FORBIDDEN';
  END IF;
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

  -- Purchase facts follow the same stable order as final review: budget
  -- commitments, child requisitions, then purchase orders.
  PERFORM commitment.id
  FROM public.project_cost_commitments AS commitment
  JOIN public.supplier_purchase_requisitions AS requisition
    ON requisition.id = commitment.source_id
   AND requisition.tenant_id = commitment.tenant_id
  WHERE requisition.tenant_id = p_tenant_id
    AND requisition.purchase_batch_id = p_batch_id
    AND requisition.split_generation = v_batch.split_generation
  ORDER BY commitment.cost_category_id, commitment.id
  FOR UPDATE OF commitment;

  PERFORM requisition.id
  FROM public.supplier_purchase_requisitions AS requisition
  WHERE requisition.tenant_id = p_tenant_id
    AND requisition.purchase_batch_id = p_batch_id
    AND requisition.split_generation = v_batch.split_generation
  ORDER BY requisition.tenant_supplier_id, requisition.id
  FOR UPDATE;

  PERFORM purchase_order.id
  FROM public.supplier_purchase_orders AS purchase_order
  JOIN public.supplier_purchase_requisitions AS requisition
    ON requisition.purchase_order_id = purchase_order.id
   AND requisition.tenant_id = purchase_order.tenant_id
  WHERE requisition.tenant_id = p_tenant_id
    AND requisition.purchase_batch_id = p_batch_id
    AND requisition.split_generation = v_batch.split_generation
  ORDER BY purchase_order.tenant_supplier_id, purchase_order.id
  FOR UPDATE OF purchase_order;

  IF EXISTS (
    SELECT 1
    FROM public.supplier_purchase_requisitions AS requisition
    WHERE requisition.tenant_id = p_tenant_id
      AND requisition.purchase_batch_id = p_batch_id
      AND requisition.split_generation = v_batch.split_generation
      AND requisition.purchase_order_id IS NOT NULL
  ) OR EXISTS (
    SELECT 1
    FROM public.project_cost_commitments AS commitment
    JOIN public.supplier_purchase_requisitions AS requisition
      ON requisition.id = commitment.source_id
     AND requisition.tenant_id = commitment.tenant_id
    WHERE requisition.tenant_id = p_tenant_id
      AND requisition.purchase_batch_id = p_batch_id
      AND requisition.split_generation = v_batch.split_generation
      AND commitment.status IN ('converted', 'consumed')
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_PURCHASE_BATCH_WITHDRAW_NOT_ALLOWED';
  END IF;

  UPDATE public.workflow_tasks AS task
  SET
    status = 'canceled',
    completed_by = p_actor_employee_id,
    completed_at = v_now,
    updated_at = v_now
  WHERE task.tenant_id = p_tenant_id
    AND task.instance_id = v_instance.id
    AND task.status = 'pending';

  UPDATE public.workflow_instance_nodes AS node_run
  SET
    status = 'canceled',
    output = node_run.output || pg_catalog.jsonb_build_object(
      'action', 'withdraw',
      'reason', v_reason,
      'approval_round', v_batch.approval_round,
      'batch_version', v_batch.version
    ),
    completed_by = p_actor_employee_id,
    completed_at = v_now,
    updated_at = v_now
  WHERE node_run.tenant_id = p_tenant_id
    AND node_run.instance_id = v_instance.id
    AND node_run.status = 'running';

  UPDATE public.workflow_instances AS instance
  SET
    status = 'canceled',
    completed_by = p_actor_employee_id,
    completed_at = v_now,
    updated_at = v_now
  WHERE instance.id = v_instance.id
    AND instance.tenant_id = p_tenant_id
    AND instance.status = 'running'
  RETURNING instance.* INTO v_instance;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_PURCHASE_BATCH_WORKFLOW_CONFLICT';
  END IF;

  UPDATE public.project_cost_commitments AS commitment
  SET
    status = 'released',
    released_by_employee_id = p_actor_employee_id,
    released_at = v_now,
    release_reason = COALESCE(v_reason, '申请人撤回采购审批'),
    updated_at = v_now
  FROM public.supplier_purchase_requisitions AS requisition
  WHERE requisition.id = commitment.source_id
    AND requisition.tenant_id = p_tenant_id
    AND requisition.purchase_batch_id = p_batch_id
    AND requisition.split_generation = v_batch.split_generation
    AND commitment.status = 'reserved';

  UPDATE public.supplier_purchase_requisitions AS requisition
  SET
    status = 'cancelled',
    cancelled_by_employee_id = p_actor_employee_id,
    cancelled_at = v_now,
    cancel_reason = COALESCE(v_reason, '申请人撤回采购审批'),
    updated_by_employee_id = p_actor_employee_id,
    updated_at = v_now,
    version = requisition.version + 1
  WHERE requisition.tenant_id = p_tenant_id
    AND requisition.purchase_batch_id = p_batch_id
    AND requisition.split_generation = v_batch.split_generation
    AND requisition.status IN ('draft', 'pending_approval');

  UPDATE public.supplier_purchase_batches AS batch
  SET
    status = 'draft',
    budget_checked_at = NULL,
    budget_status = 'unchecked',
    budget_snapshot = '{}'::jsonb,
    version = batch.version + 1,
    updated_by_employee_id = p_actor_employee_id,
    updated_at = v_now
  WHERE batch.id = p_batch_id
    AND batch.tenant_id = p_tenant_id
    AND batch.status = 'pending_approval'
    AND batch.version = p_expected_version
  RETURNING batch.* INTO v_batch;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_PURCHASE_BATCH_VERSION_CONFLICT';
  END IF;

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
    'withdraw',
    pg_catalog.jsonb_build_object(
      'reason', v_reason,
      'approval_round', v_batch.approval_round,
      'batch_version', v_batch.version
    ),
    p_actor_employee_id
  );

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
  ) VALUES (
    p_tenant_id,
    'supplier_purchase_batch',
    p_batch_id::text,
    v_instance.definition_id,
    v_instance.id,
    'canceled',
    v_instance.current_node_key,
    v_instance.current_node_snapshot->>'title',
    v_instance.current_node_snapshot->>'business_kind',
    0
  )
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

  v_result := pg_catalog.jsonb_build_object(
    'status', 'withdrawn',
    'idempotent', false,
    'batch', public.supplier_purchase_batch_to_jsonb(v_batch),
    'version', v_batch.version,
    'workflow_state', pg_catalog.jsonb_build_object(
      'definition_id', v_subject_state.definition_id,
      'instance_id', v_subject_state.instance_id,
      'instance_status', v_subject_state.instance_status,
      'current_node_key', v_subject_state.current_node_key,
      'current_node_title', v_subject_state.current_node_title,
      'current_business_kind', v_subject_state.current_business_kind,
      'pending_task_count', v_subject_state.pending_task_count
    )
  );

  RETURN public.record_supplier_purchase_batch_command_result(
    p_tenant_id,
    p_batch_id,
    'withdraw',
    p_idempotency_key,
    v_fingerprint,
    v_request,
    p_actor_user_id,
    p_actor_employee_id,
    v_result,
    v_batch.version
  );
END;
$$;

REVOKE ALL ON FUNCTION public.withdraw_supplier_purchase_batch_workflow(
  uuid, uuid, integer, text, uuid, uuid, text
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.withdraw_supplier_purchase_batch_workflow(
  uuid, uuid, integer, text, uuid, uuid, text
) TO service_role;

ALTER FUNCTION public.save_supplier_purchase_batch_draft(
  uuid, uuid, uuid, integer, text, date, text, jsonb, uuid, uuid, text
) RENAME TO __gooes_save_supplier_purchase_batch_draft_v1;

REVOKE ALL ON FUNCTION public.__gooes_save_supplier_purchase_batch_draft_v1(
  uuid, uuid, uuid, integer, text, date, text, jsonb, uuid, uuid, text
) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.save_supplier_purchase_batch_draft(
  p_batch_id uuid,
  p_tenant_id uuid,
  p_project_id uuid,
  p_expected_version integer,
  p_reason text,
  p_expected_delivery_date date,
  p_remark text,
  p_items jsonb,
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
  v_batch public.supplier_purchase_batches%ROWTYPE;
  v_event public.supplier_purchase_batch_command_events%ROWTYPE;
  v_result jsonb;
  v_was_rejected boolean := false;
BEGIN
  IF p_batch_id IS NULL OR p_tenant_id IS NULL OR p_expected_version IS NULL
    OR p_idempotency_key IS NULL
  THEN
    RETURN public.__gooes_save_supplier_purchase_batch_draft_v1(
      p_batch_id, p_tenant_id, p_project_id, p_expected_version, p_reason,
      p_expected_delivery_date, p_remark, p_items, p_actor_user_id,
      p_actor_employee_id, p_idempotency_key
    );
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'supplier-purchase-batch-command:' || p_tenant_id::text || ':' ||
      p_batch_id::text || ':save_draft:' || p_idempotency_key,
    6720240826142000
  ));
  SELECT event.*
  INTO v_event
  FROM public.supplier_purchase_batch_command_events AS event
  WHERE event.tenant_id = p_tenant_id
    AND event.purchase_batch_id = p_batch_id
    AND event.command_type = 'save_draft'
    AND event.idempotency_key = p_idempotency_key
  FOR UPDATE;
  IF FOUND THEN
    RETURN public.__gooes_save_supplier_purchase_batch_draft_v1(
      p_batch_id, p_tenant_id, p_project_id, p_expected_version, p_reason,
      p_expected_delivery_date, p_remark, p_items, p_actor_user_id,
      p_actor_employee_id, p_idempotency_key
    );
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

  IF NOT FOUND OR v_batch.version <> p_expected_version
    OR v_batch.status NOT IN ('draft', 'rejected')
  THEN
    RETURN public.__gooes_save_supplier_purchase_batch_draft_v1(
      p_batch_id, p_tenant_id, p_project_id, p_expected_version, p_reason,
      p_expected_delivery_date, p_remark, p_items, p_actor_user_id,
      p_actor_employee_id, p_idempotency_key
    );
  END IF;

  IF v_batch.status = 'rejected' THEN
    IF v_batch.submitted_by_employee_id IS DISTINCT FROM p_actor_employee_id THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'FORBIDDEN';
    END IF;
    UPDATE public.supplier_purchase_batches AS batch
    SET
      status = 'draft',
      reviewed_by_employee_id = NULL,
      reviewed_at = NULL,
      review_remark = NULL
    WHERE batch.id = p_batch_id
      AND batch.tenant_id = p_tenant_id
      AND batch.version = p_expected_version
      AND batch.status = 'rejected';
    v_was_rejected := true;
  END IF;

  v_result := public.__gooes_save_supplier_purchase_batch_draft_v1(
    p_batch_id, p_tenant_id, p_project_id, p_expected_version, p_reason,
    p_expected_delivery_date, p_remark, p_items, p_actor_user_id,
    p_actor_employee_id, p_idempotency_key
  );

  IF v_was_rejected AND v_result->>'status' <> 'saved' THEN
    UPDATE public.supplier_purchase_batches AS batch
    SET
      status = 'rejected',
      reviewed_by_employee_id = v_batch.reviewed_by_employee_id,
      reviewed_at = v_batch.reviewed_at,
      review_remark = v_batch.review_remark
    WHERE batch.id = p_batch_id
      AND batch.tenant_id = p_tenant_id
      AND batch.version = p_expected_version
      AND batch.status = 'draft';
  END IF;
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.save_supplier_purchase_batch_draft(
  uuid, uuid, uuid, integer, text, date, text, jsonb, uuid, uuid, text
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_supplier_purchase_batch_draft(
  uuid, uuid, uuid, integer, text, date, text, jsonb, uuid, uuid, text
) TO service_role;

ALTER FUNCTION public.cancel_supplier_purchase_batch(
  uuid, uuid, integer, text, uuid, uuid, text
) RENAME TO __gooes_cancel_supplier_purchase_batch_v1;

REVOKE ALL ON FUNCTION public.__gooes_cancel_supplier_purchase_batch_v1(
  uuid, uuid, integer, text, uuid, uuid, text
) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.cancel_supplier_purchase_batch(
  p_batch_id uuid,
  p_tenant_id uuid,
  p_expected_version integer,
  p_reason text,
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
  v_batch public.supplier_purchase_batches%ROWTYPE;
  v_event public.supplier_purchase_batch_command_events%ROWTYPE;
  v_request jsonb;
  v_fingerprint text;
  v_result jsonb;
  v_was_rejected boolean := false;
BEGIN
  IF p_batch_id IS NULL OR p_tenant_id IS NULL
    OR p_expected_version IS NULL OR p_expected_version <= 0
    OR p_reason IS NULL OR pg_catalog.btrim(p_reason) = ''
    OR pg_catalog.char_length(pg_catalog.btrim(p_reason)) > 500
    OR p_actor_user_id IS NULL OR p_actor_employee_id IS NULL
    OR p_idempotency_key IS NULL
    OR p_idempotency_key <> pg_catalog.btrim(p_idempotency_key)
    OR pg_catalog.char_length(p_idempotency_key) NOT BETWEEN 1 AND 120
  THEN
    RETURN public.__gooes_cancel_supplier_purchase_batch_v1(
      p_batch_id, p_tenant_id, p_expected_version, p_reason,
      p_actor_user_id, p_actor_employee_id, p_idempotency_key
    );
  END IF;

  v_request := pg_catalog.jsonb_build_object(
    'tenant_id', p_tenant_id,
    'batch_id', p_batch_id,
    'expected_version', p_expected_version,
    'reason', pg_catalog.btrim(p_reason),
    'actor_user_id', p_actor_user_id,
    'actor_employee_id', p_actor_employee_id
  );
  v_fingerprint := pg_catalog.encode(extensions.digest(
    pg_catalog.convert_to(v_request::text, 'UTF8'),
    'sha256'
  ), 'hex');

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'supplier-purchase-batch-command:' || p_tenant_id::text || ':' ||
      p_batch_id::text || ':cancel:' || p_idempotency_key,
    6720240826142000
  ));
  SELECT event.*
  INTO v_event
  FROM public.supplier_purchase_batch_command_events AS event
  WHERE event.tenant_id = p_tenant_id
    AND event.purchase_batch_id = p_batch_id
    AND event.command_type = 'cancel'
    AND event.idempotency_key = p_idempotency_key
  FOR UPDATE;
  IF FOUND THEN
    RETURN public.__gooes_cancel_supplier_purchase_batch_v1(
      p_batch_id, p_tenant_id, p_expected_version, p_reason,
      p_actor_user_id, p_actor_employee_id, p_idempotency_key
    );
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
    RETURN public.__gooes_cancel_supplier_purchase_batch_v1(
      p_batch_id, p_tenant_id, p_expected_version, p_reason,
      p_actor_user_id, p_actor_employee_id, p_idempotency_key
    );
  END IF;
  IF v_batch.status NOT IN ('draft', 'rejected') THEN
    PERFORM public.assert_supplier_purchase_order_actor(
      p_tenant_id, p_actor_user_id, p_actor_employee_id
    );
    RETURN public.record_supplier_purchase_batch_command_result(
      p_tenant_id, p_batch_id, 'cancel', p_idempotency_key, v_fingerprint,
      v_request, p_actor_user_id, p_actor_employee_id,
      pg_catalog.jsonb_build_object(
        'status', 'state_conflict',
        'error_code', 'SUPPLIER_PURCHASE_BATCH_STATE_CONFLICT',
        'version', v_batch.version
      ),
      v_batch.version
    );
  END IF;
  IF v_batch.version <> p_expected_version THEN
    RETURN public.__gooes_cancel_supplier_purchase_batch_v1(
      p_batch_id, p_tenant_id, p_expected_version, p_reason,
      p_actor_user_id, p_actor_employee_id, p_idempotency_key
    );
  END IF;

  IF v_batch.status = 'rejected' THEN
    UPDATE public.supplier_purchase_batches AS batch
    SET
      status = 'draft',
      reviewed_by_employee_id = NULL,
      reviewed_at = NULL,
      review_remark = NULL
    WHERE batch.id = p_batch_id
      AND batch.tenant_id = p_tenant_id
      AND batch.version = p_expected_version
      AND batch.status = 'rejected';
    v_was_rejected := true;
  END IF;

  v_result := public.__gooes_cancel_supplier_purchase_batch_v1(
    p_batch_id, p_tenant_id, p_expected_version, p_reason,
    p_actor_user_id, p_actor_employee_id, p_idempotency_key
  );
  IF v_was_rejected AND v_result->>'status' <> 'cancelled' THEN
    UPDATE public.supplier_purchase_batches AS batch
    SET
      status = 'rejected',
      reviewed_by_employee_id = v_batch.reviewed_by_employee_id,
      reviewed_at = v_batch.reviewed_at,
      review_remark = v_batch.review_remark
    WHERE batch.id = p_batch_id
      AND batch.tenant_id = p_tenant_id
      AND batch.version = p_expected_version
      AND batch.status = 'draft';
  END IF;
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_supplier_purchase_batch(
  uuid, uuid, integer, text, uuid, uuid, text
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cancel_supplier_purchase_batch(
  uuid, uuid, integer, text, uuid, uuid, text
) TO service_role;

-- A canceled task from an earlier approval round must report the domain stale
-- code after resubmission, while a persisted same-key review replay still
-- delegates to the event-first implementation unchanged.
ALTER FUNCTION public.complete_supplier_purchase_batch_workflow_task(
  uuid, uuid, uuid, text, text, jsonb, uuid, uuid, text
) RENAME TO __gooes_complete_supplier_purchase_batch_workflow_task_v1;

REVOKE ALL ON FUNCTION
  public.__gooes_complete_supplier_purchase_batch_workflow_task_v1(
    uuid, uuid, uuid, text, text, jsonb, uuid, uuid, text
  ) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.complete_supplier_purchase_batch_workflow_task(
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
  v_event public.supplier_purchase_batch_command_events%ROWTYPE;
  v_workflow_request jsonb;
  v_replay_request jsonb;
  v_stored_fingerprint text;
  v_stored_canonical_request jsonb;
  v_current_canonical_request jsonb;
  v_stored_output jsonb;
  v_current_output jsonb;
  v_stored_compat_version integer;
  v_current_compat_version integer;
  v_task_batch_version integer;
  v_instance_round integer;
  v_batch_round integer;
BEGIN
  IF p_tenant_id IS NOT NULL AND p_batch_id IS NOT NULL
    AND p_task_id IS NOT NULL AND p_idempotency_key IS NOT NULL
  THEN
    -- Serialize with the v1 review command before checking its event. This
    -- keeps a concurrent same-key completion from being misreported stale.
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
      'supplier-purchase-batch-command:' || p_tenant_id::text || ':' ||
        p_batch_id::text || ':review:' || p_idempotency_key,
      6720240826142000
    ));
    -- Match the delegated v1 lock order before event replay or stale
    -- preflight so a completed withdrawal/resubmission is observed atomically.
    -- v1 re-enters this transaction advisory lock when delegated below.
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
      'supplier-purchase-batch-id:' || p_batch_id::text,
      6720240826142000
    ));

    SELECT event.*
    INTO v_event
    FROM public.supplier_purchase_batch_command_events AS event
    WHERE event.tenant_id = p_tenant_id
      AND event.purchase_batch_id = p_batch_id
      AND event.command_type = 'review'
      AND event.idempotency_key = p_idempotency_key
    FOR UPDATE;

    IF FOUND AND (
      v_event.request ? 'workflow_task_fingerprint'
      OR v_event.request ? 'task_id'
    ) THEN
      v_workflow_request := CASE
        WHEN pg_catalog.jsonb_typeof(
          v_event.request->'workflow_task_request'
        ) = 'object'
          THEN v_event.request->'workflow_task_request'
        ELSE v_event.request
          - 'workflow_task_fingerprint'
          - 'workflow_task_result'
      END;
      v_stored_fingerprint := pg_catalog.encode(extensions.digest(
        pg_catalog.convert_to(v_workflow_request::text, 'UTF8'),
        'sha256'
      ), 'hex');
      IF COALESCE(
        v_event.request->>'workflow_task_fingerprint',
        v_event.request_fingerprint
      ) IS DISTINCT FROM v_stored_fingerprint
        OR COALESCE(v_workflow_request->>'approval_round', '') !~ '^[0-9]+$'
      THEN
        RAISE EXCEPTION USING
          ERRCODE = 'P0001',
          MESSAGE = 'SUPPLIER_IDEMPOTENCY_CONFLICT';
      END IF;

      v_replay_request := pg_catalog.jsonb_build_object(
        'tenant_id', p_tenant_id,
        'batch_id', p_batch_id,
        'task_id', p_task_id,
        'action', pg_catalog.btrim(COALESCE(p_action, '')),
        'reason', CASE
          WHEN p_reason IS NULL THEN NULL
          ELSE NULLIF(pg_catalog.btrim(p_reason), '')
        END,
        'output', COALESCE(p_output, '{}'::jsonb),
        'approval_round', (v_workflow_request->>'approval_round')::integer,
        'actor_user_id', p_actor_user_id,
        'actor_employee_id', p_actor_employee_id
      );

      SELECT CASE
        WHEN COALESCE(instance.context->>'batch_version', '') ~ '^[0-9]+$'
          THEN (instance.context->>'batch_version')::integer
        ELSE NULL
      END
      INTO v_task_batch_version
      FROM public.workflow_tasks AS task
      JOIN public.workflow_instances AS instance
        ON instance.id = task.instance_id
       AND instance.tenant_id = task.tenant_id
      WHERE task.id = p_task_id
        AND task.tenant_id = p_tenant_id
        AND instance.subject_type = 'supplier_purchase_batch'
        AND instance.subject_id = p_batch_id::text;

      v_stored_output := COALESCE(
        v_workflow_request->'output', '{}'::jsonb
      );
      v_current_output := COALESCE(
        v_replay_request->'output', '{}'::jsonb
      );
      v_stored_compat_version := CASE
        WHEN pg_catalog.jsonb_typeof(
          v_stored_output->'compat_expected_version'
        ) = 'number'
          AND COALESCE(
            v_stored_output->>'compat_expected_version', ''
          ) ~ '^[0-9]+$'
        THEN (v_stored_output->>'compat_expected_version')::integer
        ELSE NULL
      END;
      v_current_compat_version := CASE
        WHEN pg_catalog.jsonb_typeof(
          v_current_output->'compat_expected_version'
        ) = 'number'
          AND COALESCE(
            v_current_output->>'compat_expected_version', ''
          ) ~ '^[0-9]+$'
        THEN (v_current_output->>'compat_expected_version')::integer
        ELSE NULL
      END;
      IF v_task_batch_version IS NULL
        OR pg_catalog.jsonb_typeof(v_stored_output) <> 'object'
        OR pg_catalog.jsonb_typeof(v_current_output) <> 'object'
        OR (v_stored_output ? 'compat_source') IS DISTINCT FROM
          (v_stored_output ? 'compat_expected_version')
        OR (v_current_output ? 'compat_source') IS DISTINCT FROM
          (v_current_output ? 'compat_expected_version')
        OR (
          v_stored_output ? 'compat_source' AND (
            v_stored_output->>'compat_source' IS DISTINCT FROM
              'supplier_purchase_batch_review'
            OR v_stored_compat_version IS DISTINCT FROM v_task_batch_version
          )
        )
        OR (
          v_current_output ? 'compat_source' AND (
            v_current_output->>'compat_source' IS DISTINCT FROM
              'supplier_purchase_batch_review'
            OR v_current_compat_version IS DISTINCT FROM v_task_batch_version
          )
        )
      THEN
        RAISE EXCEPTION USING
          ERRCODE = 'P0001',
          MESSAGE = 'SUPPLIER_IDEMPOTENCY_CONFLICT';
      END IF;

      v_stored_canonical_request := pg_catalog.jsonb_set(
        v_workflow_request,
        '{output}',
        COALESCE(v_workflow_request->'output', '{}'::jsonb) -
          'compat_source' - 'compat_expected_version'
      );
      v_current_canonical_request := pg_catalog.jsonb_set(
        v_replay_request,
        '{output}',
        COALESCE(v_replay_request->'output', '{}'::jsonb) -
          'compat_source' - 'compat_expected_version'
      );
      IF v_stored_canonical_request IS DISTINCT FROM
        v_current_canonical_request
      THEN
        RAISE EXCEPTION USING
          ERRCODE = 'P0001',
          MESSAGE = 'SUPPLIER_IDEMPOTENCY_CONFLICT';
      END IF;
      RETURN COALESCE(
        v_event.request->'workflow_task_result',
        v_event.result
      ) || pg_catalog.jsonb_build_object('idempotent', true);
    ELSIF FOUND THEN
      -- A pure legacy event retains the Task 8 adoption/replay behavior.
      RETURN public.__gooes_complete_supplier_purchase_batch_workflow_task_v1(
        p_tenant_id, p_batch_id, p_task_id, p_action, p_reason, p_output,
        p_actor_user_id, p_actor_employee_id, p_idempotency_key
      );
    ELSE
      SELECT
        CASE
          WHEN COALESCE(instance.context->>'approval_round', '') ~ '^[0-9]+$'
            THEN (instance.context->>'approval_round')::integer
          ELSE NULL
        END,
        batch.approval_round
      INTO v_instance_round, v_batch_round
      FROM public.workflow_tasks AS task
      JOIN public.workflow_instances AS instance
        ON instance.id = task.instance_id
       AND instance.tenant_id = task.tenant_id
      JOIN public.supplier_purchase_batches AS batch
        ON batch.id = p_batch_id
       AND batch.tenant_id = task.tenant_id
      WHERE task.id = p_task_id
        AND task.tenant_id = p_tenant_id
        AND instance.subject_type = 'supplier_purchase_batch'
        AND instance.subject_id = p_batch_id::text;

      IF v_instance_round IS NOT NULL
        AND v_instance_round IS DISTINCT FROM v_batch_round
      THEN
        RAISE EXCEPTION USING
          ERRCODE = 'P0001',
          MESSAGE = 'SUPPLIER_PURCHASE_BATCH_APPROVAL_ROUND_STALE';
      END IF;
    END IF;
  END IF;

  RETURN public.__gooes_complete_supplier_purchase_batch_workflow_task_v1(
    p_tenant_id,
    p_batch_id,
    p_task_id,
    p_action,
    p_reason,
    p_output,
    p_actor_user_id,
    p_actor_employee_id,
    p_idempotency_key
  );
END;
$$;

REVOKE ALL ON FUNCTION public.complete_supplier_purchase_batch_workflow_task(
  uuid, uuid, uuid, text, text, jsonb, uuid, uuid, text
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.complete_supplier_purchase_batch_workflow_task(
  uuid, uuid, uuid, text, text, jsonb, uuid, uuid, text
) TO service_role;

COMMIT;
