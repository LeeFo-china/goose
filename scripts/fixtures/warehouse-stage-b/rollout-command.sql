-- Only the network-none disposable database runner may execute this fixture.
DO $$ BEGIN
  IF to_regclass('public.stage_b_rollout_migration_rollback_evidence') IS NULL THEN
    RAISE EXCEPTION 'migration failure rollback was not verified before normal application';
  END IF;
  IF to_regprocedure('public.set_tenant_supplier_rollout_settings(uuid,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,integer,uuid,uuid,text,text)') IS NULL THEN
    RAISE EXCEPTION 'warehouse rollout overload missing';
  END IF;
END $$;

DO $acl$
DECLARE f record; role_name text; count_wrappers integer := 0;
BEGIN
  FOR f IN SELECT p.oid, p.proowner, p.proacl, p.proconfig, p.proname, p.prosecdef
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname IN
      ('set_tenant_supplier_rollout_settings','__gooes_set_supplier_rollout_settings_v2') LOOP
    IF NOT f.prosecdef OR NOT ('search_path=pg_catalog, public'=ANY(f.proconfig)) THEN
      RAISE EXCEPTION 'unsafe function configuration: %',f.proname;
    END IF;
    IF f.proname='set_tenant_supplier_rollout_settings' THEN
      count_wrappers := count_wrappers+1;
      IF NOT has_function_privilege('service_role',f.oid,'EXECUTE') THEN RAISE EXCEPTION 'missing service ACL'; END IF;
    ELSIF has_function_privilege('service_role',f.oid,'EXECUTE') THEN
      RAISE EXCEPTION 'private core exposed';
    END IF;
    IF EXISTS (SELECT 1 FROM aclexplode(COALESCE(f.proacl,acldefault('f',f.proowner))) acl
      WHERE acl.grantee<>f.proowner AND (acl.is_grantable OR
        acl.grantee<>('service_role'::regrole)::oid)) THEN RAISE EXCEPTION 'unexpected ACL'; END IF;
    FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
      IF has_function_privilege(role_name,f.oid,'EXECUTE') THEN RAISE EXCEPTION 'public command exposed'; END IF;
    END LOOP;
  END LOOP;
  IF count_wrappers<>3 THEN RAISE EXCEPTION 'expected exactly three unambiguous overloads'; END IF;
  IF EXISTS (SELECT 1 FROM public.stage_b_rollout_settings_before before_row
    FULL JOIN public.tenant_supplier_settings current_row ON
      before_row.setting->>'tenant_id'=current_row.tenant_id::text
    WHERE before_row.setting IS DISTINCT FROM to_jsonb(current_row)) THEN
    RAISE EXCEPTION 'migration changed existing settings';
  END IF;
END $acl$;

-- Fixture convenience calls the three real typed public signatures.
CREATE FUNCTION public.stage_b_rollout_call(level integer, version integer, key text,
  signature integer DEFAULT 7, contract boolean DEFAULT false) RETURNS jsonb
LANGUAGE sql AS $$
SELECT CASE signature
WHEN 5 THEN public.set_tenant_supplier_rollout_settings(
  '92000000-0000-4000-8000-000000000001',level>=1,contract,level>=2,level>=3,level>=4,level>=5,
  version,'92000000-0000-4000-8000-000000000003','92000000-0000-4000-8000-000000000002',key,
  CASE WHEN level=0 THEN 'fixture disable' ELSE NULL END)
WHEN 6 THEN public.set_tenant_supplier_rollout_settings(
  '92000000-0000-4000-8000-000000000001',level>=1,contract,level>=2,level>=3,level>=4,level>=5,level>=6,
  version,'92000000-0000-4000-8000-000000000003','92000000-0000-4000-8000-000000000002',key,
  CASE WHEN level=0 THEN 'fixture disable' ELSE NULL END)
ELSE public.set_tenant_supplier_rollout_settings(
  '92000000-0000-4000-8000-000000000001',level>=1,contract,level>=2,level>=3,level>=4,level>=5,level>=6,level>=7,
  version,'92000000-0000-4000-8000-000000000003','92000000-0000-4000-8000-000000000002',key,
  CASE WHEN level=0 THEN 'fixture disable' ELSE NULL END) END;
$$;

