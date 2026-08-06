-- 为 dev 环境补一个纯平台超管测试账号，避免继续复用租户管理员账号。
-- 仅当存在 gooes_default 默认租户时执行；生产环境不应存在该 dev slug。
--
-- Rollback: 删除手机号 19900000003 对应的 employee_roles 后删除员工行。

DO $$
DECLARE
  v_default_tenant_id uuid;
  v_platform_admin_role_id uuid;
  v_platform_admin_employee_id uuid;
BEGIN
  SELECT id
  INTO v_default_tenant_id
  FROM public.tenants
  WHERE slug = 'gooes_default'
  LIMIT 1;

  IF v_default_tenant_id IS NULL THEN
    RETURN;
  END IF;

  SELECT id
  INTO v_platform_admin_role_id
  FROM public.roles
  WHERE tenant_id IS NULL
    AND code = 'platform_admin'
  LIMIT 1;

  IF v_platform_admin_role_id IS NULL THEN
    RETURN;
  END IF;

  SELECT id
  INTO v_platform_admin_employee_id
  FROM public.employees
  WHERE phone = '19900000003'
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_platform_admin_employee_id IS NULL THEN
    INSERT INTO public.employees (
      tenant_id,
      name,
      phone,
      tenant_department_id,
      post_id,
      status
    )
    VALUES (
      NULL,
      'Dev 平台超管',
      '19900000003',
      NULL,
      NULL,
      'active'
    )
    RETURNING id INTO v_platform_admin_employee_id;
  ELSE
    UPDATE public.employees
    SET
      tenant_id = NULL,
      name = 'Dev 平台超管',
      tenant_department_id = NULL,
      post_id = NULL,
      status = 'active',
      version = COALESCE(version, 0) + 1,
      admin_auth_version = COALESCE(admin_auth_version, 0) + 1
    WHERE id = v_platform_admin_employee_id;
  END IF;

  INSERT INTO public.employee_roles (employee_id, role_id)
  VALUES (v_platform_admin_employee_id, v_platform_admin_role_id)
  ON CONFLICT (employee_id, role_id) DO NOTHING;
END $$;
