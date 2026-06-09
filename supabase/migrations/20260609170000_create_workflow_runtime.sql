CREATE TABLE IF NOT EXISTS public.workflow_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  definition_id uuid NOT NULL,
  version_id uuid NOT NULL,
  subject_type text NOT NULL,
  subject_id text NOT NULL,
  status text NOT NULL DEFAULT 'running',
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  current_node_id uuid NULL,
  current_node_key text NULL,
  current_node_snapshot jsonb NULL,
  started_by uuid NULL REFERENCES public.employees(id) ON DELETE SET NULL,
  completed_by uuid NULL REFERENCES public.employees(id) ON DELETE SET NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT workflow_instances_subject_type_check CHECK (
    subject_type IN ('manual', 'customer', 'project', 'expense_request', 'procedure')
  ),
  CONSTRAINT workflow_instances_subject_id_not_blank CHECK (btrim(subject_id) <> ''),
  CONSTRAINT workflow_instances_status_check CHECK (
    status IN ('running', 'completed', 'canceled', 'failed')
  ),
  CONSTRAINT workflow_instances_context_object_check CHECK (jsonb_typeof(context) = 'object'),
  CONSTRAINT workflow_instances_current_node_snapshot_object_check CHECK (
    current_node_snapshot IS NULL OR jsonb_typeof(current_node_snapshot) = 'object'
  ),
  CONSTRAINT workflow_instances_definition_tenant_fkey FOREIGN KEY (definition_id, tenant_id)
    REFERENCES public.workflow_definitions(id, tenant_id)
    ON DELETE CASCADE,
  CONSTRAINT workflow_instances_version_definition_fkey FOREIGN KEY (version_id, definition_id)
    REFERENCES public.workflow_versions(id, definition_id)
    ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_workflow_instances_active_subject
ON public.workflow_instances(tenant_id, definition_id, subject_type, subject_id)
WHERE status = 'running';

