CREATE OR REPLACE FUNCTION public.create_project_log_fast(
  p_tenant_id uuid,
  p_employee_id uuid,
  p_project_id uuid,
  p_stage_code text,
  p_node_name text,
  p_content text,
  p_images jsonb DEFAULT '[]'::jsonb,
  p_project_log_scope text DEFAULT NULL,
  p_tenant_department_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_project record;
  v_previous_stage text;
  v_previous_accepted boolean := false;
  v_target_acceptance_status text;
  v_can_write boolean := false;
  v_log record;
  v_employee jsonb;
  v_stage_label text;
  v_previous_stage_label text;
BEGIN
  IF p_tenant_id IS NULL OR p_employee_id IS NULL THEN
    RETURN jsonb_build_object(
      'error',
      jsonb_build_object(
        'status_code', 403,
        'code', 'PROJECT_LOG_PERMISSION_DENIED',
        'message', '无施工日志创建权限'
      )
    );
  END IF;

  SELECT id, tenant_id, status
  INTO v_project
  FROM public.projects
  WHERE id = p_project_id
    AND tenant_id = p_tenant_id
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'error',
      jsonb_build_object(
        'status_code', 404,
        'code', 'PROJECT_LOG_PROJECT_NOT_FOUND',
        'message', '项目不存在或不可见'
      )
    );
  END IF;

  IF v_project.status NOT IN ('started', 'constructing') THEN
    RETURN jsonb_build_object(
      'error',
      jsonb_build_object(
        'status_code', 400,
        'code', 'PROJECT_LOG_PROJECT_STATUS_BLOCKED',
        'message', CASE v_project.status
          WHEN 'invalid' THEN '无效项目不能新增施工日志'
          WHEN 'on_hold' THEN '暂停项目不能新增施工日志'
          WHEN 'acceptance' THEN '竣工验收项目不能新增施工日志'
          ELSE '当前项目状态不能新增施工日志'
        END
      )
    );
  END IF;

  v_stage_label := CASE p_stage_code
    WHEN 'demolition' THEN '拆改'
    WHEN 'plumbing_electrical' THEN '水电'
    WHEN 'tiling' THEN '瓦工'
    WHEN 'woodwork' THEN '木工'
    WHEN 'painting' THEN '油工'
    WHEN 'installation' THEN '安装'
    ELSE p_stage_code
  END;

  IF p_stage_code NOT IN (
    'demolition',
    'plumbing_electrical',
    'tiling',
    'woodwork',
    'painting',
    'installation'
  ) THEN
    RETURN jsonb_build_object(
      'error',
      jsonb_build_object(
        'status_code', 400,
        'code', 'PROJECT_LOG_STAGE_NOT_WRITABLE',
        'message', '当前阶段不可写施工日志'
      )
    );
  END IF;

  v_previous_stage := CASE p_stage_code
    WHEN 'plumbing_electrical' THEN 'demolition'
    WHEN 'tiling' THEN 'plumbing_electrical'
    WHEN 'woodwork' THEN 'tiling'
    WHEN 'painting' THEN 'woodwork'
    WHEN 'installation' THEN 'painting'
    ELSE NULL
  END;

  IF v_previous_stage IS NOT NULL THEN
    v_previous_stage_label := CASE v_previous_stage
      WHEN 'demolition' THEN '拆改'
      WHEN 'plumbing_electrical' THEN '水电'
      WHEN 'tiling' THEN '瓦工'
      WHEN 'woodwork' THEN '木工'
      WHEN 'painting' THEN '油工'
      WHEN 'installation' THEN '安装'
      ELSE v_previous_stage
    END;

    SELECT latest.status = 'customer_confirmed'
    INTO v_previous_accepted
    FROM (
      SELECT status
      FROM public.project_acceptances
      WHERE project_id = p_project_id
        AND tenant_id = p_tenant_id
        AND stage_code = v_previous_stage
        AND status <> 'cancelled'
      ORDER BY
        CASE status
          WHEN 'draft' THEN 1
          WHEN 'rejected' THEN 1
          WHEN 'submitted' THEN 2
          WHEN 'leader_approved' THEN 2
          WHEN 'customer_confirmed' THEN 3
          ELSE 99
        END ASC,
        COALESCE(updated_at, created_at) DESC
      LIMIT 1
    ) AS latest;

    IF COALESCE(v_previous_accepted, false) IS FALSE THEN
      RETURN jsonb_build_object(
        'error',
        jsonb_build_object(
          'status_code', 400,
          'code', 'PROJECT_LOG_STAGE_BLOCKED',
          'message', '请先完成' || v_previous_stage_label || '后再进入' || v_stage_label
        )
      );
    END IF;
  END IF;

  SELECT status
  INTO v_target_acceptance_status
  FROM public.project_acceptances
  WHERE project_id = p_project_id
    AND tenant_id = p_tenant_id
    AND stage_code = p_stage_code
    AND status <> 'cancelled'
  ORDER BY
    CASE status
      WHEN 'draft' THEN 1
      WHEN 'rejected' THEN 1
      WHEN 'submitted' THEN 2
      WHEN 'leader_approved' THEN 2
      WHEN 'customer_confirmed' THEN 3
      ELSE 99
    END ASC,
    COALESCE(updated_at, created_at) DESC
  LIMIT 1;

  IF v_target_acceptance_status = 'customer_confirmed' THEN
    RETURN jsonb_build_object(
      'error',
      jsonb_build_object(
        'status_code', 400,
        'code', 'PROJECT_LOG_STAGE_NOT_WRITABLE',
        'message', '当前' || v_stage_label || '阶段已验收完成，不能继续补充施工日志'
      )
    );
  END IF;

  IF v_target_acceptance_status IS NOT NULL
    AND v_target_acceptance_status <> 'rejected'
  THEN
    RETURN jsonb_build_object(
      'error',
      jsonb_build_object(
        'status_code', 400,
        'code', 'PROJECT_LOG_STAGE_BLOCKED',
        'message', '当前' || v_stage_label || '阶段待验收，完成验收后再补充施工日志'
      )
    );
  END IF;

  IF p_project_log_scope = 'all' THEN
    v_can_write := true;
  ELSIF p_project_log_scope = 'department' AND p_tenant_department_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.project_members AS member
      JOIN public.employees AS employee
        ON employee.id = member.employee_id
      WHERE member.project_id = p_project_id
        AND member.deleted_at IS NULL
        AND employee.tenant_id = p_tenant_id
        AND employee.tenant_department_id = p_tenant_department_id
      LIMIT 1
    )
    INTO v_can_write;
  ELSIF p_project_log_scope IN ('self', 'assigned') THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.project_members AS member
      WHERE member.project_id = p_project_id
        AND member.employee_id = p_employee_id
        AND member.deleted_at IS NULL
      LIMIT 1
    )
    INTO v_can_write;
  END IF;

  IF NOT COALESCE(v_can_write, false) THEN
    RETURN jsonb_build_object(
      'error',
      jsonb_build_object(
        'status_code', 403,
        'code', 'PROJECT_LOG_PERMISSION_DENIED',
        'message', '无施工日志创建权限'
      )
    );
  END IF;

  INSERT INTO public.project_logs (
    project_id,
    tenant_id,
    employee_id,
    stage_code,
    node_name,
    content,
    images
  )
  VALUES (
    p_project_id,
    p_tenant_id,
    p_employee_id,
    p_stage_code,
    NULLIF(BTRIM(COALESCE(p_node_name, '')), ''),
    BTRIM(COALESCE(p_content, '')),
    COALESCE(p_images, '[]'::jsonb)
  )
  RETURNING *
  INTO v_log;

  SELECT jsonb_build_object(
    'id', employee.id,
    'name', employee.name,
    'avatar', employee.avatar
  )
  INTO v_employee
  FROM public.employees AS employee
  WHERE employee.id = p_employee_id;

  RETURN jsonb_build_object(
    'data',
    to_jsonb(v_log) || jsonb_build_object('employee', v_employee)
  );
END;
$$;

COMMENT ON FUNCTION public.create_project_log_fast(
  uuid,
  uuid,
  uuid,
  text,
  text,
  text,
  jsonb,
  text,
  uuid
) IS 'Creates an employee project log with permission and stage checks in one roundtrip.';
