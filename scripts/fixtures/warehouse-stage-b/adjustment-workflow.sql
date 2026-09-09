-- All data below is synthetic and belongs only to the offline regression DB.
CREATE TABLE public.stage_d22_fixture(tenant_id uuid,actor_user_id uuid,actor_employee_id uuid,
  warehouse_id uuid,destination_id uuid,sku_id uuid,second_sku_id uuid,missing_sku_id uuid,financial_before jsonb);
CREATE FUNCTION public.stage_d22_command(p_id uuid,p_command text,p_version integer,p_payload jsonb DEFAULT '{}',p_key text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE f public.stage_d22_fixture%ROWTYPE;
BEGIN
  SELECT * INTO STRICT f FROM public.stage_d22_fixture;
  PERFORM set_config('request.jwt.claim.role','service_role',true);
  RETURN public.command_warehouse_adjustment_order(p_id,f.tenant_id,p_command,p_version,p_payload,
    f.actor_user_id,f.actor_employee_id,coalesce(p_key,p_id||':'||p_command||':'||p_version));
END;
$$;
CREATE FUNCTION public.stage_d22_sql(p_id uuid,p_command text,p_version integer,p_payload jsonb DEFAULT '{}',p_key text DEFAULT NULL)
RETURNS text LANGUAGE sql AS $$ SELECT format('SELECT public.stage_d22_command(%L,%L,%s,%L,%L)',p_id,p_command,p_version,p_payload,p_key) $$;
CREATE FUNCTION public.stage_d22_draft(p_sku uuid,p_delta text DEFAULT '1',p_reason text DEFAULT '差额复核') RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object('warehouse_id',warehouse_id,'reason','  仓库手工调整  ',
    'items',jsonb_build_array(jsonb_build_object('supplier_sku_id',p_sku,'quantity_delta',p_delta,'adjustment_reason',p_reason))) FROM public.stage_d22_fixture
$$;
CREATE FUNCTION public.stage_d22_prepare(p_sku uuid,p_delta text DEFAULT '1') RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE result uuid:=gen_random_uuid();
BEGIN
  PERFORM public.stage_d22_command(result,'save_draft',0,public.stage_d22_draft(p_sku,p_delta));
  PERFORM public.stage_d22_command(result,'submit',1);
  RETURN result;
END;
$$;
CREATE FUNCTION public.stage_d22_snapshot() RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object('orders',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.warehouse_adjustment_orders x),
    'items',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.warehouse_adjustment_order_items x),
    'events',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.warehouse_adjustment_command_events x),
    'balances',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.inventory_balances x),
    'facts',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.inventory_transactions x),
    'finances',public.stage_d_transfer_financial_snapshot((SELECT tenant_id FROM public.stage_d22_fixture)))
$$;
CREATE FUNCTION pg_temp.adjustment_fail_second() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.source_type='warehouse_adjustment_item' AND EXISTS(SELECT 1 FROM public.inventory_transactions t
    JOIN public.warehouse_adjustment_order_items a ON a.id=t.warehouse_adjustment_item_id
    JOIN public.warehouse_adjustment_order_items b ON b.adjustment_order_id=a.adjustment_order_id
    WHERE b.id=NEW.warehouse_adjustment_item_id) THEN RAISE EXCEPTION 'ADJUSTMENT_INJECTED_SECOND_FACT_FAILURE'; END IF;
  RETURN NEW;
END;
$$;
CREATE FUNCTION pg_temp.adjustment_fail_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'ADJUSTMENT_INJECTED_EVENT_FAILURE'; END;
$$;
BEGIN;
DO $$
DECLARE f public.stage_c_material_fixture%ROWTYPE; w uuid:=gen_random_uuid(); d uuid:=gen_random_uuid();
  s uuid:=gen_random_uuid(); m uuid:=gen_random_uuid(); id1 uuid:=gen_random_uuid(); id2 uuid;
  payload jsonb; saved jsonb; completed jsonb; snapshot jsonb; inventory jsonb; quantity text;
