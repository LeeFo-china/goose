DO $$
DECLARE
  definition_record public.workflow_definitions%ROWTYPE;
  next_version_id uuid;
  next_version_number integer;
  published_at timestamptz := now();
  snapshot jsonb;
BEGIN
  FOR definition_record IN
    SELECT *
    FROM public.workflow_definitions
    WHERE workflow_key = 'expense_approval'
      AND status = 'active'
    FOR UPDATE
  LOOP
    UPDATE public.workflow_nodes
    SET
      title = '已驳回',
      description = '费用审批驳回后流程结束，申请人可修改后重新提交。',
      updated_at = published_at
    WHERE tenant_id = definition_record.tenant_id
      AND definition_id = definition_record.id
      AND node_key = 'rejected'
      AND node_type = 'end';

    SELECT COALESCE(MAX(version_number), 0) + 1
    INTO next_version_number
    FROM public.workflow_versions
    WHERE tenant_id = definition_record.tenant_id
      AND definition_id = definition_record.id;

    snapshot := jsonb_build_object(
      'workflow_key', definition_record.workflow_key,
      'definition_id', definition_record.id,
      'category', definition_record.category,
      'published_at', published_at,
      'version_number', next_version_number,
      'nodes', (
        SELECT COALESCE(jsonb_agg(to_jsonb(node_record) ORDER BY node_record.sort_order), '[]'::jsonb)
        FROM public.workflow_nodes node_record
        WHERE node_record.tenant_id = definition_record.tenant_id
          AND node_record.definition_id = definition_record.id
      ),
      'edges', (
        SELECT COALESCE(jsonb_agg(to_jsonb(edge_record) ORDER BY edge_record.priority, edge_record.id), '[]'::jsonb)
        FROM public.workflow_edges edge_record
        WHERE edge_record.tenant_id = definition_record.tenant_id
          AND edge_record.definition_id = definition_record.id
      )
    );

    INSERT INTO public.workflow_versions (
      tenant_id,
      definition_id,
      version_number,
      version_label,
      status,
      snapshot,
      validation_result,
      published_by,
      published_at,
      created_at
    )
    VALUES (
      definition_record.tenant_id,
      definition_record.id,
      next_version_number,
      '费用审批流程 v5：补充驳回后续说明',
      'published',
      snapshot,
      '{}'::jsonb,
      NULL,
      published_at,
      published_at
    )
    RETURNING id
    INTO next_version_id;

    UPDATE public.workflow_definitions
    SET
      active_version_id = next_version_id,
      updated_at = published_at
    WHERE tenant_id = definition_record.tenant_id
      AND id = definition_record.id;
  END LOOP;
END;
$$;
