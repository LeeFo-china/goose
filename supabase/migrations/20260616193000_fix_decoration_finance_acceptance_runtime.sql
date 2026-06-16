-- Decoration finance phase 1 acceptance fixes:
-- - Bind finance permissions to system and finance roles.
-- - Default project payment_collection tasks to finance.payment.confirm.
-- - Repair dev/e2e workflow runtime data so the finance smoke can run against
--   a real project without leaving invalid project workflow subjects around.

INSERT INTO public.role_permissions (role_id, permission_id, access_scope)
SELECT roles.id, permissions.id, 'all'
FROM public.roles
JOIN public.permissions
  ON permissions.code LIKE 'finance.%'
WHERE roles.code = 'system_admin'
ON CONFLICT (role_id, permission_id) DO UPDATE SET
  access_scope = EXCLUDED.access_scope;

INSERT INTO public.role_permissions (role_id, permission_id, access_scope)
SELECT roles.id, permissions.id, 'all'
FROM public.roles
JOIN public.permissions
  ON permissions.code LIKE 'finance.%'
WHERE roles.code = 'finance_base'
ON CONFLICT (role_id, permission_id) DO UPDATE SET
  access_scope = EXCLUDED.access_scope;

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

  IF NEW.assignee_employee_id IS NULL
    AND v_subject_type = 'project'
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
  v_tenant_id uuid := '3eebca47-961f-4899-b976-a3d3208d326b';
  v_smoke_project_id uuid := '00000000-0000-4000-8000-202606160006';
  v_payment_instance_id uuid := '4aacb93e-2913-4e00-b573-d64c903910f7';
  v_payment_task_id uuid := 'a5a0f473-467c-4b2c-84a8-218ceb7cf5b1';
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.tenants tenant
    WHERE tenant.id = v_tenant_id
  ) THEN
    INSERT INTO public.projects (
      id,
      tenant_id,
      name,
      address,
      status,
      budget,
      signed_amount,
      visibility_status,
      updated_at
    )
    VALUES (
      v_smoke_project_id,
      v_tenant_id,
      '装修财务一期 Smoke 项目',
      '装修财务一期验收专用',
      'constructing',
      100000,
      100000,
      'hidden',
      now()
    )
    ON CONFLICT (id) DO UPDATE SET
      tenant_id = EXCLUDED.tenant_id,
      name = EXCLUDED.name,
      address = EXCLUDED.address,
      status = EXCLUDED.status,
      budget = EXCLUDED.budget,
      signed_amount = EXCLUDED.signed_amount,
      visibility_status = EXCLUDED.visibility_status,
      updated_at = now();

    UPDATE public.workflow_instances instance
    SET
      subject_type = 'project',
      subject_id = v_smoke_project_id::text,
      updated_at = now()
    WHERE instance.id = v_payment_instance_id
      AND instance.tenant_id = v_tenant_id
      AND instance.status = 'running'
      AND NOT EXISTS (
        SELECT 1
        FROM public.projects project
        WHERE project.id::text = instance.subject_id
      );

    DELETE FROM public.workflow_subject_states state
    WHERE state.tenant_id = v_tenant_id
      AND (
        state.subject_id LIKE 'branch-%'
        OR (
          state.subject_type = 'project'
          AND state.subject_id ~ '^00000000-0000-4000-8000-[0-9]+$'
          AND state.subject_id <> v_smoke_project_id::text
          AND NOT EXISTS (
            SELECT 1
            FROM public.projects project
            WHERE project.id::text = state.subject_id
          )
        )
      );

    DELETE FROM public.workflow_instances instance
    WHERE instance.tenant_id = v_tenant_id
      AND instance.id <> v_payment_instance_id
      AND (
        instance.subject_id LIKE 'branch-%'
        OR (
          instance.subject_type = 'project'
          AND instance.subject_id ~ '^00000000-0000-4000-8000-[0-9]+$'
          AND NOT EXISTS (
            SELECT 1
            FROM public.projects project
            WHERE project.id::text = instance.subject_id
          )
        )
      );

    UPDATE public.workflow_tasks task
    SET
      assignee_employee_id = NULL,
      assignee_role_code = NULL,
      assignee_permission_code = 'finance.payment.confirm',
      updated_at = now()
    WHERE task.id = v_payment_task_id
      AND task.tenant_id = v_tenant_id
      AND task.status = 'pending';

    DELETE FROM public.workflow_subject_states state
    WHERE state.tenant_id = v_tenant_id
      AND state.subject_type = 'project'
      AND state.subject_id = v_smoke_project_id::text;

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
    WHERE instance.id = v_payment_instance_id
      AND instance.tenant_id = v_tenant_id
      AND instance.subject_id = v_smoke_project_id::text
    ON CONFLICT (tenant_id, subject_type, subject_id)
    DO UPDATE SET
      definition_id = EXCLUDED.definition_id,
      instance_id = EXCLUDED.instance_id,
      instance_status = EXCLUDED.instance_status,
      current_node_key = EXCLUDED.current_node_key,
      current_node_title = EXCLUDED.current_node_title,
      current_business_kind = EXCLUDED.current_business_kind,
      pending_task_count = EXCLUDED.pending_task_count,
      updated_at = now();
  END IF;
END $$;

WITH payment_task_projection AS (
  SELECT
    task.id AS task_id,
    task.tenant_id,
    NULLIF(btrim(node->'config'->>'finance_reviewer_employee_id'), '') AS finance_reviewer_employee_id,
    COALESCE(
      NULLIF(btrim(node->'config'->'required_permissions'->>0), ''),
      'finance.payment.confirm'
    ) AS permission_code
  FROM public.workflow_tasks task
  JOIN public.workflow_instances instance
    ON instance.id = task.instance_id
   AND instance.tenant_id = task.tenant_id
  JOIN public.projects project
    ON project.id::text = instance.subject_id
   AND project.tenant_id = task.tenant_id
  JOIN public.workflow_versions version
    ON version.id = task.version_id
   AND version.tenant_id = task.tenant_id
   AND version.definition_id = task.definition_id
  CROSS JOIN LATERAL jsonb_array_elements(
    COALESCE(version.snapshot->'nodes', '[]'::jsonb)
  ) AS node
  WHERE task.status = 'pending'
    AND instance.subject_type = 'project'
    AND node->>'id' = task.node_id::text
    AND node->>'business_kind' = 'payment_collection'
),
resolved_payment_task_projection AS (
  SELECT
    projection.task_id,
    CASE
      WHEN projection.finance_reviewer_employee_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        AND EXISTS (
          SELECT 1
          FROM public.employees employee
          WHERE employee.id = projection.finance_reviewer_employee_id::uuid
            AND employee.tenant_id = projection.tenant_id
        )
      THEN projection.finance_reviewer_employee_id::uuid
      ELSE NULL
    END AS assignee_employee_id,
    projection.permission_code
  FROM payment_task_projection projection
)
UPDATE public.workflow_tasks task
SET
  assignee_employee_id = resolved.assignee_employee_id,
  assignee_role_code = NULL,
  assignee_permission_code = CASE
    WHEN resolved.assignee_employee_id IS NULL THEN resolved.permission_code
    ELSE NULL
  END,
  updated_at = now()
FROM resolved_payment_task_projection resolved
WHERE task.id = resolved.task_id;

COMMENT ON FUNCTION public.set_workflow_task_assignee_permission()
IS 'Projects project payment_collection tasks to a finance reviewer when configured; otherwise defaults them to finance.payment.confirm.';
