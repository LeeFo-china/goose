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
  v_subject_id text;
  v_assignee_rule text;
  v_assignee_id text;
  v_department_manager_employee_id uuid;
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

  SELECT instance.subject_type, instance.subject_id
  INTO v_subject_type, v_subject_id
  FROM public.workflow_instances instance
  WHERE instance.id = NEW.instance_id
    AND instance.tenant_id = NEW.tenant_id
  LIMIT 1;

  v_permission_code := NULLIF(btrim(v_node->'config'->>'assignee_permission_code'), '');
  IF v_permission_code IS NULL THEN
    v_permission_code := NULLIF(btrim(v_node->'config'->'required_permissions'->>0), '');
  END IF;

  IF NEW.assignee_employee_id IS NOT NULL THEN
    NEW.assignee_permission_code := NULL;
    NEW.assignee_role_code := NULL;
    RETURN NEW;
  END IF;

  IF NEW.assignee_role_code IS NOT NULL
    OR NEW.assignee_permission_code IS NOT NULL
  THEN
    IF NEW.assignee_role_code IS NOT NULL
      AND NEW.assignee_permission_code IS NULL
    THEN
      NEW.assignee_permission_code := v_permission_code;
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

  v_assignee_rule := NULLIF(btrim(v_node->'config'->>'assignee_rule'), '');
  v_assignee_id := NULLIF(btrim(v_node->'config'->>'assignee_id'), '');

  IF v_assignee_rule = 'applicant_department_manager'
    AND v_subject_type = 'expense_request'
    AND v_subject_id ~* v_uuid_pattern
  THEN
    SELECT department.manager_employee_id
    INTO v_department_manager_employee_id
    FROM public.expense_requests request
    JOIN public.employees applicant
      ON applicant.id = request.employee_id
     AND applicant.tenant_id = NEW.tenant_id
    JOIN public.tenant_departments department
      ON department.id = applicant.tenant_department_id
     AND department.tenant_id = NEW.tenant_id
    JOIN public.employees manager
      ON manager.id = department.manager_employee_id
     AND manager.tenant_id = NEW.tenant_id
     AND manager.status = 'active'
     AND manager.tenant_department_id = department.id
    WHERE request.id = v_subject_id::uuid
      AND request.tenant_id = NEW.tenant_id
    LIMIT 1;

    IF v_department_manager_employee_id IS NOT NULL THEN
      NEW.assignee_employee_id := v_department_manager_employee_id;
      NEW.assignee_permission_code := NULL;
      NEW.assignee_role_code := NULL;
      RETURN NEW;
    END IF;
  END IF;

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
    NEW.assignee_permission_code := v_permission_code;
    NEW.assignee_employee_id := NULL;
    RETURN NEW;
  END IF;

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
      config = jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(
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
              '{assignee_id}',
              to_jsonb('finance_base'::text),
              true
            ),
            '{assignee_permission_code}',
            to_jsonb('expense_request.approve_finance'::text),
            true
          ),
          '{required_permissions}',
          to_jsonb(ARRAY['expense_request.approve_finance']::text[]),
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
      config = jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(
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
              '{assignee_id}',
              to_jsonb('finance_base'::text),
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
      '费用审批流程 v5：补充财务办理权限',
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

WITH task_projection AS (
  SELECT
    task.id AS task_id,
    node->>'node_key' AS node_key
  FROM public.workflow_tasks task
  JOIN public.workflow_instances instance
    ON instance.id = task.instance_id
   AND instance.tenant_id = task.tenant_id
  JOIN public.workflow_versions version
    ON version.id = task.version_id
   AND version.tenant_id = task.tenant_id
   AND version.definition_id = task.definition_id
  CROSS JOIN LATERAL jsonb_array_elements(
    COALESCE(version.snapshot->'nodes', '[]'::jsonb)
  ) AS node
  WHERE task.status = 'pending'
    AND task.assignee_employee_id IS NULL
    AND instance.subject_type = 'expense_request'
    AND node->>'id' = task.node_id::text
    AND node->>'node_key' IN ('finance_review', 'payment')
)
UPDATE public.workflow_tasks task
SET
  assignee_role_code = 'finance_base',
  assignee_permission_code = CASE
    WHEN task_projection.node_key = 'payment' THEN 'expense_request.pay'
    ELSE 'expense_request.approve_finance'
  END,
  updated_at = now()
FROM task_projection
WHERE task.id = task_projection.task_id;

COMMENT ON FUNCTION public.set_workflow_task_assignee_permission()
IS 'Projects workflow task assignees from node config. Direct employee wins; role assignees may also carry assignee_permission_code for role-and-permission intersection.';