BEGIN
  SELECT * INTO STRICT f FROM public.stage_c_material_fixture;
  -- Guarantee the later invalid SKU follows the valid SKU in the RPC lock order.
  IF s>m THEN id2:=s; s:=m; m:=id2; END IF;
  INSERT INTO public.warehouses(id,tenant_id,name) VALUES(w,f.tenant_id,'Adjustment warehouse'),(d,f.tenant_id,'Adjustment destination');
  INSERT INTO public.supplier_skus SELECT (jsonb_populate_record(NULL::public.supplier_skus,to_jsonb(sku)||
    jsonb_build_object('id',x,'sku_code','ADJUST-'||left(replace(x::text,'-',''),16)))).*
    FROM public.supplier_skus sku CROSS JOIN unnest(ARRAY[s,m]) x WHERE sku.id=f.sku_id;
  INSERT INTO public.stage_d22_fixture VALUES(f.tenant_id,f.actor_user_id,f.actor_employee_id,w,d,f.sku_id,s,m,public.stage_d_transfer_financial_snapshot(f.tenant_id));
  INSERT INTO public.employee_permission_overrides(employee_id,permission_id,effect,access_scope)
    SELECT f.actor_employee_id,id,'allow','all' FROM public.permissions WHERE code IN ('inventory.adjustment.manage','inventory.adjustment.approve');
  PERFORM public.stage_d_transfer_expect_error(public.stage_d22_sql(id1,'save_draft',0,public.stage_d22_draft(s)),'WAREHOUSE_ADJUSTMENT_NOT_ENABLED');
  UPDATE public.tenant_supplier_settings SET warehouse_adjustments_enabled=true WHERE tenant_id=f.tenant_id;
  INSERT INTO public.inventory_balances(tenant_id,warehouse_id,supplier_sku_id,quantity_on_hand,inventory_value,average_unit_cost)
    VALUES(f.tenant_id,w,f.sku_id,0.3,0.02,0.0667),(f.tenant_id,w,s,2,30,15);
  INSERT INTO public.inventory_transactions(tenant_id,warehouse_id,supplier_sku_id,transaction_type,quantity_delta,unit_cost,value_delta,source_type,source_id,occurred_at,created_by_employee_id)
    VALUES(f.tenant_id,w,f.sku_id,'purchase_receipt',0.3,0.0667,0.02,'supplier_purchase_receipt_item',gen_random_uuid(),now(),f.actor_employee_id),
      (f.tenant_id,w,s,'purchase_receipt',2,15,30,'supplier_purchase_receipt_item',gen_random_uuid(),now(),f.actor_employee_id);
  inventory:=public.stage_d22_snapshot()-ARRAY['orders','items','events'];
  payload:=public.stage_d22_draft(f.sku_id,'-0.1');
  payload:=jsonb_set(payload,'{items}',(payload->'items')||(public.stage_d22_draft(s,'1')->'items'));
  saved:=public.stage_d22_command(id1,'save_draft',0,payload);
  IF saved->>'status' IS DISTINCT FROM 'saved' OR saved->'order'->>'reason' IS DISTINCT FROM '仓库手工调整'
    OR EXISTS(SELECT 1 FROM public.warehouse_adjustment_order_items WHERE adjustment_order_id=id1 AND snapshot_at IS NOT NULL) THEN RAISE EXCEPTION 'Draft contract'; END IF;
  PERFORM public.stage_d22_command(id1,'submit',1);
  IF (SELECT count(*) FROM public.warehouse_adjustment_order_items WHERE adjustment_order_id=id1 AND snapshot_at IS NOT NULL AND amount IS NULL AND unit_cost IS NULL)<>2
    OR (public.stage_d22_snapshot()-ARRAY['orders','items','events']) IS DISTINCT FROM inventory THEN RAISE EXCEPTION 'Submit freeze/inventory contract'; END IF;
  snapshot:=public.stage_d22_snapshot();
  CREATE TRIGGER adjustment_fail_second BEFORE INSERT ON public.inventory_transactions FOR EACH ROW EXECUTE FUNCTION pg_temp.adjustment_fail_second();
  PERFORM public.stage_d_transfer_expect_error(public.stage_d22_sql(id1,'complete',2),'ADJUSTMENT_INJECTED_SECOND_FACT_FAILURE');
  DROP TRIGGER adjustment_fail_second ON public.inventory_transactions;
  IF public.stage_d22_snapshot() IS DISTINCT FROM snapshot THEN RAISE EXCEPTION 'Second fact failure did not restore full snapshot'; END IF;
  CREATE TRIGGER adjustment_fail_event BEFORE INSERT ON public.warehouse_adjustment_command_events FOR EACH ROW EXECUTE FUNCTION pg_temp.adjustment_fail_event();
  PERFORM public.stage_d_transfer_expect_error(public.stage_d22_sql(id1,'complete',2),'ADJUSTMENT_INJECTED_EVENT_FAILURE');
  DROP TRIGGER adjustment_fail_event ON public.warehouse_adjustment_command_events;
  IF public.stage_d22_snapshot() IS DISTINCT FROM snapshot THEN RAISE EXCEPTION 'Event failure did not restore full snapshot'; END IF;
  completed:=public.stage_d22_command(id1,'complete',2);
  IF completed->>'status' IS DISTINCT FROM 'completed'
    OR (SELECT amount FROM public.warehouse_adjustment_order_items WHERE adjustment_order_id=id1 AND supplier_sku_id=f.sku_id) IS DISTINCT FROM 0.01
    OR (SELECT amount FROM public.warehouse_adjustment_order_items WHERE adjustment_order_id=id1 AND supplier_sku_id=s) IS DISTINCT FROM 15 THEN RAISE EXCEPTION 'Exact unrounded valuation'; END IF;
  IF public.stage_d22_command(id1,'save_draft',0,payload) IS DISTINCT FROM saved OR public.stage_d22_command(id1,'complete',2) IS DISTINCT FROM completed THEN RAISE EXCEPTION 'Exact frozen replay'; END IF;
  id2:=public.stage_d22_prepare(f.sku_id,'-0.2'); PERFORM public.stage_d22_command(id2,'complete',2);
  IF (SELECT amount FROM public.warehouse_adjustment_order_items WHERE adjustment_order_id=id2) IS DISTINCT FROM 0.01
    OR (SELECT quantity_on_hand<>0 OR inventory_value<>0 OR average_unit_cost<>0 FROM public.inventory_balances WHERE warehouse_id=w AND supplier_sku_id=f.sku_id) THEN RAISE EXCEPTION 'Final decrement leaves valuation tail'; END IF;
  FOREACH quantity IN ARRAY ARRAY['1','-0.0001'] LOOP
    id2:=gen_random_uuid(); PERFORM public.stage_d22_command(id2,'save_draft',0,public.stage_d22_draft(m,quantity));
    PERFORM public.stage_d_transfer_expect_error(public.stage_d22_sql(id2,'submit',1),CASE WHEN quantity='1' THEN 'WAREHOUSE_ADJUSTMENT_COST_BASIS_REQUIRED' ELSE 'WAREHOUSE_ADJUSTMENT_INSUFFICIENT_STOCK' END);
    PERFORM public.stage_d22_command(id2,'cancel',1);
    id2:=gen_random_uuid(); PERFORM public.stage_d22_command(id2,'save_draft',0,public.stage_d22_draft(f.sku_id,quantity));
    PERFORM public.stage_d_transfer_expect_error(public.stage_d22_sql(id2,'submit',1),CASE WHEN quantity='1' THEN 'WAREHOUSE_ADJUSTMENT_COST_BASIS_REQUIRED' ELSE 'WAREHOUSE_ADJUSTMENT_INSUFFICIENT_STOCK' END);
    PERFORM public.stage_d22_command(id2,'cancel',1);
  END LOOP;
  -- Second line fails after a legal first line; no snapshots or receipts leak.
  id2:=gen_random_uuid(); payload:=jsonb_set(public.stage_d22_draft(s),'{items}',(public.stage_d22_draft(s)->'items')||(public.stage_d22_draft(m)->'items'));
  PERFORM public.stage_d22_command(id2,'save_draft',0,payload); snapshot:=public.stage_d22_snapshot();
  PERFORM public.stage_d_transfer_expect_error(public.stage_d22_sql(id2,'submit',1),'WAREHOUSE_ADJUSTMENT_COST_BASIS_REQUIRED');
  IF public.stage_d22_snapshot() IS DISTINCT FROM snapshot THEN RAISE EXCEPTION 'Failed submit leaked snapshots'; END IF;
  PERFORM public.stage_d22_command(id2,'cancel',1);
  INSERT INTO public.inventory_balances(tenant_id,warehouse_id,supplier_sku_id,quantity_on_hand) VALUES(f.tenant_id,w,m,2);
  INSERT INTO public.inventory_transactions(tenant_id,warehouse_id,supplier_sku_id,transaction_type,quantity_delta,unit_cost,value_delta,source_type,source_id,occurred_at,created_by_employee_id)
    VALUES(f.tenant_id,w,m,'purchase_receipt',2,0,0,'supplier_purchase_receipt_item',gen_random_uuid(),now(),f.actor_employee_id);
  FOREACH quantity IN ARRAY ARRAY['1','-2','-1'] LOOP
    id2:=public.stage_d22_prepare(m,quantity); PERFORM public.stage_d22_command(id2,'complete',2);
    IF (SELECT amount FROM public.warehouse_adjustment_order_items WHERE adjustment_order_id=id2)<>0 THEN RAISE EXCEPTION 'Zero cost rejected'; END IF;
  END LOOP;
  inventory:=public.stage_d22_snapshot()-ARRAY['orders','items','events'];
  id2:=public.stage_d22_prepare(s); PERFORM public.stage_d22_command(id2,'cancel',2);
  IF (public.stage_d22_snapshot()-ARRAY['orders','items','events']) IS DISTINCT FROM inventory THEN RAISE EXCEPTION 'Cancellation changed inventory'; END IF;
  IF public.stage_d_transfer_financial_snapshot(f.tenant_id) IS DISTINCT FROM (SELECT financial_before FROM public.stage_d22_fixture) THEN RAISE EXCEPTION 'Adjustment financial mutation'; END IF;
  IF EXISTS(SELECT 1 FROM (SELECT * FROM public.inventory_balances WHERE warehouse_id=w) b FULL JOIN
    (SELECT warehouse_id,supplier_sku_id,sum(quantity_delta) q,sum(value_delta) v FROM public.inventory_transactions WHERE warehouse_id=w GROUP BY warehouse_id,supplier_sku_id) l USING(warehouse_id,supplier_sku_id)
    WHERE b.quantity_on_hand IS DISTINCT FROM l.q OR b.inventory_value IS DISTINCT FROM l.v OR b.average_unit_cost IS DISTINCT FROM CASE WHEN l.q=0 THEN 0 ELSE round(l.v/l.q,4) END) THEN RAISE EXCEPTION 'Full ledger reconciliation'; END IF;
END;
$$;
COMMIT;
SELECT 'EVIDENCE adjustment workflow: four commands, signed exact valuation, tail, zero cost, insufficient/missing basis, all-row submit, second-fact/event full rollback, exact replay, full ledger/financial invariants';