SET ROLE service_role;
SELECT public.stage_b_rollout_call(3,2,'forward-3');
RESET ROLE;
DO $behavior$
DECLARE result jsonb; old_result jsonb; before_row jsonb; l integer; version integer := 3; signature integer;
BEGIN
  FOR l IN 4..7 LOOP
    SELECT to_jsonb(s) INTO before_row FROM public.tenant_supplier_settings s
      WHERE tenant_id='92000000-0000-4000-8000-000000000001';
    result := public.stage_b_rollout_call(l,version,'forward-'||l);
    version := version+1;
    IF result->>'status'<>'updated' OR (result->>'version')::integer<>version
      OR result->'previous_setting' IS DISTINCT FROM before_row
      OR (result->'setting'->>'warehouse_procurement_enabled')::boolean IS DISTINCT FROM (l=7)
    THEN RAISE EXCEPTION 'invalid forward response %',result; END IF;
  END LOOP;

  -- Both omitted signatures must preserve active warehouse AND workflow.
  FOR signature IN 5..6 LOOP
    result := public.stage_b_rollout_call(6,version,'legacy-preserve-'||signature,signature,signature=6);
    version := version+1;
    IF result->>'status'<>'updated' OR (result->>'version')::integer<>version
      OR NOT (result->'setting'->>'warehouse_procurement_enabled')::boolean
      OR NOT (result->'setting'->>'purchase_batch_workflow_enabled')::boolean THEN
      RAISE EXCEPTION 'omitted fields not preserved %',result;
    END IF;
    BEGIN
      PERFORM public.stage_b_rollout_call(signature-1,version,'legacy-parent-off-'||signature,signature);
      RAISE EXCEPTION 'legacy client disabled active warehouse parent';
    EXCEPTION WHEN SQLSTATE 'P0001' THEN
      IF SQLERRM<>'SUPPLIER_ROLLOUT_ORDER_INVALID' THEN RAISE; END IF;
    END;
  END LOOP;

  -- Original historical payloads replay their historical states after later changes.
  FOR signature IN 5..6 LOOP
    result := public.stage_b_rollout_call(signature-4,signature-5,
      CASE WHEN signature=5 THEN 'historical-five' ELSE 'historical-six' END,signature);
    IF NOT (result->>'idempotent')::boolean OR (result->>'version')::integer<>signature-4 THEN
      RAISE EXCEPTION 'historical replay changed %',result;
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM public.stage_b_rollout_history h JOIN public.supplier_command_events e
    ON e.id::text=h.event->>'id' WHERE h.event IS DISTINCT FROM to_jsonb(e)) THEN
    RAISE EXCEPTION 'historical events mutated';
  END IF;
  -- Field presence is part of the fingerprint, including explicit false.
  FOR signature IN 6..7 LOOP
    BEGIN
      PERFORM public.stage_b_rollout_call(1,0,'historical-five',signature);
      RAISE EXCEPTION 'different signature reused historical key';
    EXCEPTION WHEN SQLSTATE 'P0001' THEN
      IF SQLERRM<>'SUPPLIER_IDEMPOTENCY_CONFLICT' THEN RAISE; END IF;
    END;
  END LOOP;
  result := public.stage_b_rollout_call(6,version-1,'stale-version');
  IF result->>'error_code'<>'SUPPLIER_VERSION_CONFLICT' THEN RAISE EXCEPTION 'version conflict absent'; END IF;
  BEGIN
    PERFORM public.stage_b_rollout_call(5,version,'skipped-reverse');
    RAISE EXCEPTION 'skipped transition accepted';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM<>'SUPPLIER_ROLLOUT_ORDER_INVALID' THEN RAISE; END IF;
  END;
  old_result := public.stage_b_rollout_call(7,version,'same-state');
  version := version+1;
  IF (old_result->>'version')::integer<>version THEN RAISE EXCEPTION 'fresh accepted command must increment once'; END IF;
  result := public.stage_b_rollout_call(7,version-1,'same-state');
  IF result IS DISTINCT FROM old_result || '{"idempotent":true}'::jsonb THEN
    RAISE EXCEPTION 'replay changed result';
  END IF;
  BEGIN
    PERFORM public.stage_b_rollout_call(7,version-1,'same-state',6);
    RAISE EXCEPTION 'legacy signature reused new key';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM<>'SUPPLIER_IDEMPOTENCY_CONFLICT' THEN RAISE; END IF;
  END;
  FOR l IN REVERSE 6..0 LOOP
    result := public.stage_b_rollout_call(l,version,'reverse-'||l);
    version := version+1;
    IF result->>'status'<>'updated' OR (result->>'version')::integer<>version THEN
      RAISE EXCEPTION 'invalid reverse response %',result;
    END IF;
  END LOOP;
  -- Old command created after this migration also replays after a state change.
  result := public.stage_b_rollout_call(6,7,'legacy-preserve-5',5,false);
  IF NOT (result->>'idempotent')::boolean OR (result->>'version')::integer<>8 THEN
    RAISE EXCEPTION 'new legacy historical replay changed %',result;
  END IF;
  -- Audit states are the exact atomic rows returned by the command.
  IF EXISTS (SELECT 1 FROM public.supplier_command_events e
    WHERE e.tenant_id='92000000-0000-4000-8000-000000000001'
      AND ((e.to_state->>'version')::integer<>e.result_version
        OR (e.from_state->>'version')::integer<>e.result_version-1)) THEN
    RAISE EXCEPTION 'audit version mismatch';
  END IF;
