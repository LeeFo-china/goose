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
      title = '经理审批',
      description = '对应费用当前步骤：经理审批。',
      config = jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(
              COALESCE(config, '{}'::jsonb),
              '{approval_type}',
              to_jsonb('expense_approval'::text),
              true
            ),
            '{assignee_rule}',
            to_jsonb('applicant_department_manager'::text),
            true
          ),
          '{assignee_id}',
          'null'::jsonb,
          true
        ),
        '{approve_mode}',
        to_jsonb('any'::text),
        true
      ),
      updated_at = published_at
    WHERE tenant_id = definition_record.tenant_id
      AND definition_id = definition_record.id
      AND node_key = 'manager_review';

    UPDATE public.workflow_nodes
    SET
      title = '财务审批',
      description = '对应费用当前步骤：财务审批。',
      config = jsonb_set(
        jsonb_set(
          jsonb_set(
            COALESCE(config, '{}'::jsonb),
            '{approval_type}',
            to_jsonb('expense_approval'::text),
            true
          ),
          '{assignee_rule}',
          to_jsonb('role'::text),
          true
        ),
        '{approve_mode}',
        to_jsonb('any'::text),
        true
      ),
      updated_at = published_at
    WHERE tenant_id = definition_record.tenant_id
      AND definition_id = definition_record.id
      AND node_key = 'finance_review';

    UPDATE public.workflow_nodes
    SET
      title = '出纳打款',
      description = '对应费用当前步骤：待打款。',
      config = jsonb_set(
        jsonb_set(
          jsonb_set(
            COALESCE(config, '{}'::jsonb),
            '{approval_type}',
            to_jsonb('expense_approval'::text),
            true
          ),
          '{assignee_rule}',
          to_jsonb('role'::text),
          true
        ),
        '{approve_mode}',
        to_jsonb('any'::text),
        true
      ),
      updated_at = published_at
    WHERE tenant_id = definition_record.tenant_id
      AND definition_id = definition_record.id
      AND node_key = 'payment';

    UPDATE public.workflow_edges edge
    SET
      condition = jsonb_build_object(
        'operator', 'eq',
        'field', 'decision',
        'value', 'rejected'
      ),
      updated_at = published_at
    FROM public.workflow_nodes source_node,
         public.workflow_nodes target_node
    WHERE edge.tenant_id = definition_record.tenant_id
      AND edge.definition_id = definition_record.id
      AND source_node.id = edge.source_node_id
      AND source_node.definition_id = edge.definition_id
      AND target_node.id = edge.target_node_id
      AND target_node.definition_id = edge.definition_id
      AND source_node.node_key IN ('manager_review', 'finance_review')
      AND target_node.node_key = 'rejected';

    DELETE FROM public.workflow_edges edge
    USING public.workflow_nodes source_node,
          public.workflow_nodes target_node
    WHERE edge.tenant_id = definition_record.tenant_id
      AND edge.definition_id = definition_record.id
      AND source_node.id = edge.source_node_id
      AND source_node.definition_id = edge.definition_id
      AND target_node.id = edge.target_node_id
      AND target_node.definition_id = edge.definition_id
      AND source_node.node_key = 'payment'
      AND target_node.node_key = 'rejected';

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
      '费用审批流程 v4：修正审批节点配置',
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
