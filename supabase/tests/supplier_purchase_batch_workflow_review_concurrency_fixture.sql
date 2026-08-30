\set ON_ERROR_STOP on

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

DO $roles$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM unnest(ARRAY['anon', 'authenticated', 'service_role']) AS required(role_name)
    WHERE NOT EXISTS (
      SELECT 1 FROM pg_roles WHERE rolname = required.role_name
    )
  ) THEN
    RAISE EXCEPTION
      'supplier purchase batch workflow review fixture requires Supabase roles';
  END IF;
END
$roles$;

CREATE TABLE public.workflow_instances (
  id uuid PRIMARY KEY, tenant_id uuid NOT NULL, definition_id uuid NOT NULL,
  version_id uuid NOT NULL, subject_type text NOT NULL, subject_id text NOT NULL,
  status text NOT NULL, current_node_id uuid, current_node_key text,
  current_node_snapshot jsonb, context jsonb NOT NULL DEFAULT '{}'::jsonb,
  completed_by uuid, completed_at timestamptz
);
CREATE TABLE public.workflow_tasks (
  id uuid PRIMARY KEY, tenant_id uuid NOT NULL, instance_id uuid NOT NULL,
  instance_node_id uuid, definition_id uuid NOT NULL, version_id uuid NOT NULL,
  node_id uuid NOT NULL, node_key text NOT NULL, node_type text NOT NULL,
  title text NOT NULL, status text NOT NULL, assignee_employee_id uuid,
  assignee_role_code text, assignee_permission_code text,
  completed_by uuid, completed_at timestamptz
);
CREATE TABLE public.workflow_instance_nodes (
  id uuid PRIMARY KEY, tenant_id uuid NOT NULL, instance_id uuid NOT NULL,
  status text NOT NULL, output jsonb, completed_by uuid, completed_at timestamptz
);
CREATE TABLE public.supplier_purchase_batches (
  id uuid PRIMARY KEY, tenant_id uuid NOT NULL, project_id uuid NOT NULL,
  status text NOT NULL, version integer NOT NULL, approval_round integer NOT NULL,
  budget_status text NOT NULL, submitted_by_employee_id uuid,
  split_generation integer NOT NULL DEFAULT 1
);
CREATE TABLE public.supplier_purchase_batch_command_events (
  tenant_id uuid NOT NULL, purchase_batch_id uuid NOT NULL,
  command_type text NOT NULL, idempotency_key text NOT NULL,
  request_fingerprint text NOT NULL, request jsonb NOT NULL,
  result jsonb NOT NULL, result_version integer NOT NULL,
  actor_user_id uuid, actor_employee_id uuid,
  PRIMARY KEY (tenant_id, purchase_batch_id, command_type, idempotency_key)
);
CREATE TABLE public.workflow_subject_states (
  tenant_id uuid NOT NULL, subject_type text NOT NULL, subject_id text NOT NULL,
  definition_id uuid NOT NULL, instance_id uuid NOT NULL,
  instance_status text NOT NULL, current_node_key text,
  current_node_title text, current_business_kind text,
  pending_task_count integer NOT NULL,
  PRIMARY KEY (tenant_id, subject_type, subject_id)
);
CREATE TABLE public.workflow_transition_logs (
  tenant_id uuid, instance_id uuid, definition_id uuid, version_id uuid,
  source_node_id uuid, source_node_key text, target_node_id uuid,
  target_node_key text, edge_id uuid, action text, context jsonb,
  actor_employee_id uuid
);
CREATE TABLE public.tenant_supplier_settings (
  tenant_id uuid PRIMARY KEY, module_enabled boolean NOT NULL,
  procurement_snapshot_v1_enabled boolean NOT NULL,
  purchase_batch_workflow_enabled boolean NOT NULL
);
CREATE TABLE public.roles (
  id uuid PRIMARY KEY, tenant_id uuid, code text, status text
);
CREATE TABLE public.employee_roles (employee_id uuid, role_id uuid);
CREATE TABLE public.project_cost_commitments (
  id uuid PRIMARY KEY, tenant_id uuid NOT NULL, project_id uuid NOT NULL,
  status text NOT NULL
);

