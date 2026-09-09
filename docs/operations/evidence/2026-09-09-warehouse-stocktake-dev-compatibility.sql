BEGIN READ ONLY; SET LOCAL statement_timeout='15s'; SET LOCAL lock_timeout='3s';
WITH definition AS(SELECT pg_get_functiondef('public.__gooes_set_supplier_rollout_settings_v2(jsonb,uuid,text)'::regprocedure) AS text),
anchors(id,text) AS(VALUES (1,'  v_warehouse_transfers_enabled boolean := (p_request ->> ''warehouse_transfers_enabled'')::boolean;'),(2,'''warehouse_transfers_enabled'', ''expected_version'''),(3,'''warehouse_materials_enabled'', ''warehouse_transfers_enabled'']) AS flags(flag)'),(4,'  IF NOT (v_request ? ''warehouse_transfers_enabled'') THEN'),(5,'warehouse_materials_enabled, warehouse_transfers_enabled,'),(6,'v_warehouse_materials_enabled, v_warehouse_transfers_enabled,'),(7,'      warehouse_transfers_enabled = v_warehouse_transfers_enabled,')),
inventory AS(SELECT pg_get_functiondef(oid) AS text,proconfig FROM pg_proc WHERE oid='public.list_inventory_transactions(uuid,uuid,uuid,text,integer,integer)'::regprocedure)
SELECT jsonb_build_object('checked_at',clock_timestamp(),'readonly',current_setting('transaction_read_only'),
'rollout_anchor_counts',(SELECT jsonb_agg(jsonb_build_object('anchor',a.id,'count',(length(d.text)-length(replace(d.text,a.text,'')))/length(a.text)) ORDER BY a.id) FROM definition d CROSS JOIN anchors a),
'inventory_anchor_count',(SELECT (length(text)-length(replace(text,'  ) AS source_document ON true','')))/length('  ) AS source_document ON true') FROM inventory),
'inventory_materialized_page',(SELECT strpos(text,'  page_rows AS MATERIALIZED (')>0 AND strpos(text,'  LEFT JOIN page_rows ON true')>strpos(text,'  page_rows AS MATERIALIZED (') AND strpos(text,'warehouse_stocktake_order_items')=0 AND 'plan_cache_mode=force_custom_plan'=ANY(proconfig) FROM inventory),
'stocktake_objects',(SELECT count(*) FROM pg_class WHERE relnamespace='public'::regnamespace AND relname IN('warehouse_stocktake_orders','warehouse_stocktake_order_items','warehouse_stocktake_command_events')),
'stocktake_permissions',(SELECT count(*) FROM permissions WHERE code IN('inventory.stocktake.manage','inventory.stocktake.approve')),
'lock_waiters',(SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock'),
'long_transactions',(SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND xact_start<now()-interval '5 minutes'),
'business_facts',(SELECT jsonb_object_agg(name,jsonb_build_object('count',n,'md5',digest)) FROM(
SELECT 'project_cost_events' name,count(*) n,md5(coalesce(string_agg(to_jsonb(t)::text,'' ORDER BY id),'')) digest FROM public.project_cost_events t WHERE tenant_id='3eebca47-961f-4899-b976-a3d3208d326b'
UNION ALL
SELECT 'supplier_payable_events' name,count(*) n,md5(coalesce(string_agg(to_jsonb(t)::text,'' ORDER BY id),'')) digest FROM public.supplier_payable_events t WHERE tenant_id='3eebca47-961f-4899-b976-a3d3208d326b'
UNION ALL
SELECT 'supplier_payments' name,count(*) n,md5(coalesce(string_agg(to_jsonb(t)::text,'' ORDER BY id),'')) digest FROM public.supplier_payments t WHERE tenant_id='3eebca47-961f-4899-b976-a3d3208d326b'
UNION ALL
SELECT 'finance_ledger_entries' name,count(*) n,md5(coalesce(string_agg(to_jsonb(t)::text,'' ORDER BY id),'')) digest FROM public.finance_ledger_entries t WHERE tenant_id='3eebca47-961f-4899-b976-a3d3208d326b'
UNION ALL
SELECT 'warehouses' name,count(*) n,md5(coalesce(string_agg(to_jsonb(t)::text,'' ORDER BY id),'')) digest FROM public.warehouses t WHERE tenant_id='3eebca47-961f-4899-b976-a3d3208d326b'
UNION ALL
SELECT 'warehouse_issue_orders' name,count(*) n,md5(coalesce(string_agg(to_jsonb(t)::text,'' ORDER BY id),'')) digest FROM public.warehouse_issue_orders t WHERE tenant_id='3eebca47-961f-4899-b976-a3d3208d326b'
UNION ALL
SELECT 'warehouse_return_orders' name,count(*) n,md5(coalesce(string_agg(to_jsonb(t)::text,'' ORDER BY id),'')) digest FROM public.warehouse_return_orders t WHERE tenant_id='3eebca47-961f-4899-b976-a3d3208d326b'
UNION ALL
SELECT 'warehouse_transfer_orders' name,count(*) n,md5(coalesce(string_agg(to_jsonb(t)::text,'' ORDER BY id),'')) digest FROM public.warehouse_transfer_orders t WHERE tenant_id='3eebca47-961f-4899-b976-a3d3208d326b'
UNION ALL
SELECT 'supplier_command_events' name,count(*) n,md5(coalesce(string_agg(to_jsonb(t)::text,'' ORDER BY id),'')) digest FROM public.supplier_command_events t WHERE tenant_id='3eebca47-961f-4899-b976-a3d3208d326b'
) facts),
'other_role_permissions',(SELECT jsonb_build_object('count',count(*),'md5',md5(coalesce(string_agg(to_jsonb(rp)::text,'' ORDER BY rp.role_id,rp.permission_id),''))) FROM role_permissions rp JOIN permissions p ON p.id=rp.permission_id WHERE NOT(rp.role_id='e72850fe-dbba-427f-9109-f1779080a239' AND p.code IN('inventory.stocktake.manage','inventory.stocktake.approve'))),
'employee_roles',(SELECT jsonb_build_object('count',count(*),'md5',md5(coalesce(string_agg(to_jsonb(e)::text,'' ORDER BY employee_id,role_id),''))) FROM employee_roles e),
'employee_overrides',(SELECT jsonb_build_object('count',count(*),'md5',md5(coalesce(string_agg(to_jsonb(e)::text,'' ORDER BY id),''))) FROM employee_permission_overrides e)
); COMMIT;
