-- Resolve human-readable inventory sources only for the already-paginated rows.
-- No inventory facts change. Rollback is a forward correction of this read RPC.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='5min';

DO $source_document$
DECLARE
  v_definition text := pg_get_functiondef('public.list_inventory_transactions(uuid,uuid,uuid,text,integer,integer)'::regprocedure);
  v_old text; v_new text;
BEGIN
  v_old := '''source_id'', page_rows.source_id,';
  v_new := v_old || E'\n          ''source_document'', source_document.document,';
  IF (length(v_definition)-length(replace(v_definition,v_old,'')))/length(v_old)<>1 THEN
    RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='INVENTORY_SOURCE_READ_PATCH_SOURCE_MISMATCH';
  END IF;
  v_definition := replace(v_definition,v_old,v_new);
  v_old := E'  LEFT JOIN page_rows ON true\n  GROUP BY counted.total;';
  v_new := $patch$  LEFT JOIN page_rows ON true
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
  GROUP BY counted.total;$patch$;
  IF (length(v_definition)-length(replace(v_definition,v_old,'')))/length(v_old)<>1 THEN
    RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='INVENTORY_SOURCE_READ_PATCH_SOURCE_MISMATCH';
  END IF;
  EXECUTE replace(v_definition,v_old,v_new);
END;
$source_document$;

-- CREATE OR REPLACE preserves the existing service-role-only ACL and signature.
NOTIFY pgrst,'reload schema';
COMMIT;
