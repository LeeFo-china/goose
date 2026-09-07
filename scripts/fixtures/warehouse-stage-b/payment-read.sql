-- Synthetic facts only, executed by the disposable offline PostgreSQL runner.
BEGIN;
DO $test$
DECLARE result jsonb;
BEGIN
  result := public.list_supplier_payables(
    p_tenant_id => gen_random_uuid(), p_visible_project_ids => '{}'::uuid[],
    p_include_warehouse => true, p_destination_type => 'warehouse', p_warehouse_id => gen_random_uuid());
  IF result->>'total' IS DISTINCT FROM '0' OR result->'items' IS DISTINCT FROM '[]'::jsonb THEN
    RAISE EXCEPTION 'Empty warehouse payable page mismatch: %', result;
  END IF;
END;
$test$;
DO $facts$
DECLARE
  t uuid := gen_random_uuid(); other_t uuid := gen_random_uuid();
  u uuid := gen_random_uuid(); e uuid := gen_random_uuid(); reviewer_u uuid := gen_random_uuid(); reviewer uuid := gen_random_uuid();
  w uuid := gen_random_uuid(); w2 uuid := gen_random_uuid(); p uuid := gen_random_uuid(); hidden_p uuid := gen_random_uuid();
  s uuid := gen_random_uuid(); r uuid := gen_random_uuid(); c uuid := gen_random_uuid();
  brand uuid := gen_random_uuid(); unit_id uuid := gen_random_uuid(); cost uuid := gen_random_uuid();
  product uuid := gen_random_uuid(); sku uuid := gen_random_uuid();
  batch_id uuid; order_id uuid; order_item uuid; receipt_id uuid; payable_id uuid;
  request_id uuid; allocation_id uuid; payment_id uuid; project_id uuid; warehouse_id uuid; destination text;
  payable_ids uuid[] := '{}'; request_ids uuid[] := '{}'; result jsonb; items jsonb; row_data jsonb;
  i integer; rpc text; option_type text; signature text; size integer; scope_query text;
