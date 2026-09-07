BEGIN;
DO $test$
DECLARE
  t uuid := gen_random_uuid(); u uuid := gen_random_uuid(); e uuid := gen_random_uuid();
  w uuid := gen_random_uuid(); p uuid := gen_random_uuid(); b uuid := gen_random_uuid();
  s uuid := gen_random_uuid(); r uuid := gen_random_uuid(); c uuid := gen_random_uuid();
  brand uuid := gen_random_uuid(); unit_id uuid := gen_random_uuid(); cost uuid := gen_random_uuid();
  product uuid := gen_random_uuid(); sku uuid := gen_random_uuid();
  legacy_batch uuid := gen_random_uuid(); other_warehouse uuid := gen_random_uuid();
  reviewer_user uuid := gen_random_uuid(); reviewer uuid := gen_random_uuid();
  order_id uuid; role_name text;
  result jsonb; items jsonb;
BEGIN
  INSERT INTO public.tenants(id,name,slug) VALUES (t,'Draft fixture','stage-b-draft');
  INSERT INTO auth.users(id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data)
    VALUES (u,'authenticated','authenticated','stage-b-draft@smoke.invalid','','{}','{}');
  INSERT INTO public.employees(id,tenant_id,user_id,name,status) VALUES(e,t,u,'Applicant','active');
  INSERT INTO public.projects(id,tenant_id,name,status) VALUES(p,t,'Legacy project','designing');
  INSERT INTO public.warehouses(id,tenant_id,name) VALUES(w,t,'Warehouse');
  INSERT INTO public.warehouses(id,tenant_id,name) VALUES(other_warehouse,t,'Other warehouse');
  INSERT INTO public.tenant_supplier_settings(tenant_id,module_enabled,require_active_contract_for_new_order,
    ownership_reads_enabled,private_supplier_writes_enabled,private_catalog_writes_enabled,
    procurement_snapshot_v1_enabled,purchase_batch_workflow_enabled,warehouse_procurement_enabled,
    enabled_by_employee_id,enabled_at)
    VALUES(t,true,false,true,true,true,true,true,true,e,now()) ON CONFLICT(tenant_id) DO UPDATE SET
      module_enabled=true, require_active_contract_for_new_order=false,
      enabled_by_employee_id=e,enabled_at=now(),
      ownership_reads_enabled=true,private_supplier_writes_enabled=true,private_catalog_writes_enabled=true,
      procurement_snapshot_v1_enabled=true,purchase_batch_workflow_enabled=true,warehouse_procurement_enabled=true;
  INSERT INTO public.finance_cost_categories(id,tenant_id,code,name) VALUES(cost,t,'stage-b-cost','Material');
  INSERT INTO public.catalog_categories(id,code,name,full_name,level,created_by_employee_id,updated_by_employee_id)
    VALUES(c,'STAGE-B-CATEGORY','Material','Material',1,e,e);
  INSERT INTO public.catalog_brands(id,code,name,created_by_employee_id,updated_by_employee_id)
    VALUES(brand,'STAGE-B-BRAND','Brand',e,e);
  INSERT INTO public.catalog_units(id,code,name,symbol,created_by_employee_id,updated_by_employee_id)
    VALUES(unit_id,'STAGE-B-UNIT','Piece','pc',e,e);
  INSERT INTO public.suppliers(id,code,name,legal_name,supplier_type,ownership_scope,owner_tenant_id,
    onboarding_status,operational_status,reviewed_by_employee_id,reviewed_at,created_by_employee_id,updated_by_employee_id)
    VALUES(s,'STAGE-B-SUPPLIER','Supplier','Supplier','manufacturer','tenant',t,'approved','active',e,now(),e,e);
  INSERT INTO public.tenant_suppliers(id,tenant_id,supplier_id,relationship_status,default_currency,
    internal_supplier_code,started_at,created_by_employee_id,updated_by_employee_id)
    VALUES(r,t,s,'active','CNY','STAGE-B-SUPPLIER',current_date,e,e);
  result := public.command_supplier_purchasable_product_v1(product,sku,t,r,s,
    jsonb_build_object('product_code','TP-' || left(replace(product::text,'-',''),16),'name','Material','category_id',c,'brand_id',brand),
    jsonb_build_object('sku_code','TS-' || left(replace(sku::text,'-',''),16),'name','Material','purchase_unit_id',unit_id,'spec_values','{}'::jsonb),
    '{"unit_price":"10.00","tax_rate":"0.130000","tax_inclusive":true}'::jsonb,u,e,'fixture-product');
  IF result->>'status' <> 'created' THEN RAISE EXCEPTION 'Fixture product failed: %',result; END IF;
  items := jsonb_build_array(jsonb_build_object('supplier_sku_id',sku,'cost_category_id',cost,'quantity','10'));
  result := public.save_supplier_purchase_batch_draft(b,t,NULL,0,'Warehouse replenishment',NULL,NULL,items,u,e,'warehouse-save','warehouse',w);
  IF result->>'status' <> 'saved' THEN RAISE EXCEPTION 'Warehouse draft failed: %',result; END IF;
  INSERT INTO auth.users(id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data)
    VALUES(reviewer_user,'authenticated','authenticated','stage-b-review@smoke.invalid','','{}','{}');
  INSERT INTO public.employees(id,tenant_id,user_id,name,status) VALUES(reviewer,t,reviewer_user,'Reviewer','active');

  BEGIN
    PERFORM public.submit_supplier_purchase_batch(b,t,1,u,e,'legacy-warehouse-submit');
    RAISE EXCEPTION 'Legacy submit accepted a warehouse draft';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM <> 'SUPPLIER_PURCHASE_BATCH_WORKFLOW_CONFLICT' THEN RAISE; END IF;
  END;
  BEGIN
    UPDATE public.tenant_supplier_settings SET warehouse_procurement_enabled=false WHERE tenant_id=t;
    PERFORM public.__gooes_submit_supplier_purchase_batch_destinations_v2(b,t,1,u,e,'closed-gate',true);
    RAISE EXCEPTION 'Closed gate accepted warehouse submit';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM <> 'WAREHOUSE_PROCUREMENT_NOT_ENABLED' THEN RAISE; END IF;
  END;
  BEGIN
    UPDATE public.warehouses SET status='inactive',version=version+1 WHERE id=w;
    PERFORM public.__gooes_submit_supplier_purchase_batch_destinations_v2(b,t,1,u,e,'inactive-warehouse',true);
    RAISE EXCEPTION 'Inactive warehouse accepted submit';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM <> 'WAREHOUSE_INACTIVE' THEN RAISE; END IF;
  END;

  -- Exercise the real internal accounting core as postgres, not a workflow
  -- mock. Its business-role ACL is asserted below; workflow routing is separate.
  result := public.__gooes_submit_supplier_purchase_batch_destinations_v2(b,t,1,u,e,'warehouse-submit',true);
  IF result->>'status' <> 'submitted' OR result->'batch'->>'budget_status' <> 'not_applicable'
    OR result->'batch'->'budget_snapshot' <> '{}'::jsonb THEN
    RAISE EXCEPTION 'Warehouse submit failed: %',result;
  END IF;
  IF (SELECT count(*) FROM public.supplier_purchase_requisitions
    WHERE tenant_id=t AND purchase_batch_id=b AND destination_type='warehouse' AND warehouse_id=w
      AND project_id IS NULL AND budget_status='not_applicable') <> 1 THEN
    RAISE EXCEPTION 'Child destination/budget not propagated';
  END IF;
  IF EXISTS(SELECT 1 FROM public.project_cost_commitments WHERE tenant_id=t) THEN
    RAISE EXCEPTION 'Warehouse submit reserved project budget';
  END IF;
  result := public.__gooes_submit_supplier_purchase_batch_destinations_v2(b,t,1,u,e,'warehouse-submit',true);
  IF result->>'idempotent'<>'true' OR (SELECT count(*) FROM public.supplier_purchase_requisitions WHERE purchase_batch_id=b)<>1 THEN
    RAISE EXCEPTION 'Submit retry duplicated requisition';
  END IF;
  result := public.__gooes_review_supplier_purchase_batch_destinations_v2(b,t,2,'approve',NULL,false,u,e,'self-review',true);
  IF result->>'error_code'<>'SUPPLIER_PURCHASE_BATCH_SELF_REVIEW' THEN
    RAISE EXCEPTION 'Warehouse self-review accepted: %',result;
  END IF;
  BEGIN
    result := public.__gooes_review_supplier_purchase_batch_destinations_v2(
      b,t,2,'reject','Revise quantities',false,reviewer_user,reviewer,'warehouse-reject',true);
    IF result->>'status'<>'rejected' OR EXISTS(SELECT 1 FROM public.project_cost_commitments WHERE tenant_id=t)
      OR (SELECT count(*) FROM public.supplier_purchase_requisitions WHERE purchase_batch_id=b AND status='rejected')<>1 THEN
      RAISE EXCEPTION 'Warehouse rejection failed: %',result;
    END IF;
    -- Roll back the rejected branch, so approval below sees the identical
    -- submitted frozen facts rather than a separately constructed fixture.
    RAISE EXCEPTION USING ERRCODE='P9001',MESSAGE='rollback rejected branch';
  EXCEPTION WHEN SQLSTATE 'P9001' THEN NULL;
  END;
  BEGIN
    PERFORM public.submit_supplier_purchase_batch(b,t,1,u,e,'warehouse-submit');
    RAISE EXCEPTION 'Legacy submit replay bypassed warehouse workflow';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM <> 'SUPPLIER_PURCHASE_BATCH_WORKFLOW_CONFLICT' THEN RAISE; END IF;
  END;
  result := public.__gooes_review_supplier_purchase_batch_destinations_v2(
    b,t,2,'approve',NULL,false,reviewer_user,reviewer,'warehouse-review',true);
  IF result->>'status' <> 'ordered' OR jsonb_array_length(result->'orders')<>1 THEN
    RAISE EXCEPTION 'Warehouse review failed: %',result;
  END IF;
  order_id := (result->'orders'->0->>'id')::uuid;
  IF NOT EXISTS(SELECT 1 FROM public.supplier_purchase_orders WHERE id=order_id
    AND tenant_id=t AND destination_type='warehouse' AND warehouse_id=w AND project_id IS NULL
    AND status='submitted' AND version=2 AND total_amount=100) THEN
    RAISE EXCEPTION 'Order destination/frozen amount mismatch';
  END IF;
  result := public.__gooes_review_supplier_purchase_batch_destinations_v2(
    b,t,2,'approve',NULL,false,reviewer_user,reviewer,'warehouse-review',true);
  IF result->>'idempotent'<>'true' OR (SELECT count(*) FROM public.supplier_purchase_orders WHERE purchase_batch_id=b)<>1 THEN
    RAISE EXCEPTION 'Review retry duplicated order';
  END IF;
  BEGIN
    PERFORM public.review_supplier_purchase_batch(b,t,2,'approve',NULL,false,reviewer_user,reviewer,'warehouse-review');
    RAISE EXCEPTION 'Legacy review replay bypassed warehouse workflow';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM <> 'SUPPLIER_PURCHASE_BATCH_WORKFLOW_CONFLICT' THEN RAISE; END IF;
  END;
  IF EXISTS(SELECT 1 FROM public.project_cost_commitments WHERE tenant_id=t)
    OR EXISTS(SELECT 1 FROM public.project_cost_events WHERE tenant_id=t) THEN
    RAISE EXCEPTION 'Warehouse order polluted project accounting';
  END IF;

  INSERT INTO public.project_cost_budgets(tenant_id,project_id,cost_category_id,budget_amount,created_by,updated_by)
    VALUES(t,p,cost,10000,e,e);
  result := public.save_supplier_purchase_batch_draft(legacy_batch,t,p,0,'Project regression',NULL,NULL,items,u,e,'project-save');
  IF result->>'status'<>'saved' THEN RAISE EXCEPTION 'Project draft failed: %',result; END IF;
  result := public.submit_supplier_purchase_batch(legacy_batch,t,1,u,e,'project-submit');
  IF result->>'status'<>'submitted' OR result->'batch'->>'budget_status'<>'within_budget' THEN
    RAISE EXCEPTION 'Project submit failed: %',result;
  END IF;
  result := public.review_supplier_purchase_batch(legacy_batch,t,2,'approve',NULL,false,reviewer_user,reviewer,'project-review');
  IF result->>'status'<>'ordered' THEN RAISE EXCEPTION 'Project review failed: %',result; END IF;
  IF (SELECT count(*) FROM public.project_cost_commitments WHERE tenant_id=t AND project_id=p AND status='converted')<>1 THEN
    RAISE EXCEPTION 'Legacy project commitment regression';
  END IF;
  BEGIN
    UPDATE public.supplier_purchase_batches SET budget_status='not_applicable',version=version+1 WHERE id=legacy_batch;
    RAISE EXCEPTION 'Project accepted warehouse-only budget status';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM NOT LIKE '%supplier_purchase_batches_destination_budget_check%' THEN RAISE; END IF;
  END;
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
    IF has_function_privilege(role_name,'public.__gooes_submit_supplier_purchase_batch_destinations_v2(uuid,uuid,integer,uuid,uuid,text,boolean)','EXECUTE')
      OR has_function_privilege(role_name,'public.__gooes_review_supplier_purchase_batch_destinations_v2(uuid,uuid,integer,text,text,boolean,uuid,uuid,text,boolean)','EXECUTE') THEN
      RAISE EXCEPTION 'Accounting core exposed to %',role_name;
    END IF;
  END LOOP;
END;
$test$;
ROLLBACK;
