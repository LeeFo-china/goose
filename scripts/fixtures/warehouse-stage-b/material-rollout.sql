-- Synthetic data only, executed in the offline disposable database.
BEGIN;
DO $history$
DECLARE f public.stage_c_historical_rollout%ROWTYPE; result jsonb;
BEGIN
  SELECT * INTO STRICT f FROM public.stage_c_historical_rollout;
  result:=public.set_tenant_supplier_rollout_settings(jsonb_build_object('tenant_id',f.tenant_id,
    'actor_employee_id',f.employee_id,'module_enabled',true,'require_active_contract_for_new_order',false,
    'ownership_reads_enabled',false,'private_supplier_writes_enabled',false,'private_catalog_writes_enabled',false,
    'procurement_snapshot_v1_enabled',false,'expected_version',1,'reason',NULL,'warehouse_materials_enabled',true),
    f.user_id,'material-after-schema');
  IF result->'setting'->>'warehouse_materials_enabled'<>'true' THEN RAISE EXCEPTION 'C enable failed'; END IF;
  result:=public.set_tenant_supplier_rollout_settings(f.tenant_id,true,false,false,false,false,false,
    0,f.user_id,f.employee_id,'material-before-schema',NULL);
  IF result IS DISTINCT FROM (f.result||'{"idempotent":true}') OR result->'setting' ? 'warehouse_materials_enabled'
    OR NOT (SELECT warehouse_materials_enabled FROM public.tenant_supplier_settings WHERE tenant_id=f.tenant_id) THEN
    RAISE EXCEPTION 'Pre-C historical replay snapshot or current settings changed';
  END IF;
END;
$history$;
CREATE FUNCTION pg_temp.reject_material_setting_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'MATERIAL_SETTING_EVENT_FAILURE'; END;
$$;
DO $test$
DECLARE
  t uuid := gen_random_uuid(); e uuid := gen_random_uuid(); u uuid := gen_random_uuid();
  request jsonb; result jsonb; original jsonb; before_setting jsonb; event_count integer;
BEGIN
  IF has_function_privilege('anon', 'public.set_tenant_supplier_rollout_settings(jsonb,uuid,text)', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.set_tenant_supplier_rollout_settings(jsonb,uuid,text)', 'EXECUTE')
    OR has_function_privilege('service_role', 'public.__gooes_set_supplier_rollout_settings_v2(jsonb,uuid,text)', 'EXECUTE')
    OR NOT has_function_privilege('service_role', 'public.set_tenant_supplier_rollout_settings(jsonb,uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'materials rollout ACL invalid';
  END IF;
  INSERT INTO public.tenants(id,name,slug) VALUES(t,'Material rollout','material-rollout');
  INSERT INTO public.employees(id,tenant_id,name,status) VALUES(e,t,'Platform actor','active');
  result := public.set_tenant_supplier_rollout_settings(t,true,false,false,false,false,false,
    0,u,e,'material-legacy-enable',NULL);
  IF result->>'version' <> '1' THEN RAISE EXCEPTION 'legacy enable failed: %', result; END IF;
  request := jsonb_build_object('tenant_id',t,'actor_employee_id',e,'module_enabled',true,
    'require_active_contract_for_new_order',false,'ownership_reads_enabled',false,
    'private_supplier_writes_enabled',false,'private_catalog_writes_enabled',false,
    'procurement_snapshot_v1_enabled',false,'expected_version',1,'reason',NULL,
    'warehouse_materials_enabled',true);
  original := public.set_tenant_supplier_rollout_settings(request,u,'material-enable');
  IF original->>'version' <> '2' OR original->'setting'->>'warehouse_materials_enabled' <> 'true'
    OR original->'setting'->>'warehouse_procurement_enabled' <> 'false' THEN
    RAISE EXCEPTION 'independent materials enable failed: %', original;
  END IF;
  IF EXISTS(SELECT 1 FROM public.supplier_command_events WHERE tenant_id=t AND idempotency_key='material-enable'
    AND ((from_state->'_request') ? 'warehouse_procurement_enabled' OR (from_state->'_request') ? 'purchase_batch_workflow_enabled')) THEN
    RAISE EXCEPTION 'omitted flags were synthesized in fingerprint';
  END IF;
  BEGIN
    PERFORM public.set_tenant_supplier_rollout_settings(t,false,false,false,false,false,false,
      2,u,e,'material-legacy-disable','disable');
    RAISE EXCEPTION 'legacy client bypassed materials dependency';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM <> 'SUPPLIER_ROLLOUT_ORDER_INVALID' THEN RAISE; END IF;
  END;
  BEGIN
    UPDATE public.tenant_supplier_settings SET module_enabled=false WHERE tenant_id=t;
    RAISE EXCEPTION 'table constraint allowed a bypass';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    PERFORM public.set_tenant_supplier_rollout_settings(request || '{"warehouse_materials_enabled":false}',u,'material-enable');
    RAISE EXCEPTION 'different flag reused key';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM <> 'SUPPLIER_IDEMPOTENCY_CONFLICT' THEN RAISE; END IF;
  END;
  result := public.set_tenant_supplier_rollout_settings(request || '{"expected_version":0}',u,'material-stale');
  IF result->>'error_code' <> 'SUPPLIER_VERSION_CONFLICT' THEN RAISE EXCEPTION 'stale version not rejected'; END IF;

  result := public.set_tenant_supplier_rollout_settings(request || '{"expected_version":2,"warehouse_materials_enabled":false}',u,'material-disable');
  IF result->>'version' <> '3' OR result->'previous_setting' <> original->'setting' THEN
    RAISE EXCEPTION 'atomic prior snapshot incorrect: %',result;
  END IF;
  result := public.set_tenant_supplier_rollout_settings(request ||
    '{"expected_version":3,"warehouse_materials_enabled":false,"module_enabled":false,"reason":"disable"}',u,'material-module-disable');
  IF result->>'version' <> '4' THEN RAISE EXCEPTION 'module disable failed'; END IF;
  result := public.set_tenant_supplier_rollout_settings(request,u,'material-enable');
  IF result <> (original || '{"idempotent":true}') THEN RAISE EXCEPTION 'historical replay changed'; END IF;
  IF (SELECT warehouse_materials_enabled FROM public.tenant_supplier_settings WHERE tenant_id=t) THEN
    RAISE EXCEPTION 'replay re-enabled material writes';
  END IF;
  SELECT to_jsonb(s) INTO before_setting FROM public.tenant_supplier_settings s WHERE tenant_id=t;
  SELECT count(*) INTO event_count FROM public.supplier_command_events WHERE tenant_id=t;
  CREATE TRIGGER stage_c_setting_failure BEFORE INSERT ON public.supplier_command_events
    FOR EACH ROW EXECUTE FUNCTION pg_temp.reject_material_setting_event();
  BEGIN
    PERFORM public.set_tenant_supplier_rollout_settings(request || '{"expected_version":4}',u,'material-failure');
    RAISE EXCEPTION 'event failure not injected';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM <> 'MATERIAL_SETTING_EVENT_FAILURE' THEN RAISE; END IF;
  END;
  DROP TRIGGER stage_c_setting_failure ON public.supplier_command_events;
  IF before_setting <> (SELECT to_jsonb(s) FROM public.tenant_supplier_settings s WHERE tenant_id=t)
    OR event_count <> (SELECT count(*) FROM public.supplier_command_events WHERE tenant_id=t) THEN
    RAISE EXCEPTION 'event failure partially committed';
  END IF;
END;
$test$;
ROLLBACK;
SELECT 'EVIDENCE pre-C typed request snapshot replays exactly after C enabled without changing live settings';
