-- Depends on material-workflow, transfer-workflow and stocktake-workflow.
BEGIN;
DO $test$
DECLARE f public.stage_d2_fixture%ROWTYPE; result jsonb; row_data jsonb; total integer;
BEGIN
  SELECT * INTO STRICT f FROM public.stage_d2_fixture;
  result:=public.list_inventory_transactions(f.tenant_id,f.warehouse_id,NULL,NULL,1,100);
  SELECT count(*) INTO total FROM jsonb_array_elements(result->'items') x WHERE x->>'source_type'='warehouse_stocktake_item';
  IF total<2 THEN RAISE EXCEPTION 'both stocktake directions absent: %',result; END IF;
  FOR row_data IN SELECT value FROM jsonb_array_elements(result->'items') LOOP
    IF row_data->>'source_type'='warehouse_stocktake_item' AND
      (NOT (row_data->'source_document' ?& ARRAY['stocktake_order_id','stocktake_order_no'])
       OR (SELECT count(*) FROM jsonb_object_keys(row_data->'source_document'))<>2
       OR row_data->>'transaction_type' NOT IN ('adjustment_in','adjustment_out')) THEN
      RAISE EXCEPTION 'stocktake source projection mismatch: %',row_data;
    END IF;
  END LOOP;
  result:=public.list_inventory_transactions(f.tenant_id,f.warehouse_id,NULL,NULL,99,1);
  IF result->'items'<>'[]'::jsonb OR (result->>'total')::integer<2 THEN RAISE EXCEPTION 'empty page lost total'; END IF;
  UPDATE public.tenant_supplier_settings SET warehouse_stocktakes_enabled=false WHERE tenant_id=f.tenant_id;
  result:=public.list_inventory_transactions(f.tenant_id,f.warehouse_id,NULL,NULL,1,100);
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(result->'items') x
    WHERE x->>'source_type'='warehouse_stocktake_item' AND x->'source_document'<>'null'::jsonb) THEN
    RAISE EXCEPTION 'disabled flag hid historical source'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(result->'items') x WHERE
    CASE x->>'source_type'
      WHEN 'warehouse_stocktake_item' THEN NOT (x->'source_document' ? 'stocktake_order_id')
      WHEN 'warehouse_transfer_out_item' THEN NOT (x->'source_document' ? 'transfer_order_id')
      WHEN 'warehouse_transfer_in_item' THEN NOT (x->'source_document' ? 'transfer_order_id')
      ELSE false END) THEN RAISE EXCEPTION 'warehouse source regression'; END IF;
