BEGIN;
CREATE TEMP TABLE stocktake_settings_wire(payload jsonb);
CREATE FUNCTION pg_temp.reject_stocktake_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'STOCKTAKE_SETTING_EVENT_FAILURE'; END;
$$;
DO $test$
DECLARE f public.stage_d2_rollout_history%ROWTYPE; request jsonb; result jsonb; original jsonb;
  before_setting jsonb; before_events jsonb; invalid jsonb; bad jsonb;
BEGIN
  SELECT * INTO STRICT f FROM public.stage_d2_rollout_history;
  IF has_function_privilege('anon','public.set_tenant_supplier_rollout_settings(jsonb,uuid,text)','EXECUTE')
    OR has_function_privilege('authenticated','public.set_tenant_supplier_rollout_settings(jsonb,uuid,text)','EXECUTE')
    OR has_function_privilege('service_role','public.__gooes_set_supplier_rollout_settings_v2(jsonb,uuid,text)','EXECUTE')
    OR NOT has_function_privilege('service_role','public.set_tenant_supplier_rollout_settings(jsonb,uuid,text)','EXECUTE') THEN
    RAISE EXCEPTION 'rollout ACL changed'; END IF;
  request:=f.json_request||'{"warehouse_stocktakes_enabled":true,"expected_version":2}'::jsonb;
  original:=public.set_tenant_supplier_rollout_settings(request,f.user_id,'stocktake-enable');
  IF original->>'version' IS DISTINCT FROM '3' OR original->'setting'->>'warehouse_stocktakes_enabled' IS DISTINCT FROM 'true'
    OR original->'setting'->>'warehouse_materials_enabled' IS DISTINCT FROM 'false'
    OR original->'setting'->>'warehouse_transfers_enabled' IS DISTINCT FROM 'false' THEN RAISE EXCEPTION 'independent stocktake enable failed'; END IF;
  INSERT INTO stocktake_settings_wire VALUES(jsonb_build_object('new',original->'setting',
    'oldTyped',f.typed_result->'setting','oldJson',f.json_result->'setting'));
  result:=public.set_tenant_supplier_rollout_settings(f.tenant_id,true,false,false,false,false,false,3,f.user_id,f.employee_id,'stocktake-typed-omit',NULL);
  IF result->>'version' IS DISTINCT FROM '4' OR result->'setting'->>'warehouse_stocktakes_enabled' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'typed omission reset stocktake'; END IF;
  result:=public.set_tenant_supplier_rollout_settings(f.json_request||'{"expected_version":4}'::jsonb,f.user_id,'stocktake-json-omit');
  IF result->>'version' IS DISTINCT FROM '5' OR result->'setting'->>'warehouse_stocktakes_enabled' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'JSON omission reset stocktake'; END IF;
  SELECT to_jsonb(s) INTO before_setting FROM public.tenant_supplier_settings s WHERE tenant_id=f.tenant_id;
  SELECT jsonb_agg(to_jsonb(e) ORDER BY id) INTO before_events FROM public.supplier_command_events e WHERE tenant_id=f.tenant_id;
  BEGIN
    PERFORM public.set_tenant_supplier_rollout_settings(f.tenant_id,false,false,false,false,false,false,5,f.user_id,f.employee_id,'stocktake-invalid-disable','停用');
    RAISE EXCEPTION 'typed client bypassed parent dependency';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN IF SQLERRM<>'SUPPLIER_ROLLOUT_ORDER_INVALID' THEN RAISE; END IF; END;
  FOR invalid IN SELECT value FROM jsonb_array_elements('[{"warehouse_stocktakes_enabled":"true"},{"warehouse_stocktakes_enabled":null},{"warehouse_stocktakes_enabled":1},{"unknown_flag":false}]') LOOP
    bad:=request||'{"expected_version":5}'::jsonb||invalid;
    BEGIN PERFORM public.set_tenant_supplier_rollout_settings(bad,f.user_id,'stocktake-invalid-'||md5(invalid::text));
      RAISE EXCEPTION 'invalid input accepted';
    EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END;
  END LOOP;
  result:=public.set_tenant_supplier_rollout_settings(request,f.user_id,'stocktake-stale');
  IF result->>'error_code' IS DISTINCT FROM 'SUPPLIER_VERSION_CONFLICT' THEN RAISE EXCEPTION 'stale version accepted'; END IF;
  BEGIN PERFORM public.set_tenant_supplier_rollout_settings(request||'{"warehouse_stocktakes_enabled":false}'::jsonb,f.user_id,'stocktake-enable');
    RAISE EXCEPTION 'conflicting key accepted';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN IF SQLERRM<>'SUPPLIER_IDEMPOTENCY_CONFLICT' THEN RAISE; END IF; END;
  IF before_setting IS DISTINCT FROM (SELECT to_jsonb(s) FROM public.tenant_supplier_settings s WHERE tenant_id=f.tenant_id)
    OR before_events IS DISTINCT FROM (SELECT jsonb_agg(to_jsonb(e) ORDER BY id) FROM public.supplier_command_events e WHERE tenant_id=f.tenant_id) THEN
    RAISE EXCEPTION 'invalid commands changed state'; END IF;
  result:=public.set_tenant_supplier_rollout_settings(request||'{"expected_version":5,"warehouse_stocktakes_enabled":false}'::jsonb,f.user_id,'stocktake-disable');
  IF result->>'version' IS DISTINCT FROM '6' OR result->'setting'->>'warehouse_stocktakes_enabled' IS DISTINCT FROM 'false'
    THEN RAISE EXCEPTION 'stocktake disable failed'; END IF;
  result:=public.set_tenant_supplier_rollout_settings(request||'{"expected_version":6,"warehouse_stocktakes_enabled":false,"module_enabled":false,"reason":"停用"}'::jsonb,f.user_id,'stocktake-module-disable');
  IF result->>'version' IS DISTINCT FROM '7' OR result->'setting'->>'module_enabled' IS DISTINCT FROM 'false'
    OR result->'setting'->>'warehouse_stocktakes_enabled' IS DISTINCT FROM 'false' THEN RAISE EXCEPTION 'module disable failed'; END IF;
  SELECT to_jsonb(s) INTO before_setting FROM public.tenant_supplier_settings s WHERE tenant_id=f.tenant_id;
  SELECT jsonb_agg(to_jsonb(e) ORDER BY id) INTO before_events FROM public.supplier_command_events e WHERE tenant_id=f.tenant_id;
  IF public.set_tenant_supplier_rollout_settings(f.tenant_id,true,false,false,false,false,false,0,f.user_id,f.employee_id,'stocktake-pre-typed',NULL)
      IS DISTINCT FROM (f.typed_result||'{"idempotent":true}'::jsonb)
    OR public.set_tenant_supplier_rollout_settings(f.json_request,f.user_id,'stocktake-pre-json')
      IS DISTINCT FROM (f.json_result||'{"idempotent":true}'::jsonb)
    OR public.set_tenant_supplier_rollout_settings(request,f.user_id,'stocktake-enable')
      IS DISTINCT FROM (original||'{"idempotent":true}'::jsonb) THEN RAISE EXCEPTION 'exact replay changed'; END IF;
  CREATE TRIGGER stage_d2_setting_failure BEFORE INSERT ON public.supplier_command_events
    FOR EACH ROW EXECUTE FUNCTION pg_temp.reject_stocktake_event();
  BEGIN PERFORM public.set_tenant_supplier_rollout_settings(request||'{"expected_version":7}'::jsonb,f.user_id,'stocktake-event-failure');
    RAISE EXCEPTION 'event failure not injected';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN IF SQLERRM<>'STOCKTAKE_SETTING_EVENT_FAILURE' THEN RAISE; END IF; END;
  DROP TRIGGER stage_d2_setting_failure ON public.supplier_command_events;
  IF before_setting IS DISTINCT FROM (SELECT to_jsonb(s) FROM public.tenant_supplier_settings s WHERE tenant_id=f.tenant_id)
    OR before_events IS DISTINCT FROM (SELECT jsonb_agg(to_jsonb(e) ORDER BY id) FROM public.supplier_command_events e WHERE tenant_id=f.tenant_id) THEN
    RAISE EXCEPTION 'replay/event failure changed state'; END IF;
END;
$test$;
SELECT 'EVIDENCE stocktake settings wire: '||payload::text FROM stocktake_settings_wire;
ROLLBACK;
SELECT 'EVIDENCE stocktake rollout: genuine pre-column typed/JSON exact replay; independent flag; omission; strict input/version/key/parent guards; rollback; ACL unchanged';
