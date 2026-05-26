CREATE OR REPLACE FUNCTION public.get_employee_permission_context_fast(p_employee_id uuid)
RETURNS TABLE (
  employee jsonb,
  roles jsonb,
  role_permissions jsonb,
  overrides jsonb
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH employee_row AS (
    SELECT
      employee.*,
      tenant.id AS tenant_id_value,
      tenant.name AS tenant_name,
      tenant.slug AS tenant_slug,
      tenant.status AS tenant_status,
      tenant_department.id AS tenant_department_id_value,
      tenant_department.alias_name AS tenant_department_alias_name,
      tenant_department.code AS tenant_department_code,
      post.name AS post_name
    FROM public.employees AS employee
    LEFT JOIN public.tenants AS tenant
      ON tenant.id = employee.tenant_id
    LEFT JOIN public.tenant_departments AS tenant_department
      ON tenant_department.id = employee.tenant_department_id
    LEFT JOIN public.posts AS post
      ON post.id = employee.post_id
    WHERE employee.id = p_employee_id
    LIMIT 1
  ),
  role_rows AS (
    SELECT DISTINCT
      role.id,
      role.tenant_id,
      role.code,
      role.name,
      role.description,
      role.status,
      role.created_at,
      role.updated_at
    FROM public.employee_roles AS employee_role
    JOIN public.roles AS role
      ON role.id = employee_role.role_id
    WHERE employee_role.employee_id = p_employee_id
  ),
  role_permission_rows AS (
    SELECT
      permission.code,
      role_permission.access_scope AS scope
    FROM public.employee_roles AS employee_role
    JOIN public.role_permissions AS role_permission
      ON role_permission.role_id = employee_role.role_id
    JOIN public.permissions AS permission
      ON permission.id = role_permission.permission_id
    WHERE employee_role.employee_id = p_employee_id
  ),
  override_rows AS (
    SELECT
      override.permission_id,
      permission.code AS permission_code,
      permission.name AS permission_name,
      permission.code AS code,
      override.effect,
      override.access_scope,
      override.access_scope AS scope,
      override.reason,
      override.created_at,
      override.updated_at
    FROM public.employee_permission_overrides AS override
    JOIN public.permissions AS permission
      ON permission.id = override.permission_id
    WHERE override.employee_id = p_employee_id
  )
  SELECT
    (
      SELECT jsonb_build_object(
        'id', employee_row.id,
        'user_id', employee_row.user_id,
        'tenant_id', employee_row.tenant_id,
        'status', employee_row.status,
        'tenant_department_id', employee_row.tenant_department_id,
        'post_id', employee_row.post_id,
        'name', employee_row.name,
        'phone', employee_row.phone,
        'avatar', employee_row.avatar,
        'tenant', CASE
          WHEN employee_row.tenant_id_value IS NULL THEN NULL
          ELSE jsonb_build_object(
            'id', employee_row.tenant_id_value,
            'name', employee_row.tenant_name,
            'slug', employee_row.tenant_slug,
            'status', employee_row.tenant_status
          )
        END,
        'tenant_department', CASE
          WHEN employee_row.tenant_department_id_value IS NULL THEN NULL
          ELSE jsonb_build_object(
            'id', employee_row.tenant_department_id_value,
            'alias_name', employee_row.tenant_department_alias_name,
            'code', employee_row.tenant_department_code
          )
        END,
        'post', CASE
          WHEN employee_row.post_id IS NULL THEN NULL
          ELSE jsonb_build_object('name', employee_row.post_name)
        END
      )
      FROM employee_row
    ) AS employee,
    COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', role_rows.id,
          'tenant_id', role_rows.tenant_id,
          'code', role_rows.code,
          'name', role_rows.name,
          'description', role_rows.description,
          'status', role_rows.status,
          'created_at', role_rows.created_at,
          'updated_at', role_rows.updated_at
        )
        ORDER BY role_rows.created_at
      )
      FROM role_rows
    ), '[]'::jsonb) AS roles,
    COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'code', role_permission_rows.code,
          'scope', role_permission_rows.scope
        )
        ORDER BY role_permission_rows.code
      )
      FROM role_permission_rows
    ), '[]'::jsonb) AS role_permissions,
    COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'permission_id', override_rows.permission_id,
          'permission_code', override_rows.permission_code,
          'permission_name', override_rows.permission_name,
          'code', override_rows.code,
          'effect', override_rows.effect,
          'access_scope', override_rows.access_scope,
          'scope', override_rows.scope,
          'reason', override_rows.reason,
          'created_at', override_rows.created_at,
          'updated_at', override_rows.updated_at
        )
        ORDER BY override_rows.created_at
      )
      FROM override_rows
    ), '[]'::jsonb) AS overrides;
$$;

GRANT EXECUTE ON FUNCTION public.get_employee_permission_context_fast(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_employee_permission_context_fast(uuid) TO service_role;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.employees
    WHERE status = 'active'
      AND tenant_id IS NOT NULL
      AND tenant_department_id IS NULL
  ) THEN
    RAISE EXCEPTION 'Cannot drop employees.department_id: active tenant employees without tenant_department_id exist';
  END IF;
END;
$$;

ALTER TABLE public.employees
  DROP CONSTRAINT IF EXISTS employees_department_id_fkey;

ALTER TABLE public.employees
  DROP COLUMN IF EXISTS department_id;
