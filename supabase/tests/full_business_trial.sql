\set ON_ERROR_STOP on
-- Run only on a disposable database after the full-business-trial migration.
-- All fixtures, permission changes and command mutations roll back.
BEGIN;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';

CREATE FUNCTION pg_temp.assert_true(p_value boolean, p_message text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_value IS DISTINCT FROM true THEN RAISE EXCEPTION '%', p_message; END IF;
END;
$$;

DO $$
DECLARE
  v_full jsonb := '{"version":1,"capabilities":["core.projects","core.customers","core.employees","core.workflows","core.files","core.notifications","business.marketing","business.finance","business.procurement","business.inventory","business.content","business.ai","business.settings"]}';
  v_invalid jsonb;
BEGIN
  PERFORM pg_temp.assert_true(public.platform_service_trial_scope_valid(v_full),
    'full business scope must accept all 13 explicit capabilities');
  PERFORM pg_temp.assert_true(public.platform_service_trial_scope_valid(
    '{"version":1,"capabilities":["core.projects","core.customers","core.employees","core.workflows","core.files","core.notifications"]}'), 'old six capabilities remain valid');
  FOR v_invalid IN SELECT value FROM jsonb_array_elements('[null,{"version":"1","capabilities":["core.projects"]},{},[],{"version":1,"capabilities":[]},{"version":1,"capabilities":["*"]},{"version":1,"capabilities":["business.unknown"]},{"version":1,"capabilities":["core.projects","core.projects"]},{"version":null,"capabilities":["core.projects"]},{"version":2,"capabilities":["core.projects"]},{"version":1,"capabilities":[null]},{"version":1,"capabilities":["business.ai"],"extra":true}]')
  LOOP
    PERFORM pg_temp.assert_true(NOT public.platform_service_trial_scope_valid(v_invalid),
      'invalid scope accepted: ' || v_invalid::text);
  END LOOP;
  PERFORM pg_temp.assert_true(to_regprocedure('public.platform_service_trial_update_scope(uuid,uuid,integer,uuid,jsonb,text)') IS NOT NULL,
    'scope update RPC must exist');
  PERFORM pg_temp.assert_true(EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'create_platform_tenant_with_trial_scope'),
    'atomic custom scope creation RPC must exist');
  RAISE NOTICE 'PASS: scope validator and RPC contracts';
END;
$$;

DO $$
DECLARE
  v_actor uuid := gen_random_uuid();
  v_tenant_actor uuid := gen_random_uuid();
  v_no_role uuid := gen_random_uuid();
  v_trial_only uuid := gen_random_uuid();
  v_trial_only_role uuid;
  v_creation_counts jsonb;
  v_role uuid;
  v_permission uuid;
  v_created jsonb;
  v_result jsonb;
  v_replay jsonb;
  v_key uuid := gen_random_uuid();
  v_id uuid;
  v_before public.tenant_service_trials%ROWTYPE;
  v_after public.tenant_service_trials%ROWTYPE;
  v_full jsonb := '{"version":1,"capabilities":["core.projects","core.customers","core.employees","core.workflows","core.files","core.notifications","business.marketing","business.finance","business.procurement","business.inventory","business.content","business.ai","business.settings"]}';
  v_small jsonb := '{"version":1,"capabilities":["core.projects","business.ai"]}';
  v_original_scope jsonb;
  v_count bigint;
  v_error text;
  v_order uuid;
  v_config uuid;
  v_bad_actor uuid;
  v_function record;
