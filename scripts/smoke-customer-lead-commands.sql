-- Local-only transactional verification. Invoke exclusively via
-- docker exec -i supabase_db_gooes psql -U postgres -d postgres -X -v ON_ERROR_STOP=1
-- Set customer_lead_smoke.local_endpoint='127.0.0.1:54322' in that session.
-- The setting below is a secondary guard, not remote endpoint authentication.
-- The migration may be prepended with its BEGIN/COMMIT removed to verify it
-- without persisting schema changes. All fixtures and commands roll back.
BEGIN;

DO $local_only$
BEGIN
  IF current_setting('customer_lead_smoke.local_endpoint', true)
      IS DISTINCT FROM '127.0.0.1:54322'
    OR current_database() <> 'postgres'
  THEN
    RAISE EXCEPTION 'Customer lead smoke requires the local Supabase database';
  END IF;
END;
$local_only$;

DO $catalog$
DECLARE
  v_function regprocedure;
  v_signature text;
  v_owner oid;
BEGIN
  SELECT relowner INTO v_owner FROM pg_class
  WHERE oid = 'public.marketing_leads'::regclass;
  FOREACH v_signature IN ARRAY ARRAY[
    'public.assign_customer_lead(uuid,uuid,uuid,uuid,integer,uuid,uuid)',
    'public.append_customer_lead_follow_up(uuid,uuid,uuid,uuid,text,text,text,timestamptz,text,timestamptz,integer,uuid)',
    'public.convert_customer_lead_to_customer(uuid,uuid,uuid,integer,uuid,uuid,boolean)',
    'public.mark_customer_lead_invalid(uuid,uuid,uuid,text,integer,uuid)',
    'public.list_tenant_customer_leads(uuid,uuid[],text,uuid,timestamptz,timestamptz,text,integer,integer,text,text)'
  ] LOOP
    v_function := to_regprocedure(v_signature);
    ASSERT v_function IS NOT NULL, 'Generic customer lead command missing: ' || v_signature;
    ASSERT EXISTS (SELECT 1 FROM pg_proc WHERE oid = v_function
      AND prosecdef AND proowner = v_owner), 'Trusted command owner mismatch';
    ASSERT has_function_privilege('service_role', v_function, 'EXECUTE'), 'Missing service role execute';
    ASSERT NOT has_function_privilege('anon', v_function, 'EXECUTE'), 'Anonymous execute exposed';
    ASSERT NOT has_function_privilege('authenticated', v_function, 'EXECUTE'), 'Authenticated execute exposed';
  END LOOP;
  ASSERT NOT (SELECT attnotnull FROM pg_attribute
    WHERE attrelid = 'public.douyin_lead_follow_ups'::regclass
      AND attname = 'douyin_measurement_appointment_id'), 'Ordinary follow-up must permit null appointment';
  ASSERT (SELECT provolatile = 's' FROM pg_proc WHERE oid =
    'public.list_tenant_customer_leads(uuid,uuid[],text,uuid,timestamptz,timestamptz,text,integer,integer,text,text)'::regprocedure),
    'List count and page require a shared statement snapshot';
  ASSERT (SELECT provolatile = 's' FROM pg_proc WHERE oid =
    'public.list_tenant_douyin_leads(uuid,uuid[],text,uuid,timestamptz,timestamptz,text,integer,integer)'::regprocedure),
    'Legacy list wrapper must retain stable read semantics';
END;
$catalog$;

DO $commands$
DECLARE
  v_tenant uuid := gen_random_uuid();
  v_other_tenant uuid := gen_random_uuid();
  v_actor uuid := gen_random_uuid();
  v_other_actor uuid := gen_random_uuid();
  v_installation uuid := gen_random_uuid();
  v_lead uuid := gen_random_uuid();
  v_existing_lead uuid := gen_random_uuid();
  v_invalid_lead uuid := gen_random_uuid();
  v_key uuid := gen_random_uuid();
  v_convert_key uuid := gen_random_uuid();
  v_assign_key uuid := gen_random_uuid();
  v_existing_customer uuid := gen_random_uuid();
  v_customer uuid;
  v_source uuid;
  v_appointment_lead uuid := gen_random_uuid();
  v_appointment uuid := gen_random_uuid();
  v_sms uuid := gen_random_uuid();
  v_reply jsonb;
  v_initial jsonb;
  v_version integer;
