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
    AND v_permission_code IS NOT NULL
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
      AND NOT EXISTS (
        SELECT 1
        FROM public.employee_permission_overrides override_record
        JOIN public.permissions permission_record
          ON permission_record.id = override_record.permission_id
         AND permission_record.code = v_permission_code
         AND permission_record.status = 'active'
        WHERE override_record.employee_id = manager.id
          AND override_record.effect = 'deny'
      )
      AND (
        EXISTS (
          SELECT 1
          FROM public.employee_roles employee_role
          JOIN public.roles role_record
            ON role_record.id = employee_role.role_id
           AND role_record.status = 'active'
           AND (
             role_record.tenant_id = NEW.tenant_id
             OR role_record.tenant_id IS NULL
           )
          JOIN public.role_permissions role_permission
            ON role_permission.role_id = role_record.id
           AND role_permission.access_scope IN ('department', 'all')
          JOIN public.permissions permission_record
            ON permission_record.id = role_permission.permission_id
           AND permission_record.code = v_permission_code
           AND permission_record.status = 'active'
          WHERE employee_role.employee_id = manager.id
        )
        OR EXISTS (
          SELECT 1
          FROM public.employee_permission_overrides override_record
          JOIN public.permissions permission_record
            ON permission_record.id = override_record.permission_id
           AND permission_record.code = v_permission_code
           AND permission_record.status = 'active'
          WHERE override_record.employee_id = manager.id
            AND override_record.effect = 'allow'
            AND override_record.access_scope IN ('department', 'all')
        )
      )
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
