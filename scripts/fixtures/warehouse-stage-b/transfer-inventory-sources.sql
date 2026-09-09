-- Run after material-workflow.sql, transfer-contract.sql and transfer-workflow.sql
-- in the existing disposable offline runner. All extra facts below roll back.
BEGIN;
DO $sources$
DECLARE f public.stage_d_transfer_fixture%ROWTYPE; row jsonb; result jsonb; before_close jsonb;
  expected jsonb; direction text; warehouse uuid; foreign_tenant uuid:=gen_random_uuid();
  draft_id uuid:=gen_random_uuid(); draft_item uuid:=gen_random_uuid();
  financial_before jsonb; count_before bigint; transaction_before bigint;
BEGIN
  SELECT * INTO STRICT f FROM public.stage_d_transfer_fixture;
  financial_before:=public.stage_d_transfer_financial_snapshot(f.tenant_id);
  SELECT count(*) INTO count_before FROM public.warehouse_transfer_command_events;
  SELECT count(*) INTO transaction_before FROM public.inventory_transactions;
  FOREACH direction IN ARRAY ARRAY['transfer_out','transfer_in'] LOOP
    result:=public.list_inventory_transactions(f.tenant_id,NULL,NULL,direction,1,100);
    IF result->>'total'<>'5' OR jsonb_array_length(result->'items')<>5 THEN
      RAISE EXCEPTION 'Transfer direction filter/count failed: %',result;
    END IF;
    FOR row IN SELECT value FROM jsonb_array_elements(result->'items') LOOP
      SELECT jsonb_build_object('transfer_order_id',o.id,'transfer_order_no',o.order_no,
        'source_warehouse_id',o.source_warehouse_id,'destination_warehouse_id',o.destination_warehouse_id)
        INTO STRICT expected FROM public.warehouse_transfer_order_items item
        JOIN public.warehouse_transfer_orders o ON o.id=item.transfer_order_id AND o.tenant_id=item.tenant_id
        WHERE item.id=(row->>'source_id')::uuid AND item.tenant_id=f.tenant_id AND o.status='completed';
      warehouse:=(expected->>CASE direction WHEN 'transfer_out' THEN 'source_warehouse_id' ELSE 'destination_warehouse_id' END)::uuid;
      IF row->'source_document' IS DISTINCT FROM expected OR (row->>'warehouse_id')::uuid<>warehouse
        OR row->>'source_type'<>'warehouse_'||direction||'_item'
        OR jsonb_typeof(row->'quantity_delta')<>'string' OR jsonb_typeof(row->'value_delta')<>'string' THEN
        RAISE EXCEPTION 'Transfer source incomplete or wrong direction: %',row;
      END IF;
    END LOOP;
    warehouse:=CASE direction WHEN 'transfer_out' THEN f.source_warehouse_id ELSE f.destination_warehouse_id END;
    result:=public.list_inventory_transactions(f.tenant_id,warehouse,f.sku_id,direction,1,1);
    IF result->>'total'<>'2' OR result->>'page_size'<>'1' OR jsonb_array_length(result->'items')<>1 THEN
      RAISE EXCEPTION 'Warehouse/SKU/type pagination failed: %',result;
    END IF;
    row:=result->'items'->0;
    result:=public.list_inventory_transactions(f.tenant_id,warehouse,f.sku_id,direction,2,1);
    IF result->>'total'<>'2' OR result->'items'->0->>'id'=row->>'id' THEN
      RAISE EXCEPTION 'Stable pagination repeated a transfer: %',result;
    END IF;
    result:=public.list_inventory_transactions(f.tenant_id,warehouse,f.sku_id,direction,3,1);
    IF result->>'total'<>'2' OR result->'items'<>'[]'::jsonb THEN
      RAISE EXCEPTION 'Empty transfer page lost exact total: %',result;
    END IF;
  END LOOP;
  -- Closing the write gate retains existing historical inventory sources.
  before_close:=public.list_inventory_transactions(f.tenant_id,NULL,NULL,NULL,1,100);
  UPDATE public.tenant_supplier_settings SET warehouse_transfers_enabled=false WHERE tenant_id=f.tenant_id;
  IF public.list_inventory_transactions(f.tenant_id,NULL,NULL,NULL,1,100) IS DISTINCT FROM before_close THEN
    RAISE EXCEPTION 'Closed transfer flag hid history';
  END IF;
  -- Existing issue/return links remain complete; the synthetic receipt source
  -- deliberately has no upstream receipt and must remain unresolved/null.
  FOR direction IN SELECT unnest(ARRAY['purchase_receipt','project_issue','project_return']) LOOP
    result:=public.list_inventory_transactions(f.tenant_id,NULL,f.sku_id,direction,1,100);
    IF (result->>'total')::integer=0 OR EXISTS(SELECT 1 FROM jsonb_array_elements(result->'items') r
      WHERE CASE direction WHEN 'purchase_receipt' THEN r->'source_document'<>'null'::jsonb
        WHEN 'project_issue' THEN NOT (r->'source_document' ?& ARRAY['issue_order_id','issue_order_no'])
        ELSE NOT (r->'source_document' ?& ARRAY['return_order_id','return_order_no','issue_order_id','issue_order_no']) END) THEN
      RAISE EXCEPTION 'Existing material/receipt source contract changed: %',result;
    END IF;
  END LOOP;
  INSERT INTO public.tenants(id,name,slug) VALUES(foreign_tenant,'Transfer foreign tenant','transfer-foreign-tenant');
  result:=public.list_inventory_transactions(foreign_tenant,f.source_warehouse_id,f.sku_id,'transfer_out',1,20);
  IF result->>'total'<>'0' OR result->'items'<>'[]'::jsonb THEN RAISE EXCEPTION 'Transfer tenant isolation failed'; END IF;
  IF public.stage_d_transfer_financial_snapshot(f.tenant_id) IS DISTINCT FROM financial_before
    OR (SELECT count(*) FROM public.warehouse_transfer_command_events)<>count_before
    OR (SELECT count(*) FROM public.inventory_transactions)<>transaction_before THEN
    RAISE EXCEPTION 'Inventory reads changed financial, command or stock facts';
  END IF;
  -- Owner-only adversarial synthetic setup: an unfinished order must not resolve.
  INSERT INTO public.warehouse_transfer_orders(id,tenant_id,source_warehouse_id,destination_warehouse_id,reason,
    created_by_employee_id,updated_by_employee_id)
    VALUES(draft_id,f.tenant_id,f.source_warehouse_id,f.destination_warehouse_id,'Unfinished source',f.actor_employee_id,f.actor_employee_id);
  INSERT INTO public.warehouse_transfer_order_items(id,tenant_id,transfer_order_id,source_warehouse_id,destination_warehouse_id,
    line_no,supplier_sku_id,quantity) VALUES(draft_item,f.tenant_id,draft_id,f.source_warehouse_id,f.destination_warehouse_id,1,f.sku_id,1);
  INSERT INTO public.inventory_transactions(tenant_id,warehouse_id,supplier_sku_id,transaction_type,quantity_delta,
    unit_cost,value_delta,source_type,source_id,warehouse_transfer_out_item_id,occurred_at,created_by_employee_id)
    VALUES(f.tenant_id,f.source_warehouse_id,f.sku_id,'transfer_out',-1,0,0,'warehouse_transfer_out_item',draft_item,draft_item,'2040-01-01',f.actor_employee_id);
  result:=public.list_inventory_transactions(f.tenant_id,NULL,NULL,'transfer_out',1,1);
  IF result->'items'->0->'source_document' IS DISTINCT FROM 'null'::jsonb THEN RAISE EXCEPTION 'Unfinished transfer resolved'; END IF;
