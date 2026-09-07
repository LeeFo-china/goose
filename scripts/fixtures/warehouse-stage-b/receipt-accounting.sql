BEGIN;
CREATE FUNCTION pg_temp.reject_stage_b_receipt_payable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='INVENTORY_SOURCE_CONFLICT';
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
  order_id uuid; order_item_id uuid; receipt_id uuid := gen_random_uuid();
  received_at timestamptz := now(); fulfillment_version integer; receipt_items jsonb;
  second_receipt uuid := gen_random_uuid(); legacy_order uuid; legacy_item uuid;
  fractional_sku uuid := gen_random_uuid(); fractional_product uuid := gen_random_uuid(); fraction_index integer;
  result jsonb; items jsonb; source_document jsonb; source_item uuid;
  foreign_tenant uuid := gen_random_uuid(); foreign_user uuid := gen_random_uuid();
  foreign_employee uuid := gen_random_uuid(); foreign_warehouse uuid := gen_random_uuid();
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

  result := public.__gooes_submit_supplier_purchase_batch_destinations_v2(b,t,1,u,e,'receipt-submit',true);
  IF result->>'status' IS DISTINCT FROM 'submitted' THEN RAISE EXCEPTION 'Receipt fixture submit failed: %',result; END IF;
  result := public.__gooes_review_supplier_purchase_batch_destinations_v2(
    b,t,2,'approve',NULL,false,reviewer_user,reviewer,'receipt-review',true);
  IF result->>'status' IS DISTINCT FROM 'ordered' THEN RAISE EXCEPTION 'Receipt fixture review failed: %',result; END IF;
  order_id := (result->'orders'->0->>'id')::uuid;
  SELECT id INTO STRICT order_item_id FROM public.supplier_purchase_order_items WHERE supplier_purchase_order_id=order_id;
  result := public.confirm_supplier_purchase_order_fulfillment(order_id,t,2,received_at,NULL,u,e,'receipt-confirm');
  IF result->>'status' IS DISTINCT FROM 'confirmed' THEN RAISE EXCEPTION 'Receipt confirmation failed: %',result; END IF;
  SELECT version INTO STRICT fulfillment_version FROM public.supplier_purchase_order_fulfillments WHERE supplier_purchase_order_id=order_id;
  receipt_items := jsonb_build_array(jsonb_build_object('purchase_order_item_id',order_item_id,'accepted_quantity',3,'rejected_quantity',0));
  BEGIN
    UPDATE public.tenant_supplier_settings SET warehouse_procurement_enabled=false WHERE tenant_id=t;
    result := public.create_supplier_purchase_order_receipt(receipt_id,order_id,t,fulfillment_version,
      'STAGE-B-CLOSED',received_at,NULL,receipt_items,u,e,'receipt-closed');
    IF result->>'error_code' IS DISTINCT FROM 'WAREHOUSE_PROCUREMENT_NOT_ENABLED' THEN
      RAISE EXCEPTION 'Closed warehouse gate accepted receipt or returned wrong error: %',result;
    END IF;
    IF EXISTS(SELECT 1 FROM public.supplier_purchase_order_receipts WHERE id=receipt_id)
      OR EXISTS(SELECT 1 FROM public.inventory_transactions WHERE tenant_id=t)
      OR EXISTS(SELECT 1 FROM public.supplier_payable_events WHERE tenant_id=t)
      OR EXISTS(SELECT 1 FROM public.supplier_command_events WHERE actor_user_id=u AND idempotency_key='receipt-closed')
      OR (SELECT version FROM public.supplier_purchase_order_fulfillments WHERE supplier_purchase_order_id=order_id)<>fulfillment_version THEN
      RAISE EXCEPTION 'Failed receipt retained fulfillment/accounting facts';
    END IF;
    RAISE EXCEPTION USING ERRCODE='P9001',MESSAGE='rollback closed gate branch';
  EXCEPTION WHEN SQLSTATE 'P9001' THEN NULL;
  END;

  BEGIN
    UPDATE public.warehouses SET status='inactive',version=version+1 WHERE id=w;
    result := public.create_supplier_purchase_order_receipt(receipt_id,order_id,t,fulfillment_version,
      'STAGE-B-INACTIVE',received_at,NULL,receipt_items,u,e,'receipt-inactive');
    IF result->>'error_code' IS DISTINCT FROM 'WAREHOUSE_INACTIVE'
      OR EXISTS(SELECT 1 FROM public.supplier_purchase_order_receipts WHERE id=receipt_id) THEN
      RAISE EXCEPTION 'Inactive warehouse receipt did not roll back: %',result;
    END IF;
    RAISE EXCEPTION USING ERRCODE='P9001',MESSAGE='rollback inactive branch';
  EXCEPTION WHEN SQLSTATE 'P9001' THEN NULL;
  END;
  BEGIN
    CREATE TRIGGER stage_b_reject_payable BEFORE INSERT ON public.supplier_payable_events
      FOR EACH ROW EXECUTE FUNCTION pg_temp.reject_stage_b_receipt_payable();
    result := public.create_supplier_purchase_order_receipt(receipt_id,order_id,t,fulfillment_version,
      'STAGE-B-ROLLBACK',received_at,NULL,receipt_items,u,e,'receipt-rollback');
    IF result->>'error_code' IS DISTINCT FROM 'INVENTORY_SOURCE_CONFLICT'
      OR EXISTS(SELECT 1 FROM public.supplier_purchase_order_receipts WHERE id=receipt_id)
      OR EXISTS(SELECT 1 FROM public.inventory_transactions WHERE tenant_id=t)
      OR EXISTS(SELECT 1 FROM public.inventory_balances WHERE tenant_id=t)
      OR EXISTS(SELECT 1 FROM public.supplier_command_events WHERE actor_user_id=u AND idempotency_key='receipt-rollback')
      OR (SELECT version FROM public.supplier_purchase_order_fulfillments WHERE supplier_purchase_order_id=order_id)<>fulfillment_version THEN
      RAISE EXCEPTION 'Payable insertion failure did not roll back entire receipt: %',result;
    END IF;
    RAISE EXCEPTION USING ERRCODE='P9001',MESSAGE='rollback injected failure';
  EXCEPTION WHEN SQLSTATE 'P9001' THEN NULL;
  END;
  BEGIN
    result := public.create_supplier_purchase_order_receipt(receipt_id,order_id,t,fulfillment_version,
      'STAGE-B-REJECT',received_at,NULL,jsonb_build_array(jsonb_build_object(
        'purchase_order_item_id',order_item_id,'accepted_quantity',0,'rejected_quantity',10,'variance_reason','Damaged')),
      u,e,'receipt-rejected');
    IF result->>'status' IS DISTINCT FROM 'receipt_created'
      OR EXISTS(SELECT 1 FROM public.inventory_transactions WHERE tenant_id=t)
      OR EXISTS(SELECT 1 FROM public.supplier_payable_events WHERE tenant_id=t) THEN
      RAISE EXCEPTION 'Rejected quantities generated accounting facts: %',result;
    END IF;
    RAISE EXCEPTION USING ERRCODE='P9001',MESSAGE='rollback rejected branch';
  EXCEPTION WHEN SQLSTATE 'P9001' THEN NULL;
  END;

  result := public.create_supplier_purchase_order_receipt(receipt_id,order_id,t,fulfillment_version,
    'STAGE-B-PARTIAL',received_at,NULL,receipt_items,u,e,'receipt-partial');
  IF result->>'status' IS DISTINCT FROM 'receipt_created'
    OR (SELECT count(*) FROM public.inventory_transactions WHERE tenant_id=t AND quantity_delta=3 AND value_delta=30)<>1
    OR (SELECT count(*) FROM public.supplier_payable_events WHERE tenant_id=t AND destination_type='warehouse'
      AND project_id IS NULL AND warehouse_id=w AND amount=30 AND accepted_quantity=3)<>1
    OR (SELECT count(*) FROM public.inventory_balances WHERE tenant_id=t AND warehouse_id=w
      AND supplier_sku_id=sku AND quantity_on_hand=3 AND inventory_value=30 AND average_unit_cost=10)<>1 THEN
    RAISE EXCEPTION 'Partial receipt accounting mismatch: %',result;
  END IF;
  result := public.list_inventory_transactions(t,w,sku,'purchase_receipt',1,20);
  source_document := result->'items'->0->'source_document';
  IF result->>'total' IS DISTINCT FROM '1'
    OR source_document->>'receipt_id' IS DISTINCT FROM receipt_id::text
    OR source_document->>'receipt_no' IS DISTINCT FROM 'STAGE-B-PARTIAL'
    OR source_document->>'purchase_order_id' IS DISTINCT FROM order_id::text
    OR source_document->>'order_no' IS DISTINCT FROM (SELECT order_no FROM public.supplier_purchase_orders WHERE id=order_id) THEN
    RAISE EXCEPTION 'Inventory source document unavailable or wrong: %',result;
  END IF;
  source_item := (result->'items'->0->>'source_id')::uuid;
  result := public.list_inventory_transactions(t,w,sku,'purchase_receipt',2,1);
  IF result->>'total' IS DISTINCT FROM '1' OR result->'items' IS DISTINCT FROM '[]'::jsonb THEN
    RAISE EXCEPTION 'Inventory source join changed out-of-range pagination: %',result;
  END IF;
  BEGIN
    -- Simulate a malformed imported reference without changing or bypassing
    -- the immutable source ledger, constraints, triggers, or grants.
    INSERT INTO public.tenants(id,name,slug) VALUES(foreign_tenant,'Other inventory tenant','stage-b-other-inventory');
    INSERT INTO auth.users(id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data)
      VALUES(foreign_user,'authenticated','authenticated','other-inventory@smoke.invalid','','{}','{}');
    INSERT INTO public.employees(id,tenant_id,user_id,name,status)
      VALUES(foreign_employee,foreign_tenant,foreign_user,'Other operator','active');
    INSERT INTO public.warehouses(id,tenant_id,name) VALUES(foreign_warehouse,foreign_tenant,'Other tenant warehouse');
    INSERT INTO public.inventory_transactions(tenant_id,warehouse_id,supplier_sku_id,transaction_type,
      quantity_delta,unit_cost,value_delta,source_type,source_id,occurred_at,created_by_employee_id)
      VALUES(foreign_tenant,foreign_warehouse,sku,'purchase_receipt',1,10,10,
        'supplier_purchase_receipt_item',source_item,received_at,foreign_employee);
    result := public.list_inventory_transactions(foreign_tenant,foreign_warehouse,sku,'purchase_receipt',1,20);
    IF result->>'total' IS DISTINCT FROM '1'
      OR result->'items'->0->'source_document' IS DISTINCT FROM 'null'::jsonb THEN
      RAISE EXCEPTION 'Inventory source exposed another tenant or hid its own ledger row: %',result;
    END IF;
    INSERT INTO public.inventory_transactions(tenant_id,warehouse_id,supplier_sku_id,transaction_type,
      quantity_delta,unit_cost,value_delta,source_type,source_id,occurred_at,created_by_employee_id)
      VALUES(foreign_tenant,foreign_warehouse,sku,'purchase_receipt',1,10,10,
        'supplier_purchase_receipt_item',gen_random_uuid(),received_at,foreign_employee);
    result := public.list_inventory_transactions(foreign_tenant,foreign_warehouse,sku,'purchase_receipt',1,20);
    IF result->>'total' IS DISTINCT FROM '2' OR EXISTS(
      SELECT 1 FROM jsonb_array_elements(result->'items') AS row_data
      WHERE row_data->'source_document' IS DISTINCT FROM 'null'::jsonb
    ) THEN RAISE EXCEPTION 'Unresolved source did not preserve ledger row: %',result; END IF;
    RAISE EXCEPTION USING ERRCODE='P9001',MESSAGE='rollback source isolation fixture';
  EXCEPTION WHEN SQLSTATE 'P9001' THEN NULL;
  END;
  IF has_function_privilege('anon','public.list_inventory_transactions(uuid,uuid,uuid,text,integer,integer)','EXECUTE')
    OR has_function_privilege('authenticated','public.list_inventory_transactions(uuid,uuid,uuid,text,integer,integer)','EXECUTE')
    OR NOT has_function_privilege('service_role','public.list_inventory_transactions(uuid,uuid,uuid,text,integer,integer)','EXECUTE') THEN
    RAISE EXCEPTION 'Inventory source read changed service-only ACL';
  END IF;
  BEGIN
    UPDATE public.tenant_supplier_settings SET warehouse_procurement_enabled=false WHERE tenant_id=t;
    UPDATE public.warehouses SET status='inactive',version=version+1 WHERE id=w;
    result := public.list_inventory_transactions(t,w,sku,'purchase_receipt',1,20);
    IF result->'items'->0->'source_document'->>'receipt_id' IS DISTINCT FROM receipt_id::text THEN
      RAISE EXCEPTION 'Operational flags hid historical inventory source: %',result;
    END IF;
    result := public.create_supplier_purchase_order_receipt(receipt_id,order_id,t,fulfillment_version,
      'STAGE-B-PARTIAL',received_at,NULL,receipt_items,u,e,'receipt-partial');
    IF result->>'idempotent' IS DISTINCT FROM 'true'
      OR (SELECT count(*) FROM public.inventory_transactions WHERE tenant_id=t)<>1
      OR (SELECT count(*) FROM public.supplier_payable_events WHERE tenant_id=t)<>1 THEN
      RAISE EXCEPTION 'Successful receipt replay duplicated facts or rechecked operational gate: %',result;
    END IF;
    RAISE EXCEPTION USING ERRCODE='P9001',MESSAGE='rollback replay branch';
  EXCEPTION WHEN SQLSTATE 'P9001' THEN NULL;
  END;
  receipt_items := jsonb_build_array(jsonb_build_object('purchase_order_item_id',order_item_id,'accepted_quantity',7,'rejected_quantity',0));
  result := public.create_supplier_purchase_order_receipt(second_receipt,order_id,t,fulfillment_version+1,
    'STAGE-B-FINAL',received_at,NULL,receipt_items,u,e,'receipt-final');
  IF result->>'status' IS DISTINCT FROM 'receipt_created'
    OR result->'fulfillment'->>'status' IS DISTINCT FROM 'received'
    OR (SELECT sum(value_delta) FROM public.inventory_transactions WHERE tenant_id=t)<>100
    OR (SELECT sum(amount) FROM public.supplier_payable_events WHERE tenant_id=t)<>100
    OR (SELECT count(*) FROM public.inventory_balances WHERE tenant_id=t AND quantity_on_hand=10
      AND inventory_value=100 AND average_unit_cost=10)<>1
    OR EXISTS(SELECT 1 FROM public.project_cost_events WHERE tenant_id=t)
    OR EXISTS(SELECT 1 FROM public.project_cost_commitments WHERE tenant_id=t) THEN
    RAISE EXCEPTION 'Final warehouse receipt accounting mismatch: %',result;
  END IF;

  INSERT INTO public.project_cost_budgets(tenant_id,project_id,cost_category_id,budget_amount,created_by,updated_by)
    VALUES(t,p,cost,10000,e,e);
  result := public.save_supplier_purchase_batch_draft(legacy_batch,t,p,0,'Project receipt',NULL,NULL,items,u,e,'project-save');
  IF result->>'status' IS DISTINCT FROM 'saved' THEN RAISE EXCEPTION 'Project draft failed: %',result; END IF;
  result := public.submit_supplier_purchase_batch(legacy_batch,t,1,u,e,'project-submit');
  IF result->>'status' IS DISTINCT FROM 'submitted' THEN RAISE EXCEPTION 'Project submit failed: %',result; END IF;
  result := public.review_supplier_purchase_batch(legacy_batch,t,2,'approve',NULL,false,reviewer_user,reviewer,'project-review');
  IF result->>'status' IS DISTINCT FROM 'ordered' THEN RAISE EXCEPTION 'Project review failed: %',result; END IF;
  legacy_order := (result->'orders'->0->>'id')::uuid;
  SELECT id INTO STRICT legacy_item FROM public.supplier_purchase_order_items WHERE supplier_purchase_order_id=legacy_order;
  result := public.confirm_supplier_purchase_order_fulfillment(legacy_order,t,2,received_at,NULL,u,e,'project-confirm');
  IF result->>'status' IS DISTINCT FROM 'confirmed' THEN RAISE EXCEPTION 'Project confirm failed: %',result; END IF;
  result := public.create_supplier_purchase_order_receipt(gen_random_uuid(),legacy_order,t,1,
    'STAGE-B-PROJECT',received_at,NULL,jsonb_build_array(jsonb_build_object(
      'purchase_order_item_id',legacy_item,'accepted_quantity',10,'rejected_quantity',0)),u,e,'project-receipt');
  IF result->>'status' IS DISTINCT FROM 'receipt_created'
    OR (SELECT count(*) FROM public.project_cost_events WHERE tenant_id=t AND project_id=p AND amount=100)<>1
    OR (SELECT count(*) FROM public.supplier_payable_events WHERE tenant_id=t AND project_id=p
      AND destination_type='project' AND warehouse_id IS NULL AND amount=100)<>1
    OR (SELECT count(*) FROM public.project_cost_commitments WHERE tenant_id=t AND project_id=p
      AND status='consumed' AND recognized_amount=100)<>1
    OR (SELECT count(*) FROM public.inventory_transactions WHERE tenant_id=t)<>2 THEN
    RAISE EXCEPTION 'Project receipt accounting regression: %',result;
  END IF;

  -- 0.3 units x 0.05 = frozen 0.02. Three 0.1 receipts allocate 0.01,
  -- 0.00, 0.01, exercising cumulative rounding and the final tail in real RPCs.
  result := public.command_supplier_purchasable_product_v1(fractional_product,fractional_sku,t,r,s,
    jsonb_build_object('product_code','TP-' || left(replace(fractional_product::text,'-',''),16),'name','Fraction','category_id',c,'brand_id',brand),
    jsonb_build_object('sku_code','TS-' || left(replace(fractional_sku::text,'-',''),16),'name','Fraction','purchase_unit_id',unit_id,'spec_values','{}'::jsonb),
    '{"unit_price":"0.05","tax_rate":"0.130000","tax_inclusive":true}'::jsonb,u,e,'fraction-product');
  IF result->>'status' IS DISTINCT FROM 'created' THEN RAISE EXCEPTION 'Fraction product failed: %',result; END IF;
  b := gen_random_uuid();
  result := public.save_supplier_purchase_batch_draft(b,t,NULL,0,'Fraction receipt',NULL,NULL,
    jsonb_build_array(jsonb_build_object('supplier_sku_id',fractional_sku,'cost_category_id',cost,'quantity','0.3')),
    u,e,'fraction-save','warehouse',w);
  IF result->>'status' IS DISTINCT FROM 'saved' THEN RAISE EXCEPTION 'Fraction draft failed: %',result; END IF;
  result := public.__gooes_submit_supplier_purchase_batch_destinations_v2(b,t,1,u,e,'fraction-submit',true);
  IF result->>'status' IS DISTINCT FROM 'submitted' THEN RAISE EXCEPTION 'Fraction submit failed: %',result; END IF;
  result := public.__gooes_review_supplier_purchase_batch_destinations_v2(b,t,2,'approve',NULL,false,reviewer_user,reviewer,'fraction-review',true);
  IF result->>'status' IS DISTINCT FROM 'ordered' THEN RAISE EXCEPTION 'Fraction review failed: %',result; END IF;
  order_id := (result->'orders'->0->>'id')::uuid;
  SELECT id INTO STRICT order_item_id FROM public.supplier_purchase_order_items WHERE supplier_purchase_order_id=order_id;
  result := public.confirm_supplier_purchase_order_fulfillment(order_id,t,2,received_at,NULL,u,e,'fraction-confirm');
  IF result->>'status' IS DISTINCT FROM 'confirmed' THEN RAISE EXCEPTION 'Fraction confirm failed: %',result; END IF;
  FOR fraction_index IN 1..3 LOOP
    receipt_id := gen_random_uuid();
    result := public.create_supplier_purchase_order_receipt(receipt_id,order_id,t,fraction_index,
      'STAGE-B-FRACTION-' || fraction_index,received_at,NULL,jsonb_build_array(jsonb_build_object(
        'purchase_order_item_id',order_item_id,'accepted_quantity',0.1,'rejected_quantity',0)),u,e,'fraction-receipt-' || fraction_index);
    IF result->>'status' IS DISTINCT FROM 'receipt_created'
      OR (SELECT amount FROM public.supplier_payable_events WHERE supplier_purchase_order_receipt_id=receipt_id)
        IS DISTINCT FROM (CASE WHEN fraction_index=2 THEN 0 ELSE 0.01 END) THEN
      RAISE EXCEPTION 'Fraction receipt allocation failed at %: %',fraction_index,result;
    END IF;
  END LOOP;
  IF (SELECT count(*) FROM public.inventory_balances WHERE tenant_id=t AND warehouse_id=w AND supplier_sku_id=fractional_sku
      AND quantity_on_hand=0.3 AND inventory_value=0.02 AND average_unit_cost=0.0667)<>1
    OR (SELECT sum(value_delta) FROM public.inventory_transactions WHERE tenant_id=t AND supplier_sku_id=fractional_sku)<>0.02 THEN
    RAISE EXCEPTION 'Fraction final balance/value/weighted average mismatch';
  END IF;
END;
$test$;
ROLLBACK;
