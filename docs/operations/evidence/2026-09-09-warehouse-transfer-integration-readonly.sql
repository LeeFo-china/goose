BEGIN READ ONLY;
SET LOCAL statement_timeout='15s';
SELECT jsonb_build_object(
  'history_count',(SELECT count(*) FROM supabase_migrations.schema_migrations),
  'history_latest',(SELECT max(version) FROM supabase_migrations.schema_migrations),
  'enabled_transfers',(SELECT count(*) FROM public.tenant_supplier_settings WHERE warehouse_transfers_enabled),
  'orders',(SELECT count(*) FROM public.warehouse_transfer_orders),
  'items',(SELECT count(*) FROM public.warehouse_transfer_order_items),
  'commands',(SELECT count(*) FROM public.warehouse_transfer_command_events),
  'supplier_events',(SELECT jsonb_build_object('count',count(*),'md5',md5(coalesce(string_agg(to_jsonb(e)::text,'' ORDER BY id),''))) FROM public.supplier_command_events e),
  'function_metadata',(SELECT jsonb_agg(jsonb_build_object('signature',oid::regprocedure::text,
    'definition_md5',md5(pg_get_functiondef(oid)),'config',proconfig,'security_definer',prosecdef,
    'anon',has_function_privilege('anon',oid,'EXECUTE'),
    'authenticated',has_function_privilege('authenticated',oid,'EXECUTE'),
    'service_role',has_function_privilege('service_role',oid,'EXECUTE')) ORDER BY oid::regprocedure::text)
    FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN
    ('list_inventory_transactions','set_tenant_supplier_rollout_settings','__gooes_set_supplier_rollout_settings_v2'))
);
COMMIT;
