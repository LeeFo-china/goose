-- DEV acceptance only. Read-only, tenant/SKU-scoped, bounded detail samples.
-- Pair totals must remain zero; after a forward and reverse transfer, the
-- original warehouse quantity/value must be restored (timestamps may differ).
BEGIN READ ONLY;
SET LOCAL statement_timeout = '15s';
WITH scope AS (
  SELECT '3eebca47-961f-4899-b976-a3d3208d326b'::uuid AS tenant_id,
    '732e2b3b-cb7e-4e40-a4e2-228c22bf985c'::uuid AS sku_id
), transfer_facts AS (
  SELECT t.source_id, t.transaction_type, t.quantity_delta, t.value_delta,
    t.project_id, t.cost_category_id
  FROM public.inventory_transactions t CROSS JOIN scope s
  WHERE t.tenant_id = s.tenant_id AND t.supplier_sku_id = s.sku_id
    AND t.source_type IN ('warehouse_transfer_out_item', 'warehouse_transfer_in_item')
), pairs AS (
  SELECT source_id, count(*) AS fact_count,
    count(*) FILTER (WHERE transaction_type = 'transfer_out') AS out_count,
    count(*) FILTER (WHERE transaction_type = 'transfer_in') AS in_count,
    sum(quantity_delta) AS quantity_net, sum(value_delta) AS value_net,
    bool_or(project_id IS NOT NULL OR cost_category_id IS NOT NULL) AS has_project_cost
  FROM transfer_facts GROUP BY source_id
)
SELECT jsonb_build_object(
  'checked_at', clock_timestamp(),
  'settings', (SELECT jsonb_build_object('module_enabled', t.module_enabled,
    'warehouse_transfers_enabled', t.warehouse_transfers_enabled, 'version', t.version)
    FROM public.tenant_supplier_settings t CROSS JOIN scope s WHERE t.tenant_id = s.tenant_id),
  'warehouses_total', (SELECT count(*) FROM public.warehouses w CROSS JOIN scope s WHERE w.tenant_id = s.tenant_id),
  'warehouses_sample', (SELECT jsonb_agg(to_jsonb(w)) FROM (
    SELECT w.id, w.name, w.status, w.is_default FROM public.warehouses w CROSS JOIN scope s
    WHERE w.tenant_id = s.tenant_id ORDER BY w.id LIMIT 20) w),
  'sku_totals', (SELECT jsonb_build_object('quantity', coalesce(sum(b.quantity_on_hand), 0),
    'value', coalesce(sum(b.inventory_value), 0))
    FROM public.inventory_balances b CROSS JOIN scope s
    WHERE b.tenant_id = s.tenant_id AND b.supplier_sku_id = s.sku_id),
  'sku_balances_sample', (SELECT jsonb_agg(to_jsonb(b)) FROM (
    SELECT b.warehouse_id, b.quantity_on_hand, b.inventory_value, b.average_unit_cost
    FROM public.inventory_balances b CROSS JOIN scope s
    WHERE b.tenant_id = s.tenant_id AND b.supplier_sku_id = s.sku_id ORDER BY b.warehouse_id LIMIT 20) b),
  'orders_total', (SELECT count(*) FROM public.warehouse_transfer_orders o CROSS JOIN scope s WHERE o.tenant_id = s.tenant_id),
  'orders_sample', (SELECT jsonb_agg(to_jsonb(o)) FROM (
    SELECT o.id, o.order_no, o.status, o.version, o.source_warehouse_id, o.destination_warehouse_id,
      o.reason, o.created_by_employee_id, o.completed_at
    FROM public.warehouse_transfer_orders o CROSS JOIN scope s
    WHERE o.tenant_id = s.tenant_id ORDER BY o.created_at DESC, o.id DESC LIMIT 20) o),
  'commands_total', (SELECT count(*) FROM public.warehouse_transfer_command_events e CROSS JOIN scope s WHERE e.tenant_id = s.tenant_id),
  'test_sku_transfer_facts', (SELECT count(*) FROM transfer_facts),
  'test_sku_transfer_pairs', (SELECT count(*) FROM pairs),
  'invalid_pairs', (SELECT count(*) FROM pairs WHERE fact_count <> 2 OR out_count <> 1 OR in_count <> 1
    OR quantity_net <> 0 OR value_net <> 0 OR has_project_cost),
  'unknown_source_types', (SELECT count(*) FROM public.inventory_transactions t CROSS JOIN scope s
    WHERE t.tenant_id = s.tenant_id AND t.source_type NOT IN ('supplier_purchase_receipt_item',
      'warehouse_issue_item', 'warehouse_return_item', 'warehouse_transfer_out_item', 'warehouse_transfer_in_item'))
);
COMMIT;
