CREATE OR REPLACE FUNCTION pg_temp.expense_payment_permission_node(p_node jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_node IS NULL THEN p_node
    WHEN p_node->>'node_key' <> 'payment' THEN p_node
    ELSE jsonb_set(
      p_node,
      '{config}',
      jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(
              COALESCE(p_node->'config', '{}'::jsonb) - 'assignee_rule' - 'assignee_id',
              '{approval_type}',
              to_jsonb('expense_approval'::text),
              true
            ),
            '{assignee_permission_code}',
            to_jsonb('expense_request.pay'::text),
            true
          ),
          '{required_permissions}',
          to_jsonb(ARRAY['expense_request.pay']::text[]),
          true
        ),
        '{approve_mode}',
        to_jsonb('any'::text),
        true
      ),
      true
    )
  END
$$;

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
      config = pg_temp.expense_payment_permission_node(
        jsonb_build_object(
          'node_key', 'payment',
          'config', COALESCE(config, '{}'::jsonb)
        )
      )->'config',
      updated_at = published_at
    WHERE tenant_id = definition_record.tenant_id
      AND definition_id = definition_record.id
      AND node_key = 'payment';

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
      '费用审批流程 v6：出纳打款按权限池分配',
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

WITH version_nodes AS (
  SELECT
    version.id AS version_id,
    version.tenant_id,
    version.definition_id,
    jsonb_agg(
      pg_temp.expense_payment_permission_node(node_record.node)
      ORDER BY node_record.ordinality
    ) AS nodes
  FROM public.workflow_versions version
  JOIN public.workflow_definitions definition
    ON definition.id = version.definition_id
   AND definition.tenant_id = version.tenant_id
  CROSS JOIN LATERAL jsonb_array_elements(
    COALESCE(version.snapshot->'nodes', '[]'::jsonb)
  ) WITH ORDINALITY AS node_record(node, ordinality)
  WHERE definition.workflow_key = 'expense_approval'
  GROUP BY version.id, version.tenant_id, version.definition_id
)
UPDATE public.workflow_versions version
SET
  snapshot = jsonb_set(version.snapshot, '{nodes}', version_nodes.nodes, true)
FROM version_nodes
WHERE version.id = version_nodes.version_id
  AND version.tenant_id = version_nodes.tenant_id
  AND version.definition_id = version_nodes.definition_id;

UPDATE public.workflow_instances instance
SET
  current_node_snapshot = pg_temp.expense_payment_permission_node(instance.current_node_snapshot),
  updated_at = now()
FROM public.workflow_definitions definition
WHERE definition.id = instance.definition_id
  AND definition.tenant_id = instance.tenant_id
  AND definition.workflow_key = 'expense_approval'
  AND instance.subject_type = 'expense_request'
  AND instance.current_node_key = 'payment'
  AND instance.current_node_snapshot IS NOT NULL;

UPDATE public.workflow_instance_nodes node_run
SET
  node_snapshot = pg_temp.expense_payment_permission_node(node_run.node_snapshot),
  updated_at = now()
FROM public.workflow_definitions definition
WHERE definition.id = node_run.definition_id
  AND definition.tenant_id = node_run.tenant_id
  AND definition.workflow_key = 'expense_approval'
  AND node_run.node_key = 'payment';

WITH task_projection AS (
  SELECT task.id AS task_id
  FROM public.workflow_tasks task
  JOIN public.workflow_instances instance
    ON instance.id = task.instance_id
   AND instance.tenant_id = task.tenant_id
  JOIN public.workflow_definitions definition
    ON definition.id = task.definition_id
   AND definition.tenant_id = task.tenant_id
  WHERE definition.workflow_key = 'expense_approval'
    AND instance.subject_type = 'expense_request'
    AND task.status = 'pending'
    AND task.node_key = 'payment'
)
UPDATE public.workflow_tasks task
SET
  assignee_employee_id = NULL,
  assignee_role_code = NULL,
  assignee_permission_code = 'expense_request.pay',
  updated_at = now()
FROM task_projection
WHERE task.id = task_projection.task_id;
