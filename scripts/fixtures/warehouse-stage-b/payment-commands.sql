BEGIN;
-- Synthetic malformed historical edge: valid B request/payment, but an A AP.
-- Keep every production constraint active; paid=0 isolates reservations,
-- paid>0 uses a closed request to isolate paid-amount aggregation.
CREATE FUNCTION pg_temp.seed_payment_scope_noise(t uuid,w uuid,r uuid,s uuid,e uuid,reviewer uuid,payable uuid,paid numeric)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE request_id uuid:=gen_random_uuid(); allocation_id uuid:=gen_random_uuid(); payment_id uuid:=gen_random_uuid();
BEGIN
  PERFORM set_config('app.supplier_payment_command','on',true);
  INSERT INTO public.supplier_payment_requests(id,tenant_id,destination_type,project_id,warehouse_id,tenant_supplier_id,supplier_id,
    status,requested_amount,paid_amount,reason,created_by_employee_id,updated_by_employee_id,submitted_by_employee_id,submitted_at,
    reviewed_by_employee_id,reviewed_at,closed_by_employee_id,closed_at,close_reason)
    VALUES(request_id,t,'warehouse',NULL,w,r,s,CASE WHEN paid=0 THEN 'approved' ELSE 'closed' END,100,paid,'Historical noise',e,e,e,now(),reviewer,now(),
      CASE WHEN paid>0 THEN e ELSE NULL END,CASE WHEN paid>0 THEN now() ELSE NULL END,CASE WHEN paid>0 THEN 'Closed noise' ELSE NULL END);
  INSERT INTO public.supplier_payment_request_allocations(id,tenant_id,payment_request_id,payable_event_id,requested_amount,paid_amount)
    VALUES(allocation_id,t,request_id,payable,100,paid);
  IF paid>0 THEN
    INSERT INTO public.supplier_payments(id,tenant_id,destination_type,project_id,warehouse_id,tenant_supplier_id,supplier_id,payment_request_id,
      amount,payment_method,payment_reference,paid_at,evidence_images,confirmed_by_employee_id,idempotency_key)
      VALUES(payment_id,t,'warehouse',NULL,w,r,s,request_id,paid,'bank_transfer','Historical noise',now(),'["proof"]',e,gen_random_uuid());
    INSERT INTO public.supplier_payment_allocations(tenant_id,supplier_payment_id,payment_request_id,payment_request_allocation_id,payable_event_id,amount)
      VALUES(t,payment_id,request_id,allocation_id,payable,paid);
  END IF;
  PERFORM set_config('app.supplier_payment_command','off',true);
