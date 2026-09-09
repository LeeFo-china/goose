-- Page-bounded stocktake source projection. No historical fact is updated.
-- Forward rollback: replace the RPC in a new migration without this branch;
-- retain all immutable inventory and stocktake facts.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='1min';

DO $stocktake_inventory_sources$
DECLARE
  target regprocedure:='public.list_inventory_transactions(uuid,uuid,uuid,text,integer,integer)'::regprocedure;
  definition text:=pg_get_functiondef(target);
  anchor text:='  ) AS source_document ON true';
  addition text;
  original_acl aclitem[];
  original_config text[];
BEGIN
  SELECT proacl,proconfig INTO STRICT original_acl,original_config FROM pg_proc WHERE oid=target;
  IF (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1
    OR strpos(definition,'  page_rows AS MATERIALIZED (')=0
    OR strpos(definition,'  LEFT JOIN page_rows ON true')<=strpos(definition,'  page_rows AS MATERIALIZED (')
    OR strpos(definition,anchor)<=strpos(definition,'  LEFT JOIN page_rows ON true')
    OR strpos(definition,'warehouse_stocktake_order_items')<>0
    OR ('plan_cache_mode=force_custom_plan'=ANY(original_config)) IS DISTINCT FROM true THEN
    RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='WAREHOUSE_STOCKTAKE_INVENTORY_SOURCE_PATCH_MISMATCH';
  END IF;
  addition:=$sources$
    UNION ALL
    SELECT jsonb_build_object('stocktake_order_id',o.id,'stocktake_order_no',o.order_no)
    FROM public.warehouse_stocktake_order_items item
    JOIN public.warehouse_stocktake_orders o ON o.id=item.stocktake_order_id
      AND o.tenant_id=item.tenant_id AND o.warehouse_id=item.warehouse_id
    WHERE page_rows.source_type='warehouse_stocktake_item'
      AND page_rows.transaction_type=CASE WHEN item.difference_quantity>0 THEN 'adjustment_in' ELSE 'adjustment_out' END
      AND item.difference_quantity<>0 AND item.id=page_rows.source_id
      AND item.tenant_id=page_rows.tenant_id AND item.warehouse_id=page_rows.warehouse_id
      AND item.supplier_sku_id=page_rows.supplier_sku_id AND o.status='completed'
$sources$;
  EXECUTE replace(definition,anchor,addition||anchor);
  IF EXISTS(SELECT 1 FROM pg_proc WHERE oid=target AND
    (proacl IS DISTINCT FROM original_acl OR proconfig IS DISTINCT FROM original_config)) THEN
    RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='WAREHOUSE_STOCKTAKE_INVENTORY_SOURCE_METADATA_CHANGED';
  END IF;
END;
$stocktake_inventory_sources$;

NOTIFY pgrst,'reload schema';
COMMIT;
