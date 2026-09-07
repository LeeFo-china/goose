-- Offline read-load probe. Run AFTER receipt-weighted-cost.sql in the same
-- disposable runner. Its real v2 product/receipt is the sole seed dependency.
-- Bulk inventory below is synthetic READ load, not proof of receipt writes.
BEGIN;
CREATE TEMP TABLE stage_b_perf_skus AS
  SELECT gen_random_uuid() AS id, ordinal
  FROM generate_series(1,1000) AS ordinal;
CREATE TEMP TABLE stage_b_perf_warehouses AS
  SELECT gen_random_uuid() AS id, ordinal
  FROM generate_series(1,10) AS ordinal;
DO $seed$
DECLARE f public.stage_b_weighted_cost_fixture%ROWTYPE;
BEGIN
  SELECT * INTO STRICT f FROM public.stage_b_weighted_cost_fixture WHERE ordinal=1;
  INSERT INTO public.supplier_skus(id,supplier_id,supplier_product_id,sku_code,name,
    purchase_unit_id,base_unit_id,base_unit_conversion,status,acting_tenant_id,
    acting_employee_id,operation_source,proxy_reason,created_by_employee_id,
    updated_by_employee_id,ownership_scope,owner_tenant_id,spec_values)
  SELECT seed.id,sku.supplier_id,sku.supplier_product_id,'TS-'||upper(replace(seed.id::text,'-','')),
    'Read load SKU '||seed.ordinal,sku.purchase_unit_id,sku.base_unit_id,sku.base_unit_conversion,
    sku.status,sku.acting_tenant_id,sku.acting_employee_id,sku.operation_source,
    sku.proxy_reason,sku.created_by_employee_id,sku.updated_by_employee_id,
    sku.ownership_scope,sku.owner_tenant_id,sku.spec_values
  FROM public.supplier_skus sku CROSS JOIN stage_b_perf_skus seed WHERE sku.id=f.sku_id;
  INSERT INTO public.warehouses(id,tenant_id,name)
    SELECT id,f.tenant_id,'Read load warehouse '||ordinal FROM stage_b_perf_warehouses;
  INSERT INTO public.inventory_balances(tenant_id,warehouse_id,supplier_sku_id,
    quantity_on_hand,inventory_value,average_unit_cost,updated_at)
  SELECT f.tenant_id,w.id,s.id,10,100,10,
    '2026-09-01T00:00:00Z'::timestamptz+s.ordinal*interval '1 minute'
  FROM stage_b_perf_warehouses w CROSS JOIN stage_b_perf_skus s;
  INSERT INTO public.inventory_transactions(tenant_id,warehouse_id,supplier_sku_id,
    transaction_type,quantity_delta,unit_cost,value_delta,source_type,source_id,
    occurred_at,created_by_employee_id)
  SELECT f.tenant_id,w.id,s.id,'purchase_receipt',1,10,10,
    'supplier_purchase_receipt_item',gen_random_uuid(),
    '2026-09-01T00:00:00Z'::timestamptz+(s.ordinal*10+n)*interval '1 minute',f.actor_employee_id
  FROM stage_b_perf_warehouses w CROSS JOIN stage_b_perf_skus s CROSS JOIN generate_series(1,10) n;
END;
$seed$;
ANALYZE public.inventory_balances;
ANALYZE public.inventory_transactions;
ANALYZE public.warehouses;
ANALYZE public.supplier_skus;
ANALYZE public.employees;
ANALYZE public.supplier_purchase_order_receipt_items;
ANALYZE public.supplier_purchase_order_receipts;
ANALYZE public.supplier_purchase_orders;
ANALYZE public.supplier_purchase_order_items;

CREATE TEMP TABLE stage_b_perf_evidence(label text PRIMARY KEY,payload jsonb);
CREATE FUNCTION pg_temp.stage_b_probe_inventory(
  probe_label text,kind text,warehouse_filter uuid,sku_filter uuid,keyword_filter text,
  page_number integer,page_size integer,expected_total integer
) RETURNS void LANGUAGE plpgsql AS $probe$
DECLARE
  tenant uuid; definition text; query_text text; rpc_result jsonb;
  query_total integer; query_items jsonb; plan jsonb; function_name regprocedure;
  replacements text[]; token text; offset_value integer:=(greatest(page_number,1)-1)*least(greatest(page_size,1),100);
  started timestamptz; rpc_ms numeric;