END;
$$;
DO $test$
DECLARE
  t uuid := gen_random_uuid(); u uuid := gen_random_uuid(); e uuid := gen_random_uuid();
  w uuid := gen_random_uuid(); p uuid := gen_random_uuid(); b uuid := gen_random_uuid();
  s uuid := gen_random_uuid(); r uuid := gen_random_uuid(); c uuid := gen_random_uuid();
  brand uuid := gen_random_uuid(); unit_id uuid := gen_random_uuid(); cost uuid := gen_random_uuid();
  product uuid := gen_random_uuid(); sku uuid := gen_random_uuid();
  legacy_batch uuid := gen_random_uuid(); other_warehouse uuid := gen_random_uuid();
  reviewer_user uuid := gen_random_uuid(); reviewer uuid := gen_random_uuid();
  order_id uuid; order_item uuid; receipt_id uuid := gen_random_uuid(); payable_id uuid;
  request_id uuid := gen_random_uuid(); save_key uuid := gen_random_uuid(); allocations jsonb;
  allocation_id uuid; payment_id uuid := gen_random_uuid(); payment_key uuid := gen_random_uuid(); paid_at timestamptz := now();
  result jsonb; items jsonb; error_result jsonb; legacy_fingerprint jsonb; signature text; noise_paid integer; partial_result jsonb;
  error_key uuid := gen_random_uuid(); error_payment uuid := gen_random_uuid(); scope_key uuid;
  legacy_request uuid := gen_random_uuid(); legacy_save_key uuid := gen_random_uuid(); legacy_payment uuid := gen_random_uuid();
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

  result := public.__gooes_submit_supplier_purchase_batch_destinations_v2(b,t,1,u,e,'payment-submit',true);
  IF result->>'status' IS DISTINCT FROM 'submitted' THEN RAISE EXCEPTION 'Batch submit failed: %',result; END IF;
  result := public.__gooes_review_supplier_purchase_batch_destinations_v2(b,t,2,'approve',NULL,false,reviewer_user,reviewer,'payment-review',true);
  IF result->>'status' IS DISTINCT FROM 'ordered' THEN RAISE EXCEPTION 'Batch review failed: %',result; END IF;
  order_id := (result->'orders'->0->>'id')::uuid;
  SELECT id INTO STRICT order_item FROM public.supplier_purchase_order_items WHERE supplier_purchase_order_id=order_id;
  result := public.confirm_supplier_purchase_order_fulfillment(order_id,t,2,now(),NULL,u,e,'payment-confirm-order');
  IF result->>'status' IS DISTINCT FROM 'confirmed' THEN RAISE EXCEPTION 'Order confirm failed: %',result; END IF;
  result := public.create_supplier_purchase_order_receipt(receipt_id,order_id,t,1,'PAYMENT-COMMAND',now(),NULL,
    jsonb_build_array(jsonb_build_object('purchase_order_item_id',order_item,'accepted_quantity',10,'rejected_quantity',0)),u,e,'payment-receipt');
  IF result->>'status' IS DISTINCT FROM 'receipt_created' THEN RAISE EXCEPTION 'Receipt failed: %',result; END IF;
  SELECT id INTO STRICT payable_id FROM public.supplier_payable_events WHERE supplier_purchase_order_receipt_id=receipt_id;
  allocations := jsonb_build_array(jsonb_build_object('payable_event_id',payable_id,'requested_amount','100.00'));
  UPDATE public.tenant_supplier_settings SET warehouse_procurement_enabled=false WHERE tenant_id=t;
  UPDATE public.warehouses SET status='inactive',version=version+1 WHERE id=w;
  result := public.save_supplier_payment_request_draft(request_id,t,NULL,r,0,'Warehouse liability',NULL,allocations,u,e,save_key,'warehouse',w);
  IF result->>'status' IS DISTINCT FROM 'saved'
    OR result->'payment_request'->>'destination_type' IS DISTINCT FROM 'warehouse'
    OR result->'payment_request'->>'warehouse_id' IS DISTINCT FROM w::text
    OR result->'payment_request'->'project_id' IS DISTINCT FROM 'null'::jsonb THEN
    RAISE EXCEPTION 'Warehouse payment draft rejected existing liability or lost destination: %',result;
  END IF;
  result := public.save_supplier_payment_request_draft(request_id,t,NULL,r,0,'Warehouse liability',NULL,allocations,u,e,save_key,'warehouse',w);
  IF result->>'idempotent' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Warehouse draft replay failed: %',result; END IF;
  result := public.save_supplier_payment_request_draft(request_id,t,NULL,r,0,'Warehouse liability',NULL,allocations,u,e,save_key,'warehouse',other_warehouse);
  IF result->>'status' IS DISTINCT FROM 'idempotency_conflict' THEN RAISE EXCEPTION 'Warehouse omitted from fingerprint: %',result; END IF;
  result := public.save_supplier_payment_request_draft(gen_random_uuid(),t,NULL,r,0,'Wrong destination',NULL,allocations,u,e,gen_random_uuid(),'warehouse',other_warehouse);
  IF result->>'status' IS DISTINCT FROM 'scope_mismatch' THEN RAISE EXCEPTION 'Cross warehouse draft accepted: %',result; END IF;
  BEGIN
    -- Reproduce a malformed historical header while all existing constraints
    -- remain active. Commands must reject its allocation's different warehouse.
    PERFORM set_config('app.supplier_payment_command','on',true);
    UPDATE public.supplier_payment_requests SET warehouse_id=other_warehouse WHERE id=request_id;
    scope_key := gen_random_uuid();
    result := public.submit_supplier_payment_request(request_id,t,1,u,e,scope_key);
    IF result->>'status' IS DISTINCT FROM 'scope_mismatch' THEN RAISE EXCEPTION 'Cross warehouse submit accepted: %',result; END IF;
    UPDATE public.supplier_payment_requests SET warehouse_id=w WHERE id=request_id;
    IF public.submit_supplier_payment_request(request_id,t,1,u,e,scope_key) IS DISTINCT FROM result THEN
      RAISE EXCEPTION 'Scope failure replay did not remain frozen after header repair';
    END IF;
    RAISE EXCEPTION USING ERRCODE='P9001',MESSAGE='rollback malformed submit';
  EXCEPTION WHEN SQLSTATE 'P9001' THEN NULL;
  END;
  FOREACH noise_paid IN ARRAY ARRAY[0,80] LOOP
    BEGIN
      PERFORM pg_temp.seed_payment_scope_noise(t,other_warehouse,r,s,e,reviewer,payable_id,noise_paid);
      result := public.submit_supplier_payment_request(request_id,t,1,u,e,gen_random_uuid());
      IF result->>'status' IS DISTINCT FROM 'submitted' THEN RAISE EXCEPTION 'Unrelated warehouse financial edge blocked submit (paid=%): %',noise_paid,result; END IF;
      RAISE EXCEPTION USING ERRCODE='P9001',MESSAGE='rollback noisy submit';
    EXCEPTION WHEN SQLSTATE 'P9001' THEN NULL;
    END;
  END LOOP;
  BEGIN
    PERFORM pg_temp.seed_payment_scope_noise(t,w,r,s,e,reviewer,payable_id,0);
    result := public.submit_supplier_payment_request(request_id,t,1,u,e,gen_random_uuid());
    IF result->>'status' IS DISTINCT FROM 'amount_unavailable' THEN RAISE EXCEPTION 'Valid competing reservation was ignored: %',result; END IF;
    RAISE EXCEPTION USING ERRCODE='P9001',MESSAGE='rollback valid reservation';
  EXCEPTION WHEN SQLSTATE 'P9001' THEN NULL;
  END;
  result := public.submit_supplier_payment_request(request_id,t,1,u,e,gen_random_uuid());
  IF result->>'status' IS DISTINCT FROM 'submitted' OR result->'payment_request'->>'destination_type' IS DISTINCT FROM 'warehouse' THEN
    RAISE EXCEPTION 'Warehouse request submit failed: %',result;
  END IF;
  result := public.review_supplier_payment_request(request_id,t,2,'approve',NULL,u,e,gen_random_uuid());
  IF result->>'status' IS DISTINCT FROM 'self_review' THEN RAISE EXCEPTION 'Warehouse request self-review allowed: %',result; END IF;
  BEGIN
    result := public.review_supplier_payment_request(request_id,t,2,'reject','Revise request',reviewer_user,reviewer,gen_random_uuid());
    IF result->>'status' IS DISTINCT FROM 'rejected' OR result->'payment_request'->>'warehouse_id' IS DISTINCT FROM w::text THEN
      RAISE EXCEPTION 'Warehouse reject failed: %',result;
    END IF;
    RAISE EXCEPTION USING ERRCODE='P9001',MESSAGE='rollback reject branch';
  EXCEPTION WHEN SQLSTATE 'P9001' THEN NULL;
  END;
  result := public.review_supplier_payment_request(request_id,t,2,'approve',NULL,reviewer_user,reviewer,gen_random_uuid());
  IF result->>'status' IS DISTINCT FROM 'approved' THEN RAISE EXCEPTION 'Warehouse approval failed: %',result; END IF;
  BEGIN
    result := public.cancel_supplier_payment_request(request_id,t,3,'Cancel before payment',u,e,gen_random_uuid());
    IF result->>'status' IS DISTINCT FROM 'cancelled' OR result->'payment_request'->>'warehouse_id' IS DISTINCT FROM w::text THEN
      RAISE EXCEPTION 'Warehouse cancel failed: %',result;
    END IF;
    RAISE EXCEPTION USING ERRCODE='P9001',MESSAGE='rollback cancel branch';
  EXCEPTION WHEN SQLSTATE 'P9001' THEN NULL;
  END;
  SELECT id INTO STRICT allocation_id FROM public.supplier_payment_request_allocations WHERE payment_request_id=request_id;
  allocations := jsonb_build_array(jsonb_build_object('payment_request_allocation_id',allocation_id,'payable_event_id',payable_id,'amount','30.00'));
  error_result := public.confirm_supplier_payment(error_payment,request_id,t,3,'bank_transfer','MISSING-PROOF',paid_at,
    '[]',NULL,allocations,u,e,error_key);
  IF error_result->>'status' IS DISTINCT FROM 'evidence_required' THEN RAISE EXCEPTION 'Missing proof accepted: %',error_result; END IF;
  result := public.confirm_supplier_payment(error_payment,request_id,t,3,'bank_transfer','MISSING-PROOF',paid_at,
    '["https://smoke.invalid/proof"]',NULL,allocations,u,e,error_key);
  IF result->>'status' IS DISTINCT FROM 'idempotency_conflict' THEN RAISE EXCEPTION 'Changed error fingerprint accepted: %',result; END IF;
  result := public.confirm_supplier_payment(gen_random_uuid(),request_id,t,3,'bank_transfer','OVERPAY',paid_at,
    '["https://smoke.invalid/proof"]',NULL,jsonb_build_array(jsonb_build_object(
      'payment_request_allocation_id',allocation_id,'payable_event_id',payable_id,'amount','100.01')),u,e,gen_random_uuid());
  IF result->>'status' IS DISTINCT FROM 'allocation_invalid' OR EXISTS(SELECT 1 FROM public.supplier_payments WHERE payment_request_id=request_id) THEN
    RAISE EXCEPTION 'Overpayment was not rejected atomically: %',result;
  END IF;
  result := public.confirm_supplier_payment(gen_random_uuid(),request_id,t,2,'bank_transfer','STALE-VERSION',paid_at,
    '["https://smoke.invalid/proof"]',NULL,allocations,u,e,gen_random_uuid());
  IF result->>'status' IS DISTINCT FROM 'version_conflict' THEN RAISE EXCEPTION 'Stale payment version accepted: %',result; END IF;
  BEGIN
    PERFORM set_config('app.supplier_payment_command','on',true);
    UPDATE public.supplier_payment_requests SET warehouse_id=other_warehouse WHERE id=request_id;
    result := public.confirm_supplier_payment(gen_random_uuid(),request_id,t,3,'bank_transfer','WRONG-WAREHOUSE',paid_at,
      '["https://smoke.invalid/proof"]',NULL,allocations,u,e,gen_random_uuid());
    IF result->>'status' IS DISTINCT FROM 'scope_mismatch' THEN RAISE EXCEPTION 'Cross warehouse payment accepted: %',result; END IF;
    IF EXISTS(SELECT 1 FROM public.supplier_payments WHERE payment_request_id=request_id) THEN RAISE EXCEPTION 'Failed scope wrote payment'; END IF;
    RAISE EXCEPTION USING ERRCODE='P9001',MESSAGE='rollback malformed payment';
  EXCEPTION WHEN SQLSTATE 'P9001' THEN NULL;
  END;
  BEGIN
    PERFORM pg_temp.seed_payment_scope_noise(t,other_warehouse,r,s,e,reviewer,payable_id,80);
    result := public.confirm_supplier_payment(gen_random_uuid(),request_id,t,3,'bank_transfer','NOISY-PAYMENT',paid_at,
      '["https://smoke.invalid/proof"]',NULL,allocations,u,e,gen_random_uuid());
    IF result->>'status' IS DISTINCT FROM 'partially_paid' THEN RAISE EXCEPTION 'Unrelated warehouse paid amount blocked confirm: %',result; END IF;
    RAISE EXCEPTION USING ERRCODE='P9001',MESSAGE='rollback noisy confirm';
  EXCEPTION WHEN SQLSTATE 'P9001' THEN NULL;
  END;
  BEGIN
    PERFORM pg_temp.seed_payment_scope_noise(t,w,r,s,e,reviewer,payable_id,80);
    result := public.confirm_supplier_payment(gen_random_uuid(),request_id,t,3,'bank_transfer','VALID-PRIOR-PAYMENT',paid_at,
      '["https://smoke.invalid/proof"]',NULL,allocations,u,e,gen_random_uuid());
    IF result->>'status' IS DISTINCT FROM 'amount_unavailable' THEN RAISE EXCEPTION 'Valid prior payment was ignored: %',result; END IF;
    RAISE EXCEPTION USING ERRCODE='P9001',MESSAGE='rollback valid prior payment';
  EXCEPTION WHEN SQLSTATE 'P9001' THEN NULL;
  END;
  result := public.confirm_supplier_payment(payment_id,request_id,t,3,'bank_transfer','WAREHOUSE-30',paid_at,
    '["https://smoke.invalid/proof"]',NULL,allocations,u,e,payment_key);
  IF result->>'status' IS DISTINCT FROM 'partially_paid'
    OR result->'payment'->>'destination_type' IS DISTINCT FROM 'warehouse'
    OR result->'payment'->>'warehouse_id' IS DISTINCT FROM w::text
    OR result->'payment'->'project_id' IS DISTINCT FROM 'null'::jsonb THEN
    RAISE EXCEPTION 'Warehouse partial payment failed: %',result;
  END IF;
  partial_result := result;
  result := public.confirm_supplier_payment(payment_id,request_id,t,3,'bank_transfer','WAREHOUSE-30',paid_at,
    '["https://smoke.invalid/proof"]',NULL,allocations,u,e,payment_key);
  IF result->>'idempotent' IS DISTINCT FROM 'true' OR (SELECT count(*) FROM public.supplier_payments WHERE payment_request_id=request_id)<>1 THEN
    RAISE EXCEPTION 'Warehouse payment replay duplicated cash facts: %',result;
  END IF;
  result := public.confirm_supplier_payment(error_payment,request_id,t,3,'bank_transfer','MISSING-PROOF',paid_at,
    '[]',NULL,allocations,u,e,error_key);
  IF result IS DISTINCT FROM error_result THEN RAISE EXCEPTION 'Error replay changed after successful payment: %',result; END IF;
  BEGIN
    result := public.close_supplier_payment_request(request_id,t,4,'Close unpaid remainder',u,e,gen_random_uuid());
    IF result->>'status' IS DISTINCT FROM 'closed' OR result->'payment_request'->>'warehouse_id' IS DISTINCT FROM w::text THEN
      RAISE EXCEPTION 'Warehouse close failed: %',result;
    END IF;
    RAISE EXCEPTION USING ERRCODE='P9001',MESSAGE='rollback close branch';
  EXCEPTION WHEN SQLSTATE 'P9001' THEN NULL;
  END;
  allocations := jsonb_build_array(jsonb_build_object('payment_request_allocation_id',allocation_id,'payable_event_id',payable_id,'amount','70.00'));
  result := public.confirm_supplier_payment(gen_random_uuid(),request_id,t,4,'bank_transfer','WAREHOUSE-70',paid_at,
    '["https://smoke.invalid/proof"]',NULL,allocations,u,e,gen_random_uuid());
  IF result->>'status' IS DISTINCT FROM 'paid'
    OR (SELECT sum(amount) FROM public.supplier_payments WHERE payment_request_id=request_id)<>100
    OR (SELECT count(*) FROM public.finance_ledger_entries WHERE tenant_id=t AND source_type='supplier_payment' AND project_id IS NULL)<>2
    OR (SELECT count(*) FROM public.finance_ledger_entries WHERE tenant_id=t AND source_type='supplier_payment'
      AND metadata->>'destination_type'='warehouse' AND metadata->>'warehouse_id'=w::text)<>2
    OR EXISTS(SELECT 1 FROM public.project_cost_events WHERE tenant_id=t)
    OR EXISTS(SELECT 1 FROM public.project_cost_commitments WHERE tenant_id=t) THEN
    RAISE EXCEPTION 'Warehouse final payment/cash ledger/project isolation failed: %',result;
  END IF;
  result := public.confirm_supplier_payment(payment_id,request_id,t,3,'bank_transfer','WAREHOUSE-30',paid_at,
    '["https://smoke.invalid/proof"]',NULL,jsonb_build_array(jsonb_build_object(
      'payment_request_allocation_id',allocation_id,'payable_event_id',payable_id,'amount','30.00')),u,e,payment_key);
  IF result->>'idempotent' IS DISTINCT FROM 'true' OR result-'idempotent' IS DISTINCT FROM partial_result-'idempotent' THEN
    RAISE EXCEPTION 'Success replay drifted after final payment: %',result;
  END IF;
  BEGIN
    INSERT INTO public.supplier_payments(id,tenant_id,destination_type,project_id,warehouse_id,tenant_supplier_id,supplier_id,payment_request_id,
      amount,payment_method,payment_reference,paid_at,evidence_images,confirmed_by_employee_id,idempotency_key)
      VALUES(gen_random_uuid(),t,'warehouse',NULL,other_warehouse,r,s,request_id,1,'bank_transfer','wrong-warehouse-fk',paid_at,
        '["https://smoke.invalid/proof"]',e,gen_random_uuid());
    RAISE EXCEPTION 'Nullable project FK admitted cross-warehouse payment';
  EXCEPTION WHEN foreign_key_violation THEN
    IF SQLERRM NOT LIKE '%supplier_payments_request_warehouse_scope_fk%' THEN RAISE; END IF;
  END;

  -- The old eleven-argument project draft retains its exact request digest.
  -- Exercise real project receipt, request, approval and cash posting as well.
  INSERT INTO public.project_cost_budgets(tenant_id,project_id,cost_category_id,budget_amount,created_by,updated_by)
    VALUES(t,p,cost,10000,e,e);
  result := public.save_supplier_purchase_batch_draft(legacy_batch,t,p,0,'Legacy purchase',NULL,NULL,items,u,e,'legacy-payment-save');
  IF result->>'status' IS DISTINCT FROM 'saved' THEN RAISE EXCEPTION 'Legacy purchase save failed: %',result; END IF;
  result := public.submit_supplier_purchase_batch(legacy_batch,t,1,u,e,'legacy-payment-submit');
  IF result->>'status' IS DISTINCT FROM 'submitted' THEN RAISE EXCEPTION 'Legacy purchase submit failed: %',result; END IF;
  result := public.review_supplier_purchase_batch(legacy_batch,t,2,'approve',NULL,false,reviewer_user,reviewer,'legacy-payment-review');
  IF result->>'status' IS DISTINCT FROM 'ordered' THEN RAISE EXCEPTION 'Legacy purchase review failed: %',result; END IF;
  order_id := (result->'orders'->0->>'id')::uuid;
  SELECT id INTO STRICT order_item FROM public.supplier_purchase_order_items WHERE supplier_purchase_order_id=order_id;
  result := public.confirm_supplier_purchase_order_fulfillment(order_id,t,2,now(),NULL,u,e,'legacy-payment-confirm-order');
  IF result->>'status' IS DISTINCT FROM 'confirmed' THEN RAISE EXCEPTION 'Legacy order confirm failed: %',result; END IF;
  receipt_id := gen_random_uuid();
  result := public.create_supplier_purchase_order_receipt(receipt_id,order_id,t,1,'LEGACY-PAYMENT',now(),NULL,
    jsonb_build_array(jsonb_build_object('purchase_order_item_id',order_item,'accepted_quantity',10,'rejected_quantity',0)),u,e,'legacy-payment-receipt');
  IF result->>'status' IS DISTINCT FROM 'receipt_created' THEN RAISE EXCEPTION 'Legacy receipt failed: %',result; END IF;
  SELECT id INTO STRICT payable_id FROM public.supplier_payable_events WHERE supplier_purchase_order_receipt_id=receipt_id;
  allocations := jsonb_build_array(jsonb_build_object('payable_event_id',payable_id,'requested_amount','100.00'));
  result := public.save_supplier_payment_request_draft(legacy_request,t,p,r,0,'Legacy liability',NULL,allocations,u,e,legacy_save_key);
  IF result->>'status' IS DISTINCT FROM 'saved' OR result->'payment_request'->>'destination_type' IS DISTINCT FROM 'project'
    OR result->'payment_request'->>'project_id' IS DISTINCT FROM p::text OR result->'payment_request'->'warehouse_id' IS DISTINCT FROM 'null'::jsonb THEN
    RAISE EXCEPTION 'Legacy financial draft failed: %',result;
  END IF;
  legacy_fingerprint := jsonb_build_object('payment_request_id',legacy_request,'tenant_id',t,'project_id',p,'tenant_supplier_id',r,
    'expected_version',0,'reason','Legacy liability','remark',NULL,'allocations',allocations,'actor_employee_id',e);
  IF (SELECT from_state->'_request' FROM public.supplier_command_events WHERE actor_user_id=u AND idempotency_key=legacy_save_key::text)
    IS DISTINCT FROM legacy_fingerprint THEN RAISE EXCEPTION 'Legacy project draft fingerprint changed'; END IF;
  result := public.save_supplier_payment_request_draft(legacy_request,t,p,r,0,'Legacy liability',NULL,allocations,u,e,legacy_save_key,'project',NULL);
  IF result->>'idempotent' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Explicit project destination broke legacy replay'; END IF;
  result := public.save_supplier_payment_request_draft(legacy_request,t,p,r,0,'Legacy liability',NULL,allocations,u,e,legacy_save_key,'project',w);
  IF result->>'status' IS DISTINCT FROM 'idempotency_conflict' THEN RAISE EXCEPTION 'Invalid destination adopted old project fingerprint'; END IF;
  result := public.submit_supplier_payment_request(legacy_request,t,1,u,e,legacy_save_key);
  IF result->>'status' IS DISTINCT FROM 'idempotency_conflict' THEN RAISE EXCEPTION 'Global cross-command idempotency key collision accepted'; END IF;
  result := public.submit_supplier_payment_request(legacy_request,t,1,u,e,gen_random_uuid());
  IF result->>'status' IS DISTINCT FROM 'submitted' THEN RAISE EXCEPTION 'Legacy request submit failed: %',result; END IF;
  result := public.review_supplier_payment_request(legacy_request,t,2,'approve',NULL,reviewer_user,reviewer,gen_random_uuid());
  IF result->>'status' IS DISTINCT FROM 'approved' THEN RAISE EXCEPTION 'Legacy request approve failed: %',result; END IF;
  SELECT id INTO STRICT allocation_id FROM public.supplier_payment_request_allocations WHERE payment_request_id=legacy_request;
  allocations := jsonb_build_array(jsonb_build_object('payment_request_allocation_id',allocation_id,'payable_event_id',payable_id,'amount','100.00'));
  result := public.confirm_supplier_payment(legacy_payment,legacy_request,t,3,'bank_transfer','LEGACY-100',paid_at,
    '["https://smoke.invalid/proof"]',NULL,allocations,u,e,gen_random_uuid());
  IF result->>'status' IS DISTINCT FROM 'paid' OR result->'payment'->>'project_id' IS DISTINCT FROM p::text
    OR (SELECT count(*) FROM public.finance_ledger_entries WHERE source_type='supplier_payment' AND source_id=legacy_payment AND project_id=p)<>1
    OR (SELECT count(*) FROM public.project_cost_events WHERE tenant_id=t AND project_id=p AND amount=100)<>1
    OR (SELECT count(*) FROM public.project_cost_commitments WHERE tenant_id=t AND project_id=p AND status='consumed')<>1 THEN
    RAISE EXCEPTION 'Legacy payment/cost/commitment regression: %',result;
  END IF;
  FOR signature IN SELECT oid::regprocedure::text FROM pg_proc WHERE pronamespace='public'::regnamespace
    AND proname=ANY(ARRAY['save_supplier_payment_request_draft','submit_supplier_payment_request','review_supplier_payment_request',
      'cancel_supplier_payment_request','close_supplier_payment_request','confirm_supplier_payment']) LOOP
    IF has_function_privilege('anon',signature,'EXECUTE') OR has_function_privilege('authenticated',signature,'EXECUTE')
      OR NOT has_function_privilege('service_role',signature,'EXECUTE') THEN RAISE EXCEPTION 'Financial command ACL regression: %',signature; END IF;
  END LOOP;
END;
$test$;
ROLLBACK;
