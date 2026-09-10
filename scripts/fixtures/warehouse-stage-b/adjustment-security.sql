BEGIN;
DO $$
DECLARE f public.stage_d22_fixture%ROWTYPE; id1 uuid:=gen_random_uuid(); id2 uuid; payload jsonb; bad jsonb; value text; saved jsonb; snapshot jsonb;
BEGIN
  SELECT * INTO STRICT f FROM public.stage_d22_fixture;
  payload:=public.stage_d22_draft(f.second_sku_id);
  FOR bad IN SELECT x FROM jsonb_array_elements('[0,1,null,"0","-0","0.0000","-0.0000","+1","01","-01","1e2","NaN","Infinity","-Infinity","1.00001","100000000000000","-100000000000000","1\n"," 1","1 ",".1","-.1"]'::jsonb) x LOOP
    PERFORM public.stage_d_transfer_expect_error(public.stage_d22_sql(gen_random_uuid(),'save_draft',0,jsonb_set(payload,'{items,0,quantity_delta}',bad)),'WAREHOUSE_ADJUSTMENT_ITEMS_INVALID');
  END LOOP;
  FOREACH value IN ARRAY ARRAY['0.0001','-0.0001','99999999999999.9999','-99999999999999.9999','1.00','-1.00'] LOOP
    id2:=gen_random_uuid(); PERFORM public.stage_d22_command(id2,'save_draft',0,public.stage_d22_draft(f.second_sku_id,value));
    PERFORM public.stage_d22_command(id2,'cancel',1);
  END LOOP;
  FOREACH value IN ARRAY ARRAY['abcdef00-0000-0000-0000-000000000001','abcdef00-0000-9000-8000-000000000001','abcdef00-0000-4000-7000-000000000001','FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF'] LOOP
    PERFORM public.stage_d_transfer_expect_error(public.stage_d22_sql(gen_random_uuid(),'save_draft',0,payload||jsonb_build_object('warehouse_id',value)),'WAREHOUSE_ADJUSTMENT_INVALID');
    PERFORM public.stage_d_transfer_expect_error(public.stage_d22_sql(gen_random_uuid(),'save_draft',0,jsonb_set(payload,'{items,0,supplier_sku_id}',to_jsonb(value))),'WAREHOUSE_ADJUSTMENT_ITEMS_INVALID');
  END LOOP;
  FOREACH value IN ARRAY ARRAY['00000000-0000-0000-0000-000000000000','ffffffff-ffff-ffff-ffff-ffffffffffff','ABCDEF00-0000-7000-B000-000000000001'] LOOP
    PERFORM public.stage_d_transfer_expect_error(public.stage_d22_sql(gen_random_uuid(),'save_draft',0,payload||jsonb_build_object('warehouse_id',value)),'WAREHOUSE_ADJUSTMENT_WAREHOUSE_INVALID');
    PERFORM public.stage_d_transfer_expect_error(public.stage_d22_sql(gen_random_uuid(),'save_draft',0,jsonb_set(payload,'{items,0,supplier_sku_id}',to_jsonb(value))),'WAREHOUSE_ADJUSTMENT_SKU_INVALID');
  END LOOP;
  FOREACH value IN ARRAY ARRAY[repeat('😀',250),repeat('盘',500),E' \t ﻿'||repeat('😀',250)||E'　\n'] LOOP
    id2:=gen_random_uuid(); saved:=public.stage_d22_command(id2,'save_draft',0,public.stage_d22_draft(f.second_sku_id,'1',value)||jsonb_build_object('reason',value));
    IF saved->'order'->>'reason' IS DISTINCT FROM public.__gooes_stocktake_trim(value) OR (SELECT adjustment_reason FROM public.warehouse_adjustment_order_items WHERE adjustment_order_id=id2) IS DISTINCT FROM public.__gooes_stocktake_trim(value) THEN RAISE EXCEPTION 'UTF16/trim mismatch'; END IF;
    PERFORM public.stage_d22_command(id2,'cancel',1);
  END LOOP;
  FOREACH value IN ARRAY ARRAY[repeat('😀',251),repeat('盘',501),' ',E'\t\n','﻿　'] LOOP
    PERFORM public.stage_d_transfer_expect_error(public.stage_d22_sql(gen_random_uuid(),'save_draft',0,payload||jsonb_build_object('reason',value)),'WAREHOUSE_ADJUSTMENT_INVALID');
    PERFORM public.stage_d_transfer_expect_error(public.stage_d22_sql(gen_random_uuid(),'save_draft',0,public.stage_d22_draft(f.second_sku_id,'1',value)),'WAREHOUSE_ADJUSTMENT_ITEMS_INVALID');
  END LOOP;
  FOR bad IN SELECT x FROM jsonb_array_elements(jsonb_build_array(payload||'{"expected_version":0}',payload-'reason',payload||'{"reason":null}',payload||'{"items":null}',payload-'warehouse_id')) x LOOP
    PERFORM public.stage_d_transfer_expect_error(public.stage_d22_sql(gen_random_uuid(),'save_draft',0,bad),'WAREHOUSE_ADJUSTMENT_INVALID');
  END LOOP;
  FOREACH value IN ARRAY ARRAY['book_quantity','unit_cost','amount','quantity','project_id','expected_version'] LOOP
    PERFORM public.stage_d_transfer_expect_error(public.stage_d22_sql(gen_random_uuid(),'save_draft',0,jsonb_set(payload,ARRAY['items','0',value],'null')),'WAREHOUSE_ADJUSTMENT_ITEMS_INVALID');
  END LOOP;
  FOR bad IN SELECT x FROM jsonb_array_elements(jsonb_build_array(jsonb_set(payload,'{items}','[]'),
    jsonb_set(payload,'{items}',(SELECT jsonb_agg(payload->'items'->0) FROM generate_series(1,101))),
    jsonb_set(payload,'{items}',jsonb_build_array(payload->'items'->0,(payload->'items'->0)||jsonb_build_object('supplier_sku_id',upper(f.second_sku_id::text)))))) x LOOP
    PERFORM public.stage_d_transfer_expect_error(public.stage_d22_sql(gen_random_uuid(),'save_draft',0,bad),'WAREHOUSE_ADJUSTMENT_ITEMS_INVALID');
  END LOOP;
  saved:=public.stage_d22_command(id1,'save_draft',0,payload);
  PERFORM public.stage_d_transfer_expect_error(public.stage_d22_sql(id1,'save_draft',0,public.stage_d22_draft(f.second_sku_id,'1.0')),'WAREHOUSE_ADJUSTMENT_IDEMPOTENCY_CONFLICT');
  PERFORM public.stage_d_transfer_expect_error(public.stage_d22_sql(id1,'save_draft',1,payload,id1||':save_draft:0'),'WAREHOUSE_ADJUSTMENT_IDEMPOTENCY_CONFLICT');
  PERFORM public.stage_d_transfer_expect_error(public.stage_d22_sql(id1,'save_draft',1,payload||jsonb_build_object('warehouse_id',f.destination_id)),'WAREHOUSE_ADJUSTMENT_SOURCE_CONFLICT');
  UPDATE public.tenant_supplier_settings SET warehouse_adjustments_enabled=false WHERE tenant_id=f.tenant_id;
  IF public.stage_d22_command(id1,'save_draft',0,payload) IS DISTINCT FROM saved THEN RAISE EXCEPTION 'Flag closed replay denied'; END IF;
  PERFORM public.stage_d_transfer_expect_error(public.stage_d22_sql(id1,'submit',1),'WAREHOUSE_ADJUSTMENT_NOT_ENABLED');
  UPDATE public.tenant_supplier_settings SET warehouse_adjustments_enabled=true WHERE tenant_id=f.tenant_id;
  UPDATE public.employee_permission_overrides SET effect='deny' WHERE employee_id=f.actor_employee_id AND permission_id IN(SELECT id FROM public.permissions WHERE code='inventory.adjustment.manage');
  PERFORM public.stage_d_transfer_expect_error(public.stage_d22_sql(id1,'save_draft',0,payload),'WAREHOUSE_ADJUSTMENT_FORBIDDEN');
  UPDATE public.employee_permission_overrides SET effect='allow' WHERE employee_id=f.actor_employee_id AND permission_id IN(SELECT id FROM public.permissions WHERE code='inventory.adjustment.manage');
  UPDATE public.employees SET status='suspended' WHERE id=f.actor_employee_id;
  PERFORM public.stage_d_transfer_expect_error(public.stage_d22_sql(id1,'save_draft',0,payload),'WAREHOUSE_ADJUSTMENT_ACTOR_INVALID');
  UPDATE public.employees SET status='active' WHERE id=f.actor_employee_id;
  UPDATE public.tenants SET status='suspended' WHERE id=f.tenant_id;
  PERFORM public.stage_d_transfer_expect_error(public.stage_d22_sql(id1,'submit',1),'WAREHOUSE_ADJUSTMENT_ACTOR_INVALID');
  UPDATE public.tenants SET status='active' WHERE id=f.tenant_id;
  PERFORM set_config('request.jwt.claim.role','authenticated',true);
  PERFORM public.stage_d_transfer_expect_error(format('SELECT public.command_warehouse_adjustment_order(%L,%L,''submit'',1,''{}'',%L,%L,''bad-role'')',id1,f.tenant_id,f.actor_user_id,f.actor_employee_id),'WAREHOUSE_ADJUSTMENT_FORBIDDEN');
  PERFORM set_config('request.jwt.claim.role','service_role',true);
  PERFORM public.stage_d_transfer_expect_error(format('SELECT public.command_warehouse_adjustment_order(%L,%L,''submit'',1,''{}'',%L,%L,''bad-user'')',id1,f.tenant_id,gen_random_uuid(),f.actor_employee_id),'WAREHOUSE_ADJUSTMENT_ACTOR_INVALID');
  PERFORM public.stage_d_transfer_expect_error(format('SELECT public.command_warehouse_adjustment_order(%L,%L,''submit'',1,''{}'',%L,%L,''bad-tenant'')',id1,gen_random_uuid(),f.actor_user_id,f.actor_employee_id),'WAREHOUSE_ADJUSTMENT_ACTOR_INVALID');
  PERFORM public.stage_d22_command(id1,'submit',1);
  FOREACH value IN ARRAY ARRAY['quantity_delta=2','adjustment_reason=''changed''','book_quantity=999','snapshot_at=now()+interval ''1 second''','supplier_sku_id=gen_random_uuid()'] LOOP
    PERFORM public.stage_d_transfer_expect_error(format('UPDATE public.warehouse_adjustment_order_items SET %s WHERE adjustment_order_id=%L',value,id1),'WAREHOUSE_ADJUSTMENT_SNAPSHOT_IMMUTABLE');
  END LOOP;
  PERFORM public.stage_d_transfer_expect_error(format('DELETE FROM public.warehouse_adjustment_order_items WHERE adjustment_order_id=%L',id1),'WAREHOUSE_ADJUSTMENT_SNAPSHOT_IMMUTABLE');
  UPDATE public.inventory_balances SET version=version+1 WHERE warehouse_id=f.warehouse_id AND supplier_sku_id=f.second_sku_id;
  snapshot:=public.stage_d22_snapshot();
  PERFORM public.stage_d_transfer_expect_error(public.stage_d22_sql(id1,'complete',2),'WAREHOUSE_ADJUSTMENT_SNAPSHOT_CONFLICT');
  IF public.stage_d22_snapshot() IS DISTINCT FROM snapshot THEN RAISE EXCEPTION 'Conflict leaked mutation'; END IF;
  PERFORM public.stage_d22_command(id1,'cancel',2);
  PERFORM public.stage_d_transfer_expect_error(format('DELETE FROM public.warehouse_adjustment_orders WHERE id=%L',id1),'WAREHOUSE_ADJUSTMENT_IMMUTABLE');
  PERFORM public.stage_d_transfer_expect_error(format('UPDATE public.warehouse_adjustment_order_items SET amount=0 WHERE adjustment_order_id=%L',id1),'WAREHOUSE_ADJUSTMENT_IMMUTABLE');
