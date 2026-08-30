\set ON_ERROR_STOP on

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE TABLE public.workflow_instances (
  id uuid PRIMARY KEY, tenant_id uuid NOT NULL, definition_id uuid NOT NULL,
  version_id uuid NOT NULL, subject_type text NOT NULL, subject_id text NOT NULL,
  status text NOT NULL, context jsonb NOT NULL, current_node_id uuid,
  current_node_key text, current_node_snapshot jsonb, completed_by uuid,
  completed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.workflow_tasks (
  id uuid PRIMARY KEY, tenant_id uuid NOT NULL, instance_id uuid NOT NULL,
  definition_id uuid NOT NULL, version_id uuid NOT NULL, node_id uuid NOT NULL,
  node_key text NOT NULL, node_type text NOT NULL, status text NOT NULL,
  completed_by uuid, completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.workflow_instance_nodes (
  id uuid PRIMARY KEY, tenant_id uuid NOT NULL, instance_id uuid NOT NULL,
  status text NOT NULL, output jsonb NOT NULL DEFAULT '{}'::jsonb,
  completed_by uuid, completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.supplier_purchase_batches (
  id uuid PRIMARY KEY, tenant_id uuid NOT NULL, project_id uuid NOT NULL,
  status text NOT NULL, version integer NOT NULL, approval_round integer NOT NULL,
  budget_checked_at timestamptz, budget_status text NOT NULL,
  budget_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  submitted_by_employee_id uuid, split_generation integer NOT NULL DEFAULT 1,
  updated_by_employee_id uuid, updated_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by_employee_id uuid, reviewed_at timestamptz, review_remark text
);
CREATE TABLE public.supplier_purchase_batch_items (
  id uuid PRIMARY KEY, tenant_id uuid NOT NULL, purchase_batch_id uuid NOT NULL
);
CREATE TABLE public.supplier_purchase_batch_command_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL,
  purchase_batch_id uuid NOT NULL, command_type text NOT NULL,
  idempotency_key text NOT NULL, request_fingerprint text NOT NULL,
  request jsonb NOT NULL, actor_user_id uuid NOT NULL,
  actor_employee_id uuid NOT NULL, result jsonb NOT NULL,
  result_version integer NOT NULL,
  CONSTRAINT supplier_purchase_batch_events_command_check CHECK (
    command_type IN ('save_draft', 'submit', 'review', 'cancel')
  ),
  UNIQUE (tenant_id, purchase_batch_id, command_type, idempotency_key)
);
CREATE TABLE public.workflow_subject_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL,
  subject_type text NOT NULL, subject_id text NOT NULL, definition_id uuid,
  instance_id uuid, instance_status text, current_node_key text,
  current_node_title text, current_business_kind text,
  pending_task_count integer NOT NULL DEFAULT 0,
  UNIQUE (tenant_id, subject_type, subject_id)
);
CREATE TABLE public.workflow_transition_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL,
  instance_id uuid NOT NULL, definition_id uuid NOT NULL, version_id uuid NOT NULL,
  source_node_id uuid, source_node_key text, target_node_id uuid,
  target_node_key text, edge_id uuid, action text NOT NULL, context jsonb,
  actor_employee_id uuid
);
CREATE TABLE public.tenant_supplier_settings (
  tenant_id uuid PRIMARY KEY, module_enabled boolean NOT NULL,
  procurement_snapshot_v1_enabled boolean NOT NULL,
  purchase_batch_workflow_enabled boolean NOT NULL
);
CREATE TABLE public.project_cost_commitments (
  id uuid PRIMARY KEY, tenant_id uuid NOT NULL, project_id uuid NOT NULL,
  source_id uuid NOT NULL, cost_category_id uuid NOT NULL, status text NOT NULL,
  released_by_employee_id uuid, released_at timestamptz, release_reason text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.supplier_purchase_requisitions (
  id uuid PRIMARY KEY, tenant_id uuid NOT NULL, purchase_batch_id uuid NOT NULL,
  tenant_supplier_id uuid NOT NULL, split_generation integer NOT NULL,
  purchase_order_id uuid, status text NOT NULL, version integer NOT NULL,
  cancelled_by_employee_id uuid, cancelled_at timestamptz, cancel_reason text,
  updated_by_employee_id uuid, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.supplier_purchase_orders (
  id uuid PRIMARY KEY, tenant_id uuid NOT NULL, tenant_supplier_id uuid NOT NULL
);
CREATE TABLE public.test_permission_scopes (
  employee_id uuid NOT NULL, project_id uuid NOT NULL, permission text NOT NULL,
  PRIMARY KEY (employee_id, project_id, permission)
);

CREATE FUNCTION public.assert_supplier_purchase_order_actor(uuid, uuid, uuid)
RETURNS void LANGUAGE plpgsql AS $$ BEGIN RETURN; END $$;
CREATE FUNCTION public.__gooes_employee_has_project_permission_scope(
  uuid, uuid, uuid, text
) RETURNS boolean LANGUAGE sql AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.test_permission_scopes
    WHERE employee_id = $2 AND project_id = $3 AND permission = $4
  )
$$;
CREATE FUNCTION public.supplier_purchase_batch_to_jsonb(
  public.supplier_purchase_batches
) RETURNS jsonb LANGUAGE sql AS $$ SELECT to_jsonb($1) $$;
CREATE FUNCTION public.record_supplier_purchase_batch_command_result(
  p_tenant_id uuid, p_batch_id uuid, p_command_type text,
  p_idempotency_key text, p_fingerprint text, p_request jsonb,
  p_actor_user_id uuid, p_actor_employee_id uuid, p_result jsonb,
  p_result_version integer
) RETURNS jsonb LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.supplier_purchase_batch_command_events(
    tenant_id, purchase_batch_id, command_type, idempotency_key,
    request_fingerprint, request, actor_user_id, actor_employee_id,
    result, result_version
  ) VALUES (
    p_tenant_id, p_batch_id, p_command_type, p_idempotency_key,
    p_fingerprint, p_request, p_actor_user_id, p_actor_employee_id,
    p_result, p_result_version
  );
  RETURN p_result;
END
$$;

CREATE FUNCTION public.save_supplier_purchase_batch_draft(
  p_batch_id uuid, p_tenant_id uuid, p_project_id uuid,
  p_expected_version integer, p_reason text, p_expected_delivery_date date,
  p_remark text, p_items jsonb, p_actor_user_id uuid,
  p_actor_employee_id uuid, p_idempotency_key text
) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE v_batch public.supplier_purchase_batches%ROWTYPE; v_result jsonb;
BEGIN
  IF p_reason = 'fixture-raise' THEN RAISE EXCEPTION 'FIXTURE_SAVE_RAISED'; END IF;
  SELECT * INTO v_batch FROM public.supplier_purchase_batches
  WHERE id = p_batch_id AND tenant_id = p_tenant_id FOR UPDATE;
  IF v_batch.status <> 'draft' THEN
    RETURN jsonb_build_object('status', 'state_conflict',
      'error_code', 'SUPPLIER_PURCHASE_BATCH_STATE_CONFLICT',
      'version', v_batch.version, 'idempotent', false);
  END IF;
  IF p_reason = 'fixture-non-saved' THEN
    v_result := jsonb_build_object('status', 'state_conflict',
      'error_code', 'SUPPLIER_PURCHASE_BATCH_STATE_CONFLICT',
      'version', v_batch.version, 'idempotent', false);
  ELSE
    UPDATE public.supplier_purchase_batches SET version = version + 1
    WHERE id = p_batch_id RETURNING * INTO v_batch;
    v_result := jsonb_build_object('status', 'saved', 'idempotent', false,
      'batch', to_jsonb(v_batch), 'split_preview', '[]'::jsonb,
      'version', v_batch.version);
  END IF;
  RETURN public.record_supplier_purchase_batch_command_result(
    p_tenant_id, p_batch_id, 'save_draft', p_idempotency_key,
    encode(extensions.digest(convert_to(jsonb_build_object(
      'tenant_id', p_tenant_id, 'batch_id', p_batch_id,
      'project_id', p_project_id, 'expected_version', p_expected_version,
      'reason', btrim(p_reason), 'expected_delivery_date', p_expected_delivery_date,
      'remark', p_remark, 'items', p_items, 'actor_user_id', p_actor_user_id,
      'actor_employee_id', p_actor_employee_id)::text, 'UTF8'), 'sha256'), 'hex'),
    jsonb_build_object('fixture', true), p_actor_user_id, p_actor_employee_id,
    v_result, v_batch.version
  );
END
$$;

CREATE FUNCTION public.cancel_supplier_purchase_batch(
  p_batch_id uuid, p_tenant_id uuid, p_expected_version integer,
  p_reason text, p_actor_user_id uuid, p_actor_employee_id uuid,
  p_idempotency_key text
) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE v_batch public.supplier_purchase_batches%ROWTYPE;
BEGIN
  SELECT * INTO v_batch FROM public.supplier_purchase_batches
  WHERE id = p_batch_id AND tenant_id = p_tenant_id FOR UPDATE;
  IF v_batch.status <> 'draft' THEN
    RETURN jsonb_build_object('status', 'state_conflict',
      'error_code', 'SUPPLIER_PURCHASE_BATCH_STATE_CONFLICT',
      'version', v_batch.version, 'idempotent', false);
  END IF;
  UPDATE public.supplier_purchase_batches
  SET status = 'cancelled', version = version + 1
  WHERE id = p_batch_id RETURNING * INTO v_batch;
  RETURN jsonb_build_object('status', 'cancelled', 'idempotent', false,
    'batch', to_jsonb(v_batch), 'version', v_batch.version);
END
$$;

CREATE FUNCTION public.complete_supplier_purchase_batch_workflow_task(
  uuid, uuid, uuid, text, text, jsonb, uuid, uuid, text
) RETURNS jsonb LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'WORKFLOW_TASK_NOT_PENDING';
END
$$;

CREATE FUNCTION public.test_seed_withdraw(
  p_batch_id uuid, p_instance_id uuid, p_task_id uuid, p_node_run_id uuid,
  p_item_id uuid, p_requisition_id uuid, p_commitment_id uuid,
  p_tenant_id uuid, p_project_id uuid, p_submitter_id uuid,
  p_node_key text DEFAULT 'purchase_review'
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_definition_id uuid := gen_random_uuid();
  v_version_id uuid := gen_random_uuid();
  v_node_id uuid := gen_random_uuid();
  v_supplier_id uuid := gen_random_uuid();
  v_category_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO public.tenant_supplier_settings VALUES (
    p_tenant_id, true, true, true
  ) ON CONFLICT (tenant_id) DO NOTHING;
  INSERT INTO public.test_permission_scopes VALUES
    (p_submitter_id, p_project_id, 'supplier.purchase-requisition.manage'),
    (p_submitter_id, p_project_id, 'project.update')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.supplier_purchase_batches VALUES (
    p_batch_id, p_tenant_id, p_project_id, 'pending_approval', 2, 1,
    now(), 'within_budget', '{}'::jsonb, p_submitter_id, 1,
    p_submitter_id, now(), NULL, NULL, NULL
  );
  INSERT INTO public.supplier_purchase_batch_items VALUES (
    p_item_id, p_tenant_id, p_batch_id
  );
  INSERT INTO public.workflow_instances VALUES (
    p_instance_id, p_tenant_id, v_definition_id, v_version_id,
    'supplier_purchase_batch', p_batch_id::text, 'running',
    jsonb_build_object('approval_round', 1, 'batch_version', 2,
      'submitted_by_employee_id', p_submitter_id),
    v_node_id, p_node_key, jsonb_build_object('title', p_node_key),
    NULL, NULL, now(), now()
  );
  INSERT INTO public.workflow_tasks VALUES (
    p_task_id, p_tenant_id, p_instance_id, v_definition_id, v_version_id,
    v_node_id, p_node_key, 'approval', 'pending', NULL, NULL, now(), now()
  );
  INSERT INTO public.workflow_instance_nodes VALUES (
    p_node_run_id, p_tenant_id, p_instance_id, 'running', '{}'::jsonb,
    NULL, NULL, now()
  );
  INSERT INTO public.supplier_purchase_requisitions VALUES (
    p_requisition_id, p_tenant_id, p_batch_id, v_supplier_id, 1,
    NULL, 'pending_approval', 1, NULL, NULL, NULL, p_submitter_id, now()
  );
  INSERT INTO public.project_cost_commitments VALUES (
    p_commitment_id, p_tenant_id, p_project_id, p_requisition_id,
    v_category_id, 'reserved', NULL, NULL, NULL, now()
  );
  INSERT INTO public.workflow_subject_states(
    tenant_id, subject_type, subject_id, definition_id, instance_id,
    instance_status, current_node_key, current_node_title,
    pending_task_count
  ) VALUES (
    p_tenant_id, 'supplier_purchase_batch', p_batch_id::text,
    v_definition_id, p_instance_id, 'running', p_node_key, p_node_key, 1
  );
END
$$;
