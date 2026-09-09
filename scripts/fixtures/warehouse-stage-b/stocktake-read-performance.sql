-- Extract and EXPLAIN the RPC's actual page/aggregation SQL. Synthetic volume
-- and all results are rolled back.
BEGIN;
CREATE TEMP TABLE stocktake_read_plans(label text,plan jsonb);
DO $$
DECLARE f public.stage_d2_fixture%ROWTYPE; v_query text; v_plan jsonb; v_label text; v_warehouse text;
BEGIN
  SELECT * INTO STRICT f FROM public.stage_d2_fixture;
  INSERT INTO public.warehouse_stocktake_orders(tenant_id,warehouse_id,reason,created_by_employee_id,updated_by_employee_id,created_at)
    SELECT f.tenant_id,CASE WHEN n<=1000 THEN f.warehouse_id ELSE f.destination_id END,
      'Read performance',f.actor_employee_id,f.actor_employee_id,'2030-01-01'::timestamptz+n*interval '1 second'
      FROM generate_series(1,10000) n;
  INSERT INTO public.warehouse_stocktake_order_items(tenant_id,stocktake_order_id,warehouse_id,line_no,supplier_sku_id)
    SELECT o.tenant_id,o.id,o.warehouse_id,s.n,s.sku
      FROM public.warehouse_stocktake_orders o CROSS JOIN (VALUES(1,f.sku_id),(2,f.second_sku_id)) s(n,sku)
      WHERE o.tenant_id=f.tenant_id AND o.reason='Read performance';
  ANALYZE public.warehouse_stocktake_orders;
  ANALYZE public.warehouse_stocktake_order_items;
  FOREACH v_label IN ARRAY ARRAY['tenant','warehouse','warehouse-status'] LOOP
    v_query:='WITH page AS MATERIALIZED('||split_part(split_part(pg_get_functiondef(
      'public.list_warehouse_stocktake_orders(uuid,uuid,uuid,uuid,text,text,integer,integer)'::regprocedure),'WITH page AS MATERIALIZED(',2),';',1);
    v_warehouse:=CASE WHEN v_label LIKE 'warehouse%' THEN quote_literal(f.warehouse_id)||'::uuid' ELSE 'NULL::uuid' END;
    v_query:=replace(replace(replace(replace(replace(replace(v_query,
      'p_tenant_id',quote_literal(f.tenant_id)||'::uuid'),'p_warehouse_id',v_warehouse),
      'p_status',CASE WHEN v_label='warehouse-status' THEN '''draft''::text' ELSE 'NULL::text' END),
      'p_keyword','NULL::text'),'p_page_size','20'),'p_page','1');
    v_query:=replace(v_query,'INTO v_items','');
    EXECUTE 'EXPLAIN(ANALYZE,BUFFERS,FORMAT JSON) '||v_query INTO v_plan;
    INSERT INTO stocktake_read_plans VALUES(v_label,v_plan);
  END LOOP;
  v_query:='WITH page AS MATERIALIZED('||split_part(split_part(pg_get_functiondef(
    'public.list_warehouse_stocktake_orders(uuid,uuid,uuid,uuid,text,text,integer,integer)'::regprocedure),'WITH page AS MATERIALIZED(',2),';',1);
  v_query:=replace(replace(replace(replace(replace(replace(v_query,
    'p_tenant_id','$1'),'p_warehouse_id','$2'),'p_status','$3'),'p_keyword','$4'),'p_page_size','$5'),'p_page','$6');
  v_query:=replace(v_query,'INTO v_items','');
  EXECUTE 'PREPARE stocktake_cached_page(uuid,uuid,text,text,integer,integer) AS '||v_query;
  PERFORM set_config('plan_cache_mode',CASE WHEN EXISTS(SELECT 1 FROM pg_proc
    WHERE oid='public.list_warehouse_stocktake_orders(uuid,uuid,uuid,uuid,text,text,integer,integer)'::regprocedure
      AND 'plan_cache_mode=force_custom_plan'=ANY(proconfig)) THEN 'force_custom_plan' ELSE 'force_generic_plan' END,true);
  EXECUTE format('EXPLAIN(ANALYZE,BUFFERS,FORMAT JSON) EXECUTE stocktake_cached_page(%L,%L,NULL,NULL,20,1)',f.tenant_id,f.warehouse_id) INTO v_plan;
  INSERT INTO stocktake_read_plans VALUES('cached-warehouse',v_plan);
  DEALLOCATE stocktake_cached_page;
  PERFORM set_config('plan_cache_mode','auto',true);
END;
$$;
WITH RECURSIVE nodes(label,node) AS(
  SELECT label,plan->0->'Plan' FROM stocktake_read_plans UNION ALL
  SELECT n.label,c.value FROM nodes n CROSS JOIN LATERAL jsonb_array_elements(coalesce(n.node->'Plans','[]')) c
) SELECT 'EVIDENCE stocktake plan '||label||': '||jsonb_build_object('node',node->>'Node Type','relation',node->>'Relation Name',
  'index',node->>'Index Name','actual_rows',node->'Actual Rows','loops',node->'Actual Loops','removed',node->'Rows Removed by Filter')::text
  FROM nodes WHERE node->>'Relation Name' IN ('warehouse_stocktake_orders','warehouse_stocktake_order_items');
DO $$
DECLARE v_bad jsonb;
BEGIN
  WITH RECURSIVE nodes(label,node) AS(
    SELECT label,plan->0->'Plan' FROM stocktake_read_plans UNION ALL
    SELECT n.label,c.value FROM nodes n CROSS JOIN LATERAL jsonb_array_elements(coalesce(n.node->'Plans','[]')) c
  ) SELECT jsonb_agg(jsonb_build_object('label',label,'node',node)) INTO v_bad FROM nodes
    WHERE (node->>'Relation Name'='warehouse_stocktake_order_items'
      AND ((node->>'Actual Rows')::numeric+coalesce((node->>'Rows Removed by Filter')::numeric,0)
        +coalesce((node->>'Rows Removed by Index Recheck')::numeric,0))*(node->>'Actual Loops')::numeric>40)
      OR(node->>'Relation Name'='warehouse_stocktake_orders'
        AND ((node->>'Actual Rows')::numeric+coalesce((node->>'Rows Removed by Filter')::numeric,0)
          +coalesce((node->>'Rows Removed by Index Recheck')::numeric,0))*(node->>'Actual Loops')::numeric>1000);
  IF v_bad IS NOT NULL THEN RAISE EXCEPTION 'Stocktake page access exceeded bounds: %',v_bad; END IF;
END;
$$;
ROLLBACK;
SELECT 'EVIDENCE stocktake read performance: actual RPC page SQL, 10000 extra orders / 20000 items, three filters plus cached query, at most 40 item rows per 20-order page';
