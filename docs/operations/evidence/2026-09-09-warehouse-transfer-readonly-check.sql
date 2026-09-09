-- Run only on the guarded development host. No DDL/DML or configuration writes.
BEGIN READ ONLY;
SET LOCAL statement_timeout='15s';
SELECT jsonb_build_object(
  'checked_at',clock_timestamp(),
  'history_count',(SELECT count(*) FROM supabase_migrations.schema_migrations),
  'history_latest',(SELECT max(version) FROM supabase_migrations.schema_migrations),
  'transfer_objects',(SELECT jsonb_agg(relname ORDER BY relname) FROM pg_class WHERE relnamespace='public'::regnamespace
    AND relname IN ('warehouse_transfer_orders','warehouse_transfer_order_items','warehouse_transfer_command_events')),
  'transfer_permissions',(SELECT count(*) FROM public.permissions WHERE code IN ('inventory.transfer.manage','inventory.transfer.approve')),
  'transfer_role_grants',(SELECT count(*) FROM public.role_permissions rp JOIN public.permissions p ON p.id=rp.permission_id WHERE p.code LIKE 'inventory.transfer.%'),
  'transfer_employee_grants',(SELECT count(*) FROM public.employee_permission_overrides e JOIN public.permissions p ON p.id=e.permission_id WHERE p.code LIKE 'inventory.transfer.%'),
  'source_types',(SELECT jsonb_agg(source_type ORDER BY source_type) FROM (SELECT DISTINCT source_type FROM public.inventory_transactions) s),
  'invalid_existing_sources',(SELECT count(*) FROM public.inventory_transactions WHERE source_type NOT IN
    ('supplier_purchase_receipt_item','warehouse_issue_item','warehouse_return_item')),
  'lock_waiters',(SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock'),
  'long_transactions',(SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND xact_start<now()-interval '5 minutes'),
  'business_facts',(SELECT jsonb_object_agg(name,jsonb_build_object('count',n,'md5',digest)) FROM (
    SELECT 'inventory_transactions' name,count(*) n,md5(coalesce(string_agg((to_jsonb(t)-ARRAY['warehouse_transfer_out_item_id','warehouse_transfer_in_item_id'])::text,'' ORDER BY id),'')) digest
      FROM public.inventory_transactions t
    UNION ALL SELECT 'inventory_balances',count(*),md5(coalesce(string_agg(to_jsonb(t)::text,'' ORDER BY id),'')) FROM public.inventory_balances t
    UNION ALL SELECT 'project_cost_events',count(*),md5(coalesce(string_agg(to_jsonb(t)::text,'' ORDER BY id),'')) FROM public.project_cost_events t
    UNION ALL SELECT 'supplier_payable_events',count(*),md5(coalesce(string_agg(to_jsonb(t)::text,'' ORDER BY id),'')) FROM public.supplier_payable_events t
    UNION ALL SELECT 'supplier_payments',count(*),md5(coalesce(string_agg(to_jsonb(t)::text,'' ORDER BY id),'')) FROM public.supplier_payments t
    UNION ALL SELECT 'finance_ledger_entries',count(*),md5(coalesce(string_agg(to_jsonb(t)::text,'' ORDER BY id),'')) FROM public.finance_ledger_entries t
    UNION ALL SELECT 'warehouses',count(*),md5(coalesce(string_agg(to_jsonb(t)::text,'' ORDER BY id),'')) FROM public.warehouses t
    UNION ALL SELECT 'tenant_supplier_settings',count(*),md5(coalesce(string_agg((to_jsonb(t)-'warehouse_transfers_enabled')::text,'' ORDER BY tenant_id),'')) FROM public.tenant_supplier_settings t
    UNION ALL SELECT 'warehouse_issue_orders',count(*),md5(coalesce(string_agg(to_jsonb(t)::text,'' ORDER BY id),'')) FROM public.warehouse_issue_orders t
    UNION ALL SELECT 'warehouse_return_orders',count(*),md5(coalesce(string_agg(to_jsonb(t)::text,'' ORDER BY id),'')) FROM public.warehouse_return_orders t
  ) facts)
);
COMMIT;
