-- Real purchasing/receipt RPCs and issue RPCs on independent transactions.
-- Requires material-workflow.sql; all rows belong to the disposable database.
CREATE EXTENSION IF NOT EXISTS dblink WITH SCHEMA extensions;
CREATE TABLE public.stage_c_receipt_race(ordinal integer PRIMARY KEY,order_id uuid,order_item_id uuid,
  receipt_id uuid,issue_id uuid,fulfillment_version integer,received_at timestamptz);
CREATE FUNCTION public.stage_c_receipt_race_command(p_ordinal integer,p_kind text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE f public.stage_c_material_fixture%ROWTYPE; r public.stage_c_receipt_race%ROWTYPE;
BEGIN
  SELECT * INTO STRICT f FROM public.stage_c_material_fixture;
  SELECT * INTO STRICT r FROM public.stage_c_receipt_race WHERE ordinal=p_ordinal;
  PERFORM set_config('request.jwt.claim.role','service_role',true);
  IF p_kind='receipt' THEN
    RETURN public.create_supplier_purchase_order_receipt(r.receipt_id,r.order_id,f.tenant_id,r.fulfillment_version,
      'MIXED-'||p_ordinal,r.received_at,NULL,
      jsonb_build_array(jsonb_build_object('purchase_order_item_id',r.order_item_id,'accepted_quantity',1,'rejected_quantity',0)),
      f.actor_user_id,f.actor_employee_id,'mixed-receipt-'||p_ordinal);
  END IF;
  RETURN public.command_warehouse_material_order(r.issue_id,f.tenant_id,'issue','complete',2,'{}',
    f.actor_user_id,f.actor_employee_id,'mixed-issue-'||p_ordinal);
END;
$$;
BEGIN;
DO $setup$
DECLARE f public.stage_c_material_fixture%ROWTYPE; i integer; batch_id uuid; issue_id uuid;
  reviewer_user uuid:=gen_random_uuid(); reviewer_employee uuid:=gen_random_uuid();
  order_id uuid; item_id uuid; fulfillment_version integer; received_at timestamptz:=now(); result jsonb;
BEGIN
  SELECT * INTO STRICT f FROM public.stage_c_material_fixture;
  PERFORM set_config('request.jwt.claim.role','service_role',true);
  INSERT INTO auth.users(id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data)
    VALUES(reviewer_user,'authenticated','authenticated','mixed-review@smoke.invalid','','{}','{}');
  INSERT INTO public.employees(id,tenant_id,user_id,name,status)
    VALUES(reviewer_employee,f.tenant_id,reviewer_user,'Mixed reviewer','active');
  FOR i IN 1..2 LOOP
    batch_id:=gen_random_uuid(); issue_id:=gen_random_uuid();
    result:=public.save_supplier_purchase_batch_draft(batch_id,f.tenant_id,NULL,0,'Mixed receipt',NULL,NULL,
      jsonb_build_array(jsonb_build_object('supplier_sku_id',f.sku_id,'cost_category_id',f.cost_id,'quantity','1')),
      f.actor_user_id,f.actor_employee_id,'mixed-save-'||i,'warehouse',f.warehouse_id);
    IF result->>'status' IS DISTINCT FROM 'saved' THEN RAISE EXCEPTION 'Mixed draft: %',result; END IF;
    result:=public.__gooes_submit_supplier_purchase_batch_destinations_v2(batch_id,f.tenant_id,1,
      f.actor_user_id,f.actor_employee_id,'mixed-submit-'||i,true);
    IF result->>'status' IS DISTINCT FROM 'submitted' THEN RAISE EXCEPTION 'Mixed submit: %',result; END IF;
    result:=public.__gooes_review_supplier_purchase_batch_destinations_v2(batch_id,f.tenant_id,2,'approve',NULL,false,
      reviewer_user,reviewer_employee,'mixed-review-'||i,true);
    IF result->>'status' IS DISTINCT FROM 'ordered' THEN RAISE EXCEPTION 'Mixed review: %',result; END IF;
    order_id:=(result->'orders'->0->>'id')::uuid;
    SELECT id INTO STRICT item_id FROM public.supplier_purchase_order_items WHERE supplier_purchase_order_id=order_id;
    result:=public.confirm_supplier_purchase_order_fulfillment(order_id,f.tenant_id,2,received_at,NULL,
      f.actor_user_id,f.actor_employee_id,'mixed-confirm-'||i);
    IF result->>'status' IS DISTINCT FROM 'confirmed' THEN RAISE EXCEPTION 'Mixed confirmation: %',result; END IF;
    SELECT version INTO STRICT fulfillment_version FROM public.supplier_purchase_order_fulfillments WHERE supplier_purchase_order_id=order_id;
    PERFORM public.command_warehouse_material_order(issue_id,f.tenant_id,'issue','save_draft',0,
      jsonb_build_object('warehouse_id',f.warehouse_id,'project_id',f.project_id,
        'items',jsonb_build_array(jsonb_build_object('supplier_sku_id',f.sku_id,'quantity',CASE i WHEN 1 THEN '1' ELSE '0.1' END))),
      f.actor_user_id,f.actor_employee_id,'mixed-issue-save-'||i);
    PERFORM public.command_warehouse_material_order(issue_id,f.tenant_id,'issue','submit',1,'{}',
      f.actor_user_id,f.actor_employee_id,'mixed-issue-submit-'||i);
    INSERT INTO public.stage_c_receipt_race VALUES(i,order_id,item_id,gen_random_uuid(),issue_id,fulfillment_version,received_at);
  END LOOP;
END;
$setup$;
COMMIT;
DO $race$
DECLARE f public.stage_c_material_fixture%ROWTYPE; i integer; deadline timestamptz;
  first_kind text; second_kind text; first_result jsonb; second_result jsonb;
  initial_payables integer; initial_facts integer; first_replay jsonb; second_replay jsonb;
BEGIN
  SELECT * INTO STRICT f FROM public.stage_c_material_fixture;
  SELECT count(*) INTO initial_payables FROM public.supplier_payable_events WHERE tenant_id=f.tenant_id;
  SELECT count(*) INTO initial_facts FROM public.inventory_transactions WHERE tenant_id=f.tenant_id;
  PERFORM extensions.dblink_connect('mixed-a','host=/tmp dbname=postgres user=postgres application_name=mixed-a');
  PERFORM extensions.dblink_connect('mixed-b','host=/tmp dbname=postgres user=postgres application_name=mixed-b');
  PERFORM extensions.dblink_exec('mixed-a','SET statement_timeout=''8s''');
  PERFORM extensions.dblink_exec('mixed-b','SET statement_timeout=''8s''');
  FOR i IN 1..2 LOOP
    first_kind:=CASE i WHEN 1 THEN 'receipt' ELSE 'issue' END;
    second_kind:=CASE i WHEN 1 THEN 'issue' ELSE 'receipt' END;
    PERFORM extensions.dblink_exec('mixed-a','BEGIN');
    SELECT payload INTO first_result FROM extensions.dblink('mixed-a',
      format('SELECT public.stage_c_receipt_race_command(%s,%L)',i,first_kind)) AS result(payload jsonb);
    PERFORM extensions.dblink_send_query('mixed-b',format('SELECT public.stage_c_receipt_race_command(%s,%L)',i,second_kind));
    deadline:=clock_timestamp()+interval '4 seconds';
    LOOP
      PERFORM pg_stat_clear_snapshot();
      EXIT WHEN EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name='mixed-b' AND wait_event_type='Lock');
      IF clock_timestamp()>deadline THEN RAISE EXCEPTION 'Mixed command % did not wait for lock',i; END IF;
      PERFORM pg_sleep(0.01);
    END LOOP;
    PERFORM extensions.dblink_exec('mixed-a','COMMIT');
    SELECT payload INTO second_result FROM extensions.dblink_get_result('mixed-b') AS result(payload jsonb);
    PERFORM * FROM extensions.dblink_get_result('mixed-b') AS result(payload jsonb);
    IF first_result->>'status' IS DISTINCT FROM (CASE i WHEN 1 THEN 'receipt_created' ELSE 'completed' END)
      OR second_result->>'status' IS DISTINCT FROM (CASE i WHEN 1 THEN 'completed' ELSE 'receipt_created' END) THEN
      RAISE EXCEPTION 'Mixed commands failed: % / %',first_result,second_result;
    END IF;
    -- Replay in autocommit connections so the coordinating DO block never holds
    -- a settings lock while launching the next independent command pair.
    SELECT payload INTO first_replay FROM extensions.dblink('mixed-a',
      format('SELECT public.stage_c_receipt_race_command(%s,%L)',i,first_kind)) AS result(payload jsonb);
    SELECT payload INTO second_replay FROM extensions.dblink('mixed-b',
      format('SELECT public.stage_c_receipt_race_command(%s,%L)',i,second_kind)) AS result(payload jsonb);
    IF (first_replay-'idempotent') IS DISTINCT FROM (first_result-'idempotent')
      OR (second_replay-'idempotent') IS DISTINCT FROM (second_result-'idempotent') THEN
      RAISE EXCEPTION 'Mixed replay result changed';
    END IF;
    IF (SELECT count(*) FROM public.inventory_transactions WHERE tenant_id=f.tenant_id)<>initial_facts+i*2
      OR (SELECT count(*) FROM public.supplier_payable_events WHERE tenant_id=f.tenant_id)<>initial_payables+i
      OR (SELECT quantity_on_hand FROM public.inventory_balances WHERE tenant_id=f.tenant_id AND warehouse_id=f.warehouse_id AND supplier_sku_id=f.sku_id)
        <>(CASE i WHEN 1 THEN 0.3 ELSE 1.2 END)
      OR (SELECT inventory_value FROM public.inventory_balances WHERE tenant_id=f.tenant_id AND warehouse_id=f.warehouse_id AND supplier_sku_id=f.sku_id)
        <>(CASE i WHEN 1 THEN 0.02 ELSE 0.08 END) THEN
      RAISE EXCEPTION 'Mixed quantity/value/payable reconciliation failed at phase %',i;
    END IF;
    IF EXISTS(SELECT 1 FROM public.stage_c_receipt_race r WHERE r.ordinal<=i AND
      (SELECT count(*) FROM public.supplier_payable_events payable WHERE payable.tenant_id=f.tenant_id
        AND payable.supplier_purchase_order_id=r.order_id AND payable.supplier_purchase_order_item_id=r.order_item_id
        AND payable.supplier_purchase_order_receipt_id=r.receipt_id AND payable.amount=0.07
        AND payable.accepted_quantity=1 AND payable.destination_type='warehouse'
        AND payable.warehouse_id=f.warehouse_id AND payable.project_id IS NULL)<>1) THEN
      RAISE EXCEPTION 'Mixed receipt payable has wrong amount, quantity or source at phase %',i;
    END IF;
  END LOOP;
  PERFORM extensions.dblink_disconnect('mixed-a'); PERFORM extensions.dblink_disconnect('mixed-b');
  IF (SELECT sum(CASE event_direction WHEN 'decrease' THEN -amount ELSE amount END)
    FROM public.project_cost_events WHERE tenant_id=f.tenant_id)<>0.08 THEN
    RAISE EXCEPTION 'Mixed costs must contain only issued value';
  END IF;
