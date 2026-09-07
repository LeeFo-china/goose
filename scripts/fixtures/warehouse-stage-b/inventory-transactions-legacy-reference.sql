-- Offline oracle only. Frozen f4bc4fac query body (foundation + source-document
-- patch), renamed and SECURITY INVOKER; never install this as a migration.
-- Used for exact old/new JSON comparison, including source joins and decimals.
CREATE OR REPLACE FUNCTION public.stage_b_reference_list_inventory_transactions(
  p_tenant_id uuid,
  p_warehouse_id uuid,
  p_supplier_sku_id uuid,
  p_transaction_type text,
  p_page integer,
  p_page_size integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_page integer := greatest(p_page, 1);
  v_page_size integer := least(greatest(p_page_size, 1), 100);
  v_offset integer := (v_page - 1) * v_page_size;
  v_total integer;
  v_items jsonb;
BEGIN
  WITH filtered AS MATERIALIZED (
    SELECT
      transaction.id,
      transaction.tenant_id,
      transaction.warehouse_id,
      warehouse.name AS warehouse_name,
      transaction.supplier_sku_id,
      supplier_sku.sku_code,
      supplier_sku.name AS sku_name,
      transaction.transaction_type,
      transaction.quantity_delta,
      transaction.unit_cost,
      transaction.value_delta,
      transaction.source_type,
      transaction.source_id,
      transaction.project_id,
      transaction.cost_category_id,
      transaction.occurred_at,
      transaction.created_by_employee_id,
      employee.name AS created_by_employee_name,
      transaction.created_at
    FROM public.inventory_transactions AS transaction
    JOIN public.warehouses AS warehouse
      ON warehouse.id = transaction.warehouse_id
      AND warehouse.tenant_id = transaction.tenant_id
    JOIN public.supplier_skus AS supplier_sku
      ON supplier_sku.id = transaction.supplier_sku_id
    JOIN public.employees AS employee
      ON employee.id = transaction.created_by_employee_id
      AND employee.tenant_id = transaction.tenant_id
    WHERE transaction.tenant_id = p_tenant_id
      AND (p_warehouse_id IS NULL OR transaction.warehouse_id = p_warehouse_id)
      AND (
        p_supplier_sku_id IS NULL
        OR transaction.supplier_sku_id = p_supplier_sku_id
      )
      AND (
        p_transaction_type IS NULL
        OR transaction.transaction_type = p_transaction_type
      )
  ),
  counted AS MATERIALIZED (
    SELECT COUNT(*)::integer AS total
    FROM filtered
  ),
  page_rows AS MATERIALIZED (
    SELECT *
    FROM filtered
    ORDER BY occurred_at DESC, id DESC
    OFFSET v_offset
    LIMIT v_page_size
  )
  SELECT
    counted.total,
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', page_rows.id,
          'tenant_id', page_rows.tenant_id,
          'warehouse_id', page_rows.warehouse_id,
          'warehouse_name', page_rows.warehouse_name,
          'supplier_sku_id', page_rows.supplier_sku_id,
          'sku_code', page_rows.sku_code,
          'sku_name', page_rows.sku_name,
          'transaction_type', page_rows.transaction_type,
          'quantity_delta', page_rows.quantity_delta::text,
          'unit_cost', page_rows.unit_cost::text,
          'value_delta', page_rows.value_delta::text,
          'source_type', page_rows.source_type,
          'source_id', page_rows.source_id,
          'source_document', source_document.document,
          'project_id', page_rows.project_id,
          'cost_category_id', page_rows.cost_category_id,
          'occurred_at', page_rows.occurred_at,
          'created_by_employee_id', page_rows.created_by_employee_id,
          'created_by_employee_name', page_rows.created_by_employee_name,
          'created_at', page_rows.created_at
        )
        ORDER BY page_rows.occurred_at DESC, page_rows.id DESC
      ) FILTER (WHERE page_rows.id IS NOT NULL),
      '[]'::jsonb
    )
  INTO v_total, v_items
  FROM counted
  LEFT JOIN page_rows ON true
  -- The page is at most 100 rows. Every lookup uses an existing primary key;
  -- no document join participates in the full filtered/count scans.
  LEFT JOIN LATERAL (
    SELECT jsonb_build_object(
      'receipt_id',receipt.id, 'receipt_no',receipt.receipt_no,
      'purchase_order_id',purchase_order.id, 'order_no',purchase_order.order_no
    ) AS document
    FROM public.supplier_purchase_order_receipt_items AS receipt_item
    JOIN public.supplier_purchase_order_receipts AS receipt
      ON receipt.id=receipt_item.receipt_id AND receipt.tenant_id=receipt_item.tenant_id
      AND receipt.supplier_purchase_order_id=receipt_item.supplier_purchase_order_id
    JOIN public.supplier_purchase_orders AS purchase_order
      ON purchase_order.id=receipt_item.supplier_purchase_order_id
      AND purchase_order.tenant_id=receipt_item.tenant_id
      AND purchase_order.destination_type='warehouse' AND purchase_order.project_id IS NULL
      AND purchase_order.warehouse_id=page_rows.warehouse_id
    JOIN public.supplier_purchase_order_items AS order_item
      ON order_item.id=receipt_item.supplier_purchase_order_item_id
      AND order_item.tenant_id=receipt_item.tenant_id
      AND order_item.supplier_purchase_order_id=purchase_order.id
      AND order_item.supplier_sku_id=page_rows.supplier_sku_id
    WHERE page_rows.transaction_type='purchase_receipt'
      AND page_rows.source_type='supplier_purchase_receipt_item'
      AND receipt_item.id=page_rows.source_id AND receipt_item.tenant_id=page_rows.tenant_id
      AND receipt_item.accepted_quantity>0
  ) AS source_document ON true
  GROUP BY counted.total;

  RETURN jsonb_build_object(
    'items', COALESCE(v_items, '[]'::jsonb),
    'total', COALESCE(v_total, 0),
    'page', v_page,
    'page_size', v_page_size
  );
END;
$$;

REVOKE ALL ON FUNCTION public.stage_b_reference_list_inventory_transactions(uuid,uuid,uuid,text,integer,integer) FROM PUBLIC;
