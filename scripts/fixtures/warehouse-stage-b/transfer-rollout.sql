-- Real old typed/JSON receipts were created BEFORE the new core migration.
BEGIN;
CREATE FUNCTION pg_temp.reject_transfer_setting_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'TRANSFER_SETTING_EVENT_FAILURE'; END;
$$;
DO $test$
DECLARE f public.stage_d_transfer_rollout_history%ROWTYPE; request jsonb; result jsonb; original jsonb;
  before_setting jsonb; before_events jsonb; invalid jsonb; bad jsonb;
BEGIN
  SELECT * INTO STRICT f FROM public.stage_d_transfer_rollout_history;
  IF has_function_privilege('anon','public.set_tenant_supplier_rollout_settings(jsonb,uuid,text)','EXECUTE')
    OR has_function_privilege('authenticated','public.set_tenant_supplier_rollout_settings(jsonb,uuid,text)','EXECUTE')
    OR has_function_privilege('service_role','public.__gooes_set_supplier_rollout_settings_v2(jsonb,uuid,text)','EXECUTE')
    OR NOT has_function_privilege('service_role','public.set_tenant_supplier_rollout_settings(jsonb,uuid,text)','EXECUTE') THEN
    RAISE EXCEPTION 'rollout ACL changed';
  END IF;
  request:=(f.json_request-'warehouse_materials_enabled')||'{"warehouse_transfers_enabled":true,"expected_version":2}';
  original:=public.set_tenant_supplier_rollout_settings(request,f.user_id,'transfer-enable');
  IF original->>'version' IS DISTINCT FROM '3' OR original->'setting'->>'warehouse_transfers_enabled' IS DISTINCT FROM 'true'
    OR original->'setting'->>'warehouse_procurement_enabled' IS DISTINCT FROM 'false'
    OR original->'setting'->>'warehouse_materials_enabled' IS DISTINCT FROM 'false' THEN RAISE EXCEPTION 'independent transfer enable failed'; END IF;
  IF (SELECT from_state->'_request' FROM public.supplier_command_events WHERE actor_user_id=f.user_id AND idempotency_key='transfer-enable')
    IS DISTINCT FROM request THEN RAISE EXCEPTION 'request field presence changed'; END IF;

  -- Current typed clients omit both independent flags. Keep true under row lock.
  result:=public.set_tenant_supplier_rollout_settings(f.tenant_id,true,false,false,false,false,false,3,f.user_id,f.employee_id,'transfer-typed-omit',NULL);
  IF result->>'version' IS DISTINCT FROM '4' OR result->'setting'->>'warehouse_transfers_enabled' IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'typed omission reset transfer flag'; END IF;
  result:=public.set_tenant_supplier_rollout_settings(f.json_request||'{"expected_version":4}',f.user_id,'transfer-json-omit');
  IF result->>'version' IS DISTINCT FROM '5' OR result->'setting'->>'warehouse_transfers_enabled' IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'JSON omission reset transfer flag'; END IF;
  SELECT to_jsonb(s) INTO before_setting FROM public.tenant_supplier_settings s WHERE tenant_id=f.tenant_id;
  SELECT jsonb_agg(to_jsonb(e) ORDER BY id) INTO before_events FROM public.supplier_command_events e WHERE tenant_id=f.tenant_id;

  BEGIN
    PERFORM public.set_tenant_supplier_rollout_settings(f.tenant_id,false,false,false,false,false,false,5,f.user_id,f.employee_id,'transfer-invalid-disable','停用');
    RAISE EXCEPTION 'old client bypassed transfer parent dependency';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN IF SQLERRM<>'SUPPLIER_ROLLOUT_ORDER_INVALID' THEN RAISE; END IF; END;
  FOR invalid IN SELECT value FROM jsonb_array_elements('[{"warehouse_transfers_enabled":"true"},{"warehouse_transfers_enabled":null},{"warehouse_transfers_enabled":1},{"unknown_flag":false}]') LOOP
    bad:=request||'{"expected_version":5}'||invalid;
    BEGIN
      PERFORM public.set_tenant_supplier_rollout_settings(bad,f.user_id,'transfer-invalid-input');
      RAISE EXCEPTION 'invalid input was accepted';
    EXCEPTION WHEN SQLSTATE '22023' THEN IF SQLERRM<>'SUPPLIER_IDEMPOTENCY_CONFLICT' THEN RAISE; END IF; END;
  END LOOP;
  BEGIN
    PERFORM public.set_tenant_supplier_rollout_settings(request||'{"warehouse_transfers_enabled":false}',f.user_id,'transfer-enable');
    RAISE EXCEPTION 'conflicting key accepted';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN IF SQLERRM<>'SUPPLIER_IDEMPOTENCY_CONFLICT' THEN RAISE; END IF; END;
  result:=public.set_tenant_supplier_rollout_settings(request,f.user_id,'transfer-stale');
  IF result->>'error_code' IS DISTINCT FROM 'SUPPLIER_VERSION_CONFLICT' THEN RAISE EXCEPTION 'stale version accepted'; END IF;
  IF before_setting IS DISTINCT FROM (SELECT to_jsonb(s) FROM public.tenant_supplier_settings s WHERE tenant_id=f.tenant_id)
    OR before_events IS DISTINCT FROM (SELECT jsonb_agg(to_jsonb(e) ORDER BY id) FROM public.supplier_command_events e WHERE tenant_id=f.tenant_id) THEN
    RAISE EXCEPTION 'invalid command changed settings/events'; END IF;

  result:=public.set_tenant_supplier_rollout_settings(request||'{"expected_version":5,"warehouse_transfers_enabled":false}',f.user_id,'transfer-disable');
  IF result->>'version' IS DISTINCT FROM '6' OR result->'previous_setting' IS DISTINCT FROM before_setting
    OR result->'setting'->>'warehouse_transfers_enabled' IS DISTINCT FROM 'false' THEN RAISE EXCEPTION 'disable audit incorrect'; END IF;
  result:=public.set_tenant_supplier_rollout_settings(request||'{"expected_version":6,"warehouse_transfers_enabled":false,"module_enabled":false,"reason":"停用"}',f.user_id,'transfer-module-disable');
  IF result->>'version' IS DISTINCT FROM '7' THEN RAISE EXCEPTION 'module disable failed'; END IF;
  SELECT to_jsonb(s) INTO before_setting FROM public.tenant_supplier_settings s WHERE tenant_id=f.tenant_id;
  SELECT jsonb_agg(to_jsonb(e) ORDER BY id) INTO before_events FROM public.supplier_command_events e WHERE tenant_id=f.tenant_id;

  result:=public.set_tenant_supplier_rollout_settings(f.tenant_id,true,false,false,false,false,false,0,f.user_id,f.employee_id,'transfer-pre-typed',NULL);
  IF result IS DISTINCT FROM (f.typed_result||'{"idempotent":true}') THEN RAISE EXCEPTION 'pre-upgrade typed replay changed'; END IF;
  result:=public.set_tenant_supplier_rollout_settings(f.json_request,f.user_id,'transfer-pre-json');
  IF result IS DISTINCT FROM (f.json_result||'{"idempotent":true}') THEN RAISE EXCEPTION 'pre-upgrade JSON replay changed'; END IF;
  result:=public.set_tenant_supplier_rollout_settings(request,f.user_id,'transfer-enable');
  IF result IS DISTINCT FROM (original||'{"idempotent":true}') THEN RAISE EXCEPTION 'new replay changed'; END IF;

  CREATE TRIGGER stage_d_setting_failure BEFORE INSERT ON public.supplier_command_events
    FOR EACH ROW EXECUTE FUNCTION pg_temp.reject_transfer_setting_event();
  BEGIN
    PERFORM public.set_tenant_supplier_rollout_settings(request||'{"expected_version":7}',f.user_id,'transfer-event-failure');
    RAISE EXCEPTION 'event failure not injected';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN IF SQLERRM<>'TRANSFER_SETTING_EVENT_FAILURE' THEN RAISE; END IF; END;
  DROP TRIGGER stage_d_setting_failure ON public.supplier_command_events;
  IF before_setting IS DISTINCT FROM (SELECT to_jsonb(s) FROM public.tenant_supplier_settings s WHERE tenant_id=f.tenant_id)
    OR before_events IS DISTINCT FROM (SELECT jsonb_agg(to_jsonb(e) ORDER BY id) FROM public.supplier_command_events e WHERE tenant_id=f.tenant_id) THEN
    RAISE EXCEPTION 'replay or event failure mutated settings/audit'; END IF;
END;
$test$;
ROLLBACK;
SELECT 'EVIDENCE transfer rollout: genuine pre-upgrade typed/JSON replay; independent enable; omission retained; input/version/parent guards; exact snapshots; audit failure rollback; ACL unchanged';
