-- Make final acceptance report creation an explicit workflow-node capability,
-- then reopen fa32 at final_acceptance so it can complete the report loop.

UPDATE public.workflow_nodes AS node
SET config = COALESCE(node.config, '{}'::jsonb) || jsonb_build_object(
  'stage_type', 'final_acceptance',
  'final_acceptance_report_enabled', true
)
FROM public.workflow_definitions AS definition
WHERE node.definition_id = definition.id
  AND node.tenant_id = definition.tenant_id
  AND definition.category = 'construction'
  AND (
    node.node_key = 'final_acceptance'
    OR node.business_kind = 'final_acceptance'
    OR node.config->>'stage_type' = 'final_acceptance'
  );

UPDATE public.workflow_versions AS version
SET snapshot = jsonb_set(
  version.snapshot,
  '{nodes}',
  (
    SELECT jsonb_agg(
      CASE
        WHEN node_item.node->>'node_key' = 'final_acceptance'
          OR node_item.node->>'business_kind' = 'final_acceptance'
          OR node_item.node->'config'->>'stage_type' = 'final_acceptance'
        THEN jsonb_set(
          node_item.node,
          '{config}',
          COALESCE(node_item.node->'config', '{}'::jsonb) || jsonb_build_object(
            'stage_type', 'final_acceptance',
            'final_acceptance_report_enabled', true
          )
        )
        ELSE node_item.node
      END
      ORDER BY node_item.ordinality
    )
    FROM jsonb_array_elements(COALESCE(version.snapshot->'nodes', '[]'::jsonb))
      WITH ORDINALITY AS node_item(node, ordinality)
  )
)
FROM public.workflow_definitions AS definition
WHERE version.definition_id = definition.id
  AND version.tenant_id = definition.tenant_id
  AND definition.category = 'construction'
  AND jsonb_typeof(version.snapshot->'nodes') = 'array'
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements(version.snapshot->'nodes') AS node_item(node)
    WHERE node_item.node->>'node_key' = 'final_acceptance'
      OR node_item.node->>'business_kind' = 'final_acceptance'
      OR node_item.node->'config'->>'stage_type' = 'final_acceptance'
  );

UPDATE public.workflow_instance_nodes AS node_run
SET node_snapshot = jsonb_set(
  node_run.node_snapshot,
  '{config}',
  COALESCE(node_run.node_snapshot->'config', '{}'::jsonb) || jsonb_build_object(
    'stage_type', 'final_acceptance',
    'final_acceptance_report_enabled', true
  )
)
FROM public.workflow_instances AS instance
JOIN public.workflow_definitions AS definition
  ON definition.id = instance.definition_id
 AND definition.tenant_id = instance.tenant_id
WHERE node_run.instance_id = instance.id
  AND node_run.tenant_id = instance.tenant_id
  AND definition.category = 'construction'
  AND (
    node_run.node_key = 'final_acceptance'
    OR node_run.node_snapshot->>'business_kind' = 'final_acceptance'
    OR node_run.node_snapshot->'config'->>'stage_type' = 'final_acceptance'
  );

UPDATE public.workflow_instances AS instance
SET current_node_snapshot = jsonb_set(
  instance.current_node_snapshot,
  '{config}',
  COALESCE(instance.current_node_snapshot->'config', '{}'::jsonb)
    || jsonb_build_object(
      'stage_type', 'final_acceptance',
      'final_acceptance_report_enabled', true
    )
)
FROM public.workflow_definitions AS definition
WHERE instance.definition_id = definition.id
  AND instance.tenant_id = definition.tenant_id
  AND definition.category = 'construction'
  AND instance.current_node_snapshot IS NOT NULL
  AND (
    instance.current_node_key = 'final_acceptance'
    OR instance.current_node_snapshot->>'business_kind' = 'final_acceptance'
    OR instance.current_node_snapshot->'config'->>'stage_type' = 'final_acceptance'
  );

DO $$
DECLARE
  v_project_id text := 'fa32f6dd-b2d0-4efc-a810-347dfe90ec4c';
  v_instance public.workflow_instances%ROWTYPE;
  v_final_node_run public.workflow_instance_nodes%ROWTYPE;
  v_handover_node_run public.workflow_instance_nodes%ROWTYPE;
  v_final_snapshot jsonb;
