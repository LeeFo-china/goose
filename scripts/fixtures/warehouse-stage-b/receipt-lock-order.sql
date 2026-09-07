-- Disposable runner only: synthetic rows are committed for two local sessions.
CREATE EXTENSION IF NOT EXISTS dblink WITH SCHEMA extensions;
CREATE TABLE public.stage_b_receipt_lock_fixture(
  tenant_id uuid, warehouse_id uuid, order_id uuid, item_id uuid,
  actor_user_id uuid, actor_employee_id uuid, receipt_id uuid, received_at timestamptz
);
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
  INSERT INTO public.tenants(id,name,slug) VALUES (t,'Draft fixture','stage-b-receipt-lock');
  INSERT INTO auth.users(id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data)
    VALUES (u,'authenticated','authenticated','stage-b-receipt-lock@smoke.invalid','','{}','{}');
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
    VALUES(c,'STAGE-B-RECEIPT-LOCK-CATEGORY','Material','Material',1,e,e);
  INSERT INTO public.catalog_brands(id,code,name,created_by_employee_id,updated_by_employee_id)
    VALUES(brand,'STAGE-B-RECEIPT-LOCK-BRAND','Brand',e,e);
  INSERT INTO public.catalog_units(id,code,name,symbol,created_by_employee_id,updated_by_employee_id)
    VALUES(unit_id,'STAGE-B-RECEIPT-LOCK-UNIT','Piece','pc',e,e);
  INSERT INTO public.suppliers(id,code,name,legal_name,supplier_type,ownership_scope,owner_tenant_id,
    onboarding_status,operational_status,reviewed_by_employee_id,reviewed_at,created_by_employee_id,updated_by_employee_id)
    VALUES(s,'STAGE-B-RECEIPT-LOCK-SUPPLIER','Supplier','Supplier','manufacturer','tenant',t,'approved','active',e,now(),e,e);
  INSERT INTO public.tenant_suppliers(id,tenant_id,supplier_id,relationship_status,default_currency,
    internal_supplier_code,started_at,created_by_employee_id,updated_by_employee_id)
    VALUES(r,t,s,'active','CNY','STAGE-B-RECEIPT-LOCK-SUPPLIER',current_date,e,e);
  result := public.command_supplier_purchasable_product_v1(product,sku,t,r,s,
    jsonb_build_object('product_code','TP-' || left(replace(product::text,'-',''),16),'name','Material','category_id',c,'brand_id',brand),
    jsonb_build_object('sku_code','TS-' || left(replace(sku::text,'-',''),16),'name','Material','purchase_unit_id',unit_id,'spec_values','{}'::jsonb),
    '{"unit_price":"10.00","tax_rate":"0.130000","tax_inclusive":true}'::jsonb,u,e,'fixture-product');
  IF result->>'status' <> 'created' THEN RAISE EXCEPTION 'Fixture product failed: %',result; END IF;
  items := jsonb_build_array(jsonb_build_object('supplier_sku_id',sku,'cost_category_id',cost,'quantity','10'));
  result := public.save_supplier_purchase_batch_draft(b,t,NULL,0,'Warehouse replenishment',NULL,NULL,items,u,e,'warehouse-save','warehouse',w);
  IF result->>'status' <> 'saved' THEN RAISE EXCEPTION 'Warehouse draft failed: %',result; END IF;
  INSERT INTO auth.users(id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data)
    VALUES(reviewer_user,'authenticated','authenticated','stage-b-receipt-lock-review@smoke.invalid','','{}','{}');
  INSERT INTO public.employees(id,tenant_id,user_id,name,status) VALUES(reviewer,t,reviewer_user,'Reviewer','active');

  result := public.__gooes_submit_supplier_purchase_batch_destinations_v2(b,t,1,u,e,'receipt-submit',true);
  IF result->>'status' IS DISTINCT FROM 'submitted' THEN RAISE EXCEPTION 'Receipt fixture submit failed: %',result; END IF;
  result := public.__gooes_review_supplier_purchase_batch_destinations_v2(
    b,t,2,'approve',NULL,false,reviewer_user,reviewer,'receipt-review',true);
  IF result->>'status' IS DISTINCT FROM 'ordered' THEN RAISE EXCEPTION 'Receipt fixture review failed: %',result; END IF;
  order_id := (result->'orders'->0->>'id')::uuid;
  result := public.confirm_supplier_purchase_order_fulfillment(order_id,t,2,now(),NULL,u,e,'receipt-confirm');
  IF result->>'status' IS DISTINCT FROM 'confirmed' THEN RAISE EXCEPTION 'Receipt fixture confirm failed: %',result; END IF;
  INSERT INTO public.stage_b_receipt_lock_fixture
    SELECT t,w,order_id,id,u,e,gen_random_uuid(),now()
    FROM public.supplier_purchase_order_items WHERE supplier_purchase_order_id=order_id;
