CREATE OR REPLACE FUNCTION public.set_workflow_task_assignee_permission()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_node jsonb;
  v_permission_code text;
  v_finance_reviewer_employee_id text;
BEGIN
  SELECT node
  INTO v_node
  FROM public.workflow_versions version,
       jsonb_array_elements(COALESCE(version.snapshot->'nodes', '[]'::jsonb)) AS node
  WHERE version.id = NEW.version_id
    AND version.tenant_id = NEW.tenant_id
    AND version.definition_id = NEW.definition_id
    AND node->>'id' = NEW.node_id::text
  LIMIT 1;

  IF v_node IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.assignee_employee_id IS NULL
    AND v_node->>'business_kind' = 'payment_collection'
  THEN
    v_finance_reviewer_employee_id :=
      NULLIF(btrim(v_node->'config'->>'finance_reviewer_employee_id'), '');

    IF v_finance_reviewer_employee_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      AND EXISTS (
        SELECT 1
        FROM public.employees employee
        WHERE employee.id = v_finance_reviewer_employee_id::uuid
          AND employee.tenant_id = NEW.tenant_id
      )
    THEN
      NEW.assignee_employee_id := v_finance_reviewer_employee_id::uuid;
    END IF;
  END IF;

  IF NEW.assignee_employee_id IS NOT NULL
    OR NEW.assignee_role_code IS NOT NULL
    OR NEW.assignee_permission_code IS NOT NULL
  THEN
    IF NEW.assignee_employee_id IS NOT NULL THEN
      NEW.assignee_permission_code := NULL;
      NEW.assignee_role_code := NULL;
    END IF;
    RETURN NEW;
  END IF;

  v_permission_code := NULLIF(btrim(v_node->'config'->'required_permissions'->>0), '');
  NEW.assignee_permission_code := v_permission_code;
  RETURN NEW;
END;
$$;

WITH task_projection AS (
  SELECT
    task.id AS task_id,
    NULLIF(btrim(node->'config'->>'finance_reviewer_employee_id'), '') AS finance_reviewer_employee_id
  FROM public.workflow_tasks task
  JOIN public.workflow_versions version
    ON version.id = task.version_id
   AND version.tenant_id = task.tenant_id
   AND version.definition_id = task.definition_id
  CROSS JOIN LATERAL jsonb_array_elements(
    COALESCE(version.snapshot->'nodes', '[]'::jsonb)
  ) AS node
  WHERE task.status = 'pending'
    AND node->>'id' = task.node_id::text
    AND node->>'business_kind' = 'payment_collection'
)
UPDATE public.workflow_tasks task
SET
  assignee_employee_id = task_projection.finance_reviewer_employee_id::uuid,
  assignee_role_code = NULL,
  assignee_permission_code = NULL
FROM task_projection
WHERE task.id = task_projection.task_id
  AND task_projection.finance_reviewer_employee_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND EXISTS (
    SELECT 1
    FROM public.employees employee
    WHERE employee.id = task_projection.finance_reviewer_employee_id::uuid
      AND employee.tenant_id = task.tenant_id
  );

COMMENT ON FUNCTION public.set_workflow_task_assignee_permission()
IS 'Projects payment_collection finance_reviewer_employee_id to workflow_tasks.assignee_employee_id; otherwise projects node config.required_permissions[0] for task visibility.';
