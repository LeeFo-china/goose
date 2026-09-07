-- Disposable offline runner only. Requires receipt-weighted-cost.sql.
-- If combined with inventory-read-performance.sql, run that fixed-size probe
-- BEFORE this file: this race intentionally adds four real tenant transactions.
-- New warehouse, same SKU, real orders frozen at 20 and 30: creation and update races.
CREATE EXTENSION IF NOT EXISTS dblink WITH SCHEMA extensions;
BEGIN;
DO $orders$
DECLARE
  f public.stage_b_weighted_cost_fixture%ROWTYPE;
  warehouse uuid:=gen_random_uuid(); batch uuid; order_id uuid; ordinal integer;
  supplier uuid; relationship uuid; product uuid; sku_version integer; category uuid;
  reviewer uuid; reviewer_user uuid; context jsonb; result jsonb;
BEGIN
  SELECT * INTO STRICT f FROM public.stage_b_weighted_cost_fixture fixture WHERE fixture.ordinal=1;
  SELECT o.supplier_id,o.tenant_supplier_id INTO STRICT supplier,relationship
    FROM public.supplier_purchase_orders o WHERE o.id=f.order_id;
  SELECT supplier_product_id,version INTO STRICT product,sku_version
    FROM public.supplier_skus WHERE id=f.sku_id;
  SELECT cost_category_id INTO STRICT category FROM public.supplier_purchase_order_items WHERE id=f.item_id;
  SELECT id,user_id INTO STRICT reviewer,reviewer_user FROM public.employees
    WHERE tenant_id=f.tenant_id AND id<>f.actor_employee_id;
  INSERT INTO public.warehouses(id,tenant_id,name) VALUES(warehouse,f.tenant_id,'Weighted race warehouse');
  FOR ordinal IN 3..4 LOOP
    context:=public.get_supplier_purchasable_sku_price_context_v1(
      f.tenant_id,relationship,supplier,product,f.sku_id);
    IF (context->'current_price'->>'unit_price')::numeric IS DISTINCT FROM 20::numeric THEN
      RAISE EXCEPTION 'Weighted race must start with current price 20: %',context;
    END IF;
    IF ordinal=4 THEN
      result:=public.command_supplier_purchasable_sku_v1('update',f.tenant_id,relationship,supplier,product,
        f.sku_id,sku_version,'{}'::jsonb,'{"unit_price":"30.00","tax_rate":"0.130000","tax_inclusive":true}'::jsonb,
        (context->'current_price'->>'supplier_price_list_id')::uuid,
        (context->'current_price'->>'supplier_price_list_row_version')::integer,
        f.actor_user_id,f.actor_employee_id,'weighted-race-price');
      IF result->>'status' IS DISTINCT FROM 'saved' OR result->>'price_version_created' IS DISTINCT FROM 'true' THEN
        RAISE EXCEPTION 'Weighted race price version command failed: %',result;
      END IF;
    END IF;
    batch:=gen_random_uuid();
    result:=public.save_supplier_purchase_batch_draft(batch,f.tenant_id,NULL,0,'Different-price concurrent receipts',NULL,NULL,
      jsonb_build_array(jsonb_build_object('supplier_sku_id',f.sku_id,'cost_category_id',category,
        'quantity',CASE ordinal WHEN 3 THEN '3' ELSE '7' END)),
      f.actor_user_id,f.actor_employee_id,'weighted-race-save-'||ordinal,'warehouse',warehouse);
    IF result->>'status' IS DISTINCT FROM 'saved' THEN RAISE EXCEPTION 'Race draft failed: %',result; END IF;
    result:=public.__gooes_submit_supplier_purchase_batch_destinations_v2(batch,f.tenant_id,1,
      f.actor_user_id,f.actor_employee_id,'weighted-race-submit-'||ordinal,true);
    IF result->>'status' IS DISTINCT FROM 'submitted' THEN RAISE EXCEPTION 'Race submit failed: %',result; END IF;
    result:=public.__gooes_review_supplier_purchase_batch_destinations_v2(batch,f.tenant_id,2,'approve',NULL,false,
      reviewer_user,reviewer,'weighted-race-review-'||ordinal,true);
    IF result->>'status' IS DISTINCT FROM 'ordered' THEN RAISE EXCEPTION 'Race review failed: %',result; END IF;
    order_id:=(result->'orders'->0->>'id')::uuid;
    result:=public.confirm_supplier_purchase_order_fulfillment(order_id,f.tenant_id,2,now(),NULL,
      f.actor_user_id,f.actor_employee_id,'weighted-race-confirm-'||ordinal);
    IF result->>'status' IS DISTINCT FROM 'confirmed' THEN RAISE EXCEPTION 'Race confirm failed: %',result; END IF;
    INSERT INTO public.stage_b_weighted_cost_fixture
      SELECT ordinal,f.tenant_id,warehouse,f.sku_id,order_id,i.id,f.actor_user_id,f.actor_employee_id,now()
      FROM public.supplier_purchase_order_items i WHERE i.supplier_purchase_order_id=order_id
        AND i.unit_price=CASE ordinal WHEN 3 THEN 20 ELSE 30 END
        AND i.total_amount=CASE ordinal WHEN 3 THEN 60 ELSE 210 END;
    IF NOT FOUND THEN RAISE EXCEPTION 'Race order did not freeze expected price and amount'; END IF;
  END LOOP;
