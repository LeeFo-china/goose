-- Disposable offline runner only: actual price versioning and frozen order costs.
CREATE TABLE public.stage_b_weighted_cost_fixture(
  ordinal integer PRIMARY KEY, tenant_id uuid, warehouse_id uuid, sku_id uuid,
  order_id uuid, item_id uuid, actor_user_id uuid, actor_employee_id uuid, received_at timestamptz
);
BEGIN;
DO $test$
DECLARE
  t uuid := gen_random_uuid(); u uuid := gen_random_uuid(); e uuid := gen_random_uuid();
  w uuid := gen_random_uuid(); b uuid;
  s uuid := gen_random_uuid(); r uuid := gen_random_uuid(); c uuid := gen_random_uuid();
  brand uuid := gen_random_uuid(); unit_id uuid := gen_random_uuid(); cost uuid := gen_random_uuid();
  product uuid := gen_random_uuid(); sku uuid := gen_random_uuid();
  reviewer_user uuid := gen_random_uuid(); reviewer uuid := gen_random_uuid();
  order_id uuid; ordinal integer;
  result jsonb; items jsonb;
BEGIN
  INSERT INTO public.tenants(id,name,slug) VALUES (t,'Draft fixture','stage-b-weighted-cost');
  INSERT INTO auth.users(id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data)
    VALUES (u,'authenticated','authenticated','stage-b-weighted-cost@smoke.invalid','','{}','{}');
  INSERT INTO public.employees(id,tenant_id,user_id,name,status) VALUES(e,t,u,'Applicant','active');
  INSERT INTO public.warehouses(id,tenant_id,name) VALUES(w,t,'Warehouse');
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
    VALUES(c,'STAGE-B-WEIGHTED-COST-CATEGORY','Material','Material',1,e,e);
  INSERT INTO public.catalog_brands(id,code,name,created_by_employee_id,updated_by_employee_id)
    VALUES(brand,'STAGE-B-WEIGHTED-COST-BRAND','Brand',e,e);
  INSERT INTO public.catalog_units(id,code,name,symbol,created_by_employee_id,updated_by_employee_id)
    VALUES(unit_id,'STAGE-B-WEIGHTED-COST-UNIT','Piece','pc',e,e);
  INSERT INTO public.suppliers(id,code,name,legal_name,supplier_type,ownership_scope,owner_tenant_id,
    onboarding_status,operational_status,reviewed_by_employee_id,reviewed_at,created_by_employee_id,updated_by_employee_id)
    VALUES(s,'STAGE-B-WEIGHTED-COST-SUPPLIER','Supplier','Supplier','manufacturer','tenant',t,'approved','active',e,now(),e,e);
  INSERT INTO public.tenant_suppliers(id,tenant_id,supplier_id,relationship_status,default_currency,
    internal_supplier_code,started_at,created_by_employee_id,updated_by_employee_id)
    VALUES(r,t,s,'active','CNY','STAGE-B-WEIGHTED-COST-SUPPLIER',current_date,e,e);
  -- Match the current API repository: v2 generates the full system SKU code.
  result := public.command_supplier_purchasable_product_v2(product,sku,t,r,s,
    jsonb_build_object('product_code','TP-' || left(replace(product::text,'-',''),16),'name','Material','category_id',c,'brand_id',brand),
    jsonb_build_object('sku_code','TS-' || upper(replace(sku::text,'-','')),'name','Material','purchase_unit_id',unit_id,'spec_values','{}'::jsonb),
    '{"unit_price":"10.00","tax_rate":"0.130000","tax_inclusive":true}'::jsonb,u,e,'fixture-product');
  IF result->>'status' <> 'created' THEN RAISE EXCEPTION 'Fixture product failed: %',result; END IF;

  INSERT INTO auth.users(id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data)
    VALUES(reviewer_user,'authenticated','authenticated','stage-b-weighted-cost-review@smoke.invalid','','{}','{}');
  INSERT INTO public.employees(id,tenant_id,user_id,name,status) VALUES(reviewer,t,reviewer_user,'Reviewer','active');
  items := jsonb_build_array(jsonb_build_object('supplier_sku_id',sku,'cost_category_id',cost,'quantity','10'));
  FOR ordinal IN 1..1 LOOP
    b := gen_random_uuid();
    result := public.save_supplier_purchase_batch_draft(b,t,NULL,0,'Concurrent replenishment',NULL,NULL,items,u,e,
      'weighted-cost-save-'||ordinal,'warehouse',w);
    IF result->>'status' IS DISTINCT FROM 'saved' THEN RAISE EXCEPTION 'Draft failed: %',result; END IF;
    result := public.__gooes_submit_supplier_purchase_batch_destinations_v2(b,t,1,u,e,'weighted-cost-submit-'||ordinal,true);
    IF result->>'status' IS DISTINCT FROM 'submitted' THEN RAISE EXCEPTION 'Submit failed: %',result; END IF;
    result := public.__gooes_review_supplier_purchase_batch_destinations_v2(b,t,2,'approve',NULL,false,
      reviewer_user,reviewer,'weighted-cost-review-'||ordinal,true);
    IF result->>'status' IS DISTINCT FROM 'ordered' THEN RAISE EXCEPTION 'Review failed: %',result; END IF;
    order_id := (result->'orders'->0->>'id')::uuid;
    result := public.confirm_supplier_purchase_order_fulfillment(order_id,t,2,now(),NULL,u,e,'weighted-cost-confirm-'||ordinal);
    IF result->>'status' IS DISTINCT FROM 'confirmed' THEN RAISE EXCEPTION 'Confirm failed: %',result; END IF;
    INSERT INTO public.stage_b_weighted_cost_fixture
      SELECT ordinal,t,w,sku,order_id,id,u,e,now()
      FROM public.supplier_purchase_order_items WHERE supplier_purchase_order_id=order_id;
  END LOOP;