END;
$$;
DO $authority$
DECLARE f public.stage_d22_fixture%ROWTYPE; r uuid:=gen_random_uuid(); a uuid; saved jsonb; payload jsonb;
  foreign_tenant uuid:=gen_random_uuid(); foreign_warehouse uuid:=gen_random_uuid(); foreign_user uuid:=gen_random_uuid();
  foreign_employee uuid:=gen_random_uuid(); foreign_supplier uuid:=gen_random_uuid(); foreign_relationship uuid:=gen_random_uuid();
  foreign_product uuid:=gen_random_uuid(); foreign_sku uuid:=gen_random_uuid(); result jsonb;
BEGIN
  SELECT * INTO STRICT f FROM public.stage_d22_fixture;
  payload:=public.stage_d22_draft(f.second_sku_id); a:=gen_random_uuid();
  saved:=public.stage_d22_command(a,'save_draft',0,payload); PERFORM public.stage_d22_command(a,'submit',1);
  INSERT INTO public.roles(id,tenant_id,code,name,status) VALUES(r,f.tenant_id,'system_admin','Adjustment synthetic admin','active');
  INSERT INTO public.employee_roles(employee_id,role_id) VALUES(f.actor_employee_id,r);
  DELETE FROM public.employee_permission_overrides WHERE employee_id=f.actor_employee_id AND permission_id IN(SELECT id FROM public.permissions WHERE code LIKE 'inventory.adjustment.%');
  PERFORM public.stage_d_transfer_expect_error(public.stage_d22_sql(a,'save_draft',0,payload),'WAREHOUSE_ADJUSTMENT_FORBIDDEN');
  PERFORM public.stage_d_transfer_expect_error(public.stage_d22_sql(a,'complete',2),'WAREHOUSE_ADJUSTMENT_FORBIDDEN');
  INSERT INTO public.role_permissions(role_id,permission_id,access_scope) SELECT r,id,'all' FROM public.permissions WHERE code LIKE 'inventory.adjustment.%';
  UPDATE public.roles SET status='inactive' WHERE id=r;
  PERFORM public.stage_d_transfer_expect_error(public.stage_d22_sql(a,'save_draft',0,payload),'WAREHOUSE_ADJUSTMENT_FORBIDDEN');
  PERFORM public.stage_d_transfer_expect_error(public.stage_d22_sql(a,'complete',2),'WAREHOUSE_ADJUSTMENT_FORBIDDEN');
  UPDATE public.roles SET status='active' WHERE id=r;
  INSERT INTO public.employee_permission_overrides(employee_id,permission_id,effect,access_scope)
    SELECT f.actor_employee_id,id,'deny','all' FROM public.permissions WHERE code LIKE 'inventory.adjustment.%';
  PERFORM public.stage_d_transfer_expect_error(public.stage_d22_sql(a,'save_draft',0,payload),'WAREHOUSE_ADJUSTMENT_FORBIDDEN');
  PERFORM public.stage_d_transfer_expect_error(public.stage_d22_sql(a,'complete',2),'WAREHOUSE_ADJUSTMENT_FORBIDDEN');
  UPDATE public.employee_permission_overrides SET effect='allow' WHERE employee_id=f.actor_employee_id AND permission_id IN(SELECT id FROM public.permissions WHERE code LIKE 'inventory.adjustment.%');
  UPDATE public.supplier_skus SET status='inactive' WHERE id=f.second_sku_id;
  PERFORM public.stage_d_transfer_expect_error(public.stage_d22_sql(a,'complete',2),'WAREHOUSE_ADJUSTMENT_SKU_INVALID');
  PERFORM public.stage_d_transfer_expect_error(public.stage_d22_sql(gen_random_uuid(),'save_draft',0,payload),'WAREHOUSE_ADJUSTMENT_SKU_INVALID');
  UPDATE public.supplier_skus SET status='active' WHERE id=f.second_sku_id;
  UPDATE public.employee_permission_overrides SET effect='deny' WHERE employee_id=f.actor_employee_id AND permission_id=(SELECT id FROM public.permissions WHERE code='inventory.adjustment.manage');
  result:=public.stage_d22_command(a,'complete',2);
  UPDATE public.employee_permission_overrides SET effect='allow' WHERE employee_id=f.actor_employee_id AND permission_id=(SELECT id FROM public.permissions WHERE code='inventory.adjustment.manage');
  UPDATE public.employee_permission_overrides SET effect='deny' WHERE employee_id=f.actor_employee_id AND permission_id=(SELECT id FROM public.permissions WHERE code='inventory.adjustment.approve');
  PERFORM public.stage_d_transfer_expect_error(public.stage_d22_sql(a,'complete',2),'WAREHOUSE_ADJUSTMENT_FORBIDDEN');
  UPDATE public.employee_permission_overrides SET effect='allow' WHERE employee_id=f.actor_employee_id AND permission_id=(SELECT id FROM public.permissions WHERE code='inventory.adjustment.approve');
  UPDATE public.tenant_supplier_settings SET warehouse_adjustments_enabled=false WHERE tenant_id=f.tenant_id;
  IF public.stage_d22_command(a,'complete',2) IS DISTINCT FROM result THEN RAISE EXCEPTION 'Disabled completed replay lost receipt'; END IF;
  UPDATE public.tenant_supplier_settings SET warehouse_adjustments_enabled=true WHERE tenant_id=f.tenant_id;
  UPDATE public.warehouses SET status='inactive' WHERE id=f.warehouse_id;
  PERFORM public.stage_d_transfer_expect_error(public.stage_d22_sql(gen_random_uuid(),'save_draft',0,payload),'WAREHOUSE_ADJUSTMENT_WAREHOUSE_INACTIVE');
  UPDATE public.warehouses SET status='active' WHERE id=f.warehouse_id;
  INSERT INTO public.tenants(id,name,slug) VALUES(foreign_tenant,'Adjustment foreign','adjustment-foreign');
  INSERT INTO public.warehouses(id,tenant_id,name) VALUES(foreign_warehouse,foreign_tenant,'Adjustment foreign');
  INSERT INTO auth.users(id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data)
    VALUES(foreign_user,'authenticated','authenticated','adjustment-foreign@smoke.invalid','','{}','{}');
  INSERT INTO public.employees(id,tenant_id,user_id,name,status) VALUES(foreign_employee,foreign_tenant,foreign_user,'Foreign adjustment operator','active');
  INSERT INTO public.employee_permission_overrides(employee_id,permission_id,effect,access_scope)
    SELECT foreign_employee,id,'allow','all' FROM public.permissions WHERE code='inventory.adjustment.manage';
  PERFORM public.stage_d_transfer_expect_error(format('SELECT public.command_warehouse_adjustment_order(%L,%L,''submit'',1,''{}'',%L,%L,''foreign-existing'')',a,foreign_tenant,foreign_user,foreign_employee),'WAREHOUSE_ADJUSTMENT_NOT_FOUND');
  INSERT INTO public.suppliers SELECT (jsonb_populate_record(NULL::public.suppliers,to_jsonb(s)||jsonb_build_object(
    'id',foreign_supplier,'code','AF-'||left(replace(foreign_supplier::text,'-',''),16),'owner_tenant_id',foreign_tenant,
    'created_by_employee_id',foreign_employee,'updated_by_employee_id',foreign_employee,'reviewed_by_employee_id',foreign_employee))).*
    FROM public.suppliers s JOIN public.supplier_skus sku ON sku.supplier_id=s.id WHERE sku.id=f.sku_id;
  INSERT INTO public.tenant_supplier_settings(tenant_id,module_enabled,require_active_contract_for_new_order,
    ownership_reads_enabled,private_supplier_writes_enabled,private_catalog_writes_enabled,procurement_snapshot_v1_enabled,enabled_by_employee_id,enabled_at)
    VALUES(foreign_tenant,true,false,true,true,true,true,foreign_employee,now());
  INSERT INTO public.tenant_suppliers(id,tenant_id,supplier_id,relationship_status,default_currency,internal_supplier_code,started_at,created_by_employee_id,updated_by_employee_id)
    VALUES(foreign_relationship,foreign_tenant,foreign_supplier,'active','CNY',upper('AF-'||left(replace(foreign_supplier::text,'-',''),16)),current_date,foreign_employee,foreign_employee);
  SELECT public.command_supplier_purchasable_product_v1(foreign_product,foreign_sku,foreign_tenant,foreign_relationship,foreign_supplier,
    jsonb_build_object('product_code','TP-'||left(replace(foreign_product::text,'-',''),16),'name','Foreign product','category_id',p.category_id,'brand_id',p.brand_id),
    jsonb_build_object('sku_code','TS-'||left(replace(foreign_sku::text,'-',''),16),'name','Foreign SKU','purchase_unit_id',s.purchase_unit_id,'spec_values','{}'::jsonb),
    '{"unit_price":"1","tax_rate":"0.000000","tax_inclusive":true}',foreign_user,foreign_employee,'adjustment-foreign-product') INTO result
    FROM public.supplier_skus s JOIN public.supplier_products p ON p.id=s.supplier_product_id WHERE s.id=f.sku_id;
  IF result->>'status' IS DISTINCT FROM 'created' THEN RAISE EXCEPTION 'Foreign catalog fixture failed: %',result; END IF;
  PERFORM public.stage_d_transfer_expect_error(public.stage_d22_sql(gen_random_uuid(),'save_draft',0,public.stage_d22_draft(foreign_sku)),'WAREHOUSE_ADJUSTMENT_SKU_INVALID');
  PERFORM public.stage_d_transfer_expect_error(public.stage_d22_sql(gen_random_uuid(),'save_draft',0,payload||jsonb_build_object('warehouse_id',foreign_warehouse)),'WAREHOUSE_ADJUSTMENT_WAREHOUSE_INVALID');
