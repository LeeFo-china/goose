CREATE OR REPLACE FUNCTION public.schedule_project_construction_transition(
  p_project_id uuid,
  p_tenant_id uuid,
  p_expected_status text,
  p_to_status text,
  p_start_date text,
  p_construction_manager_employee_id uuid,
  p_operator_employee_id uuid,
  p_operator_auth_user_id uuid,
  p_reason text,
  p_metadata jsonb
)
RETURNS public.projects
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_project public.projects%ROWTYPE;
  v_member_id uuid;
  v_role_code text := 'construction_manager';
  v_role_name text := '施工经理';
  v_sort_order integer := 40;
BEGIN
  SELECT *
  INTO v_project
  FROM public.projects
  WHERE id = p_project_id
    AND tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PROJECT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF v_project.status IS DISTINCT FROM p_expected_status THEN
    RAISE EXCEPTION 'PROJECT_STATUS_CONFLICT' USING ERRCODE = 'P0001';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.employees employee
    JOIN public.tenant_departments department
      ON department.id = employee.tenant_department_id
     AND department.tenant_id = p_tenant_id
     AND department.code = 'PROJECT'
     AND department.enabled = true
    WHERE employee.id = p_construction_manager_employee_id
      AND employee.tenant_id = p_tenant_id
      AND employee.status = 'active'
  ) THEN
    RAISE EXCEPTION 'INVALID_CONSTRUCTION_MANAGER' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.project_members
  SET
    is_primary = false,
    updated_at = now()
  WHERE project_id = p_project_id
    AND role_code = v_role_code
    AND deleted_at IS NULL;

  SELECT id
  INTO v_member_id
  FROM public.project_members
  WHERE project_id = p_project_id
    AND employee_id = p_construction_manager_employee_id
    AND role_code = v_role_code
    AND deleted_at IS NULL
  LIMIT 1;

  IF v_member_id IS NULL THEN
    INSERT INTO public.project_members (
      project_id,
      employee_id,
      role_code,
      role_name,
      is_primary,
      sort_order
    )
    VALUES (
      p_project_id,
      p_construction_manager_employee_id,
      v_role_code,
      v_role_name,
      true,
      v_sort_order
    );
  ELSE
    UPDATE public.project_members
    SET
      role_name = v_role_name,
      is_primary = true,
      sort_order = v_sort_order,
      updated_at = now()
    WHERE id = v_member_id;
  END IF;

  UPDATE public.projects
  SET
    start_date = p_start_date,
    status = p_to_status,
    updated_at = now()
  WHERE id = p_project_id
    AND tenant_id = p_tenant_id
  RETURNING *
  INTO v_project;

  INSERT INTO public.project_status_transition_logs (
    tenant_id,
    project_id,
    from_status,
    to_status,
    action,
    operator_employee_id,
    operator_auth_user_id,
    reason,
    metadata
  )
  VALUES (
    p_tenant_id,
    p_project_id,
    p_expected_status,
    p_to_status,
    'schedule_construction',
    p_operator_employee_id,
    p_operator_auth_user_id,
    p_reason,
    COALESCE(p_metadata, '{}'::jsonb)
  );

  RETURN v_project;
END;
$$;

COMMENT ON FUNCTION public.schedule_project_construction_transition(
  uuid,
  uuid,
  text,
  text,
  text,
  uuid,
  uuid,
  uuid,
  text,
  jsonb
) IS '排期开工状态流转。工程负责人候选按租户工程部在职员工校验，不再依赖 project_member_role_post_rules。';