END;
$test$;
COMMIT;

DO $concurrency$
DECLARE f public.stage_b_receipt_lock_fixture%ROWTYPE; deadline timestamptz; command_status text;
  duplicate_sql text; final_receipt uuid := gen_random_uuid();
BEGIN
  SELECT * INTO STRICT f FROM public.stage_b_receipt_lock_fixture;
  PERFORM extensions.dblink_connect('order_submit','host=/tmp dbname=postgres user=postgres application_name=stage-b-receipt-order-submit');
  PERFORM extensions.dblink_connect('receipt','host=/tmp dbname=postgres user=postgres application_name=stage-b-concurrent-receipt');
  PERFORM extensions.dblink_exec('order_submit','SET statement_timeout=''8s''');
  PERFORM extensions.dblink_exec('receipt','SET statement_timeout=''8s''');
  PERFORM extensions.dblink_exec('order_submit','BEGIN');
  -- Pause order submit after its real shared-row prelocks, before its order lock.
  PERFORM extensions.dblink_exec('order_submit',format(
    'DO $lock$ BEGIN PERFORM tenant_id FROM public.tenant_supplier_settings WHERE tenant_id=%L::uuid FOR UPDATE;
      PERFORM id FROM public.warehouses WHERE id=%L::uuid FOR SHARE; END $lock$',f.tenant_id,f.warehouse_id));
  IF extensions.dblink_send_query('receipt',format(
    $sql$DO $receive$ DECLARE r jsonb; BEGIN
      r := public.create_supplier_purchase_order_receipt(%L::uuid,%L::uuid,%L::uuid,1,
        'STAGE-B-CONCURRENT',%L::timestamptz,NULL,jsonb_build_array(jsonb_build_object(
          'purchase_order_item_id',%L::uuid,'accepted_quantity',3,'rejected_quantity',0)),
        %L::uuid,%L::uuid,'concurrent-receipt');
      IF r->>'status' IS DISTINCT FROM 'receipt_created' THEN RAISE EXCEPTION 'Unexpected receipt result: %%',r; END IF;
    END $receive$;$sql$,f.receipt_id,f.order_id,f.tenant_id,f.received_at,f.item_id,f.actor_user_id,f.actor_employee_id))<>1
  THEN RAISE EXCEPTION 'Could not dispatch receipt'; END IF;
  deadline := clock_timestamp()+interval '4 seconds';
  LOOP
    PERFORM pg_stat_clear_snapshot();
    EXIT WHEN EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name='stage-b-concurrent-receipt' AND wait_event_type='Lock');
    IF extensions.dblink_is_busy('receipt')=0 OR clock_timestamp()>deadline THEN
      RAISE EXCEPTION 'Receipt did not reach shared lock';
    END IF;
    PERFORM pg_sleep(0.01);
  END LOOP;
  -- Submitted orders reject new submit keys. It must return the business
  -- conflict, not deadlock against a receipt on the same order.
  IF extensions.dblink_send_query('order_submit',format(
    $sql$DO $submit$ DECLARE r jsonb; BEGIN
      r := public.submit_supplier_purchase_order(%L::uuid,%L::uuid,2,%L::uuid,%L::uuid,'concurrent-resubmit');
      IF r->>'error_code' IS DISTINCT FROM 'SUPPLIER_PURCHASE_ORDER_STATE_CONFLICT' THEN
        RAISE EXCEPTION 'Unexpected resubmit result: %%',r;
      END IF;
    END $submit$;$sql$,f.order_id,f.tenant_id,f.actor_user_id,f.actor_employee_id))<>1
  THEN RAISE EXCEPTION 'Could not dispatch order resubmit'; END IF;
  SELECT status INTO command_status FROM extensions.dblink_get_result('order_submit') AS result(status text);
  IF command_status IS DISTINCT FROM 'DO' THEN RAISE EXCEPTION 'Order resubmit failed: %',command_status; END IF;
  PERFORM * FROM extensions.dblink_get_result('order_submit') AS result(status text);
  PERFORM extensions.dblink_exec('order_submit','COMMIT');
  SELECT status INTO command_status FROM extensions.dblink_get_result('receipt') AS result(status text);
  IF command_status IS DISTINCT FROM 'DO' THEN RAISE EXCEPTION 'Concurrent receipt failed: %',command_status; END IF;
  PERFORM * FROM extensions.dblink_get_result('receipt') AS result(status text);
  IF (SELECT count(*) FROM public.inventory_transactions WHERE tenant_id=f.tenant_id AND quantity_delta=3 AND value_delta=30)<>1
    OR (SELECT count(*) FROM public.supplier_payable_events WHERE tenant_id=f.tenant_id AND amount=30)<>1 THEN
    RAISE EXCEPTION 'Concurrent receipt did not create exactly one accounting fact';
  END IF;
  -- Two callers submit the exact same final receipt concurrently. The first
  -- creates facts; the waiter must return that success with idempotent=true.
  duplicate_sql := format($sql$DO $receive$ DECLARE r jsonb; BEGIN
    r := public.create_supplier_purchase_order_receipt(%L::uuid,%L::uuid,%L::uuid,2,
      'STAGE-B-CONCURRENT-FINAL',%L::timestamptz,NULL,jsonb_build_array(jsonb_build_object(
        'purchase_order_item_id',%L::uuid,'accepted_quantity',7,'rejected_quantity',0)),
      %L::uuid,%L::uuid,'concurrent-final');
    IF r->>'status' IS DISTINCT FROM 'receipt_created' OR r->>'idempotent' IS DISTINCT FROM 'true' THEN
      RAISE EXCEPTION 'Concurrent duplicate receipt result invalid: %%',r;
    END IF;
  END $receive$;$sql$,final_receipt,f.order_id,f.tenant_id,f.received_at,f.item_id,f.actor_user_id,f.actor_employee_id);
  PERFORM extensions.dblink_exec('order_submit','BEGIN');
  PERFORM extensions.dblink_exec('order_submit',format($sql$DO $lock$ BEGIN
    PERFORM pg_advisory_xact_lock(hashtextextended('supplier-command:' || %L || ':concurrent-final',0));
  END $lock$;$sql$,f.actor_user_id));
  IF extensions.dblink_send_query('receipt',duplicate_sql)<>1 THEN RAISE EXCEPTION 'Could not dispatch duplicate receipt'; END IF;
  deadline := clock_timestamp()+interval '4 seconds';
  LOOP
    PERFORM pg_stat_clear_snapshot();
    EXIT WHEN EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name='stage-b-concurrent-receipt' AND wait_event_type='Lock');
    IF extensions.dblink_is_busy('receipt')=0 OR clock_timestamp()>deadline THEN RAISE EXCEPTION 'Duplicate did not wait for command key'; END IF;
    PERFORM pg_sleep(0.01);
  END LOOP;
  PERFORM extensions.dblink_exec('order_submit',replace(duplicate_sql,
    'r->>''idempotent'' IS DISTINCT FROM ''true''','r->>''idempotent'' IS DISTINCT FROM ''false'''));
  PERFORM extensions.dblink_exec('order_submit','COMMIT');
  SELECT status INTO command_status FROM extensions.dblink_get_result('receipt') AS result(status text);
  IF command_status IS DISTINCT FROM 'DO' THEN RAISE EXCEPTION 'Duplicate receipt failed: %',command_status; END IF;
  PERFORM * FROM extensions.dblink_get_result('receipt') AS result(status text);
  PERFORM extensions.dblink_disconnect('order_submit');
  PERFORM extensions.dblink_disconnect('receipt');
  IF (SELECT count(*) FROM public.inventory_transactions WHERE tenant_id=f.tenant_id)<>2
    OR (SELECT count(*) FROM public.supplier_payable_events WHERE tenant_id=f.tenant_id)<>2
    OR (SELECT count(*) FROM public.inventory_balances WHERE tenant_id=f.tenant_id AND quantity_on_hand=10 AND inventory_value=100)<>1 THEN
    RAISE EXCEPTION 'Concurrent exact duplicate produced duplicate inventory/payables';
  END IF;
END;
$concurrency$;
