-- Repair project workflow runtime source-of-truth drift found on 2026-06-14.
--
-- Evidence source:
--   bun --env-file=.env run workflow:project-source-check --all-active-construction
--
-- Scope:
-- - Repairs only projects whose business evidence maps unambiguously to a
--   workflow runtime node and whose tenant has an active construction workflow
--   definition.
-- - Leaves project 634ff402-ff84-4541-aa7c-3cdcd4fd5460 untouched because it
--   has all stage acceptances confirmed but no payment records; payment gates
--   cannot be skipped or synthesized without business confirmation.
-- - Cancels stale running construction workflow instances, starts one fresh
--   active construction runtime, replays completed nodes, and refreshes
--   workflow_subject_states.
--
-- Rollback:
-- - The previous running instances are retained with status='canceled'.
-- - To roll back a repaired project, cancel the new running instance and use
--   start_workflow_instance / complete_workflow_instance_node to replay the
--   desired audited state, then upsert workflow_subject_states.
DO $$
DECLARE
  v_repair record;
  v_project record;
  v_definition record;
  v_running_instance record;
  v_start_result jsonb;
  v_complete_result jsonb;
  v_instance_id uuid;
  v_node_key text;
BEGIN
  FOR v_repair IN
    SELECT *
    FROM (
      VALUES
        (
          'e0f49640-f712-4bb4-b782-ddd134b4d78b',
          ARRAY[]::text[],
          'No accepted construction stage evidence; rebuild runtime at construction_start.'
        ),
        (
          '54f11aa5-09a8-4410-a9c5-604a7fe9e09c',
          ARRAY['construction_start', 'procedure_demolition']::text[],
          'Demolition acceptance is confirmed; rebuild runtime at procedure_plumbing_electrical.'
        ),
        (
          'b2f0a85c-0084-44ba-a988-438b6dcbec23',
          ARRAY['construction_start', 'procedure_demolition', 'procedure_plumbing_electrical']::text[],
          'Demolition and plumbing/electrical acceptances are confirmed, with no stage_2 payment; rebuild runtime at payment_stage_2.'
        ),
        (
          '2d710a84-1045-4750-8dfd-51a0f463a4db',
          ARRAY['construction_start', 'procedure_demolition', 'procedure_plumbing_electrical']::text[],
          'Demolition and plumbing/electrical acceptances are confirmed, with no stage_2 payment; rebuild runtime at payment_stage_2.'
        )
    ) AS repair(project_id, completed_node_keys, reason)
  LOOP
    SELECT project.id, project.tenant_id, project.status
    INTO v_project
    FROM public.projects project
    WHERE project.id = v_repair.project_id::uuid;

    IF NOT FOUND THEN
      RAISE NOTICE 'Project not found, skip workflow repair: %', v_repair.project_id;
      CONTINUE;
    END IF;

    SELECT definition.id, definition.active_version_id
    INTO v_definition
    FROM public.workflow_definitions definition
    WHERE definition.tenant_id = v_project.tenant_id
      AND definition.category = 'construction'
      AND definition.status = 'active'
      AND definition.active_version_id IS NOT NULL
    ORDER BY definition.updated_at DESC
    LIMIT 1;

    IF NOT FOUND THEN
      RAISE NOTICE 'Active construction workflow definition not found, skip workflow repair: project %, tenant %',
        v_repair.project_id,
        v_project.tenant_id;
      CONTINUE;
    END IF;

    FOR v_running_instance IN
      SELECT instance.*
      FROM public.workflow_instances instance
      JOIN public.workflow_definitions definition
        ON definition.id = instance.definition_id
       AND definition.tenant_id = instance.tenant_id
      WHERE instance.tenant_id = v_project.tenant_id
        AND instance.subject_type = 'project'
        AND instance.subject_id = v_repair.project_id
        AND instance.status = 'running'
        AND definition.category = 'construction'
      FOR UPDATE
    LOOP
      SELECT public.cancel_workflow_instance(
        v_running_instance.tenant_id,
        v_running_instance.definition_id,
        v_running_instance.id,
        'workflow runtime source repair',
        jsonb_build_object(
          'source', '20260614073500_repair_project_workflow_runtime_source',
          'reason', v_repair.reason,
          'project_id', v_repair.project_id
        ),
        NULL
      )
      INTO v_complete_result;

      IF COALESCE((v_complete_result->>'ok')::boolean, false) IS NOT TRUE THEN
        RAISE EXCEPTION 'Failed to cancel stale workflow instance for project %: %',
          v_repair.project_id,
          v_complete_result;
      END IF;
    END LOOP;

    SELECT public.start_workflow_instance(
      v_project.tenant_id,
      v_definition.id,
      'project',
      v_repair.project_id,
      jsonb_build_object(
        'source', '20260614073500_repair_project_workflow_runtime_source',
        'reason', v_repair.reason,
        'repaired_at', now()
      ),
      NULL
    )
    INTO v_start_result;

    IF COALESCE((v_start_result->>'ok')::boolean, false) IS NOT TRUE THEN
      RAISE EXCEPTION 'Failed to start repaired workflow runtime for project %: %',
        v_repair.project_id,
        v_start_result;
    END IF;

    v_instance_id := (v_start_result->'instance'->>'id')::uuid;

    FOREACH v_node_key IN ARRAY v_repair.completed_node_keys
    LOOP
      SELECT public.complete_workflow_instance_node(
        v_project.tenant_id,
        v_definition.id,
        v_instance_id,
        v_node_key,
        'repair_complete',
        jsonb_build_object(
          'source', '20260614073500_repair_project_workflow_runtime_source',
          'reason', v_repair.reason,
          'project_id', v_repair.project_id,
          'completed_node_key', v_node_key
        ),
        NULL
      )
      INTO v_complete_result;

      IF COALESCE((v_complete_result->>'ok')::boolean, false) IS NOT TRUE THEN
        RAISE EXCEPTION 'Failed to replay node % for project %: %',
          v_node_key,
          v_repair.project_id,
          v_complete_result;
      END IF;
    END LOOP;

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
  END LOOP;
END $$;