END;
$sources$;
-- Probe the actual lateral lookup with forged page input so the SQL guards are
-- exercised independently of the inventory table's protective composite FKs.
DO $guards$
DECLARE f public.stage_d_transfer_fixture%ROWTYPE; definition text; lookup text; source jsonb; forged jsonb; result jsonb;
BEGIN
  SELECT * INTO STRICT f FROM public.stage_d_transfer_fixture;
  SELECT prosrc INTO STRICT definition FROM pg_proc
    WHERE oid='public.list_inventory_transactions(uuid,uuid,uuid,text,integer,integer)'::regprocedure;
  IF regexp_count(definition,'LEFT JOIN LATERAL \(')<>1 THEN RAISE EXCEPTION 'Source lookup extraction anchor drifted'; END IF;
  lookup:='WITH page_rows AS (SELECT * FROM jsonb_to_record($1) AS r(tenant_id uuid,source_type text,transaction_type text,
    source_id uuid,warehouse_id uuid,supplier_sku_id uuid,project_id uuid)) SELECT source_document.document FROM page_rows LEFT JOIN LATERAL ('||
    split_part(split_part(definition,'LEFT JOIN LATERAL (',2),'  ) AS source_document ON true',1)||') AS source_document ON true';
  SELECT jsonb_build_object('tenant_id',item.tenant_id,'source_id',item.id,'warehouse_id',item.source_warehouse_id,
    'supplier_sku_id',item.supplier_sku_id,'source_type','warehouse_transfer_out_item','transaction_type','transfer_out')
    INTO STRICT source FROM public.warehouse_transfer_order_items item WHERE item.transfer_order_id=f.completed_order_id;
  EXECUTE lookup INTO result USING source;
  IF result->>'transfer_order_id' IS DISTINCT FROM f.completed_order_id::text THEN RAISE EXCEPTION 'Actual transfer source probe failed'; END IF;
  FOR forged IN SELECT source||patch FROM (VALUES
    (jsonb_build_object('tenant_id',gen_random_uuid())),(jsonb_build_object('source_id',gen_random_uuid())),
    (jsonb_build_object('supplier_sku_id',f.second_sku_id)),(jsonb_build_object('warehouse_id',f.destination_warehouse_id)),
    ('{"transaction_type":"transfer_in"}'::jsonb),('{"source_type":"warehouse_transfer_in_item"}'::jsonb),
    ('{"transaction_type":"purchase_receipt"}'::jsonb)) probes(patch) LOOP
    EXECUTE lookup INTO result USING forged;
    IF result IS NOT NULL THEN RAISE EXCEPTION 'Forged tenant/source/SKU/warehouse/direction resolved: %',forged; END IF;
  END LOOP;
END;
$guards$;
CREATE TEMP TABLE transfer_inventory_plans(label text,page_size integer,plan jsonb);
DO $plans$
DECLARE f public.stage_d_transfer_fixture%ROWTYPE; definition text; query text; plan jsonb; result jsonb;
  label text; kind text; page_size integer; page_number integer; token text; ordinal integer;
  replacements text[]:=ARRAY['p_tenant_id','p_warehouse_id','p_supplier_sku_id','p_transaction_type','v_offset','v_page_size'];
BEGIN
  SELECT * INTO STRICT f FROM public.stage_d_transfer_fixture;
  -- 10,000 unrelated document rows expose accidental whole-table source joins.
  INSERT INTO public.warehouse_transfer_orders(tenant_id,source_warehouse_id,destination_warehouse_id,reason,
    created_by_employee_id,updated_by_employee_id)
    SELECT f.tenant_id,f.source_warehouse_id,f.destination_warehouse_id,'Inventory source load',f.actor_employee_id,f.actor_employee_id
    FROM generate_series(1,10000);
  INSERT INTO public.warehouse_transfer_order_items(tenant_id,transfer_order_id,source_warehouse_id,destination_warehouse_id,
    line_no,supplier_sku_id,quantity)
    SELECT o.tenant_id,o.id,o.source_warehouse_id,o.destination_warehouse_id,1,f.sku_id,1
      FROM public.warehouse_transfer_orders o WHERE o.tenant_id=f.tenant_id AND o.reason='Inventory source load';
  UPDATE public.warehouse_transfer_orders SET status='completed',submitted_at=now(),completed_at=now()
    WHERE id IN (SELECT id FROM public.warehouse_transfer_orders WHERE reason='Inventory source load' ORDER BY id LIMIT 200);
  -- Explicit synthetic read load; atomic transfer command accounting is already
  -- exercised by transfer-workflow.sql, and is not inferred from these rows.
  INSERT INTO public.inventory_transactions(tenant_id,warehouse_id,supplier_sku_id,transaction_type,quantity_delta,
    unit_cost,value_delta,source_type,source_id,warehouse_transfer_out_item_id,warehouse_transfer_in_item_id,occurred_at,created_by_employee_id)
    SELECT item.tenant_id,CASE direction WHEN 'out' THEN item.source_warehouse_id ELSE item.destination_warehouse_id END,
      item.supplier_sku_id,'transfer_'||direction,CASE direction WHEN 'out' THEN -1 ELSE 1 END,0,0,
      'warehouse_transfer_'||direction||'_item',item.id,CASE WHEN direction='out' THEN item.id END,
      CASE WHEN direction='in' THEN item.id END,'2035-01-01',f.actor_employee_id
      FROM public.warehouse_transfer_order_items item
      JOIN public.warehouse_transfer_orders o ON o.id=item.transfer_order_id AND o.tenant_id=item.tenant_id
      CROSS JOIN unnest(ARRAY['out','in']) direction WHERE o.reason='Inventory source load' AND o.status='completed';
  ANALYZE public.inventory_transactions;
  ANALYZE public.warehouse_transfer_orders;
  ANALYZE public.warehouse_transfer_order_items;
  SELECT prosrc INTO STRICT definition FROM pg_proc
    WHERE oid='public.list_inventory_transactions(uuid,uuid,uuid,text,integer,integer)'::regprocedure;
  IF regexp_count(definition,'WITH filtered AS NOT MATERIALIZED')<>1
    OR regexp_count(definition,'GROUP BY counted.total;')<>1
    OR regexp_count(definition,'INTO v_total, v_items')<>1 THEN
    RAISE EXCEPTION 'Transfer inventory actual-query extraction anchors drifted';
  END IF;
  query:=substring(definition FROM 'WITH filtered AS NOT MATERIALIZED[\s\S]*GROUP BY counted.total;');
  query:=replace(query,'INTO v_total, v_items','');
  FOR ordinal IN 1..array_length(replacements,1) LOOP
    token:=replacements[ordinal]; query:=regexp_replace(query,'\m'||token||'\M','$'||ordinal,'g');
  END LOOP;
  EXECUTE 'PREPARE transfer_inventory_page(uuid,uuid,uuid,text,integer,integer) AS '||query;
  PERFORM set_config('plan_cache_mode','force_custom_plan',true);
  FOREACH label IN ARRAY ARRAY['out-1','in-20','mixed-100','empty-20'] LOOP
    kind:=CASE WHEN label='out-1' THEN 'transfer_out' WHEN label='in-20' THEN 'transfer_in' END;
    page_size:=CASE WHEN label='out-1' THEN 1 WHEN label='mixed-100' THEN 100 ELSE 20 END;
    page_number:=CASE WHEN label='empty-20' THEN 1000 ELSE 1 END;
    result:=public.list_inventory_transactions(f.tenant_id,NULL,f.sku_id,kind,page_number,page_size);
    IF jsonb_array_length(result->'items')<>(CASE WHEN label='empty-20' THEN 0 ELSE page_size END) THEN
      RAISE EXCEPTION 'Transfer source load did not fill requested page: %',label;
    END IF;
    EXECUTE format('EXPLAIN(ANALYZE,BUFFERS,FORMAT JSON) EXECUTE transfer_inventory_page(%L,NULL,%L,%L,%s,%s)',
      f.tenant_id,f.sku_id,kind,(page_number-1)*page_size,page_size) INTO plan;
    INSERT INTO transfer_inventory_plans VALUES(label,CASE WHEN label='empty-20' THEN 0 ELSE page_size END,plan);
  END LOOP;
  DEALLOCATE transfer_inventory_page;
  IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid='public.list_inventory_transactions(uuid,uuid,uuid,text,integer,integer)'::regprocedure
      AND 'plan_cache_mode=force_custom_plan'=ANY(proconfig) AND prosecdef)
    OR has_function_privilege('authenticated','public.list_inventory_transactions(uuid,uuid,uuid,text,integer,integer)','EXECUTE')
    OR has_function_privilege('anon','public.list_inventory_transactions(uuid,uuid,uuid,text,integer,integer)','EXECUTE')
    OR NOT has_function_privilege('service_role','public.list_inventory_transactions(uuid,uuid,uuid,text,integer,integer)','EXECUTE') THEN
    RAISE EXCEPTION 'Inventory function configuration/ACL changed';
  END IF;