END;
$authority$;
DO $sources$
DECLARE f public.stage_d22_fixture%ROWTYPE; a uuid; b uuid; item_id uuid; tx public.inventory_transactions%ROWTYPE; bad jsonb; baseline public.inventory_balances%ROWTYPE; snapshot jsonb; field text;
BEGIN
  SELECT * INTO STRICT f FROM public.stage_d22_fixture;
  a:=public.stage_d22_prepare(f.second_sku_id); PERFORM public.stage_d22_command(a,'complete',2);
  SELECT t.* INTO STRICT tx FROM public.inventory_transactions t JOIN public.warehouse_adjustment_order_items i ON i.id=t.warehouse_adjustment_item_id WHERE i.adjustment_order_id=a;
  FOR bad IN SELECT x FROM jsonb_array_elements(jsonb_build_array('{"quantity_delta":99}'::jsonb,'{"value_delta":99}'::jsonb,'{"unit_cost":99}'::jsonb,
    jsonb_build_object('warehouse_id',f.destination_id),jsonb_build_object('supplier_sku_id',f.sku_id),jsonb_build_object('warehouse_issue_item_id',gen_random_uuid()),
    jsonb_build_object('warehouse_return_item_id',gen_random_uuid()),jsonb_build_object('warehouse_transfer_out_item_id',gen_random_uuid()),
    jsonb_build_object('warehouse_transfer_in_item_id',gen_random_uuid()),jsonb_build_object('warehouse_stocktake_item_id',gen_random_uuid()),
    jsonb_build_object('project_id',gen_random_uuid()),jsonb_build_object('cost_category_id',gen_random_uuid()),'{"source_type":"supplier_purchase_receipt_item"}'::jsonb,
    jsonb_build_object('source_id',gen_random_uuid()),'{"transaction_type":"adjustment_out"}'::jsonb)) x LOOP
    PERFORM public.stage_d_transfer_expect_error(format('INSERT INTO public.inventory_transactions SELECT (jsonb_populate_record(NULL::public.inventory_transactions,%L::jsonb)).*',
      to_jsonb(tx)||bad||jsonb_build_object('id',gen_random_uuid())),'WAREHOUSE_ADJUSTMENT_SOURCE_CONFLICT');
  END LOOP;
  BEGIN
    INSERT INTO public.inventory_transactions SELECT (jsonb_populate_record(NULL::public.inventory_transactions,to_jsonb(tx)||jsonb_build_object('id',gen_random_uuid()))).*;
    RAISE EXCEPTION 'Expected duplicate adjustment source rejection';
  EXCEPTION WHEN unique_violation THEN IF SQLERRM NOT LIKE '%inventory_transactions_source_unique_idx%' THEN RAISE; END IF; END;
  PERFORM public.stage_d_transfer_expect_error(format('UPDATE public.inventory_transactions SET value_delta=0 WHERE id=%L',tx.id),'INVENTORY_FACT_IMMUTABLE');
  PERFORM public.stage_d_transfer_expect_error(format('UPDATE public.warehouse_adjustment_orders SET reason=''forged'' WHERE id=%L',a),'WAREHOUSE_ADJUSTMENT_IMMUTABLE');
  PERFORM public.stage_d_transfer_expect_error(format('DELETE FROM public.warehouse_adjustment_command_events WHERE order_id=%L',a),'INVENTORY_FACT_IMMUTABLE');
  b:=gen_random_uuid(); PERFORM public.stage_d22_command(b,'save_draft',0,public.stage_d22_draft(f.second_sku_id));
  SELECT id INTO STRICT item_id FROM public.warehouse_adjustment_order_items WHERE adjustment_order_id=b;
  -- Isolate the FK/CHECK layers using a new source identity (no uniqueness collision).
  ALTER TABLE public.inventory_transactions DISABLE TRIGGER warehouse_adjustment_transaction_source;
  BEGIN
    INSERT INTO public.inventory_transactions SELECT (jsonb_populate_record(NULL::public.inventory_transactions,to_jsonb(tx)||
      jsonb_build_object('id',gen_random_uuid(),'source_id',item_id,'warehouse_adjustment_item_id',item_id,'supplier_sku_id',f.sku_id))).*;
    RAISE EXCEPTION 'Expected composite adjustment FK rejection';
  EXCEPTION WHEN foreign_key_violation THEN IF SQLERRM NOT LIKE '%inventory_transactions_adjustment_fkey%' THEN RAISE; END IF; END;
  BEGIN
    INSERT INTO public.inventory_transactions SELECT (jsonb_populate_record(NULL::public.inventory_transactions,to_jsonb(tx)||
      jsonb_build_object('id',gen_random_uuid(),'source_id',item_id,'warehouse_adjustment_item_id',item_id,'source_type','supplier_purchase_receipt_item','transaction_type','purchase_receipt'))).*;
    RAISE EXCEPTION 'Expected old source with adjustment reference rejection';
  EXCEPTION WHEN check_violation THEN IF SQLERRM NOT LIKE '%inventory_transactions_material_source_check%' THEN RAISE; END IF; END;
  ALTER TABLE public.inventory_transactions ENABLE TRIGGER warehouse_adjustment_transaction_source;
  a:=public.stage_d22_prepare(f.second_sku_id);
  SELECT * INTO STRICT baseline FROM public.inventory_balances WHERE warehouse_id=f.warehouse_id AND supplier_sku_id=f.second_sku_id;
  FOREACH field IN ARRAY ARRAY['quantity_on_hand','inventory_value','average_unit_cost'] LOOP
    EXECUTE format('UPDATE public.inventory_balances SET %I=%I+1 WHERE id=%L',field,field,baseline.id);
    snapshot:=public.stage_d22_snapshot();
    PERFORM public.stage_d_transfer_expect_error(public.stage_d22_sql(a,'complete',2),'WAREHOUSE_ADJUSTMENT_SNAPSHOT_CONFLICT');
    IF public.stage_d22_snapshot() IS DISTINCT FROM snapshot THEN RAISE EXCEPTION 'Changed field conflict leaked %',field; END IF;
    EXECUTE format('UPDATE public.inventory_balances SET %I=%L WHERE id=%L',field,to_jsonb(baseline)->>field,baseline.id);
  END LOOP;
  DELETE FROM public.inventory_balances WHERE id=baseline.id;
  snapshot:=public.stage_d22_snapshot(); PERFORM public.stage_d_transfer_expect_error(public.stage_d22_sql(a,'complete',2),'WAREHOUSE_ADJUSTMENT_SNAPSHOT_CONFLICT');
  IF public.stage_d22_snapshot() IS DISTINCT FROM snapshot THEN RAISE EXCEPTION 'Missing balance conflict mutated state'; END IF;
  INSERT INTO public.inventory_balances SELECT (jsonb_populate_record(NULL::public.inventory_balances,to_jsonb(baseline)||jsonb_build_object('id',gen_random_uuid()))).*;
  snapshot:=public.stage_d22_snapshot(); PERFORM public.stage_d_transfer_expect_error(public.stage_d22_sql(a,'complete',2),'WAREHOUSE_ADJUSTMENT_SNAPSHOT_CONFLICT');
  IF public.stage_d22_snapshot() IS DISTINCT FROM snapshot THEN RAISE EXCEPTION 'Recreated balance conflict mutated state'; END IF;