CREATE FUNCTION public.assert_supplier_purchase_order_actor(uuid, uuid, uuid)
RETURNS void LANGUAGE plpgsql AS $$ BEGIN RETURN; END $$;
CREATE FUNCTION public.__gooes_employee_has_project_permission_scope(
  uuid, uuid, uuid, text
) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
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
  INSERT INTO public.supplier_purchase_batch_command_events VALUES (
    p_tenant_id, p_batch_id, p_command_type, p_idempotency_key,
    p_fingerprint, p_request, p_result || jsonb_build_object('idempotent', false),
    p_result_version, p_actor_user_id, p_actor_employee_id
  );
  RETURN p_result || jsonb_build_object('idempotent', false);
END
$$;

CREATE FUNCTION public.review_supplier_purchase_batch(
  p_batch_id uuid, p_tenant_id uuid, p_expected_version integer,
  p_action text, p_remark text, p_can_override_budget boolean,
  p_actor_user_id uuid, p_actor_employee_id uuid, p_idempotency_key text
) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  v_batch public.supplier_purchase_batches%ROWTYPE;
  v_event public.supplier_purchase_batch_command_events%ROWTYPE;
  v_request jsonb;
  v_fingerprint text;
  v_result jsonb;
BEGIN
  v_request := jsonb_build_object(
    'tenant_id', p_tenant_id, 'batch_id', p_batch_id,
    'expected_version', p_expected_version, 'action', p_action,
    'remark', p_remark, 'can_override_budget', p_can_override_budget,
    'actor_user_id', p_actor_user_id,
    'actor_employee_id', p_actor_employee_id
  );
  v_fingerprint := encode(extensions.digest(
    convert_to((v_request - 'can_override_budget')::text, 'UTF8'), 'sha256'
  ), 'hex');
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'supplier-purchase-batch-command:' || p_tenant_id::text || ':' ||
      p_batch_id::text || ':review:' || p_idempotency_key,
    6720240826142000
  ));
  SELECT * INTO v_event FROM public.supplier_purchase_batch_command_events
  WHERE tenant_id = p_tenant_id AND purchase_batch_id = p_batch_id
    AND command_type = 'review' AND idempotency_key = p_idempotency_key
  FOR UPDATE;
  IF FOUND THEN
    IF v_event.request_fingerprint IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION 'SUPPLIER_IDEMPOTENCY_CONFLICT' USING ERRCODE = 'P0001';
    END IF;
    RETURN v_event.result || jsonb_build_object('idempotent', true);
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'supplier-purchase-batch-id:' || p_batch_id::text, 6720240826142000
  ));
  SELECT * INTO v_batch FROM public.supplier_purchase_batches
  WHERE id = p_batch_id AND tenant_id = p_tenant_id FOR UPDATE;
  IF v_batch.version <> p_expected_version OR v_batch.status <> 'pending_approval' THEN
    RAISE EXCEPTION 'SUPPLIER_PURCHASE_BATCH_STATE_CONFLICT' USING ERRCODE = 'P0001';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'test-project-budget:' || p_tenant_id::text || ':' || v_batch.project_id::text,
    6720240826142000
  ));
  PERFORM id FROM public.project_cost_commitments
  WHERE tenant_id = p_tenant_id AND project_id = v_batch.project_id
  ORDER BY id FOR UPDATE;
  UPDATE public.supplier_purchase_batches
  SET status = CASE p_action WHEN 'approve' THEN 'ordered' ELSE 'rejected' END,
    version = version + 1
  WHERE id = p_batch_id RETURNING * INTO v_batch;
  v_result := jsonb_build_object(
    'status', v_batch.status, 'batch', to_jsonb(v_batch),
    'version', v_batch.version
  );
  RETURN public.record_supplier_purchase_batch_command_result(
    p_tenant_id, p_batch_id, 'review', p_idempotency_key, v_fingerprint,
    v_request, p_actor_user_id, p_actor_employee_id, v_result, v_batch.version
  );
END
$$;

CREATE FUNCTION public.complete_workflow_instance_node(
  p_tenant_id uuid, p_definition_id uuid, p_instance_id uuid,
  p_node_key text, p_action text, p_output jsonb, p_actor_employee_id uuid
) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  v_instance public.workflow_instances%ROWTYPE;
  v_target_key text;
  v_target_type text;
  v_task jsonb := 'null'::jsonb;
  v_task_id uuid;
  v_target_node_id uuid := gen_random_uuid();
