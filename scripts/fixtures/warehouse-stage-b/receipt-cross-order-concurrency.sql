-- Disposable offline runner only: real orders share one warehouse/SKU.
CREATE EXTENSION IF NOT EXISTS dblink WITH SCHEMA extensions;
CREATE TABLE public.stage_b_cross_order_fixture(
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
  INSERT INTO public.tenants(id,name,slug) VALUES (t,'Draft fixture','stage-b-cross-order');
  INSERT INTO auth.users(id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data)
    VALUES (u,'authenticated','authenticated','stage-b-cross-order@smoke.invalid','','{}','{}');
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
    VALUES(c,'STAGE-B-CROSS-ORDER-CATEGORY','Material','Material',1,e,e);
  INSERT INTO public.catalog_brands(id,code,name,created_by_employee_id,updated_by_employee_id)
    VALUES(brand,'STAGE-B-CROSS-ORDER-BRAND','Brand',e,e);
  INSERT INTO public.catalog_units(id,code,name,symbol,created_by_employee_id,updated_by_employee_id)
    VALUES(unit_id,'STAGE-B-CROSS-ORDER-UNIT','Piece','pc',e,e);
  INSERT INTO public.suppliers(id,code,name,legal_name,supplier_type,ownership_scope,owner_tenant_id,
    onboarding_status,operational_status,reviewed_by_employee_id,reviewed_at,created_by_employee_id,updated_by_employee_id)
    VALUES(s,'STAGE-B-CROSS-ORDER-SUPPLIER','Supplier','Supplier','manufacturer','tenant',t,'approved','active',e,now(),e,e);
  INSERT INTO public.tenant_suppliers(id,tenant_id,supplier_id,relationship_status,default_currency,
    internal_supplier_code,started_at,created_by_employee_id,updated_by_employee_id)
    VALUES(r,t,s,'active','CNY','STAGE-B-CROSS-ORDER-SUPPLIER',current_date,e,e);
  result := public.command_supplier_purchasable_product_v1(product,sku,t,r,s,
    jsonb_build_object('product_code','TP-' || left(replace(product::text,'-',''),16),'name','Material','category_id',c,'brand_id',brand),
    jsonb_build_object('sku_code','TS-' || left(replace(sku::text,'-',''),16),'name','Material','purchase_unit_id',unit_id,'spec_values','{}'::jsonb),
    '{"unit_price":"10.00","tax_rate":"0.130000","tax_inclusive":true}'::jsonb,u,e,'fixture-product');
  IF result->>'status' <> 'created' THEN RAISE EXCEPTION 'Fixture product failed: %',result; END IF;

  INSERT INTO auth.users(id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data)
    VALUES(reviewer_user,'authenticated','authenticated','stage-b-cross-order-review@smoke.invalid','','{}','{}');
  INSERT INTO public.employees(id,tenant_id,user_id,name,status) VALUES(reviewer,t,reviewer_user,'Reviewer','active');
  items := jsonb_build_array(jsonb_build_object('supplier_sku_id',sku,'cost_category_id',cost,'quantity','10'));
  FOR ordinal IN 1..2 LOOP
    b := gen_random_uuid();
    result := public.save_supplier_purchase_batch_draft(b,t,NULL,0,'Concurrent replenishment',NULL,NULL,items,u,e,
      'cross-order-save-'||ordinal,'warehouse',w);
    IF result->>'status' IS DISTINCT FROM 'saved' THEN RAISE EXCEPTION 'Draft failed: %',result; END IF;
    result := public.__gooes_submit_supplier_purchase_batch_destinations_v2(b,t,1,u,e,'cross-order-submit-'||ordinal,true);
    IF result->>'status' IS DISTINCT FROM 'submitted' THEN RAISE EXCEPTION 'Submit failed: %',result; END IF;
    result := public.__gooes_review_supplier_purchase_batch_destinations_v2(b,t,2,'approve',NULL,false,
      reviewer_user,reviewer,'cross-order-review-'||ordinal,true);
    IF result->>'status' IS DISTINCT FROM 'ordered' THEN RAISE EXCEPTION 'Review failed: %',result; END IF;
    order_id := (result->'orders'->0->>'id')::uuid;
    result := public.confirm_supplier_purchase_order_fulfillment(order_id,t,2,now(),NULL,u,e,'cross-order-confirm-'||ordinal);
    IF result->>'status' IS DISTINCT FROM 'confirmed' THEN RAISE EXCEPTION 'Confirm failed: %',result; END IF;
    INSERT INTO public.stage_b_cross_order_fixture
      SELECT ordinal,t,w,sku,order_id,id,u,e,now()
      FROM public.supplier_purchase_order_items WHERE supplier_purchase_order_id=order_id;
  END LOOP;
END;
$test$;
COMMIT;

CREATE FUNCTION public.stage_b_cross_order_receive(order_number integer,expected_version integer,quantity numeric,
  receipt_id uuid,command_key text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE f public.stage_b_cross_order_fixture%ROWTYPE;
BEGIN
  SELECT * INTO STRICT f FROM public.stage_b_cross_order_fixture WHERE ordinal=order_number;
  RETURN public.create_supplier_purchase_order_receipt(receipt_id,f.order_id,f.tenant_id,expected_version,
    'CROSS-ORDER-'||order_number||'-'||expected_version,f.received_at,NULL,
    jsonb_build_array(jsonb_build_object('purchase_order_item_id',f.item_id,
      'accepted_quantity',quantity,'rejected_quantity',0)),f.actor_user_id,f.actor_employee_id,command_key);
END;
$$;

DO $race$
DECLARE f public.stage_b_cross_order_fixture%ROWTYPE; phase integer; result jsonb; deadline timestamptz;
  amount_a integer; amount_b integer; connection_name text;
BEGIN
  SELECT * INTO STRICT f FROM public.stage_b_cross_order_fixture WHERE ordinal=1;
  IF (SELECT count(DISTINCT order_id) FROM public.stage_b_cross_order_fixture)<>2
    OR EXISTS(SELECT 1 FROM public.inventory_balances WHERE tenant_id=f.tenant_id) THEN
    RAISE EXCEPTION 'Race must begin with two distinct orders and no existing balance';
  END IF;
  FOREACH connection_name IN ARRAY ARRAY['stage-b-cross-order-a','stage-b-cross-order-b'] LOOP
    PERFORM extensions.dblink_connect(connection_name,'host=/tmp dbname=postgres user=postgres application_name='||connection_name);
    PERFORM extensions.dblink_exec(connection_name,'SET statement_timeout=''8s''');
  END LOOP;
  -- Phase 1 races creation of the shared SKU balance. Phase 2 races updates of
  -- that now-existing balance. Each command uses a distinct real order/key.
  FOR phase IN 1..2 LOOP
    amount_a := CASE phase WHEN 1 THEN 3 ELSE 7 END;
    amount_b := 10-amount_a;
    PERFORM extensions.dblink_exec('stage-b-cross-order-a','BEGIN');
    SELECT response INTO result FROM extensions.dblink('stage-b-cross-order-a',format(
      'SELECT public.stage_b_cross_order_receive(1,%s,%s,%L::uuid,%L)',phase,amount_a,gen_random_uuid(),'cross-a-'||phase))
      AS r(response jsonb);
    IF result->>'status' IS DISTINCT FROM 'receipt_created' OR result->>'idempotent' IS DISTINCT FROM 'false' THEN
      RAISE EXCEPTION 'First order receipt failed: %',result;
    END IF;
    IF extensions.dblink_send_query('stage-b-cross-order-b',format(
      'SELECT public.stage_b_cross_order_receive(2,%s,%s,%L::uuid,%L)',phase,amount_b,gen_random_uuid(),'cross-b-'||phase))<>1 THEN
      RAISE EXCEPTION 'Could not dispatch second order receipt';
    END IF;
    deadline := clock_timestamp()+interval '4 seconds';
    LOOP
      PERFORM pg_stat_clear_snapshot();
      EXIT WHEN EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name='stage-b-cross-order-b' AND wait_event_type='Lock');
      IF extensions.dblink_is_busy('stage-b-cross-order-b')=0 OR clock_timestamp()>deadline THEN
        RAISE EXCEPTION 'Second order did not reach a live shared-stock lock wait in phase %',phase;
      END IF;
      PERFORM pg_sleep(0.01);
    END LOOP;
    PERFORM extensions.dblink_exec('stage-b-cross-order-a','COMMIT');
    SELECT response INTO result FROM extensions.dblink_get_result('stage-b-cross-order-b') AS r(response jsonb);
    PERFORM * FROM extensions.dblink_get_result('stage-b-cross-order-b') AS r(response jsonb);
    IF result->>'status' IS DISTINCT FROM 'receipt_created' OR result->>'idempotent' IS DISTINCT FROM 'false'
      OR (SELECT count(*) FROM public.inventory_balances WHERE tenant_id=f.tenant_id)<>1
      OR NOT EXISTS(SELECT 1 FROM public.inventory_balances WHERE tenant_id=f.tenant_id
        AND warehouse_id=f.warehouse_id AND supplier_sku_id=f.sku_id
        AND quantity_on_hand=phase*10 AND inventory_value=phase*100 AND average_unit_cost=10)
      OR (SELECT count(*) FROM public.inventory_transactions WHERE tenant_id=f.tenant_id)<>phase*2
      OR (SELECT sum(quantity_delta) FROM public.inventory_transactions WHERE tenant_id=f.tenant_id) IS DISTINCT FROM phase*10::numeric
      OR (SELECT sum(value_delta) FROM public.inventory_transactions WHERE tenant_id=f.tenant_id) IS DISTINCT FROM phase*100::numeric
      OR (SELECT count(*) FROM public.supplier_payable_events WHERE tenant_id=f.tenant_id)<>phase*2
      OR (SELECT sum(amount) FROM public.supplier_payable_events WHERE tenant_id=f.tenant_id) IS DISTINCT FROM phase*100::numeric
      OR EXISTS(SELECT 1 FROM public.project_cost_events WHERE tenant_id=f.tenant_id)
      OR EXISTS(SELECT 1 FROM public.project_cost_commitments WHERE tenant_id=f.tenant_id) THEN
      RAISE EXCEPTION 'Cross-order stock/AP facts mismatch in phase %: %',phase,result;
    END IF;
  END LOOP;
  IF EXISTS(SELECT 1 FROM public.stage_b_cross_order_fixture fixture
    WHERE (SELECT count(*) FROM public.supplier_purchase_order_receipts r WHERE r.supplier_purchase_order_id=fixture.order_id)<>2
    OR (SELECT sum(amount) FROM public.supplier_payable_events p WHERE p.supplier_purchase_order_id=fixture.order_id) IS DISTINCT FROM 100::numeric) THEN
    RAISE EXCEPTION 'Each order must retain exactly two receipts and its own 100 payable amount';
  END IF;
  PERFORM extensions.dblink_disconnect('stage-b-cross-order-a');
  PERFORM extensions.dblink_disconnect('stage-b-cross-order-b');
END;
$race$;
