BEGIN;
DO $test$
DECLARE t text; r text; signature text := 'public.command_warehouse_stocktake_order(uuid,uuid,text,integer,jsonb,uuid,uuid,text)';
BEGIN
  FOREACH t IN ARRAY ARRAY['warehouse_stocktake_orders','warehouse_stocktake_order_items','warehouse_stocktake_command_events'] LOOP
    IF to_regclass('public.'||t) IS NULL THEN RAISE EXCEPTION 'Stage D2 missing table: %',t; END IF;
    IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=to_regclass('public.'||t) AND relrowsecurity AND relforcerowsecurity) THEN
      RAISE EXCEPTION 'Stocktake forced RLS missing: %',t;
    END IF;
    FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
      IF has_table_privilege(r,'public.'||t,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN
        RAISE EXCEPTION 'Stocktake direct table privilege: % %',t,r;
      END IF;
    END LOOP;
  END LOOP;
  IF to_regprocedure(signature) IS NULL THEN RAISE EXCEPTION 'Stocktake command missing'; END IF;
  IF has_function_privilege('anon',signature,'EXECUTE') OR has_function_privilege('authenticated',signature,'EXECUTE')
    OR NOT has_function_privilege('service_role',signature,'EXECUTE') THEN RAISE EXCEPTION 'Stocktake command ACL'; END IF;
  IF EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE '__gooes_stocktake_%'
    AND (has_function_privilege('anon',oid,'EXECUTE') OR has_function_privilege('authenticated',oid,'EXECUTE')
      OR has_function_privilege('service_role',oid,'EXECUTE'))) THEN RAISE EXCEPTION 'Stocktake helper ACL'; END IF;
  IF (SELECT count(*) FROM public.permissions WHERE code IN ('inventory.stocktake.manage','inventory.stocktake.approve') AND status='active')<>2
    OR EXISTS(SELECT 1 FROM public.role_permissions rp JOIN public.permissions p ON p.id=rp.permission_id WHERE p.code LIKE 'inventory.stocktake.%')
    OR EXISTS(SELECT 1 FROM public.employee_permission_overrides ep JOIN public.permissions p ON p.id=ep.permission_id WHERE p.code LIKE 'inventory.stocktake.%') THEN
    RAISE EXCEPTION 'Stocktake definitions missing or automatic grants present';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='tenant_supplier_settings'
    AND column_name='warehouse_stocktakes_enabled' AND column_default='false' AND is_nullable='NO') THEN RAISE EXCEPTION 'Stocktake default flag'; END IF;
  FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
    IF has_sequence_privilege(r,'public.warehouse_stocktake_order_number_seq','USAGE,SELECT,UPDATE') THEN RAISE EXCEPTION 'Stocktake sequence ACL'; END IF;
  END LOOP;
END;
$test$;
ROLLBACK;
SELECT 'EVIDENCE stocktake contract: existence, forced RLS, owner-only tables/helpers/sequence, service-only command, default false, no grants';
