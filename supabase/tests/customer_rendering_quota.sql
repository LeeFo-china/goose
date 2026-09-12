-- Behavioral verification for the customer rendering identity/quota ledger.
-- All fixtures are rolled back.
BEGIN;

DO $$
DECLARE
  v_tenant_a uuid := gen_random_uuid();
  v_tenant_b uuid := gen_random_uuid();
  v_wechat_subject text := repeat('a', 64);
  v_release_subject text := repeat('b', 64);
  v_douyin_subject text := repeat('c', 64);
  v_phone_digest text := repeat('d', 64);
  v_request_hash text := repeat('e', 64);
  v_other_hash text := repeat('f', 64);
  v_wechat_job uuid := gen_random_uuid();
  v_release_job uuid := gen_random_uuid();
  v_douyin_job uuid := gen_random_uuid();
  v_result jsonb;
  v_account_a uuid;
BEGIN
  INSERT INTO public.tenants (id, slug, name, status)
  VALUES
    (v_tenant_a, 'rendering-quota-a-' || substr(v_tenant_a::text, 1, 8), '额度测试租户 A', 'active'),
    (v_tenant_b, 'rendering-quota-b-' || substr(v_tenant_b::text, 1, 8), '额度测试租户 B', 'active');

  v_result := public.reserve_customer_rendering_quota(
    v_tenant_a, 'wechat', 1::smallint, v_wechat_subject,
    NULL::text, NULL::uuid, NULL::smallint, NULL::text,
    v_wechat_job, gen_random_uuid(), v_request_hash
  );
  IF v_result->>'decision' <> 'reserved'
    OR (v_result->>'reserved')::integer <> 1
    OR (v_result->>'phone_verified')::boolean
  THEN
    RAISE EXCEPTION 'anonymous first reservation mismatch: %', v_result;
  END IF;

  v_result := public.reserve_customer_rendering_quota(
    v_tenant_a, 'wechat', 1::smallint, v_wechat_subject,
    NULL::text, NULL::uuid, NULL::smallint, NULL::text,
    gen_random_uuid(), gen_random_uuid(), v_other_hash
  );
  IF v_result->>'decision' <> 'job_active' THEN
    RAISE EXCEPTION 'active reservation must block a different job: %', v_result;
  END IF;

  v_result := public.settle_customer_rendering_quota(v_tenant_a, v_wechat_job, 'consume');
  IF v_result->>'decision' <> 'consume'
    OR (v_result->>'consumed')::integer <> 1
    OR (v_result->>'reserved')::integer <> 0
  THEN
    RAISE EXCEPTION 'consume mismatch: %', v_result;
  END IF;

  v_result := public.reserve_customer_rendering_quota(
    v_tenant_a, 'wechat', 1::smallint, v_wechat_subject,
    NULL::text, NULL::uuid, NULL::smallint, NULL::text,
    gen_random_uuid(), gen_random_uuid(), v_other_hash
  );
  IF v_result->>'decision' <> 'phone_required' THEN
    RAISE EXCEPTION 'consumed anonymous trial must require phone: %', v_result;
  END IF;

  v_result := public.reserve_customer_rendering_quota(
    v_tenant_a, 'wechat', 1::smallint, v_release_subject,
    NULL::text, NULL::uuid, NULL::smallint, NULL::text,
    v_release_job, gen_random_uuid(), v_request_hash
  );
  IF v_result->>'decision' <> 'reserved' THEN
    RAISE EXCEPTION 'release fixture reservation mismatch: %', v_result;
  END IF;
  v_result := public.settle_customer_rendering_quota(v_tenant_a, v_release_job, 'release');
  IF v_result->>'decision' <> 'release'
    OR (v_result->>'consumed')::integer <> 0
    OR (v_result->>'reserved')::integer <> 0
  THEN
    RAISE EXCEPTION 'release must restore trial capacity: %', v_result;
  END IF;
  v_result := public.reserve_customer_rendering_quota(
    v_tenant_a, 'wechat', 1::smallint, v_release_subject,
    NULL::text, NULL::uuid, NULL::smallint, NULL::text,
    gen_random_uuid(), gen_random_uuid(), v_other_hash
  );
  IF v_result->>'decision' <> 'reserved' THEN
    RAISE EXCEPTION 'released trial must be reservable again: %', v_result;
  END IF;

  v_result := public.bind_customer_rendering_phone(
    v_tenant_a, 'wechat', 1::smallint, v_wechat_subject, NULL::text, NULL::uuid,
    1::smallint, v_phone_digest, gen_random_uuid(), v_request_hash
  );
  IF v_result->>'decision' <> 'bound'
    OR NOT (v_result->>'phone_verified')::boolean
    OR (v_result->>'consumed')::integer <> 1
  THEN
    RAISE EXCEPTION 'wechat phone bind must retain trial usage: %', v_result;
  END IF;
  v_account_a := (v_result->>'account_id')::uuid;

  v_result := public.reserve_customer_rendering_quota(
    v_tenant_a, 'douyin', 1::smallint, v_douyin_subject,
    'tt-test-app', gen_random_uuid(), NULL::smallint, NULL::text,
    v_douyin_job, gen_random_uuid(), v_request_hash
  );
  IF v_result->>'decision' <> 'reserved' THEN
    RAISE EXCEPTION 'douyin trial reservation mismatch: %', v_result;
  END IF;
  v_result := public.settle_customer_rendering_quota(v_tenant_a, v_douyin_job, 'consume');
  IF v_result->>'decision' <> 'consume' THEN
    RAISE EXCEPTION 'douyin consume mismatch: %', v_result;
  END IF;
  v_result := public.bind_customer_rendering_phone(
    v_tenant_a, 'douyin', 1::smallint, v_douyin_subject, 'tt-test-app',
    (
      SELECT binding.installation_id
      FROM public.customer_rendering_identity_bindings AS binding
      WHERE binding.tenant_id = v_tenant_a
        AND binding.channel = 'douyin'
        AND binding.subject_digest = v_douyin_subject
    ),
    1::smallint, v_phone_digest, gen_random_uuid(), v_other_hash
  );
  IF v_result->>'decision' <> 'bound'
    OR (v_result->>'account_id')::uuid <> v_account_a
    OR (v_result->>'consumed')::integer <> 2
    OR (v_result->>'reserved')::integer <> 0
  THEN
    RAISE EXCEPTION 'cross-channel phone merge mismatch: %', v_result;
  END IF;

  v_result := public.reserve_customer_rendering_quota(
    v_tenant_b, 'wechat', 1::smallint, v_wechat_subject,
    NULL::text, NULL::uuid, NULL::smallint, NULL::text,
    gen_random_uuid(), gen_random_uuid(), v_request_hash
  );
  IF v_result->>'decision' <> 'reserved' THEN
    RAISE EXCEPTION 'same subject digest must be tenant isolated: %', v_result;
  END IF;

  BEGIN
    INSERT INTO public.customer_rendering_identity_bindings (
      tenant_id,
      channel,
      subject_key_version,
      subject_digest,
      quota_account_id
    ) VALUES (
      v_tenant_b,
      'wechat',
      1,
      repeat('9', 64),
      v_account_a
    );
    RAISE EXCEPTION 'cross-tenant account binding unexpectedly succeeded';
  EXCEPTION WHEN foreign_key_violation THEN
    NULL;
  END;

  IF has_table_privilege('authenticated', 'public.customer_rendering_quota_events', 'UPDATE')
    OR has_table_privilege('authenticated', 'public.customer_rendering_quota_events', 'DELETE')
    OR has_table_privilege('service_role', 'public.customer_rendering_quota_events', 'UPDATE')
    OR has_table_privilege('service_role', 'public.customer_rendering_quota_events', 'DELETE')
  THEN
    RAISE EXCEPTION 'quota events must be append-only for application roles';
  END IF;
END;
$$;

ROLLBACK;
