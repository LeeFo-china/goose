BEGIN;
DO $test$
DECLARE f public.stage_d2_fixture%ROWTYPE; v_order_id uuid:=gen_random_uuid(); other uuid:=gen_random_uuid(); payload jsonb; bad jsonb;
  saved jsonb; completed jsonb; q jsonb; key text; item_id uuid; snapshot jsonb; tx public.inventory_transactions%ROWTYPE;
  v_role_id uuid:=gen_random_uuid(); foreign_tenant uuid:=gen_random_uuid(); foreign_warehouse uuid:=gen_random_uuid();
  foreign_user uuid:=gen_random_uuid(); foreign_sku uuid:=gen_random_uuid(); foreign_supplier uuid:=gen_random_uuid();
  foreign_product uuid:=gen_random_uuid(); foreign_relationship uuid:=gen_random_uuid();
  baseline public.inventory_balances%ROWTYPE; probe_order uuid;
BEGIN
  SELECT * INTO STRICT f FROM public.stage_d2_fixture;
  PERFORM set_config('request.jwt.claim.role','service_role',true);
  PERFORM set_config('request.jwt.claim.role','authenticated',true);
  PERFORM public.stage_d_transfer_expect_error(format('SELECT public.command_warehouse_stocktake_order(%L,%L,''start'',1,''{}'',%L,%L,''wrong-role'')',
    v_order_id,f.tenant_id,f.actor_user_id,f.actor_employee_id),'WAREHOUSE_STOCKTAKE_FORBIDDEN');
  PERFORM set_config('request.jwt.claim.role','service_role',true);
  payload:=public.stage_d2_draft(ARRAY[f.second_sku_id]);
  saved:=public.stage_d2_command(v_order_id,'save_draft',0,payload);
  PERFORM public.stage_d2_command(v_order_id,'save_draft',1,payload||'{"reason":"重新选择"}');
  PERFORM public.stage_d_transfer_expect_error(public.stage_d2_sql(v_order_id,'start',1),'WAREHOUSE_STOCKTAKE_VERSION_CONFLICT');
  PERFORM public.stage_d_transfer_expect_error(public.stage_d2_sql(v_order_id,'save_draft',0,payload||'{"reason":"different"}'),
    'WAREHOUSE_STOCKTAKE_IDEMPOTENCY_CONFLICT');
  PERFORM public.stage_d_transfer_expect_error(public.stage_d2_sql(v_order_id,'save_draft',2,payload||jsonb_build_object('warehouse_id',f.destination_id)),
    'WAREHOUSE_STOCKTAKE_SOURCE_CONFLICT');
  FOR bad IN SELECT value FROM jsonb_array_elements(jsonb_build_array(payload||'{"expected_version":2}',payload||'{"reason":null}',
    payload||jsonb_build_object('reason',E'\t\n'),payload||jsonb_build_object('reason',' '),payload-'warehouse_id',payload||'{"reason":" "}',
    payload||'{"items":null}')) LOOP
    PERFORM public.stage_d_transfer_expect_error(public.stage_d2_sql(v_order_id,'save_draft',2,bad),'WAREHOUSE_STOCKTAKE_INVALID');
  END LOOP;
  FOREACH key IN ARRAY ARRAY['quantity','unit_cost','amount','book_quantity','project_id','cost_category_id'] LOOP
    PERFORM public.stage_d_transfer_expect_error(public.stage_d2_sql(v_order_id,'save_draft',2,jsonb_set(payload,ARRAY['items','0',key],'null')),
      'WAREHOUSE_STOCKTAKE_ITEMS_INVALID');
  END LOOP;
  FOR bad IN SELECT value FROM jsonb_array_elements(jsonb_build_array(
    jsonb_set(payload,'{items}','[]'), jsonb_set(payload,'{items}',(SELECT jsonb_agg(payload->'items'->0) FROM generate_series(1,101))),
    jsonb_set(payload,'{items}',jsonb_build_array(payload->'items'->0,jsonb_build_object('supplier_sku_id',upper(f.second_sku_id::text)))))) LOOP
    PERFORM public.stage_d_transfer_expect_error(public.stage_d2_sql(v_order_id,'save_draft',2,bad),'WAREHOUSE_STOCKTAKE_ITEMS_INVALID');
  END LOOP;
  PERFORM public.stage_d_transfer_expect_error(public.stage_d2_sql(v_order_id,'complete',2),'WAREHOUSE_STOCKTAKE_STATE_CONFLICT');
  PERFORM public.stage_d_transfer_expect_error(public.stage_d2_sql(v_order_id,'start',0),'WAREHOUSE_STOCKTAKE_INVALID');
  PERFORM public.stage_d_transfer_expect_error(public.stage_d2_sql(other,'start',1),'WAREHOUSE_STOCKTAKE_NOT_FOUND');
  PERFORM public.stage_d2_command(v_order_id,'start',2);
  SELECT i.id INTO STRICT item_id FROM public.warehouse_stocktake_order_items i WHERE stocktake_order_id=v_order_id;
  PERFORM public.stage_d_transfer_expect_error(format('UPDATE public.warehouse_stocktake_order_items SET book_quantity=4 WHERE id=%L',item_id),'WAREHOUSE_STOCKTAKE_SNAPSHOT_IMMUTABLE');
  PERFORM public.stage_d_transfer_expect_error(format('DELETE FROM public.warehouse_stocktake_order_items WHERE id=%L',item_id),'WAREHOUSE_STOCKTAKE_SNAPSHOT_IMMUTABLE');
  PERFORM public.stage_d_transfer_expect_error(public.stage_d2_sql(v_order_id,'record_counts',3,public.stage_d2_count(f.sku_id,'1')),'WAREHOUSE_STOCKTAKE_ITEMS_INVALID');
  FOR q IN SELECT value FROM jsonb_array_elements('[1,null,"01","-1","NaN","Infinity","1e2","1.00001","100000000000000","1\n"," 1","1 "]'::jsonb) LOOP
    PERFORM public.stage_d_transfer_expect_error(public.stage_d2_sql(v_order_id,'record_counts',3,jsonb_set(public.stage_d2_count(f.second_sku_id,'4'),'{items,0,counted_quantity}',q)),
      'WAREHOUSE_STOCKTAKE_ITEMS_INVALID');
  END LOOP;
  FOREACH key IN ARRAY ARRAY['',E'\t\n',' ',repeat('x',501)] LOOP
    PERFORM public.stage_d_transfer_expect_error(public.stage_d2_sql(v_order_id,'record_counts',3,public.stage_d2_count(f.second_sku_id,'4',key)),
      'WAREHOUSE_STOCKTAKE_ITEMS_INVALID');
  END LOOP;
  PERFORM public.stage_d_transfer_expect_error(public.stage_d2_sql(v_order_id,'record_counts',3,public.stage_d2_count(f.second_sku_id,'4')||'{"warehouse_id":null}'),
    'WAREHOUSE_STOCKTAKE_INVALID');
  PERFORM public.stage_d2_command(v_order_id,'record_counts',3,public.stage_d2_count(f.second_sku_id,'4'));
  PERFORM public.stage_d2_command(v_order_id,'submit',4);
  UPDATE public.supplier_skus SET status='inactive' WHERE supplier_skus.id=f.second_sku_id;
  PERFORM public.stage_d_transfer_expect_error(public.stage_d2_sql(v_order_id,'complete',5),'WAREHOUSE_STOCKTAKE_SKU_INVALID');
  UPDATE public.supplier_skus SET status='active' WHERE supplier_skus.id=f.second_sku_id;
  -- No permission stored for a system_admin: the authoritative DB must deny.
  INSERT INTO public.roles(id,tenant_id,code,name,status) VALUES(v_role_id,f.tenant_id,'system_admin','Stocktake synthetic admin','active');
  INSERT INTO public.employee_roles(employee_id,role_id) VALUES(f.actor_employee_id,v_role_id);
  DELETE FROM public.employee_permission_overrides WHERE employee_id=f.actor_employee_id AND permission_id IN
    (SELECT permissions.id FROM public.permissions WHERE code LIKE 'inventory.stocktake.%');
  PERFORM public.stage_d_transfer_expect_error(public.stage_d2_sql(v_order_id,'save_draft',0,payload),'WAREHOUSE_STOCKTAKE_FORBIDDEN');
  PERFORM public.stage_d_transfer_expect_error(public.stage_d2_sql(v_order_id,'complete',5),'WAREHOUSE_STOCKTAKE_FORBIDDEN');
  INSERT INTO public.role_permissions(role_id,permission_id,access_scope) SELECT v_role_id,p.id,'all' FROM public.permissions p WHERE code LIKE 'inventory.stocktake.%';
  INSERT INTO public.employee_permission_overrides(employee_id,permission_id,effect,access_scope)
    SELECT f.actor_employee_id,p.id,'deny','all' FROM public.permissions p WHERE code LIKE 'inventory.stocktake.%';
  PERFORM public.stage_d_transfer_expect_error(public.stage_d2_sql(v_order_id,'save_draft',0,payload),'WAREHOUSE_STOCKTAKE_FORBIDDEN');
  PERFORM public.stage_d_transfer_expect_error(public.stage_d2_sql(v_order_id,'complete',5),'WAREHOUSE_STOCKTAKE_FORBIDDEN');
  UPDATE public.employee_permission_overrides SET effect='allow' WHERE employee_id=f.actor_employee_id AND permission_id IN
    (SELECT p.id FROM public.permissions p WHERE code LIKE 'inventory.stocktake.%');
  UPDATE public.employee_permission_overrides SET effect='deny' WHERE employee_id=f.actor_employee_id
    AND permission_id=(SELECT p.id FROM public.permissions p WHERE code='inventory.stocktake.approve');
  PERFORM public.stage_d_transfer_expect_error(public.stage_d2_sql(v_order_id,'complete',5),'WAREHOUSE_STOCKTAKE_FORBIDDEN');
  UPDATE public.employee_permission_overrides SET effect=CASE WHEN permission_id=(SELECT p.id FROM public.permissions p WHERE code='inventory.stocktake.manage') THEN 'deny' ELSE 'allow' END
    WHERE employee_id=f.actor_employee_id AND permission_id IN (SELECT p.id FROM public.permissions p WHERE code LIKE 'inventory.stocktake.%');
  PERFORM public.stage_d_transfer_expect_error(public.stage_d2_sql(other,'save_draft',0,payload),'WAREHOUSE_STOCKTAKE_FORBIDDEN');
  PERFORM public.stage_d_transfer_expect_error(public.stage_d2_sql(v_order_id,'start',5),'WAREHOUSE_STOCKTAKE_FORBIDDEN');
  completed:=public.stage_d2_command(v_order_id,'complete',5);
  UPDATE public.employee_permission_overrides SET effect='allow' WHERE employee_id=f.actor_employee_id
    AND permission_id=(SELECT p.id FROM public.permissions p WHERE code='inventory.stocktake.manage');
  UPDATE public.tenant_supplier_settings SET warehouse_stocktakes_enabled=false WHERE tenant_id=f.tenant_id;
  UPDATE public.warehouses SET status='inactive' WHERE warehouses.id=f.warehouse_id;
  IF public.stage_d2_command(v_order_id,'complete',5) IS DISTINCT FROM completed OR public.stage_d2_command(v_order_id,'save_draft',0,payload) IS DISTINCT FROM saved THEN
    RAISE EXCEPTION 'Operational disable must retain exact replay';
  END IF;
  UPDATE public.employees SET status='suspended' WHERE employees.id=f.actor_employee_id;
  PERFORM public.stage_d_transfer_expect_error(public.stage_d2_sql(v_order_id,'complete',5),'WAREHOUSE_STOCKTAKE_ACTOR_INVALID');
  UPDATE public.employees SET status='active' WHERE employees.id=f.actor_employee_id;
  UPDATE public.tenants SET status='suspended' WHERE tenants.id=f.tenant_id;
  PERFORM public.stage_d_transfer_expect_error(public.stage_d2_sql(v_order_id,'complete',5),'WAREHOUSE_STOCKTAKE_ACTOR_INVALID');
  UPDATE public.tenants SET status='active' WHERE tenants.id=f.tenant_id;
  PERFORM public.stage_d_transfer_expect_error(format('SELECT public.command_warehouse_stocktake_order(%L,%L,''complete'',5,''{}'',%L,%L,%L)',
    v_order_id,f.tenant_id,gen_random_uuid(),f.actor_employee_id,v_order_id||':complete:5'),'WAREHOUSE_STOCKTAKE_ACTOR_INVALID');
  PERFORM public.stage_d_transfer_expect_error(public.stage_d2_sql(other,'save_draft',0,payload),'WAREHOUSE_STOCKTAKE_NOT_ENABLED');
  UPDATE public.tenant_supplier_settings SET warehouse_stocktakes_enabled=true WHERE tenant_id=f.tenant_id;
  PERFORM public.stage_d_transfer_expect_error(public.stage_d2_sql(other,'save_draft',0,payload),'WAREHOUSE_STOCKTAKE_WAREHOUSE_INACTIVE');
  UPDATE public.warehouses SET status='active' WHERE warehouses.id=f.warehouse_id;
  INSERT INTO public.tenants(id,name,slug) VALUES(foreign_tenant,'Stocktake foreign','stocktake-foreign');
  INSERT INTO public.warehouses(id,tenant_id,name) VALUES(foreign_warehouse,foreign_tenant,'Stocktake foreign');
  INSERT INTO auth.users(id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data)
    VALUES(foreign_user,'authenticated','authenticated','stocktake-foreign@smoke.invalid','','{}','{}');
  INSERT INTO public.employees(id,tenant_id,user_id,name,status) VALUES(foreign_sku,foreign_tenant,foreign_user,'Foreign stocktake operator','active');
  INSERT INTO public.employee_permission_overrides(employee_id,permission_id,effect,access_scope)
    SELECT foreign_sku,p.id,'allow','all' FROM public.permissions p WHERE code='inventory.stocktake.manage';
  PERFORM public.stage_d_transfer_expect_error(format('SELECT public.command_warehouse_stocktake_order(%L,%L,''start'',1,''{}'',%L,%L,''foreign-existing'')',
    v_order_id,foreign_tenant,foreign_user,foreign_sku),'WAREHOUSE_STOCKTAKE_NOT_FOUND');
  INSERT INTO public.suppliers SELECT (jsonb_populate_record(NULL::public.suppliers,to_jsonb(s)||jsonb_build_object(
    'id',foreign_supplier,'code','FOREIGN-'||left(replace(foreign_supplier::text,'-',''),16),'owner_tenant_id',foreign_tenant,
    'created_by_employee_id',foreign_sku,'updated_by_employee_id',foreign_sku,'reviewed_by_employee_id',foreign_sku))).*
    FROM public.suppliers s JOIN public.supplier_skus sku ON sku.supplier_id=s.id WHERE sku.id=f.sku_id;
  INSERT INTO public.tenant_supplier_settings(tenant_id,module_enabled,require_active_contract_for_new_order,
    ownership_reads_enabled,private_supplier_writes_enabled,private_catalog_writes_enabled,procurement_snapshot_v1_enabled,
    enabled_by_employee_id,enabled_at) VALUES(foreign_tenant,true,false,true,true,true,true,foreign_sku,now());
  INSERT INTO public.tenant_suppliers(id,tenant_id,supplier_id,relationship_status,default_currency,internal_supplier_code,started_at,
    created_by_employee_id,updated_by_employee_id) VALUES(foreign_relationship,foreign_tenant,foreign_supplier,'active','CNY',
      upper('FOREIGN-'||left(replace(foreign_supplier::text,'-',''),16)),current_date,foreign_sku,foreign_sku);
  SELECT public.command_supplier_purchasable_product_v1(foreign_product,foreign_sku,foreign_tenant,foreign_relationship,foreign_supplier,
    jsonb_build_object('product_code','TP-'||left(replace(foreign_product::text,'-',''),16),'name','Foreign product','category_id',p.category_id,'brand_id',p.brand_id),
    jsonb_build_object('sku_code','TS-'||left(replace(foreign_sku::text,'-',''),16),'name','Foreign SKU','purchase_unit_id',s.purchase_unit_id,'spec_values','{}'::jsonb),
    '{"unit_price":"1","tax_rate":"0.000000","tax_inclusive":true}',foreign_user,foreign_sku,'stocktake-foreign-product') INTO q
    FROM public.supplier_skus s JOIN public.supplier_products p ON p.id=s.supplier_product_id WHERE s.id=f.sku_id;
  IF q->>'status' IS DISTINCT FROM 'created' THEN RAISE EXCEPTION 'Foreign catalog fixture failed'; END IF;
  PERFORM public.stage_d_transfer_expect_error(public.stage_d2_sql(other,'save_draft',0,public.stage_d2_draft(ARRAY[foreign_sku])),
    'WAREHOUSE_STOCKTAKE_SKU_INVALID');
  PERFORM public.stage_d_transfer_expect_error(public.stage_d2_sql(other,'save_draft',0,payload||jsonb_build_object('warehouse_id',foreign_warehouse)),
    'WAREHOUSE_STOCKTAKE_WAREHOUSE_INVALID');
  PERFORM public.stage_d_transfer_expect_error(public.stage_d2_sql(other,'save_draft',0,public.stage_d2_draft(ARRAY[gen_random_uuid()])),
    'WAREHOUSE_STOCKTAKE_SKU_INVALID');
  PERFORM public.stage_d_transfer_expect_error(format('UPDATE public.warehouse_stocktake_orders SET reason=''forged'' WHERE id=%L',v_order_id),'WAREHOUSE_STOCKTAKE_IMMUTABLE');
  PERFORM public.stage_d_transfer_expect_error(format('UPDATE public.warehouse_stocktake_order_items SET amount=99 WHERE id=%L',item_id),'WAREHOUSE_STOCKTAKE_IMMUTABLE');
  SELECT * INTO STRICT tx FROM public.inventory_transactions WHERE warehouse_stocktake_item_id=item_id;
  PERFORM public.stage_d_transfer_expect_error(format('UPDATE public.inventory_transactions SET value_delta=0 WHERE id=%L',tx.id),'INVENTORY_FACT_IMMUTABLE');
  -- Forged frozen fields are rejected by the source-binding trigger before uniqueness.
  PERFORM public.stage_d_transfer_expect_error(format('INSERT INTO public.inventory_transactions SELECT (jsonb_populate_record(NULL::public.inventory_transactions,%L::jsonb)).*',
    to_jsonb(tx)||jsonb_build_object('id',gen_random_uuid(),'quantity_delta',2)),'WAREHOUSE_STOCKTAKE_SOURCE_CONFLICT');
  -- Cancel is valid from draft and counting, leaves inventory untouched.
  FOREACH key IN ARRAY ARRAY['unit_cost','value_delta'] LOOP
    PERFORM public.stage_d_transfer_expect_error(format('INSERT INTO public.inventory_transactions SELECT (jsonb_populate_record(NULL::public.inventory_transactions,%L::jsonb)).*',
      to_jsonb(tx)||jsonb_build_object('id',gen_random_uuid(),key,99)),'WAREHOUSE_STOCKTAKE_SOURCE_CONFLICT');
  END LOOP;
  -- Disable only the new binding trigger inside this rolled-back owner fixture
  -- to exercise the independent composite FK and legacy source CHECK layers.
  ALTER TABLE public.inventory_transactions DISABLE TRIGGER warehouse_stocktake_transaction_source;
  SELECT i.id INTO STRICT item_id FROM public.warehouse_stocktake_order_items i JOIN public.warehouse_stocktake_orders o ON o.id=i.stocktake_order_id
    WHERE o.status='completed' AND i.difference_quantity=0 AND i.supplier_sku_id=f.second_sku_id LIMIT 1;
  BEGIN
    INSERT INTO public.inventory_transactions SELECT (jsonb_populate_record(NULL::public.inventory_transactions,
      to_jsonb(tx)||jsonb_build_object('id',gen_random_uuid(),'source_id',item_id,'warehouse_stocktake_item_id',item_id,'supplier_sku_id',f.sku_id))).*;
    RAISE EXCEPTION 'Expected composite stocktake FK rejection';
  EXCEPTION WHEN foreign_key_violation THEN
    IF SQLERRM NOT LIKE '%inventory_transactions_stocktake_fkey%' THEN RAISE; END IF;
  END;
  BEGIN
    INSERT INTO public.inventory_transactions SELECT (jsonb_populate_record(NULL::public.inventory_transactions,
      to_jsonb(tx)||jsonb_build_object('id',gen_random_uuid(),'source_type','supplier_purchase_receipt_item','transaction_type','purchase_receipt'))).*;
    RAISE EXCEPTION 'Expected old source with new stocktake column rejection';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM NOT LIKE '%inventory_transactions_material_source_check%' THEN RAISE; END IF;
  END;
  ALTER TABLE public.inventory_transactions ENABLE TRIGGER warehouse_stocktake_transaction_source;
  FOREACH key IN ARRAY ARRAY['draft','counting'] LOOP
    other:=gen_random_uuid(); PERFORM public.stage_d2_command(other,'save_draft',0,payload);
    IF key='counting' THEN PERFORM public.stage_d2_command(other,'start',1); END IF;
    PERFORM public.stage_d2_command(other,'cancel',CASE key WHEN 'draft' THEN 1 ELSE 2 END);
    PERFORM public.stage_d_transfer_expect_error(format('DELETE FROM public.warehouse_stocktake_orders WHERE id=%L',other),'WAREHOUSE_STOCKTAKE_IMMUTABLE');
  END LOOP;
  -- Serial corruption probes: NaN/zero-quantity bad baseline and version overflow.
  SELECT * INTO STRICT baseline FROM public.inventory_balances WHERE warehouse_id=f.warehouse_id AND supplier_sku_id=f.second_sku_id;
  probe_order:=public.stage_d2_prepare(f.second_sku_id,baseline.quantity_on_hand::text);
  FOREACH key IN ARRAY ARRAY['quantity_on_hand','inventory_value','average_unit_cost'] LOOP
    EXECUTE format('UPDATE public.inventory_balances SET %I=%I+1 WHERE id=%L',key,key,baseline.id);
    PERFORM public.stage_d_transfer_expect_error(public.stage_d2_sql(probe_order,'complete',4),'WAREHOUSE_STOCKTAKE_SNAPSHOT_CONFLICT');
    EXECUTE format('UPDATE public.inventory_balances SET %I=%L WHERE id=%L',key,to_jsonb(baseline)->>key,baseline.id);
  END LOOP;
  UPDATE public.inventory_balances SET id=gen_random_uuid() WHERE inventory_balances.id=baseline.id;
  PERFORM public.stage_d_transfer_expect_error(public.stage_d2_sql(probe_order,'complete',4),'WAREHOUSE_STOCKTAKE_SNAPSHOT_CONFLICT');
  UPDATE public.inventory_balances SET id=baseline.id WHERE warehouse_id=f.warehouse_id AND supplier_sku_id=f.second_sku_id;
  -- Nonfinite average is rejected even when quantity/value/version are unchanged.
  UPDATE public.inventory_balances SET average_unit_cost='NaN'::numeric WHERE inventory_balances.id=baseline.id;
  PERFORM public.stage_d_transfer_expect_error(public.stage_d2_sql(probe_order,'complete',4),'WAREHOUSE_STOCKTAKE_BALANCE_INVALID');
  UPDATE public.inventory_balances SET average_unit_cost=baseline.average_unit_cost WHERE inventory_balances.id=baseline.id;
  -- Order integer overflow is a version conflict before any posting.
  other:=public.stage_d2_prepare(f.second_sku_id,'99999999999999.9999');
  UPDATE public.warehouse_stocktake_orders SET version=2147483647 WHERE id=other;
  PERFORM public.stage_d_transfer_expect_error(public.stage_d2_sql(other,'complete',2147483647),'WAREHOUSE_STOCKTAKE_VERSION_CONFLICT');
  -- Valid wire quantity can overflow numeric(18,2) posting; reject atomically.
  UPDATE public.inventory_balances SET quantity_on_hand=1,inventory_value=1000,average_unit_cost=1000 WHERE id=baseline.id;
  other:=public.stage_d2_prepare(f.second_sku_id,'99999999999999.9999');
  PERFORM public.stage_d_transfer_expect_error(public.stage_d2_sql(other,'complete',4),'WAREHOUSE_STOCKTAKE_BALANCE_INVALID');
  UPDATE public.inventory_balances SET quantity_on_hand=baseline.quantity_on_hand,inventory_value=baseline.inventory_value,
    average_unit_cost=baseline.average_unit_cost WHERE id=baseline.id;
  UPDATE public.inventory_balances SET inventory_value='NaN'::numeric WHERE warehouse_id=f.warehouse_id AND supplier_sku_id=f.sku_id;
  other:=gen_random_uuid(); PERFORM public.stage_d2_command(other,'save_draft',0,public.stage_d2_draft(ARRAY[f.sku_id]));
  PERFORM public.stage_d_transfer_expect_error(public.stage_d2_sql(other,'start',1),'WAREHOUSE_STOCKTAKE_BALANCE_INVALID');
  UPDATE public.inventory_balances SET inventory_value=1 WHERE warehouse_id=f.warehouse_id AND supplier_sku_id=f.sku_id;
  PERFORM public.stage_d_transfer_expect_error(public.stage_d2_sql(other,'start',1),'WAREHOUSE_STOCKTAKE_BALANCE_INVALID');
  UPDATE public.inventory_balances SET inventory_value=0 WHERE warehouse_id=f.warehouse_id AND supplier_sku_id=f.sku_id;
  UPDATE public.inventory_balances SET version=2147483647 WHERE warehouse_id=f.warehouse_id AND supplier_sku_id=f.second_sku_id;
  other:=public.stage_d2_prepare(f.second_sku_id,'5');
  PERFORM public.stage_d_transfer_expect_error(public.stage_d2_sql(other,'complete',4),'WAREHOUSE_STOCKTAKE_BALANCE_INVALID');
  IF public.stage_d_transfer_financial_snapshot(f.tenant_id) IS DISTINCT FROM (SELECT financial_before FROM public.stage_d2_fixture) THEN RAISE EXCEPTION 'Security probes touched finances'; END IF;
END;
$test$;
ROLLBACK;
SELECT 'EVIDENCE stocktake security: strict root/row/string/reason/array/UUID contracts, current actor/tenant/permission/deny on replay, disabled replay, states/versions, frozen snapshots and terminal guards, ledger source binding, nonfinite/bad baseline/version overflow';
