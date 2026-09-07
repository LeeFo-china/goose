BEGIN;
DO $test$
DECLARE
  t uuid := gen_random_uuid(); u uuid := gen_random_uuid(); e uuid := gen_random_uuid();
  w uuid := gen_random_uuid(); p uuid := gen_random_uuid(); b uuid := gen_random_uuid();
  s uuid := gen_random_uuid(); r uuid := gen_random_uuid(); c uuid := gen_random_uuid();
  brand uuid := gen_random_uuid(); unit_id uuid := gen_random_uuid(); cost uuid := gen_random_uuid();
  product uuid := gen_random_uuid(); sku uuid := gen_random_uuid();
  legacy_batch uuid := gen_random_uuid(); other_warehouse uuid := gen_random_uuid();
  legacy_request jsonb; signature text; role_name text;
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
  IF result->>'status' <> 'saved' OR result->'batch'->>'destination_type' <> 'warehouse'
    OR result->'batch'->>'warehouse_id' <> w::text OR result->'batch'->>'project_id' IS NOT NULL THEN
    RAISE EXCEPTION 'Warehouse draft failed: %',result;
  END IF;
  result := public.save_supplier_purchase_batch_draft(b,t,NULL,0,'Warehouse replenishment',NULL,NULL,items,u,e,'warehouse-save','warehouse',w);
  IF result->>'idempotent' <> 'true' THEN RAISE EXCEPTION 'Replay not idempotent'; END IF;
  BEGIN
    PERFORM public.save_supplier_purchase_batch_draft(b,t,NULL,0,'Warehouse replenishment',NULL,NULL,items,u,e,'warehouse-save','warehouse',other_warehouse);
    RAISE EXCEPTION 'Changed warehouse replay accepted';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM <> 'SUPPLIER_IDEMPOTENCY_CONFLICT' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.save_supplier_purchase_batch_draft(b,t,p,0,'Warehouse replenishment',NULL,NULL,items,u,e,'warehouse-save');
    RAISE EXCEPTION 'Changed destination replay accepted';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM <> 'SUPPLIER_IDEMPOTENCY_CONFLICT' THEN RAISE; END IF;
  END;
  result := public.save_supplier_purchase_batch_draft(legacy_batch,t,p,0,'Legacy purchase',NULL,NULL,items,u,e,'project-save');
  IF result->>'status' <> 'saved' OR result->'batch'->>'destination_type' <> 'project' THEN
    RAISE EXCEPTION 'Legacy draft failed: %',result;
  END IF;
  IF (SELECT count(*) FROM public.supplier_purchase_batches WHERE tenant_id=t) <> 2 THEN
    RAISE EXCEPTION 'Unexpected number of batches';
  END IF;
  -- Freeze the original 20260826142000 project's request fingerprint contract.
  legacy_request := jsonb_build_object('tenant_id',t,'batch_id',legacy_batch,
    'project_id',p,'expected_version',0,'reason','Legacy purchase',
    'expected_delivery_date',NULL,'remark',NULL,'items',items,
    'actor_user_id',u,'actor_employee_id',e);
  IF (SELECT request_fingerprint FROM public.supplier_purchase_batch_command_events
    WHERE tenant_id=t AND purchase_batch_id=legacy_batch AND idempotency_key='project-save')
    IS DISTINCT FROM encode(extensions.digest(convert_to(legacy_request::text,'UTF8'),'sha256'),'hex') THEN
    RAISE EXCEPTION 'Historical project fingerprint changed';
  END IF;
  result := public.save_supplier_purchase_batch_draft(legacy_batch,t,p,0,'Legacy purchase',NULL,NULL,items,u,e,'project-save');
  IF result->>'idempotent' <> 'true' THEN RAISE EXCEPTION 'Legacy replay failed'; END IF;

  -- Synthetic rejected state tests the real existing rejection/edit wrapper;
  -- the complete approval workflow itself is covered by separate acceptance.
  UPDATE public.supplier_purchase_batches SET status='rejected',submitted_by_employee_id=e,
    submitted_at=now(),reviewed_by_employee_id=e,reviewed_at=now(),review_remark='Fixture rejection'
    WHERE id=b;
  result := public.save_supplier_purchase_batch_draft(b,t,NULL,1,'Warehouse revision',NULL,NULL,items,u,e,'warehouse-revision','warehouse',w);
  IF result->>'status' <> 'saved' OR result->>'version' <> '2'
    OR result->'batch'->>'status' <> 'draft' OR result->'batch'->>'warehouse_id' <> w::text THEN
    RAISE EXCEPTION 'Rejected warehouse edit failed: %',result;
  END IF;

  FOREACH signature IN ARRAY ARRAY[
    'public.save_supplier_purchase_batch_draft(uuid,uuid,uuid,integer,text,date,text,jsonb,uuid,uuid,text,text,uuid)',
    'public.resolve_supplier_purchase_batch_catalog(uuid,uuid,text,uuid,uuid,uuid,timestamptz,integer,integer,text,uuid)'
  ] LOOP
    IF NOT has_function_privilege('service_role',signature,'EXECUTE') THEN RAISE EXCEPTION 'RPC grant missing'; END IF;
    FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
      IF has_function_privilege(role_name,signature,'EXECUTE') THEN RAISE EXCEPTION 'RPC exposed to %',role_name; END IF;
    END LOOP;
  END LOOP;
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
    IF has_function_privilege(role_name,
      'public.__gooes_save_supplier_purchase_batch_draft_v1(uuid,uuid,uuid,integer,text,date,text,jsonb,uuid,uuid,text,text,uuid)','EXECUTE')
      OR has_function_privilege(role_name,'public.assert_warehouse_procurement_destination(uuid,text,uuid,uuid)','EXECUTE') THEN
      RAISE EXCEPTION 'Internal helper exposed to %',role_name;
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_proc JOIN pg_namespace n ON n.oid=pronamespace
    WHERE n.nspname='public' AND proname IN ('save_supplier_purchase_batch_draft','resolve_supplier_purchase_batch_catalog')
    GROUP BY proname HAVING count(*)<>1) THEN RAISE EXCEPTION 'Ambiguous RPC overloads'; END IF;
END;
$test$;
ROLLBACK;
