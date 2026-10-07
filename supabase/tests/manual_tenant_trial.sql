\set ON_ERROR_STOP on
-- Disposable local database only. Fixtures and all mutations roll back.
BEGIN;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';

DO $$
DECLARE
  v_actor uuid := gen_random_uuid();
  v_role uuid;
  v_created jsonb;
  v_other jsonb;
  v_facts jsonb;
  v_batch jsonb;
  v_trial public.tenant_service_trials%ROWTYPE;
  v_extended jsonb;
  v_key uuid := gen_random_uuid();
  v_trial_id uuid;
  v_tenant_id uuid;
  v_version integer;
  v_admin_count bigint;
  v_error text;
BEGIN
  INSERT INTO public.employees(id, name, status, tenant_id)
  VALUES (v_actor, '试用验证超管', 'active', NULL);
  SELECT id INTO STRICT v_role FROM public.roles
  WHERE tenant_id IS NULL AND code = 'platform_admin' AND status = 'active';
  INSERT INTO public.employee_roles(employee_id, role_id) VALUES (v_actor, v_role);

  v_created := public.create_platform_tenant_with_trial(
    p_name => '未核验试用验证', p_slug => 'manual-trial-smoke',
    p_admin_name => '试用管理员', p_admin_phone => '13999100001',
    p_operator_employee_id => v_actor, p_trial_days => 30,
    p_trial_reason => '集成验证', p_trial_idempotency_key => gen_random_uuid()
  );
  v_tenant_id := (v_created->'tenant'->>'id')::uuid;
  v_trial_id := (v_created->'trial'->>'id')::uuid;
  SELECT * INTO STRICT v_trial FROM public.tenant_service_trials WHERE id = v_trial_id;
  IF v_created->'tenant'->>'creation_source' <> 'platform_manual'
    OR v_created->'tenant'->>'service_access_policy' <> 'entitlement_required'
    OR v_trial.identity_basis <> 'provisional_tenant'
    OR v_trial.trial_ends_at - v_trial.starts_at <> interval '30 days'
    OR v_trial.grace_ends_at - v_trial.trial_ends_at <> interval '7 days'
  THEN RAISE EXCEPTION 'manual trial identity or duration incorrect'; END IF;
  v_facts := public.platform_service_trial_access_facts(v_tenant_id);
  IF v_facts->'current_trial'->>'status' <> 'active'
    OR v_facts->>'legacy_subscription_status' IS NOT NULL
  THEN RAISE EXCEPTION 'new manual trial access incorrect'; END IF;

  -- Granting a duplicate must be rejected even without an enterprise identity.
  BEGIN
    PERFORM public.platform_service_trial_grant(v_tenant_id, v_actor, 'standard', NULL,
      '重复验证', gen_random_uuid(), 30, 7);
    RAISE EXCEPTION 'duplicate grant was allowed';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    GET STACKED DIAGNOSTICS v_error = MESSAGE_TEXT;
    IF v_error <> 'SERVICE_TRIAL_ACTIVE_EXISTS' THEN RAISE; END IF;
  END;

  -- A failed trial grant must roll back tenant, organization, and admin creation.
  SELECT count(*) INTO v_admin_count FROM public.employees;
  BEGIN
    PERFORM public.create_platform_tenant_with_trial(
      p_name => '回滚验证', p_slug => 'manual-trial-rollback',
      p_admin_name => '回滚管理员', p_admin_phone => '13999100002',
      p_operator_employee_id => v_actor, p_trial_days => 366,
      p_trial_reason => '无效天数', p_trial_idempotency_key => gen_random_uuid()
    );
    RAISE EXCEPTION 'invalid grant was allowed';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    GET STACKED DIAGNOSTICS v_error = MESSAGE_TEXT;
    IF v_error <> 'SERVICE_TRIAL_ACTION_NOT_ALLOWED' THEN RAISE; END IF;
  END;
  IF EXISTS(SELECT 1 FROM public.tenants WHERE slug = 'manual-trial-rollback')
    OR (SELECT count(*) FROM public.employees) <> v_admin_count
  THEN RAISE EXCEPTION 'atomic creation left orphan records'; END IF;

  v_other := public.create_platform_tenant_with_trial(
    p_name => '暂不开通验证', p_slug => 'manual-no-trial-smoke',
    p_operator_employee_id => v_actor
  );
  v_facts := public.platform_service_trial_access_facts((v_other->'tenant'->>'id')::uuid);
  IF v_facts->>'service_access_policy' <> 'entitlement_required'
    OR v_facts->>'current_trial' IS NOT NULL
  THEN RAISE EXCEPTION 'no-trial tenant policy incorrect'; END IF;
  -- A later direct platform grant follows the same fixed seven-day rule.
  v_extended := public.platform_service_trial_grant((v_other->'tenant'->>'id')::uuid,
    v_actor, 'standard', NULL, '建户后补开试用', gen_random_uuid(), 15, 14);
  IF (v_extended->'trial_snapshot'->>'grace_ends_at')::timestamptz
    - (v_extended->'trial_snapshot'->>'trial_ends_at')::timestamptz <> interval '7 days'
  THEN RAISE EXCEPTION 'direct manual grant changed fixed grace period'; END IF;
  PERFORM public.platform_service_trial_revoke((v_extended->>'trial_id')::uuid,
    v_actor, (v_extended->>'version')::integer, gen_random_uuid(), '验证临时身份撤销');
  v_facts := public.platform_service_trial_access_facts((v_other->'tenant'->>'id')::uuid);
  IF v_facts->>'current_trial' IS NOT NULL
    OR v_facts->'latest_trial'->>'status' <> 'revoked'
  THEN RAISE EXCEPTION 'revoked provisional trial retained access'; END IF;

  v_other := public.create_tenant_with_default_template(
    p_name => '其他建户入口验证', p_slug => 'other-origin-smoke',
    p_operator_employee_id => v_actor
  );
  IF v_other->'tenant'->>'service_access_policy' <> 'legacy_compatible'
  THEN RAISE EXCEPTION 'other entry lost compatibility'; END IF;
  BEGIN
    PERFORM public.platform_service_trial_grant((v_other->'tenant'->>'id')::uuid,
      v_actor, 'standard', NULL, '不允许未核验其他来源', gen_random_uuid(), 30, 7);
    RAISE EXCEPTION 'unverified other origin grant was allowed';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    GET STACKED DIAGNOSTICS v_error = MESSAGE_TEXT;
    IF v_error <> 'SERVICE_TRIAL_ENTERPRISE_IDENTITY_REQUIRED' THEN RAISE; END IF;
  END;

  -- Simulate the boundary before the lifecycle worker normalizes stored status.
  UPDATE public.tenant_service_trials SET
    starts_at = clock_timestamp() - interval '30 days 1 second',
    trial_ends_at = clock_timestamp() - interval '1 second',
    grace_ends_at = clock_timestamp() + interval '7 days' - interval '1 second'
  WHERE id = v_trial_id;
  v_facts := public.platform_service_trial_access_facts(v_tenant_id);
  v_batch := public.platform_service_trial_access_facts_batch(ARRAY[v_tenant_id]);
  IF v_facts->'current_trial'->>'status' <> 'grace_period'
    OR v_batch->0->'current_trial'->>'status' <> 'grace_period'
  THEN RAISE EXCEPTION 'grace access did not use database clock'; END IF;
  v_version := (v_facts->'latest_trial'->>'version')::integer;
  v_extended := public.platform_service_trial_extend(v_trial_id, v_actor,
    v_version, v_key, 7, '宽限期恢复试用', true);
  SELECT * INTO STRICT v_trial FROM public.tenant_service_trials WHERE id = v_trial_id;
  IF v_trial.status <> 'active' OR v_trial.trial_ends_at <= clock_timestamp()
    OR abs(extract(epoch FROM (v_trial.grace_ends_at - v_trial.trial_ends_at)) - 604800) > 0.1
  THEN RAISE EXCEPTION 'grace extension failed'; END IF;
  IF public.platform_service_trial_extend(v_trial_id, v_actor, v_version,
      v_key, 7, '宽限期恢复试用', true) - 'idempotent'
    IS DISTINCT FROM v_extended - 'idempotent'
  THEN RAISE EXCEPTION 'extension retry was not idempotent'; END IF;
  BEGIN
    PERFORM public.platform_service_trial_extend(v_trial_id, v_actor,
      v_version, gen_random_uuid(), 7, '陈旧版本', true);
    RAISE EXCEPTION 'stale extension version was accepted';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    GET STACKED DIAGNOSTICS v_error = MESSAGE_TEXT;
    IF v_error <> 'SERVICE_TRIAL_VERSION_CONFLICT' THEN RAISE; END IF;
  END;

  UPDATE public.tenant_service_trials SET
    trial_ends_at = clock_timestamp() - interval '7 days 1 second',
    grace_ends_at = clock_timestamp() - interval '1 second'
  WHERE id = v_trial_id;
  v_facts := public.platform_service_trial_access_facts(v_tenant_id);
  IF v_facts->>'current_trial' IS NOT NULL
    OR v_facts->'latest_trial'->>'status' <> 'expired'
    OR v_facts->>'service_access_policy' <> 'entitlement_required'
  THEN RAISE EXCEPTION 'expired manual tenant kept trial access'; END IF;

  BEGIN
    PERFORM public.platform_service_trial_access_facts_batch(array_fill(v_tenant_id, ARRAY[101]));
    RAISE EXCEPTION 'oversized batch was accepted';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
  END;
  RAISE NOTICE 'manual tenant trial: creation, rollback, identity, grace, extension, idempotency, expiry and bounds passed';
END;
$$;
ROLLBACK;
