-- Reset workflow runtime for the designated test project so the project can
-- replay the current active construction workflow from the initial node.
--
-- Project: 2d710a84-1045-4750-8dfd-51a0f463a4db
--
-- Scope:
-- - Deletes workflow subject projection for this project.
-- - Deletes all workflow instances for this project; runtime nodes, tasks and
--   transition logs are removed through ON DELETE CASCADE.
-- - Starts one fresh instance on the active construction workflow.
--
-- Business records such as project_acceptances, construction logs and payment
-- records are intentionally left untouched.
DO $$
DECLARE
  v_project_id text := '2d710a84-1045-4750-8dfd-51a0f463a4db';
  v_tenant_id uuid;
  v_definition_id uuid;
  v_start_result jsonb;
  v_instance_id uuid;
BEGIN
  SELECT project.tenant_id
  INTO v_tenant_id
  FROM public.projects project
  WHERE project.id = v_project_id::uuid;

  IF v_tenant_id IS NULL THEN
    RAISE NOTICE 'Target test project not found, skip workflow runtime reset: %', v_project_id;
    RETURN;
  END IF;

  SELECT definition.id
  INTO v_definition_id
  FROM public.workflow_definitions definition
  WHERE definition.tenant_id = v_tenant_id
    AND definition.category = 'construction'
    AND definition.status = 'active'
    AND definition.active_version_id IS NOT NULL
  ORDER BY definition.updated_at DESC
  LIMIT 1;

  IF v_definition_id IS NULL THEN
    RAISE EXCEPTION 'Active construction workflow definition not found for tenant: %', v_tenant_id;
  END IF;

  DELETE FROM public.workflow_subject_states
  WHERE tenant_id = v_tenant_id
    AND subject_type = 'project'
    AND subject_id = v_project_id;

  DELETE FROM public.workflow_instances
  WHERE tenant_id = v_tenant_id
    AND subject_type = 'project'
    AND subject_id = v_project_id;

  UPDATE public.projects
  SET
    status = 'started',
    updated_at = now()
  WHERE id = v_project_id::uuid
    AND tenant_id = v_tenant_id;

  SELECT public.start_workflow_instance(
    v_tenant_id,
    v_definition_id,
    'project',
    v_project_id,
    jsonb_build_object(
      'source', 'test_project_workflow_runtime_reset',
      'reason', 'replay current active workflow from initial node',
      'reset_at', now()
    ),
    NULL
  )
  INTO v_start_result;

  IF COALESCE((v_start_result->>'ok')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'Failed to reset project workflow runtime: %', v_start_result;
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
    pending_task_count = EXCLUDED.pending_task_count;
END $$;