BEGIN
  INSERT INTO public.tenants(id, name, slug) VALUES
    (v_tenant, 'Customer lead SQL smoke', 'lead-smoke-' || v_tenant),
    (v_other_tenant, 'Other SQL smoke tenant', 'lead-smoke-' || v_other_tenant);
  INSERT INTO public.employees(id, tenant_id, name, status) VALUES
    (v_actor, v_tenant, 'Actor', 'active'),
    (v_other_actor, v_other_tenant, 'Other actor', 'active');
  INSERT INTO public.douyin_third_party_components(component_appid)
    VALUES ('lead-smoke-' || v_tenant);
  INSERT INTO public.douyin_miniapp_installations(
    id, tenant_id, component_appid, authorizer_appid
  ) VALUES (v_installation, v_tenant, 'lead-smoke-' || v_tenant,
    'lead-smoke-' || v_tenant);
  INSERT INTO public.marketing_leads(
    id, tenant_id, douyin_miniapp_installation_id, source, name, phone, community
  ) VALUES
    (v_lead, v_tenant, v_installation, 'douyin_miniapp', '普通跟进', '13900000601', '测试小区'),
    (v_existing_lead, v_tenant, v_installation, 'douyin_miniapp', '已有客户', '13900000602', '测试小区'),
    (v_invalid_lead, v_tenant, v_installation, 'douyin_miniapp', '无效线索', '13900000603', '测试小区');

  v_reply := public.append_douyin_lead_follow_up(v_tenant, v_lead, NULL,
    v_actor, 'phone', '联系客户', '下周回访', NULL, NULL, NULL, 1, v_key);
  ASSERT v_reply #>> '{error,code}' = 'DOUYIN_LEAD_FOLLOW_UP_COMMAND_INVALID', 'Legacy appointment required';
  v_reply := public.append_customer_lead_follow_up(v_tenant, v_lead, NULL,
    v_actor, 'phone', '联系客户', '下周回访', NULL, 'canceled', NULL, 1, v_key);
  ASSERT v_reply #>> '{error,code}' = 'DOUYIN_LEAD_FOLLOW_UP_COMMAND_INVALID', 'Ordinary follow-up cannot change appointment';
  v_reply := public.append_customer_lead_follow_up(v_tenant, v_lead, NULL,
    v_actor, 'phone', '联系客户', '下周回访', NULL, NULL, NULL, 1, v_key);
  ASSERT v_reply->'error' IS NULL, v_reply::text;
  ASSERT v_reply #> '{data,appointment_id}' = 'null'::jsonb
    AND v_reply #> '{data,appointment_version}' = 'null'::jsonb
    AND v_reply #> '{data,appointment_status}' = 'null'::jsonb, 'Ordinary appointment result must be coherent null';
  ASSERT v_reply #>> '{data,lead_version}' = '2', 'Follow-up version increment';
  v_initial := v_reply;
  v_reply := public.append_customer_lead_follow_up(v_tenant, v_lead, NULL,
    v_actor, 'phone', '联系客户', '下周回访', NULL, NULL, NULL, 1, v_key);
  ASSERT v_reply->'data' = (v_initial->'data' || '{"idempotent":true}'::jsonb), 'Ordinary follow-up immutable replay';
  v_reply := public.append_customer_lead_follow_up(v_tenant, v_lead, NULL,
    v_actor, 'phone', '不同意图', '下周回访', NULL, NULL, NULL, 1, v_key);
  ASSERT v_reply #>> '{error,code}' = 'DOUYIN_LEAD_IDEMPOTENCY_CONFLICT', 'Changed follow-up intent must conflict';
  v_reply := public.append_customer_lead_follow_up(v_tenant, v_lead, NULL,
    v_actor, 'phone', '联系客户', '下周回访', NULL, NULL, NULL, 1, gen_random_uuid());
  ASSERT v_reply #>> '{error,code}' = 'DOUYIN_LEAD_VERSION_CONFLICT', 'Stale follow-up version';
  v_reply := public.assign_customer_lead(v_other_tenant, v_lead, v_other_actor,
    v_other_actor, 2, gen_random_uuid(), NULL);
  ASSERT v_reply #>> '{error,code}' = 'DOUYIN_LEAD_NOT_FOUND', 'Cross tenant lead must not be assigned';
  v_reply := public.assign_customer_lead(v_tenant, v_lead, v_actor,
    v_other_actor, 2, gen_random_uuid(), NULL);
  ASSERT v_reply #>> '{error,code}' = 'DOUYIN_LEAD_ASSIGNEE_NOT_FOUND', 'Cross tenant assignee must be rejected';
  v_reply := public.assign_douyin_lead(v_tenant, v_lead, v_actor,
    v_actor, 2, v_assign_key, NULL);
  ASSERT v_reply->'error' IS NULL, v_reply::text;
  v_reply := public.assign_customer_lead(v_tenant, v_lead, v_actor,
    v_actor, 2, v_assign_key, NULL);
  ASSERT v_reply #>> '{data,idempotent}' = 'true', 'Assign replay across old/new RPCs';

  v_reply := public.list_tenant_customer_leads(v_tenant, '{}', NULL, NULL,
    NULL, NULL, NULL);
  ASSERT v_reply #>> '{data,total}' = '0', 'Empty visibility scope must not become all';
  v_reply := public.list_tenant_customer_leads(v_tenant, NULL, NULL, NULL,
    NULL, NULL, NULL, 1, 20, 'douyin_miniapp', 'unassigned');
  ASSERT v_reply #>> '{data,total}' = '2'
    AND jsonb_array_length(v_reply #> '{data,list}') = 2, 'Unassigned list count and page predicate';
  v_reply := public.list_tenant_customer_leads(v_tenant, NULL, NULL, NULL,
    NULL, NULL, NULL, 1, 1, NULL, 'assigned');
  ASSERT v_reply #>> '{data,total}' = '1'
    AND jsonb_array_length(v_reply #> '{data,list}') = 1, 'Assigned paginated list';
  BEGIN
    PERFORM public.list_tenant_customer_leads(v_tenant, NULL, NULL, NULL,
      NULL, NULL, NULL, 1, 101);
    RAISE EXCEPTION 'Page size limit was ignored';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  BEGIN
    PERFORM public.list_tenant_customer_leads(v_tenant, NULL, NULL, NULL,
      NULL, NULL, NULL, 1, 20, 'h5');
    RAISE EXCEPTION 'Unsupported source was accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;

  v_reply := public.convert_douyin_lead_to_customer(v_tenant, v_lead,
    v_actor, 3, v_convert_key, NULL, true);
  ASSERT v_reply->'error' IS NULL, v_reply::text;
  ASSERT v_reply #>> '{data,created_customer}' = 'true', 'Ordinary lead customer creation';
  v_customer := (v_reply #>> '{data,customer_id}')::uuid;
  ASSERT (SELECT owner_id = v_actor FROM public.customers WHERE id = v_customer), 'Created customer owner';
  SELECT id INTO STRICT v_source FROM public.customer_sources
  WHERE customer_id = v_customer AND marketing_lead_id = v_lead
    AND douyin_measurement_appointment_id IS NULL;
  v_initial := v_reply;
  v_reply := public.convert_customer_lead_to_customer(v_tenant, v_lead,
    v_actor, 3, v_convert_key, v_customer, false);
  ASSERT v_reply->'data' = (v_initial->'data' || '{"idempotent":true}'::jsonb), 'Creation replay must survive changed HTTP preflight across RPCs';
  v_reply := public.convert_customer_lead_to_customer(v_tenant, v_lead,
    v_actor, 4, v_convert_key, v_customer, false);
  ASSERT v_reply #>> '{error,code}' = 'DOUYIN_LEAD_IDEMPOTENCY_CONFLICT', 'Changed replay version must conflict';
  v_reply := public.convert_customer_lead_to_customer(v_tenant, v_lead,
    v_actor, 3, gen_random_uuid(), NULL, true);
  ASSERT v_reply #>> '{error,code}' = 'DOUYIN_LEAD_CUSTOMER_PREFLIGHT_CONFLICT', 'Stale customer creation preflight';
  BEGIN
    UPDATE public.customer_sources SET metadata = '{}'::jsonb WHERE id = v_source;
    RAISE EXCEPTION 'Source snapshot update accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'CUSTOMER_LEAD_SOURCE_IMMUTABLE' THEN RAISE; END IF;
  END;
  BEGIN
    DELETE FROM public.customer_sources WHERE id = v_source;
    RAISE EXCEPTION 'Source snapshot deletion accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'CUSTOMER_LEAD_SOURCE_IMMUTABLE' THEN RAISE; END IF;
  END;
  v_reply := public.mark_customer_lead_invalid(v_tenant, v_lead, v_actor,
    '不再联系', 4, gen_random_uuid());
  ASSERT v_reply #>> '{error,code}' = 'DOUYIN_LEAD_CONVERTED_NOT_INVALIDATABLE', 'Converted lead invalidation denied';

  INSERT INTO public.customers(id, tenant_id, name, phone, owner_id)
    VALUES (v_existing_customer, v_tenant, 'Existing customer', '13900000602', NULL);
  v_reply := public.convert_customer_lead_to_customer(v_tenant, v_existing_lead,
    v_actor, 1, gen_random_uuid(), v_existing_customer, false);
  ASSERT v_reply->'error' IS NULL, v_reply::text;
  ASSERT v_reply #>> '{data,created_customer}' = 'false', 'Existing customer not recreated';
  ASSERT (SELECT owner_id IS NULL FROM public.customers WHERE id = v_existing_customer), 'Existing customer owner preserved';
  ASSERT (SELECT count(*) = 1 FROM public.customer_sources
    WHERE marketing_lead_id = v_existing_lead), 'Existing customer receives source fact';
  v_key := gen_random_uuid();
  v_reply := public.mark_customer_lead_invalid(v_tenant, v_invalid_lead,
    v_actor, '暂不装修', 1, v_key);
  ASSERT v_reply->'error' IS NULL, v_reply::text;
  v_reply := public.mark_douyin_lead_invalid(v_tenant, v_invalid_lead,
    v_actor, '暂不装修', 1, v_key);
  ASSERT v_reply #>> '{data,idempotent}' = 'true', 'Invalidation replay across RPCs';
  v_reply := public.assign_customer_lead(v_tenant, v_invalid_lead,
    v_actor, v_actor, 2, gen_random_uuid(), NULL);
  ASSERT v_reply #>> '{error,code}' = 'DOUYIN_LEAD_NOT_ASSIGNABLE', 'Invalid lead assignment denied';
  v_reply := public.convert_customer_lead_to_customer(v_tenant, v_invalid_lead,
    v_actor, 2, gen_random_uuid(), NULL, true);
  ASSERT v_reply #>> '{error,code}' = 'DOUYIN_LEAD_INVALID_NOT_CONVERTIBLE', 'Invalid lead conversion denied';

  -- Existing appointment operations share the same core and immutable replay.
  INSERT INTO public.marketing_leads(
    id, tenant_id, douyin_miniapp_installation_id, source, name, phone, community
  ) VALUES (v_appointment_lead, v_tenant, v_installation, 'douyin_miniapp',
    '预约跟进', '13900000604', '测试小区');
  INSERT INTO public.sms_verification_codes(id, phone, scene, code, expired_at)
    VALUES (v_sms, '13900000604', 'douyin_lead', '123456', now() + interval '5 minutes');
  INSERT INTO public.douyin_measurement_appointments(
    id, appointment_no, tenant_id, douyin_miniapp_installation_id,
    marketing_lead_id, sms_verification_code_id, preferred_visit_date,
    preferred_visit_period, community, create_idempotency_key, create_request_hash,
    source_snapshot, updated_existing, existing_customer_linked_at_submit,
    recent_pending_appointment_exists
  ) VALUES (v_appointment, 'DYLF-20990101-999999', v_tenant, v_installation,
    v_appointment_lead, v_sms, current_date + 1, 'morning', '测试小区',
    gen_random_uuid(), extensions.digest('customer-lead-smoke', 'sha256'),
    jsonb_build_object('privacy_policy_version', '2026-09-06', 'consented_at', now(),
      'attribution', '{"source_type":"direct","entry_path":"pages/lead/index","scene":"1001"}'::jsonb,
      'demand', NULL, 'budget_estimate', NULL),
    false, false, false);
  v_reply := public.append_customer_lead_follow_up(v_tenant, v_appointment_lead,
    v_appointment, v_actor, 'phone', '联系预约', '错误状态', NULL, 'completed', NULL,
    1, gen_random_uuid());
  ASSERT v_reply #>> '{error,code}' = 'DOUYIN_MEASUREMENT_APPOINTMENT_TRANSITION_INVALID', 'Pending appointment cannot complete';
  v_key := gen_random_uuid();
  v_reply := public.append_douyin_lead_follow_up(v_tenant, v_appointment_lead,
    v_appointment, v_actor, 'phone', '联系预约', '确认时间', NULL, 'confirmed',
    '2099-01-01T10:00:00+08:00', 1, v_key);
  ASSERT v_reply->'error' IS NULL, v_reply::text;
  ASSERT v_reply #>> '{data,appointment_status}' = 'confirmed'
    AND v_reply #>> '{data,appointment_version}' = '2', 'Appointment state/version transition';
  v_initial := v_reply;
  v_reply := public.append_customer_lead_follow_up(v_tenant, v_appointment_lead,
    v_appointment, v_actor, 'phone', '联系预约', '确认时间', NULL, 'confirmed',
    '2099-01-01T10:00:00+08:00', 1, v_key);
  ASSERT v_reply->'data' = (v_initial->'data' || '{"idempotent":true}'::jsonb), 'Appointment follow-up replay across RPCs';
  v_reply := public.convert_customer_lead_to_customer(v_tenant, v_appointment_lead,
    v_actor, 2, gen_random_uuid(), NULL, true);
  ASSERT v_reply->'error' IS NULL, v_reply::text;
  ASSERT (SELECT count(*) = 1 FROM public.customer_sources
    WHERE marketing_lead_id = v_appointment_lead
      AND douyin_measurement_appointment_id = v_appointment), 'Appointment source fact preserved';
  ASSERT NOT EXISTS (SELECT 1 FROM public.customer_sources
    WHERE marketing_lead_id = v_appointment_lead
      AND douyin_measurement_appointment_id IS NULL), 'Do not duplicate ordinary source fact for appointment lead';
  BEGIN
    UPDATE public.customer_sources SET metadata = '{}'::jsonb
      WHERE douyin_measurement_appointment_id = v_appointment;
    RAISE EXCEPTION 'Appointment source snapshot update accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'DOUYIN_MEASUREMENT_CUSTOMER_SOURCE_IMMUTABLE' THEN RAISE; END IF;
  END;
  BEGIN
    SET LOCAL ROLE service_role;
    UPDATE public.marketing_leads SET name = 'Direct mutation' WHERE id = v_lead;
    RAISE EXCEPTION 'Direct service-role lead mutation accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'DOUYIN_MEASUREMENT_MARKETING_LEAD_DIRECT_WRITE_FORBIDDEN' THEN RAISE; END IF;
  END;
  BEGIN
    SET LOCAL ROLE service_role;
    INSERT INTO public.customer_sources(tenant_id, customer_id, source,
      source_label, marketing_lead_id, metadata)
    VALUES (v_tenant, v_customer, 'douyin_miniapp', '抖音小程序', v_lead, '{}'::jsonb);
    RAISE EXCEPTION 'Direct service-role source mutation accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'CUSTOMER_LEAD_SOURCE_DIRECT_WRITE_FORBIDDEN' THEN RAISE; END IF;
  END;
END;
$commands$;

-- Representative synthetic cardinality, using the ordinary fixture write path.
-- Plans are evidence for this local dataset, not production latency guarantees.
DO $performance$
DECLARE
  v_tenant uuid;
  v_actor uuid;
  v_installation uuid;
  v_plan record;
  v_query text;
BEGIN
  SELECT id INTO STRICT v_tenant FROM public.tenants
    WHERE name = 'Customer lead SQL smoke';
  SELECT id INTO STRICT v_actor FROM public.employees WHERE tenant_id = v_tenant;
  SELECT id INTO STRICT v_installation FROM public.douyin_miniapp_installations
    WHERE tenant_id = v_tenant;
  INSERT INTO public.marketing_leads(
    tenant_id, douyin_miniapp_installation_id, source, name, phone,
    community, assigned_employee_id, assigned_at, created_at
  )
  SELECT v_tenant, v_installation, 'douyin_miniapp',
    CASE WHEN n = 2500 THEN 'PerfTarget' ELSE '性能线索' || n END,
    '1390001' || lpad(n::text, 4, '0'), '性能小区',
    CASE WHEN n % 2 = 0 THEN v_actor END,
    CASE WHEN n % 2 = 0 THEN now() END,
    now() - make_interval(secs => n)
  FROM generate_series(1, 5000) AS fixture(n);
  ANALYZE public.marketing_leads;

  FOREACH v_query IN ARRAY ARRAY[
    format('SELECT id, created_at FROM public.marketing_leads WHERE tenant_id = %L::uuid AND source = ''douyin_miniapp'' ORDER BY created_at DESC, id DESC LIMIT 20', v_tenant),
    format('SELECT id, created_at FROM public.marketing_leads WHERE tenant_id = %L::uuid AND source = ''douyin_miniapp'' AND assigned_employee_id = %L::uuid ORDER BY created_at DESC, id DESC LIMIT 20', v_tenant, v_actor),
    format('SELECT id, created_at FROM public.marketing_leads WHERE tenant_id = %L::uuid AND source = ''douyin_miniapp'' AND (name ILIKE ''%%PerfTarget%%'' OR phone ILIKE ''%%PerfTarget%%'' OR community ILIKE ''%%PerfTarget%%'') ORDER BY created_at DESC, id DESC LIMIT 20', v_tenant),
    format('SELECT count(*) FROM public.marketing_leads WHERE tenant_id = %L::uuid AND source = ''douyin_miniapp''', v_tenant)
  ] LOOP
    RAISE NOTICE 'PERFORMANCE SQL: %', v_query;
    FOR v_plan IN EXECUTE 'EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) ' || v_query LOOP
      RAISE NOTICE '%', v_plan."QUERY PLAN";
    END LOOP;
  END LOOP;
END;
$performance$;

ROLLBACK;
