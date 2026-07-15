-- Dev environment seed data.
-- Safe to run repeatedly against the shared dev Supabase database.

DO $$
DECLARE
  v_tenant_id uuid;
  v_tenant_department_id uuid;
  v_post_id uuid;
  v_employee_id uuid;
  v_tenant_admin_employee_id uuid;
  v_identity_tenant_b_id uuid;
  v_identity_share_employee_id uuid;
  v_identity_partner_level_id uuid;
  v_identity_partner_id uuid;
  v_bound_tenant_auth_user_id uuid := '00000000-0000-4000-8000-000000040008'::uuid;
  v_bound_partner_auth_user_id uuid := '00000000-0000-4000-8000-000000040009'::uuid;
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

  SELECT id
  INTO v_employee_id
  FROM public.employees
  WHERE phone = '19900000001'
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_employee_id IS NULL THEN
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
      'Dev 超级管理员',
      '19900000001',
      NULL,
      NULL,
      'active'
    )
    RETURNING id INTO v_employee_id;
  ELSE
    UPDATE public.employees
    SET
      tenant_id = NULL,
      name = 'Dev 超级管理员',
      tenant_department_id = NULL,
      post_id = NULL,
      status = 'active'
    WHERE id = v_employee_id;
  END IF;

  INSERT INTO public.employee_roles (employee_id, role_id)
  VALUES (v_employee_id, v_system_admin_role_id)
  ON CONFLICT (employee_id, role_id) DO NOTHING;

  IF v_platform_admin_role_id IS NOT NULL THEN
    INSERT INTO public.employee_roles (employee_id, role_id)
    VALUES (v_employee_id, v_platform_admin_role_id)
    ON CONFLICT (employee_id, role_id) DO NOTHING;
  END IF;

  INSERT INTO public.employees (
    tenant_id,
    name,
    phone,
    tenant_department_id,
    post_id,
    status
  )
  VALUES (
    v_tenant_id,
    'Dev 租户管理员',
    '19900000002',
    v_tenant_department_id,
    v_post_id,
    'active'
  )
  ON CONFLICT (tenant_id, phone)
  WHERE tenant_id IS NOT NULL AND phone IS NOT NULL
  DO UPDATE SET
    name = EXCLUDED.name,
    tenant_department_id = EXCLUDED.tenant_department_id,
    post_id = EXCLUDED.post_id,
    status = EXCLUDED.status
  RETURNING id INTO v_tenant_admin_employee_id;

  INSERT INTO public.employee_roles (employee_id, role_id)
  VALUES (v_tenant_admin_employee_id, v_system_admin_role_id)
  ON CONFLICT (employee_id, role_id) DO NOTHING;

  IF v_platform_admin_role_id IS NOT NULL THEN
    DELETE FROM public.employee_roles
    WHERE employee_id = v_tenant_admin_employee_id
      AND role_id = v_platform_admin_role_id;
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
      v_tenant_admin_employee_id,
      '["dev"]'::jsonb,
      'employee_created'
    ),
    (
      v_tenant_id,
      'Dev 客户 B',
      '19900001002',
      'referral',
      'potential',
      v_tenant_admin_employee_id,
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

  -- Unified phone identity login mini-program integration fixtures.
  -- Reserved phones: 19900004001-19900004010. Re-run this seed before a new
  -- shared-dev test round to reset bindable identities back to an unbound state.
  INSERT INTO public.tenants (
    slug,
    name,
    status,
    contact_name,
    contact_phone
  )
  VALUES (
    'gooes_dev_identity_b',
    'Dev 统一登录测试公司 B',
    'active',
    'Dev 联调',
    '19900004998'
  )
  ON CONFLICT (slug) DO UPDATE
  SET
    name = EXCLUDED.name,
    status = EXCLUDED.status,
    contact_name = EXCLUDED.contact_name,
    contact_phone = EXCLUDED.contact_phone,
    updated_at = now()
  RETURNING id INTO v_identity_tenant_b_id;

  INSERT INTO public.employees (
    tenant_id,
    name,
    phone,
    tenant_department_id,
    post_id,
    status,
    user_id
  )
  VALUES (
    v_identity_tenant_b_id,
    'Dev 统一登录分享员工 B',
    '19900004999',
    NULL,
    NULL,
    'active',
    NULL
  )
  ON CONFLICT (tenant_id, phone)
  WHERE tenant_id IS NOT NULL AND phone IS NOT NULL
  DO UPDATE SET
    name = EXCLUDED.name,
    tenant_department_id = EXCLUDED.tenant_department_id,
    post_id = EXCLUDED.post_id,
    status = EXCLUDED.status,
    user_id = EXCLUDED.user_id
  RETURNING id INTO v_identity_share_employee_id;

  INSERT INTO public.customers (
    tenant_id,
    name,
    phone,
    source,
    status,
    owner_id,
    tags,
    customer_origin,
    user_id
  )
  VALUES
    (
      v_tenant_id,
      'Dev 统一登录单客户',
      '19900004002',
      'referral',
      'potential',
      v_tenant_admin_employee_id,
      '["dev","phone_identity_login"]'::jsonb,
      'employee_created',
      NULL
    ),
    (
      v_tenant_id,
      'Dev 统一登录客户员工同号',
      '19900004005',
      'referral',
      'potential',
      v_tenant_admin_employee_id,
      '["dev","phone_identity_login"]'::jsonb,
      'employee_created',
      NULL
    ),
    (
      v_tenant_id,
      'Dev 统一登录跨租户客户 A',
      '19900004006',
      'referral',
      'potential',
      v_tenant_admin_employee_id,
      '["dev","phone_identity_login"]'::jsonb,
      'employee_created',
      NULL
    ),
    (
      v_identity_tenant_b_id,
      'Dev 统一登录跨租户客户 B',
      '19900004006',
      'referral',
      'potential',
      v_identity_share_employee_id,
      '["dev","phone_identity_login"]'::jsonb,
      'employee_created',
      NULL
    ),
    (
      v_tenant_id,
      'Dev 统一登录已绑客户',
      '19900004008',
      'referral',
      'potential',
      v_tenant_admin_employee_id,
      '["dev","phone_identity_login","rebind"]'::jsonb,
      'employee_created',
      NULL
    )
  ON CONFLICT (tenant_id, phone)
  WHERE tenant_id IS NOT NULL AND phone IS NOT NULL
  DO UPDATE SET
    name = EXCLUDED.name,
    source = EXCLUDED.source,
    status = EXCLUDED.status,
    owner_id = EXCLUDED.owner_id,
    tags = EXCLUDED.tags,
    customer_origin = EXCLUDED.customer_origin,
    user_id = EXCLUDED.user_id;

  INSERT INTO public.employees (
    tenant_id,
    name,
    phone,
    tenant_department_id,
    post_id,
    status,
    user_id
  )
  VALUES
    (
      v_tenant_id,
      'Dev 统一登录单员工',
      '19900004003',
      v_tenant_department_id,
      v_post_id,
      'active',
      NULL
    ),
    (
      v_tenant_id,
      'Dev 统一登录客户员工同号',
      '19900004005',
      v_tenant_department_id,
      v_post_id,
      'active',
      NULL
    ),
    (
      v_tenant_id,
      'Dev 统一登录已绑员工',
      '19900004010',
      v_tenant_department_id,
      v_post_id,
      'active',
      NULL
    )
  ON CONFLICT (tenant_id, phone)
  WHERE tenant_id IS NOT NULL AND phone IS NOT NULL
  DO UPDATE SET
    name = EXCLUDED.name,
    tenant_department_id = EXCLUDED.tenant_department_id,
    post_id = EXCLUDED.post_id,
    status = EXCLUDED.status,
    user_id = EXCLUDED.user_id;

  INSERT INTO auth.users (
    id,
    aud,
    role,
    email,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at
  )
  VALUES
    (
      v_bound_tenant_auth_user_id,
      'authenticated',
      'authenticated',
      'dev-phone-identity-bound-tenant@example.invalid',
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"source":"dev_phone_identity_login_seed"}'::jsonb,
      now(),
      now()
    ),
    (
      v_bound_partner_auth_user_id,
      'authenticated',
      'authenticated',
      'dev-phone-identity-bound-partner@example.invalid',
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"source":"dev_phone_identity_login_seed"}'::jsonb,
      now(),
      now()
    )
  ON CONFLICT (id) DO UPDATE SET
    aud = EXCLUDED.aud,
    role = EXCLUDED.role,
    email = EXCLUDED.email,
    email_confirmed_at = EXCLUDED.email_confirmed_at,
    raw_app_meta_data = EXCLUDED.raw_app_meta_data,
    raw_user_meta_data = EXCLUDED.raw_user_meta_data,
    updated_at = now();

  UPDATE public.customers
  SET
    user_id = v_bound_tenant_auth_user_id,
    updated_at = now()
  WHERE tenant_id = v_tenant_id
    AND phone = '19900004008';

  UPDATE public.employees
  SET
    user_id = v_bound_tenant_auth_user_id
  WHERE tenant_id = v_tenant_id
    AND phone = '19900004010';

  INSERT INTO public.user_oauth_identities (
    user_id,
    platform,
    openid,
    unionid,
    status,
    bound_at,
    unbound_at
  )
  VALUES
    (
      v_bound_tenant_auth_user_id,
      'wechat_mini',
      'dev_phone_identity_old_tenant_wechat',
      NULL,
      'active',
      now(),
      NULL
    ),
    (
      v_bound_partner_auth_user_id,
      'wechat_mini',
      'dev_phone_identity_old_partner_wechat',
      NULL,
      'active',
      now(),
      NULL
    )
  ON CONFLICT (platform, openid)
  WHERE status = 'active'
  DO UPDATE SET
    user_id = EXCLUDED.user_id,
    unionid = EXCLUDED.unionid,
    bound_at = EXCLUDED.bound_at,
    unbound_at = EXCLUDED.unbound_at,
    updated_at = now();

  DELETE FROM public.user_business_memberships
  WHERE user_id = v_bound_tenant_auth_user_id
    AND identity_type IN ('customer', 'employee')
    AND tenant_id = v_tenant_id;

  INSERT INTO public.user_business_memberships (
    user_id,
    tenant_id,
    identity_type,
    identity_id,
    status,
    is_default
  )
  SELECT
    v_bound_tenant_auth_user_id,
    v_tenant_id,
    'customer',
    customer.id,
    'active',
    true
  FROM public.customers AS customer
  WHERE customer.tenant_id = v_tenant_id
    AND customer.phone = '19900004008'
  LIMIT 1;

  INSERT INTO public.user_business_memberships (
    user_id,
    tenant_id,
    identity_type,
    identity_id,
    status,
    is_default
  )
  SELECT
    v_bound_tenant_auth_user_id,
    v_tenant_id,
    'employee',
    employee.id,
    'active',
    true
  FROM public.employees AS employee
  WHERE employee.tenant_id = v_tenant_id
    AND employee.phone = '19900004010'
  LIMIT 1;

  INSERT INTO public.platform_partner_levels (
    code,
    name,
    status,
    tenant_recharge_commission_bps,
    lead_service_fee_commission_bps,
    lead_service_fee_default_rate_bps,
    sort_order
  )
  VALUES (
    'dev_identity_login',
    'Dev 统一登录测试等级',
    'active',
    0,
    0,
    0,
    999
  )
  ON CONFLICT (code) DO UPDATE SET
    name = EXCLUDED.name,
    status = EXCLUDED.status,
    tenant_recharge_commission_bps = EXCLUDED.tenant_recharge_commission_bps,
    lead_service_fee_commission_bps = EXCLUDED.lead_service_fee_commission_bps,
    lead_service_fee_default_rate_bps = EXCLUDED.lead_service_fee_default_rate_bps,
    sort_order = EXCLUDED.sort_order,
    updated_at = now()
  RETURNING id INTO v_identity_partner_level_id;

  SELECT id
  INTO v_identity_partner_id
  FROM public.platform_partners
  WHERE phone = '19900004990'
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_identity_partner_id IS NULL THEN
    INSERT INTO public.platform_partners (
      name,
      subject_type,
      contact_name,
      phone,
      status,
      level_id,
      region_codes,
      contract_status,
      settlement_account_status,
      settlement_account,
      remark
    )
    VALUES (
      'Dev 统一登录城市合伙人',
      'company',
      'Dev 合伙人',
      '19900004990',
      'active',
      v_identity_partner_level_id,
      ARRAY['410000']::text[],
      'pending',
      'pending',
      '{}'::jsonb,
      'dev phone identity login fixture'
    )
    RETURNING id INTO v_identity_partner_id;
  ELSE
    UPDATE public.platform_partners
    SET
      name = 'Dev 统一登录城市合伙人',
      subject_type = 'company',
      contact_name = 'Dev 合伙人',
      status = 'active',
      level_id = v_identity_partner_level_id,
      region_codes = ARRAY['410000']::text[],
      contract_status = 'pending',
      settlement_account_status = 'pending',
      settlement_account = '{}'::jsonb,
      remark = 'dev phone identity login fixture',
      updated_at = now()
    WHERE id = v_identity_partner_id;
  END IF;

  INSERT INTO public.platform_partner_members (
    partner_id,
    auth_user_id,
    name,
    phone,
    role,
    status
  )
  VALUES
    (
      v_identity_partner_id,
      NULL,
      'Dev 统一登录单合伙人',
      '19900004004',
      'owner',
      'pending_bind'
    ),
    (
      v_identity_partner_id,
      v_bound_partner_auth_user_id,
      'Dev 统一登录已绑合伙人',
      '19900004009',
      'operator',
      'active'
    )
  ON CONFLICT (partner_id, phone)
  DO UPDATE SET
    auth_user_id = EXCLUDED.auth_user_id,
    name = EXCLUDED.name,
    role = EXCLUDED.role,
    status = EXCLUDED.status,
    updated_at = now();

  INSERT INTO public.tenant_share_links (
    tenant_id,
    share_employee_id,
    source,
    target_type,
    target_id,
    token,
    status,
    expires_at,
    metadata
  )
  VALUES (
    v_identity_tenant_b_id,
    v_identity_share_employee_id,
    'miniprogram_qrcode',
    'miniprogram',
    'phone_identity_login_dev',
    'ts_dev_phone_identity_b',
    'active',
    NULL,
    '{"purpose":"phone_identity_login_matrix"}'::jsonb
  )
  ON CONFLICT (token) DO UPDATE SET
    tenant_id = EXCLUDED.tenant_id,
    share_employee_id = EXCLUDED.share_employee_id,
    source = EXCLUDED.source,
    target_type = EXCLUDED.target_type,
    target_id = EXCLUDED.target_id,
    status = EXCLUDED.status,
    expires_at = EXCLUDED.expires_at,
    metadata = EXCLUDED.metadata,
    updated_at = now();

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
  string_agg(
    DISTINCT employee.name || ':' || employee.phone,
    ', ' ORDER BY employee.name || ':' || employee.phone
  ) AS dev_admin_accounts,
  count(DISTINCT customer.id) FILTER (
    WHERE customer.phone IN ('19900001001', '19900001002')
  ) AS dev_customer_count