BEGIN
  INSERT INTO public.tenants(id,name,slug) VALUES(t,'Financial read fixture','stage-b-payment-read'),(other_t,'Other','stage-b-payment-other');
  INSERT INTO auth.users(id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data)
    VALUES(u,'authenticated','authenticated','payment-read@smoke.invalid','','{}','{}'),
      (reviewer_u,'authenticated','authenticated','payment-review@smoke.invalid','','{}','{}');
  INSERT INTO public.employees(id,tenant_id,user_id,name,status)
    VALUES(e,t,u,'Applicant','active'),(reviewer,t,reviewer_u,'Reviewer','active');
  INSERT INTO public.projects(id,tenant_id,name,status) VALUES(p,t,'Visible project','designing'),(hidden_p,t,'Hidden project','designing');
  INSERT INTO public.warehouses(id,tenant_id,name) VALUES(w,t,'Warehouse A'),(w2,t,'Warehouse B');
  INSERT INTO public.tenant_supplier_settings(tenant_id,module_enabled,require_active_contract_for_new_order,
    ownership_reads_enabled,private_supplier_writes_enabled,private_catalog_writes_enabled,
    procurement_snapshot_v1_enabled,purchase_batch_workflow_enabled,warehouse_procurement_enabled,enabled_by_employee_id,enabled_at)
    VALUES(t,true,false,true,true,true,true,true,true,e,now()) ON CONFLICT(tenant_id) DO UPDATE SET
      module_enabled=true,require_active_contract_for_new_order=false,ownership_reads_enabled=true,
      private_supplier_writes_enabled=true,private_catalog_writes_enabled=true,procurement_snapshot_v1_enabled=true,
      purchase_batch_workflow_enabled=true,warehouse_procurement_enabled=true,enabled_by_employee_id=e,enabled_at=now();
  INSERT INTO public.finance_cost_categories(id,tenant_id,code,name) VALUES(cost,t,'payment-read-cost','Material');
  INSERT INTO public.project_cost_budgets(tenant_id,project_id,cost_category_id,budget_amount,created_by,updated_by)
    VALUES(t,p,cost,10000,e,e),(t,hidden_p,cost,10000,e,e);
  INSERT INTO public.catalog_categories(id,code,name,full_name,level,created_by_employee_id,updated_by_employee_id)
    VALUES(c,'PAYMENT-READ-CATEGORY','Material','Material',1,e,e);
  INSERT INTO public.catalog_brands(id,code,name,created_by_employee_id,updated_by_employee_id) VALUES(brand,'PAYMENT-READ-BRAND','Brand',e,e);
  INSERT INTO public.catalog_units(id,code,name,symbol,created_by_employee_id,updated_by_employee_id) VALUES(unit_id,'PAYMENT-READ-UNIT','Piece','pc',e,e);
  INSERT INTO public.suppliers(id,code,name,legal_name,supplier_type,ownership_scope,owner_tenant_id,onboarding_status,
    operational_status,reviewed_by_employee_id,reviewed_at,created_by_employee_id,updated_by_employee_id)
    VALUES(s,'PAYMENT-READ-SUPPLIER','Supplier','Supplier','manufacturer','tenant',t,'approved','active',e,now(),e,e);
  INSERT INTO public.tenant_suppliers(id,tenant_id,supplier_id,relationship_status,default_currency,internal_supplier_code,
    started_at,created_by_employee_id,updated_by_employee_id) VALUES(r,t,s,'active','CNY','PAYMENT-READ-SUPPLIER',current_date,e,e);
  result := public.command_supplier_purchasable_product_v1(product,sku,t,r,s,
    jsonb_build_object('product_code','TP-'||left(replace(product::text,'-',''),16),'name','Material','category_id',c,'brand_id',brand),
    jsonb_build_object('sku_code','TS-'||left(replace(sku::text,'-',''),16),'name','Material','purchase_unit_id',unit_id,'spec_values','{}'::jsonb),
    '{"unit_price":"10.00","tax_rate":"0.130000","tax_inclusive":true}'::jsonb,u,e,'payment-read-product');
  IF result->>'status' <> 'created' THEN RAISE EXCEPTION 'Product fixture failed: %',result; END IF;
  items := jsonb_build_array(jsonb_build_object('supplier_sku_id',sku,'cost_category_id',cost,'quantity','10'));
  FOR i IN 1..4 LOOP
    destination := CASE WHEN i<=2 THEN 'warehouse' ELSE 'project' END;
    warehouse_id := CASE i WHEN 1 THEN w WHEN 2 THEN w2 ELSE NULL END;
    project_id := CASE i WHEN 3 THEN p WHEN 4 THEN hidden_p ELSE NULL END;
    batch_id := gen_random_uuid(); receipt_id := gen_random_uuid(); request_id := gen_random_uuid();
    allocation_id := gen_random_uuid(); payment_id := gen_random_uuid();
    result := public.save_supplier_purchase_batch_draft(batch_id,t,project_id,0,'Read fixture',NULL,NULL,items,u,e,'read-save-'||i,destination,warehouse_id);
    IF result->>'status' <> 'saved' THEN RAISE EXCEPTION 'Draft fixture failed: %',result; END IF;
    result := public.__gooes_submit_supplier_purchase_batch_destinations_v2(batch_id,t,1,u,e,'read-submit-'||i,true);
    IF result->>'status' <> 'submitted' THEN RAISE EXCEPTION 'Submit fixture failed: %',result; END IF;
    result := public.__gooes_review_supplier_purchase_batch_destinations_v2(batch_id,t,2,'approve',NULL,false,reviewer_u,reviewer,'read-review-'||i,true);
    IF result->>'status' <> 'ordered' THEN RAISE EXCEPTION 'Review fixture failed: %',result; END IF;
    order_id := (result->'orders'->0->>'id')::uuid;
    SELECT id INTO STRICT order_item FROM public.supplier_purchase_order_items WHERE supplier_purchase_order_id=order_id;
    result := public.confirm_supplier_purchase_order_fulfillment(order_id,t,2,now(),NULL,u,e,'read-confirm-'||i);
    IF result->>'status' <> 'confirmed' THEN RAISE EXCEPTION 'Confirm fixture failed: %',result; END IF;
    result := public.create_supplier_purchase_order_receipt(receipt_id,order_id,t,1,'PAYMENT-READ-'||i,now(),NULL,
      jsonb_build_array(jsonb_build_object('purchase_order_item_id',order_item,'accepted_quantity',10,'rejected_quantity',0)),u,e,'read-receipt-'||i);
    IF result->>'status' <> 'receipt_created' THEN RAISE EXCEPTION 'Receipt fixture failed: %',result; END IF;
    SELECT id INTO STRICT payable_id FROM public.supplier_payable_events WHERE supplier_purchase_order_receipt_id=receipt_id;
    payable_ids := array_append(payable_ids,payable_id); request_ids := array_append(request_ids,request_id);
    -- Only synthetic financial seeds use the existing command context; all
    -- production constraints/triggers remain active. Commands are a later unit.
    PERFORM set_config('app.supplier_payment_command','on',true);
    INSERT INTO public.supplier_payment_requests(id,tenant_id,destination_type,project_id,warehouse_id,tenant_supplier_id,supplier_id,
      status,requested_amount,paid_amount,reason,created_by_employee_id,updated_by_employee_id,
      submitted_by_employee_id,submitted_at,reviewed_by_employee_id,reviewed_at)
      VALUES(request_id,t,destination,project_id,warehouse_id,r,s,'partially_paid',20,5,'Read fixture',e,e,e,now(),reviewer,now());
    INSERT INTO public.supplier_payment_request_allocations(id,tenant_id,payment_request_id,payable_event_id,requested_amount,paid_amount)
      VALUES(allocation_id,t,request_id,payable_id,20,5);
    INSERT INTO public.supplier_payments(id,tenant_id,destination_type,project_id,warehouse_id,tenant_supplier_id,supplier_id,payment_request_id,
      amount,payment_method,payment_reference,paid_at,evidence_images,confirmed_by_employee_id,idempotency_key)
      VALUES(payment_id,t,destination,project_id,warehouse_id,r,s,request_id,5,'bank_transfer','read-'||i,now(),'["proof"]',e,gen_random_uuid());
    INSERT INTO public.supplier_payment_allocations(id,tenant_id,supplier_payment_id,payment_request_id,payment_request_allocation_id,payable_event_id,amount)
      VALUES(gen_random_uuid(),t,payment_id,request_id,allocation_id,payable_id,5);
    PERFORM set_config('app.supplier_payment_command','off',true);
  END LOOP;
  UPDATE public.tenant_supplier_settings SET warehouse_procurement_enabled=false WHERE tenant_id=t;
  UPDATE public.warehouses SET status='inactive',version=version+1 WHERE id IN(w,w2);

  FOREACH rpc IN ARRAY ARRAY['list_supplier_payables','list_supplier_payment_requests'] LOOP
    EXECUTE format('SELECT public.%I(p_tenant_id=>$1)',rpc) INTO result USING t;
    IF result->>'total'<>'2' OR result->>'page_size'<>'20' THEN RAISE EXCEPTION 'Legacy defaults expose warehouse: % %',rpc,result; END IF;
    EXECUTE format('SELECT public.%I(p_tenant_id=>$1,p_visible_project_ids=>$2,p_include_warehouse=>true)',rpc) INTO result USING t,ARRAY[p];
    IF result->>'total'<>'3' THEN RAISE EXCEPTION 'Mixed scope mismatch: % %',rpc,result; END IF;
    IF EXISTS(SELECT 1 FROM jsonb_array_elements(result->'items') x WHERE x->>'project_id'=hidden_p::text) THEN
      RAISE EXCEPTION 'Hidden project leaked: %',rpc;
    END IF;
    EXECUTE format('SELECT public.%I(p_tenant_id=>$1,p_visible_project_ids=>$2,p_include_warehouse=>true,p_destination_type=>''warehouse'',p_warehouse_id=>$3)',rpc)
      INTO result USING t,'{}'::uuid[],w;
    row_data := result->'items'->0;
    IF result->>'total' IS DISTINCT FROM '1' OR row_data->>'destination_type' IS DISTINCT FROM 'warehouse' OR row_data->>'warehouse_id' IS DISTINCT FROM w::text
      OR row_data->'project_id' IS DISTINCT FROM 'null'::jsonb OR row_data->>'warehouse_name' IS DISTINCT FROM 'Warehouse A' THEN
      RAISE EXCEPTION 'Frozen warehouse identity missing: % %',rpc,result;
    END IF;
    EXECUTE format('SELECT public.%I(p_tenant_id=>$1,p_visible_project_ids=>$2)',rpc) INTO result USING t,'{}'::uuid[];
    IF result->>'total'<>'0' THEN RAISE EXCEPTION 'Empty project scope leaked warehouse: %',rpc; END IF;
    EXECUTE format('SELECT public.%I(p_tenant_id=>$1,p_include_warehouse=>true,p_page=>2,p_page_size=>1)',rpc) INTO result USING t;
    IF result->>'total'<>'4' OR jsonb_array_length(result->'items')<>1 THEN RAISE EXCEPTION 'Pagination mismatch: %',rpc; END IF;
    EXECUTE format('SELECT public.%I(p_tenant_id=>$1,p_include_warehouse=>true,p_page=>100,p_page_size=>1)',rpc) INTO result USING t;
    IF result->>'total'<>'4' OR result->'items'<>'[]'::jsonb THEN RAISE EXCEPTION 'Out of range total mismatch: %',rpc; END IF;
    EXECUTE format('SELECT public.%I(p_tenant_id=>$1,p_include_warehouse=>true)',rpc) INTO result USING other_t;
    IF result->>'total'<>'0' THEN RAISE EXCEPTION 'Tenant isolation failed: %',rpc; END IF;
    BEGIN
      EXECUTE format('SELECT public.%I(p_tenant_id=>$1,p_page_size=>101)',rpc) USING t;
      RAISE EXCEPTION 'Oversized page accepted: %',rpc;
    EXCEPTION WHEN SQLSTATE 'P0001' THEN
      IF SQLERRM<>'SUPPLIER_PAYMENT_PAGINATION_INVALID' THEN RAISE; END IF;
    END;
  END LOOP;
  result := public.get_supplier_payables_by_ids(t,ARRAY[p],payable_ids,true);
  IF jsonb_array_length(result)<>3 THEN RAISE EXCEPTION 'Batch mixed scope mismatch: %',result; END IF;
  FOR row_data IN SELECT * FROM jsonb_array_elements(result) LOOP
    IF row_data->>'amount'<>'100.00' OR row_data->>'paid_amount'<>'5.00' OR row_data->>'reserved_amount'<>'15.00'
      OR row_data->>'open_amount'<>'95.00' THEN RAISE EXCEPTION 'AP balance regression: %',row_data; END IF;
  END LOOP;
  IF jsonb_array_length(public.get_supplier_payables_by_ids(t,NULL,payable_ids))<>2
    OR jsonb_array_length(public.get_supplier_payables_by_ids(t,'{}',payable_ids,true))<>2
    OR public.get_supplier_payables_by_ids(other_t,NULL,payable_ids,true)<>'[]'::jsonb THEN
    RAISE EXCEPTION 'Batch default/warehouse-only/tenant scope mismatch';
  END IF;
  FOREACH option_type IN ARRAY ARRAY['project','warehouse','supplier','purchase_order'] LOOP
    result := public.list_supplier_payable_filter_options(t,ARRAY[p],option_type,NULL,1,20,true);
    IF (result->>'total')::integer <> (CASE option_type WHEN 'project' THEN 1 WHEN 'warehouse' THEN 2 WHEN 'supplier' THEN 1 ELSE 3 END) THEN
      RAISE EXCEPTION 'Filter option visibility mismatch: % %',option_type,result;
    END IF;
  END LOOP;
  result := public.list_supplier_payable_filter_options(t,'{}','warehouse','Warehouse A',1,20,true,'warehouse',w);
  IF result->>'total'<>'1' OR result->'items'->0->>'id'<>w::text THEN RAISE EXCEPTION 'Warehouse filter failed: %',result; END IF;
  result := public.list_supplier_payable_filter_options(t,NULL,'warehouse');
  IF result->>'total'<>'0' THEN RAISE EXCEPTION 'Legacy filter exposed warehouse: %',result; END IF;
  FOR i IN 1..4 LOOP
    destination := CASE WHEN i<=2 THEN 'warehouse' ELSE 'project' END;
    warehouse_id := CASE i WHEN 1 THEN w WHEN 2 THEN w2 ELSE NULL END;
    project_id := CASE i WHEN 3 THEN p WHEN 4 THEN hidden_p ELSE NULL END;
    result := public.get_supplier_payment_request_detail(t,request_ids[i]);
    row_data := result->'payment_request';
    IF row_data->>'destination_type' IS DISTINCT FROM destination
      OR row_data->>'warehouse_id' IS DISTINCT FROM warehouse_id::text OR row_data->>'project_id' IS DISTINCT FROM project_id::text
      OR jsonb_array_length(result->'allocations')<>1 THEN RAISE EXCEPTION 'Detail identity/allocation mismatch: %',result; END IF;
    result := public.list_supplier_payment_request_payments(t,request_ids[i]);
    row_data := result->'items'->0;
    IF result->>'total' IS DISTINCT FROM '1' OR NOT(row_data ?& ARRAY['project_id','warehouse_id','destination_type']) OR row_data->>'destination_type' IS DISTINCT FROM destination
      OR row_data->>'warehouse_id' IS DISTINCT FROM warehouse_id::text OR row_data->>'project_id' IS DISTINCT FROM project_id::text THEN
      RAISE EXCEPTION 'Payment frozen identity missing: %',result;
    END IF;
    IF row_data - ARRAY['id','destination_type','project_id','warehouse_id','payment_no','amount','currency','payment_method',
      'payment_reference','paid_at','evidence_images','remark','confirmed_by_employee_id','created_at'] IS DISTINCT FROM '{}'::jsonb THEN
      RAISE EXCEPTION 'Payment list contains fields rejected by the strict API schema: %',row_data;
    END IF;
    IF public.get_supplier_payment_request_detail(other_t,request_ids[i]) IS NOT NULL
      OR public.list_supplier_payment_request_payments(other_t,request_ids[i])->>'total'<>'0' THEN RAISE EXCEPTION 'Request tenant leaked'; END IF;
  END LOOP;

  -- Absent rows, destination filters and out-of-range pages retain their real
  -- totals. Keyword, supplier, order, status and date filters stay conjunctive.
  FOREACH rpc IN ARRAY ARRAY['list_supplier_payables','list_supplier_payment_requests','list_supplier_payable_filter_options','list_supplier_payment_request_payments'] LOOP
    scope_query := CASE rpc WHEN 'list_supplier_payable_filter_options' THEN ',p_type=>''warehouse'',p_include_warehouse=>true'
      WHEN 'list_supplier_payment_request_payments' THEN format(',p_payment_request_id=>%L::uuid',request_ids[1])
      ELSE ',p_include_warehouse=>true' END;
    EXECUTE format('SELECT public.%I(p_tenant_id=>$1,p_page=>100,p_page_size=>100%s)',rpc,scope_query) INTO result USING t;
    IF result->'items' IS DISTINCT FROM '[]'::jsonb OR (result->>'total')::integer IS DISTINCT FROM
      (CASE rpc WHEN 'list_supplier_payable_filter_options' THEN 2 WHEN 'list_supplier_payment_request_payments' THEN 1 ELSE 4 END) THEN
      RAISE EXCEPTION 'Out of range pagination mismatch: % %',rpc,result;
    END IF;
    FOREACH size IN ARRAY ARRAY[0,101] LOOP
      BEGIN
        EXECUTE format('SELECT public.%I(p_tenant_id=>$1,p_page_size=>$2%s)',rpc,scope_query) USING t,size;
        RAISE EXCEPTION 'Invalid page size accepted: %',rpc;
      EXCEPTION WHEN SQLSTATE 'P0001' THEN
        IF SQLERRM<>'SUPPLIER_PAYMENT_PAGINATION_INVALID' THEN RAISE; END IF;
      END;
    END LOOP;
    BEGIN
      EXECUTE format('SELECT public.%I(p_tenant_id=>$1,p_page=>0%s)',rpc,scope_query) USING t;
      RAISE EXCEPTION 'Invalid page accepted: %',rpc;
    EXCEPTION WHEN SQLSTATE 'P0001' THEN
      IF SQLERRM<>'SUPPLIER_PAYMENT_PAGINATION_INVALID' THEN RAISE; END IF;
    END;
    EXECUTE format('SELECT public.%I(p_tenant_id=>$1%s)',rpc,scope_query) INTO result USING other_t;
    IF result->>'total' IS DISTINCT FROM '0' THEN RAISE EXCEPTION 'Empty tenant leaked: %',rpc; END IF;
  END LOOP;
  result := public.list_supplier_payables(p_tenant_id=>t,p_visible_project_ids=>ARRAY[p],p_project_id=>p,p_include_warehouse=>true);
  IF result->>'total' IS DISTINCT FROM '1' OR result->'items'->0->>'project_id' IS DISTINCT FROM p::text THEN RAISE EXCEPTION 'Project filter regression'; END IF;
  result := public.list_supplier_payables(p_tenant_id=>t,p_include_warehouse=>true,p_destination_type=>'warehouse',p_warehouse_id=>w2,p_tenant_supplier_id=>r,p_status=>'partially_paid');
  IF result->>'total' IS DISTINCT FROM '1' THEN RAISE EXCEPTION 'Supplier/status/warehouse filter mismatch: %',result; END IF;
  result := public.list_supplier_payables(p_tenant_id=>t,p_include_warehouse=>true,p_due_from=>now()+interval '100 years');
  IF result->>'total' IS DISTINCT FROM '0' THEN RAISE EXCEPTION 'Due date filter regression'; END IF;
  result := public.list_supplier_payment_requests(p_tenant_id=>t,p_include_warehouse=>true,p_tenant_supplier_id=>r,p_status=>'partially_paid',p_destination_type=>'warehouse',p_warehouse_id=>w);
  IF result->>'total' IS DISTINCT FROM '1' THEN RAISE EXCEPTION 'Request combined filters mismatch'; END IF;
  result := public.list_supplier_payment_requests(p_tenant_id=>t,p_include_warehouse=>true,p_keyword=>'does-not-exist');
  IF result->>'total' IS DISTINCT FROM '0' THEN RAISE EXCEPTION 'Request keyword filter regression'; END IF;
  result := public.list_supplier_payment_requests(p_tenant_id=>t,p_include_warehouse=>true,p_created_from=>now()+interval '1 day');
  IF result->>'total' IS DISTINCT FROM '0' THEN RAISE EXCEPTION 'Request date filter regression'; END IF;
  IF public.get_supplier_payables_by_ids(t,'{}',ARRAY[gen_random_uuid()],true) IS DISTINCT FROM '[]'::jsonb
    OR public.get_supplier_payment_request_detail(t,gen_random_uuid()) IS NOT NULL
    OR public.list_supplier_payment_request_payments(t,gen_random_uuid())->>'total' IS DISTINCT FROM '0' THEN
    RAISE EXCEPTION 'Missing fact response mismatch';
  END IF;
  BEGIN
    PERFORM public.get_supplier_payables_by_ids(t,NULL,ARRAY[payable_ids[1],payable_ids[1]],true);
    RAISE EXCEPTION 'Duplicate batch ids accepted';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM<>'SUPPLIER_PAYMENT_BATCH_IDS_INVALID' THEN RAISE; END IF;
  END;

  -- Nullable legacy composite FKs do not constrain these warehouse edges.
  -- Read paths must nevertheless not expose another warehouse's facts.
  PERFORM set_config('app.supplier_payment_command','on',true);
  allocation_id := gen_random_uuid(); payment_id := gen_random_uuid();
  INSERT INTO public.supplier_payment_request_allocations(id,tenant_id,payment_request_id,payable_event_id,requested_amount,paid_amount)
    VALUES(allocation_id,t,request_ids[1],payable_ids[2],1,0);
  INSERT INTO public.supplier_payments(id,tenant_id,destination_type,project_id,warehouse_id,tenant_supplier_id,supplier_id,payment_request_id,
    amount,payment_method,payment_reference,paid_at,evidence_images,confirmed_by_employee_id,idempotency_key)
    VALUES(payment_id,t,'warehouse',NULL,w2,r,s,request_ids[1],999,'bank_transfer','hidden-warehouse-payment',now(),'["secret"]',e,gen_random_uuid());
  -- B payment references A request: test both a B payable (request mismatch)
  -- and an A payable (payment mismatch), without bypassing any constraints.
  INSERT INTO public.supplier_payment_allocations(id,tenant_id,supplier_payment_id,payment_request_id,payment_request_allocation_id,payable_event_id,amount)
    VALUES(gen_random_uuid(),t,payment_id,request_ids[1],allocation_id,payable_ids[2],7);
  SELECT id INTO STRICT allocation_id FROM public.supplier_payment_request_allocations
    WHERE payment_request_id=request_ids[1] AND payable_event_id=payable_ids[1];
  INSERT INTO public.supplier_payment_allocations(id,tenant_id,supplier_payment_id,payment_request_id,payment_request_allocation_id,payable_event_id,amount)
    VALUES(gen_random_uuid(),t,payment_id,request_ids[1],allocation_id,payable_ids[1],11);
  IF jsonb_array_length(public.get_supplier_payment_request_detail(t,request_ids[1])->'allocations')<>1
    OR public.list_supplier_payment_request_payments(t,request_ids[1])->>'total' IS DISTINCT FROM '1' THEN
    RAISE EXCEPTION 'Cross-warehouse financial edge leaked';
  END IF;
  FOREACH rpc IN ARRAY ARRAY['get_supplier_payables_by_ids','list_supplier_payables'] LOOP
    IF rpc='get_supplier_payables_by_ids' THEN
      result := public.get_supplier_payables_by_ids(t,ARRAY[p],payable_ids[1:2],true);
    ELSE
      result := public.list_supplier_payables(p_tenant_id=>t,p_visible_project_ids=>ARRAY[p],p_include_warehouse=>true,p_destination_type=>'warehouse')->'items';
    END IF;
    IF jsonb_array_length(result) IS DISTINCT FROM 2 THEN RAISE EXCEPTION 'Aggregate guard removed visible payables: %',rpc; END IF;
    FOR row_data IN SELECT * FROM jsonb_array_elements(result) LOOP
      IF row_data->>'reserved_amount' IS DISTINCT FROM '15.00' OR row_data->>'paid_amount' IS DISTINCT FROM '5.00'
        OR row_data->>'open_amount' IS DISTINCT FROM '95.00' THEN
        RAISE EXCEPTION 'Malformed financial edges polluted payable aggregates: % %',rpc,row_data;
      END IF;
    END LOOP;
  END LOOP;
  PERFORM set_config('app.supplier_payment_command','off',true);

  FOR signature IN SELECT oid::regprocedure::text FROM pg_proc WHERE pronamespace='public'::regnamespace
    AND proname=ANY(ARRAY['list_supplier_payables','get_supplier_payables_by_ids','list_supplier_payable_filter_options',
      'list_supplier_payment_requests','get_supplier_payment_request_detail','list_supplier_payment_request_payments']) LOOP
    IF has_function_privilege('anon',signature,'EXECUTE') OR has_function_privilege('authenticated',signature,'EXECUTE')
      OR NOT has_function_privilege('service_role',signature,'EXECUTE') THEN RAISE EXCEPTION 'Read RPC ACL regression: %',signature; END IF;
  END LOOP;
END;
$facts$;
ROLLBACK;