END;
$test$;
COMMIT;

CREATE FUNCTION public.stage_b_weighted_cost_receive(order_number integer,expected_version integer,quantity numeric,
  receipt_id uuid,command_key text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE f public.stage_b_weighted_cost_fixture%ROWTYPE;
BEGIN
  SELECT * INTO STRICT f FROM public.stage_b_weighted_cost_fixture WHERE ordinal=order_number;
  RETURN public.create_supplier_purchase_order_receipt(receipt_id,f.order_id,f.tenant_id,expected_version,
    'WEIGHTED-COST-'||order_number||'-'||expected_version,f.received_at,NULL,
    jsonb_build_array(jsonb_build_object('purchase_order_item_id',f.item_id,
      'accepted_quantity',quantity,'rejected_quantity',0)),f.actor_user_id,f.actor_employee_id,command_key);
END;
$$;


DO $weighted$
DECLARE f public.stage_b_weighted_cost_fixture%ROWTYPE; result jsonb; context jsonb;
  supplier_id uuid; relationship_id uuid; product_id uuid; sku_version integer; cost_id uuid;
  reviewer_user uuid; reviewer_employee uuid; batch_id uuid:=gen_random_uuid(); new_order uuid;
  receipt_id uuid:=gen_random_uuid(); first_result jsonb;
BEGIN
  SELECT * INTO STRICT f FROM public.stage_b_weighted_cost_fixture WHERE ordinal=1;
  SELECT purchase_order.supplier_id,purchase_order.tenant_supplier_id INTO STRICT supplier_id,relationship_id
    FROM public.supplier_purchase_orders purchase_order WHERE purchase_order.id=f.order_id;
  SELECT supplier_product_id,version INTO STRICT product_id,sku_version FROM public.supplier_skus WHERE id=f.sku_id;
  SELECT cost_category_id INTO STRICT cost_id FROM public.supplier_purchase_order_items WHERE id=f.item_id;
  SELECT id,user_id INTO STRICT reviewer_employee,reviewer_user FROM public.employees
    WHERE tenant_id=f.tenant_id AND id<>f.actor_employee_id;
  context:=public.get_supplier_purchasable_sku_price_context_v1(f.tenant_id,relationship_id,supplier_id,product_id,f.sku_id);
  IF (context->'current_price'->>'unit_price')::numeric IS DISTINCT FROM 10::numeric THEN
    RAISE EXCEPTION 'Original catalog price must be 10: %',context;
  END IF;
  result:=public.command_supplier_purchasable_sku_v1('update',f.tenant_id,relationship_id,supplier_id,product_id,f.sku_id,
    sku_version,'{}'::jsonb,'{"unit_price":"20.00","tax_rate":"0.130000","tax_inclusive":true}'::jsonb,
    (context->'current_price'->>'supplier_price_list_id')::uuid,
    (context->'current_price'->>'supplier_price_list_row_version')::integer,
    f.actor_user_id,f.actor_employee_id,'weighted-price-update');
  IF result->>'status' IS DISTINCT FROM 'saved' OR result->>'price_version_created' IS DISTINCT FROM 'true'
    OR (result->'current_price'->>'unit_price')::numeric IS DISTINCT FROM 20::numeric THEN
    RAISE EXCEPTION 'Actual catalog price versioning failed: %',result;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.supplier_purchase_order_items
    WHERE id=f.item_id AND unit_price=10 AND total_amount=100) THEN
    RAISE EXCEPTION 'Catalog update rewrote a frozen order price';
  END IF;
  result:=public.save_supplier_purchase_batch_draft(batch_id,f.tenant_id,NULL,0,'Replenish at new price',NULL,NULL,
    jsonb_build_array(jsonb_build_object('supplier_sku_id',f.sku_id,'cost_category_id',cost_id,'quantity','3')),
    f.actor_user_id,f.actor_employee_id,'weighted-new-save','warehouse',f.warehouse_id);
  IF result->>'status' IS DISTINCT FROM 'saved' THEN RAISE EXCEPTION 'New price draft failed: %',result; END IF;
  result:=public.__gooes_submit_supplier_purchase_batch_destinations_v2(batch_id,f.tenant_id,1,
    f.actor_user_id,f.actor_employee_id,'weighted-new-submit',true);
  IF result->>'status' IS DISTINCT FROM 'submitted' THEN RAISE EXCEPTION 'New price submit failed: %',result; END IF;
  result:=public.__gooes_review_supplier_purchase_batch_destinations_v2(batch_id,f.tenant_id,2,'approve',NULL,false,
    reviewer_user,reviewer_employee,'weighted-new-review',true);
  IF result->>'status' IS DISTINCT FROM 'ordered' THEN RAISE EXCEPTION 'New price review failed: %',result; END IF;
  new_order:=(result->'orders'->0->>'id')::uuid;
  result:=public.confirm_supplier_purchase_order_fulfillment(new_order,f.tenant_id,2,now(),NULL,
    f.actor_user_id,f.actor_employee_id,'weighted-new-confirm');
  IF result->>'status' IS DISTINCT FROM 'confirmed' THEN RAISE EXCEPTION 'New order confirm failed: %',result; END IF;
  INSERT INTO public.stage_b_weighted_cost_fixture
    SELECT 2,f.tenant_id,f.warehouse_id,f.sku_id,new_order,id,f.actor_user_id,f.actor_employee_id,now()
    FROM public.supplier_purchase_order_items WHERE supplier_purchase_order_id=new_order AND unit_price=20 AND total_amount=60;
  IF NOT FOUND THEN RAISE EXCEPTION 'New order did not freeze the new price'; END IF;

  -- The original order is received AFTER the price change: its payable and
  -- inventory value must still use its frozen 10 price, not the current 20.
  result:=public.stage_b_weighted_cost_receive(1,1,10,gen_random_uuid(),'weighted-old-receipt');
  IF result->>'status' IS DISTINCT FROM 'receipt_created'
    OR NOT EXISTS(SELECT 1 FROM public.inventory_balances WHERE tenant_id=f.tenant_id
      AND quantity_on_hand=10 AND inventory_value=100 AND average_unit_cost=10) THEN
    RAISE EXCEPTION 'Original order receipt borrowed current catalog cost: %',result;
  END IF;
  first_result:=public.stage_b_weighted_cost_receive(2,1,1,receipt_id,'weighted-partial');
  IF first_result->>'status' IS DISTINCT FROM 'receipt_created'
    OR NOT EXISTS(SELECT 1 FROM public.inventory_balances WHERE tenant_id=f.tenant_id
      AND quantity_on_hand=11 AND inventory_value=120 AND average_unit_cost=10.9091) THEN
    RAISE EXCEPTION 'Partial weighted average is not 120/11: %',first_result;
  END IF;
  result:=public.stage_b_weighted_cost_receive(2,2,2,gen_random_uuid(),'weighted-final');
  IF result->>'status' IS DISTINCT FROM 'receipt_created'
    OR (SELECT count(*) FROM public.inventory_balances WHERE tenant_id=f.tenant_id)<>1
    OR NOT EXISTS(SELECT 1 FROM public.inventory_balances WHERE tenant_id=f.tenant_id
      AND warehouse_id=f.warehouse_id AND supplier_sku_id=f.sku_id
      AND quantity_on_hand=13 AND inventory_value=160 AND average_unit_cost=12.3077)
    OR (SELECT count(*) FROM public.inventory_transactions WHERE tenant_id=f.tenant_id)<>3
    OR (SELECT sum(value_delta) FROM public.inventory_transactions WHERE tenant_id=f.tenant_id) IS DISTINCT FROM 160::numeric
    OR (SELECT sum(quantity_delta) FROM public.inventory_transactions WHERE tenant_id=f.tenant_id) IS DISTINCT FROM 13::numeric
    OR (SELECT count(*) FROM public.supplier_payable_events WHERE tenant_id=f.tenant_id)<>3
    OR (SELECT sum(amount) FROM public.supplier_payable_events WHERE supplier_purchase_order_id=f.order_id) IS DISTINCT FROM 100::numeric
    OR (SELECT sum(amount) FROM public.supplier_payable_events WHERE supplier_purchase_order_id=new_order) IS DISTINCT FROM 60::numeric
    OR EXISTS(SELECT 1 FROM public.project_cost_events WHERE tenant_id=f.tenant_id)
    OR EXISTS(SELECT 1 FROM public.project_cost_commitments WHERE tenant_id=f.tenant_id) THEN
    RAISE EXCEPTION 'Final weighted balance / frozen AP costs mismatch: %',result;
  END IF;
  result:=public.stage_b_weighted_cost_receive(2,1,1,receipt_id,'weighted-partial');
  IF result->>'idempotent' IS DISTINCT FROM 'true' OR result-'idempotent' IS DISTINCT FROM first_result-'idempotent'
    OR (SELECT count(*) FROM public.inventory_transactions WHERE tenant_id=f.tenant_id)<>3
    OR (SELECT count(*) FROM public.supplier_payable_events WHERE tenant_id=f.tenant_id)<>3
    OR NOT EXISTS(SELECT 1 FROM public.inventory_balances WHERE tenant_id=f.tenant_id
      AND quantity_on_hand=13 AND inventory_value=160 AND average_unit_cost=12.3077) THEN
    RAISE EXCEPTION 'Partial receipt replay after final revalued stock: %',result;
  END IF;
END;
$weighted$;
