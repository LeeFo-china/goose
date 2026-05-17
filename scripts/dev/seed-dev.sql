-- Dev environment seed data.
-- Safe to run repeatedly against the shared dev Supabase database.

DO $$
DECLARE
  v_tenant_id uuid;
  v_department_id uuid;
  v_tenant_department_id uuid;
  v_post_id uuid;
  v_employee_id uuid;
  v_system_admin_role_id uuid;
  v_platform_admin_role_id uuid;
BEGIN
  SELECT id
  INTO v_tenant_id
  FROM public.tenants
  WHERE slug = 'gooes_default'
  LIMIT 1;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Dev seed requires default tenant slug=gooes_default';
  END IF;

  SELECT id
  INTO v_department_id
  FROM public.departments
  WHERE tenant_id = v_tenant_id
    AND code = 'EXEC_OFFICE'
  LIMIT 1;

  SELECT id
  INTO v_tenant_department_id
  FROM public.tenant_departments
  WHERE tenant_id = v_tenant_id
    AND code = 'EXEC_OFFICE'
  LIMIT 1;

  SELECT id
  INTO v_post_id
  FROM public.posts
  WHERE tenant_id = v_tenant_id
    AND code = 'GENERAL_MANAGER'
  LIMIT 1;

  SELECT id
  INTO v_system_admin_role_id
  FROM public.roles
  WHERE tenant_id = v_tenant_id
    AND code = 'system_admin'
  LIMIT 1;

  SELECT id
  INTO v_platform_admin_role_id
  FROM public.roles
  WHERE tenant_id IS NULL
    AND code = 'platform_admin'
  LIMIT 1;

  IF v_system_admin_role_id IS NULL THEN
    RAISE EXCEPTION 'Dev seed requires tenant role code=system_admin';
  END IF;

  INSERT INTO public.employees (
    tenant_id,
    name,
    phone,
    department_id,
    tenant_department_id,
    post_id,
    status
  )
  VALUES (
    v_tenant_id,
    'Dev 超级管理员',
    '19900000001',
    v_department_id,
    v_tenant_department_id,
    v_post_id,
    'active'
  )
  ON CONFLICT (tenant_id, phone)
  WHERE tenant_id IS NOT NULL AND phone IS NOT NULL
  DO UPDATE SET
    name = EXCLUDED.name,
    department_id = EXCLUDED.department_id,
    tenant_department_id = EXCLUDED.tenant_department_id,
    post_id = EXCLUDED.post_id,
    status = EXCLUDED.status
  RETURNING id INTO v_employee_id;

  INSERT INTO public.employee_roles (employee_id, role_id)
  VALUES (v_employee_id, v_system_admin_role_id)
  ON CONFLICT (employee_id, role_id) DO NOTHING;

  IF v_platform_admin_role_id IS NOT NULL THEN
    INSERT INTO public.employee_roles (employee_id, role_id)
    VALUES (v_employee_id, v_platform_admin_role_id)
    ON CONFLICT (employee_id, role_id) DO NOTHING;
  END IF;

  INSERT INTO public.customers (
    tenant_id,
    name,
    phone,
    source,
    status,
    owner_id,
    tags,
    customer_origin
  )
  VALUES
    (
      v_tenant_id,
      'Dev 客户 A',
      '19900001001',
      'referral',
      'potential',
      v_employee_id,
      '["dev"]'::jsonb,
      'employee_created'
    ),
    (
      v_tenant_id,
      'Dev 客户 B',
      '19900001002',
      'referral',
      'potential',
      v_employee_id,
      '["dev"]'::jsonb,
      'employee_created'
    )
  ON CONFLICT (tenant_id, phone)
  WHERE tenant_id IS NOT NULL AND phone IS NOT NULL
  DO UPDATE SET
    name = EXCLUDED.name,
    source = EXCLUDED.source,
    status = EXCLUDED.status,
    owner_id = EXCLUDED.owner_id,
    tags = EXCLUDED.tags,
    customer_origin = EXCLUDED.customer_origin;

  INSERT INTO public.tenant_credit_accounts (
    tenant_id,
    balance_credits,
    frozen_credits,
    total_recharged_credits,
    total_consumed_credits,
    total_granted_credits,
    status,
    is_test,
    last_recharged_at,
    last_activity_at
  )
  VALUES (
    v_tenant_id,
    1000000,
    0,
    1000000,
    0,
    1000000,
    'active',
    true,
    now(),
    now()
  )
  ON CONFLICT (tenant_id)
  DO UPDATE SET
    status = 'active',
    is_test = true,
    last_activity_at = now();
END $$;

SELECT
  tenant.name AS tenant_name,
  employee.name AS dev_admin_name,
  employee.phone AS dev_admin_phone,
  count(customer.id) FILTER (
    WHERE customer.phone IN ('19900001001', '19900001002')
  ) AS dev_customer_count
FROM public.tenants AS tenant
LEFT JOIN public.employees AS employee
  ON employee.tenant_id = tenant.id
  AND employee.phone = '19900000001'
LEFT JOIN public.customers AS customer
  ON customer.tenant_id = tenant.id
WHERE tenant.slug = 'gooes_default'
GROUP BY tenant.name, employee.name, employee.phone;
