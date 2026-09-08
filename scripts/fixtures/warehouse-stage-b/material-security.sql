-- Run after material-workflow.sql. This fixture rolls back all its probes.
BEGIN;
CREATE FUNCTION pg_temp.material_expect_error(p_sql text,p_error text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM=p_error THEN RETURN; END IF;
    RAISE EXCEPTION 'Expected %, got %',p_error,SQLERRM;
  END;
  RAISE EXCEPTION 'Expected error %, but command succeeded',p_error;
END;
$$;
CREATE FUNCTION pg_temp.material_call_sql(p_id uuid,p_type text,p_command text,p_version integer,p_payload jsonb,p_key text)
RETURNS text LANGUAGE sql AS $$
  SELECT format('SELECT public.command_warehouse_material_order(%L,%L,%L,%L,%s,%L,%L,%L,%L)',
    p_id,tenant_id,p_type,p_command,p_version,p_payload,actor_user_id,actor_employee_id,p_key)
  FROM public.stage_c_material_fixture;
$$;
CREATE FUNCTION pg_temp.material_fail_cost() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'MATERIAL_RETURN_INJECTED_FAILURE'; END;
$$;
DO $test$
DECLARE f public.stage_c_material_fixture%ROWTYPE; payload jsonb; malformed jsonb; result jsonb; before_result jsonb;
  issue_id uuid:=gen_random_uuid(); item_id uuid; return_id uuid:=gen_random_uuid(); second_return uuid:=gen_random_uuid();
  initial_events integer; initial_payables integer; initial_cash integer; initial_inventory integer;
  first_item uuid; missing_project uuid:=gen_random_uuid(); foreign_tenant uuid:=gen_random_uuid();
BEGIN
  SELECT * INTO STRICT f FROM public.stage_c_material_fixture;
  PERFORM set_config('request.jwt.claim.role','service_role',true);
  SELECT count(*) INTO initial_payables FROM public.supplier_payable_events WHERE tenant_id=f.tenant_id;
  SELECT count(*) INTO initial_cash FROM public.finance_ledger_entries WHERE tenant_id=f.tenant_id;
  payload:=jsonb_build_object('warehouse_id',f.warehouse_id,'project_id',f.project_id,'reason','Security fixture',
    'items',jsonb_build_array(jsonb_build_object('supplier_sku_id',f.sku_id,'quantity','0.3')));
  EXECUTE pg_temp.material_call_sql(issue_id,'issue','save_draft',0,payload,'security-save') INTO before_result;
  SELECT id INTO STRICT first_item FROM public.warehouse_issue_order_items WHERE issue_order_id=issue_id;
  EXECUTE pg_temp.material_call_sql(issue_id,'issue','save_draft',1,payload||'{"reason":"Replaced"}','security-replace');
  IF EXISTS(SELECT 1 FROM public.warehouse_issue_order_items WHERE id=first_item)
    OR (SELECT count(*) FROM public.warehouse_issue_order_items WHERE issue_order_id=issue_id)<>1 THEN
    RAISE EXCEPTION 'Save did not fully replace draft items';
  END IF;
  PERFORM pg_temp.material_expect_error(pg_temp.material_call_sql(issue_id,'issue','save_draft',1,payload,'security-stale'),
    'WAREHOUSE_MATERIAL_VERSION_CONFLICT');
  PERFORM pg_temp.material_expect_error(pg_temp.material_call_sql(issue_id,'issue','save_draft',0,payload||'{"reason":"changed"}','security-save'),
    'WAREHOUSE_MATERIAL_IDEMPOTENCY_CONFLICT');
  malformed:=jsonb_set(payload,'{items,0,cost_category_id}',to_jsonb(f.cost_id));
  PERFORM pg_temp.material_expect_error(pg_temp.material_call_sql(issue_id,'issue','save_draft',2,malformed,'security-client-category'),
    'WAREHOUSE_MATERIAL_ITEMS_INVALID');
  malformed:=jsonb_set(payload,'{items,0,quantity}','"0.00001"');
  PERFORM pg_temp.material_expect_error(pg_temp.material_call_sql(issue_id,'issue','save_draft',2,malformed,'security-precision'),
    'WAREHOUSE_MATERIAL_ITEMS_INVALID');
  malformed:=jsonb_set(payload,'{items,0,quantity}','"NaN"');
  PERFORM pg_temp.material_expect_error(pg_temp.material_call_sql(issue_id,'issue','save_draft',2,malformed,'security-nan'),
    'WAREHOUSE_MATERIAL_ITEMS_INVALID');
  malformed:=jsonb_set(payload,'{items}',(SELECT jsonb_agg(payload->'items'->0) FROM generate_series(1,101)));
  PERFORM pg_temp.material_expect_error(pg_temp.material_call_sql(issue_id,'issue','save_draft',2,malformed,'security-bound'),
    'WAREHOUSE_MATERIAL_ITEMS_INVALID');
  SELECT count(*) INTO initial_events FROM public.warehouse_material_command_events WHERE tenant_id=f.tenant_id;
  UPDATE public.tenant_supplier_settings SET warehouse_materials_enabled=false WHERE tenant_id=f.tenant_id;
  PERFORM pg_temp.material_expect_error(pg_temp.material_call_sql(issue_id,'issue','submit',2,'{}','security-gate'),
    'WAREHOUSE_MATERIAL_NOT_ENABLED');
  EXECUTE pg_temp.material_call_sql(issue_id,'issue','save_draft',0,payload,'security-save') INTO result;
  IF result<>before_result THEN RAISE EXCEPTION 'Closed flag changed successful replay'; END IF;
  PERFORM public.get_warehouse_material_order(f.tenant_id,'issue',issue_id,f.actor_user_id,f.actor_employee_id);
  UPDATE public.tenant_supplier_settings SET warehouse_materials_enabled=true WHERE tenant_id=f.tenant_id;
  UPDATE public.warehouses SET status='inactive' WHERE id=f.warehouse_id;
  PERFORM pg_temp.material_expect_error(pg_temp.material_call_sql(issue_id,'issue','submit',2,'{}','security-stopped'),
    'WAREHOUSE_MATERIAL_WAREHOUSE_INACTIVE');
  EXECUTE pg_temp.material_call_sql(issue_id,'issue','save_draft',0,payload,'security-save') INTO result;
  IF result<>before_result THEN RAISE EXCEPTION 'Stopped warehouse changed successful replay'; END IF;
  PERFORM public.get_warehouse_material_order(f.tenant_id,'issue',issue_id,f.actor_user_id,f.actor_employee_id);
  UPDATE public.warehouses SET status='active' WHERE id=f.warehouse_id;
  IF (SELECT count(*) FROM public.warehouse_material_command_events WHERE tenant_id=f.tenant_id)<>initial_events THEN
    RAISE EXCEPTION 'Failed gates or retries created new commands';
  END IF;
  PERFORM set_config('request.jwt.claim.role','authenticated',true);
  PERFORM pg_temp.material_expect_error(pg_temp.material_call_sql(issue_id,'issue','save_draft',0,payload,'security-save'),
    'WAREHOUSE_MATERIAL_FORBIDDEN');
  PERFORM set_config('request.jwt.claim.role','service_role',true);
  PERFORM pg_temp.material_expect_error(format('SELECT public.get_warehouse_material_order(%L,''issue'',%L,%L,%L)',
    f.tenant_id,issue_id,gen_random_uuid(),f.actor_employee_id),'WAREHOUSE_MATERIAL_ACTOR_INVALID');
  PERFORM pg_temp.material_expect_error(format('SELECT public.get_warehouse_material_order(%L,''issue'',%L,%L,%L)',
    foreign_tenant,issue_id,f.actor_user_id,f.actor_employee_id),'WAREHOUSE_MATERIAL_ACTOR_INVALID');
  UPDATE public.employee_permission_overrides SET effect='deny' WHERE employee_id=f.actor_employee_id
    AND permission_id=(SELECT id FROM public.permissions WHERE code='inventory.stock.view');
  result:=public.list_warehouse_material_projects(f.tenant_id,f.actor_user_id,f.actor_employee_id,'Material',1,20);
  IF result->>'total'<>'1' OR result->'items'->0->>'id'<>f.project_id::text THEN
    RAISE EXCEPTION 'Project picker wrongly requires stock/procurement permissions';
  END IF;
  PERFORM pg_temp.material_expect_error(format('SELECT public.get_warehouse_material_order(%L,''issue'',%L,%L,%L)',
    f.tenant_id,issue_id,f.actor_user_id,f.actor_employee_id),'WAREHOUSE_MATERIAL_FORBIDDEN');
  UPDATE public.employee_permission_overrides SET effect='allow' WHERE employee_id=f.actor_employee_id
    AND permission_id=(SELECT id FROM public.permissions WHERE code='inventory.stock.view');
  UPDATE public.employee_permission_overrides SET access_scope='assigned' WHERE employee_id=f.actor_employee_id
    AND permission_id=(SELECT id FROM public.permissions WHERE code='project.read');
  PERFORM pg_temp.material_expect_error(pg_temp.material_call_sql(issue_id,'issue','submit',2,'{}','security-project'),
    'WAREHOUSE_MATERIAL_FORBIDDEN');
  result:=public.list_warehouse_material_orders(f.tenant_id,'issue',f.actor_user_id,f.actor_employee_id);
  IF result->>'total'<>'0' THEN RAISE EXCEPTION 'List leaked out-of-scope projects'; END IF;
  result:=public.list_warehouse_material_projects(f.tenant_id,f.actor_user_id,f.actor_employee_id);
  IF result->>'total'<>'0' THEN RAISE EXCEPTION 'Project picker leaked assigned scope'; END IF;
  UPDATE public.employee_permission_overrides SET access_scope='all' WHERE employee_id=f.actor_employee_id
    AND permission_id=(SELECT id FROM public.permissions WHERE code='project.read');
  UPDATE public.employee_permission_overrides SET effect='deny' WHERE employee_id=f.actor_employee_id
    AND permission_id=(SELECT id FROM public.permissions WHERE code='inventory.issue.manage');
  PERFORM pg_temp.material_expect_error(pg_temp.material_call_sql(issue_id,'issue','submit',2,'{}','security-manage'),
    'WAREHOUSE_MATERIAL_FORBIDDEN');
  UPDATE public.employee_permission_overrides SET effect='allow' WHERE employee_id=f.actor_employee_id
    AND permission_id=(SELECT id FROM public.permissions WHERE code='inventory.issue.manage');
  EXECUTE pg_temp.material_call_sql(issue_id,'issue','submit',2,'{}','security-submit');
  UPDATE public.employee_permission_overrides SET effect='deny' WHERE employee_id=f.actor_employee_id
    AND permission_id=(SELECT id FROM public.permissions WHERE code='inventory.issue.approve');
  PERFORM pg_temp.material_expect_error(pg_temp.material_call_sql(issue_id,'issue','complete',3,'{}','security-approve'),
    'WAREHOUSE_MATERIAL_FORBIDDEN');
  UPDATE public.employee_permission_overrides SET effect='allow' WHERE employee_id=f.actor_employee_id
    AND permission_id=(SELECT id FROM public.permissions WHERE code='inventory.issue.approve');
  -- Changing configuration after submit must not change frozen classification.
  DELETE FROM public.tenant_catalog_cost_category_rules WHERE tenant_id=f.tenant_id;
  EXECUTE pg_temp.material_call_sql(issue_id,'issue','complete',3,'{}','security-complete');
  SELECT id INTO STRICT item_id FROM public.warehouse_issue_order_items WHERE issue_order_id=issue_id;
  IF (SELECT cost_category_id FROM public.warehouse_issue_order_items WHERE id=item_id)<>f.cost_id THEN
    RAISE EXCEPTION 'Classification was not frozen at submit';
  END IF;
  -- A later receipt has a completely different cost; return must use original issue value.
  INSERT INTO public.inventory_transactions(tenant_id,warehouse_id,supplier_sku_id,transaction_type,
    quantity_delta,unit_cost,value_delta,source_type,source_id,occurred_at,created_by_employee_id)
    VALUES(f.tenant_id,f.warehouse_id,f.sku_id,'purchase_receipt',1,100,100,'supplier_purchase_receipt_item',gen_random_uuid(),now(),f.actor_employee_id);
  UPDATE public.inventory_balances SET quantity_on_hand=1,inventory_value=100,average_unit_cost=100
    WHERE tenant_id=f.tenant_id AND warehouse_id=f.warehouse_id AND supplier_sku_id=f.sku_id;
  payload:=jsonb_build_object('original_issue_order_id',issue_id,
    'items',jsonb_build_array(jsonb_build_object('original_issue_item_id',item_id,'quantity','0.3')));
  EXECUTE pg_temp.material_call_sql(return_id,'return','save_draft',0,payload,'security-return-save');
  SELECT count(*) INTO initial_inventory FROM public.inventory_transactions WHERE tenant_id=f.tenant_id;
  CREATE TRIGGER stage_c_return_failure BEFORE INSERT ON public.project_cost_events
    FOR EACH ROW EXECUTE FUNCTION pg_temp.material_fail_cost();
  PERFORM pg_temp.material_expect_error(pg_temp.material_call_sql(return_id,'return','complete',1,'{}','security-return-complete'),
    'MATERIAL_RETURN_INJECTED_FAILURE');
  DROP TRIGGER stage_c_return_failure ON public.project_cost_events;
  IF (SELECT count(*) FROM public.inventory_transactions WHERE tenant_id=f.tenant_id)<>initial_inventory
    OR (SELECT status FROM public.warehouse_return_orders WHERE id=return_id)<>'draft'
    OR (SELECT inventory_value FROM public.inventory_balances WHERE tenant_id=f.tenant_id AND warehouse_id=f.warehouse_id AND supplier_sku_id=f.sku_id)<>100
    OR EXISTS(SELECT 1 FROM public.warehouse_material_command_events WHERE actor_user_id=f.actor_user_id AND idempotency_key='security-return-complete') THEN
    RAISE EXCEPTION 'Injected return failure leaked facts';
  END IF;
  EXECUTE pg_temp.material_call_sql(return_id,'return','complete',1,'{}','security-return-complete');
  IF (SELECT amount FROM public.warehouse_return_order_items WHERE return_order_id=return_id)<>0.02
    OR (SELECT inventory_value FROM public.inventory_balances WHERE tenant_id=f.tenant_id AND warehouse_id=f.warehouse_id AND supplier_sku_id=f.sku_id)<>100.02 THEN
    RAISE EXCEPTION 'Return used current average instead of original cost';
  END IF;
  EXECUTE pg_temp.material_call_sql(second_return,'return','save_draft',0,payload,'security-overreturn-save');
  PERFORM pg_temp.material_expect_error(pg_temp.material_call_sql(second_return,'return','complete',1,'{}','security-overreturn'),
    'WAREHOUSE_MATERIAL_RETURN_QUANTITY_EXCEEDED');
  EXECUTE pg_temp.material_call_sql(second_return,'return','cancel',1,'{}','security-return-cancel');
  PERFORM pg_temp.material_expect_error(pg_temp.material_call_sql(second_return,'return','complete',2,'{}','security-after-cancel'),
    'WAREHOUSE_MATERIAL_STATE_CONFLICT');
  PERFORM pg_temp.material_expect_error(format('UPDATE public.warehouse_issue_orders SET reason=''tamper'' WHERE id=%L',issue_id),
    'WAREHOUSE_MATERIAL_IMMUTABLE');
  PERFORM pg_temp.material_expect_error(format('DELETE FROM public.warehouse_return_order_items WHERE return_order_id=%L',return_id),
    'WAREHOUSE_MATERIAL_IMMUTABLE');
  result:=public.list_inventory_transactions(f.tenant_id,f.warehouse_id,f.sku_id,'project_issue',1,100);
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(result->'items') i WHERE i->'source_document'->>'issue_order_id'=issue_id::text) THEN
    RAISE EXCEPTION 'Inventory issue document missing: %',result;
  END IF;
  result:=public.list_inventory_transactions(f.tenant_id,f.warehouse_id,f.sku_id,'project_return',1,100);
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(result->'items') i WHERE i->'source_document'->>'return_order_id'=return_id::text
    AND i->'source_document'->>'issue_order_id'=issue_id::text) THEN RAISE EXCEPTION 'Inventory return document missing'; END IF;
  result:=public.list_warehouse_material_orders(f.tenant_id,'issue',f.actor_user_id,f.actor_employee_id,NULL,NULL,NULL,NULL,999,10000);
  IF result->>'pageSize'<>'100' OR result->'items'<>'[]'::jsonb OR (result->>'total')::integer<2 THEN
    RAISE EXCEPTION 'Pagination bounds failed';
  END IF;
  IF (SELECT count(*) FROM public.supplier_payable_events WHERE tenant_id=f.tenant_id)<>initial_payables
    OR (SELECT count(*) FROM public.finance_ledger_entries WHERE tenant_id=f.tenant_id)<>initial_cash THEN
    RAISE EXCEPTION 'Material commands created payable or cash facts';
  END IF;
  -- Exact decimal wire representation must retain all 18 digits through JSON.
  issue_id:=gen_random_uuid();
  payload:=jsonb_build_object('warehouse_id',f.warehouse_id,'project_id',f.project_id,
    'items',jsonb_build_array(jsonb_build_object('supplier_sku_id',f.sku_id,'quantity','99999999999999.9999')));
  EXECUTE pg_temp.material_call_sql(issue_id,'issue','save_draft',0,payload,'security-exact-decimal');
  result:=public.list_warehouse_material_order_items(f.tenant_id,'issue',issue_id,f.actor_user_id,f.actor_employee_id);
  IF result->'items'->0->'quantity'<>to_jsonb('99999999999999.9999'::text) THEN
    RAISE EXCEPTION 'High-precision quantity lost digits: %',result;
  END IF;
END;
$test$;
ROLLBACK;
SELECT 'EVIDENCE material security: flags/stopped warehouse preserve replay/read; tenant/actor/project/manage/approve/stock ACLs; precision/bounds/stale/conflicting keys; return failure rollback; original cost independent of later receipt';
