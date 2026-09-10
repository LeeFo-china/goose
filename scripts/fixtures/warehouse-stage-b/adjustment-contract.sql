BEGIN;
DO $$
DECLARE t text; r text; signature text:='public.command_warehouse_adjustment_order(uuid,uuid,text,integer,jsonb,uuid,uuid,text)';
BEGIN
  FOREACH t IN ARRAY ARRAY['warehouse_adjustment_orders','warehouse_adjustment_order_items','warehouse_adjustment_command_events'] LOOP
    IF to_regclass('public.'||t) IS NULL THEN RAISE EXCEPTION 'Stage D2.2 missing table: %',t; END IF;
    IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=to_regclass('public.'||t) AND relrowsecurity AND relforcerowsecurity) THEN RAISE EXCEPTION 'Adjustment forced RLS missing'; END IF;
    FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
      IF has_table_privilege(r,'public.'||t,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN RAISE EXCEPTION 'Adjustment direct table privilege'; END IF;
    END LOOP;
  END LOOP;
  IF to_regprocedure(signature) IS NULL THEN RAISE EXCEPTION 'Adjustment command missing'; END IF;
  IF has_function_privilege('anon',signature,'EXECUTE') OR has_function_privilege('authenticated',signature,'EXECUTE') OR NOT has_function_privilege('service_role',signature,'EXECUTE') THEN RAISE EXCEPTION 'Adjustment command ACL'; END IF;
  IF EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE '__gooes_adjustment_%' AND (has_function_privilege('anon',oid,'EXECUTE') OR has_function_privilege('authenticated',oid,'EXECUTE') OR has_function_privilege('service_role',oid,'EXECUTE'))) THEN RAISE EXCEPTION 'Adjustment helper ACL'; END IF;
  IF (SELECT count(*) FROM public.permissions WHERE code IN ('inventory.adjustment.manage','inventory.adjustment.approve') AND module='inventory' AND resource='adjustment' AND status='active')<>2 OR EXISTS(SELECT 1 FROM public.role_permissions r JOIN public.permissions p ON p.id=r.permission_id WHERE p.code LIKE 'inventory.adjustment.%') OR EXISTS(SELECT 1 FROM public.employee_permission_overrides e JOIN public.permissions p ON p.id=e.permission_id WHERE p.code LIKE 'inventory.adjustment.%') THEN RAISE EXCEPTION 'Adjustment permission definitions/grants'; END IF;
  IF NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='tenant_supplier_settings' AND column_name='warehouse_adjustments_enabled' AND column_default='false' AND is_nullable='NO') THEN RAISE EXCEPTION 'Adjustment flag default'; END IF;
  FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
    IF has_sequence_privilege(r,'public.warehouse_adjustment_order_number_seq','USAGE,SELECT,UPDATE') THEN RAISE EXCEPTION 'Adjustment sequence ACL'; END IF;
  END LOOP;
END;
$$;
ROLLBACK;
SELECT 'EVIDENCE adjustment contract: tables, forced RLS, ACL, default disabled, permission definitions only';
