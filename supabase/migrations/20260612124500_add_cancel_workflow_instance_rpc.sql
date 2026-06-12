CREATE OR REPLACE FUNCTION public.cancel_workflow_instance(
  p_tenant_id uuid,
  p_definition_id uuid,
  p_instance_id uuid,
  p_reason text,
  p_context jsonb,
  p_actor_employee_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_instance public.workflow_instances%ROWTYPE;
  v_context jsonb := COALESCE(p_context, '{}'::jsonb);
BEGIN
  IF jsonb_typeof(v_context) <> 'object' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_context');
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

  UPDATE public.workflow_instance_nodes
  SET
    status = 'canceled',
    output = v_context,
    completed_by = p_actor_employee_id,
    completed_at = now()
  WHERE tenant_id = p_tenant_id
    AND instance_id = p_instance_id
    AND status = 'running';

  UPDATE public.workflow_tasks
  SET
    status = 'canceled',
    completed_by = p_actor_employee_id,
    completed_at = now()
  WHERE tenant_id = p_tenant_id
    AND instance_id = p_instance_id
    AND status = 'pending';

  UPDATE public.workflow_instances
  SET
    status = 'canceled',
    completed_by = p_actor_employee_id,
    completed_at = now()
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
    v_instance.current_node_id,
    v_instance.current_node_key,
    NULL,
    NULL,
    NULL,
    'cancel',
    v_context || jsonb_build_object('reason', p_reason),
    p_actor_employee_id
  );

  RETURN jsonb_build_object('ok', true, 'instance', to_jsonb(v_instance));
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_workflow_instance(uuid, uuid, uuid, text, jsonb, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cancel_workflow_instance(uuid, uuid, uuid, text, jsonb, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.cancel_workflow_instance(uuid, uuid, uuid, text, jsonb, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_workflow_instance(uuid, uuid, uuid, text, jsonb, uuid) TO service_role;

COMMENT ON FUNCTION public.cancel_workflow_instance(uuid, uuid, uuid, text, jsonb, uuid)
IS 'Cancels a running workflow instance, running nodes, pending tasks, and writes a cancel transition log.';