BEGIN
  SELECT tenant_id INTO STRICT tenant FROM public.stage_b_weighted_cost_fixture WHERE ordinal=1;
  IF kind='balances' THEN
    function_name:='public.list_inventory_balances(uuid,uuid,text,integer,integer)'::regprocedure;
  ELSIF kind='transactions' THEN
    function_name:='public.list_inventory_transactions(uuid,uuid,uuid,text,integer,integer)'::regprocedure;
  ELSE
    RAISE EXCEPTION 'Unknown inventory probe kind';
  END IF;
  SELECT prosrc INTO STRICT definition FROM pg_proc WHERE oid=function_name;
  IF (length(definition)-length(replace(definition,'WITH filtered AS MATERIALIZED','')))/length('WITH filtered AS MATERIALIZED')<>1
    OR (length(definition)-length(replace(definition,'GROUP BY counted.total;','')))/length('GROUP BY counted.total;')<>1
    OR (length(definition)-length(replace(definition,'INTO v_total, v_items','')))/length('INTO v_total, v_items')<>1 THEN
    RAISE EXCEPTION 'Inventory query extraction anchors drifted';
  END IF;
  query_text:=substring(definition FROM 'WITH filtered AS MATERIALIZED[\s\S]*GROUP BY counted.total;');
  query_text:=replace(query_text,'INTO v_total, v_items','');
  -- Substitute only complete PL/pgSQL identifiers, retaining the exact active
  -- CTE/JOIN/order/source SQL. Bind all values, never interpolate query values.
  replacements:=ARRAY['p_tenant_id','p_warehouse_id','p_supplier_sku_id','v_keyword','v_offset','v_page_size','p_transaction_type'];
  FOR index IN 1..array_length(replacements,1) LOOP
    token:=replacements[index];
    query_text:=regexp_replace(query_text,'\m'||token||'\M','$'||index,'g');
  END LOOP;
  started:=clock_timestamp();
  IF kind='balances' THEN
    rpc_result:=public.list_inventory_balances(tenant,warehouse_filter,keyword_filter,page_number,page_size);
  ELSE
    rpc_result:=public.list_inventory_transactions(tenant,warehouse_filter,sku_filter,NULL,page_number,page_size);
  END IF;
  rpc_ms:=extract(epoch FROM clock_timestamp()-started)*1000;
  EXECUTE query_text INTO query_total,query_items USING tenant,warehouse_filter,sku_filter,
    NULLIF(btrim(keyword_filter),''),offset_value,least(greatest(page_size,1),100),NULL::text;
  IF (rpc_result->>'total')::integer IS DISTINCT FROM expected_total
    OR query_total IS DISTINCT FROM expected_total
    OR query_items IS DISTINCT FROM rpc_result->'items'
    OR jsonb_array_length(query_items) IS DISTINCT FROM least(least(greatest(page_size,1),100),greatest(expected_total-offset_value,0)) THEN
    RAISE EXCEPTION 'Inventory read/extracted query mismatch: %',probe_label;
  END IF;
  EXECUTE 'EXPLAIN (ANALYZE,BUFFERS,VERBOSE,SETTINGS,FORMAT JSON) '||query_text INTO plan
    USING tenant,warehouse_filter,sku_filter,NULLIF(btrim(keyword_filter),''),offset_value,
      least(greatest(page_size,1),100),NULL::text;
  INSERT INTO stage_b_perf_evidence VALUES(probe_label,jsonb_build_object(
    'kind',kind,'function_md5',md5(definition),'page',page_number,'page_size',page_size,
    'warehouse_filter',warehouse_filter IS NOT NULL,'sku_filter',sku_filter IS NOT NULL,
    'keyword',keyword_filter,'expected_total',expected_total,'rpc_ms',rpc_ms,
    'plan',plan,'scope','synthetic read load; not full source-table scale or production SLA'));
END;
$probe$;

SELECT pg_temp.stage_b_probe_inventory('balances-tenant','balances',NULL,NULL,NULL,1,20,10001);
SELECT pg_temp.stage_b_probe_inventory('balances-warehouse','balances',(SELECT id FROM stage_b_perf_warehouses WHERE ordinal=1),NULL,NULL,1,100,1000);
SELECT pg_temp.stage_b_probe_inventory('balances-keyword','balances',NULL,NULL,'Read load SKU 1000',1,20,10);
SELECT pg_temp.stage_b_probe_inventory('balances-no-match','balances',NULL,NULL,'no-such-read-load-item',1,20,0);
SELECT pg_temp.stage_b_probe_inventory('balances-deep-page','balances',NULL,NULL,NULL,400,20,10001);
SELECT pg_temp.stage_b_probe_inventory('balances-out-of-range','balances',NULL,NULL,NULL,1000,20,10001);
SELECT pg_temp.stage_b_probe_inventory('transactions-tenant','transactions',NULL,NULL,NULL,1,20,100003);
SELECT pg_temp.stage_b_probe_inventory('transactions-warehouse','transactions',(SELECT id FROM stage_b_perf_warehouses WHERE ordinal=1),NULL,NULL,1,100,10000);
SELECT pg_temp.stage_b_probe_inventory('transactions-sku','transactions',NULL,(SELECT id FROM stage_b_perf_skus WHERE ordinal=1),NULL,1,100,100);
SELECT pg_temp.stage_b_probe_inventory('transactions-warehouse-sku','transactions',(SELECT id FROM stage_b_perf_warehouses WHERE ordinal=1),(SELECT id FROM stage_b_perf_skus WHERE ordinal=1),NULL,1,20,10);
SELECT pg_temp.stage_b_probe_inventory('transactions-out-of-range','transactions',NULL,NULL,NULL,10000,20,100003);
-- Prefix is deliberately machine-readable; only synthetic probe data is emitted.
SELECT 'EVIDENCE '||jsonb_build_object('label',label,'result',payload)::text
FROM stage_b_perf_evidence ORDER BY label;
ROLLBACK;
