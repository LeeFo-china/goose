BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

-- Rollback: forward-fix by replacing or dropping this additive read-only RPC.
CREATE OR REPLACE FUNCTION public.list_accessible_supplier_purchase_batch_workflow_tasks(
  p_tenant_id uuid,
  p_employee_id uuid,
  p_role_codes text[] DEFAULT '{}'::text[],
  p_permission_codes text[] DEFAULT '{}'::text[],
  p_visible_project_ids uuid[] DEFAULT NULL,
  p_status text DEFAULT 'pending',
  p_subject_id text DEFAULT NULL,
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 20
)
RETURNS TABLE (
  id uuid,
  tenant_id uuid,
  instance_id uuid,
  instance_node_id uuid,
  definition_id uuid,
  version_id uuid,
  node_id uuid,
  node_key text,
  node_type text,
  title text,
  status text,
  assignee_employee_id uuid,
  assignee_role_code text,
  assignee_permission_code text,
  assignee_employee jsonb,
  due_at timestamptz,
  completed_by uuid,
  completed_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  instance jsonb,
  total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_role_codes text[] := coalesce(p_role_codes, '{}'::text[]);
  v_permission_codes text[] := coalesce(p_permission_codes, '{}'::text[]);
  v_visible_project_ids uuid[] := p_visible_project_ids;
  v_status text := coalesce(nullif(btrim(p_status), ''), 'pending');
  v_page integer := greatest(coalesce(p_page, 1), 1);
  v_page_size integer := least(greatest(coalesce(p_page_size, 20), 1), 100);
  v_offset integer := (greatest(coalesce(p_page, 1), 1) - 1)
    * least(greatest(coalesce(p_page_size, 20), 1), 100);
BEGIN
  IF p_tenant_id IS NULL OR p_employee_id IS NULL THEN
    RETURN;
  END IF;
  IF v_status NOT IN ('pending', 'completed', 'canceled') THEN
    RAISE EXCEPTION 'WORKFLOW_TASK_STATUS_INVALID' USING ERRCODE = '22023';
  END IF;
  IF v_visible_project_ids IS NOT NULL
    AND cardinality(v_visible_project_ids) = 0 THEN
    RETURN;
  END IF;
  IF v_visible_project_ids IS NOT NULL
    AND cardinality(v_visible_project_ids) > 10000 THEN
    RAISE EXCEPTION 'VISIBLE_PROJECT_IDS_LIMIT_EXCEEDED' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT
    task.id,
    task.tenant_id,
    task.instance_id,
    task.instance_node_id,
    task.definition_id,
    task.version_id,
    task.node_id,
    task.node_key,
    task.node_type,
    task.title,
    task.status,
    task.assignee_employee_id,
    task.assignee_role_code,
    task.assignee_permission_code,
    CASE
      WHEN employee.id IS NULL THEN NULL
      ELSE jsonb_build_object(
        'id', employee.id,
        'name', employee.name,
        'avatar', employee.avatar
      )
    END AS assignee_employee,
    task.due_at,
    task.completed_by,
    task.completed_at,
    task.created_at,
    task.updated_at,
    jsonb_build_object(
      'id', instance.id,
      'subject_type', instance.subject_type,
      'subject_id', instance.subject_id,
      'status', instance.status,
      'current_node_key', instance.current_node_key,
      'current_node_snapshot', instance.current_node_snapshot
    ) AS instance,
    count(*) OVER() AS total_count
  FROM public.workflow_tasks AS task
  JOIN public.workflow_instances AS instance
    ON instance.id = task.instance_id
    AND instance.tenant_id = task.tenant_id
  JOIN public.supplier_purchase_batches AS batch
    ON batch.id::text = instance.subject_id
    AND batch.tenant_id = task.tenant_id
  LEFT JOIN public.employees AS employee
    ON employee.id = task.assignee_employee_id
    AND employee.tenant_id = task.tenant_id
  WHERE task.tenant_id = p_tenant_id
    AND task.status = v_status
    AND instance.subject_type = 'supplier_purchase_batch'
    AND (p_subject_id IS NULL OR instance.subject_id = p_subject_id)
    AND (
      v_status <> 'pending'
      OR (
        instance.status = 'running'
        AND instance.current_node_key = task.node_key
      )
    )
    AND (
      v_visible_project_ids IS NULL
      OR batch.project_id = ANY(v_visible_project_ids)
    )
    AND batch.submitted_by_employee_id IS DISTINCT FROM p_employee_id
    AND (
      task.assignee_employee_id = p_employee_id
      OR (
        task.assignee_employee_id IS NULL
        AND task.assignee_role_code = ANY(v_role_codes)
        AND task.assignee_permission_code IS NULL
      )
      OR (
        task.assignee_employee_id IS NULL
        AND task.assignee_role_code IS NULL
        AND task.assignee_permission_code = ANY(v_permission_codes)
      )
      OR (
        task.assignee_employee_id IS NULL
        AND task.assignee_role_code = ANY(v_role_codes)
        AND task.assignee_permission_code = ANY(v_permission_codes)
      )
      OR (
        task.assignee_employee_id IS NULL
        AND task.assignee_role_code IS NULL
        AND task.assignee_permission_code IS NULL
      )
    )
  ORDER BY task.updated_at DESC, task.id DESC
  OFFSET v_offset
  LIMIT v_page_size;
END;
$$;

REVOKE ALL ON FUNCTION public.list_accessible_supplier_purchase_batch_workflow_tasks(
  uuid,
  uuid,
  text[],
  text[],
  uuid[],
  text,
  text,
  integer,
  integer
) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.list_accessible_supplier_purchase_batch_workflow_tasks(
  uuid,
  uuid,
  text[],
  text[],
  uuid[],
  text,
  text,
  integer,
  integer
) TO service_role;

CREATE OR REPLACE FUNCTION public.list_accessible_workflow_tasks_with_supplier_scope(
  p_tenant_id uuid,
  p_employee_id uuid DEFAULT NULL,
  p_role_codes text[] DEFAULT '{}'::text[],
  p_permission_codes text[] DEFAULT '{}'::text[],
  p_status text DEFAULT 'pending',
  p_subject_type text DEFAULT NULL,
  p_subject_id text DEFAULT NULL,
  p_instance_id uuid DEFAULT NULL,
  p_supplier_access_allowed boolean DEFAULT false,
  p_supplier_employee_id uuid DEFAULT NULL,
  p_supplier_visible_project_ids uuid[] DEFAULT NULL,
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 20
)
RETURNS TABLE (
  id uuid,
  tenant_id uuid,
  instance_id uuid,
  instance_node_id uuid,
  definition_id uuid,
  version_id uuid,
  node_id uuid,
  node_key text,
  node_type text,
  title text,
  status text,
  assignee_employee_id uuid,
  assignee_role_code text,
  assignee_permission_code text,
  assignee_employee jsonb,
  due_at timestamptz,
  completed_by uuid,
  completed_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  instance jsonb,
  total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_role_codes text[] := coalesce(p_role_codes, '{}'::text[]);
  v_permission_codes text[] := coalesce(p_permission_codes, '{}'::text[]);
  v_status text := coalesce(nullif(btrim(p_status), ''), 'pending');
  v_supplier_visible_project_ids uuid[] := p_supplier_visible_project_ids;
  v_page integer := greatest(coalesce(p_page, 1), 1);
  v_page_size integer := least(greatest(coalesce(p_page_size, 20), 1), 100);
  v_offset integer := (greatest(coalesce(p_page, 1), 1) - 1)
    * least(greatest(coalesce(p_page_size, 20), 1), 100);
BEGIN
  IF p_tenant_id IS NULL THEN
    RETURN;
  END IF;
  IF v_status NOT IN ('pending', 'completed', 'canceled') THEN
    RAISE EXCEPTION 'WORKFLOW_TASK_STATUS_INVALID' USING ERRCODE = '22023';
  END IF;
  IF v_supplier_visible_project_ids IS NOT NULL
    AND cardinality(v_supplier_visible_project_ids) > 10000 THEN
    RAISE EXCEPTION 'VISIBLE_PROJECT_IDS_LIMIT_EXCEEDED' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT
    task.id,
    task.tenant_id,
    task.instance_id,
    task.instance_node_id,
    task.definition_id,
    task.version_id,
    task.node_id,
    task.node_key,
    task.node_type,
    task.title,
    task.status,
    task.assignee_employee_id,
    task.assignee_role_code,
    task.assignee_permission_code,
    CASE
      WHEN employee.id IS NULL THEN NULL
      ELSE jsonb_build_object(
        'id', employee.id,
        'name', employee.name,
        'avatar', employee.avatar
      )
    END AS assignee_employee,
    task.due_at,
    task.completed_by,
    task.completed_at,
    task.created_at,
    task.updated_at,
    jsonb_build_object(
      'id', instance.id,
      'subject_type', instance.subject_type,
      'subject_id', instance.subject_id,
      'status', instance.status,
      'current_node_key', instance.current_node_key,
      'current_node_snapshot', instance.current_node_snapshot
    ) AS instance,
    count(*) OVER() AS total_count
  FROM public.workflow_tasks AS task
  JOIN public.workflow_instances AS instance
    ON instance.id = task.instance_id
    AND instance.tenant_id = task.tenant_id
  LEFT JOIN public.supplier_purchase_batches AS batch
    ON batch.id::text = instance.subject_id
    AND batch.tenant_id = task.tenant_id
  LEFT JOIN public.employees AS employee
    ON employee.id = task.assignee_employee_id
    AND employee.tenant_id = task.tenant_id
  WHERE task.tenant_id = p_tenant_id
    AND task.status = v_status
    AND (p_subject_type IS NULL OR instance.subject_type = p_subject_type)
    AND (p_subject_id IS NULL OR instance.subject_id = p_subject_id)
    AND (p_instance_id IS NULL OR task.instance_id = p_instance_id)
    AND (
      instance.subject_type <> 'supplier_purchase_batch'
      OR (
        p_supplier_access_allowed
        AND p_supplier_employee_id IS NOT NULL
        AND batch.id IS NOT NULL
        AND (
          v_supplier_visible_project_ids IS NULL
          OR batch.project_id = ANY(v_supplier_visible_project_ids)
        )
        AND batch.submitted_by_employee_id IS DISTINCT FROM p_supplier_employee_id
        AND (
          v_status <> 'pending'
          OR (
            instance.status = 'running'
            AND instance.current_node_key = task.node_key
          )
        )
      )
    )
    AND (
      (p_employee_id IS NOT NULL AND task.assignee_employee_id = p_employee_id)
      OR (
        task.assignee_employee_id IS NULL
        AND task.assignee_role_code = ANY(v_role_codes)
        AND task.assignee_permission_code IS NULL
      )
      OR (
        task.assignee_employee_id IS NULL
        AND task.assignee_role_code IS NULL
        AND task.assignee_permission_code = ANY(v_permission_codes)
      )
      OR (
        task.assignee_employee_id IS NULL
        AND task.assignee_role_code = ANY(v_role_codes)
        AND task.assignee_permission_code = ANY(v_permission_codes)
      )
      OR (
        task.assignee_employee_id IS NULL
        AND task.assignee_role_code IS NULL
        AND task.assignee_permission_code IS NULL
      )
    )
  ORDER BY task.updated_at DESC, task.id DESC
  OFFSET v_offset
  LIMIT v_page_size;
END;
$$;

REVOKE ALL ON FUNCTION public.list_accessible_workflow_tasks_with_supplier_scope(
  uuid,
  uuid,
  text[],
  text[],
  text,
  text,
  text,
  uuid,
  boolean,
  uuid,
  uuid[],
  integer,
  integer
) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.list_accessible_workflow_tasks_with_supplier_scope(
  uuid,
  uuid,
  text[],
  text[],
  text,
  text,
  text,
  uuid,
  boolean,
  uuid,
  uuid[],
  integer,
  integer
) TO service_role;

COMMIT;
