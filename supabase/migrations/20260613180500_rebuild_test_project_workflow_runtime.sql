-- Rebuild workflow runtime for the designated test project so it can replay
-- the current active workflow version after the tiling payment node update.
--
-- Project: 2d710a84-1045-4750-8dfd-51a0f463a4db
-- Tenant: 3eebca47-961f-4899-b976-a3d3208d326b
-- Workflow definition: 2c0e27d5-f296-41de-9653-16c5a4f961d8
--
-- This intentionally resets only workflow runtime/projection data plus the
-- project status guard used by the current workflow task bridge. Business
-- payment records are left untouched.
DO $$
DECLARE
  v_tenant_id uuid := '3eebca47-961f-4899-b976-a3d3208d326b'::uuid;
  v_project_id text := '2d710a84-1045-4750-8dfd-51a0f463a4db';
  v_definition_id uuid := '2c0e27d5-f296-41de-9653-16c5a4f961d8'::uuid;
  v_project_exists boolean;
  v_completed_instance_exists boolean;
  v_start_result jsonb;
  v_instance_id uuid;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM public.projects
    WHERE id = v_project_id::uuid
      AND tenant_id = v_tenant_id
  )
  INTO v_project_exists;

  IF NOT v_project_exists THEN
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.workflow_instances
    WHERE tenant_id = v_tenant_id
      AND definition_id = v_definition_id
      AND subject_type = 'project'
      AND subject_id = v_project_id
      AND status = 'completed'
      AND current_node_key = 'end'
  )
  INTO v_completed_instance_exists;

  IF NOT v_completed_instance_exists THEN
    RETURN;
  END IF;

  DELETE FROM public.workflow_subject_states
  WHERE tenant_id = v_tenant_id
    AND subject_type = 'project'
    AND subject_id = v_project_id;

  DELETE FROM public.workflow_instances
  WHERE tenant_id = v_tenant_id
    AND definition_id = v_definition_id
    AND subject_type = 'project'
    AND subject_id = v_project_id;

  UPDATE public.projects
  SET
    status = 'designing',
    updated_at = now()
  WHERE id = v_project_id::uuid
    AND tenant_id = v_tenant_id;

  SELECT public.start_workflow_instance(
    v_tenant_id,
    v_definition_id,
    'project',
    v_project_id,
    jsonb_build_object(
      'source', 'manual_workflow_rebuild',
      'reason', 'replay active workflow after tiling payment node update'
    ),
    NULL
  )
  INTO v_start_result;

  IF COALESCE((v_start_result->>'ok')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'Failed to rebuild project workflow runtime: %', v_start_result;
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
