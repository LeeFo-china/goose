CREATE OR REPLACE FUNCTION public.set_workflow_task_assignee_permission()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_node jsonb;
  v_permission_code text;
  v_finance_reviewer_employee_id text;
  v_subject_type text;
  v_assignee_rule text;
  v_assignee_id text;
  v_uuid_pattern text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
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

  SELECT instance.subject_type
  INTO v_subject_type
  FROM public.workflow_instances instance
  WHERE instance.id = NEW.instance_id
    AND instance.tenant_id = NEW.tenant_id
  LIMIT 1;

  IF NEW.assignee_employee_id IS NOT NULL
    OR NEW.assignee_role_code IS NOT NULL
  THEN
    IF NEW.assignee_employee_id IS NOT NULL THEN
      NEW.assignee_permission_code := NULL;
      NEW.assignee_role_code := NULL;
    END IF;
    RETURN NEW;
  END IF;

  IF v_subject_type = 'project'
    AND v_node->>'business_kind' = 'payment_collection'
  THEN
    v_finance_reviewer_employee_id :=
      NULLIF(btrim(v_node->'config'->>'finance_reviewer_employee_id'), '');

    IF v_finance_reviewer_employee_id ~* v_uuid_pattern
      AND EXISTS (
        SELECT 1
        FROM public.employees employee
        WHERE employee.id = v_finance_reviewer_employee_id::uuid
          AND employee.tenant_id = NEW.tenant_id
      )
    THEN
      NEW.assignee_employee_id := v_finance_reviewer_employee_id::uuid;
      NEW.assignee_permission_code := NULL;
      NEW.assignee_role_code := NULL;
      RETURN NEW;
    END IF;
  END IF;

  IF NEW.assignee_permission_code IS NOT NULL THEN
    RETURN NEW;
  END IF;

  v_assignee_rule := NULLIF(btrim(v_node->'config'->>'assignee_rule'), '');
  v_assignee_id := NULLIF(btrim(v_node->'config'->>'assignee_id'), '');

  IF v_assignee_rule = 'employee'
    AND v_assignee_id ~* v_uuid_pattern
    AND EXISTS (
      SELECT 1
      FROM public.employees employee
      WHERE employee.id = v_assignee_id::uuid
        AND employee.tenant_id = NEW.tenant_id
        AND employee.status = 'active'
    )
  THEN
    NEW.assignee_employee_id := v_assignee_id::uuid;
    NEW.assignee_permission_code := NULL;
    NEW.assignee_role_code := NULL;
    RETURN NEW;
  END IF;

  IF v_assignee_rule = 'role'
    AND v_assignee_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.roles role_record
      WHERE role_record.code = v_assignee_id
        AND role_record.tenant_id = NEW.tenant_id
        AND role_record.status = 'active'
    )
  THEN
    NEW.assignee_role_code := v_assignee_id;
    NEW.assignee_permission_code := NULL;
    NEW.assignee_employee_id := NULL;
    RETURN NEW;
  END IF;

  v_permission_code := NULLIF(btrim(v_node->'config'->'required_permissions'->>0), '');

  IF v_subject_type = 'project'
    AND v_node->>'business_kind' = 'payment_collection'
  THEN
    NEW.assignee_permission_code := COALESCE(
      v_permission_code,
      'finance.payment.confirm'
    );
  ELSE
    NEW.assignee_permission_code := v_permission_code;
  END IF;

  RETURN NEW;
END;
$$;

WITH task_projection AS (
  SELECT
    task.id AS task_id,
    task.tenant_id,
    NULLIF(btrim(node->'config'->>'assignee_id'), '') AS assignee_employee_id
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
    AND node->'config'->>'assignee_rule' = 'employee'
    AND NULLIF(btrim(node->'config'->>'assignee_id'), '') ~*
      '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
)
UPDATE public.workflow_tasks task
SET
  assignee_employee_id = task_projection.assignee_employee_id::uuid,
  assignee_role_code = NULL,
  assignee_permission_code = NULL,
  updated_at = now()
FROM task_projection
WHERE task.id = task_projection.task_id
  AND EXISTS (
    SELECT 1
    FROM public.employees employee
    WHERE employee.id = task_projection.assignee_employee_id::uuid
      AND employee.tenant_id = task_projection.tenant_id
      AND employee.status = 'active'
  );

WITH task_projection AS (
  SELECT
    task.id AS task_id,
    task.tenant_id,
    NULLIF(btrim(node->'config'->>'assignee_id'), '') AS assignee_role_code
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
    AND node->'config'->>'assignee_rule' = 'role'
    AND NULLIF(btrim(node->'config'->>'assignee_id'), '') IS NOT NULL
)
UPDATE public.workflow_tasks task
SET
  assignee_employee_id = NULL,
  assignee_role_code = task_projection.assignee_role_code,
  assignee_permission_code = NULL,
  updated_at = now()
FROM task_projection
WHERE task.id = task_projection.task_id
  AND EXISTS (
    SELECT 1
    FROM public.roles role_record
    WHERE role_record.code = task_projection.assignee_role_code
      AND role_record.tenant_id = task_projection.tenant_id
      AND role_record.status = 'active'
  );

COMMENT ON FUNCTION public.set_workflow_task_assignee_permission()
IS 'Projects project payment finance reviewer, approval node employee or role assignee, or fallback permission from workflow node snapshot into workflow_tasks before insert.';
