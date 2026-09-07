-- Run only in the disposable offline database. Committed synthetic rows allow
-- three local connections to exercise real transaction races, not timing mocks.
CREATE EXTENSION IF NOT EXISTS dblink WITH SCHEMA extensions;
CREATE TABLE public.stage_b_payment_race_fixture(
  tenant_id uuid, warehouse_id uuid, tenant_supplier_id uuid, payable_id uuid,
  actor_user_id uuid, actor_employee_id uuid, reviewer_user_id uuid, reviewer_employee_id uuid,
  first_request uuid, second_request uuid, paid_at timestamptz
);
BEGIN;
DO $test$
DECLARE
  t uuid := gen_random_uuid(); u uuid := gen_random_uuid(); e uuid := gen_random_uuid();
  w uuid := gen_random_uuid(); p uuid := gen_random_uuid(); b uuid := gen_random_uuid();
  s uuid := gen_random_uuid(); r uuid := gen_random_uuid(); c uuid := gen_random_uuid();
  brand uuid := gen_random_uuid(); unit_id uuid := gen_random_uuid(); cost uuid := gen_random_uuid();
  product uuid := gen_random_uuid(); sku uuid := gen_random_uuid();
  reviewer_user uuid := gen_random_uuid(); reviewer uuid := gen_random_uuid();
  order_id uuid; order_item uuid; receipt_id uuid := gen_random_uuid(); payable_id uuid;
  request_id uuid := gen_random_uuid(); allocations jsonb; paid_at timestamptz := now();
  result jsonb; items jsonb; competing_request uuid := gen_random_uuid();
BEGIN
  INSERT INTO public.tenants(id,name,slug) VALUES (t,'Draft fixture','stage-b-payment-race');
  INSERT INTO auth.users(id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data)
    VALUES (u,'authenticated','authenticated','stage-b-payment-race@smoke.invalid','','{}','{}');
  INSERT INTO public.employees(id,tenant_id,user_id,name,status) VALUES(e,t,u,'Applicant','active');
  INSERT INTO public.projects(id,tenant_id,name,status) VALUES(p,t,'Legacy project','designing');
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
    VALUES(c,'STAGE-B-PAYMENT-RACE-CATEGORY','Material','Material',1,e,e);
  INSERT INTO public.catalog_brands(id,code,name,created_by_employee_id,updated_by_employee_id)
    VALUES(brand,'STAGE-B-PAYMENT-RACE-BRAND','Brand',e,e);
  INSERT INTO public.catalog_units(id,code,name,symbol,created_by_employee_id,updated_by_employee_id)
    VALUES(unit_id,'STAGE-B-PAYMENT-RACE-UNIT','Piece','pc',e,e);
  INSERT INTO public.suppliers(id,code,name,legal_name,supplier_type,ownership_scope,owner_tenant_id,
    onboarding_status,operational_status,reviewed_by_employee_id,reviewed_at,created_by_employee_id,updated_by_employee_id)
    VALUES(s,'STAGE-B-PAYMENT-RACE-SUPPLIER','Supplier','Supplier','manufacturer','tenant',t,'approved','active',e,now(),e,e);
  INSERT INTO public.tenant_suppliers(id,tenant_id,supplier_id,relationship_status,default_currency,
    internal_supplier_code,started_at,created_by_employee_id,updated_by_employee_id)
    VALUES(r,t,s,'active','CNY','STAGE-B-PAYMENT-RACE-SUPPLIER',current_date,e,e);
  result := public.command_supplier_purchasable_product_v1(product,sku,t,r,s,
    jsonb_build_object('product_code','TP-' || left(replace(product::text,'-',''),16),'name','Material','category_id',c,'brand_id',brand),
    jsonb_build_object('sku_code','TS-' || left(replace(sku::text,'-',''),16),'name','Material','purchase_unit_id',unit_id,'spec_values','{}'::jsonb),
    '{"unit_price":"10.00","tax_rate":"0.130000","tax_inclusive":true}'::jsonb,u,e,'fixture-product');
  IF result->>'status' <> 'created' THEN RAISE EXCEPTION 'Fixture product failed: %',result; END IF;
  items := jsonb_build_array(jsonb_build_object('supplier_sku_id',sku,'cost_category_id',cost,'quantity','10'));
  result := public.save_supplier_purchase_batch_draft(b,t,NULL,0,'Warehouse replenishment',NULL,NULL,items,u,e,'warehouse-save','warehouse',w);
  IF result->>'status' <> 'saved' THEN RAISE EXCEPTION 'Warehouse draft failed: %',result; END IF;
  INSERT INTO auth.users(id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data)
    VALUES(reviewer_user,'authenticated','authenticated','stage-b-payment-race-review@smoke.invalid','','{}','{}');
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

  result := public.save_supplier_payment_request_draft(request_id,t,NULL,r,0,'Competing A',NULL,allocations,u,e,gen_random_uuid(),'warehouse',w);
  IF result->>'status' IS DISTINCT FROM 'saved' THEN RAISE EXCEPTION 'Race draft A failed: %',result; END IF;
  result := public.save_supplier_payment_request_draft(competing_request,t,NULL,r,0,'Competing B',NULL,allocations,u,e,gen_random_uuid(),'warehouse',w);
  IF result->>'status' IS DISTINCT FROM 'saved' THEN RAISE EXCEPTION 'Race draft B failed: %',result; END IF;
  INSERT INTO public.stage_b_payment_race_fixture VALUES(t,w,r,payable_id,u,e,reviewer_user,reviewer,request_id,competing_request,paid_at);
