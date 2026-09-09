-- Extract and EXPLAIN the RPC's actual page/aggregation SQL, not a hand-written
-- cheaper approximation. Synthetic volume and all results are rolled back.
BEGIN;
CREATE TEMP TABLE transfer_read_plans(label text,plan jsonb);
DO $$
DECLARE f public.stage_d_transfer_fixture%ROWTYPE; v_query text; v_plan jsonb; v_label text; v_source text; v_destination text;
BEGIN
  SELECT * INTO STRICT f FROM public.stage_d_transfer_fixture;
  INSERT INTO public.warehouse_transfer_orders(tenant_id,source_warehouse_id,destination_warehouse_id,reason,created_by_employee_id,updated_by_employee_id,created_at)
    SELECT f.tenant_id,CASE WHEN n<=1000 THEN f.source_warehouse_id ELSE f.destination_warehouse_id END,
      CASE WHEN n<=1000 THEN f.destination_warehouse_id ELSE f.source_warehouse_id END,'Read performance',f.actor_employee_id,f.actor_employee_id,
      '2030-01-01'::timestamptz+n*interval '1 second' FROM generate_series(1,10000) n;
  INSERT INTO public.warehouse_transfer_order_items(tenant_id,transfer_order_id,source_warehouse_id,destination_warehouse_id,line_no,supplier_sku_id,quantity)
    SELECT o.tenant_id,o.id,o.source_warehouse_id,o.destination_warehouse_id,s.n,s.sku,1
      FROM public.warehouse_transfer_orders o CROSS JOIN (VALUES(1,f.sku_id),(2,f.second_sku_id)) s(n,sku)
      WHERE o.tenant_id=f.tenant_id AND o.reason='Read performance';
  ANALYZE public.warehouse_transfer_orders;
  ANALYZE public.warehouse_transfer_order_items;
  FOREACH v_label IN ARRAY ARRAY['tenant','source-no-status','destination-no-status','source-status'] LOOP
    v_query:='WITH page AS MATERIALIZED('||split_part(split_part(pg_get_functiondef(
      'public.list_warehouse_transfer_orders(uuid,uuid,uuid,uuid,uuid,text,text,integer,integer)'::regprocedure),'WITH page AS MATERIALIZED(',2),';',1);
    v_query:=replace(v_query,'INTO v_items','');
    v_source:=CASE WHEN v_label LIKE 'source%' THEN quote_literal(f.source_warehouse_id)||'::uuid' ELSE 'NULL::uuid' END;
    v_destination:=CASE WHEN v_label LIKE 'destination%' THEN quote_literal(f.destination_warehouse_id)||'::uuid' ELSE 'NULL::uuid' END;
    v_query:=replace(replace(replace(replace(replace(replace(replace(replace(v_query,
      'p_tenant_id',quote_literal(f.tenant_id)||'::uuid'),'p_source_warehouse_id',v_source),'p_destination_warehouse_id',v_destination),
      'p_status',CASE WHEN v_label='source-status' THEN '''draft''::text' ELSE 'NULL::text' END),
      'p_keyword','NULL::text'),'p_page_size','20'),'p_page','1'),'INTO v_items','');
    EXECUTE 'EXPLAIN(ANALYZE,BUFFERS,FORMAT JSON) '||v_query INTO v_plan;
    INSERT INTO transfer_read_plans VALUES(v_label,v_plan);
  END LOOP;
  -- PL/pgSQL can switch to a generic cached plan after repeated calls. Test
  -- that possible mode unless this RPC explicitly opts into custom planning.
  v_query:='WITH page AS MATERIALIZED('||split_part(split_part(pg_get_functiondef(
    'public.list_warehouse_transfer_orders(uuid,uuid,uuid,uuid,uuid,text,text,integer,integer)'::regprocedure),'WITH page AS MATERIALIZED(',2),';',1);
  v_query:=replace(replace(replace(replace(replace(replace(replace(replace(v_query,
    'p_tenant_id','$1'),'p_source_warehouse_id','$2'),'p_destination_warehouse_id','$3'),'p_status','$4'),
    'p_keyword','$5'),'p_page_size','$6'),'p_page','$7'),'INTO v_items','');
  EXECUTE 'PREPARE transfer_cached_page(uuid,uuid,uuid,text,text,integer,integer) AS '||v_query;
  PERFORM set_config('plan_cache_mode',CASE WHEN EXISTS(SELECT 1 FROM pg_proc
    WHERE oid='public.list_warehouse_transfer_orders(uuid,uuid,uuid,uuid,uuid,text,text,integer,integer)'::regprocedure
      AND 'plan_cache_mode=force_custom_plan'=ANY(proconfig)) THEN 'force_custom_plan' ELSE 'force_generic_plan' END,true);
  EXECUTE format('EXPLAIN(ANALYZE,BUFFERS,FORMAT JSON) EXECUTE transfer_cached_page(%L,%L,NULL,NULL,NULL,20,1)',f.tenant_id,f.source_warehouse_id) INTO v_plan;
  INSERT INTO transfer_read_plans VALUES('cached-source',v_plan);
  DEALLOCATE transfer_cached_page;
  PERFORM set_config('plan_cache_mode','auto',true);
END;
$$;
-- Print evidence before assertions so any failed boundary includes its cause.
WITH RECURSIVE nodes(label,node) AS(
  SELECT label,plan->0->'Plan' FROM transfer_read_plans UNION ALL
  SELECT n.label,c.value FROM nodes n CROSS JOIN LATERAL jsonb_array_elements(coalesce(n.node->'Plans','[]')) c
) SELECT 'EVIDENCE transfer plan '||label||': '||jsonb_build_object('node',node->>'Node Type','relation',node->>'Relation Name',
  'index',node->>'Index Name','actual_rows',node->'Actual Rows','loops',node->'Actual Loops','removed',node->'Rows Removed by Filter')::text
  FROM nodes WHERE node->>'Relation Name' IN ('warehouse_transfer_orders','warehouse_transfer_order_items');
DO $$
DECLARE v_bad jsonb;
BEGIN
  WITH RECURSIVE nodes(label,node) AS(
    SELECT label,plan->0->'Plan' FROM transfer_read_plans UNION ALL
    SELECT n.label,c.value FROM nodes n CROSS JOIN LATERAL jsonb_array_elements(coalesce(n.node->'Plans','[]')) c
  ) SELECT jsonb_agg(jsonb_build_object('label',label,'node',node)) INTO v_bad FROM nodes
    WHERE (node->>'Relation Name'='warehouse_transfer_order_items'
      AND ((node->>'Actual Rows')::numeric+coalesce((node->>'Rows Removed by Filter')::numeric,0)
        +coalesce((node->>'Rows Removed by Index Recheck')::numeric,0))*(node->>'Actual Loops')::numeric>40)
      OR(node->>'Relation Name'='warehouse_transfer_orders'
        AND ((node->>'Actual Rows')::numeric+coalesce((node->>'Rows Removed by Filter')::numeric,0)
          +coalesce((node->>'Rows Removed by Index Recheck')::numeric,0))*(node->>'Actual Loops')::numeric>1000);
  IF v_bad IS NOT NULL THEN RAISE EXCEPTION 'Transfer page access exceeded bounds: %',v_bad; END IF;
END;
$$;
ROLLBACK;
SELECT 'EVIDENCE transfer read performance: actual RPC page SQL, 10000 extra orders / 20000 items, four filters plus cached prepared query, at most 40 item rows accessed per 20-order page';
