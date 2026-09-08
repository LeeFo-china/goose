-- D1 contract on the disposable offline database; no application rows required.
BEGIN;
DO $test$
DECLARE table_name text; signature text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['warehouse_transfer_orders','warehouse_transfer_order_items','warehouse_transfer_command_events'] LOOP
    IF to_regclass('public.'||table_name) IS NULL THEN
      RAISE EXCEPTION 'Stage D1 missing table: %',table_name;
    END IF;
    IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=to_regclass('public.'||table_name) AND relrowsecurity AND relforcerowsecurity)
      OR has_table_privilege('service_role','public.'||table_name,'INSERT,UPDATE,DELETE,TRUNCATE')
      OR has_table_privilege('authenticated','public.'||table_name,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') THEN
      RAISE EXCEPTION 'Transfer table security failed: %',table_name;
    END IF;
  END LOOP;
  FOREACH signature IN ARRAY ARRAY[
    'command_warehouse_transfer_order(uuid,uuid,text,integer,jsonb,uuid,uuid,text)',
    'get_warehouse_transfer_order(uuid,uuid,uuid,uuid)',
    'list_warehouse_transfer_orders(uuid,uuid,uuid,uuid,uuid,text,text,integer,integer)',
    'list_warehouse_transfer_order_items(uuid,uuid,uuid,uuid,integer,integer)',
    'get_warehouse_transfer_settings(uuid,uuid,uuid)'] LOOP
    IF to_regprocedure('public.'||signature) IS NULL THEN RAISE EXCEPTION 'Missing transfer RPC: %',signature; END IF;
    IF has_function_privilege('anon','public.'||signature,'EXECUTE')
      OR has_function_privilege('authenticated','public.'||signature,'EXECUTE')
      OR NOT has_function_privilege('service_role','public.'||signature,'EXECUTE') THEN
      RAISE EXCEPTION 'Transfer RPC security failed: %',signature;
    END IF;
  END LOOP;
  IF EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE '__gooes_transfer_%'
    AND (has_function_privilege('service_role',oid,'EXECUTE') OR has_function_privilege('authenticated',oid,'EXECUTE')
      OR has_function_privilege('anon',oid,'EXECUTE'))) THEN
    RAISE EXCEPTION 'Transfer helper escaped owner-only ACL';
  END IF;
  IF (SELECT count(*) FROM public.permissions WHERE code IN ('inventory.transfer.manage','inventory.transfer.approve') AND status='active')<>2
    OR EXISTS(SELECT 1 FROM public.role_permissions rp JOIN public.permissions p ON p.id=rp.permission_id WHERE p.code LIKE 'inventory.transfer.%') THEN
    RAISE EXCEPTION 'Transfer permission definitions missing or silently assigned';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM information_schema.columns c WHERE c.table_schema='public' AND c.table_name='tenant_supplier_settings'
    AND c.column_name='warehouse_transfers_enabled' AND c.column_default='false' AND c.is_nullable='NO') THEN
    RAISE EXCEPTION 'Transfer flag must default false';
  END IF;
END;
$test$;
ROLLBACK;
SELECT 'EVIDENCE transfer contract: forced RLS, owner-only helpers, service-only RPCs, no role grants, default-disabled flag';