END;
$sources$;
DO $limits$
DECLARE f public.stage_d22_fixture%ROWTYPE; ids uuid[]; a uuid; payload jsonb; item jsonb; snapshot jsonb;
  baseline public.inventory_balances%ROWTYPE; scenario jsonb; field text; phase text; err text;
BEGIN
  SELECT * INTO STRICT f FROM public.stage_d22_fixture;
  SELECT array_agg(gen_random_uuid()) INTO ids FROM generate_series(1,100);
  INSERT INTO public.supplier_skus SELECT (jsonb_populate_record(NULL::public.supplier_skus,to_jsonb(s)||jsonb_build_object('id',x,'sku_code','A100-'||left(replace(x::text,'-',''),16)))).*
    FROM public.supplier_skus s CROSS JOIN unnest(ids) x WHERE s.id=f.sku_id;
  payload:=jsonb_set(public.stage_d22_draft(f.second_sku_id),'{items}',(SELECT jsonb_agg(jsonb_build_object('supplier_sku_id',x,'quantity_delta','0.0001','adjustment_reason','100 valid lines')) FROM unnest(ids) x));
  a:=gen_random_uuid(); PERFORM public.stage_d22_command(a,'save_draft',0,payload);
  IF (SELECT count(*) FROM public.warehouse_adjustment_order_items WHERE adjustment_order_id=a)<>100 THEN RAISE EXCEPTION '100 distinct lines rejected'; END IF;
  PERFORM public.stage_d22_command(a,'cancel',1);
  SELECT * INTO STRICT baseline FROM public.inventory_balances WHERE warehouse_id=f.warehouse_id AND supplier_sku_id=f.second_sku_id;
  -- Synthetic corruption probes cover complete's independent preflight even
  -- though the public submit command can never freeze these invalid results.
  FOR scenario IN SELECT x FROM jsonb_array_elements('[
    {"label":"quantity","q":99999999999999.9999,"v":0,"c":0,"d":"0.0001","version":1},
    {"label":"unit-cost","q":0.0001,"v":10000000000,"c":0,"d":"0.0001","version":1},
    {"label":"amount","q":1,"v":1000,"c":1000,"d":"99999999999998","version":1},
    {"label":"value","q":100,"v":9999999999999999,"c":99999999999999.99,"d":"0.0001","version":1},
    {"label":"average","q":0.0003,"v":29999999999.99,"c":99999999999966.6667,"d":"-0.0002","version":1},
    {"label":"version","q":3,"v":45,"c":15,"d":"1","version":2147483647},
    {"label":"insufficient","q":3,"v":45,"c":15,"d":"-4","version":1}
  ]'::jsonb) x LOOP
    FOREACH phase IN ARRAY ARRAY['submit','complete'] LOOP
      UPDATE public.inventory_balances SET quantity_on_hand=baseline.quantity_on_hand,inventory_value=baseline.inventory_value,average_unit_cost=baseline.average_unit_cost,version=baseline.version WHERE id=baseline.id;
      a:=gen_random_uuid(); PERFORM public.stage_d22_command(a,'save_draft',0,public.stage_d22_draft(f.second_sku_id,CASE WHEN phase='submit' THEN scenario->>'d' ELSE '1' END));
      IF phase='complete' THEN PERFORM public.stage_d22_command(a,'submit',1); END IF;
      UPDATE public.inventory_balances SET quantity_on_hand=(scenario->>'q')::numeric,inventory_value=(scenario->>'v')::numeric,average_unit_cost=(scenario->>'c')::numeric,version=(scenario->>'version')::integer WHERE id=baseline.id;
      IF phase='complete' THEN
        ALTER TABLE public.warehouse_adjustment_order_items DISABLE TRIGGER warehouse_adjustment_items_guard;
        UPDATE public.warehouse_adjustment_order_items SET quantity_delta=(scenario->>'d')::numeric,book_quantity=(scenario->>'q')::numeric,
          book_value=(scenario->>'v')::numeric,book_unit_cost=(scenario->>'c')::numeric,book_balance_version=(scenario->>'version')::integer WHERE adjustment_order_id=a;
        ALTER TABLE public.warehouse_adjustment_order_items ENABLE TRIGGER warehouse_adjustment_items_guard;
      END IF;
      snapshot:=public.stage_d22_snapshot(); err:=CASE WHEN scenario->>'label'='insufficient' THEN 'WAREHOUSE_ADJUSTMENT_INSUFFICIENT_STOCK' ELSE 'WAREHOUSE_ADJUSTMENT_BALANCE_INVALID' END;
      PERFORM public.stage_d_transfer_expect_error(public.stage_d22_sql(a,phase,CASE WHEN phase='submit' THEN 1 ELSE 2 END),err);
      IF public.stage_d22_snapshot() IS DISTINCT FROM snapshot THEN RAISE EXCEPTION 'Arithmetic failure leaked % %',scenario->>'label',phase; END IF;
    END LOOP;
  END LOOP;
  UPDATE public.inventory_balances SET quantity_on_hand=baseline.quantity_on_hand,inventory_value=baseline.inventory_value,average_unit_cost=baseline.average_unit_cost,version=baseline.version WHERE id=baseline.id;
  a:=gen_random_uuid(); PERFORM public.stage_d22_command(a,'save_draft',0,public.stage_d22_draft(f.second_sku_id));
  FOREACH field IN ARRAY ARRAY['quantity_on_hand','inventory_value','average_unit_cost'] LOOP
    EXECUTE format('UPDATE public.inventory_balances SET %I=''NaN''::numeric WHERE id=%L',field,baseline.id);
    PERFORM public.stage_d_transfer_expect_error(public.stage_d22_sql(a,'submit',1),'WAREHOUSE_ADJUSTMENT_BALANCE_INVALID');
    EXECUTE format('UPDATE public.inventory_balances SET %I=%L WHERE id=%L',field,to_jsonb(baseline)->>field,baseline.id);
  END LOOP;
  UPDATE public.warehouse_adjustment_orders SET version=2147483647 WHERE id=a;
  PERFORM public.stage_d_transfer_expect_error(public.stage_d22_sql(a,'save_draft',2147483647,public.stage_d22_draft(f.second_sku_id)),'WAREHOUSE_ADJUSTMENT_VERSION_CONFLICT');
  PERFORM public.stage_d_transfer_expect_error(public.stage_d22_sql(a,'submit',2147483647),'WAREHOUSE_ADJUSTMENT_VERSION_CONFLICT');
  a:=public.stage_d22_prepare(f.second_sku_id); UPDATE public.warehouse_adjustment_orders SET version=2147483647 WHERE id=a;
  PERFORM public.stage_d_transfer_expect_error(public.stage_d22_sql(a,'complete',2147483647),'WAREHOUSE_ADJUSTMENT_VERSION_CONFLICT');
  IF public.stage_d_transfer_financial_snapshot(f.tenant_id) IS DISTINCT FROM f.financial_before THEN RAISE EXCEPTION 'Security changed financial facts'; END IF;
END;
$limits$;
ROLLBACK;
SELECT 'EVIDENCE adjustment security: independent SQL UUID/UTF16/decimal/100-line limits; missing permission/system_admin/inactive role/deny/foreign SKU; frozen replay and terminal guards; source trigger/composite FK/unique/legacy CHECK; changed/deleted/recreated snapshots; submit+complete quantity/cost/amount/value/average/version/insufficient boundaries; exact rollback and finances';
