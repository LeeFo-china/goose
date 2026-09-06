-- Invoke through smoke-h5-customer-leads.sh; all migration/fixture writes rollback.
BEGIN;
DO $local_only$
BEGIN
  ASSERT current_setting('customer_lead_smoke.local_endpoint', true) = '127.0.0.1:54322';
  ASSERT current_database() = 'postgres';
END;
$local_only$;

DO $history_preserved$
BEGIN
  ASSERT (SELECT count(*) = 4 FROM h5_customer_lead_history_snapshot), 'Missing pre-migration history';
  ASSERT NOT EXISTS (
    SELECT 1 FROM h5_customer_lead_history_snapshot AS snapshot
    LEFT JOIN public.marketing_leads AS lead ON lead.id = snapshot.id
    WHERE lead.id IS NULL OR to_jsonb(lead) IS DISTINCT FROM snapshot.payload
  ), 'Migration changed historical IDs, source, customer, status, remarks or version';
  ASSERT NOT EXISTS (SELECT 1 FROM public.douyin_lead_follow_ups
    WHERE marketing_lead_id IN (SELECT id FROM h5_customer_lead_history_snapshot)),
    'Migration fabricated historical follow-ups';
  RAISE NOTICE 'H5 PRE-MIGRATION HISTORY PRESERVED';
END;
$history_preserved$;

DO $commands$
DECLARE
  t uuid := gen_random_uuid(); ot uuid := gen_random_uuid();
  actor uuid := gen_random_uuid(); other_actor uuid := gen_random_uuid();
  page uuid := gen_random_uuid(); pv uuid := gen_random_uuid();
  lead uuid := gen_random_uuid(); existing_lead uuid := gen_random_uuid();
  invalid_lead uuid := gen_random_uuid(); douyin_lead uuid := gen_random_uuid();
  installation uuid := gen_random_uuid(); existing_customer uuid := gen_random_uuid();
  customer uuid; source_id uuid; mismatched_customer uuid := gen_random_uuid();
  follow_key uuid := gen_random_uuid(); assign_key uuid := gen_random_uuid();
  convert_key uuid := gen_random_uuid(); invalid_key uuid := gen_random_uuid();
  reply jsonb; initial jsonb; version_before integer; existing_customer_snapshot jsonb;
