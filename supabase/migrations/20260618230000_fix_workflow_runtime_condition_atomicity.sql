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
SET search_path TO 'public'
AS $function$
DECLARE
  v_instance public.workflow_instances%ROWTYPE;
  v_current_node jsonb;
  v_next_node jsonb;
  v_next_edge jsonb;
  v_has_outgoing_edges boolean := false;
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

  SELECT EXISTS (
    SELECT 1
    FROM public.workflow_versions version,
         jsonb_array_elements(COALESCE(version.snapshot->'edges', '[]'::jsonb)) AS edge
    WHERE version.id = v_instance.version_id
      AND version.definition_id = p_definition_id
      AND version.tenant_id = p_tenant_id
      AND edge->>'source_node_id' = v_instance.current_node_id::text
  )
  INTO v_has_outgoing_edges;

  SELECT edge
  INTO v_next_edge
  FROM public.workflow_versions version,
       jsonb_array_elements(COALESCE(version.snapshot->'edges', '[]'::jsonb)) AS edge
  WHERE version.id = v_instance.version_id
    AND version.definition_id = p_definition_id
    AND version.tenant_id = p_tenant_id
    AND edge->>'source_node_id' = v_instance.current_node_id::text
    AND public.workflow_edge_condition_matches(edge->'condition', v_output)
  ORDER BY
    CASE WHEN COALESCE(edge->'condition'->>'operator', 'always') = 'always' THEN 1 ELSE 0 END,
    COALESCE((edge->>'priority')::integer, 100),
    edge->>'created_at'
  LIMIT 1;

  IF v_next_edge IS NULL THEN
    IF v_has_outgoing_edges THEN
      RETURN jsonb_build_object(
        'ok', false,
        'reason', 'no_matching_edge',
        'current_node_key', v_instance.current_node_key
      );
    END IF;
  ELSE
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
$function$;

COMMENT ON FUNCTION public.complete_workflow_instance_node(
  uuid,
  uuid,
  uuid,
  text,
  text,
  jsonb,
  uuid
) IS 'Completes the current workflow node. Edge condition validation is performed before mutating the current node run so failed transitions remain retryable.';

DO $$
DECLARE
  v_instance_id uuid := '0b2a033f-504a-49d6-b196-fe9200761adf';
  v_node_run_id uuid := '3e1fd853-c15c-40ec-85f7-dcf4021b05f2';
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.workflow_instances instance
    WHERE instance.id = v_instance_id
      AND instance.status = 'running'
      AND instance.current_node_key = 'payment_deposit'
      AND NOT EXISTS (
        SELECT 1
        FROM public.workflow_instance_nodes running_node
        WHERE running_node.instance_id = instance.id
          AND running_node.node_key = instance.current_node_key
          AND running_node.status = 'running'
      )
  ) THEN
    UPDATE public.workflow_instance_nodes
    SET
      status = 'running',
      output = '{}'::jsonb,
      completed_by = NULL,
      completed_at = NULL
    WHERE id = v_node_run_id
      AND instance_id = v_instance_id
      AND node_key = 'payment_deposit'
      AND status = 'completed';

    UPDATE public.workflow_tasks
    SET
      status = 'pending',
      completed_by = NULL,
      completed_at = NULL
    WHERE instance_node_id = v_node_run_id
      AND instance_id = v_instance_id
      AND node_key = 'payment_deposit'
      AND status = 'completed';
  END IF;
END $$;
