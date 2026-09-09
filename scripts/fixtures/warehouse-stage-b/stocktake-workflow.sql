-- New synthetic warehouse/catalog rows; never reuse another fixture's balances.
CREATE TABLE public.stage_d2_fixture(tenant_id uuid,actor_user_id uuid,actor_employee_id uuid,
  warehouse_id uuid,destination_id uuid,sku_id uuid,second_sku_id uuid,missing_sku_id uuid,financial_before jsonb);
CREATE FUNCTION public.stage_d2_command(p_id uuid,p_command text,p_version integer,p_payload jsonb DEFAULT '{}',p_key text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE f public.stage_d2_fixture%ROWTYPE;
BEGIN
  SELECT * INTO STRICT f FROM public.stage_d2_fixture;
  PERFORM set_config('request.jwt.claim.role','service_role',true);
  RETURN public.command_warehouse_stocktake_order(p_id,f.tenant_id,p_command,p_version,p_payload,
    f.actor_user_id,f.actor_employee_id,coalesce(p_key,p_id||':'||p_command||':'||p_version));
END;
$$;
CREATE FUNCTION public.stage_d2_sql(p_id uuid,p_command text,p_version integer,p_payload jsonb DEFAULT '{}',p_key text DEFAULT NULL)
RETURNS text LANGUAGE sql AS $$ SELECT format('SELECT public.stage_d2_command(%L,%L,%s,%L,%L)',p_id,p_command,p_version,p_payload,p_key) $$;
CREATE FUNCTION public.stage_d2_draft(p_skus uuid[]) RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object('warehouse_id',warehouse_id,'reason','  仓库盘点  ',
    'items',(SELECT jsonb_agg(jsonb_build_object('supplier_sku_id',s)) FROM unnest(p_skus) s)) FROM public.stage_d2_fixture
$$;
CREATE FUNCTION public.stage_d2_count(p_sku uuid,p_quantity text,p_reason text DEFAULT '差异复核') RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object('items',jsonb_build_array(jsonb_build_object('supplier_sku_id',p_sku,'counted_quantity',p_quantity,'difference_reason',p_reason)))
$$;
CREATE FUNCTION public.stage_d2_prepare(p_sku uuid,p_quantity text) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_order_id uuid:=gen_random_uuid();
BEGIN
  PERFORM public.stage_d2_command(v_order_id,'save_draft',0,public.stage_d2_draft(ARRAY[p_sku]));
  PERFORM public.stage_d2_command(v_order_id,'start',1);
  PERFORM public.stage_d2_command(v_order_id,'record_counts',2,public.stage_d2_count(p_sku,p_quantity));
  PERFORM public.stage_d2_command(v_order_id,'submit',3);
  RETURN v_order_id;
END;
$$;
CREATE FUNCTION pg_temp.stocktake_fail_second() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.source_type='warehouse_stocktake_item' AND EXISTS(SELECT 1 FROM public.inventory_transactions t
    JOIN public.warehouse_stocktake_order_items a ON a.id=t.warehouse_stocktake_item_id
    JOIN public.warehouse_stocktake_order_items b ON b.stocktake_order_id=a.stocktake_order_id
    WHERE b.id=NEW.warehouse_stocktake_item_id) THEN RAISE EXCEPTION 'STOCKTAKE_INJECTED_SECOND_FACT_FAILURE'; END IF;
  RETURN NEW;
END;
$$;
BEGIN;
DO $test$
DECLARE f public.stage_c_material_fixture%ROWTYPE; w uuid:=gen_random_uuid(); d uuid:=gen_random_uuid();
  s uuid:=gen_random_uuid(); m uuid:=gen_random_uuid(); v_order_id uuid:=gen_random_uuid(); next_id uuid; saved jsonb; completed jsonb;
  payload jsonb; snapshot jsonb; facts integer; events integer; old_version integer; quantity text;
BEGIN
  SELECT * INTO STRICT f FROM public.stage_c_material_fixture;
  INSERT INTO public.warehouses(id,tenant_id,name) VALUES(w,f.tenant_id,'Stocktake warehouse'),(d,f.tenant_id,'Stocktake race destination');
  INSERT INTO public.supplier_skus SELECT (jsonb_populate_record(NULL::public.supplier_skus,to_jsonb(sku)||
    jsonb_build_object('id',x,'sku_code','STOCKTAKE-'||left(replace(x::text,'-',''),16)))).*
    FROM public.supplier_skus sku CROSS JOIN unnest(ARRAY[s,m]) x WHERE sku.id=f.sku_id;
  INSERT INTO public.stage_d2_fixture VALUES(f.tenant_id,f.actor_user_id,f.actor_employee_id,w,d,f.sku_id,s,m,
    public.stage_d_transfer_financial_snapshot(f.tenant_id));
  INSERT INTO public.employee_permission_overrides(employee_id,permission_id,effect,access_scope)
    SELECT f.actor_employee_id,p.id,'allow','all' FROM public.permissions p WHERE code IN ('inventory.stocktake.manage','inventory.stocktake.approve');
  PERFORM public.stage_d_transfer_expect_error(public.stage_d2_sql(v_order_id,'save_draft',0,public.stage_d2_draft(ARRAY[f.sku_id,s,m])),
    'WAREHOUSE_STOCKTAKE_NOT_ENABLED');
  UPDATE public.tenant_supplier_settings SET warehouse_stocktakes_enabled=true WHERE tenant_id=f.tenant_id;
  INSERT INTO public.inventory_balances(tenant_id,warehouse_id,supplier_sku_id,quantity_on_hand,inventory_value,average_unit_cost)
    VALUES(f.tenant_id,w,f.sku_id,0.3,0.02,0.0667),(f.tenant_id,w,s,2,30,15);
  INSERT INTO public.inventory_transactions(tenant_id,warehouse_id,supplier_sku_id,transaction_type,quantity_delta,unit_cost,value_delta,
    source_type,source_id,occurred_at,created_by_employee_id)
    VALUES(f.tenant_id,w,f.sku_id,'purchase_receipt',0.3,0.0667,0.02,'supplier_purchase_receipt_item',gen_random_uuid(),now(),f.actor_employee_id),
      (f.tenant_id,w,s,'purchase_receipt',2,15,30,'supplier_purchase_receipt_item',gen_random_uuid(),now(),f.actor_employee_id);
  SELECT jsonb_agg(to_jsonb(b) ORDER BY b.id) INTO snapshot FROM public.inventory_balances b WHERE warehouse_id=w;
  SELECT count(*) INTO facts FROM public.inventory_transactions WHERE tenant_id=f.tenant_id;
  payload:=public.stage_d2_draft(ARRAY[f.sku_id,s,m]);
  saved:=public.stage_d2_command(v_order_id,'save_draft',0,payload);
  IF saved->>'status' IS DISTINCT FROM 'saved' OR saved->'order'->>'reason' IS DISTINCT FROM '仓库盘点' THEN RAISE EXCEPTION 'Stocktake draft result'; END IF;
  IF public.stage_d2_command(v_order_id,'start',1)->>'status' IS DISTINCT FROM 'counting' THEN RAISE EXCEPTION 'Start state'; END IF;
  IF EXISTS(SELECT 1 FROM public.inventory_balances WHERE warehouse_id=w AND supplier_sku_id=m)
    OR (SELECT count(*) FROM public.warehouse_stocktake_order_items WHERE stocktake_order_id=v_order_id AND snapshot_at IS NOT NULL AND counted_quantity IS NULL)<>3
    OR NOT EXISTS(SELECT 1 FROM public.warehouse_stocktake_order_items WHERE stocktake_order_id=v_order_id AND supplier_sku_id=m
      AND book_balance_id IS NULL AND book_balance_version IS NULL AND book_quantity=0 AND book_value=0 AND book_unit_cost=0) THEN
    RAISE EXCEPTION 'Start must freeze missing presence without creating balance or zero count';
  END IF;
  PERFORM public.stage_d2_command(v_order_id,'record_counts',2,public.stage_d2_count(f.sku_id,'0.2'));
  PERFORM public.stage_d_transfer_expect_error(public.stage_d2_sql(v_order_id,'submit',3),'WAREHOUSE_STOCKTAKE_COUNTS_REQUIRED');
  IF (SELECT count(*) FROM public.warehouse_stocktake_order_items WHERE stocktake_order_id=v_order_id AND counted_quantity IS NULL)<>2 THEN RAISE EXCEPTION 'Partial count coerced missing'; END IF;
  PERFORM public.stage_d_transfer_expect_error(public.stage_d2_sql(v_order_id,'record_counts',3,public.stage_d2_count(s,'3',NULL)),
    'WAREHOUSE_STOCKTAKE_DIFFERENCE_REASON_REQUIRED');
  PERFORM public.stage_d2_command(v_order_id,'record_counts',3,public.stage_d2_count(s,'3'));
  PERFORM public.stage_d2_command(v_order_id,'record_counts',4,public.stage_d2_count(m,'0',NULL));
  PERFORM public.stage_d2_command(v_order_id,'submit',5);
  IF (SELECT jsonb_agg(to_jsonb(b) ORDER BY b.id) FROM public.inventory_balances b WHERE warehouse_id=w) IS DISTINCT FROM snapshot
    OR (SELECT count(*) FROM public.inventory_transactions WHERE tenant_id=f.tenant_id)<>facts THEN RAISE EXCEPTION 'Pre-completion wrote inventory'; END IF;
  SELECT count(*) INTO events FROM public.warehouse_stocktake_command_events;
  CREATE TRIGGER stocktake_fail_second BEFORE INSERT ON public.inventory_transactions FOR EACH ROW EXECUTE FUNCTION pg_temp.stocktake_fail_second();
  PERFORM public.stage_d_transfer_expect_error(public.stage_d2_sql(v_order_id,'complete',6),'STOCKTAKE_INJECTED_SECOND_FACT_FAILURE');
  DROP TRIGGER stocktake_fail_second ON public.inventory_transactions;
  IF (SELECT jsonb_agg(to_jsonb(b) ORDER BY b.id) FROM public.inventory_balances b WHERE warehouse_id=w) IS DISTINCT FROM snapshot
    OR (SELECT count(*) FROM public.inventory_transactions WHERE tenant_id=f.tenant_id)<>facts
    OR (SELECT count(*) FROM public.warehouse_stocktake_command_events)<>events
    OR EXISTS(SELECT 1 FROM public.warehouse_stocktake_order_items WHERE stocktake_order_id=v_order_id AND amount IS NOT NULL)
    OR (SELECT version FROM public.warehouse_stocktake_orders o WHERE o.id=v_order_id)<>6 THEN RAISE EXCEPTION 'Second fact failure did not roll back entire command'; END IF;
  completed:=public.stage_d2_command(v_order_id,'complete',6);
  IF completed->>'status' IS DISTINCT FROM 'completed'
    OR (SELECT amount FROM public.warehouse_stocktake_order_items WHERE stocktake_order_id=v_order_id AND supplier_sku_id=f.sku_id) IS DISTINCT FROM 0.01
    OR (SELECT amount FROM public.warehouse_stocktake_order_items WHERE stocktake_order_id=v_order_id AND supplier_sku_id=s) IS DISTINCT FROM 15
    OR (SELECT amount FROM public.warehouse_stocktake_order_items WHERE stocktake_order_id=v_order_id AND supplier_sku_id=m) IS DISTINCT FROM 0
    OR EXISTS(SELECT 1 FROM public.inventory_balances WHERE warehouse_id=w AND supplier_sku_id=m)
    OR (SELECT count(*) FROM public.inventory_transactions WHERE tenant_id=f.tenant_id)<>facts+2 THEN RAISE EXCEPTION 'Gain/loss/missing-zero valuation'; END IF;
  IF public.stage_d2_command(v_order_id,'save_draft',0,payload) IS DISTINCT FROM saved
    OR public.stage_d2_command(v_order_id,'complete',6) IS DISTINCT FROM completed THEN RAISE EXCEPTION 'Frozen exact replay'; END IF;
  next_id:=public.stage_d2_prepare(f.sku_id,'0');
  PERFORM public.stage_d2_command(next_id,'complete',4);
  IF (SELECT amount FROM public.warehouse_stocktake_order_items WHERE stocktake_order_id=next_id) IS DISTINCT FROM 0.01
    OR (SELECT quantity_on_hand<>0 OR inventory_value<>0 OR average_unit_cost<>0 FROM public.inventory_balances WHERE warehouse_id=w AND supplier_sku_id=f.sku_id) THEN
    RAISE EXCEPTION 'Count zero must clear entire remaining valuation tail';
  END IF;
  next_id:=public.stage_d2_prepare(f.sku_id,'1');
  PERFORM public.stage_d_transfer_expect_error(public.stage_d2_sql(next_id,'complete',4),'WAREHOUSE_STOCKTAKE_COST_BASIS_REQUIRED');
  PERFORM public.stage_d2_command(next_id,'cancel',4);
  SELECT version INTO old_version FROM public.inventory_balances WHERE warehouse_id=w AND supplier_sku_id=s;
  next_id:=public.stage_d2_prepare(s,'3');
  PERFORM public.stage_d2_command(next_id,'complete',4);
  IF (SELECT version FROM public.inventory_balances WHERE warehouse_id=w AND supplier_sku_id=s)<>old_version
    OR EXISTS(SELECT 1 FROM public.inventory_transactions tx JOIN public.warehouse_stocktake_order_items i ON i.id=tx.source_id WHERE i.stocktake_order_id=next_id) THEN
    RAISE EXCEPTION 'No difference must not increment balance or emit zero facts';
  END IF;
  -- Positive quantity with genuine zero cost is legal; zero book quantity gain is not.
  INSERT INTO public.inventory_balances(tenant_id,warehouse_id,supplier_sku_id,quantity_on_hand) VALUES(f.tenant_id,w,m,2);
  INSERT INTO public.inventory_transactions(tenant_id,warehouse_id,supplier_sku_id,transaction_type,quantity_delta,unit_cost,value_delta,
    source_type,source_id,occurred_at,created_by_employee_id)
    VALUES(f.tenant_id,w,m,'purchase_receipt',2,0,0,'supplier_purchase_receipt_item',gen_random_uuid(),now(),f.actor_employee_id);
  FOREACH quantity IN ARRAY ARRAY['3','1','0'] LOOP
    next_id:=public.stage_d2_prepare(m,quantity); PERFORM public.stage_d2_command(next_id,'complete',4);
    IF (SELECT amount FROM public.warehouse_stocktake_order_items WHERE stocktake_order_id=next_id)<>0 THEN RAISE EXCEPTION 'Zero cost valuation'; END IF;
  END LOOP;
  IF public.stage_d_transfer_financial_snapshot(f.tenant_id) IS DISTINCT FROM (SELECT financial_before FROM public.stage_d2_fixture)
    OR EXISTS(SELECT 1 FROM public.inventory_balances b JOIN (SELECT warehouse_id,supplier_sku_id,sum(quantity_delta) q,sum(value_delta) v
      FROM public.inventory_transactions GROUP BY warehouse_id,supplier_sku_id) t USING(warehouse_id,supplier_sku_id)
      WHERE b.warehouse_id=w AND (b.quantity_on_hand<>q OR b.inventory_value<>v)) THEN RAISE EXCEPTION 'Stocktake ledger/financial invariants'; END IF;
END;
$test$;
COMMIT;
SELECT 'EVIDENCE stocktake workflow: six commands, partial NULL counts, frozen missing snapshot, gain/loss/tail/zero-cost/no-basis/no-op, second-ledger rollback, exact replay, ledger reconciliation, full financial snapshot unchanged';