CREATE INDEX IF NOT EXISTS idx_workflow_instances_tenant_definition_updated
ON public.workflow_instances(tenant_id, definition_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_workflow_instances_tenant_subject
ON public.workflow_instances(tenant_id, subject_type, subject_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.workflow_instance_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  instance_id uuid NOT NULL REFERENCES public.workflow_instances(id) ON DELETE CASCADE,
  definition_id uuid NOT NULL,
  version_id uuid NOT NULL,
  node_id uuid NOT NULL,
  node_key text NOT NULL,
  node_type text NOT NULL,
  node_snapshot jsonb NOT NULL,
  status text NOT NULL DEFAULT 'running',
  input jsonb NOT NULL DEFAULT '{}'::jsonb,
  output jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_by uuid NULL REFERENCES public.employees(id) ON DELETE SET NULL,
  completed_by uuid NULL REFERENCES public.employees(id) ON DELETE SET NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT workflow_instance_nodes_status_check CHECK (
    status IN ('running', 'completed', 'canceled', 'failed')
  ),
  CONSTRAINT workflow_instance_nodes_key_not_blank CHECK (btrim(node_key) <> ''),
  CONSTRAINT workflow_instance_nodes_type_check CHECK (
    node_type IN (
      'start',
      'end',
      'business',
      'construction_stage',
      'procedure',
      'approval',
      'confirmation',
      'notification',
      'automation',
      'subflow'
    )
  ),
  CONSTRAINT workflow_instance_nodes_snapshot_object_check CHECK (jsonb_typeof(node_snapshot) = 'object'),
  CONSTRAINT workflow_instance_nodes_input_object_check CHECK (jsonb_typeof(input) = 'object'),
  CONSTRAINT workflow_instance_nodes_output_object_check CHECK (jsonb_typeof(output) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_workflow_instance_nodes_instance_created
ON public.workflow_instance_nodes(instance_id, created_at);

CREATE INDEX IF NOT EXISTS idx_workflow_instance_nodes_tenant_status
ON public.workflow_instance_nodes(tenant_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.workflow_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  instance_id uuid NOT NULL REFERENCES public.workflow_instances(id) ON DELETE CASCADE,
  instance_node_id uuid NULL REFERENCES public.workflow_instance_nodes(id) ON DELETE CASCADE,
  definition_id uuid NOT NULL,
  version_id uuid NOT NULL,
  node_id uuid NOT NULL,
  node_key text NOT NULL,
  node_type text NOT NULL,
  title text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  assignee_employee_id uuid NULL REFERENCES public.employees(id) ON DELETE SET NULL,
  assignee_role_code text NULL,
  due_at timestamptz NULL,
  completed_by uuid NULL REFERENCES public.employees(id) ON DELETE SET NULL,
  completed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT workflow_tasks_status_check CHECK (status IN ('pending', 'completed', 'canceled')),
  CONSTRAINT workflow_tasks_key_not_blank CHECK (btrim(node_key) <> ''),
  CONSTRAINT workflow_tasks_title_not_blank CHECK (btrim(title) <> '')
);

CREATE INDEX IF NOT EXISTS idx_workflow_tasks_tenant_status_updated
ON public.workflow_tasks(tenant_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_workflow_tasks_instance_status
ON public.workflow_tasks(instance_id, status, created_at);

CREATE TABLE IF NOT EXISTS public.workflow_transition_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  instance_id uuid NOT NULL REFERENCES public.workflow_instances(id) ON DELETE CASCADE,
  definition_id uuid NOT NULL,
  version_id uuid NOT NULL,
  source_node_id uuid NULL,
  source_node_key text NULL,
  target_node_id uuid NULL,
  target_node_key text NULL,
  edge_id uuid NULL,
  action text NOT NULL,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_employee_id uuid NULL REFERENCES public.employees(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT workflow_transition_logs_action_not_blank CHECK (btrim(action) <> ''),
  CONSTRAINT workflow_transition_logs_context_object_check CHECK (jsonb_typeof(context) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_workflow_transition_logs_instance_created
ON public.workflow_transition_logs(instance_id, created_at);

CREATE INDEX IF NOT EXISTS idx_workflow_transition_logs_tenant_definition_created
ON public.workflow_transition_logs(tenant_id, definition_id, created_at DESC);

DROP TRIGGER IF EXISTS tr_workflow_instances_updated_at ON public.workflow_instances;
CREATE TRIGGER tr_workflow_instances_updated_at
BEFORE UPDATE ON public.workflow_instances
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS tr_workflow_instance_nodes_updated_at ON public.workflow_instance_nodes;
CREATE TRIGGER tr_workflow_instance_nodes_updated_at
BEFORE UPDATE ON public.workflow_instance_nodes
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS tr_workflow_tasks_updated_at ON public.workflow_tasks;
CREATE TRIGGER tr_workflow_tasks_updated_at
BEFORE UPDATE ON public.workflow_tasks
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE FUNCTION public.start_workflow_instance(
  p_tenant_id uuid,
  p_definition_id uuid,
  p_subject_type text,
  p_subject_id text,
  p_context jsonb,
  p_started_by uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_definition public.workflow_definitions%ROWTYPE;
  v_version public.workflow_versions%ROWTYPE;
  v_instance public.workflow_instances%ROWTYPE;
  v_start_node jsonb;
  v_target_node jsonb;
  v_start_edge jsonb;
  v_start_node_run public.workflow_instance_nodes%ROWTYPE;
  v_target_node_run public.workflow_instance_nodes%ROWTYPE;
  v_task public.workflow_tasks%ROWTYPE;
  v_context jsonb := COALESCE(p_context, '{}'::jsonb);
BEGIN
  IF jsonb_typeof(v_context) <> 'object' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_context');
  END IF;

  SELECT *
  INTO v_definition
  FROM public.workflow_definitions
  WHERE id = p_definition_id
    AND tenant_id = p_tenant_id
    AND status = 'active'
  FOR UPDATE;

  IF NOT FOUND OR v_definition.active_version_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'active_version_not_found');
  END IF;

  SELECT *
  INTO v_version
  FROM public.workflow_versions
  WHERE id = v_definition.active_version_id
    AND definition_id = p_definition_id
    AND tenant_id = p_tenant_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'active_version_not_found');
  END IF;

  SELECT node
  INTO v_start_node
  FROM jsonb_array_elements(COALESCE(v_version.snapshot->'nodes', '[]'::jsonb)) AS node
  WHERE node->>'node_type' = 'start'
  LIMIT 1;

  IF v_start_node IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'graph_invalid');
  END IF;

  SELECT edge
  INTO v_start_edge
  FROM jsonb_array_elements(COALESCE(v_version.snapshot->'edges', '[]'::jsonb)) AS edge
  WHERE edge->>'source_node_id' = v_start_node->>'id'
  ORDER BY COALESCE((edge->>'priority')::integer, 100), edge->>'created_at'
  LIMIT 1;

  IF v_start_edge IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'graph_invalid');
  END IF;

  SELECT node
  INTO v_target_node
  FROM jsonb_array_elements(COALESCE(v_version.snapshot->'nodes', '[]'::jsonb)) AS node
  WHERE node->>'id' = v_start_edge->>'target_node_id'
  LIMIT 1;

  IF v_target_node IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'graph_invalid');
  END IF;

  INSERT INTO public.workflow_instances (
    tenant_id,
    definition_id,
    version_id,
    subject_type,
    subject_id,
    status,
    context,
    current_node_id,
    current_node_key,
    current_node_snapshot,
    started_by,
    completed_by,
    completed_at
  )
  VALUES (
    p_tenant_id,
    p_definition_id,
    v_version.id,
    p_subject_type,
    p_subject_id,
    CASE WHEN v_target_node->>'node_type' = 'end' THEN 'completed' ELSE 'running' END,
    v_context,
    (v_target_node->>'id')::uuid,
    v_target_node->>'node_key',
    v_target_node,
    p_started_by,
    CASE WHEN v_target_node->>'node_type' = 'end' THEN p_started_by ELSE NULL END,
    CASE WHEN v_target_node->>'node_type' = 'end' THEN now() ELSE NULL END
  )
  RETURNING *
  INTO v_instance;

  INSERT INTO public.workflow_instance_nodes (
    tenant_id,
    instance_id,
    definition_id,
    version_id,
    node_id,
    node_key,
    node_type,
    node_snapshot,
    status,
    input,
    output,
    started_by,
    completed_by,
    completed_at
  )
  VALUES (
    p_tenant_id,
    v_instance.id,
    p_definition_id,
    v_version.id,
    (v_start_node->>'id')::uuid,
    v_start_node->>'node_key',
    v_start_node->>'node_type',
    v_start_node,
    'completed',
    v_context,
    '{}'::jsonb,
    p_started_by,
    p_started_by,
    now()
  )
  RETURNING *
  INTO v_start_node_run;

  INSERT INTO public.workflow_instance_nodes (
    tenant_id,
    instance_id,
    definition_id,
    version_id,
    node_id,
    node_key,
    node_type,
    node_snapshot,
    status,
    input,
    started_by,
    completed_by,
    completed_at
  )
  VALUES (
    p_tenant_id,
    v_instance.id,
    p_definition_id,
    v_version.id,
    (v_target_node->>'id')::uuid,
    v_target_node->>'node_key',
    v_target_node->>'node_type',
    v_target_node,
    CASE WHEN v_target_node->>'node_type' = 'end' THEN 'completed' ELSE 'running' END,
    v_context,
    p_started_by,
    CASE WHEN v_target_node->>'node_type' = 'end' THEN p_started_by ELSE NULL END,
    CASE WHEN v_target_node->>'node_type' = 'end' THEN now() ELSE NULL END
  )
  RETURNING *
  INTO v_target_node_run;

  IF v_target_node->>'node_type' <> 'end' THEN
    INSERT INTO public.workflow_tasks (
      tenant_id,
      instance_id,
      instance_node_id,
      definition_id,
      version_id,
      node_id,
      node_key,
      node_type,
      title
    )
    VALUES (
      p_tenant_id,
      v_instance.id,
      v_target_node_run.id,
      p_definition_id,
      v_version.id,
      (v_target_node->>'id')::uuid,
      v_target_node->>'node_key',
      v_target_node->>'node_type',
      COALESCE(v_target_node->>'title', v_target_node->>'node_key')
    )
    RETURNING *
    INTO v_task;
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
  )
  VALUES (
    p_tenant_id,
    v_instance.id,
    p_definition_id,
    v_version.id,
    (v_start_node->>'id')::uuid,
    v_start_node->>'node_key',
    (v_target_node->>'id')::uuid,
    v_target_node->>'node_key',
    (v_start_edge->>'id')::uuid,
    'start',
    v_context,
    p_started_by
  );

  RETURN jsonb_build_object(
    'ok', true,
    'instance', to_jsonb(v_instance),
    'current_node', v_target_node,
    'task', CASE WHEN v_task.id IS NULL THEN NULL ELSE to_jsonb(v_task) END
  );
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'running_instance_exists');
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_workflow_instance_node(
  p_tenant_id uuid,
  p_definition_id uuid,
  p_instance_id uuid,
  p_node_key text,
  p_action text,
  p_output jsonb,
  p_actor_employee_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_instance public.workflow_instances%ROWTYPE;
  v_current_node jsonb;
  v_next_node jsonb;
  v_next_edge jsonb;
  v_node_run public.workflow_instance_nodes%ROWTYPE;
  v_next_node_run public.workflow_instance_nodes%ROWTYPE;
  v_task public.workflow_tasks%ROWTYPE;
  v_output jsonb := COALESCE(p_output, '{}'::jsonb);
BEGIN
  IF jsonb_typeof(v_output) <> 'object' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_output');
  END IF;

  SELECT *
  INTO v_instance
  FROM public.workflow_instances
  WHERE id = p_instance_id
    AND tenant_id = p_tenant_id
    AND definition_id = p_definition_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'instance_not_found');
  END IF;

  IF v_instance.status <> 'running' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'instance_not_running');
  END IF;

  IF v_instance.current_node_key IS NULL OR v_instance.current_node_key <> p_node_key THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'node_not_current',
      'current_node_key', v_instance.current_node_key
    );
  END IF;

  v_current_node := v_instance.current_node_snapshot;
  IF v_current_node IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'graph_invalid');
  END IF;

  SELECT *
  INTO v_node_run
  FROM public.workflow_instance_nodes
  WHERE tenant_id = p_tenant_id
    AND instance_id = p_instance_id
    AND node_key = p_node_key
    AND status = 'running'
  ORDER BY started_at DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'node_run_not_found');
  END IF;

  UPDATE public.workflow_instance_nodes
  SET
    status = 'completed',
    output = v_output,
    completed_by = p_actor_employee_id,
    completed_at = now()
  WHERE id = v_node_run.id
  RETURNING *
  INTO v_node_run;

  UPDATE public.workflow_tasks
  SET
    status = 'completed',
    completed_by = p_actor_employee_id,
    completed_at = now()
  WHERE tenant_id = p_tenant_id
    AND instance_id = p_instance_id
    AND instance_node_id = v_node_run.id
    AND status = 'pending';

  SELECT edge
  INTO v_next_edge
  FROM public.workflow_versions version,
       jsonb_array_elements(COALESCE(version.snapshot->'edges', '[]'::jsonb)) AS edge
  WHERE version.id = v_instance.version_id
    AND version.definition_id = p_definition_id
    AND version.tenant_id = p_tenant_id
    AND edge->>'source_node_id' = v_instance.current_node_id::text
  ORDER BY COALESCE((edge->>'priority')::integer, 100), edge->>'created_at'
  LIMIT 1;

  IF v_next_edge IS NULL THEN
    UPDATE public.workflow_instances
    SET
      status = 'completed',
      completed_by = p_actor_employee_id,
      completed_at = now()
    WHERE id = p_instance_id
    RETURNING *
    INTO v_instance;

    RETURN jsonb_build_object(
      'ok', true,
      'instance', to_jsonb(v_instance),
      'completed_node', to_jsonb(v_node_run),
      'next_node', NULL,
      'task', NULL
    );
  END IF;

  SELECT node
  INTO v_next_node
  FROM public.workflow_versions version,
       jsonb_array_elements(COALESCE(version.snapshot->'nodes', '[]'::jsonb)) AS node
  WHERE version.id = v_instance.version_id
    AND version.definition_id = p_definition_id
    AND version.tenant_id = p_tenant_id
    AND node->>'id' = v_next_edge->>'target_node_id'
  LIMIT 1;

  IF v_next_node IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'graph_invalid');
  END IF;

  INSERT INTO public.workflow_instance_nodes (
    tenant_id,
    instance_id,
    definition_id,
    version_id,
    node_id,
    node_key,
    node_type,
    node_snapshot,
    status,
    input,
    started_by,
    completed_by,
    completed_at
  )
  VALUES (
    p_tenant_id,
    p_instance_id,
    p_definition_id,
    v_instance.version_id,
    (v_next_node->>'id')::uuid,
    v_next_node->>'node_key',
    v_next_node->>'node_type',
    v_next_node,
    CASE WHEN v_next_node->>'node_type' = 'end' THEN 'completed' ELSE 'running' END,
    v_output,
    p_actor_employee_id,
    CASE WHEN v_next_node->>'node_type' = 'end' THEN p_actor_employee_id ELSE NULL END,
    CASE WHEN v_next_node->>'node_type' = 'end' THEN now() ELSE NULL END
  )
  RETURNING *
  INTO v_next_node_run;

  IF v_next_node->>'node_type' <> 'end' THEN
    INSERT INTO public.workflow_tasks (
      tenant_id,
      instance_id,
      instance_node_id,
      definition_id,
      version_id,
      node_id,
      node_key,
      node_type,
      title
    )
    VALUES (
      p_tenant_id,
      p_instance_id,
      v_next_node_run.id,
      p_definition_id,
      v_instance.version_id,
      (v_next_node->>'id')::uuid,
      v_next_node->>'node_key',
      v_next_node->>'node_type',
      COALESCE(v_next_node->>'title', v_next_node->>'node_key')
    )
    RETURNING *
    INTO v_task;
  END IF;

  UPDATE public.workflow_instances
  SET
    status = CASE WHEN v_next_node->>'node_type' = 'end' THEN 'completed' ELSE 'running' END,
    current_node_id = (v_next_node->>'id')::uuid,
    current_node_key = v_next_node->>'node_key',
    current_node_snapshot = v_next_node,
    completed_by = CASE WHEN v_next_node->>'node_type' = 'end' THEN p_actor_employee_id ELSE NULL END,
    completed_at = CASE WHEN v_next_node->>'node_type' = 'end' THEN now() ELSE NULL END
  WHERE id = p_instance_id
  RETURNING *
  INTO v_instance;

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
  )
  VALUES (
    p_tenant_id,
    p_instance_id,
    p_definition_id,
    v_instance.version_id,
    (v_current_node->>'id')::uuid,
    v_current_node->>'node_key',
    (v_next_node->>'id')::uuid,
    v_next_node->>'node_key',
    (v_next_edge->>'id')::uuid,
    COALESCE(NULLIF(btrim(p_action), ''), 'complete'),
    v_output,
    p_actor_employee_id
  );

  RETURN jsonb_build_object(
    'ok', true,
    'instance', to_jsonb(v_instance),
    'completed_node', to_jsonb(v_node_run),
    'next_node', v_next_node,
    'task', CASE WHEN v_task.id IS NULL THEN NULL ELSE to_jsonb(v_task) END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.start_workflow_instance(uuid, uuid, text, text, jsonb, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.start_workflow_instance(uuid, uuid, text, text, jsonb, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.start_workflow_instance(uuid, uuid, text, text, jsonb, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.start_workflow_instance(uuid, uuid, text, text, jsonb, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.complete_workflow_instance_node(uuid, uuid, uuid, text, text, jsonb, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_workflow_instance_node(uuid, uuid, uuid, text, text, jsonb, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.complete_workflow_instance_node(uuid, uuid, uuid, text, text, jsonb, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.complete_workflow_instance_node(uuid, uuid, uuid, text, text, jsonb, uuid) TO service_role;

COMMENT ON TABLE public.workflow_instances IS '流程运行实例';
COMMENT ON TABLE public.workflow_instance_nodes IS '流程实例节点运行记录';
COMMENT ON TABLE public.workflow_tasks IS '流程实例待办任务';
COMMENT ON TABLE public.workflow_transition_logs IS '流程实例流转日志';
COMMENT ON FUNCTION public.start_workflow_instance(uuid, uuid, text, text, jsonb, uuid)
IS 'Starts a workflow runtime instance from the active published version.';
COMMENT ON FUNCTION public.complete_workflow_instance_node(uuid, uuid, uuid, text, text, jsonb, uuid)
IS 'Completes the current workflow runtime node and advances to the next node.';