END;
$orders$;
COMMIT;

DO $race$
DECLARE
  f public.stage_b_weighted_cost_fixture%ROWTYPE;
  phase integer; result jsonb; first_result jsonb; first_id uuid:=gen_random_uuid();
  receipt uuid; deadline timestamptz; expected_quantity numeric; expected_value numeric;
  stock_before jsonb; old_warehouse uuid; name text;
BEGIN
  SELECT * INTO STRICT f FROM public.stage_b_weighted_cost_fixture WHERE ordinal=3;
  SELECT warehouse_id INTO STRICT old_warehouse FROM public.stage_b_weighted_cost_fixture WHERE ordinal=1;
  SELECT to_jsonb(b) INTO STRICT stock_before FROM public.inventory_balances b
    WHERE tenant_id=f.tenant_id AND warehouse_id=old_warehouse AND supplier_sku_id=f.sku_id;
  IF EXISTS(SELECT 1 FROM public.inventory_balances WHERE tenant_id=f.tenant_id AND warehouse_id=f.warehouse_id)
    OR (SELECT count(DISTINCT order_id) FROM public.stage_b_weighted_cost_fixture WHERE ordinal IN (3,4))<>2 THEN
    RAISE EXCEPTION 'Different-price race requires distinct orders and no new-warehouse balance';
  END IF;
  FOREACH name IN ARRAY ARRAY['stage-b-weighted-a','stage-b-weighted-b'] LOOP
    PERFORM extensions.dblink_connect(name,'host=/tmp dbname=postgres user=postgres application_name='||name);
    PERFORM extensions.dblink_exec(name,'SET statement_timeout=''8s''');
  END LOOP;
  FOR phase IN 1..2 LOOP
    receipt:=CASE phase WHEN 1 THEN first_id ELSE gen_random_uuid() END;
    PERFORM extensions.dblink_exec('stage-b-weighted-a','BEGIN');
    SELECT response INTO result FROM extensions.dblink('stage-b-weighted-a',format(
      'SELECT public.stage_b_weighted_cost_receive(3,%s,%s,%L::uuid,%L)',phase,phase,receipt,'weighted-race-a-'||phase))
      AS r(response jsonb);
    IF result->>'status' IS DISTINCT FROM 'receipt_created' OR result->>'idempotent' IS DISTINCT FROM 'false' THEN
      RAISE EXCEPTION 'Different-price first receipt failed: %',result;
    END IF;
    IF phase=1 THEN first_result:=result; END IF;
    IF extensions.dblink_send_query('stage-b-weighted-b',format(
      'SELECT public.stage_b_weighted_cost_receive(4,%s,%s,%L::uuid,%L)',phase,
      CASE phase WHEN 1 THEN 2 ELSE 5 END,gen_random_uuid(),'weighted-race-b-'||phase))<>1 THEN
      RAISE EXCEPTION 'Could not dispatch different-price receipt';
    END IF;
    deadline:=clock_timestamp()+interval '4 seconds';
    LOOP
      PERFORM pg_stat_clear_snapshot();
      EXIT WHEN EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name='stage-b-weighted-b' AND wait_event_type='Lock');
      IF extensions.dblink_is_busy('stage-b-weighted-b')=0 OR clock_timestamp()>deadline THEN
        RAISE EXCEPTION 'Different-price receipt did not reach live stock lock wait in phase %',phase;
      END IF;
      PERFORM pg_sleep(0.01);
    END LOOP;
    PERFORM extensions.dblink_exec('stage-b-weighted-a','COMMIT');
    SELECT response INTO result FROM extensions.dblink_get_result('stage-b-weighted-b') AS r(response jsonb);
    PERFORM * FROM extensions.dblink_get_result('stage-b-weighted-b') AS r(response jsonb);
    expected_quantity:=CASE phase WHEN 1 THEN 3 ELSE 10 END;
    expected_value:=CASE phase WHEN 1 THEN 80 ELSE 270 END;
    IF result->>'status' IS DISTINCT FROM 'receipt_created' OR result->>'idempotent' IS DISTINCT FROM 'false'
      OR (SELECT count(*) FROM public.inventory_balances WHERE tenant_id=f.tenant_id AND warehouse_id=f.warehouse_id)<>1
      OR NOT EXISTS(SELECT 1 FROM public.inventory_balances WHERE tenant_id=f.tenant_id AND warehouse_id=f.warehouse_id
        AND supplier_sku_id=f.sku_id AND quantity_on_hand=expected_quantity AND inventory_value=expected_value
        AND average_unit_cost=round(expected_value/expected_quantity,4))
      OR (SELECT count(*) FROM public.inventory_transactions WHERE tenant_id=f.tenant_id AND warehouse_id=f.warehouse_id)<>phase*2
      OR (SELECT sum(quantity_delta) FROM public.inventory_transactions WHERE tenant_id=f.tenant_id AND warehouse_id=f.warehouse_id)
        IS DISTINCT FROM expected_quantity
      OR (SELECT sum(value_delta) FROM public.inventory_transactions WHERE tenant_id=f.tenant_id AND warehouse_id=f.warehouse_id)
        IS DISTINCT FROM expected_value
      OR (SELECT count(*) FROM public.supplier_payable_events WHERE tenant_id=f.tenant_id AND warehouse_id=f.warehouse_id)<>phase*2
      OR (SELECT sum(amount) FROM public.supplier_payable_events WHERE tenant_id=f.tenant_id AND warehouse_id=f.warehouse_id)
        IS DISTINCT FROM expected_value
      OR stock_before IS DISTINCT FROM (SELECT to_jsonb(b) FROM public.inventory_balances b
        WHERE tenant_id=f.tenant_id AND warehouse_id=old_warehouse AND supplier_sku_id=f.sku_id)
      OR EXISTS(SELECT 1 FROM public.project_cost_events WHERE tenant_id=f.tenant_id)
      OR EXISTS(SELECT 1 FROM public.project_cost_commitments WHERE tenant_id=f.tenant_id) THEN
      RAISE EXCEPTION 'Different-price weighted stock/AP facts mismatch in phase %: %',phase,result;
    END IF;
  END LOOP;
  IF EXISTS(SELECT 1 FROM public.stage_b_weighted_cost_fixture fixture WHERE ordinal IN (3,4) AND (
    (SELECT count(*) FROM public.supplier_purchase_order_receipts r WHERE r.supplier_purchase_order_id=fixture.order_id)<>2
    OR (SELECT sum(amount) FROM public.supplier_payable_events p WHERE p.supplier_purchase_order_id=fixture.order_id)
      IS DISTINCT FROM CASE fixture.ordinal WHEN 3 THEN 60::numeric ELSE 210::numeric END)) THEN
    RAISE EXCEPTION 'Different-price orders lost their distinct frozen liabilities';
  END IF;
  SELECT to_jsonb(b) INTO STRICT stock_before FROM public.inventory_balances b
    WHERE tenant_id=f.tenant_id AND warehouse_id=f.warehouse_id AND supplier_sku_id=f.sku_id;
  result:=public.stage_b_weighted_cost_receive(3,1,1,first_id,'weighted-race-a-1');
  IF result->>'idempotent' IS DISTINCT FROM 'true' OR result-'idempotent' IS DISTINCT FROM first_result-'idempotent'
    OR stock_before IS DISTINCT FROM (SELECT to_jsonb(b) FROM public.inventory_balances b
      WHERE tenant_id=f.tenant_id AND warehouse_id=f.warehouse_id AND supplier_sku_id=f.sku_id)
    OR (SELECT count(*) FROM public.inventory_transactions WHERE tenant_id=f.tenant_id AND warehouse_id=f.warehouse_id)<>4
    OR (SELECT count(*) FROM public.supplier_payable_events WHERE tenant_id=f.tenant_id AND warehouse_id=f.warehouse_id)<>4 THEN
    RAISE EXCEPTION 'Different-price partial replay revalued stock or duplicated liabilities: %',result;
  END IF;
  PERFORM extensions.dblink_disconnect('stage-b-weighted-a');
  PERFORM extensions.dblink_disconnect('stage-b-weighted-b');
END;
$race$;