BEGIN
  SELECT *
  INTO v_instance
  FROM public.workflow_instances
  WHERE subject_type = 'project'
    AND subject_id = v_project_id
    AND status = 'running'
  ORDER BY updated_at DESC, created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE NOTICE 'No running workflow instance found for project %', v_project_id;
    RETURN;
  END IF;

  SELECT *
  INTO v_final_node_run
  FROM public.workflow_instance_nodes
  WHERE tenant_id = v_instance.tenant_id
    AND instance_id = v_instance.id
    AND node_key = 'final_acceptance'
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE NOTICE 'No final_acceptance node run found for project %', v_project_id;
    RETURN;
  END IF;

  SELECT *
  INTO v_handover_node_run
  FROM public.workflow_instance_nodes
  WHERE tenant_id = v_instance.tenant_id
    AND instance_id = v_instance.id
    AND node_key = 'handover'
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  v_final_snapshot := jsonb_set(
    v_final_node_run.node_snapshot,
    '{config}',
    COALESCE(v_final_node_run.node_snapshot->'config', '{}'::jsonb)
      || jsonb_build_object(
        'stage_type', 'final_acceptance',
        'final_acceptance_report_enabled', true
      )
  );

  UPDATE public.workflow_instance_nodes
  SET
    status = 'running',
    node_snapshot = v_final_snapshot,
    completed_by = NULL,
    completed_at = NULL
  WHERE id = v_final_node_run.id;

  IF v_handover_node_run.id IS NOT NULL THEN
    UPDATE public.workflow_instance_nodes
    SET status = 'canceled'
    WHERE id = v_handover_node_run.id
      AND status = 'running';

    UPDATE public.workflow_tasks
    SET status = 'canceled'
    WHERE tenant_id = v_instance.tenant_id
      AND instance_id = v_instance.id
      AND instance_node_id = v_handover_node_run.id
      AND status = 'pending';
  END IF;

  UPDATE public.workflow_tasks
  SET
    status = 'pending',
    completed_by = NULL,
    completed_at = NULL
  WHERE tenant_id = v_instance.tenant_id
    AND instance_id = v_instance.id
    AND instance_node_id = v_final_node_run.id;

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
  SELECT
    v_instance.tenant_id,
    v_instance.id,
    v_final_node_run.id,
    v_instance.definition_id,
    v_instance.version_id,
    v_final_node_run.node_id,
    v_final_node_run.node_key,
    v_final_node_run.node_type,
    COALESCE(v_final_snapshot->>'title', '竣工验收')
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.workflow_tasks AS task
    WHERE task.tenant_id = v_instance.tenant_id
      AND task.instance_id = v_instance.id
      AND task.instance_node_id = v_final_node_run.id
  );

  UPDATE public.workflow_instances
  SET
    status = 'running',
    current_node_id = v_final_node_run.node_id,
    current_node_key = v_final_node_run.node_key,
    current_node_snapshot = v_final_snapshot,
    completed_by = NULL,
    completed_at = NULL
  WHERE id = v_instance.id;

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
  VALUES (
    v_instance.tenant_id,
    'project',
    v_project_id,
    v_instance.definition_id,
    v_instance.id,
    'running',
    'final_acceptance',
    COALESCE(v_final_snapshot->>'title', '竣工验收'),
    'final_acceptance',
    1
  )
  ON CONFLICT (tenant_id, subject_type, subject_id)
  DO UPDATE SET
    definition_id = EXCLUDED.definition_id,
    instance_id = EXCLUDED.instance_id,
    instance_status = EXCLUDED.instance_status,
    current_node_key = EXCLUDED.current_node_key,
    current_node_title = EXCLUDED.current_node_title,
    current_business_kind = EXCLUDED.current_business_kind,
    pending_task_count = EXCLUDED.pending_task_count;

  INSERT INTO public.workflow_transition_logs (
    tenant_id,
    instance_id,
    definition_id,
    version_id,
    source_node_id,
    source_node_key,
    target_node_id,
    target_node_key,
    action,
    context
  )
  SELECT
    v_instance.tenant_id,
    v_instance.id,
    v_instance.definition_id,
    v_instance.version_id,
    v_handover_node_run.node_id,
    'handover',
    v_final_node_run.node_id,
    'final_acceptance',
    'system_reopen_final_acceptance_report',
    jsonb_build_object(
      'project_id', v_project_id,
      'reason', 'final_acceptance_report_required'
    )
  WHERE v_handover_node_run.id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.workflow_transition_logs AS log
      WHERE log.tenant_id = v_instance.tenant_id
        AND log.instance_id = v_instance.id
        AND log.action = 'system_reopen_final_acceptance_report'
    );
END $$;
