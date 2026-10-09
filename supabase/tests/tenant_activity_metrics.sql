\set ON_ERROR_STOP on
-- Owned disposable PostgreSQL only. All fixtures and mutations roll back.
BEGIN;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';
CREATE FUNCTION pg_temp.check_true(ok boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'activity assertion: %', label; END IF;
END $$;
CREATE TEMP TABLE activity_fixture AS SELECT gen_random_uuid() AS tenant, gen_random_uuid() AS other_tenant,
  gen_random_uuid() AS employee, gen_random_uuid() AS other_employee, gen_random_uuid() AS platform_employee;
INSERT INTO public.tenants(id,name,slug,created_at)
SELECT tenant,'Activity test','activity-'||tenant,now()-interval '30 days' FROM activity_fixture
UNION ALL SELECT other_tenant,'Other activity test','activity-'||other_tenant,now()-interval '30 days' FROM activity_fixture;
INSERT INTO public.employees(id,tenant_id,name,status)
SELECT employee,tenant,'Activity employee','active' FROM activity_fixture
UNION ALL SELECT other_employee,other_tenant,'Other employee','active' FROM activity_fixture
UNION ALL SELECT platform_employee,NULL,'Platform employee','active' FROM activity_fixture;
-- Do not inherit collection history from other tests, even in an owned test DB.
UPDATE public.tenant_activity_collection_config SET collection_started_at=NULL;
CREATE FUNCTION pg_temp.summary(other boolean DEFAULT false) RETURNS jsonb LANGUAGE sql AS $$
  SELECT public.get_tenant_activity_summaries(ARRAY[CASE WHEN other THEN other_tenant ELSE tenant END])->0
  FROM activity_fixture
$$;
CREATE FUNCTION pg_temp.record(kind text, event_key text, channel text DEFAULT 'admin_web')
RETURNS boolean LANGUAGE sql AS $$
  SELECT public.record_tenant_activity(tenant,employee,channel,kind,event_key) FROM activity_fixture
$$;

SELECT pg_temp.check_true(pg_temp.summary()->>'status'='collecting'
  AND pg_temp.summary()->'collection_started_at'='null'::jsonb
  AND pg_temp.summary()->'active_employee_count'='null'::jsonb
  AND (pg_temp.summary()->>'observed_days')::int=0,'not collected is unknown, never zero');
SELECT pg_temp.check_true(NOT public.record_tenant_activity(tenant,other_employee,'admin_web','view','wrong-tenant'),
  'cross-tenant employee rejected') FROM activity_fixture;
SELECT pg_temp.check_true(NOT public.record_tenant_activity(tenant,platform_employee,'admin_web','view','platform'),
  'platform employee rejected by actual nullable tenant identity') FROM activity_fixture;
SELECT pg_temp.check_true(NOT public.record_tenant_activity(NULL,employee,'admin_web','view','null-tenant'),
  'null tenant rejected') FROM activity_fixture;
SELECT pg_temp.check_true(NOT pg_temp.record('unknown','invalid') AND NOT pg_temp.record('view','', 'admin_web')
  AND NOT pg_temp.record('view','invalid-channel','customer'), 'invalid input rejected');
UPDATE public.employees SET status='suspended' WHERE id=(SELECT employee FROM activity_fixture);
SELECT pg_temp.check_true(NOT pg_temp.record('view','inactive'), 'inactive employee rejected');
UPDATE public.employees SET status='active' WHERE id=(SELECT employee FROM activity_fixture);
SELECT pg_temp.check_true((SELECT collection_started_at IS NULL FROM public.tenant_activity_collection_config),
  'invalid records cannot activate collection');

-- A downstream write error must roll back ledger and first activation together.
CREATE FUNCTION pg_temp.fail_daily() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'fixture daily failure'; END $$;
CREATE TRIGGER activity_test_failure BEFORE INSERT ON public.tenant_activity_daily
FOR EACH ROW EXECUTE FUNCTION pg_temp.fail_daily();
DO $$ BEGIN
  BEGIN
    PERFORM pg_temp.record('view','failed-first-record');
    RAISE EXCEPTION 'expected write failure';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'fixture daily failure' THEN RAISE; END IF;
  END;
END $$;
DROP TRIGGER activity_test_failure ON public.tenant_activity_daily;
SELECT pg_temp.check_true((SELECT collection_started_at IS NULL FROM public.tenant_activity_collection_config)
  AND NOT EXISTS (SELECT 1 FROM public.tenant_activity_events WHERE tenant_id=(SELECT tenant FROM activity_fixture)),
  'failed collection is atomic');

SELECT pg_temp.check_true(pg_temp.record('login','same-event'), 'first login accepted');
SELECT pg_temp.check_true(NOT pg_temp.record('login','same-event'), 'retry rejected');
SELECT pg_temp.check_true((SELECT collection_started_at=now() FROM public.tenant_activity_collection_config),
  'first valid event starts at database now');
SELECT pg_temp.check_true((pg_temp.summary()->>'admin_login_count')::int=1
  AND (pg_temp.summary()->>'active_employee_count')::int=0
  AND (pg_temp.summary()->>'active_days')::int=0 AND pg_temp.summary()->'last_active_at'='null'::jsonb,
  'login does not mean activity');
SELECT pg_temp.check_true((pg_temp.summary(true)->>'active_employee_count')::int=0
  AND (pg_temp.summary(true)->>'observed_days')::int=1,
  'tenant without events has observed zero after global activation');
SELECT pg_temp.check_true(pg_temp.record('view','same-event') AND pg_temp.record('view','same-event','wechat_mini'),
  'kind and channel are independent idempotency scopes');
SELECT pg_temp.check_true((pg_temp.summary()->>'active_employee_count')::int=1
  AND (pg_temp.summary()->>'admin_active_employee_count')::int=1
  AND (pg_temp.summary()->>'mini_active_employee_count')::int=1
  AND (pg_temp.summary()->>'active_days')::int=1,
  'cross-channel employee and same-day activity deduplicated');
SELECT pg_temp.check_true(pg_temp.record(kind,'business:'||kind),kind||' accepted')
FROM unnest(ARRAY['customer_created','follow_up_created','project_created','construction_log_created','acceptance_handled']) kind;
SELECT pg_temp.check_true(value='1'::jsonb,'all five business counters increment')
FROM jsonb_each(pg_temp.summary()->'business_actions');
SELECT pg_temp.check_true((SELECT bool_and(event_key_hash ~ '^[a-f0-9]{64}$') FROM public.tenant_activity_events
  WHERE tenant_id=(SELECT tenant FROM activity_fixture)), 'ledger stores only SHA256 identifiers');
SELECT pg_temp.check_true((SELECT bool_and(activity_date=(now() AT TIME ZONE 'Asia/Shanghai')::date)
  FROM public.tenant_activity_daily WHERE tenant_id=(SELECT tenant FROM activity_fixture)), 'Beijing date independent of session timezone');
SET LOCAL TIME ZONE 'America/Los_Angeles';
SELECT pg_temp.check_true((pg_temp.summary()->>'window_start')::timestamptz=
  (((now() AT TIME ZONE 'Asia/Shanghai')::date-6)::timestamp AT TIME ZONE 'Asia/Shanghai'), 'window uses Beijing midnight');
SELECT pg_temp.check_true(('2026-10-09 15:59:59+00'::timestamptz AT TIME ZONE 'Asia/Shanghai')::date='2026-10-09'
  AND ('2026-10-09 16:00:00+00'::timestamptz AT TIME ZONE 'Asia/Shanghai')::date='2026-10-10', 'Beijing rollover boundary');

-- Identical keys remain independent for other employees and tenants.
DO $$ DECLARE f record; second_employee uuid:=gen_random_uuid(); BEGIN
  SELECT * INTO f FROM activity_fixture;
  INSERT INTO public.employees(id,tenant_id,status) VALUES(second_employee,f.tenant,'active');
  PERFORM pg_temp.check_true(public.record_tenant_activity(f.tenant,second_employee,'admin_web','view','same-event'),
    'employee is part of idempotency scope');
  PERFORM pg_temp.check_true(public.record_tenant_activity(f.other_tenant,f.other_employee,'admin_web','view','same-event'),
    'tenant is part of idempotency scope');
  PERFORM pg_temp.check_true((pg_temp.summary()->>'active_employee_count')::int=2,'two employee identities counted');
END $$;

-- Mature coverage is independent of event presence and bounded by tenant creation.
UPDATE public.tenant_activity_collection_config SET collection_started_at=now()-interval '30 days';
SELECT pg_temp.check_true(pg_temp.summary()->>'status'='ready'
  AND (pg_temp.summary()->>'observed_days')::int=7, 'full window is ready');
UPDATE public.tenants SET created_at=now() WHERE id=(SELECT other_tenant FROM activity_fixture);
SELECT pg_temp.check_true((pg_temp.summary(true)->>'collection_started_at')::timestamptz=now()
  AND pg_temp.summary(true)->>'status'='collecting'
  AND (pg_temp.summary(true)->>'observed_days')::int=1, 'new tenant coverage begins at creation');

-- Preserve all-time last activity while excluding old buckets from window totals.
UPDATE public.tenant_activity_daily SET activity_date=activity_date-8 WHERE tenant_id=(SELECT tenant FROM activity_fixture);
UPDATE public.tenant_activity_last_active SET last_active_at=now()-interval '8 days' WHERE tenant_id=(SELECT tenant FROM activity_fixture);
SELECT pg_temp.check_true((pg_temp.summary()->>'active_days')::int=0
  AND (pg_temp.summary()->>'admin_login_count')::int=0
  AND (pg_temp.summary()->>'last_active_at')::timestamptz=now()-interval '8 days', 'last active survives outside 7 days');
SELECT pg_temp.check_true(NOT pg_temp.record('view','same-event'), 'cross-day retry does not increment or refresh last active');
SELECT pg_temp.check_true(pg_temp.record('login','new-login')
  AND (pg_temp.summary()->>'last_active_at')::timestamptz=now()-interval '8 days', 'login preserves old last active');

-- The oldest included day is today-6; today-7 is excluded.
INSERT INTO public.tenant_activity_daily(tenant_id,employee_id,channel,activity_date,active,login_count)
SELECT tenant,employee,'admin_web',(now() AT TIME ZONE 'Asia/Shanghai')::date-6,true,3 FROM activity_fixture
UNION ALL SELECT tenant,employee,'admin_web',(now() AT TIME ZONE 'Asia/Shanghai')::date-7,true,100 FROM activity_fixture;
SELECT pg_temp.check_true((pg_temp.summary()->>'active_days')::int=1
  AND (pg_temp.summary()->>'admin_login_count')::int=4,'7-day bounds include day-6 only');

-- Max 100 is enforced before scans, empty lists stay empty.
SELECT pg_temp.check_true(public.get_tenant_activity_summaries('{}'::uuid[])='[]'::jsonb,'empty batch');
DO $$ BEGIN
  BEGIN
    PERFORM public.get_tenant_activity_summaries(ARRAY(SELECT gen_random_uuid() FROM generate_series(1,101)));
    RAISE EXCEPTION 'oversized list accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
END $$;

DO $$ DECLARE ids uuid[]; BEGIN
  WITH inserted AS (
    INSERT INTO public.tenants(name,slug) SELECT 'Batch fixture','activity-batch-'||gen_random_uuid()
    FROM generate_series(1,100) RETURNING id
  ) SELECT array_agg(id) INTO ids FROM inserted;
  PERFORM pg_temp.check_true(jsonb_array_length(public.get_tenant_activity_summaries(ids))=100,
    '100 tenants returned in a single RPC');
END $$;

-- RLS plus revoked grants, including PUBLIC function defaults.
SELECT pg_temp.check_true(c.relrowsecurity, c.relname||' RLS enabled')
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname IN ('tenant_activity_collection_config','tenant_activity_events','tenant_activity_daily','tenant_activity_last_active');
SELECT pg_temp.check_true(NOT has_table_privilege(role_name,'public.'||table_name,'SELECT,INSERT,UPDATE,DELETE'),
  role_name||' cannot access '||table_name)
FROM unnest(ARRAY['anon','authenticated']) role_name CROSS JOIN unnest(ARRAY[
  'tenant_activity_collection_config','tenant_activity_events','tenant_activity_daily','tenant_activity_last_active']) table_name;
SELECT pg_temp.check_true(NOT has_function_privilege(role_name,signature,'EXECUTE'),role_name||' cannot execute RPC')
FROM unnest(ARRAY['anon','authenticated']) role_name CROSS JOIN unnest(ARRAY[
  'public.record_tenant_activity(uuid,uuid,text,text,text)','public.get_tenant_activity_summaries(uuid[])']) signature;
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  BEGIN PERFORM public.get_tenant_activity_summaries('{}'::uuid[]); RAISE EXCEPTION 'authenticated RPC allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN INSERT INTO public.tenant_activity_collection_config(singleton) VALUES (true); RAISE EXCEPTION 'authenticated write allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
GRANT SELECT ON activity_fixture TO service_role;
SET LOCAL ROLE service_role;
SELECT pg_temp.check_true(jsonb_array_length(public.get_tenant_activity_summaries(ARRAY[tenant,other_tenant]))=2,
  'service role can read') FROM activity_fixture;
SELECT pg_temp.check_true(public.record_tenant_activity(tenant,employee,'admin_web','view','service-role'),
  'service role can record') FROM activity_fixture;
RESET ROLE;

-- Representative historical cardinality; EXPLAIN must bound by tenant/date index.
INSERT INTO public.tenant_activity_daily(tenant_id,employee_id,channel,activity_date,active)
SELECT f.tenant,gen_random_uuid(),'admin_web',(now() AT TIME ZONE 'Asia/Shanghai')::date-days,true
FROM activity_fixture f CROSS JOIN generate_series(10,109) days CROSS JOIN generate_series(1,100) employees;
ANALYZE public.tenant_activity_daily;
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF)
SELECT employee_id,channel,activity_date,active,login_count,customer_created,follow_up_created,
  project_created,construction_log_created,acceptance_handled
FROM public.tenant_activity_daily
WHERE tenant_id=(SELECT tenant FROM activity_fixture)
  AND activity_date BETWEEN (now() AT TIME ZONE 'Asia/Shanghai')::date-6 AND (now() AT TIME ZONE 'Asia/Shanghai')::date;
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF)
SELECT public.get_tenant_activity_summaries(ARRAY[tenant,other_tenant]) FROM activity_fixture;
ROLLBACK;