END;
$test$;
-- Exercise the actual lateral SQL independently from ledger FK/trigger guards.
DO $guards$
DECLARE f public.stage_d2_fixture%ROWTYPE; definition text; lookup text; source jsonb; forged jsonb; result jsonb; expected jsonb;
BEGIN
  SELECT * INTO STRICT f FROM public.stage_d2_fixture;
  SELECT prosrc INTO STRICT definition FROM pg_proc
    WHERE oid='public.list_inventory_transactions(uuid,uuid,uuid,text,integer,integer)'::regprocedure;
  IF regexp_count(definition,'LEFT JOIN LATERAL \(')<>1 THEN RAISE EXCEPTION 'stocktake lookup extraction drifted'; END IF;
  lookup:='WITH page_rows AS (SELECT * FROM jsonb_to_record($1) AS r(tenant_id uuid,source_type text,transaction_type text,
    source_id uuid,warehouse_id uuid,supplier_sku_id uuid,project_id uuid)) SELECT source_document.document FROM page_rows LEFT JOIN LATERAL ('||
    split_part(split_part(definition,'LEFT JOIN LATERAL (',2),'  ) AS source_document ON true',1)||') AS source_document ON true';
  SELECT jsonb_build_object('tenant_id',i.tenant_id,'source_id',i.id,'warehouse_id',i.warehouse_id,
    'supplier_sku_id',i.supplier_sku_id,'source_type','warehouse_stocktake_item',
    'transaction_type',CASE WHEN i.difference_quantity>0 THEN 'adjustment_in' ELSE 'adjustment_out' END),
    jsonb_build_object('stocktake_order_id',o.id,'stocktake_order_no',o.order_no)
    INTO STRICT source,expected FROM public.warehouse_stocktake_order_items i
    JOIN public.warehouse_stocktake_orders o ON o.id=i.stocktake_order_id AND o.tenant_id=i.tenant_id
    WHERE o.tenant_id=f.tenant_id AND o.status='completed' AND i.difference_quantity<>0 LIMIT 1;
  EXECUTE lookup INTO result USING source;
  IF result IS DISTINCT FROM expected THEN RAISE EXCEPTION 'exact stocktake binding failed: %, %',result,expected; END IF;
  FOR forged IN SELECT source||patch FROM (VALUES
    (jsonb_build_object('tenant_id',gen_random_uuid())),(jsonb_build_object('source_id',gen_random_uuid())),
    (jsonb_build_object('supplier_sku_id',gen_random_uuid())),(jsonb_build_object('warehouse_id',gen_random_uuid())),
    ('{"transaction_type":"purchase_receipt"}'::jsonb),
    (jsonb_build_object('transaction_type',CASE source->>'transaction_type' WHEN 'adjustment_in' THEN 'adjustment_out' ELSE 'adjustment_in' END)),
    ('{"source_type":"legacy_adjustment"}'::jsonb)) probes(patch) LOOP
    EXECUTE lookup INTO result USING forged;
    IF result IS NOT NULL THEN RAISE EXCEPTION 'forged stocktake source resolved: %',forged; END IF;
  END LOOP;
  UPDATE public.tenant_supplier_settings SET warehouse_stocktakes_enabled=true WHERE tenant_id=f.tenant_id;
  DECLARE
    unfinished_id uuid:=public.stage_d2_prepare(f.second_sku_id,
      ((SELECT quantity_on_hand FROM public.inventory_balances WHERE tenant_id=f.tenant_id
        AND warehouse_id=f.warehouse_id AND supplier_sku_id=f.second_sku_id)+1)::text);
  BEGIN
    SELECT jsonb_build_object('tenant_id',i.tenant_id,'source_id',i.id,'warehouse_id',i.warehouse_id,
      'supplier_sku_id',i.supplier_sku_id,'source_type','warehouse_stocktake_item','transaction_type','adjustment_in')
      INTO STRICT source FROM public.warehouse_stocktake_order_items i WHERE i.stocktake_order_id=unfinished_id;
  END;
  EXECUTE lookup INTO result USING source;
  IF result IS NOT NULL THEN RAISE EXCEPTION 'unfinished stocktake resolved'; END IF;
END;
$guards$;
CREATE TEMP TABLE stocktake_inventory_plans(label text,page_size integer,plan jsonb);
DO $plans$
DECLARE f public.stage_d2_fixture%ROWTYPE; definition text; query text; plan jsonb; result jsonb;
  label text; page_size integer; page_number integer; token text; ordinal integer; order_id uuid; quantity numeric;
  replacements text[]:=ARRAY['p_tenant_id','p_warehouse_id','p_supplier_sku_id','p_transaction_type','v_offset','v_page_size'];
BEGIN
  SELECT * INTO STRICT f FROM public.stage_d2_fixture;
  UPDATE public.tenant_supplier_settings SET warehouse_stocktakes_enabled=true WHERE tenant_id=f.tenant_id;
  -- Real commands create enough completed facts to fill every measured page.
  FOR ordinal IN 1..110 LOOP
    SELECT quantity_on_hand INTO STRICT quantity FROM public.inventory_balances WHERE tenant_id=f.tenant_id
      AND warehouse_id=f.warehouse_id AND supplier_sku_id=f.second_sku_id;
    order_id:=public.stage_d2_prepare(f.second_sku_id,(quantity+CASE WHEN ordinal%2=0 THEN 1 ELSE -1 END)::text);
    PERFORM public.stage_d2_command(order_id,'complete',4);
  END LOOP;
  ANALYZE public.inventory_transactions;
  ANALYZE public.warehouse_stocktake_orders;
  ANALYZE public.warehouse_stocktake_order_items;
  SELECT prosrc INTO STRICT definition FROM pg_proc WHERE oid='public.list_inventory_transactions(uuid,uuid,uuid,text,integer,integer)'::regprocedure;
  query:=substring(definition FROM 'WITH filtered AS NOT MATERIALIZED[\s\S]*GROUP BY counted.total;');
  IF query IS NULL OR regexp_count(definition,'INTO v_total, v_items')<>1 THEN RAISE EXCEPTION 'actual inventory query extraction drifted'; END IF;
  query:=replace(query,'INTO v_total, v_items','');
  FOR ordinal IN 1..array_length(replacements,1) LOOP token:=replacements[ordinal]; query:=regexp_replace(query,'\m'||token||'\M','$'||ordinal,'g'); END LOOP;
  EXECUTE 'PREPARE stocktake_inventory_page(uuid,uuid,uuid,text,integer,integer) AS '||query;
  FOREACH label IN ARRAY ARRAY['page-1','page-20','page-100','empty-20'] LOOP
    page_size:=CASE label WHEN 'page-1' THEN 1 WHEN 'page-100' THEN 100 ELSE 20 END;
    page_number:=CASE label WHEN 'empty-20' THEN 1000 ELSE 1 END;
    result:=public.list_inventory_transactions(f.tenant_id,f.warehouse_id,NULL,NULL,page_number,page_size);
    IF jsonb_array_length(result->'items')<>(CASE WHEN label='empty-20' THEN 0 ELSE page_size END) THEN
      RAISE EXCEPTION 'stocktake plan page not filled: %, %',label,result; END IF;
    EXECUTE format('EXPLAIN(ANALYZE,FORMAT JSON) EXECUTE stocktake_inventory_page(%L,%L,NULL,NULL,%s,%s)',
      f.tenant_id,f.warehouse_id,(page_number-1)*page_size,page_size) INTO plan;
    INSERT INTO stocktake_inventory_plans VALUES(label,jsonb_array_length(result->'items'),plan);
  END LOOP;
  DEALLOCATE stocktake_inventory_page;
END;
$plans$;
DO $bounds$
DECLARE bad jsonb;
BEGIN
  WITH RECURSIVE nodes(label,page_size,node) AS(
    SELECT label,page_size,plan->0->'Plan' FROM stocktake_inventory_plans UNION ALL
    SELECT n.label,n.page_size,c.value FROM nodes n CROSS JOIN LATERAL jsonb_array_elements(coalesce(n.node->'Plans','[]')) c
  ), touched AS(
    SELECT label,page_size,node->>'Relation Name' relation,sum(((node->>'Actual Rows')::numeric+
      coalesce((node->>'Rows Removed by Filter')::numeric,0))*(node->>'Actual Loops')::numeric) rows
    FROM nodes WHERE node->>'Relation Name' IN ('warehouse_stocktake_orders','warehouse_stocktake_order_items')
    GROUP BY label,page_size,node->>'Relation Name')
  -- The plan has two stocktake order nodes (existing UNION arms can each expose
  -- the relation); both remain linearly bounded by the materialized page.
  SELECT jsonb_agg(to_jsonb(touched)) INTO bad FROM touched WHERE rows>page_size*2;
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'stocktake lookup exceeded materialized page: %',bad; END IF;
END;
$bounds$;
ROLLBACK;
SELECT 'EVIDENCE stocktake inventory sources: exact gain/loss projection, forged tenant/source/SKU/warehouse/type/direction and unfinished guards, pagination total/empty page, historical visibility after disable, transfer regression, actual SQL page-bounded lookup at 1/20/100/empty';