FROM public.tenants AS tenant
LEFT JOIN public.employees AS employee
  ON employee.tenant_id = tenant.id
  AND employee.phone IN ('19900000001', '19900000002')
LEFT JOIN public.customers AS customer
  ON customer.tenant_id = tenant.id
WHERE tenant.slug = 'gooes_default'
GROUP BY tenant.name;

SELECT *
FROM (
  VALUES
    ('P1', '零身份', '19900004001', NULL, 'visitor_verified'),
    ('P2', '单客户', '19900004002', NULL, 'authenticated: customer'),
    ('P3', '单员工', '19900004003', NULL, 'authenticated: tenant_employee'),
    ('P4', '单合伙人', '19900004004', NULL, 'authenticated: platform_partner'),
    ('P5', '多身份：客户+员工', '19900004005', NULL, 'selection_required'),
    ('P6', '跨租户多客户', '19900004006', NULL, 'selection_required'),
    ('P7', '跨租户排序 share_token', '19900004006', 'ts_dev_phone_identity_b', 'tenant B customer first'),
    ('P8', '客户已绑定其他微信', '19900004008', NULL, 'WECHAT_ALREADY_BOUND'),
    ('P9', '合伙人成员已绑定其他微信', '19900004009', NULL, 'PARTNER_MEMBER_ALREADY_BOUND'),
    ('P10', '员工已绑定其他微信', '19900004010', NULL, 'WECHAT_ALREADY_BOUND')
) AS matrix(case_id, scenario, phone, share_token, expected);