END;
$test$;
COMMIT;

CREATE FUNCTION public.stage_b_race_submit(request_id uuid, command_key uuid) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE f public.stage_b_payment_race_fixture%ROWTYPE;
BEGIN
  SELECT * INTO STRICT f FROM public.stage_b_payment_race_fixture;
  RETURN public.submit_supplier_payment_request(request_id,f.tenant_id,1,f.actor_user_id,f.actor_employee_id,command_key);
END;
$$;
CREATE FUNCTION public.stage_b_race_pay(request_id uuid,payment_id uuid,command_key uuid) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE f public.stage_b_payment_race_fixture%ROWTYPE; allocations jsonb;
BEGIN
  SELECT * INTO STRICT f FROM public.stage_b_payment_race_fixture;
  SELECT jsonb_build_array(jsonb_build_object('payment_request_allocation_id',id,'payable_event_id',payable_event_id,
    'amount',requested_amount::text)) INTO STRICT allocations
  FROM public.supplier_payment_request_allocations WHERE payment_request_id=request_id AND tenant_id=f.tenant_id;
  RETURN public.confirm_supplier_payment(payment_id,request_id,f.tenant_id,3,'bank_transfer','CONCURRENT-PAYMENT',
    f.paid_at,'["https://smoke.invalid/proof"]',NULL,allocations,f.actor_user_id,f.actor_employee_id,command_key);
END;
$$;
CREATE FUNCTION public.stage_b_wait_payment_lock(connection_name text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE deadline timestamptz:=clock_timestamp()+interval '4 seconds';
BEGIN
  LOOP
    PERFORM pg_stat_clear_snapshot();
    EXIT WHEN EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name=connection_name AND wait_event_type='Lock');
    IF extensions.dblink_is_busy(connection_name)=0 OR clock_timestamp()>deadline THEN
      RAISE EXCEPTION 'Expected live payment lock wait: %',connection_name;
    END IF;
    PERFORM pg_sleep(0.01);
  END LOOP;
END;
$$;