END;
$race$;
SELECT 'EVIDENCE real receipt then issue and issue then receipt observed independent lock waits; stock 1.2/value 0.08/project cost 0.08; only two receipts added payables; replay added no facts';
DO $returns$
DECLARE f public.stage_c_material_fixture%ROWTYPE; issue_id uuid; item_id uuid; return_id uuid; i integer;
  payable_count integer;
BEGIN
  SELECT * INTO STRICT f FROM public.stage_c_material_fixture;
  SELECT r.issue_id INTO STRICT issue_id FROM public.stage_c_receipt_race r WHERE ordinal=1;
  SELECT id INTO STRICT item_id FROM public.warehouse_issue_order_items WHERE issue_order_id=issue_id;
  SELECT count(*) INTO payable_count FROM public.supplier_payable_events WHERE tenant_id=f.tenant_id;
  PERFORM set_config('request.jwt.claim.role','service_role',true);
  FOR i IN 1..2 LOOP
    return_id:=gen_random_uuid();
    PERFORM public.command_warehouse_material_order(return_id,f.tenant_id,'return','save_draft',0,
      jsonb_build_object('original_issue_order_id',issue_id,'items',jsonb_build_array(jsonb_build_object(
        'original_issue_item_id',item_id,'quantity',CASE i WHEN 1 THEN '0.4' ELSE '0.6' END))),
      f.actor_user_id,f.actor_employee_id,'mixed-return-save-'||i);
    PERFORM public.command_warehouse_material_order(return_id,f.tenant_id,'return','complete',1,'{}',
      f.actor_user_id,f.actor_employee_id,'mixed-return-complete-'||i);
    IF (SELECT amount FROM public.warehouse_return_order_items WHERE return_order_id=return_id)
      <>(CASE i WHEN 1 THEN 0.03 ELSE 0.04 END) THEN RAISE EXCEPTION 'Real receipt return allocation incorrect'; END IF;
  END LOOP;
  IF (SELECT count(*) FROM public.supplier_payable_events WHERE tenant_id=f.tenant_id)<>payable_count
    OR (SELECT quantity_on_hand FROM public.inventory_balances WHERE tenant_id=f.tenant_id
      AND warehouse_id=f.warehouse_id AND supplier_sku_id=f.sku_id)<>2.2
    OR (SELECT inventory_value FROM public.inventory_balances WHERE tenant_id=f.tenant_id
      AND warehouse_id=f.warehouse_id AND supplier_sku_id=f.sku_id)<>0.15
    OR (SELECT sum(CASE event_direction WHEN 'decrease' THEN -amount ELSE amount END)
      FROM public.project_cost_events WHERE tenant_id=f.tenant_id)<>0.01 THEN
    RAISE EXCEPTION 'Full real purchasing receipt/issue/partial-return chain did not reconcile';
  END IF;
END;
$returns$;
SELECT 'EVIDENCE real purchase->receipt->issue->partial-return chain reconciles stock 2.2/value 0.15/net project cost 0.01; returns add no payable';