BEGIN
  FOR v_function IN SELECT oid FROM pg_proc WHERE pronamespace = 'public'::regnamespace
    AND proname IN ('platform_service_trial_update_scope','create_platform_tenant_with_trial_scope')
  LOOP
    PERFORM pg_temp.assert_true(NOT has_function_privilege('anon', v_function.oid, 'EXECUTE')
      AND NOT has_function_privilege('authenticated', v_function.oid, 'EXECUTE')
      AND has_function_privilege('service_role', v_function.oid, 'EXECUTE'), 'RPC ACL must be service_role only');
  END LOOP;
  INSERT INTO public.employees(id,name,status,tenant_id) VALUES
    (v_actor,'范围验证超管','active',NULL), (v_no_role,'无平台角色','active',NULL);
  SELECT id INTO STRICT v_role FROM public.roles WHERE tenant_id IS NULL AND code = 'platform_admin' AND status = 'active';
  SELECT id INTO STRICT v_permission FROM public.permissions WHERE code = 'platform.service_trial.manage';
  INSERT INTO public.employee_roles(employee_id,role_id) VALUES (v_actor,v_role);

  -- A platform identity holding ONLY trial.manage must not create tenants.
  INSERT INTO public.employees(id,name,status,tenant_id)
    VALUES(v_trial_only,'仅试用管理员','active',NULL);
  INSERT INTO public.roles(code,name,status,tenant_id)
    VALUES('full_trial_manage_only','仅试用管理角色','active',NULL)
    RETURNING id INTO v_trial_only_role;
  INSERT INTO public.role_permissions(role_id,permission_id,access_scope)
    VALUES(v_trial_only_role,v_permission,'all');
  INSERT INTO public.employee_roles(employee_id,role_id)
    VALUES(v_trial_only,v_trial_only_role);
  PERFORM public.platform_service_trial_lock_platform_actor(
    v_trial_only,ARRAY['platform.service_trial.manage']);
  SELECT jsonb_build_array(
    (SELECT count(*) FROM public.tenants),(SELECT count(*) FROM public.employees),
    (SELECT count(*) FROM public.tenant_departments),(SELECT count(*) FROM public.posts),
    (SELECT count(*) FROM public.roles),(SELECT count(*) FROM public.employee_roles),
    (SELECT count(*) FROM public.role_permissions),(SELECT count(*) FROM public.tenant_service_trials),
    (SELECT count(*) FROM public.tenant_service_trial_events),(SELECT count(*) FROM public.tenant_service_trial_commands)
  ) INTO v_creation_counts;
  BEGIN
    SET LOCAL ROLE service_role;
    PERFORM public.create_platform_tenant_with_trial_scope(
      p_name => '仅试用权限拒绝建户',p_slug => 'full-trial-manage-only-denied',
      p_admin_name => '不应创建的管理员',p_admin_phone => '13999200003',
      p_operator_employee_id => v_trial_only,p_trial_days => 30,
      p_trial_reason => '验证租户管理权限',p_trial_idempotency_key => gen_random_uuid(),p_trial_scope => v_full);
    RAISE EXCEPTION 'trial.manage-only actor could create a tenant';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    GET STACKED DIAGNOSTICS v_error = MESSAGE_TEXT;
    IF v_error <> 'SERVICE_TRIAL_ACTION_NOT_ALLOWED' THEN RAISE; END IF;
  END;
  RESET ROLE;
  PERFORM pg_temp.assert_true(v_creation_counts = jsonb_build_array(
    (SELECT count(*) FROM public.tenants),(SELECT count(*) FROM public.employees),
    (SELECT count(*) FROM public.tenant_departments),(SELECT count(*) FROM public.posts),
    (SELECT count(*) FROM public.roles),(SELECT count(*) FROM public.employee_roles),
    (SELECT count(*) FROM public.role_permissions),(SELECT count(*) FROM public.tenant_service_trials),
    (SELECT count(*) FROM public.tenant_service_trial_events),(SELECT count(*) FROM public.tenant_service_trial_commands)
  ) AND NOT EXISTS(SELECT 1 FROM public.tenants WHERE slug = 'full-trial-manage-only-denied'),
    'denied creation mutated tenant, organization, administrator, trial, audit or command rows');
  RAISE NOTICE 'PASS: trial.manage-only actor cannot create; tenant/organization/admin/trial/audit/command counts unchanged';

  -- Exercise the entry point using the actual backend database role.
  SET LOCAL ROLE service_role;
  v_created := public.create_platform_tenant_with_trial_scope(
    p_name => '完整范围验证', p_slug => 'full-business-trial-test',
    p_admin_name => '范围管理员', p_admin_phone => '13999200001',
    p_operator_employee_id => v_actor, p_trial_days => 30,
    p_trial_reason => '自定义范围建户', p_trial_idempotency_key => gen_random_uuid(), p_trial_scope => v_full);
  RESET ROLE;
  v_id := (v_created->'trial'->>'id')::uuid;
  SELECT * INTO STRICT v_before FROM public.tenant_service_trials WHERE id = v_id;
  PERFORM pg_temp.assert_true(v_before.scope_snapshot = v_full
    AND v_before.identity_basis = 'provisional_tenant'
    AND v_before.trial_ends_at - v_before.starts_at = interval '30 days'
    AND v_before.grace_ends_at - v_before.trial_ends_at = interval '7 days'
    AND v_created->'tenant'->>'creation_source' = 'platform_manual'
    AND v_created->'tenant'->>'service_access_policy' = 'entitlement_required', 'custom creation facts incorrect');
  PERFORM pg_temp.assert_true((SELECT count(*) = 1 FROM public.tenant_service_trial_events WHERE trial_id = v_id AND event_type = 'trial_granted'), 'create must grant exactly once');
  PERFORM pg_temp.assert_true((SELECT count(*) = 1 FROM public.tenant_service_trial_commands WHERE trial_id = v_id), 'create must store one grant command');
  -- Later operations migrations added these audit types; widening the constraint
  -- must not remove them or break existing follow-up commands/history.
  INSERT INTO public.tenant_service_trial_events(tenant_id,trial_id,event_key,event_type)
  VALUES (v_before.tenant_id,v_id,'compat-follow-up-created','trial_follow_up_created'),
    (v_before.tenant_id,v_id,'compat-follow-up-canceled','trial_follow_up_canceled');
  RAISE NOTICE 'PASS: service-role atomic creation, seven-day grace and follow-up audit compatibility';

  -- A failure inside grant (after creating tenant/admin/template) must roll back everything.
  SELECT count(*) INTO v_count FROM public.employees;
  BEGIN
    PERFORM public.create_platform_tenant_with_trial_scope(
      p_name => '原子失败验证', p_slug => 'full-business-trial-rollback',
      p_admin_name => '回滚管理员', p_admin_phone => '13999200002',
      p_operator_employee_id => v_actor, p_trial_days => 366,
      p_trial_reason => '无效时长', p_trial_idempotency_key => gen_random_uuid(), p_trial_scope => v_full);
    RAISE EXCEPTION 'invalid duration accepted';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    GET STACKED DIAGNOSTICS v_error = MESSAGE_TEXT;
    IF v_error <> 'SERVICE_TRIAL_ACTION_NOT_ALLOWED' THEN RAISE; END IF;
  END;
  PERFORM pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM public.tenants WHERE slug = 'full-business-trial-rollback')
    AND (SELECT count(*) FROM public.employees) = v_count, 'failed custom grant left orphan tenant/admin');

  -- Scope changes need manage only, never the extension/revoke override permission.
  INSERT INTO public.employee_permission_overrides(employee_id,permission_id,effect,access_scope)
    SELECT v_actor,id,'deny','all' FROM public.permissions WHERE code = 'platform.service_trial.override';
  SET LOCAL ROLE service_role;
  v_result := public.platform_service_trial_update_scope(v_id,v_actor,v_before.version,v_key,v_small,'  调整范围  ');
  RESET ROLE;
  SELECT * INTO STRICT v_after FROM public.tenant_service_trials WHERE id = v_id;
  PERFORM pg_temp.assert_true(v_after.scope_snapshot = v_small AND v_after.version = v_before.version + 1
    AND (to_jsonb(v_after) - ARRAY['scope_snapshot','version','updated_at']) = (to_jsonb(v_before) - ARRAY['scope_snapshot','version','updated_at']),
    'scope edit changed dates, grace, extension count, policy or unrelated facts');
  PERFORM pg_temp.assert_true(EXISTS(SELECT 1 FROM public.tenant_service_trial_events WHERE trial_id = v_id
    AND event_type = 'trial_scope_updated' AND reason = '调整范围' AND actor_employee_id = v_actor
    AND metadata->'before_scope' = v_full AND metadata->'after_scope' = v_small), 'scope audit before/after missing');
  v_replay := public.platform_service_trial_update_scope(v_id,v_actor,v_before.version,v_key,v_small,'调整范围');
  PERFORM pg_temp.assert_true(v_replay->>'idempotent' = 'true' AND v_replay - 'idempotent' = v_result - 'idempotent', 'scope replay must preserve exact envelope');
  PERFORM pg_temp.assert_true((SELECT count(*) = 1 FROM public.tenant_service_trial_events WHERE trial_id = v_id AND event_type = 'trial_scope_updated'), 'replay duplicated audit');
  BEGIN
    PERFORM public.platform_service_trial_update_scope(v_id,v_actor,v_before.version,v_key,v_full,'调整范围');
    RAISE EXCEPTION 'idempotency hash conflict accepted';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    GET STACKED DIAGNOSTICS v_error = MESSAGE_TEXT;
    IF v_error <> 'SERVICE_TRIAL_IDEMPOTENCY_CONFLICT' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.platform_service_trial_update_scope(v_id,v_actor,v_before.version,gen_random_uuid(),v_full,'陈旧版本');
    RAISE EXCEPTION 'stale optimistic version accepted';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    GET STACKED DIAGNOSTICS v_error = MESSAGE_TEXT;
    IF v_error <> 'SERVICE_TRIAL_VERSION_CONFLICT' THEN RAISE; END IF;
  END;
  RAISE NOTICE 'PASS: scope-only mutation, before/after audit, replay, hash conflict, optimistic version';

  INSERT INTO public.employees(id,name,status,tenant_id) VALUES (v_tenant_actor,'租户员工','active',v_before.tenant_id);
  -- A platform role assigned to a tenant employee must not confer platform identity.
  INSERT INTO public.employee_roles(employee_id,role_id) VALUES (v_tenant_actor,v_role);
  FOREACH v_bad_actor IN ARRAY ARRAY[v_tenant_actor,v_no_role,gen_random_uuid()]
  LOOP
    BEGIN
      PERFORM public.platform_service_trial_update_scope(v_id,v_bad_actor,v_before.version,v_key,v_small,'调整范围');
      RAISE EXCEPTION 'unauthorized replay accepted';
    EXCEPTION WHEN SQLSTATE 'P0001' THEN
      GET STACKED DIAGNOSTICS v_error = MESSAGE_TEXT;
      IF v_error <> 'SERVICE_TRIAL_ACTION_NOT_ALLOWED' THEN RAISE; END IF;
    END;
  END LOOP;
  INSERT INTO public.employee_permission_overrides(employee_id,permission_id,effect,access_scope) VALUES (v_actor,v_permission,'deny','all');
  BEGIN
    PERFORM public.platform_service_trial_update_scope(v_id,v_actor,v_before.version,v_key,v_small,'调整范围');
    RAISE EXCEPTION 'denied manage replay accepted';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    GET STACKED DIAGNOSTICS v_error = MESSAGE_TEXT;
    IF v_error <> 'SERVICE_TRIAL_ACTION_NOT_ALLOWED' THEN RAISE; END IF;
  END;
  DELETE FROM public.employee_permission_overrides WHERE employee_id = v_actor AND permission_id = v_permission;
  UPDATE public.employees SET status = 'suspended' WHERE id = v_actor;
  BEGIN
    PERFORM public.platform_service_trial_update_scope(v_id,v_actor,v_before.version,v_key,v_small,'调整范围');
    RAISE EXCEPTION 'inactive actor replay accepted';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    GET STACKED DIAGNOSTICS v_error = MESSAGE_TEXT;
    IF v_error <> 'SERVICE_TRIAL_ACTION_NOT_ALLOWED' THEN RAISE; END IF;
  END;
  UPDATE public.employees SET status = 'active' WHERE id = v_actor;
  RAISE NOTICE 'PASS: platform identity, absent roles, explicit deny and inactive actor checked before replay';

  -- Clock-driven entry into grace accepts the current stored version.
  UPDATE public.tenant_service_trials SET starts_at = clock_timestamp() - interval '30 days 1 second',
    trial_ends_at = clock_timestamp() - interval '1 second', grace_ends_at = clock_timestamp() + interval '7 days' - interval '1 second'
  WHERE id = v_id;
  SELECT * INTO v_before FROM public.tenant_service_trials WHERE id = v_id;
  v_result := public.platform_service_trial_update_scope(v_id,v_actor,v_before.version,gen_random_uuid(),v_full,'宽限期调整');
  SELECT * INTO v_after FROM public.tenant_service_trials WHERE id = v_id;
  PERFORM pg_temp.assert_true(v_after.status = 'grace_period' AND v_after.version = v_before.version + 2
    AND v_after.starts_at = v_before.starts_at AND v_after.trial_ends_at = v_before.trial_ends_at
    AND v_after.grace_ends_at = v_before.grace_ends_at AND v_after.extension_count = v_before.extension_count,
    'grace normalization changed dates or rejected stored version');
  PERFORM pg_temp.assert_true(public.platform_service_trial_access_facts(v_before.tenant_id)->'current_trial'->>'status' = 'grace_period', 'grace access facts incorrect');

  -- Future scheduled trials retain all dates and activated_at.
  UPDATE public.tenant_service_trials SET status = 'scheduled', activated_at = NULL,
    starts_at = clock_timestamp() + interval '1 day', trial_ends_at = clock_timestamp() + interval '31 days',
    grace_ends_at = clock_timestamp() + interval '38 days' WHERE id = v_id;
  SELECT * INTO v_before FROM public.tenant_service_trials WHERE id = v_id;
  PERFORM public.platform_service_trial_update_scope(v_id,v_actor,v_before.version,gen_random_uuid(),v_small,'预约范围');
  SELECT * INTO v_after FROM public.tenant_service_trials WHERE id = v_id;
  PERFORM pg_temp.assert_true(v_after.status = 'scheduled'
    AND (to_jsonb(v_after) - ARRAY['scope_snapshot','version','updated_at']) = (to_jsonb(v_before) - ARRAY['scope_snapshot','version','updated_at']), 'scheduled dates changed');

  -- Stale active rows past grace must not be revived by a scope edit.
  UPDATE public.tenant_service_trials SET status = 'active', activated_at = clock_timestamp() - interval '38 days',
    starts_at = clock_timestamp() - interval '38 days', trial_ends_at = clock_timestamp() - interval '8 days',
    grace_ends_at = clock_timestamp() - interval '1 day' WHERE id = v_id;
  SELECT * INTO v_before FROM public.tenant_service_trials WHERE id = v_id;
  BEGIN
    PERFORM public.platform_service_trial_update_scope(v_id,v_actor,v_before.version,gen_random_uuid(),v_full,'不可恢复');
    RAISE EXCEPTION 'expired effective trial was revived';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    GET STACKED DIAGNOSTICS v_error = MESSAGE_TEXT;
    IF v_error <> 'SERVICE_TRIAL_ACTION_NOT_ALLOWED' THEN RAISE; END IF;
  END;
  PERFORM pg_temp.assert_true(public.platform_service_trial_access_facts(v_before.tenant_id)->>'current_trial' IS NULL, 'expired scope retains access');
  PERFORM pg_temp.assert_true((SELECT scope_snapshot = v_before.scope_snapshot AND version = v_before.version FROM public.tenant_service_trials WHERE id = v_id), 'failed expiry edit mutated facts');
  UPDATE public.tenant_service_trials SET status = 'revoked', revoked_at = clock_timestamp(),
    revoked_by_employee_id = v_actor, revoke_reason = '撤销验证' WHERE id = v_id;
  BEGIN
    PERFORM public.platform_service_trial_update_scope(v_id,v_actor,v_before.version,gen_random_uuid(),v_full,'不可恢复');
    RAISE EXCEPTION 'revoked trial was revived';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    GET STACKED DIAGNOSTICS v_error = MESSAGE_TEXT;
    IF v_error <> 'SERVICE_TRIAL_ACTION_NOT_ALLOWED' THEN RAISE; END IF;
  END;
  -- Build a real order identity so converted denial is tested with all FKs live.
  SELECT id INTO v_config FROM public.platform_payment_configs LIMIT 1;
  IF v_config IS NULL THEN
    INSERT INTO public.platform_payment_configs DEFAULT VALUES RETURNING id INTO v_config;
  END IF;
  INSERT INTO public.tenant_service_orders(
    tenant_id,product_id,product_version_id,order_no,out_trade_no,product_code,
    pricing_version,product_snapshot,term_years,amount_fen,payment_config_id,
    payment_config_guard_version,payer_openid,payment_expires_at,terms_version,
    terms_accepted_at,created_by_employee_id
  ) SELECT v_before.tenant_id,product.id,product_version.id,'full-trial-order','full-trial-trade',product.code,
    1,'{}'::jsonb,1,100,v_config,1,'test-payer',clock_timestamp() + interval '1 hour',1,
    clock_timestamp(),v_tenant_actor
  FROM public.platform_service_products product
  JOIN public.platform_service_product_versions product_version ON product_version.product_id = product.id
  LIMIT 1 RETURNING id INTO STRICT v_order;
  UPDATE public.tenant_service_trials SET status = 'converted',revoked_at = NULL,
    revoked_by_employee_id = NULL,revoke_reason = NULL,converted_at = clock_timestamp(),converted_order_id = v_order
  WHERE id = v_id;
  BEGIN
    PERFORM public.platform_service_trial_update_scope(v_id,v_actor,v_before.version,gen_random_uuid(),v_full,'不可恢复');
    RAISE EXCEPTION 'converted trial was revived';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    GET STACKED DIAGNOSTICS v_error = MESSAGE_TEXT;
    IF v_error <> 'SERVICE_TRIAL_ACTION_NOT_ALLOWED' THEN RAISE; END IF;
  END;
  RAISE NOTICE 'PASS: scheduled/grace dates preserved; expired/revoked/converted edits rejected';

  -- Legacy entry remains on the existing policy; the migration must not expand it.
  SELECT standard_scope INTO v_original_scope FROM public.platform_service_trial_policies WHERE is_current;
  v_created := public.create_platform_tenant_with_trial(p_name => '旧入口验证',p_slug => 'full-business-trial-legacy',
    p_operator_employee_id => v_actor,p_trial_days => 30,p_trial_reason => '旧入口',p_trial_idempotency_key => gen_random_uuid());
  PERFORM pg_temp.assert_true((SELECT scope_snapshot = v_original_scope FROM public.tenant_service_trials
    WHERE id = (v_created->'trial'->>'id')::uuid), 'legacy create changed default scope');
  SET LOCAL ROLE service_role;
  v_result := public.platform_service_trial_update_scope(
    (v_created->'trial'->>'id')::uuid,v_trial_only,1,gen_random_uuid(),v_full,'仅试用权限允许调整范围');
  RESET ROLE;
  PERFORM pg_temp.assert_true(v_result->'trial_snapshot'->'scope' = v_full,
    'scope update incorrectly required tenant.manage');
  RAISE NOTICE 'PASS: trial.manage-only actor can still update scope';
  RAISE NOTICE 'PASS: existing create/default policy compatibility and atomic rollback';
END;
$$;

-- SQL ACL denial is exercised with the actual roles, not only ACL introspection.
SET LOCAL ROLE anon;
DO $$ BEGIN
  BEGIN
    PERFORM public.platform_service_trial_update_scope(NULL,NULL,NULL,NULL,NULL,NULL);
    RAISE EXCEPTION 'anon could invoke scope RPC';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.create_platform_tenant_with_trial_scope('拒绝','denied');
    RAISE EXCEPTION 'anon could invoke create RPC';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  BEGIN
    PERFORM public.platform_service_trial_update_scope(NULL,NULL,NULL,NULL,NULL,NULL);
    RAISE EXCEPTION 'authenticated could invoke scope RPC';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.create_platform_tenant_with_trial_scope('拒绝','denied');
    RAISE EXCEPTION 'authenticated could invoke create RPC';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
ROLLBACK;