DO $reservation_race$
DECLARE f public.stage_b_payment_race_fixture%ROWTYPE; result jsonb; connection_name text;
BEGIN
  SELECT * INTO STRICT f FROM public.stage_b_payment_race_fixture;
  FOREACH connection_name IN ARRAY ARRAY['stage-b-payer-a','stage-b-payer-b','stage-b-payer-c'] LOOP
    PERFORM extensions.dblink_connect(connection_name,'host=/tmp dbname=postgres user=postgres application_name='||connection_name);
    PERFORM extensions.dblink_exec(connection_name,'SET statement_timeout=''8s''');
  END LOOP;
  PERFORM extensions.dblink_exec('stage-b-payer-a','BEGIN');
  SELECT response INTO result FROM extensions.dblink('stage-b-payer-a',format(
    'SELECT public.stage_b_race_submit(%L::uuid,%L::uuid)',f.first_request,gen_random_uuid())) AS r(response jsonb);
  IF result->>'status' IS DISTINCT FROM 'submitted' THEN RAISE EXCEPTION 'First reservation failed: %',result; END IF;
  IF extensions.dblink_send_query('stage-b-payer-b',format(
    'SELECT public.stage_b_race_submit(%L::uuid,%L::uuid)',f.second_request,gen_random_uuid()))<>1 THEN
    RAISE EXCEPTION 'Could not dispatch competing reservation';
  END IF;
  PERFORM public.stage_b_wait_payment_lock('stage-b-payer-b');
  PERFORM extensions.dblink_exec('stage-b-payer-a','COMMIT');
  SELECT response INTO result FROM extensions.dblink_get_result('stage-b-payer-b') AS r(response jsonb);
  PERFORM * FROM extensions.dblink_get_result('stage-b-payer-b') AS r(response jsonb);
  IF result->>'status' IS DISTINCT FROM 'amount_unavailable'
    OR (SELECT count(*) FROM public.supplier_payment_requests WHERE tenant_id=f.tenant_id AND status='pending_approval')<>1
    OR (SELECT status FROM public.supplier_payment_requests WHERE id=f.second_request) IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'Concurrent requests over-reserved AP or changed losing request: %',result;
  END IF;
END;
$reservation_race$;

-- Release the winning reservation through its real command, then approve two
-- valid requests for the same AP. No synthetic payment facts or guard bypasses.
DO $split_requests$
DECLARE f public.stage_b_payment_race_fixture%ROWTYPE; request_id uuid; amount text; result jsonb; i integer;
BEGIN
  SELECT * INTO STRICT f FROM public.stage_b_payment_race_fixture;
  result := public.cancel_supplier_payment_request(f.first_request,f.tenant_id,2,'Split payable',f.actor_user_id,f.actor_employee_id,gen_random_uuid());
  IF result->>'status' IS DISTINCT FROM 'cancelled' THEN RAISE EXCEPTION 'Cancel reservation failed: %',result; END IF;
  FOR i IN 1..2 LOOP
    request_id:=gen_random_uuid(); amount:=CASE i WHEN 1 THEN '30.00' ELSE '70.00' END;
    result:=public.save_supplier_payment_request_draft(request_id,f.tenant_id,NULL,f.tenant_supplier_id,0,'Split payment',NULL,
      jsonb_build_array(jsonb_build_object('payable_event_id',f.payable_id,'requested_amount',amount)),
      f.actor_user_id,f.actor_employee_id,gen_random_uuid(),'warehouse',f.warehouse_id);
    IF result->>'status' IS DISTINCT FROM 'saved' THEN RAISE EXCEPTION 'Split draft failed: %',result; END IF;
    result:=public.stage_b_race_submit(request_id,gen_random_uuid());
    IF result->>'status' IS DISTINCT FROM 'submitted' THEN RAISE EXCEPTION 'Split submit failed: %',result; END IF;
    result:=public.review_supplier_payment_request(request_id,f.tenant_id,2,'approve',NULL,f.reviewer_user_id,f.reviewer_employee_id,gen_random_uuid());
    IF result->>'status' IS DISTINCT FROM 'approved' THEN RAISE EXCEPTION 'Split review failed: %',result; END IF;
    IF i=1 THEN UPDATE public.stage_b_payment_race_fixture SET first_request=request_id;
    ELSE UPDATE public.stage_b_payment_race_fixture SET second_request=request_id; END IF;
  END LOOP;
