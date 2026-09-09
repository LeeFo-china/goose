BEGIN;
DO $test$
DECLARE name text; signature text;
BEGIN
  FOREACH name IN ARRAY ARRAY['warehouse_issue_orders','warehouse_issue_order_items',
    'warehouse_return_orders','warehouse_return_order_items','warehouse_material_command_events'] LOOP
    IF to_regclass('public.'||name) IS NULL THEN
      RAISE EXCEPTION 'Stage C missing table: %',name;
    END IF;
    IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=to_regclass('public.'||name) AND relrowsecurity AND relforcerowsecurity)
      OR has_table_privilege('service_role','public.'||name,'INSERT,UPDATE,DELETE,TRUNCATE') THEN
      RAISE EXCEPTION 'Material table security failed: %',name;
    END IF;
  END LOOP;
  FOREACH signature IN ARRAY ARRAY[
    'command_warehouse_material_order(uuid,uuid,text,text,integer,jsonb,uuid,uuid,text)',
    'get_warehouse_material_order(uuid,text,uuid,uuid,uuid)',
    'list_warehouse_material_orders(uuid,text,uuid,uuid,uuid,uuid,text,text,integer,integer)',
    'list_warehouse_material_order_items(uuid,text,uuid,uuid,uuid,integer,integer)',
    'list_warehouse_material_projects(uuid,uuid,uuid,text,integer,integer)'] LOOP
    IF to_regprocedure('public.'||signature) IS NULL THEN RAISE EXCEPTION 'Missing material RPC: %',signature; END IF;
    IF has_function_privilege('anon','public.'||signature,'EXECUTE')
      OR has_function_privilege('authenticated','public.'||signature,'EXECUTE')
      OR NOT has_function_privilege('service_role','public.'||signature,'EXECUTE') THEN
      RAISE EXCEPTION 'Material RPC security failed: %',signature;
    END IF;
  END LOOP;
  IF EXISTS(SELECT 1 FROM pg_proc WHERE proname LIKE '__gooes_material_%'
    AND (has_function_privilege('service_role',oid,'EXECUTE') OR has_function_privilege('authenticated',oid,'EXECUTE'))) THEN
    RAISE EXCEPTION 'Material helper escaped owner-only ACL';
  END IF;
END;
$test$;
ROLLBACK;
