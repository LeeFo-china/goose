-- Independent transfer flag. No tenant rows are changed by this migration.
-- Rollback is forward-only: disable transfers through the versioned command,
-- retain settings/receipts, and keep the old typed signatures and fingerprints.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='5min';

DO $patch$
DECLARE v_definition text; v_patch record; v_count integer;
BEGIN
  SELECT pg_get_functiondef('public.__gooes_set_supplier_rollout_settings_v2(jsonb,uuid,text)'::regprocedure)
    INTO v_definition;
  FOR v_patch IN SELECT * FROM (VALUES
    ($old$  v_warehouse_materials_enabled boolean := (p_request ->> 'warehouse_materials_enabled')::boolean;$old$,
     $new$  v_warehouse_materials_enabled boolean := (p_request ->> 'warehouse_materials_enabled')::boolean;
  v_warehouse_transfers_enabled boolean := (p_request ->> 'warehouse_transfers_enabled')::boolean;$new$),
    ($old$'warehouse_materials_enabled', 'expected_version'$old$,
     $new$'warehouse_materials_enabled', 'warehouse_transfers_enabled', 'expected_version'$new$),
    ($old$'warehouse_materials_enabled']) AS flags(flag)$old$,
     $new$'warehouse_materials_enabled', 'warehouse_transfers_enabled']) AS flags(flag)$new$),
    ($old$  IF v_warehouse_materials_enabled AND NOT v_module_enabled THEN$old$,
     $new$  IF NOT (v_request ? 'warehouse_transfers_enabled') THEN
    v_warehouse_transfers_enabled := COALESCE(v_setting.warehouse_transfers_enabled, false);
  END IF;
  IF v_warehouse_transfers_enabled AND NOT v_module_enabled THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SUPPLIER_ROLLOUT_ORDER_INVALID';
  END IF;
  IF v_warehouse_materials_enabled AND NOT v_module_enabled THEN$new$),
    ($old$warehouse_procurement_enabled, warehouse_materials_enabled,$old$,
     $new$warehouse_procurement_enabled, warehouse_materials_enabled, warehouse_transfers_enabled,$new$),
    ($old$v_warehouse_procurement_enabled, v_warehouse_materials_enabled,$old$,
     $new$v_warehouse_procurement_enabled, v_warehouse_materials_enabled, v_warehouse_transfers_enabled,$new$),
    ($old$      warehouse_materials_enabled = v_warehouse_materials_enabled,$old$,
     $new$      warehouse_materials_enabled = v_warehouse_materials_enabled,
      warehouse_transfers_enabled = v_warehouse_transfers_enabled,$new$)
  ) replacements(old_text,new_text) LOOP
    v_count:=(length(v_definition)-length(replace(v_definition,v_patch.old_text,'')))/length(v_patch.old_text);
    IF v_count<>1 THEN
      RAISE EXCEPTION 'WAREHOUSE_TRANSFER_ROLLOUT_SOURCE_MISMATCH (% matches): %',v_count,v_patch.old_text;
    END IF;
    v_definition:=replace(v_definition,v_patch.old_text,v_patch.new_text);
  END LOOP;
  EXECUTE v_definition;
END;
$patch$;
-- CREATE OR REPLACE preserves owner/ACL/config. Restate owner-only access for
-- the private core; the existing public JSON and typed wrappers are unchanged.
REVOKE ALL ON FUNCTION public.__gooes_set_supplier_rollout_settings_v2(jsonb,uuid,text)
  FROM PUBLIC,anon,authenticated,service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