BEGIN
  SELECT * INTO v_instance FROM public.workflow_instances
  WHERE id = p_instance_id FOR UPDATE;
  v_target_key := CASE
    WHEN p_output->>'force_bad_graph' = 'true' THEN 'wrong_end'
    WHEN p_action = 'reject' THEN 'rejected_end'
    WHEN p_node_key = 'purchase_review'
      AND p_output->>'budget_status' = 'over_budget' THEN 'finance_review'
    ELSE 'approved_end'
  END;
  v_target_type := CASE WHEN v_target_key = 'finance_review'
    THEN 'approval' ELSE 'end' END;
  UPDATE public.workflow_tasks SET status = 'completed',
    completed_by = p_actor_employee_id, completed_at = now()
  WHERE tenant_id = p_tenant_id AND instance_id = p_instance_id
    AND status = 'pending';
  IF v_target_type = 'approval' THEN
    v_task_id := gen_random_uuid();
    INSERT INTO public.workflow_tasks (
      id, tenant_id, instance_id, definition_id, version_id, node_id,
      node_key, node_type, title, status
    ) VALUES (
      v_task_id, p_tenant_id, p_instance_id, p_definition_id,
      v_instance.version_id, v_target_node_id, v_target_key,
      'approval', '财务审批', 'pending'
    );
    SELECT to_jsonb(task) INTO v_task FROM public.workflow_tasks AS task
    WHERE task.id = v_task_id;
  END IF;
  UPDATE public.workflow_instances SET
    status = CASE WHEN v_target_type = 'end' THEN 'completed' ELSE 'running' END,
    current_node_id = v_target_node_id,
    current_node_key = v_target_key,
    current_node_snapshot = jsonb_build_object(
      'node_key', v_target_key, 'node_type', v_target_type,
      'title', v_target_key
    )
  WHERE id = p_instance_id RETURNING * INTO v_instance;
  RETURN jsonb_build_object(
    'ok', true, 'instance', to_jsonb(v_instance),
    'next_node', jsonb_build_object(
      'node_key', v_target_key, 'node_type', v_target_type
    ),
    'task', v_task
  );
END
$$;

CREATE FUNCTION public.test_seed_workflow_review(
  p_batch_id uuid, p_instance_id uuid, p_task_id uuid,
  p_tenant_id uuid, p_project_id uuid, p_submitter_id uuid,
  p_budget_status text DEFAULT 'within_budget',
  p_node_key text DEFAULT 'purchase_review'
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_definition_id uuid := gen_random_uuid();
  v_version_id uuid := gen_random_uuid();
  v_node_id uuid := gen_random_uuid();
  v_node_run_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO public.tenant_supplier_settings VALUES (p_tenant_id, true, true, true)
  ON CONFLICT (tenant_id) DO NOTHING;
  INSERT INTO public.supplier_purchase_batches VALUES (
    p_batch_id, p_tenant_id, p_project_id, 'pending_approval', 2, 1,
    p_budget_status, p_submitter_id, 1
  );
  INSERT INTO public.workflow_instances VALUES (
    p_instance_id, p_tenant_id, v_definition_id, v_version_id,
    'supplier_purchase_batch', p_batch_id::text, 'running', v_node_id,
    p_node_key, jsonb_build_object(
      'node_key', p_node_key, 'node_type', 'approval', 'title', p_node_key
    ), jsonb_build_object(
      'batch_version', 2, 'approval_round', 1,
      'budget_status', p_budget_status, 'project_id', p_project_id,
      'submitted_by_employee_id', p_submitter_id
    ), NULL, NULL
  );
  INSERT INTO public.workflow_instance_nodes VALUES (
    v_node_run_id, p_tenant_id, p_instance_id, 'running', '{}'::jsonb, NULL, NULL
  );
  INSERT INTO public.workflow_tasks VALUES (
    p_task_id, p_tenant_id, p_instance_id, v_node_run_id, v_definition_id,
    v_version_id, v_node_id, p_node_key, 'approval', p_node_key, 'pending',
    NULL, NULL, NULL, NULL, NULL
  );
END
$$;
