BEGIN;
DO $test$
DECLARE
  t uuid := gen_random_uuid(); e uuid := gen_random_uuid(); w uuid := gen_random_uuid();
  p uuid := gen_random_uuid(); hidden uuid := gen_random_uuid(); s uuid := gen_random_uuid();
  r uuid := gen_random_uuid(); warehouse_order uuid := gen_random_uuid();
  other_warehouse uuid := gen_random_uuid();
  result jsonb; first_page jsonb; second_page jsonb;
  guard_definition text; unguarded_definition text;
BEGIN
  INSERT INTO public.tenants(id,name,slug) VALUES(t,'Order list fixture','stage-b-order-list');
  INSERT INTO public.employees(id,tenant_id,name,status) VALUES(e,t,'Fixture actor','active');
  INSERT INTO public.warehouses(id,tenant_id,name) VALUES(w,t,'Fixture warehouse');
  INSERT INTO public.warehouses(id,tenant_id,name) VALUES(other_warehouse,t,'Another fixture warehouse');
  INSERT INTO public.projects(id,tenant_id,name,status) VALUES
    (p,t,'Visible project','designing'),(hidden,t,'Hidden project','designing');
  INSERT INTO public.suppliers(id,code,name,legal_name,supplier_type,ownership_scope,owner_tenant_id,
    onboarding_status,operational_status,reviewed_by_employee_id,reviewed_at,created_by_employee_id,updated_by_employee_id)
    VALUES(s,'STAGE-B-LIST','Supplier','Supplier','manufacturer','tenant',t,'approved','active',e,now(),e,e);
  INSERT INTO public.tenant_suppliers(id,tenant_id,supplier_id,relationship_status,default_currency,
    internal_supplier_code,started_at,created_by_employee_id,updated_by_employee_id)
    VALUES(r,t,s,'active','CNY','STAGE-B-LIST',current_date,e,e);
  INSERT INTO public.supplier_purchase_orders(id,tenant_id,project_id,destination_type,warehouse_id,
    tenant_supplier_id,supplier_id,order_no,priced_at,created_by_employee_id,updated_by_employee_id,
    settlement_term_days_snapshot,invoice_required_before_payment_snapshot,commercial_snapshot_source)
    VALUES
      (gen_random_uuid(),t,p,'project',NULL,r,s,'VISIBLE',now(),e,e,0,false,'relationship_default_snapshot'),
      (gen_random_uuid(),t,hidden,'project',NULL,r,s,'HIDDEN',now(),e,e,0,false,'relationship_default_snapshot'),
      (warehouse_order,t,NULL,'warehouse',w,r,s,'WAREHOUSE',now(),e,e,0,false,'relationship_default_snapshot');
  -- Counterfactual control: removing ONLY the new warehouse guard permits this
  -- same-tenant change. The deliberate subtransaction rollback restores both
  -- the real function and fixture row before verifying rejection below.
  guard_definition := pg_get_functiondef('public.prevent_submitted_supplier_purchase_order_mutation()'::regprocedure);
  unguarded_definition := replace(guard_definition,'OR NEW.warehouse_id IS DISTINCT FROM OLD.warehouse_id','');
  IF unguarded_definition=guard_definition THEN RAISE EXCEPTION 'Warehouse guard absent'; END IF;
  BEGIN
    EXECUTE unguarded_definition;
    UPDATE public.supplier_purchase_orders SET warehouse_id=other_warehouse,version=version+1 WHERE id=warehouse_order;
    IF (SELECT warehouse_id FROM public.supplier_purchase_orders WHERE id=warehouse_order) <> other_warehouse THEN
      RAISE EXCEPTION 'Counterfactual did not mutate the warehouse';
    END IF;
    RAISE EXCEPTION USING ERRCODE='P9001',MESSAGE='rollback counterfactual fixture';
  EXCEPTION WHEN SQLSTATE 'P9001' THEN NULL;
  END;
  BEGIN
    UPDATE public.supplier_purchase_orders SET warehouse_id=other_warehouse,version=version+1
      WHERE id=warehouse_order;
    RAISE EXCEPTION 'Order warehouse mutation accepted';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM <> 'SUPPLIER_PURCHASE_ORDER_STATE_CONFLICT' THEN RAISE; END IF;
  END;

  result := public.list_supplier_purchase_orders(p_tenant_id=>t,p_visible_project_ids=>'{}'::uuid[],p_include_warehouse=>true);
  IF (result->>'total')::int <> 1 OR result->'items'->0->>'id' <> warehouse_order::text
    OR result->'items'->0->'project' <> 'null'::jsonb
    OR result->'items'->0->'warehouse'->>'id' <> w::text
    OR result->'items'->0->>'destination_type' <> 'warehouse' THEN
    RAISE EXCEPTION 'Warehouse scope/DTO failed: %',result;
  END IF;
  result := public.list_supplier_purchase_orders(t);
  IF (result->>'total')::int <> 2 THEN RAISE EXCEPTION 'Legacy list leaked warehouse: %',result; END IF;
  result := public.list_supplier_purchase_orders(p_tenant_id=>t,p_visible_project_ids=>ARRAY[p],p_include_warehouse=>true);
  IF (result->>'total')::int <> 2 OR EXISTS(
    SELECT 1 FROM jsonb_array_elements(result->'items') x WHERE x->>'project_id'=hidden::text
  ) THEN RAISE EXCEPTION 'Project scope bypass: %',result; END IF;
  result := public.list_supplier_purchase_orders(p_tenant_id=>t,p_visible_project_ids=>'{}'::uuid[],p_include_warehouse=>false);
  IF (result->>'total')::int <> 0 THEN RAISE EXCEPTION 'Empty scope not empty'; END IF;
  result := public.list_supplier_purchase_orders(p_tenant_id=>t,p_include_warehouse=>false,p_warehouse_id=>w);
  IF (result->>'total')::int <> 0 THEN RAISE EXCEPTION 'Warehouse filter bypassed authorization'; END IF;
  result := public.list_supplier_purchase_orders(p_tenant_id=>gen_random_uuid(),p_include_warehouse=>true);
  IF (result->>'total')::int <> 0 THEN RAISE EXCEPTION 'Cross tenant leakage'; END IF;
  result := public.list_supplier_purchase_orders(p_tenant_id=>t,p_include_warehouse=>true,p_destination_type=>'project');
  IF (result->>'total')::int <> 2 THEN RAISE EXCEPTION 'Project filter failed'; END IF;
  first_page := public.list_supplier_purchase_orders(p_tenant_id=>t,p_include_warehouse=>true,p_page_size=>1);
  second_page := public.list_supplier_purchase_orders(p_tenant_id=>t,p_include_warehouse=>true,p_page_size=>1,p_page=>2);
  IF (first_page->>'total')::int <> 3 OR jsonb_array_length(first_page->'items')<>1
    OR first_page->'items'->0->>'id'=second_page->'items'->0->>'id' THEN
    RAISE EXCEPTION 'Pagination failed';
  END IF;
END;
$test$;
ROLLBACK;