END;
$split_requests$;

DO $payment_race$
DECLARE f public.stage_b_payment_race_fixture%ROWTYPE; result jsonb; first_result jsonb;
  first_payment uuid:=gen_random_uuid(); second_payment uuid:=gen_random_uuid(); command_key uuid:=gen_random_uuid(); first_sql text;
BEGIN
  SELECT * INTO STRICT f FROM public.stage_b_payment_race_fixture;
  first_sql:=format('SELECT public.stage_b_race_pay(%L::uuid,%L::uuid,%L::uuid)',f.first_request,first_payment,command_key);
  PERFORM extensions.dblink_exec('stage-b-payer-a','BEGIN');
  SELECT response INTO first_result FROM extensions.dblink('stage-b-payer-a',first_sql) AS r(response jsonb);
  IF first_result->>'status' IS DISTINCT FROM 'paid' OR first_result->>'idempotent' IS DISTINCT FROM 'false' THEN
    RAISE EXCEPTION 'First payment failed: %',first_result;
  END IF;
  IF extensions.dblink_send_query('stage-b-payer-b',first_sql)<>1
    OR extensions.dblink_send_query('stage-b-payer-c',format(
      'SELECT public.stage_b_race_pay(%L::uuid,%L::uuid,%L::uuid)',f.second_request,second_payment,gen_random_uuid()))<>1 THEN
    RAISE EXCEPTION 'Could not dispatch simultaneous payments';
  END IF;
  PERFORM public.stage_b_wait_payment_lock('stage-b-payer-b');
  PERFORM public.stage_b_wait_payment_lock('stage-b-payer-c');
  PERFORM extensions.dblink_exec('stage-b-payer-a','COMMIT');
  SELECT response INTO result FROM extensions.dblink_get_result('stage-b-payer-b') AS r(response jsonb);
  PERFORM * FROM extensions.dblink_get_result('stage-b-payer-b') AS r(response jsonb);
  IF result->>'idempotent' IS DISTINCT FROM 'true' OR result-'idempotent' IS DISTINCT FROM first_result-'idempotent' THEN
    RAISE EXCEPTION 'Concurrent duplicate payment did not replay frozen success: %',result;
  END IF;
  SELECT response INTO result FROM extensions.dblink_get_result('stage-b-payer-c') AS r(response jsonb);
  PERFORM * FROM extensions.dblink_get_result('stage-b-payer-c') AS r(response jsonb);
  IF result->>'status' IS DISTINCT FROM 'paid' OR result->>'idempotent' IS DISTINCT FROM 'false'
    OR (SELECT count(*) FROM public.supplier_payments WHERE tenant_id=f.tenant_id)<>2
    OR (SELECT sum(amount) FROM public.supplier_payments WHERE tenant_id=f.tenant_id)<>100
    OR (SELECT count(*) FROM public.finance_ledger_entries WHERE tenant_id=f.tenant_id AND source_type='supplier_payment' AND project_id IS NULL)<>2
    OR (SELECT count(*) FROM public.finance_ledger_entries WHERE tenant_id=f.tenant_id)<>2
    OR EXISTS(SELECT 1 FROM public.finance_ledger_entries WHERE tenant_id=f.tenant_id AND direction<>'out')
    OR (SELECT sum(amount) FROM public.finance_ledger_entries WHERE tenant_id=f.tenant_id AND direction='out') IS DISTINCT FROM 100::numeric
    OR (SELECT sum(amount) FROM public.supplier_payment_allocations WHERE tenant_id=f.tenant_id)<>100
    OR EXISTS(SELECT 1 FROM public.project_cost_events WHERE tenant_id=f.tenant_id) THEN
    RAISE EXCEPTION 'Concurrent financial facts mismatch: %',result;
  END IF;
  PERFORM extensions.dblink_disconnect('stage-b-payer-a');
  PERFORM extensions.dblink_disconnect('stage-b-payer-b');
  PERFORM extensions.dblink_disconnect('stage-b-payer-c');
END;
$payment_race$;
