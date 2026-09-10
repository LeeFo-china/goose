-- Extend only the JSON core. Existing typed/JSON wrapper signatures and receipts remain stable.
-- Forward rollback: explicitly disable stocktakes through the versioned command,
-- then replace the core in a new migration; retain settings history and receipts.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='5min';

DO $patch$
DECLARE v_definition text; v_patch record; v_count integer;
BEGIN
  SELECT pg_get_functiondef('public.__gooes_set_supplier_rollout_settings_v2(jsonb,uuid,text)'::regprocedure)
    INTO v_definition;
  FOR v_patch IN SELECT * FROM (VALUES
    ($old$  v_warehouse_transfers_enabled boolean := (p_request ->> 'warehouse_transfers_enabled')::boolean;$old$,
     $new$  v_warehouse_transfers_enabled boolean := (p_request ->> 'warehouse_transfers_enabled')::boolean;
  v_warehouse_stocktakes_enabled boolean := (p_request ->> 'warehouse_stocktakes_enabled')::boolean;$new$),
    ($old$'warehouse_transfers_enabled', 'expected_version'$old$,
     $new$'warehouse_transfers_enabled', 'warehouse_stocktakes_enabled', 'expected_version'$new$),
    ($old$'warehouse_materials_enabled', 'warehouse_transfers_enabled']) AS flags(flag)$old$,
     $new$'warehouse_materials_enabled', 'warehouse_transfers_enabled', 'warehouse_stocktakes_enabled']) AS flags(flag)$new$),
    ($old$  IF NOT (v_request ? 'warehouse_transfers_enabled') THEN$old$,
     $new$  IF NOT (v_request ? 'warehouse_stocktakes_enabled') THEN
    v_warehouse_stocktakes_enabled := COALESCE(v_setting.warehouse_stocktakes_enabled, false);
  END IF;
  IF v_warehouse_stocktakes_enabled AND NOT v_module_enabled THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SUPPLIER_ROLLOUT_ORDER_INVALID';
  END IF;
  IF NOT (v_request ? 'warehouse_transfers_enabled') THEN$new$),
    ($old$warehouse_materials_enabled, warehouse_transfers_enabled,$old$,
     $new$warehouse_materials_enabled, warehouse_transfers_enabled, warehouse_stocktakes_enabled,$new$),
    ($old$v_warehouse_materials_enabled, v_warehouse_transfers_enabled,$old$,
     $new$v_warehouse_materials_enabled, v_warehouse_transfers_enabled, v_warehouse_stocktakes_enabled,$new$),
    ($old$      warehouse_transfers_enabled = v_warehouse_transfers_enabled,$old$,
     $new$      warehouse_transfers_enabled = v_warehouse_transfers_enabled,
      warehouse_stocktakes_enabled = v_warehouse_stocktakes_enabled,$new$)
  ) replacements(old_text,new_text) LOOP
    v_count:=(length(v_definition)-length(replace(v_definition,v_patch.old_text,'')))/length(v_patch.old_text);
    IF v_count<>1 THEN
      RAISE EXCEPTION 'WAREHOUSE_STOCKTAKE_ROLLOUT_SOURCE_MISMATCH (% matches): %',v_count,v_patch.old_text;
    END IF;
    v_definition:=replace(v_definition,v_patch.old_text,v_patch.new_text);
  END LOOP;
  EXECUTE v_definition;
END;
$patch$;
REVOKE ALL ON FUNCTION public.__gooes_set_supplier_rollout_settings_v2(jsonb,uuid,text)
  FROM PUBLIC,anon,authenticated,service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
