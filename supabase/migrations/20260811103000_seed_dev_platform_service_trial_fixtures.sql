-- Time-bounded integration fixtures for the shared development environment.
-- Production and every environment not explicitly marked as the WeChat
-- mini-program develop environment are strict no-ops.
-- The scheduled/active/grace acceptance matrix is stable for a 21-day
-- acceptance window after this migration is applied. If it is needed later,
-- refresh the dates with a new forward migration; never patch remote rows by hand.
DO $fixture$
DECLARE
  v_is_develop boolean;
  v_platform_admin_id uuid;
  v_plan_id uuid;
  v_product_id uuid;
  v_product_version_id uuid;
  v_product_code text;
  v_amount_fen bigint;
  v_payment_config_id uuid;
  v_payment_config_guard_version integer;
  v_result jsonb;
  v_application_trial_id uuid;
  v_scheduled_trial_id uuid;
  v_active_trial_id uuid;
  v_grace_trial_id uuid;
  v_expired_trial_id uuid;
  v_converted_trial_id uuid;
  v_order jsonb;
  v_scope jsonb := '{"version":1,"capabilities":["core.projects","core.customers"]}'::jsonb;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM public.system_settings
    WHERE tenant_id IS NULL
      AND key = 'WECHAT_MINIPROGRAM_ENV_VERSION'
      AND status = 'active'
      AND lower(btrim(value_text)) = 'develop'
  ) INTO v_is_develop;

  IF NOT v_is_develop THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.tenants
    WHERE slug IN (
      'dev-trial-application', 'dev-trial-platform-grant',
      'dev-trial-active', 'dev-trial-grace', 'dev-trial-expired',
      'dev-trial-converted'
    )
  ) OR EXISTS (
    SELECT 1 FROM public.employees
    WHERE phone BETWEEN '19900009101' AND '19900009106'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SERVICE_TRIAL_DEV_FIXTURE_COLLISION';
  END IF;

  SELECT employee.id
  INTO v_platform_admin_id
  FROM public.employees AS employee
  JOIN public.employee_roles AS employee_role
    ON employee_role.employee_id = employee.id
  JOIN public.roles AS role ON role.id = employee_role.role_id
  WHERE employee.tenant_id IS NULL
    AND employee.status = 'active'
    AND role.tenant_id IS NULL
    AND role.code = 'platform_admin'
    AND role.status = 'active'
  ORDER BY employee.created_at, employee.id
  LIMIT 1;

  SELECT id INTO v_plan_id
  FROM public.tenant_billing_plans
  ORDER BY created_at, id
  LIMIT 1;

  SELECT product.id, product.published_version_id, product.code,
    version.amount_fen
  INTO v_product_id, v_product_version_id, v_product_code, v_amount_fen
  FROM public.platform_service_products AS product
  JOIN public.platform_service_product_versions AS version
    ON version.id = product.published_version_id
  WHERE product.status = 'enabled'
    AND product.code = 'platform_service_1y'
  LIMIT 1;

  SELECT id, recharge_guard_version
  INTO v_payment_config_id, v_payment_config_guard_version
  FROM public.platform_payment_configs
  WHERE profile_code = 'platform_direct_recharge'
    AND provider = 'wechat_pay'
    AND principal_type = 'platform'
    AND merchant_mode = 'direct_merchant'
    AND status = 'active'
    AND validation_status = 'valid'
    AND 'platform_service' = ANY(enabled_channels)
  ORDER BY updated_at DESC, id
  LIMIT 1;

  IF v_platform_admin_id IS NULL OR v_plan_id IS NULL
    OR v_product_id IS NULL OR v_product_version_id IS NULL
    OR v_payment_config_id IS NULL OR v_payment_config_guard_version IS NULL
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SERVICE_TRIAL_DEV_FIXTURE_PREREQUISITE_MISSING';
  END IF;

  INSERT INTO public.tenants (
    id, name, slug, status, unified_social_credit_code
  ) VALUES
    ('9f090000-0000-4000-8000-000000000001', 'Task9 Dev Fixture Application', 'dev-trial-application', 'active', '91310000DEVTRIAL01'),
    ('9f090000-0000-4000-8000-000000000002', 'Task9 Dev Fixture Platform Grant', 'dev-trial-platform-grant', 'active', '91310000DEVTRIAL02'),
    ('9f090000-0000-4000-8000-000000000003', 'Task9 Dev Fixture Active', 'dev-trial-active', 'active', '91310000DEVTRIAL03'),
    ('9f090000-0000-4000-8000-000000000004', 'Task9 Dev Fixture Grace', 'dev-trial-grace', 'active', '91310000DEVTRIAL04'),
    ('9f090000-0000-4000-8000-000000000005', 'Task9 Dev Fixture Expired', 'dev-trial-expired', 'active', '91310000DEVTRIAL05'),
    ('9f090000-0000-4000-8000-000000000006', 'Task9 Dev Fixture Converted', 'dev-trial-converted', 'active', '91310000DEVTRIAL06');

  INSERT INTO public.platform_file_objects (
    id, tenant_id, owner_type, scene, bucket, object_key, mime_type
  ) VALUES
    ('9f090001-0000-4000-8000-000000000001', '9f090000-0000-4000-8000-000000000001', 'tenant_onboarding', 'business_license', 'dev-fixtures', 'trial/application.png', 'image/png'),
    ('9f090001-0000-4000-8000-000000000002', '9f090000-0000-4000-8000-000000000002', 'tenant_onboarding', 'business_license', 'dev-fixtures', 'trial/platform-grant.png', 'image/png'),
    ('9f090001-0000-4000-8000-000000000003', '9f090000-0000-4000-8000-000000000003', 'tenant_onboarding', 'business_license', 'dev-fixtures', 'trial/active.png', 'image/png'),
    ('9f090001-0000-4000-8000-000000000004', '9f090000-0000-4000-8000-000000000004', 'tenant_onboarding', 'business_license', 'dev-fixtures', 'trial/grace.png', 'image/png'),
    ('9f090001-0000-4000-8000-000000000005', '9f090000-0000-4000-8000-000000000005', 'tenant_onboarding', 'business_license', 'dev-fixtures', 'trial/expired.png', 'image/png'),
    ('9f090001-0000-4000-8000-000000000006', '9f090000-0000-4000-8000-000000000006', 'tenant_onboarding', 'business_license', 'dev-fixtures', 'trial/converted.png', 'image/png');

  INSERT INTO public.tenant_onboarding_applications (
    application_no, visitor_id, company_name, unified_social_credit_code,
    business_license_file_id, admin_name, admin_phone, address_city,
    address_region_code, address, service_region_codes, source_channel,
    status, converted_tenant_id, reviewed_by_employee_id, reviewed_at,
    privacy_policy_version, onboarding_terms_version, consented_at,
    idempotency_key
  )
  SELECT
    'TASK9-DEV-' || suffix,
    'task9-dev-' || suffix,
    'Task9 Dev Fixture ' || label,
    credit_code,
    file_id,
    'Task9 Dev Fixture',
    phone,
    '上海市',
    '310000',
    '仅用于开发联调',
    ARRAY['310000'],
    'local_services',
    'approved',
    tenant_id,
    v_platform_admin_id,
    clock_timestamp(),
    'task9-dev',
    'task9-dev',
    clock_timestamp(),
    'task9-dev-' || suffix
  FROM (VALUES
    ('APPLICATION', 'Application', '91310000DEVTRIAL01', '19900009101', '9f090000-0000-4000-8000-000000000001'::uuid, '9f090001-0000-4000-8000-000000000001'::uuid),
    ('PLATFORM-GRANT', 'Platform Grant', '91310000DEVTRIAL02', '19900009102', '9f090000-0000-4000-8000-000000000002'::uuid, '9f090001-0000-4000-8000-000000000002'::uuid),
    ('ACTIVE', 'Active', '91310000DEVTRIAL03', '19900009103', '9f090000-0000-4000-8000-000000000003'::uuid, '9f090001-0000-4000-8000-000000000003'::uuid),
    ('GRACE', 'Grace', '91310000DEVTRIAL04', '19900009104', '9f090000-0000-4000-8000-000000000004'::uuid, '9f090001-0000-4000-8000-000000000004'::uuid),
    ('EXPIRED', 'Expired', '91310000DEVTRIAL05', '19900009105', '9f090000-0000-4000-8000-000000000005'::uuid, '9f090001-0000-4000-8000-000000000005'::uuid),
    ('CONVERTED', 'Converted', '91310000DEVTRIAL06', '19900009106', '9f090000-0000-4000-8000-000000000006'::uuid, '9f090001-0000-4000-8000-000000000006'::uuid)
  ) AS fixture(suffix, label, credit_code, phone, tenant_id, file_id);

  INSERT INTO public.roles (id, tenant_id, code, name, status) VALUES
    ('9f090002-0000-4000-8000-000000000001', '9f090000-0000-4000-8000-000000000001', 'system_admin', 'Task9 Dev Admin', 'active'),
    ('9f090002-0000-4000-8000-000000000002', '9f090000-0000-4000-8000-000000000002', 'system_admin', 'Task9 Dev Admin', 'active'),
    ('9f090002-0000-4000-8000-000000000003', '9f090000-0000-4000-8000-000000000003', 'system_admin', 'Task9 Dev Admin', 'active'),
    ('9f090002-0000-4000-8000-000000000004', '9f090000-0000-4000-8000-000000000004', 'system_admin', 'Task9 Dev Admin', 'active'),
    ('9f090002-0000-4000-8000-000000000005', '9f090000-0000-4000-8000-000000000005', 'system_admin', 'Task9 Dev Admin', 'active'),
    ('9f090002-0000-4000-8000-000000000006', '9f090000-0000-4000-8000-000000000006', 'system_admin', 'Task9 Dev Admin', 'active');

  INSERT INTO public.employees (id, tenant_id, name, phone, status) VALUES
    ('9f090003-0000-4000-8000-000000000001', '9f090000-0000-4000-8000-000000000001', 'Task9 Dev Application Admin', '19900009101', 'active'),
    ('9f090003-0000-4000-8000-000000000002', '9f090000-0000-4000-8000-000000000002', 'Task9 Dev Grant Admin', '19900009102', 'active'),
    ('9f090003-0000-4000-8000-000000000003', '9f090000-0000-4000-8000-000000000003', 'Task9 Dev Active Admin', '19900009103', 'active'),
    ('9f090003-0000-4000-8000-000000000004', '9f090000-0000-4000-8000-000000000004', 'Task9 Dev Grace Admin', '19900009104', 'active'),
    ('9f090003-0000-4000-8000-000000000005', '9f090000-0000-4000-8000-000000000005', 'Task9 Dev Expired Admin', '19900009105', 'active'),
    ('9f090003-0000-4000-8000-000000000006', '9f090000-0000-4000-8000-000000000006', 'Task9 Dev Converted Admin', '19900009106', 'active');

  INSERT INTO public.employee_roles (employee_id, role_id)
  SELECT employee_id, role_id
  FROM (VALUES
    ('9f090003-0000-4000-8000-000000000001'::uuid, '9f090002-0000-4000-8000-000000000001'::uuid),
    ('9f090003-0000-4000-8000-000000000002'::uuid, '9f090002-0000-4000-8000-000000000002'::uuid),
    ('9f090003-0000-4000-8000-000000000003'::uuid, '9f090002-0000-4000-8000-000000000003'::uuid),
    ('9f090003-0000-4000-8000-000000000004'::uuid, '9f090002-0000-4000-8000-000000000004'::uuid),
    ('9f090003-0000-4000-8000-000000000005'::uuid, '9f090002-0000-4000-8000-000000000005'::uuid),
    ('9f090003-0000-4000-8000-000000000006'::uuid, '9f090002-0000-4000-8000-000000000006'::uuid)
  ) AS fixture(employee_id, role_id);

  INSERT INTO public.role_permissions (role_id, permission_id, access_scope)
  SELECT role.id, permission.id, 'all'
  FROM public.roles AS role
  CROSS JOIN public.permissions AS permission
  WHERE role.id BETWEEN '9f090002-0000-4000-8000-000000000001'::uuid
    AND '9f090002-0000-4000-8000-000000000006'::uuid
    AND permission.code IN (
      'billing.service_trial.apply', 'billing.service_trial.read'
    );

  INSERT INTO public.tenant_billing_subscriptions (
    tenant_id, plan_id, status, current_period_start, current_period_end,
    next_charge_at, locked_at, lock_reason
  )
  SELECT id, v_plan_id, 'locked', current_date, current_date + 1,
    clock_timestamp(), clock_timestamp(), 'Task9 Dev Fixture'
  FROM public.tenants
  WHERE id IN (
    '9f090000-0000-4000-8000-000000000001',
    '9f090000-0000-4000-8000-000000000002',
    '9f090000-0000-4000-8000-000000000003',
    '9f090000-0000-4000-8000-000000000004',
    '9f090000-0000-4000-8000-000000000005',
    '9f090000-0000-4000-8000-000000000006'
  );

  SELECT public.platform_service_trial_apply(
    '9f090000-0000-4000-8000-000000000001',
    '9f090003-0000-4000-8000-000000000001',
    'Task9 Dev Fixture tenant application', 8, 3,
    'Task9 Dev Fixture', '19900009101',
    '9f090004-0000-4000-8000-000000000001'
  ) INTO v_result;
  v_application_trial_id := (v_result->>'trial_id')::uuid;

  SELECT public.platform_service_trial_grant(
    '9f090000-0000-4000-8000-000000000002', v_platform_admin_id,
    'standard', v_scope, 'Task9 Dev Fixture scheduled grant',
    '9f090004-0000-4000-8000-000000000002', 30, 7,
    clock_timestamp() + interval '21 days', NULL, false
  ) INTO v_result;
  v_scheduled_trial_id := (v_result->>'trial_id')::uuid;

  SELECT public.platform_service_trial_grant(
    '9f090000-0000-4000-8000-000000000003', v_platform_admin_id,
    'standard', v_scope, 'Task9 Dev Fixture active grant',
    '9f090004-0000-4000-8000-000000000003', 30, 7, NULL, NULL, false
  ) INTO v_result;
  v_active_trial_id := (v_result->>'trial_id')::uuid;

  SELECT public.platform_service_trial_grant(
    '9f090000-0000-4000-8000-000000000004', v_platform_admin_id,
    'standard', v_scope, 'Task9 Dev Fixture grace grant',
    '9f090004-0000-4000-8000-000000000004', 30, 23, NULL, NULL, true
  ) INTO v_result;
  v_grace_trial_id := (v_result->>'trial_id')::uuid;
  UPDATE public.tenant_service_trials
  SET starts_at = clock_timestamp() - interval '32 days',
    activated_at = clock_timestamp() - interval '32 days',
    trial_ends_at = clock_timestamp() - interval '2 days',
    grace_ends_at = clock_timestamp() + interval '21 days',
    updated_at = clock_timestamp()
  WHERE id = v_grace_trial_id;
  PERFORM public.platform_service_trial_normalize_effective_status(
    v_grace_trial_id, '9f090000-0000-4000-8000-000000000004', clock_timestamp()
  );

  SELECT public.platform_service_trial_grant(
    '9f090000-0000-4000-8000-000000000005', v_platform_admin_id,
    'standard', v_scope, 'Task9 Dev Fixture expired grant',
    '9f090004-0000-4000-8000-000000000005', 30, 7, NULL, NULL, false
  ) INTO v_result;
  v_expired_trial_id := (v_result->>'trial_id')::uuid;
  UPDATE public.tenant_service_trials
  SET starts_at = clock_timestamp() - interval '40 days',
    activated_at = clock_timestamp() - interval '40 days',
    trial_ends_at = clock_timestamp() - interval '10 days',
    grace_ends_at = clock_timestamp() - interval '3 days',
    updated_at = clock_timestamp()
  WHERE id = v_expired_trial_id;
  PERFORM public.platform_service_trial_normalize_effective_status(
    v_expired_trial_id, '9f090000-0000-4000-8000-000000000005', clock_timestamp()
  );

  SELECT public.platform_service_trial_grant(
    '9f090000-0000-4000-8000-000000000006', v_platform_admin_id,
    'standard', v_scope, 'Task9 Dev Fixture converted grant',
    '9f090004-0000-4000-8000-000000000006', 30, 7, NULL, NULL, false
  ) INTO v_result;
  v_converted_trial_id := (v_result->>'trial_id')::uuid;

  SELECT to_jsonb(public.platform_service_create_pending_order(
    '9f090000-0000-4000-8000-000000000006', v_product_id,
    v_product_version_id, 'TASK9DEVCONVERTED202608110001',
    'task9-dev-converted-trade',
    '9f090005-0000-4000-8000-000000000001', v_product_code,
    1, '{}'::jsonb, 1, v_amount_fen, v_payment_config_id,
    v_payment_config_guard_version, 'task9-dev-openid',
    clock_timestamp() + interval '15 minutes', 1, clock_timestamp(),
    '9f090003-0000-4000-8000-000000000006',
    'platform_service', v_converted_trial_id
  )) INTO v_order;

  SELECT public.platform_service_confirm_payment(
    (v_order->>'id')::uuid, 'task9-dev-converted-transaction',
    v_amount_fen, clock_timestamp(),
    '9f090005-0000-4000-8000-000000000002',
    '{"source":"task9_dev_fixture"}'::jsonb
  ) INTO v_result;

  IF (v_result->'order'->>'payment_status') IS DISTINCT FROM 'paid'
    OR NOT EXISTS (
      SELECT 1
      FROM public.tenant_service_trials AS trial
      WHERE trial.id = v_converted_trial_id
        AND trial.tenant_id = '9f090000-0000-4000-8000-000000000006'
        AND trial.status = 'converted'
        AND trial.converted_order_id = (v_order->>'id')::uuid
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SERVICE_TRIAL_DEV_FIXTURE_CONVERSION_FAILED';
  END IF;
END;
$fixture$;
