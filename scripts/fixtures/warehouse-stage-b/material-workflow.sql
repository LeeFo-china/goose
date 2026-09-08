-- Synthetic receipt inventory + real material RPCs, on disposable offline DB only.
CREATE TABLE public.stage_c_material_fixture(tenant_id uuid,actor_user_id uuid,actor_employee_id uuid,
  warehouse_id uuid,project_id uuid,sku_id uuid,cost_id uuid,issue_id uuid,issue_item_id uuid);
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
CREATE FUNCTION pg_temp.material_fail_cost() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'MATERIAL_INJECTED_FAILURE'; END;
$$;
BEGIN;
DO $test$
DECLARE
  t uuid:=gen_random_uuid(); u uuid:=gen_random_uuid(); e uuid:=gen_random_uuid();
  w uuid:=gen_random_uuid(); p uuid:=gen_random_uuid(); s uuid:=gen_random_uuid();
  relationship uuid:=gen_random_uuid(); category uuid:=gen_random_uuid(); brand uuid:=gen_random_uuid();
  unit_id uuid:=gen_random_uuid(); cost uuid:=gen_random_uuid(); product uuid:=gen_random_uuid(); sku uuid:=gen_random_uuid();
  issue_id uuid:=gen_random_uuid(); issue_item uuid; return_id uuid;
  result jsonb; saved jsonb; payload jsonb; return_payload jsonb; ordinal integer;
  initial_facts integer; initial_payables integer;
