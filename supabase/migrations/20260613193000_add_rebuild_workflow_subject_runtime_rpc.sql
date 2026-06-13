CREATE OR REPLACE FUNCTION public.rebuild_workflow_subject_runtime(
  p_tenant_id uuid,
  p_definition_id uuid,
  p_subject_type text,
  p_subject_id text,
  p_reason text,
  p_context jsonb,
  p_actor_employee_id uuid,
  p_project_status text DEFAULT NULL,
  p_delete_completed_instances boolean DEFAULT false,
  p_dry_run boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_context jsonb := COALESCE(p_context, '{}'::jsonb);
  v_definition public.workflow_definitions%ROWTYPE;
  v_version public.workflow_versions%ROWTYPE;
  v_running_instance public.workflow_instances%ROWTYPE;
  v_start_node jsonb;
  v_start_edge jsonb;
  v_target_node jsonb;
  v_start_result jsonb;
  v_instance_id uuid;
  v_subject_state public.workflow_subject_states%ROWTYPE;
  v_existing_instance_count integer := 0;
  v_canceled_instance_count integer := 0;
  v_deleted_instance_count integer := 0;
BEGIN
  IF jsonb_typeof(v_context) <> 'object' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_context');
  END IF;

  IF NULLIF(btrim(COALESCE(p_reason, '')), '') IS NULL THEN
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

  SELECT edge
  INTO v_start_edge
  FROM jsonb_array_elements(COALESCE(v_version.snapshot->'edges', '[]'::jsonb)) AS edge
  WHERE edge->>'source_node_id' = v_start_node->>'id'
  ORDER BY COALESCE((edge->>'priority')::integer, 100), edge->>'created_at'
  LIMIT 1;

  SELECT node
  INTO v_target_node
  FROM jsonb_array_elements(COALESCE(v_version.snapshot->'nodes', '[]'::jsonb)) AS node
  WHERE node->>'id' = v_start_edge->>'target_node_id'
  LIMIT 1;

  IF v_start_node IS NULL OR v_start_edge IS NULL OR v_target_node IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'graph_invalid');
  END IF;

  IF p_subject_type = 'project' THEN
    IF p_subject_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'project_not_found');
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.projects
      WHERE id = p_subject_id::uuid
        AND tenant_id = p_tenant_id
    ) THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'project_not_found');
    END IF;
  END IF;

  SELECT count(*)::integer
  INTO v_existing_instance_count
  FROM public.workflow_instances
  WHERE tenant_id = p_tenant_id
    AND definition_id = p_definition_id
    AND subject_type = p_subject_type
    AND subject_id = p_subject_id;

  IF p_dry_run THEN
    RETURN jsonb_build_object(
      'ok', true,
      'dry_run', true,
      'instance', NULL,
      'current_node', v_target_node,
      'task', NULL,
      'subject_state', NULL,
      'existing_instance_count', v_existing_instance_count,
      'canceled_instance_count', (
        SELECT count(*)::integer
        FROM public.workflow_instances
        WHERE tenant_id = p_tenant_id
          AND definition_id = p_definition_id
          AND subject_type = p_subject_type
          AND subject_id = p_subject_id
          AND status = 'running'
      ),
      'deleted_instance_count', CASE WHEN p_delete_completed_instances THEN (
        SELECT count(*)::integer
        FROM public.workflow_instances
        WHERE tenant_id = p_tenant_id
          AND definition_id = p_definition_id
          AND subject_type = p_subject_type
          AND subject_id = p_subject_id
          AND status = 'completed'
      ) ELSE 0 END
    );
  END IF;

  FOR v_running_instance IN
    SELECT *
    FROM public.workflow_instances
    WHERE tenant_id = p_tenant_id
      AND definition_id = p_definition_id
      AND subject_type = p_subject_type
      AND subject_id = p_subject_id
      AND status = 'running'
    FOR UPDATE
  LOOP
    PERFORM public.cancel_workflow_instance(
      p_tenant_id,
      p_definition_id,
      v_running_instance.id,
      p_reason,
      v_context || jsonb_build_object('source', 'workflow_runtime_rebuild'),
      p_actor_employee_id
    );
    v_canceled_instance_count := v_canceled_instance_count + 1;
  END LOOP;

  IF p_delete_completed_instances THEN
    DELETE FROM public.workflow_instances
    WHERE tenant_id = p_tenant_id
      AND definition_id = p_definition_id
      AND subject_type = p_subject_type
      AND subject_id = p_subject_id
      AND status = 'completed';

    GET DIAGNOSTICS v_deleted_instance_count = ROW_COUNT;
  END IF;

  IF p_subject_type = 'project' AND p_project_status IS NOT NULL THEN
    UPDATE public.projects
    SET
      status = p_project_status,
      updated_at = now()
    WHERE id = p_subject_id::uuid
      AND tenant_id = p_tenant_id;
  END IF;

  SELECT public.start_workflow_instance(
    p_tenant_id,
    p_definition_id,
    p_subject_type,
    p_subject_id,
    v_context || jsonb_build_object(
      'source', 'workflow_runtime_rebuild',
      'reason', p_reason,
      'rebuilt_at', now()
    ),
    p_actor_employee_id
  )
  INTO v_start_result;

  IF COALESCE((v_start_result->>'ok')::boolean, false) IS NOT TRUE THEN
    RETURN v_start_result;
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
      SELECT count(*)::integer
      FROM public.workflow_tasks task
      WHERE task.tenant_id = instance.tenant_id
        AND task.instance_id = instance.id
        AND task.status = 'pending'
    )
  FROM public.workflow_instances instance
  WHERE instance.id = v_instance_id
  ON CONFLICT (tenant_id, subject_type, subject_id)
  DO UPDATE SET
    definition_id = EXCLUDED.definition_id,
    instance_id = EXCLUDED.instance_id,
    instance_status = EXCLUDED.instance_status,
    current_node_key = EXCLUDED.current_node_key,
    current_node_title = EXCLUDED.current_node_title,
    current_business_kind = EXCLUDED.current_business_kind,
    pending_task_count = EXCLUDED.pending_task_count
  RETURNING *
  INTO v_subject_state;

  RETURN jsonb_build_object(
    'ok', true,
    'dry_run', false,
    'instance', v_start_result->'instance',
    'current_node', v_start_result->'current_node',
    'task', v_start_result->'task',
    'subject_state', to_jsonb(v_subject_state),
    'existing_instance_count', v_existing_instance_count,
    'canceled_instance_count', v_canceled_instance_count,
    'deleted_instance_count', v_deleted_instance_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rebuild_workflow_subject_runtime(
  uuid,
  uuid,
  text,
  text,
  text,
  jsonb,
  uuid,
  text,
  boolean,
  boolean
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rebuild_workflow_subject_runtime(
  uuid,
  uuid,
  text,
  text,
  text,
  jsonb,
  uuid,
  text,
  boolean,
  boolean
) FROM anon;
REVOKE ALL ON FUNCTION public.rebuild_workflow_subject_runtime(
  uuid,
  uuid,
  text,
  text,
  text,
  jsonb,
  uuid,
  text,
  boolean,
  boolean
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.rebuild_workflow_subject_runtime(
  uuid,
  uuid,
  text,
  text,
  text,
  jsonb,
  uuid,
  text,
  boolean,
  boolean
) TO service_role;

COMMENT ON FUNCTION public.rebuild_workflow_subject_runtime(
  uuid,
  uuid,
  text,
  text,
  text,
  jsonb,
  uuid,
  text,
  boolean,
  boolean
) IS 'Admin repair RPC that atomically rebuilds a workflow runtime subject against the active workflow version and refreshes workflow_subject_states.';
