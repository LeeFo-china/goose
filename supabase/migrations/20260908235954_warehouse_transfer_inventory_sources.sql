-- Read-only, page-bounded transfer source links. Existing facts and historical
-- receipt/issue/return lookup chains are untouched. Forward rollback: use a new
-- migration removing only these two UNION branches; retain all transfer facts.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='1min';

DO $transfer_inventory_sources$
DECLARE
  target regprocedure:='public.list_inventory_transactions(uuid,uuid,uuid,text,integer,integer)'::regprocedure;
  definition text:=pg_get_functiondef(target);
  anchor text:='  ) AS source_document ON true';
  addition text;
  original_acl aclitem[];
  original_config text[];
BEGIN
  SELECT proacl,proconfig INTO STRICT original_acl,original_config FROM pg_proc WHERE oid=target;
  -- Patch only the existing lateral source lookup after the materialized page.
  -- An unexpected definition fails the entire migration before replacement.
  IF (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1
    OR strpos(definition,'  page_rows AS MATERIALIZED (')=0
    OR strpos(definition,'  LEFT JOIN page_rows ON true')<=strpos(definition,'  page_rows AS MATERIALIZED (')
    OR strpos(definition,anchor)<=strpos(definition,'  LEFT JOIN page_rows ON true')
    OR strpos(definition,'warehouse_transfer_order_items')<>0
    OR NOT ('plan_cache_mode=force_custom_plan'=ANY(original_config)) THEN
    RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='WAREHOUSE_TRANSFER_INVENTORY_SOURCE_PATCH_MISMATCH';
  END IF;
  -- The existing RPC has no transaction-type whitelist; its parameter predicate
  -- already accepts both transfer directions. Domain/API enums validate input.
  addition:=$sources$
    UNION ALL
    SELECT jsonb_build_object('transfer_order_id',o.id,'transfer_order_no',o.order_no,
      'source_warehouse_id',o.source_warehouse_id,'destination_warehouse_id',o.destination_warehouse_id)
    FROM public.warehouse_transfer_order_items item
    JOIN public.warehouse_transfer_orders o ON o.id=item.transfer_order_id AND o.tenant_id=item.tenant_id
      AND o.source_warehouse_id=item.source_warehouse_id AND o.destination_warehouse_id=item.destination_warehouse_id
    WHERE page_rows.source_type='warehouse_transfer_out_item' AND page_rows.transaction_type='transfer_out'
      AND item.id=page_rows.source_id AND item.tenant_id=page_rows.tenant_id
      AND item.supplier_sku_id=page_rows.supplier_sku_id AND item.source_warehouse_id=page_rows.warehouse_id
      AND o.status='completed'
    UNION ALL
    SELECT jsonb_build_object('transfer_order_id',o.id,'transfer_order_no',o.order_no,
      'source_warehouse_id',o.source_warehouse_id,'destination_warehouse_id',o.destination_warehouse_id)
    FROM public.warehouse_transfer_order_items item
    JOIN public.warehouse_transfer_orders o ON o.id=item.transfer_order_id AND o.tenant_id=item.tenant_id
      AND o.source_warehouse_id=item.source_warehouse_id AND o.destination_warehouse_id=item.destination_warehouse_id
    WHERE page_rows.source_type='warehouse_transfer_in_item' AND page_rows.transaction_type='transfer_in'
      AND item.id=page_rows.source_id AND item.tenant_id=page_rows.tenant_id
      AND item.supplier_sku_id=page_rows.supplier_sku_id AND item.destination_warehouse_id=page_rows.warehouse_id
      AND o.status='completed'
$sources$;
  EXECUTE replace(definition,anchor,addition||anchor);
  IF EXISTS(SELECT 1 FROM pg_proc WHERE oid=target AND
    (proacl IS DISTINCT FROM original_acl OR proconfig IS DISTINCT FROM original_config)) THEN
    RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='WAREHOUSE_TRANSFER_INVENTORY_SOURCE_METADATA_CHANGED';
  END IF;
END;
$transfer_inventory_sources$;

NOTIFY pgrst,'reload schema';
COMMIT;
