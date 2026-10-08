\set ON_ERROR_STOP on
-- Disposable local database only; all fixture writes roll back.
BEGIN;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';
DO $$
DECLARE
  v_created jsonb;
  v_tenant_id uuid;
  v_profile public.tenant_service_provider_profiles%ROWTYPE;
  v_result jsonb;
  v_count bigint;
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='create_tenant_with_default_template'
      AND (has_function_privilege('anon',p.oid,'EXECUTE')
        OR has_function_privilege('authenticated',p.oid,'EXECUTE')
        OR NOT has_function_privilege('service_role',p.oid,'EXECUTE'))
  ) THEN RAISE EXCEPTION 'creation RPC ACL changed'; END IF;

  v_created := public.create_tenant_with_default_template(
    p_name => '草稿初始化验证', p_slug => 'provider-profile-smoke',
    p_contact_phone => '13999100090', p_address => '测试地址',
    p_address_province => '河南省', p_address_city => '郑州市',
    p_address_district => '金水区', p_address_adcode => '410105',
    p_address_latitude => 34.8, p_address_longitude => 113.6
  );
  v_tenant_id := (v_created->'tenant'->>'id')::uuid;
  SELECT * INTO v_profile FROM public.tenant_service_provider_profiles WHERE tenant_id=v_tenant_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'manual tenant is missing its service-provider draft'; END IF;
  IF v_profile.public_name <> '草稿初始化验证' OR v_profile.status <> 'draft'
    OR v_profile.version <> 1 OR v_profile.public_phone IS NOT NULL
    OR v_profile.published_at IS NOT NULL OR v_profile.submitted_at IS NOT NULL
    OR v_profile.reviewed_at IS NOT NULL OR v_profile.address <> '测试地址'
    OR v_profile.address_region_code <> '410105'
    OR v_profile.address_latitude <> 34.8 OR v_profile.address_longitude <> 113.6
  THEN RAISE EXCEPTION 'draft fields or publication boundary incorrect'; END IF;
  IF EXISTS(SELECT 1 FROM public.tenant_service_areas WHERE tenant_id=v_tenant_id)
  THEN RAISE EXCEPTION 'must not fabricate service areas'; END IF;
  v_result := public.submit_tenant_service_provider_profile(v_tenant_id,1);
  IF v_result->>'status' <> 'validation_failed'
  THEN RAISE EXCEPTION 'incomplete draft bypassed publication validation'; END IF;
  v_result := public.update_tenant_service_provider_profile(v_tenant_id,1,'{"public_name":"更新草稿"}');
  IF v_result->>'status' <> 'updated' OR v_result->'profile'->>'public_name' <> '更新草稿'
  THEN RAISE EXCEPTION 'new draft cannot be edited'; END IF;
  v_result := public.update_tenant_service_provider_profile(v_tenant_id,1,'{"public_name":"过期版本"}');
  IF v_result->>'status' <> 'version_conflict'
  THEN RAISE EXCEPTION 'optimistic locking bypassed'; END IF;

  v_created := public.create_tenant_with_default_template(
    p_name => '暂停租户草稿验证', p_slug => 'provider-profile-suspended', p_status => 'suspended');
  IF NOT EXISTS(SELECT 1 FROM public.tenant_service_provider_profiles
    WHERE tenant_id=(v_created->'tenant'->>'id')::uuid AND status='draft' AND public_phone IS NULL)
  THEN RAISE EXCEPTION 'suspended tenant lacks draft'; END IF;

  SELECT count(*) INTO v_count FROM public.tenant_service_provider_profiles;
  BEGIN
    PERFORM public.create_tenant_with_default_template(p_name=>'重复',p_slug=>'provider-profile-smoke');
    RAISE EXCEPTION 'duplicate tenant accepted';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  IF (SELECT count(*) FROM public.tenant_service_provider_profiles) <> v_count
  THEN RAISE EXCEPTION 'failed creation left profile residue'; END IF;
END;
$$;
ROLLBACK;