BEGIN
  INSERT INTO public.tenants(id, name, slug) VALUES
    (t, 'H5 lead SQL smoke', 'h5-smoke-' || t),
    (ot, 'Other H5 smoke', 'h5-smoke-' || ot);
  INSERT INTO public.employees(id, tenant_id, name, status) VALUES
    (actor, t, 'Actor', 'active'), (other_actor, ot, 'Other', 'active');
  INSERT INTO public.marketing_pages(id, tenant_id, title, slug)
    VALUES (page, t, 'H5 smoke', 'h5-smoke-' || t);
  INSERT INTO public.marketing_page_versions(id, tenant_id, page_id, version_no)
    VALUES (pv, t, page, 1);
  INSERT INTO public.customers(id, tenant_id, name, phone, status, source, owner_id)
    VALUES (existing_customer, t, '已有客户', '13900000802', 'designing', 'h5_campaign', actor);
  SET LOCAL ROLE service_role;
  INSERT INTO public.marketing_leads(id, tenant_id, page_id, page_version_id,
    source, name, phone, community, form_data, customer_id) VALUES
    (lead, t, page, pv, 'h5', 'H5跟进', '13900000801', '测试小区', '{"secret":"never expose"}', NULL),
    (existing_lead, t, page, pv, 'h5', '已有客户', '13900000802', '测试小区', '{}', existing_customer),
    (invalid_lead, t, page, pv, 'h5', '无效线索', '13900000803', '测试小区', '{}', NULL);
  RESET ROLE;
  ASSERT (SELECT version = 1 FROM public.marketing_leads WHERE id = lead), 'Historical H5 default version';
  ASSERT NOT EXISTS (SELECT 1 FROM public.douyin_lead_follow_ups WHERE marketing_lead_id = lead), 'Do not fabricate history';

  -- RED before the H5 migration: the unchanged core returns DOUYIN_LEAD_NOT_FOUND.
  reply := public.append_customer_lead_follow_up(t, lead, NULL, actor,
    'phone', '联系客户', '下周回访', NULL, NULL, NULL, 1, follow_key);
  ASSERT reply->'error' IS NULL, 'H5 ordinary follow-up failed: ' || reply::text;
  ASSERT reply #>> '{data,lead_version}' = '2', 'H5 follow-up increments version';
  ASSERT reply #> '{data,appointment_id}' = 'null'::jsonb, 'H5 has no appointment';
  initial := reply;
  reply := public.append_customer_lead_follow_up(t, lead, NULL, actor,
    'phone', '联系客户', '下周回访', NULL, NULL, NULL, 1, follow_key);
  ASSERT reply->'data' = (initial->'data' || '{"idempotent":true}'), 'Immutable follow-up replay';
  reply := public.append_customer_lead_follow_up(t, lead, NULL, actor,
    'phone', '更改意图', '下周回访', NULL, NULL, NULL, 1, follow_key);
  ASSERT reply #>> '{error,code}' = 'DOUYIN_LEAD_IDEMPOTENCY_CONFLICT';
  reply := public.append_customer_lead_follow_up(t, lead, NULL, actor,
    'phone', '联系客户', '下周回访', NULL, NULL, NULL, 1, gen_random_uuid());
  ASSERT reply #>> '{error,code}' = 'DOUYIN_LEAD_VERSION_CONFLICT';
  reply := public.append_customer_lead_follow_up(t, lead, gen_random_uuid(), actor,
    'phone', '联系客户', '下周回访', NULL, NULL, NULL, 2, gen_random_uuid());
  ASSERT reply #>> '{error,code}' = 'DOUYIN_LEAD_FOLLOW_UP_COMMAND_INVALID', 'Reject H5 appointment linkage';
  BEGIN
    INSERT INTO public.douyin_measurement_appointments(tenant_id, marketing_lead_id)
      VALUES (t, lead);
    RAISE EXCEPTION 'Physical H5 appointment accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'CUSTOMER_LEAD_APPOINTMENT_SOURCE_INVALID' THEN RAISE; END IF;
  END;
  BEGIN
    INSERT INTO public.douyin_lead_follow_ups(tenant_id, marketing_lead_id, employee_id)
      VALUES (t, lead, other_actor);
    RAISE EXCEPTION 'Cross tenant follow-up employee accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'CUSTOMER_LEAD_FOLLOW_UP_SCOPE_INVALID' THEN RAISE; END IF;
  END;

  reply := public.assign_customer_lead(ot, lead, other_actor, other_actor, 2, gen_random_uuid(), NULL);
  ASSERT reply #>> '{error,code}' = 'DOUYIN_LEAD_NOT_FOUND';
  reply := public.assign_customer_lead(t, lead, actor, other_actor, 2, gen_random_uuid(), NULL);
  ASSERT reply #>> '{error,code}' = 'DOUYIN_LEAD_ASSIGNEE_NOT_FOUND';
  reply := public.assign_customer_lead(t, lead, actor, actor, 2, assign_key, NULL);
  ASSERT reply->'error' IS NULL, reply::text;
  ASSERT reply #>> '{data,lead_version}' = '3';
  reply := public.assign_customer_lead(t, lead, actor, actor, 2, assign_key, NULL);
  ASSERT reply #>> '{data,idempotent}' = 'true';
  reply := public.assign_douyin_lead(t, lead, actor, actor, 2, assign_key, NULL);
  ASSERT reply #>> '{error,code}' = 'DOUYIN_LEAD_NOT_FOUND', 'Legacy wrapper must reject H5 replay';
  reply := public.append_douyin_lead_follow_up(t, lead, NULL, actor,
    'phone', '联系客户', '下周回访', NULL, NULL, NULL, 1, follow_key);
  ASSERT reply #>> '{error,code}' = 'DOUYIN_LEAD_NOT_FOUND';

  -- Exercise the unchanged public duplicate-submission write shape under service_role.
  SET LOCAL ROLE service_role;
  UPDATE public.marketing_leads SET name = '重复报名', form_data = '{"secret":"updated"}',
    page_version_id = pv, phone = '13900000801', community = '测试小区', city = NULL,
    request_ip = NULL, user_agent = 'smoke', wx_openid = NULL WHERE id = lead;
  RESET ROLE;
  ASSERT (SELECT version = 4 AND lead_status = 'contacted' AND assigned_employee_id = actor
    FROM public.marketing_leads WHERE id = lead), 'Capture preserves workflow and advances CAS';
  BEGIN
    SET LOCAL ROLE service_role;
    UPDATE public.marketing_leads SET lead_status = 'new' WHERE id = lead;
    RAISE EXCEPTION 'Capture reset workflow';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'CUSTOMER_LEAD_DIRECT_WRITE_FORBIDDEN' THEN RAISE; END IF;
  END;
  reply := public.convert_customer_lead_to_customer(t, lead, actor, 3, convert_key, NULL, true);
  ASSERT reply #>> '{error,code}' = 'DOUYIN_LEAD_VERSION_CONFLICT';
  reply := public.convert_customer_lead_to_customer(t, lead, actor, 4, convert_key, NULL, true);
  ASSERT reply->'error' IS NULL, reply::text;
  ASSERT reply #>> '{data,created_customer}' = 'true';
  customer := (reply #>> '{data,customer_id}')::uuid;
  ASSERT (SELECT source = 'h5_campaign' AND owner_id = actor FROM public.customers WHERE id = customer);
  SELECT id INTO STRICT source_id FROM public.customer_sources WHERE marketing_lead_id = lead;
  ASSERT (SELECT source = 'h5' AND source_label = 'H5活动' AND
    metadata = jsonb_build_object('marketing_lead_id', lead, 'source', 'h5',
      'community', '测试小区', 'page_id', page, 'page_version_id', pv)
    FROM public.customer_sources WHERE id = source_id), 'Bounded true H5 attribution';
  initial := reply;
  reply := public.convert_customer_lead_to_customer(t, lead, actor, 4, convert_key, customer, false);
  ASSERT reply->'data' = (initial->'data' || '{"idempotent":true}'), 'Creation replay after preflight';
  reply := public.convert_douyin_lead_to_customer(t, lead, actor, 4, convert_key, customer, false);
  ASSERT reply #>> '{error,code}' = 'DOUYIN_LEAD_NOT_FOUND';
  reply := public.convert_customer_lead_to_customer(t, lead, actor, 5, gen_random_uuid(), customer, false);
  ASSERT reply #>> '{data,repeated_conversion}' = 'true';
  ASSERT (SELECT count(*) = 1 FROM public.customer_sources WHERE marketing_lead_id = lead), 'No duplicate attribution';
  SET LOCAL ROLE service_role;
  UPDATE public.marketing_leads SET name = '已转客户重复报名', customer_id = customer WHERE id = lead;
  RESET ROLE;
  ASSERT (SELECT customer_id = customer AND lead_status = 'converted' AND version = 6
    FROM public.marketing_leads WHERE id = lead), 'Converted capture preserves relationship';
  BEGIN
    SET LOCAL ROLE service_role;
    UPDATE public.marketing_leads SET customer_id = existing_customer WHERE id = lead;
    RAISE EXCEPTION 'Converted customer rebind accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'CUSTOMER_LEAD_OWNERSHIP_IMMUTABLE' THEN RAISE; END IF;
  END;
  BEGIN
    UPDATE public.customer_sources SET source = 'douyin_miniapp' WHERE id = source_id;
    RAISE EXCEPTION 'Source mutation accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'CUSTOMER_LEAD_SOURCE_IMMUTABLE' THEN RAISE; END IF;
  END;
  BEGIN
    DELETE FROM public.customer_sources WHERE id = source_id;
    RAISE EXCEPTION 'Source deletion accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'CUSTOMER_LEAD_SOURCE_IMMUTABLE' THEN RAISE; END IF;
  END;
  -- Customer phones can change independently of the historical lead binding.
  UPDATE public.customers SET phone = '13900000812' WHERE id = existing_customer;
  reply := public.convert_customer_lead_to_customer(t, existing_lead, actor, 1,
    gen_random_uuid(), NULL, true);
  ASSERT reply #>> '{error,code}' = 'DOUYIN_LEAD_CUSTOMER_PREFLIGHT_CONFLICT',
    'Stale H5 customer binding returns a conflict before customer creation: ' || reply::text;
  ASSERT NOT EXISTS (SELECT 1 FROM public.customers WHERE tenant_id = t AND phone = '13900000802');
  ASSERT (SELECT customer_id = existing_customer AND lead_status = 'new' AND version = 1
    FROM public.marketing_leads WHERE id = existing_lead), 'Stale binding leaves lead unchanged';
  INSERT INTO public.customers(id, tenant_id, name, phone, status)
    VALUES (mismatched_customer, t, '原号码现在属于其他客户', '13900000802', 'potential');
  reply := public.convert_customer_lead_to_customer(t, existing_lead, actor, 1,
    gen_random_uuid(), mismatched_customer, false);
  ASSERT reply #>> '{error,code}' = 'DOUYIN_LEAD_CUSTOMER_PREFLIGHT_CONFLICT',
    'A different customer at the lead phone cannot replace its historical binding';
  ASSERT NOT EXISTS (SELECT 1 FROM public.customer_sources WHERE customer_id = mismatched_customer);
  ASSERT (SELECT customer_id = existing_customer AND version = 1
    FROM public.marketing_leads WHERE id = existing_lead);
  DELETE FROM public.customers WHERE id = mismatched_customer;
  UPDATE public.customers SET phone = '13900000802' WHERE id = existing_customer;
  SELECT to_jsonb(c) INTO STRICT existing_customer_snapshot
    FROM public.customers AS c WHERE id = existing_customer;
  reply := public.convert_customer_lead_to_customer(t, existing_lead, actor, 1,
    gen_random_uuid(), existing_customer, false);
  ASSERT reply->'error' IS NULL AND reply #>> '{data,created_customer}' = 'false', reply::text;
  ASSERT (SELECT count(*) = 1 FROM public.customers WHERE tenant_id = t AND phone = '13900000802');
  ASSERT (SELECT to_jsonb(c) = existing_customer_snapshot FROM public.customers AS c
    WHERE id = existing_customer), 'Existing customer owner, stage and remaining fields are preserved';
  reply := public.mark_customer_lead_invalid(t, invalid_lead, actor, '无效号码', 1, invalid_key);
  ASSERT reply->'error' IS NULL AND reply #>> '{data,lead_version}' = '2', reply::text;
  reply := public.mark_customer_lead_invalid(t, invalid_lead, actor, '无效号码', 1, invalid_key);
  ASSERT reply #>> '{data,idempotent}' = 'true';
  reply := public.mark_douyin_lead_invalid(t, invalid_lead, actor, '无效号码', 1, invalid_key);
  ASSERT reply #>> '{error,code}' = 'DOUYIN_LEAD_NOT_FOUND';

  INSERT INTO public.douyin_third_party_components(component_appid) VALUES ('h5-smoke-' || t);
  INSERT INTO public.douyin_miniapp_installations(id, tenant_id, component_appid, authorizer_appid)
    VALUES (installation, t, 'h5-smoke-' || t, 'h5-smoke-' || t);
  INSERT INTO public.marketing_leads(id, tenant_id, douyin_miniapp_installation_id, source, name, phone)
    VALUES (douyin_lead, t, installation, 'douyin_miniapp', '抖音兼容', '13900000804');
  reply := public.assign_douyin_lead(t, douyin_lead, actor, actor, 1, gen_random_uuid(), NULL);
  ASSERT reply->'error' IS NULL, reply::text;
  reply := public.list_tenant_customer_leads(t, NULL, NULL, NULL, NULL, NULL, NULL, 1, 2);
  ASSERT reply #>> '{data,total}' = '4' AND jsonb_array_length(reply #> '{data,list}') = 2;
  reply := public.list_tenant_customer_leads(t, NULL, NULL, NULL, NULL, NULL, NULL, 1, 20, 'h5');
  ASSERT reply #>> '{data,total}' = '3';
  ASSERT reply #>> '{data,list,0,source}' = 'h5' AND reply #>> '{data,list,0,page_id}' = page::text;
  ASSERT NOT ((reply #> '{data,list,0}') ? 'form_data'), 'No raw form in list';
  reply := public.list_tenant_douyin_leads(t, NULL, NULL, NULL, NULL, NULL, NULL, 1, 20);
  ASSERT reply #>> '{data,total}' = '1';
  reply := public.list_tenant_customer_leads(t, '{}', NULL, NULL, NULL, NULL, NULL);
  ASSERT reply #>> '{data,total}' = '0';
  reply := public.list_tenant_customer_leads(t, NULL, NULL, NULL, NULL, NULL, NULL, 1, 20, 'h5', 'unassigned');
  ASSERT reply #>> '{data,total}' = '2';
  BEGIN
    PERFORM public.list_tenant_customer_leads(t, NULL, NULL, NULL, NULL, NULL, NULL, 1, 101);
    RAISE EXCEPTION 'Unbounded page accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  ASSERT NOT has_function_privilege('authenticated',
    'public.assign_customer_lead(uuid,uuid,uuid,uuid,integer,uuid,uuid)', 'EXECUTE');
  ASSERT has_function_privilege('service_role',
    'public.assign_customer_lead(uuid,uuid,uuid,uuid,integer,uuid,uuid)', 'EXECUTE');
  RAISE NOTICE 'H5 CUSTOMER LEAD COMMAND SMOKE PASSED';
END;
$commands$;

DO $tenant_boundaries$
DECLARE
  t uuid; tenant_lead uuid := gen_random_uuid(); platform_lead uuid := gen_random_uuid();
BEGIN
  SELECT id INTO STRICT t FROM public.tenants WHERE name = 'H5 lead SQL smoke';
  INSERT INTO public.marketing_leads(id, tenant_id, source, name)
    VALUES (tenant_lead, t, 'h5', '未处理租户线索'),
      (platform_lead, NULL, 'h5', '平台线索');
  BEGIN
    SET LOCAL ROLE service_role;
    UPDATE public.marketing_leads SET tenant_id = NULL WHERE id = tenant_lead;
    RAISE EXCEPTION 'Tenant H5 downgrade accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'CUSTOMER_LEAD_OWNERSHIP_IMMUTABLE' THEN RAISE; END IF;
  END;
  BEGIN
    SET LOCAL ROLE service_role;
    UPDATE public.marketing_leads SET source = 'legacy_h5' WHERE id = tenant_lead;
    RAISE EXCEPTION 'Tenant H5 source escape accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'CUSTOMER_LEAD_OWNERSHIP_IMMUTABLE' THEN RAISE; END IF;
  END;
  BEGIN
    SET LOCAL ROLE service_role;
    DELETE FROM public.marketing_leads WHERE id = tenant_lead;
    RAISE EXCEPTION 'Service role deleted a tenant H5 lead without ledger facts';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'CUSTOMER_LEAD_DIRECT_WRITE_FORBIDDEN' THEN RAISE; END IF;
  END;
  ASSERT EXISTS (SELECT 1 FROM public.marketing_leads WHERE id = tenant_lead);
  DELETE FROM public.marketing_leads WHERE id = tenant_lead;
  ASSERT NOT EXISTS (SELECT 1 FROM public.marketing_leads WHERE id = tenant_lead),
    'Table owner can maintain a lead without facts';
  BEGIN
    DELETE FROM public.marketing_leads WHERE tenant_id = t AND name = '已有客户';
    RAISE EXCEPTION 'Owner deleted a lead with immutable source/workflow facts';
  EXCEPTION WHEN foreign_key_violation THEN NULL; END;

  SET LOCAL ROLE service_role;
  UPDATE public.marketing_leads SET name = '平台旧入口更新', lead_status = 'contacted'
    WHERE id = platform_lead;
  RESET ROLE;
  ASSERT (SELECT version = 1 AND lead_status = 'contacted'
    FROM public.marketing_leads WHERE id = platform_lead),
    'Tenant-only guard must not manage platform H5 versions';
  SET LOCAL ROLE service_role;
  UPDATE public.marketing_leads SET source = 'legacy_h5', version = 7 WHERE id = platform_lead;
  DELETE FROM public.marketing_leads WHERE id = platform_lead;
  RESET ROLE;
  ASSERT NOT EXISTS (SELECT 1 FROM public.marketing_leads WHERE id = platform_lead),
    'Platform update/delete behavior remains outside the tenant guard';
  RAISE NOTICE 'H5 TENANT BOUNDARY SMOKE PASSED';
END;
$tenant_boundaries$;

DO $performance$
DECLARE t uuid; actor uuid; page uuid; pv uuid; plan record; query text;
BEGIN
  SELECT id INTO STRICT t FROM public.tenants WHERE name = 'H5 lead SQL smoke';
  SELECT id INTO STRICT actor FROM public.employees WHERE tenant_id = t;
  SELECT id INTO STRICT page FROM public.marketing_pages WHERE tenant_id = t;
  SELECT id INTO STRICT pv FROM public.marketing_page_versions WHERE page_id = page;
  INSERT INTO public.marketing_leads(tenant_id, page_id, page_version_id, source,
    name, phone, community, assigned_employee_id, assigned_at, created_at)
  SELECT t, page, pv, 'h5', CASE WHEN n = 2500 THEN 'PerfTarget' ELSE '性能线索' || n END,
    '1390002' || lpad(n::text, 4, '0'), '性能小区',
    CASE WHEN n % 2 = 0 THEN actor END, CASE WHEN n % 2 = 0 THEN now() END,
    now() - make_interval(secs => n) FROM generate_series(1, 5000) AS fixture(n);
  ANALYZE public.marketing_leads;
  FOREACH query IN ARRAY ARRAY[
    format('SELECT id, created_at FROM public.marketing_leads WHERE tenant_id=%L::uuid AND source IN (''h5'',''douyin_miniapp'') ORDER BY created_at DESC,id DESC LIMIT 20', t),
    format('SELECT id, created_at FROM public.marketing_leads WHERE tenant_id=%L::uuid AND source IN (''h5'',''douyin_miniapp'') AND assigned_employee_id=%L::uuid ORDER BY created_at DESC,id DESC LIMIT 20', t, actor),
    format('SELECT id FROM public.marketing_leads WHERE tenant_id=%L::uuid AND source=''h5'' AND (name ILIKE ''%%PerfTarget%%'' OR phone ILIKE ''%%PerfTarget%%'' OR community ILIKE ''%%PerfTarget%%'') ORDER BY created_at DESC,id DESC LIMIT 20', t)
  ] LOOP
    RAISE NOTICE 'PERFORMANCE SQL: %', query;
    FOR plan IN EXECUTE 'EXPLAIN (ANALYZE, BUFFERS) ' || query LOOP
      RAISE NOTICE '%', plan."QUERY PLAN";
    END LOOP;
  END LOOP;
END;
$performance$;
ROLLBACK;
