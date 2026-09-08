-- Reuse the synthetic material fixture; all writes stay in the offline DB.
CREATE TABLE public.stage_d_transfer_fixture(tenant_id uuid,actor_user_id uuid,actor_employee_id uuid,
  source_warehouse_id uuid,destination_warehouse_id uuid,sku_id uuid,second_sku_id uuid,completed_order_id uuid,
  financial_before jsonb);
CREATE FUNCTION public.stage_d_transfer_expect_error(p_sql text,p_error text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM=p_error THEN RETURN; END IF;
    RAISE EXCEPTION 'Expected %, got %',p_error,SQLERRM;
  END;
  RAISE EXCEPTION 'Expected error %, but command succeeded',p_error;
END;
$$;
CREATE FUNCTION public.stage_d_transfer_financial_snapshot(p_tenant_id uuid) RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object(
    'costs',(SELECT jsonb_agg(to_jsonb(e) ORDER BY id) FROM public.project_cost_events e WHERE tenant_id=p_tenant_id),
    'payables',(SELECT jsonb_agg(to_jsonb(e) ORDER BY id) FROM public.supplier_payable_events e WHERE tenant_id=p_tenant_id),
    'payments',(SELECT jsonb_agg(to_jsonb(e) ORDER BY id) FROM public.supplier_payments e WHERE tenant_id=p_tenant_id),
    'cash',(SELECT jsonb_agg(to_jsonb(e) ORDER BY id) FROM public.finance_ledger_entries e WHERE tenant_id=p_tenant_id))
$$;
CREATE FUNCTION public.stage_d_transfer_command(p_id uuid,p_command text,p_version integer,p_payload jsonb,p_key text)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE f public.stage_d_transfer_fixture%ROWTYPE;
BEGIN
  SELECT * INTO STRICT f FROM public.stage_d_transfer_fixture;
  PERFORM set_config('request.jwt.claim.role','service_role',true);
  RETURN public.command_warehouse_transfer_order(p_id,f.tenant_id,p_command,p_version,p_payload,f.actor_user_id,f.actor_employee_id,p_key);
END;
$$;
CREATE FUNCTION pg_temp.transfer_fail_inbound() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.transaction_type='transfer_in' THEN RAISE EXCEPTION 'TRANSFER_INJECTED_FAILURE'; END IF;
  RETURN NEW;
END;
$$;
BEGIN;
DO $test$
DECLARE
  f public.stage_c_material_fixture%ROWTYPE; destination uuid:=gen_random_uuid(); second_sku uuid:=gen_random_uuid();
  first_id uuid:=gen_random_uuid(); tail_id uuid:=gen_random_uuid(); average_id uuid:=gen_random_uuid(); multi_id uuid:=gen_random_uuid();
  payload jsonb; saved jsonb; completed jsonb; result jsonb; facts integer; commands integer;
BEGIN
  SELECT * INTO STRICT f FROM public.stage_c_material_fixture;
  PERFORM set_config('request.jwt.claim.role','service_role',true);
  INSERT INTO public.warehouses(id,tenant_id,name) VALUES(destination,f.tenant_id,'Transfer destination');
  INSERT INTO public.employee_permission_overrides(employee_id,permission_id,effect,access_scope)
    SELECT f.actor_employee_id,id,'allow','all' FROM public.permissions
    WHERE code IN ('inventory.transfer.manage','inventory.transfer.approve');
  IF public.get_warehouse_transfer_settings(f.tenant_id,f.actor_user_id,f.actor_employee_id)<>'{"warehouse_transfers_enabled":false}'::jsonb THEN
    RAISE EXCEPTION 'New flag not independently disabled';
  END IF;
  UPDATE public.tenant_supplier_settings SET warehouse_transfers_enabled=true WHERE tenant_id=f.tenant_id;
  -- This is synthetic catalog setup, not an alternate application write path.
  INSERT INTO public.supplier_skus
    SELECT (jsonb_populate_record(NULL::public.supplier_skus,to_jsonb(s)||jsonb_build_object(
      'id',second_sku,'sku_code','TRANSFER-'||left(replace(second_sku::text,'-',''),16),'name','Transfer second SKU'))).*
    FROM public.supplier_skus s WHERE id=f.sku_id;
  INSERT INTO public.stage_d_transfer_fixture VALUES(f.tenant_id,f.actor_user_id,f.actor_employee_id,
    f.warehouse_id,destination,f.sku_id,second_sku,first_id,public.stage_d_transfer_financial_snapshot(f.tenant_id));
  SELECT count(*) INTO facts FROM public.inventory_transactions WHERE tenant_id=f.tenant_id;
  payload:=jsonb_build_object('source_warehouse_id',f.warehouse_id,'destination_warehouse_id',destination,'reason','  First transfer  ',
    'items',jsonb_build_array(jsonb_build_object('supplier_sku_id',f.sku_id,'quantity','0.1')));
  saved:=public.stage_d_transfer_command(first_id,'save_draft',0,payload,'transfer-first-save');
  IF saved->>'status'<>'saved' OR saved->'order'->>'version'<>'1' OR saved->'order'->>'reason'<>'First transfer' THEN
    RAISE EXCEPTION 'Transfer save failed: %',saved;
  END IF;
  PERFORM public.stage_d_transfer_command(first_id,'submit',1,'{}','transfer-first-submit');
  IF (SELECT count(*) FROM public.inventory_transactions WHERE tenant_id=f.tenant_id)<>facts
    OR (SELECT quantity_on_hand FROM public.inventory_balances WHERE tenant_id=f.tenant_id AND warehouse_id=f.warehouse_id AND supplier_sku_id=f.sku_id)<>0.3 THEN
    RAISE EXCEPTION 'Transfer submission consumed/reserved inventory';
  END IF;
  SELECT count(*) INTO commands FROM public.warehouse_transfer_command_events WHERE tenant_id=f.tenant_id;
  CREATE TRIGGER stage_d_fail_inbound BEFORE INSERT ON public.inventory_transactions
    FOR EACH ROW EXECUTE FUNCTION pg_temp.transfer_fail_inbound();
  PERFORM public.stage_d_transfer_expect_error(format('SELECT public.stage_d_transfer_command(%L,''complete'',2,''{}'',''transfer-first-complete'')',first_id),
    'TRANSFER_INJECTED_FAILURE');
  DROP TRIGGER stage_d_fail_inbound ON public.inventory_transactions;
  IF (SELECT count(*) FROM public.inventory_transactions WHERE tenant_id=f.tenant_id)<>facts
    OR (SELECT count(*) FROM public.warehouse_transfer_command_events WHERE tenant_id=f.tenant_id)<>commands
    OR EXISTS(SELECT 1 FROM public.inventory_balances WHERE tenant_id=f.tenant_id AND warehouse_id=destination)
    OR EXISTS(SELECT 1 FROM public.warehouse_transfer_order_items WHERE transfer_order_id=first_id AND amount IS NOT NULL)
    OR (SELECT version FROM public.warehouse_transfer_orders WHERE id=first_id)<>2
    OR (SELECT quantity_on_hand FROM public.inventory_balances WHERE tenant_id=f.tenant_id AND warehouse_id=f.warehouse_id AND supplier_sku_id=f.sku_id)<>0.3 THEN
    RAISE EXCEPTION 'Inbound failure leaked outbound/balance/item/state/receipt';
  END IF;
  completed:=public.stage_d_transfer_command(first_id,'complete',2,'{}','transfer-first-complete');
  IF completed->>'status'<>'completed'
    OR (SELECT amount FROM public.warehouse_transfer_order_items WHERE transfer_order_id=first_id)<>0.01
    OR (SELECT inventory_value FROM public.inventory_balances WHERE tenant_id=f.tenant_id AND warehouse_id=destination AND supplier_sku_id=f.sku_id)<>0.01 THEN
    RAISE EXCEPTION 'First transfer did not post identical inbound value';
  END IF;
  IF public.stage_d_transfer_command(first_id,'save_draft',0,payload,'transfer-first-save')<>saved
    OR public.stage_d_transfer_command(first_id,'complete',2,'{}','transfer-first-complete')<>completed
    OR (SELECT count(*) FROM public.inventory_transactions WHERE tenant_id=f.tenant_id)<>facts+2 THEN
    RAISE EXCEPTION 'Replay changed frozen result or added facts';
  END IF;
  payload:=jsonb_set(payload,'{items,0,quantity}','"0.2"');
  PERFORM public.stage_d_transfer_command(tail_id,'save_draft',0,payload,'transfer-tail-save');
  PERFORM public.stage_d_transfer_command(tail_id,'submit',1,'{}','transfer-tail-submit');
  PERFORM public.stage_d_transfer_command(tail_id,'complete',2,'{}','transfer-tail-complete');
  IF (SELECT amount FROM public.warehouse_transfer_order_items WHERE transfer_order_id=tail_id)<>0.01
    OR (SELECT quantity_on_hand<>0 OR inventory_value<>0 OR average_unit_cost<>0 FROM public.inventory_balances
      WHERE tenant_id=f.tenant_id AND warehouse_id=f.warehouse_id AND supplier_sku_id=f.sku_id)
    OR (SELECT inventory_value<>0.02 OR quantity_on_hand<>0.3 FROM public.inventory_balances
      WHERE tenant_id=f.tenant_id AND warehouse_id=destination AND supplier_sku_id=f.sku_id) THEN
    RAISE EXCEPTION 'Final transfer did not clear the valuation tail';
  END IF;
  INSERT INTO public.inventory_balances(tenant_id,warehouse_id,supplier_sku_id,quantity_on_hand,inventory_value,average_unit_cost)
    VALUES(f.tenant_id,f.warehouse_id,second_sku,2,30,15),(f.tenant_id,destination,second_sku,3,90,30);
  INSERT INTO public.inventory_transactions(tenant_id,warehouse_id,supplier_sku_id,transaction_type,
    quantity_delta,unit_cost,value_delta,source_type,source_id,occurred_at,created_by_employee_id)
    VALUES(f.tenant_id,f.warehouse_id,second_sku,'purchase_receipt',2,15,30,'supplier_purchase_receipt_item',gen_random_uuid(),now(),f.actor_employee_id),
      (f.tenant_id,destination,second_sku,'purchase_receipt',3,30,90,'supplier_purchase_receipt_item',gen_random_uuid(),now(),f.actor_employee_id);
  payload:=jsonb_build_object('source_warehouse_id',f.warehouse_id,'destination_warehouse_id',destination,'reason','Moving average',
    'items',jsonb_build_array(jsonb_build_object('supplier_sku_id',second_sku,'quantity','1')));
  PERFORM public.stage_d_transfer_command(average_id,'save_draft',0,payload,'transfer-average-save');
  PERFORM public.stage_d_transfer_command(average_id,'submit',1,'{}','transfer-average-submit');
  PERFORM public.stage_d_transfer_command(average_id,'complete',2,'{}','transfer-average-complete');
  IF (SELECT amount FROM public.warehouse_transfer_order_items WHERE transfer_order_id=average_id)<>15
    OR (SELECT quantity_on_hand<>4 OR inventory_value<>105 OR average_unit_cost<>26.25 FROM public.inventory_balances
      WHERE tenant_id=f.tenant_id AND warehouse_id=destination AND supplier_sku_id=second_sku) THEN
    RAISE EXCEPTION 'Destination used its own old cost instead of transferred value';
  END IF;
  payload:=jsonb_build_object('source_warehouse_id',destination,'destination_warehouse_id',f.warehouse_id,'reason','Two SKU reverse transfer',
    'items',jsonb_build_array(jsonb_build_object('supplier_sku_id',second_sku,'quantity','1'),
      jsonb_build_object('supplier_sku_id',f.sku_id,'quantity','0.3')));
  PERFORM public.stage_d_transfer_command(multi_id,'save_draft',0,payload,'transfer-multi-save');
  PERFORM public.stage_d_transfer_command(multi_id,'submit',1,'{}','transfer-multi-submit');
  PERFORM public.stage_d_transfer_command(multi_id,'complete',2,'{}','transfer-multi-complete');
  IF (SELECT count(*) FROM public.warehouse_transfer_order_items WHERE transfer_order_id=multi_id)<>2
    OR (SELECT sum(amount) FROM public.warehouse_transfer_order_items WHERE transfer_order_id=multi_id)<>26.27 THEN
    RAISE EXCEPTION 'Multi-SKU transfer did not freeze source costs';
  END IF;
  IF EXISTS(SELECT 1 FROM public.warehouse_transfer_order_items item
      LEFT JOIN public.inventory_transactions tx ON tx.source_id=item.id AND tx.tenant_id=item.tenant_id
        AND tx.source_type IN ('warehouse_transfer_out_item','warehouse_transfer_in_item')
      WHERE item.tenant_id=f.tenant_id GROUP BY item.id HAVING count(tx.id)<>2 OR sum(tx.quantity_delta)<>0 OR sum(tx.value_delta)<>0)
    OR EXISTS(SELECT 1 FROM public.inventory_balances b JOIN (
      SELECT warehouse_id,supplier_sku_id,sum(quantity_delta) quantity,sum(value_delta) value
      FROM public.inventory_transactions WHERE tenant_id=f.tenant_id GROUP BY warehouse_id,supplier_sku_id
    ) ledger USING(warehouse_id,supplier_sku_id) WHERE b.tenant_id=f.tenant_id AND
      (b.quantity_on_hand<>ledger.quantity OR b.inventory_value<>ledger.value))
    OR public.stage_d_transfer_financial_snapshot(f.tenant_id) IS DISTINCT FROM
      (SELECT financial_before FROM public.stage_d_transfer_fixture) THEN
    RAISE EXCEPTION 'Transfer pair/projection/financial invariants failed';
  END IF;
  result:=public.get_warehouse_transfer_order(f.tenant_id,multi_id,f.actor_user_id,f.actor_employee_id);
  IF result->>'item_count'<>'2' OR result->>'total_amount'<>'26.27' OR result->>'source_warehouse_name'<>'Transfer destination' THEN
    RAISE EXCEPTION 'Transfer summary mismatch: %',result;
  END IF;
  result:=public.list_warehouse_transfer_order_items(f.tenant_id,multi_id,f.actor_user_id,f.actor_employee_id,1,20);
  IF result->>'total'<>'2' OR jsonb_typeof(result->'items'->0->'quantity')<>'string'
    OR jsonb_typeof(result->'items'->0->'unit_cost')<>'string' OR jsonb_typeof(result->'items'->0->'amount')<>'string' THEN
    RAISE EXCEPTION 'Transfer decimals were not returned as strings: %',result;
  END IF;
  result:=public.list_warehouse_transfer_orders(f.tenant_id,f.actor_user_id,f.actor_employee_id,NULL,NULL,NULL,NULL,50,20);
  IF result->>'total'<>'4' OR result->'items'<>'[]'::jsonb THEN RAISE EXCEPTION 'Empty page lost total: %',result; END IF;
  result:=public.list_warehouse_transfer_orders(f.tenant_id,f.actor_user_id,f.actor_employee_id,f.warehouse_id,destination,'completed',NULL,1,1);
  IF result->>'total'<>'3' OR jsonb_array_length(result->'items')<>1 THEN RAISE EXCEPTION 'Source/destination paging mismatch: %',result; END IF;
END;
$test$;
COMMIT;
SELECT 'EVIDENCE transfer workflow: empty target, 0.01/0.01 tail, destination average 26.25, multi-SKU 26.27, failure rollback, exact replay, paged string reads, no financial writes';