END $behavior$;

-- Explicit null cannot masquerade as an omitted warehouse parameter.
DO $$ BEGIN
  BEGIN
    PERFORM public.set_tenant_supplier_rollout_settings(
      '92000000-0000-4000-8000-000000000001',true,false,false,false,false,false,false,NULL,
      17,'92000000-0000-4000-8000-000000000003','92000000-0000-4000-8000-000000000002','null-warehouse',NULL);
    RAISE EXCEPTION 'explicit null accepted';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    IF SQLERRM<>'SUPPLIER_IDEMPOTENCY_CONFLICT' THEN RAISE; END IF;
  END;
END $$;

-- Event insertion failure must roll back the settings change too.
CREATE FUNCTION public.stage_b_rollout_reject_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'fixture event failure'; END $$;
CREATE TRIGGER stage_b_rollout_reject BEFORE INSERT ON public.supplier_command_events
FOR EACH ROW WHEN (NEW.idempotency_key='atomic-rollback') EXECUTE FUNCTION public.stage_b_rollout_reject_event();
DO $$
DECLARE before_row jsonb;
BEGIN
  SELECT to_jsonb(s) INTO before_row FROM public.tenant_supplier_settings s WHERE tenant_id='92000000-0000-4000-8000-000000000001';
  BEGIN
    PERFORM public.stage_b_rollout_call(1,(before_row->>'version')::integer,'atomic-rollback');
    RAISE EXCEPTION 'event failure did not roll back';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN IF SQLERRM<>'fixture event failure' THEN RAISE; END IF; END;
  IF before_row IS DISTINCT FROM (SELECT to_jsonb(s) FROM public.tenant_supplier_settings s WHERE tenant_id='92000000-0000-4000-8000-000000000001')
    OR EXISTS (SELECT 1 FROM public.supplier_command_events WHERE idempotency_key='atomic-rollback') THEN
    RAISE EXCEPTION 'partial mutation escaped rollback';
  END IF;
END $$;
DROP TRIGGER stage_b_rollout_reject ON public.supplier_command_events;

-- Default remains false for newly initialized tenant settings through the legacy API.
INSERT INTO public.tenants(id,name,slug) VALUES ('92000000-0000-4000-8000-000000000004','Default fixture','stage-b-rollout-default');
DO $$ DECLARE r jsonb; BEGIN
  r:= public.set_tenant_supplier_rollout_settings('92000000-0000-4000-8000-000000000004',true,false,false,false,false,false,
    0,'92000000-0000-4000-8000-000000000003','92000000-0000-4000-8000-000000000002','default-false');
  IF (r->'setting'->>'warehouse_procurement_enabled')::boolean IS DISTINCT FROM false THEN RAISE EXCEPTION 'default not false'; END IF;
END $$;
SELECT 'RPC_META ' || jsonb_build_object('name',p.proname,'args',pg_get_function_arguments(p.oid),
  'returns',pg_get_function_result(p.oid))::text FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname IN ('set_tenant_supplier_rollout_settings','__gooes_set_supplier_rollout_settings_v2');
SELECT 'EVIDENCE warehouse rollout: legacy/new signatures, historical immutable replay, dependency/version guards, ACL, defaultfalse, migration row preservation, atomic rollback passed';

CREATE EXTENSION IF NOT EXISTS dblink WITH SCHEMA extensions;
CREATE FUNCTION public.stage_b_wait_rollout_lock(connection_name text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE deadline timestamptz := clock_timestamp()+interval '5 seconds';
BEGIN
  LOOP
    EXIT WHEN EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name=connection_name AND wait_event_type='Lock');
    IF extensions.dblink_is_busy(connection_name)=0 OR clock_timestamp()>deadline THEN
      RAISE EXCEPTION 'Expected live rollout lock wait: %',connection_name;
    END IF;
    PERFORM pg_sleep(0.01);
  END LOOP;
