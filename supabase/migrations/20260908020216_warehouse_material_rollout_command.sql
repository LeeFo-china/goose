-- Independent materials flag: requires the supplier module, not new purchases.
-- Forward rollback: disable materials through this command; retain all facts and
-- historical command receipts. Old typed RPC requests keep their original keys.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

DO $patch$
DECLARE
  v_definition text;
  v_patch record;
  v_count integer;
BEGIN
  SELECT pg_get_functiondef('public.__gooes_set_supplier_rollout_settings_v2(jsonb,uuid,text)'::regprocedure)
  INTO v_definition;
  FOR v_patch IN SELECT * FROM (VALUES
    ($old$  v_warehouse_procurement_enabled boolean := (p_request ->> 'warehouse_procurement_enabled')::boolean;$old$,
     $new$  v_warehouse_procurement_enabled boolean := (p_request ->> 'warehouse_procurement_enabled')::boolean;
  v_warehouse_materials_enabled boolean := (p_request ->> 'warehouse_materials_enabled')::boolean;$new$),
    ($old$'warehouse_procurement_enabled', 'expected_version'$old$,
     $new$'warehouse_procurement_enabled', 'warehouse_materials_enabled', 'expected_version'$new$),
    ($old$'purchase_batch_workflow_enabled', 'warehouse_procurement_enabled']) AS flags(flag)$old$,
     $new$'purchase_batch_workflow_enabled', 'warehouse_procurement_enabled', 'warehouse_materials_enabled']) AS flags(flag)$new$),
    ($old$  IF (v_ownership_reads_enabled AND NOT (v_module_enabled))$old$,
     $new$  IF NOT (v_request ? 'warehouse_materials_enabled') THEN
    v_warehouse_materials_enabled := COALESCE(v_setting.warehouse_materials_enabled, false);
  END IF;
  IF v_warehouse_materials_enabled AND NOT v_module_enabled THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SUPPLIER_ROLLOUT_ORDER_INVALID';
  END IF;
  IF (v_ownership_reads_enabled AND NOT (v_module_enabled))$new$),
    ($old$procurement_snapshot_v1_enabled, purchase_batch_workflow_enabled, warehouse_procurement_enabled,$old$,
     $new$procurement_snapshot_v1_enabled, purchase_batch_workflow_enabled, warehouse_procurement_enabled, warehouse_materials_enabled,$new$),
    ($old$v_procurement_snapshot_v1_enabled, v_purchase_batch_workflow_enabled, v_warehouse_procurement_enabled,$old$,
     $new$v_procurement_snapshot_v1_enabled, v_purchase_batch_workflow_enabled, v_warehouse_procurement_enabled, v_warehouse_materials_enabled,$new$),
    ($old$      warehouse_procurement_enabled = v_warehouse_procurement_enabled,$old$,
     $new$      warehouse_procurement_enabled = v_warehouse_procurement_enabled,
      warehouse_materials_enabled = v_warehouse_materials_enabled,$new$)
  ) replacements(old_text, new_text) LOOP
    v_count := (length(v_definition) - length(replace(v_definition, v_patch.old_text, ''))) / length(v_patch.old_text);
    IF v_count <> 1 THEN
      RAISE EXCEPTION 'WAREHOUSE_MATERIAL_ROLLOUT_SOURCE_MISMATCH (% matches): %', v_count, v_patch.old_text;
    END IF;
    v_definition := replace(v_definition, v_patch.old_text, v_patch.new_text);
  END LOOP;
  EXECUTE v_definition;
END;
$patch$;

-- JSON argument names disambiguate this additive overload from all three typed
-- signatures. The private core performs strict request validation and retains
-- field presence in the fingerprint, including omitted procurement/workflow.
CREATE FUNCTION public.set_tenant_supplier_rollout_settings(
  p_request jsonb, p_actor_user_id uuid, p_idempotency_key text
) RETURNS jsonb LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $wrapper$
  SELECT public.__gooes_set_supplier_rollout_settings_v2(p_request, p_actor_user_id, p_idempotency_key);
$wrapper$;
REVOKE ALL ON FUNCTION public.set_tenant_supplier_rollout_settings(jsonb, uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_tenant_supplier_rollout_settings(jsonb, uuid, text) TO service_role;
REVOKE ALL ON FUNCTION public.__gooes_set_supplier_rollout_settings_v2(jsonb, uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