END;
$plans$;
WITH RECURSIVE nodes(label,node) AS(
  SELECT label,plan->0->'Plan' FROM transfer_inventory_plans UNION ALL
  SELECT n.label,c.value FROM nodes n CROSS JOIN LATERAL jsonb_array_elements(coalesce(n.node->'Plans','[]')) c
) SELECT 'EVIDENCE transfer inventory plan '||label||': '||jsonb_build_object('node',node->>'Node Type',
  'relation',node->>'Relation Name','index',node->>'Index Name','actual_rows',node->'Actual Rows',
  'loops',node->'Actual Loops','removed',node->'Rows Removed by Filter')::text FROM nodes
  WHERE node->>'Relation Name' IN ('warehouse_transfer_orders','warehouse_transfer_order_items');
DO $bounds$
DECLARE bad jsonb;
BEGIN
  WITH RECURSIVE nodes(label,page_size,node) AS(
    SELECT label,page_size,plan->0->'Plan' FROM transfer_inventory_plans UNION ALL
    SELECT n.label,n.page_size,c.value FROM nodes n CROSS JOIN LATERAL jsonb_array_elements(coalesce(n.node->'Plans','[]')) c
  ), touched AS(
    SELECT label,page_size,node->>'Relation Name' relation,sum(
      ((node->>'Actual Rows')::numeric+coalesce((node->>'Rows Removed by Filter')::numeric,0)
        +coalesce((node->>'Rows Removed by Index Recheck')::numeric,0))*(node->>'Actual Loops')::numeric) rows
    FROM nodes WHERE node->>'Relation Name' IN ('warehouse_transfer_orders','warehouse_transfer_order_items')
    GROUP BY label,page_size,node->>'Relation Name'
  ) SELECT jsonb_agg(to_jsonb(touched)) INTO bad FROM touched WHERE rows>page_size;
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'Transfer source lookup exceeded materialized page bound: %',bad; END IF;
END;
$bounds$;
ROLLBACK;
SELECT 'EVIDENCE transfer inventory sources: both directions, strict complete links, warehouse/SKU/type filters, stable pagination and empty totals, closed-flag history, old source compatibility, tenant isolation, unfinished source null, no financial/stock/command writes';
SELECT 'EVIDENCE transfer inventory performance: actual RPC SQL, 10000 extra orders/items and 400 facts, source lookups bounded by 1/20/100 rows and zero on empty page, service-only ACL and force_custom_plan preserved';