END $$;
DO $race$
DECLARE connection_name text; first_result jsonb; result jsonb; command_sql text; current_version integer;
BEGIN
  FOREACH connection_name IN ARRAY ARRAY['stage-b-rollout-a','stage-b-rollout-b','stage-b-rollout-c'] LOOP
    PERFORM extensions.dblink_connect(connection_name,'host=/tmp dbname=postgres user=postgres application_name='||connection_name);
    PERFORM extensions.dblink_exec(connection_name,'SET statement_timeout=''8s''');
  END LOOP;
  SELECT version INTO current_version FROM public.tenant_supplier_settings WHERE tenant_id='92000000-0000-4000-8000-000000000001';
  command_sql:=format('SELECT public.stage_b_rollout_call(1,%s,''concurrent-original'')',current_version);
  PERFORM extensions.dblink_exec('stage-b-rollout-a','BEGIN');
  SELECT response INTO first_result FROM extensions.dblink('stage-b-rollout-a',command_sql) AS r(response jsonb);
  IF first_result->>'status'<>'updated' THEN RAISE EXCEPTION 'first concurrent mutation failed'; END IF;
  PERFORM extensions.dblink_send_query('stage-b-rollout-b',command_sql);
  PERFORM extensions.dblink_send_query('stage-b-rollout-c',format(
    'SELECT public.stage_b_rollout_call(1,%s,''concurrent-competing'',6)',current_version));
  PERFORM public.stage_b_wait_rollout_lock('stage-b-rollout-b');
  PERFORM public.stage_b_wait_rollout_lock('stage-b-rollout-c');
  PERFORM extensions.dblink_exec('stage-b-rollout-a','COMMIT');
  SELECT response INTO result FROM extensions.dblink_get_result('stage-b-rollout-b') AS r(response jsonb);
  PERFORM * FROM extensions.dblink_get_result('stage-b-rollout-b') AS r(response jsonb);
  IF result IS DISTINCT FROM first_result || '{"idempotent":true}'::jsonb THEN
    RAISE EXCEPTION 'concurrent exact replay failed %',result;
  END IF;
  SELECT response INTO result FROM extensions.dblink_get_result('stage-b-rollout-c') AS r(response jsonb);
  PERFORM * FROM extensions.dblink_get_result('stage-b-rollout-c') AS r(response jsonb);
  IF result->>'error_code'<>'SUPPLIER_VERSION_CONFLICT' OR
    (SELECT version FROM public.tenant_supplier_settings WHERE tenant_id='92000000-0000-4000-8000-000000000001')<>current_version+1
    OR (SELECT count(*) FROM public.supplier_command_events WHERE idempotency_key IN ('concurrent-original','concurrent-competing'))<>1 THEN
    RAISE EXCEPTION 'concurrent version/event guard failed %',result;
  END IF;

  -- The same actor/key with a different signature waits and then conflicts.
  current_version := current_version+1;
  PERFORM extensions.dblink_exec('stage-b-rollout-a','BEGIN');
  SELECT response INTO first_result FROM extensions.dblink('stage-b-rollout-a',format(
    'SELECT public.stage_b_rollout_call(2,%s,''concurrent-collision'')',current_version)) AS r(response jsonb);
  PERFORM extensions.dblink_send_query('stage-b-rollout-b',format(
    'SELECT public.stage_b_rollout_call(2,%s,''concurrent-collision'',5)',current_version));
  PERFORM public.stage_b_wait_rollout_lock('stage-b-rollout-b');
  PERFORM extensions.dblink_exec('stage-b-rollout-a','COMMIT');
  PERFORM * FROM extensions.dblink_get_result('stage-b-rollout-b',false) AS r(response jsonb);
  IF extensions.dblink_error_message('stage-b-rollout-b') NOT LIKE '%SUPPLIER_IDEMPOTENCY_CONFLICT%' THEN
    RAISE EXCEPTION 'concurrent signature collision accepted';
  END IF;
  PERFORM * FROM extensions.dblink_get_result('stage-b-rollout-b',false) AS r(response jsonb);
  IF (SELECT count(*) FROM public.supplier_command_events WHERE idempotency_key='concurrent-collision')<>1 THEN
    RAISE EXCEPTION 'concurrent collision wrote duplicate event';
  END IF;
  FOREACH connection_name IN ARRAY ARRAY['stage-b-rollout-a','stage-b-rollout-b','stage-b-rollout-c'] LOOP
    PERFORM extensions.dblink_disconnect(connection_name);
  END LOOP;
END $race$;
SELECT 'EVIDENCE warehouse rollout concurrency: observed live lock waits, same-key replay, different-key version conflict, cross-signature same-key conflict, one event/version passed';
