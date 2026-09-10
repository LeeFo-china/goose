-- DEV deployment read-only evidence, tenant scoped business hashes; no business writes.
-- Execute inside BEGIN READ ONLY, with statement_timeout=15s and lock_timeout=3s.
SELECT jsonb_build_object(
'checked_at',clock_timestamp(),'readonly',current_setting('transaction_read_only'),
'migrations',(SELECT count(*) FROM supabase_migrations.schema_migrations),
'latest',(SELECT max(version) FROM supabase_migrations.schema_migrations),
'adjustment_table',to_regclass('public.warehouse_adjustment_orders'),
'adjustment_permissions',(SELECT count(*) FROM public.permissions WHERE code LIKE 'inventory.adjustment.%'),
'adjustment_role_grants',(SELECT count(*) FROM public.role_permissions r JOIN public.permissions p ON p.id=r.permission_id WHERE p.code LIKE 'inventory.adjustment.%'),
'lock_waiters',(SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock'),
'long_transactions',(SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND xact_start<now()-interval '5 minutes'),
'adjustment_enabled_tenants',(SELECT count(*) FROM public.tenant_supplier_settings s WHERE to_jsonb(s)->>'warehouse_adjustments_enabled'='true'),
'settings_legacy_hash',(SELECT md5(coalesce(string_agg((to_jsonb(s)-'warehouse_adjustments_enabled')::text,'' ORDER BY tenant_id),'')) FROM public.tenant_supplier_settings s),
'target_settings',(SELECT to_jsonb(s) FROM public.tenant_supplier_settings s WHERE tenant_id='3eebca47-961f-4899-b976-a3d3208d326b'),
'business_and_authorization',(SELECT jsonb_object_agg(name,jsonb_build_object('count',n,'md5',digest)) FROM(
SELECT 'inventory_balances' name,count(*) n,md5(coalesce(string_agg((to_jsonb(t)-'warehouse_adjustment_item_id')::text,'' ORDER BY id),'')) digest FROM public.inventory_balances t WHERE tenant_id='3eebca47-961f-4899-b976-a3d3208d326b'
UNION ALL
SELECT 'inventory_transactions' name,count(*) n,md5(coalesce(string_agg((to_jsonb(t)-'warehouse_adjustment_item_id')::text,'' ORDER BY id),'')) digest FROM public.inventory_transactions t WHERE tenant_id='3eebca47-961f-4899-b976-a3d3208d326b'
UNION ALL
SELECT 'project_cost_events' name,count(*) n,md5(coalesce(string_agg((to_jsonb(t)-'warehouse_adjustment_item_id')::text,'' ORDER BY id),'')) digest FROM public.project_cost_events t WHERE tenant_id='3eebca47-961f-4899-b976-a3d3208d326b'
UNION ALL
SELECT 'supplier_payable_events' name,count(*) n,md5(coalesce(string_agg((to_jsonb(t)-'warehouse_adjustment_item_id')::text,'' ORDER BY id),'')) digest FROM public.supplier_payable_events t WHERE tenant_id='3eebca47-961f-4899-b976-a3d3208d326b'
UNION ALL
SELECT 'supplier_payments' name,count(*) n,md5(coalesce(string_agg((to_jsonb(t)-'warehouse_adjustment_item_id')::text,'' ORDER BY id),'')) digest FROM public.supplier_payments t WHERE tenant_id='3eebca47-961f-4899-b976-a3d3208d326b'
UNION ALL
SELECT 'finance_ledger_entries' name,count(*) n,md5(coalesce(string_agg((to_jsonb(t)-'warehouse_adjustment_item_id')::text,'' ORDER BY id),'')) digest FROM public.finance_ledger_entries t WHERE tenant_id='3eebca47-961f-4899-b976-a3d3208d326b'
UNION ALL
SELECT 'warehouses' name,count(*) n,md5(coalesce(string_agg((to_jsonb(t)-'warehouse_adjustment_item_id')::text,'' ORDER BY id),'')) digest FROM public.warehouses t WHERE tenant_id='3eebca47-961f-4899-b976-a3d3208d326b'
UNION ALL
SELECT 'warehouse_issue_orders' name,count(*) n,md5(coalesce(string_agg((to_jsonb(t)-'warehouse_adjustment_item_id')::text,'' ORDER BY id),'')) digest FROM public.warehouse_issue_orders t WHERE tenant_id='3eebca47-961f-4899-b976-a3d3208d326b'
UNION ALL
SELECT 'warehouse_return_orders' name,count(*) n,md5(coalesce(string_agg((to_jsonb(t)-'warehouse_adjustment_item_id')::text,'' ORDER BY id),'')) digest FROM public.warehouse_return_orders t WHERE tenant_id='3eebca47-961f-4899-b976-a3d3208d326b'
UNION ALL
SELECT 'warehouse_transfer_orders' name,count(*) n,md5(coalesce(string_agg((to_jsonb(t)-'warehouse_adjustment_item_id')::text,'' ORDER BY id),'')) digest FROM public.warehouse_transfer_orders t WHERE tenant_id='3eebca47-961f-4899-b976-a3d3208d326b'
UNION ALL
SELECT 'warehouse_stocktake_orders' name,count(*) n,md5(coalesce(string_agg((to_jsonb(t)-'warehouse_adjustment_item_id')::text,'' ORDER BY id),'')) digest FROM public.warehouse_stocktake_orders t WHERE tenant_id='3eebca47-961f-4899-b976-a3d3208d326b'
UNION ALL
SELECT 'warehouse_stocktake_order_items' name,count(*) n,md5(coalesce(string_agg((to_jsonb(t)-'warehouse_adjustment_item_id')::text,'' ORDER BY id),'')) digest FROM public.warehouse_stocktake_order_items t WHERE tenant_id='3eebca47-961f-4899-b976-a3d3208d326b'
UNION ALL
SELECT 'warehouse_stocktake_command_events' name,count(*) n,md5(coalesce(string_agg((to_jsonb(t)-'warehouse_adjustment_item_id')::text,'' ORDER BY id),'')) digest FROM public.warehouse_stocktake_command_events t WHERE tenant_id='3eebca47-961f-4899-b976-a3d3208d326b'
UNION ALL
SELECT 'supplier_command_events' name,count(*) n,md5(coalesce(string_agg((to_jsonb(t)-'warehouse_adjustment_item_id')::text,'' ORDER BY id),'')) digest FROM public.supplier_command_events t WHERE tenant_id='3eebca47-961f-4899-b976-a3d3208d326b'
UNION ALL
SELECT 'role_permissions',count(*),md5(coalesce(string_agg(to_jsonb(t)::text,'' ORDER BY role_id,permission_id),'')) FROM public.role_permissions t
UNION ALL
SELECT 'employee_roles',count(*),md5(coalesce(string_agg(to_jsonb(t)::text,'' ORDER BY employee_id,role_id),'')) FROM public.employee_roles t
UNION ALL
SELECT 'employee_permission_overrides',count(*),md5(coalesce(string_agg(to_jsonb(t)::text,'' ORDER BY id),'')) FROM public.employee_permission_overrides t
) facts)
) AS evidence;