BEGIN
  PERFORM set_config('request.jwt.claim.role','service_role',true);
  INSERT INTO public.tenants(id,name,slug) VALUES(t,'Stage C materials','stage-c-materials');
  INSERT INTO auth.users(id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data)
    VALUES(u,'authenticated','authenticated','stage-c-materials@smoke.invalid','','{}','{}');
  INSERT INTO public.employees(id,tenant_id,user_id,name,status) VALUES(e,t,u,'Material operator','active');
  INSERT INTO public.projects(id,tenant_id,name,status) VALUES(p,t,'Material project','designing');
  INSERT INTO public.warehouses(id,tenant_id,name) VALUES(w,t,'Material warehouse');
  INSERT INTO public.tenant_supplier_settings(tenant_id,module_enabled,require_active_contract_for_new_order,
    ownership_reads_enabled,private_supplier_writes_enabled,private_catalog_writes_enabled,
    procurement_snapshot_v1_enabled,purchase_batch_workflow_enabled,warehouse_procurement_enabled,
    warehouse_materials_enabled,enabled_by_employee_id,enabled_at)
    VALUES(t,true,false,true,true,true,true,true,true,true,e,now()) ON CONFLICT(tenant_id) DO UPDATE SET
      module_enabled=true,require_active_contract_for_new_order=false,ownership_reads_enabled=true,
      private_supplier_writes_enabled=true,private_catalog_writes_enabled=true,procurement_snapshot_v1_enabled=true,
      purchase_batch_workflow_enabled=true,warehouse_procurement_enabled=true,warehouse_materials_enabled=true,
      enabled_by_employee_id=e,enabled_at=now();
  INSERT INTO public.finance_cost_categories(id,tenant_id,code,name) VALUES(cost,t,'stage-c-material','Material cost');
  INSERT INTO public.catalog_categories(id,code,name,full_name,level,created_by_employee_id,updated_by_employee_id)
    VALUES(category,'STAGE-C-CATEGORY','Material','Material',1,e,e);
  INSERT INTO public.catalog_brands(id,code,name,created_by_employee_id,updated_by_employee_id)
    VALUES(brand,'STAGE-C-BRAND','Brand',e,e);
  INSERT INTO public.catalog_units(id,code,name,symbol,created_by_employee_id,updated_by_employee_id)
    VALUES(unit_id,'STAGE-C-UNIT','Piece','pc',e,e);
  INSERT INTO public.suppliers(id,code,name,legal_name,supplier_type,ownership_scope,owner_tenant_id,
    onboarding_status,operational_status,reviewed_by_employee_id,reviewed_at,created_by_employee_id,updated_by_employee_id)
    VALUES(s,'STAGE-C-SUPPLIER','Supplier','Supplier','manufacturer','tenant',t,'approved','active',e,now(),e,e);
  INSERT INTO public.tenant_suppliers(id,tenant_id,supplier_id,relationship_status,default_currency,
    internal_supplier_code,started_at,created_by_employee_id,updated_by_employee_id)
    VALUES(relationship,t,s,'active','CNY','STAGE-C-SUPPLIER',current_date,e,e);
  result:=public.command_supplier_purchasable_product_v1(product,sku,t,relationship,s,
    jsonb_build_object('product_code','TP-'||left(replace(product::text,'-',''),16),'name','Material','category_id',category,'brand_id',brand),
    jsonb_build_object('sku_code','TS-'||left(replace(sku::text,'-',''),16),'name','Material','purchase_unit_id',unit_id,'spec_values','{}'::jsonb),
    '{"unit_price":"0.07","tax_rate":"0.000000","tax_inclusive":true}',u,e,'material-product');
  IF result->>'status'<>'created' THEN RAISE EXCEPTION 'Material fixture product failed: %',result; END IF;
  INSERT INTO public.permissions(code,name,module,resource,action)
    VALUES('project.read','Read project','project','project','read') ON CONFLICT(code) DO NOTHING;
  INSERT INTO public.employee_permission_overrides(employee_id,permission_id,effect,access_scope)
    SELECT e,id,'allow','all' FROM public.permissions
    WHERE code IN ('inventory.issue.manage','inventory.issue.approve','inventory.stock.view','project.read');
  -- Receipt-like synthetic facts are explicit: no upstream purchasing command is mocked.
  -- Existing receipt-accounting.sql separately verifies the real procurement receipt chain.
  INSERT INTO public.inventory_transactions(tenant_id,warehouse_id,supplier_sku_id,transaction_type,
    quantity_delta,unit_cost,value_delta,source_type,source_id,occurred_at,created_by_employee_id)
    VALUES(t,w,sku,'purchase_receipt',0.3,0.0667,0.02,'supplier_purchase_receipt_item',gen_random_uuid(),now(),e);
  INSERT INTO public.inventory_balances(tenant_id,warehouse_id,supplier_sku_id,quantity_on_hand,inventory_value,average_unit_cost)
    VALUES(t,w,sku,0.3,0.02,0.0667);
  SELECT count(*) INTO initial_payables FROM public.supplier_payable_events WHERE tenant_id=t;
  payload:=jsonb_build_object('warehouse_id',w,'project_id',p,'reason','Material issue',
    'items',jsonb_build_array(jsonb_build_object('supplier_sku_id',sku,'quantity','0.3')));
  saved:=public.command_warehouse_material_order(issue_id,t,'issue','save_draft',0,payload,u,e,'material-save');
  IF saved->>'status'<>'saved' OR saved->'order'->>'version'<>'1' THEN RAISE EXCEPTION 'Issue save failed: %',saved; END IF;
  PERFORM pg_temp.material_expect_error(format('SELECT public.command_warehouse_material_order(%L,%L,''issue'',''submit'',1,''{}'',%L,%L,''no-category'')',issue_id,t,u,e),
    'WAREHOUSE_MATERIAL_COST_CATEGORY_REQUIRED');
  INSERT INTO public.tenant_catalog_cost_category_rules(tenant_id,rule_scope,supplier_product_id,cost_category_id,created_by_employee_id,updated_by_employee_id)
    VALUES(t,'product',product,cost,e,e);
  PERFORM public.command_warehouse_material_order(issue_id,t,'issue','submit',1,'{}',u,e,'material-submit');
  SELECT id INTO STRICT issue_item FROM public.warehouse_issue_order_items WHERE issue_order_id=issue_id;
  IF EXISTS(SELECT 1 FROM public.project_cost_events WHERE tenant_id=t)
    OR (SELECT quantity_on_hand FROM public.inventory_balances WHERE tenant_id=t AND warehouse_id=w AND supplier_sku_id=sku)<>0.3 THEN
    RAISE EXCEPTION 'Submission reserved or consumed inventory';
  END IF;
  CREATE TRIGGER stage_c_cost_failure BEFORE INSERT ON public.project_cost_events
    FOR EACH ROW EXECUTE FUNCTION pg_temp.material_fail_cost();
  PERFORM pg_temp.material_expect_error(format('SELECT public.command_warehouse_material_order(%L,%L,''issue'',''complete'',2,''{}'',%L,%L,''material-complete'')',issue_id,t,u,e),
    'MATERIAL_INJECTED_FAILURE');
  DROP TRIGGER stage_c_cost_failure ON public.project_cost_events;
  IF (SELECT count(*) FROM public.inventory_transactions WHERE tenant_id=t)<>1
    OR EXISTS(SELECT 1 FROM public.warehouse_material_command_events WHERE actor_user_id=u AND idempotency_key='material-complete')
    OR (SELECT status FROM public.warehouse_issue_orders WHERE id=issue_id)<>'submitted'
    OR (SELECT inventory_value FROM public.inventory_balances WHERE tenant_id=t AND warehouse_id=w AND supplier_sku_id=sku)<>0.02 THEN
    RAISE EXCEPTION 'Failure leaked inventory, document or command facts';
  END IF;
  result:=public.command_warehouse_material_order(issue_id,t,'issue','complete',2,'{}',u,e,'material-complete');
  IF result->>'status'<>'completed'
    OR (SELECT amount FROM public.warehouse_issue_order_items WHERE id=issue_item)<>0.02
    OR (SELECT inventory_value FROM public.inventory_balances WHERE tenant_id=t AND warehouse_id=w AND supplier_sku_id=sku)<>0
    OR (SELECT quantity_on_hand FROM public.inventory_balances WHERE tenant_id=t AND warehouse_id=w AND supplier_sku_id=sku)<>0 THEN
    RAISE EXCEPTION 'Issue did not consume final valuation tail: %',result;
  END IF;
  IF public.command_warehouse_material_order(issue_id,t,'issue','save_draft',0,payload,u,e,'material-save')<>saved THEN
    RAISE EXCEPTION 'Save replay changed with later state';
  END IF;
  FOR ordinal IN 1..3 LOOP
    return_id:=gen_random_uuid();
    return_payload:=jsonb_build_object('original_issue_order_id',issue_id,
      'items',jsonb_build_array(jsonb_build_object('original_issue_item_id',issue_item,'quantity','0.1')));
    PERFORM public.command_warehouse_material_order(return_id,t,'return','save_draft',0,return_payload,u,e,'return-save-'||ordinal);
    result:=public.command_warehouse_material_order(return_id,t,'return','complete',1,'{}',u,e,'return-complete-'||ordinal);
    IF result->>'status'<>'completed' THEN RAISE EXCEPTION 'Return failed: %',result; END IF;
    IF (SELECT amount FROM public.warehouse_return_order_items WHERE return_order_id=return_id)<>
      (CASE ordinal WHEN 2 THEN 0.00 ELSE 0.01 END) THEN RAISE EXCEPTION 'Return tail allocation incorrect'; END IF;
  END LOOP;
  IF (SELECT sum(CASE event_direction WHEN 'decrease' THEN -amount ELSE amount END)
      FROM public.project_cost_events WHERE tenant_id=t)<>0
    OR (SELECT count(*) FROM public.supplier_payable_events WHERE tenant_id=t)<>initial_payables
    OR (SELECT inventory_value FROM public.inventory_balances WHERE tenant_id=t AND warehouse_id=w AND supplier_sku_id=sku)<>0.02
    OR (SELECT sum(quantity_delta) FROM public.inventory_transactions WHERE tenant_id=t)<>0.3 THEN
    RAISE EXCEPTION 'Return facts do not reconcile costs, inventory or payables';
  END IF;
  result:=public.list_warehouse_material_order_items(t,'issue',issue_id,u,e,1,20);
  IF jsonb_typeof(result->'items'->0->'quantity')<>'string'
    OR jsonb_typeof(result->'items'->0->'unit_cost')<>'string'
    OR jsonb_typeof(result->'items'->0->'amount')<>'string'
    OR jsonb_typeof(result->'items'->0->'returned_quantity')<>'string' THEN
    RAISE EXCEPTION 'Decimal material reads must serialize as exact strings: %',result;
  END IF;
  IF result->'items'->0->>'returnable_quantity'<>'0.0000'
    OR result->'items'->0->>'returned_quantity'<>'0.3000' THEN
    RAISE EXCEPTION 'Return picker quantities incorrect: %',result;
  END IF;
  result:=public.list_warehouse_material_orders(t,'return',u,e,w,p,'completed',NULL,8,1);
  IF result->>'total'<>'3' OR result->'items'<>'[]'::jsonb THEN RAISE EXCEPTION 'Empty page lost total: %',result; END IF;
  INSERT INTO public.stage_c_material_fixture VALUES(t,u,e,w,p,sku,cost,issue_id,issue_item);
END;
$test$;
COMMIT;
SELECT 'EVIDENCE material workflow: final depletion 0.02; returns 0.01/0.00/0.01; injected cost failure rolled back all facts; immutable command replay retained';
