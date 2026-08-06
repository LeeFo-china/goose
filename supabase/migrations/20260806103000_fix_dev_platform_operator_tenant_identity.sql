-- 修正 dev 历史测试账号混合身份：
-- 19900000001 / Dev 超级管理员 曾同时拥有全局 platform_admin 与
-- 默认装修公司的 system_admin，导致它出现在平台人员列表。
--
-- Rollback: 如需恢复旧 dev fixture，可重新将该员工 tenant_id 置空并
-- 绑定全局 platform_admin 角色；生产环境不应依赖该测试账号。

DO $$
DECLARE
  v_employee_id uuid;
  v_default_tenant_id uuid;
  v_system_admin_role_id uuid;
  v_platform_admin_role_id uuid;
BEGIN
  SELECT id
  INTO v_employee_id
  FROM public.employees
  WHERE id = 'bcf573b8-79e1-4451-a2c1-a1582c8fed72'::uuid
    AND phone = '19900000001'
    AND name = 'Dev 超级管理员'
  LIMIT 1;

  IF v_employee_id IS NULL THEN
    RETURN;
  END IF;

  SELECT id
  INTO v_default_tenant_id
  FROM public.tenants
  WHERE slug = 'gooes_default'
  LIMIT 1;

  SELECT id
  INTO v_platform_admin_role_id
  FROM public.roles
  WHERE tenant_id IS NULL
    AND code = 'platform_admin'
  LIMIT 1;

  IF v_platform_admin_role_id IS NOT NULL THEN
    DELETE FROM public.employee_roles
    WHERE employee_id = v_employee_id
      AND role_id = v_platform_admin_role_id;
  END IF;

  IF v_default_tenant_id IS NULL THEN
    UPDATE public.employees
    SET
      version = COALESCE(version, 0) + 1,
      admin_auth_version = COALESCE(admin_auth_version, 0) + 1
    WHERE id = v_employee_id;
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.employees
    WHERE tenant_id = v_default_tenant_id
      AND phone = '19900000001'
      AND id <> v_employee_id
  ) THEN
    UPDATE public.employees
    SET
      tenant_id = v_default_tenant_id,
      name = 'Dev 租户管理员',
      tenant_department_id = NULL,
      post_id = NULL,
      version = COALESCE(version, 0) + 1,
      admin_auth_version = COALESCE(admin_auth_version, 0) + 1
    WHERE id = v_employee_id;
  ELSE
    UPDATE public.employees
    SET
      version = COALESCE(version, 0) + 1,
      admin_auth_version = COALESCE(admin_auth_version, 0) + 1
    WHERE id = v_employee_id;
  END IF;

  SELECT id
  INTO v_system_admin_role_id
  FROM public.roles
  WHERE tenant_id = v_default_tenant_id
    AND code = 'system_admin'
  LIMIT 1;

  IF v_system_admin_role_id IS NOT NULL THEN
    INSERT INTO public.employee_roles (employee_id, role_id)
    VALUES (v_employee_id, v_system_admin_role_id)
    ON CONFLICT (employee_id, role_id) DO NOTHING;
  END IF;
END $$;
