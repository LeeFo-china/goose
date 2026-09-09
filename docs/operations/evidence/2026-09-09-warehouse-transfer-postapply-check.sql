BEGIN READ ONLY;
SET LOCAL statement_timeout = '15s';
SELECT jsonb_build_object(
  'orders', (SELECT count(*) FROM public.warehouse_transfer_orders),
  'items', (SELECT count(*) FROM public.warehouse_transfer_order_items),
  'events', (SELECT count(*) FROM public.warehouse_transfer_command_events),
  'enabled_tenants', (SELECT count(*) FROM public.tenant_supplier_settings WHERE warehouse_transfers_enabled),
  'rls', (SELECT jsonb_agg(jsonb_build_object('table',relname,'enabled',relrowsecurity,'forced',relforcerowsecurity))
    FROM pg_class WHERE oid IN ('public.warehouse_transfer_orders'::regclass,'public.warehouse_transfer_order_items'::regclass,'public.warehouse_transfer_command_events'::regclass)),
  'rpc_acl', (SELECT jsonb_agg(jsonb_build_object('function',proname,
    'anon',has_function_privilege('anon',oid,'EXECUTE'),
    'authenticated',has_function_privilege('authenticated',oid,'EXECUTE'),
    'service_role',has_function_privilege('service_role',oid,'EXECUTE')))
    FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN (
      'command_warehouse_transfer_order','get_warehouse_transfer_order','list_warehouse_transfer_orders',
      'list_warehouse_transfer_order_items','get_warehouse_transfer_settings'))
);
COMMIT;
