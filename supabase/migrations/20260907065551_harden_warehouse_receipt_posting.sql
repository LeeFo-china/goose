-- New warehouse receipts require the operational gate; successful exact
-- retries still return frozen results without creating new accounting facts.
-- Rollback: close the gate and apply a reviewed forward fix, never delete facts.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='5min';

CREATE FUNCTION pg_temp.stage_b_receipt_replace(p_source text,p_old text,p_new text)
RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  IF p_old='' OR (length(p_source)-length(replace(p_source,p_old,'')))/length(p_old)<>1 THEN
    RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='WAREHOUSE_RECEIPT_PATCH_SOURCE_MISMATCH',DETAIL=left(p_old,150);
  END IF;
  RETURN replace(p_source,p_old,p_new);
END;
$$;

DO $receipt$
DECLARE v_definition text; v_marker text;
BEGIN
  v_definition := pg_get_functiondef('public.create_supplier_purchase_order_receipt_fulfillment_v2(uuid,uuid,uuid,integer,text,timestamptz,text,jsonb,uuid,uuid,text)'::regprocedure);
  v_marker := E'  PERFORM pg_catalog.pg_advisory_xact_lock(\n    pg_catalog.hashtextextended(\n      ''supplier-purchase-order-id:''';
  v_definition := pg_temp.stage_b_receipt_replace(v_definition,v_marker,
    $locks$  -- Order identity is immutable. Keep the global command key/replay check
  -- first, then settings -> warehouse -> order, matching order submission.
  -- The warehouse lock also serializes balance writes across different orders.
  IF EXISTS(SELECT 1 FROM public.supplier_purchase_orders
    WHERE id=p_order_id AND tenant_id=p_tenant_id AND destination_type='warehouse') THEN
    PERFORM tenant_id FROM public.tenant_supplier_settings
      WHERE tenant_id=p_tenant_id FOR SHARE;
    PERFORM warehouse.id FROM public.warehouses AS warehouse
      JOIN public.supplier_purchase_orders AS purchase_order
        ON purchase_order.warehouse_id=warehouse.id AND purchase_order.tenant_id=warehouse.tenant_id
      WHERE purchase_order.id=p_order_id AND purchase_order.tenant_id=p_tenant_id
        AND purchase_order.destination_type='warehouse' FOR UPDATE OF warehouse;
  END IF;
$locks$ || v_marker);
  EXECUTE v_definition;
  v_definition := pg_get_functiondef('public.create_supplier_purchase_order_receipt(uuid,uuid,uuid,integer,text,timestamptz,text,jsonb,uuid,uuid,text)'::regprocedure);
  v_definition := pg_temp.stage_b_receipt_replace(v_definition,
    '  ELSIF v_order.destination_type = ''warehouse'' THEN',
    '  ELSIF v_order.destination_type = ''warehouse'' THEN
    PERFORM public.assert_warehouse_procurement_destination(
      p_tenant_id,v_order.destination_type,v_order.project_id,v_order.warehouse_id);');
  v_definition := pg_temp.stage_b_receipt_replace(v_definition,
    E'      ''WAREHOUSE_NOT_FOUND'',',
    E'      ''WAREHOUSE_PROCUREMENT_NOT_ENABLED'',\n      ''WAREHOUSE_NOT_FOUND'',');
  EXECUTE v_definition;
END;
$receipt$;

COMMIT;
