-- Synthetic read load only; requires material-workflow.sql. Every insert rolls back.
BEGIN;
SET LOCAL work_mem='4MB';
CREATE TEMP TABLE material_plan_results(label text,document_type text,total bigint,page_count integer,
  item_rows_visited numeric,execution_ms numeric,definition_md5 text,plan jsonb);
DO $test$
DECLARE
  f public.stage_c_material_fixture%ROWTYPE; i integer; kind text; scenario record;
  warehouses uuid[] := ARRAY[]::uuid[]; projects uuid[] := ARRAY[]::uuid[]; new_id uuid;
  definition text; query text; result jsonb; plan jsonb; item_rows numeric;
  actual_total bigint; actual_items jsonb; warehouse_filter uuid; project_filter uuid;
BEGIN
  SELECT * INTO STRICT f FROM public.stage_c_material_fixture;
  PERFORM set_config('request.jwt.claim.role','service_role',true);
  FOR i IN 1..10 LOOP
    new_id := gen_random_uuid(); warehouses := array_append(warehouses,new_id);
    INSERT INTO public.warehouses(id,tenant_id,name) VALUES(new_id,f.tenant_id,'Performance warehouse '||i);
  END LOOP;
  FOR i IN 1..100 LOOP
    new_id := gen_random_uuid(); projects := array_append(projects,new_id);
    INSERT INTO public.projects(id,tenant_id,name,status) VALUES(new_id,f.tenant_id,'Performance project '||i,'designing');
  END LOOP;
  CREATE TEMP TABLE material_read_seed AS SELECT n,gen_random_uuid() issue_id,gen_random_uuid() issue_item_id,
    gen_random_uuid() return_id,gen_random_uuid() return_item_id,
    warehouses[1+(n%10)] warehouse_id,projects[1+(n%100)] project_id FROM generate_series(1,20000) n;
  INSERT INTO public.warehouse_issue_orders(id,tenant_id,warehouse_id,project_id,status,version,
    created_by_employee_id,updated_by_employee_id,submitted_at,completed_at)
    SELECT issue_id,f.tenant_id,warehouse_id,project_id,'completed',3,f.actor_employee_id,f.actor_employee_id,now(),now()
    FROM material_read_seed;
  INSERT INTO public.warehouse_issue_order_items(id,tenant_id,issue_order_id,warehouse_id,project_id,
    line_no,supplier_sku_id,quantity,cost_category_id,cost_category_name,unit_cost,amount)
    SELECT issue_item_id,f.tenant_id,issue_id,warehouse_id,project_id,1,f.sku_id,1,f.cost_id,'Performance cost',0.07,0.07
    FROM material_read_seed;
  INSERT INTO public.warehouse_return_orders(id,tenant_id,warehouse_id,project_id,original_issue_order_id,status,version,
    created_by_employee_id,updated_by_employee_id,completed_at)
    SELECT return_id,f.tenant_id,warehouse_id,project_id,issue_id,'completed',2,f.actor_employee_id,f.actor_employee_id,now()
    FROM material_read_seed;
  INSERT INTO public.warehouse_return_order_items(id,tenant_id,return_order_id,original_issue_order_id,
    original_issue_item_id,warehouse_id,project_id,line_no,quantity,unit_cost,amount)
    SELECT return_item_id,f.tenant_id,return_id,issue_id,issue_item_id,warehouse_id,project_id,1,1,0.07,0.07
    FROM material_read_seed;
  ANALYZE public.warehouse_issue_orders; ANALYZE public.warehouse_issue_order_items;
  ANALYZE public.warehouse_return_orders; ANALYZE public.warehouse_return_order_items;
  ANALYZE public.projects; ANALYZE public.warehouses;
  SELECT prosrc INTO STRICT definition FROM pg_proc WHERE oid=
    'public.list_warehouse_material_orders(uuid,text,uuid,uuid,uuid,uuid,text,text,integer,integer)'::regprocedure;
  IF regexp_count(definition,'\$query\$')<>2 THEN RAISE EXCEPTION 'RPC extraction guard failed'; END IF;
  FOREACH kind IN ARRAY ARRAY['issue','return'] LOOP
    query := format(split_part(definition,'$query$',2),
      'warehouse_'||kind||'_orders',kind||'_order_id','warehouse_'||kind||'_order_items',
      kind||'_order_id',kind||'_order_id','warehouse_'||kind||'_orders');
    FOR scenario IN SELECT * FROM (VALUES
      ('first',1,false,false,NULL::text),('deep',500,false,false,NULL::text),
      ('empty',2000,false,false,NULL::text),('warehouse',1,true,false,NULL::text),
      ('warehouse-status',1,true,false,'completed'),('project',1,false,true,NULL::text)
    ) cases(label,page,filter_warehouse,filter_project,status) LOOP
      warehouse_filter := CASE WHEN scenario.filter_warehouse THEN warehouses[1] ELSE NULL END;
      project_filter := CASE WHEN scenario.filter_project THEN projects[1] ELSE NULL END;
      result := public.list_warehouse_material_orders(f.tenant_id,kind,f.actor_user_id,f.actor_employee_id,
        warehouse_filter,project_filter,scenario.status,NULL,scenario.page,20);
      EXECUTE query INTO actual_total,actual_items USING f.tenant_id,warehouse_filter,project_filter,scenario.status,
        f.actor_employee_id,NULL::text,20,(scenario.page::bigint-1)*20,kind;
      IF actual_total IS DISTINCT FROM (result->>'total')::bigint OR actual_items IS DISTINCT FROM result->'items'
        OR jsonb_array_length(actual_items)<>least(20,greatest(actual_total-(scenario.page::bigint-1)*20,0)) THEN
        RAISE EXCEPTION 'RPC/query mismatch or wrong page length';
      END IF;
      IF EXISTS(SELECT 1 FROM jsonb_array_elements(actual_items) document
        JOIN material_read_seed seed ON (document->>'id')::uuid=CASE kind WHEN 'issue' THEN seed.issue_id ELSE seed.return_id END
        WHERE document->>'item_count' IS DISTINCT FROM '1' OR document->>'total_amount' IS DISTINCT FROM '0.07') THEN
        RAISE EXCEPTION 'Seeded page omitted or corrupted item totals';
      END IF;
      EXECUTE 'EXPLAIN (ANALYZE,BUFFERS,VERBOSE,SETTINGS,FORMAT JSON) '||query INTO plan
        USING f.tenant_id,warehouse_filter,project_filter,scenario.status,f.actor_employee_id,NULL::text,
        20,(scenario.page::bigint-1)*20,kind;
      WITH RECURSIVE nodes(node) AS (
        SELECT plan->0->'Plan' UNION ALL
        SELECT child FROM nodes CROSS JOIN LATERAL jsonb_array_elements(COALESCE(node->'Plans','[]')) child
      ) SELECT COALESCE(sum(((node->>'Actual Rows')::numeric+
          COALESCE((node->>'Rows Removed by Filter')::numeric,0)+
          COALESCE((node->>'Rows Removed by Index Recheck')::numeric,0))*(node->>'Actual Loops')::numeric),0)
        INTO item_rows FROM nodes WHERE node->>'Relation Name'='warehouse_'||kind||'_order_items';
      IF item_rows>jsonb_array_length(actual_items)*100 OR item_rows<jsonb_array_length(actual_items)
        OR (plan->0->'Plan'->>'Temp Written Blocks')::integer<>0 THEN
        RAISE EXCEPTION 'Unbounded item enrichment/spill % %: visited %, plan %',kind,scenario.label,item_rows,plan;
      END IF;
      IF (scenario.label='empty' AND (jsonb_array_length(actual_items)<>0 OR actual_total<20000))
        OR (scenario.label='project' AND actual_total<>200) OR (scenario.filter_warehouse AND actual_total<>2000) THEN
        RAISE EXCEPTION 'Incorrect filtered or empty page total: % %',scenario.label,result;
      END IF;
      INSERT INTO material_plan_results VALUES(scenario.label,kind,actual_total,jsonb_array_length(actual_items),
        item_rows,(plan->0->>'Execution Time')::numeric,md5(definition),plan);
    END LOOP;
  END LOOP;
END;
$test$;
SELECT 'EVIDENCE material page plan '||jsonb_build_object('case',label,'document_type',document_type,
  'total',total,'page_count',page_count,'item_rows_visited',item_rows_visited,'execution_ms',execution_ms,
  'definition_md5',definition_md5)::text FROM material_plan_results ORDER BY document_type,label;
ROLLBACK;
