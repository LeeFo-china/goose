-- All adversarial data/permission changes are rolled back in the offline DB.
BEGIN;
CREATE FUNCTION pg_temp.transfer_call_sql(p_id uuid,p_command text,p_version integer,p_payload jsonb,p_key text)
RETURNS text LANGUAGE sql AS $$
  SELECT format('SELECT public.command_warehouse_transfer_order(%L,%L,%L,%s,%L,%L,%L,%L)',
    p_id,tenant_id,p_command,p_version,p_payload,actor_user_id,actor_employee_id,p_key) FROM public.stage_d_transfer_fixture
$$;
DO $test$
<<probe>>
DECLARE f public.stage_d_transfer_fixture%ROWTYPE; id uuid:=gen_random_uuid(); other_id uuid:=gen_random_uuid();
  foreign_tenant uuid:=gen_random_uuid(); foreign_warehouse uuid:=gen_random_uuid(); foreign_sku uuid:=gen_random_uuid();
  foreign_supplier uuid:=gen_random_uuid(); foreign_product uuid:=gen_random_uuid();
  foreign_user uuid:=gen_random_uuid();
  foreign_relationship uuid:=gen_random_uuid();
  payload jsonb; bad jsonb; saved jsonb; first_item uuid; q jsonb; permission text; tx public.inventory_transactions%ROWTYPE;
  completed jsonb; facts integer; commands integer; snapshot jsonb;
BEGIN
  SELECT * INTO STRICT f FROM public.stage_d_transfer_fixture;
  PERFORM set_config('request.jwt.claim.role','service_role',true);
  snapshot:=public.stage_d_transfer_financial_snapshot(f.tenant_id);
  payload:=jsonb_build_object('source_warehouse_id',f.source_warehouse_id,'destination_warehouse_id',f.destination_warehouse_id,'reason','Security',
    'items',jsonb_build_array(jsonb_build_object('supplier_sku_id',f.sku_id,'quantity','0.3')));
  saved:=public.stage_d_transfer_command(id,'save_draft',0,payload,'security-save');
  SELECT i.id INTO STRICT first_item FROM public.warehouse_transfer_order_items i WHERE transfer_order_id=probe.id;
  PERFORM public.stage_d_transfer_command(id,'save_draft',1,payload,'security-replace');
  IF EXISTS(SELECT 1 FROM public.warehouse_transfer_order_items WHERE warehouse_transfer_order_items.id=first_item)
    OR (SELECT count(*) FROM public.warehouse_transfer_order_items WHERE transfer_order_id=probe.id)<>1 THEN RAISE EXCEPTION 'Draft replacement failed'; END IF;
  PERFORM public.stage_d_transfer_expect_error(pg_temp.transfer_call_sql(id,'submit',1,'{}','security-stale'),'WAREHOUSE_TRANSFER_VERSION_CONFLICT');
  PERFORM public.stage_d_transfer_expect_error(pg_temp.transfer_call_sql(id,'save_draft',0,payload||'{"reason":"changed"}','security-save'),
    'WAREHOUSE_TRANSFER_IDEMPOTENCY_CONFLICT');
  bad:=payload||jsonb_build_object('source_warehouse_id',f.destination_warehouse_id,'destination_warehouse_id',f.source_warehouse_id);
  PERFORM public.stage_d_transfer_expect_error(pg_temp.transfer_call_sql(id,'save_draft',2,bad,'security-move'),'WAREHOUSE_TRANSFER_SOURCE_CONFLICT');
  bad:=payload||jsonb_build_object('destination_warehouse_id',f.source_warehouse_id);
  PERFORM public.stage_d_transfer_expect_error(pg_temp.transfer_call_sql(id,'save_draft',2,bad,'security-same'),'WAREHOUSE_TRANSFER_WAREHOUSE_INVALID');
  FOR q IN SELECT value FROM jsonb_array_elements('[0.1,"0","00.1","-1","NaN","Infinity","1e2","0.00001","100000000000000",null]'::jsonb) LOOP
    PERFORM public.stage_d_transfer_expect_error(pg_temp.transfer_call_sql(id,'save_draft',2,jsonb_set(payload,'{items,0,quantity}',q),'security-quantity'),
      'WAREHOUSE_TRANSFER_ITEMS_INVALID');
  END LOOP;
  FOREACH permission IN ARRAY ARRAY['unit_cost','amount','cost_category_id','project_id','actor_employee_id'] LOOP
    PERFORM public.stage_d_transfer_expect_error(pg_temp.transfer_call_sql(id,'save_draft',2,
      jsonb_set(payload,ARRAY['items','0',permission],'"forged"'),'security-forged'),'WAREHOUSE_TRANSFER_ITEMS_INVALID');
  END LOOP;
  FOR bad IN SELECT value FROM jsonb_array_elements(jsonb_build_array(
    payload||'{"reason":"  "}',payload||'{"reason":null}',payload||'{"project_id":null}',payload-'reason')) LOOP
    PERFORM public.stage_d_transfer_expect_error(pg_temp.transfer_call_sql(id,'save_draft',2,bad,'security-invalid'),'WAREHOUSE_TRANSFER_INVALID');
  END LOOP;
  bad:=jsonb_set(payload,'{items}',jsonb_build_array(payload->'items'->0,
    jsonb_set(payload->'items'->0,'{supplier_sku_id}',to_jsonb(upper(f.sku_id::text)))));
  PERFORM public.stage_d_transfer_expect_error(pg_temp.transfer_call_sql(id,'save_draft',2,bad,'security-duplicate'),'WAREHOUSE_TRANSFER_ITEMS_INVALID');
  bad:=jsonb_set(payload,'{items}',(SELECT jsonb_agg(payload->'items'->0) FROM generate_series(1,101)));
  PERFORM public.stage_d_transfer_expect_error(pg_temp.transfer_call_sql(id,'save_draft',2,bad,'security-bound'),'WAREHOUSE_TRANSFER_ITEMS_INVALID');
  PERFORM public.stage_d_transfer_expect_error(pg_temp.transfer_call_sql(id,'complete',2,'{}','security-unsubmitted'),'WAREHOUSE_TRANSFER_STATE_CONFLICT');

  INSERT INTO public.tenants(id,name,slug) VALUES(foreign_tenant,'Transfer foreign','transfer-foreign');
  INSERT INTO public.warehouses(id,tenant_id,name) VALUES(foreign_warehouse,foreign_tenant,'Foreign warehouse');
  INSERT INTO auth.users(id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data)
    VALUES(foreign_user,'authenticated','authenticated','transfer-foreign@smoke.invalid','','{}','{}');
  INSERT INTO public.employees(id,tenant_id,user_id,name,status) VALUES(foreign_sku,foreign_tenant,foreign_user,'Foreign operator','active');
  bad:=payload||jsonb_build_object('destination_warehouse_id',foreign_warehouse);
  PERFORM public.stage_d_transfer_expect_error(pg_temp.transfer_call_sql(other_id,'save_draft',0,bad,'security-foreign-warehouse'),
    'WAREHOUSE_TRANSFER_WAREHOUSE_INVALID');
  -- Create a consistent foreign supplier/product/SKU chain: do not bypass the
  -- existing catalog ownership triggers merely to manufacture adversarial data.
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
    '{"unit_price":"1","tax_rate":"0.000000","tax_inclusive":true}',foreign_user,foreign_sku,'transfer-foreign-product') INTO q
    FROM public.supplier_skus s JOIN public.supplier_products p ON p.id=s.supplier_product_id WHERE s.id=f.sku_id;
  IF q->>'status'<>'created' THEN RAISE EXCEPTION 'Foreign product fixture failed: %',q; END IF;
  bad:=jsonb_set(payload,'{items,0,supplier_sku_id}',to_jsonb(foreign_sku));
  PERFORM public.stage_d_transfer_expect_error(pg_temp.transfer_call_sql(other_id,'save_draft',0,bad,'security-foreign-sku'),'WAREHOUSE_TRANSFER_SKU_INVALID');
  INSERT INTO public.warehouse_transfer_orders(id,tenant_id,source_warehouse_id,destination_warehouse_id,reason,created_by_employee_id,updated_by_employee_id)
    SELECT other_id,tenant_id,source_warehouse_id,destination_warehouse_id,'Foreign document probe',created_by_employee_id,updated_by_employee_id
    FROM public.warehouse_transfer_orders WHERE warehouse_transfer_orders.id=probe.id;
  -- A valid foreign actor must not read or command another tenant's document.
  INSERT INTO public.employee_permission_overrides(employee_id,permission_id,effect,access_scope)
    SELECT foreign_sku,p.id,'allow','all' FROM public.permissions p WHERE code IN ('inventory.stock.view','inventory.transfer.manage');
  PERFORM public.stage_d_transfer_expect_error(format('SELECT public.get_warehouse_transfer_order(%L,%L,%L,%L)',foreign_tenant,id,foreign_user,foreign_sku),
    'WAREHOUSE_TRANSFER_NOT_FOUND');
  PERFORM public.stage_d_transfer_expect_error(format('SELECT public.command_warehouse_transfer_order(%L,%L,''submit'',2,''{}'',%L,%L,''foreign-command'')',
    id,foreign_tenant,foreign_user,foreign_sku),'WAREHOUSE_TRANSFER_NOT_FOUND');
  PERFORM public.stage_d_transfer_expect_error(format('SELECT public.get_warehouse_transfer_order(%L,%L,%L,%L)',f.tenant_id,id,gen_random_uuid(),f.actor_employee_id),
    'WAREHOUSE_TRANSFER_ACTOR_INVALID');
  UPDATE public.employees SET status='suspended' WHERE employees.id=f.actor_employee_id;
  PERFORM public.stage_d_transfer_expect_error(pg_temp.transfer_call_sql(id,'save_draft',0,payload,'security-save'),'WAREHOUSE_TRANSFER_ACTOR_INVALID');
  UPDATE public.employees SET status='active' WHERE employees.id=f.actor_employee_id;
  PERFORM set_config('request.jwt.claim.role','authenticated',true);
  PERFORM public.stage_d_transfer_expect_error(pg_temp.transfer_call_sql(id,'save_draft',0,payload,'security-save'),'WAREHOUSE_TRANSFER_FORBIDDEN');
  PERFORM set_config('request.jwt.claim.role','service_role',true);
  SELECT count(*) INTO commands FROM public.warehouse_transfer_command_events WHERE tenant_id=f.tenant_id;
  UPDATE public.tenant_supplier_settings SET warehouse_transfers_enabled=false WHERE tenant_id=f.tenant_id;
  UPDATE public.warehouses SET status='inactive' WHERE warehouses.id=f.destination_warehouse_id;
  PERFORM public.stage_d_transfer_expect_error(pg_temp.transfer_call_sql(id,'submit',2,'{}','security-disabled'),'WAREHOUSE_TRANSFER_NOT_ENABLED');
  IF public.stage_d_transfer_command(id,'save_draft',0,payload,'security-save')<>saved THEN RAISE EXCEPTION 'Disabled replay changed result'; END IF;
  PERFORM public.get_warehouse_transfer_order(f.tenant_id,id,f.actor_user_id,f.actor_employee_id);
  PERFORM public.list_warehouse_transfer_order_items(f.tenant_id,id,f.actor_user_id,f.actor_employee_id);
  PERFORM public.list_warehouse_transfer_orders(f.tenant_id,f.actor_user_id,f.actor_employee_id);
  UPDATE public.tenant_supplier_settings SET warehouse_transfers_enabled=true WHERE tenant_id=f.tenant_id;
  PERFORM public.stage_d_transfer_expect_error(pg_temp.transfer_call_sql(id,'submit',2,'{}','security-inactive'),'WAREHOUSE_TRANSFER_WAREHOUSE_INACTIVE');
  UPDATE public.warehouses SET status='active' WHERE warehouses.id=f.destination_warehouse_id;
  IF (SELECT count(*) FROM public.warehouse_transfer_command_events WHERE tenant_id=f.tenant_id)<>commands THEN RAISE EXCEPTION 'Failed commands stored receipts'; END IF;
  UPDATE public.employee_permission_overrides SET effect='deny' WHERE employee_id=f.actor_employee_id
    AND permission_id=(SELECT p.id FROM public.permissions p WHERE code='inventory.transfer.manage');
  PERFORM public.stage_d_transfer_expect_error(pg_temp.transfer_call_sql(id,'save_draft',0,payload,'security-save'),'WAREHOUSE_TRANSFER_FORBIDDEN');
  UPDATE public.employee_permission_overrides SET effect='allow' WHERE employee_id=f.actor_employee_id
    AND permission_id=(SELECT p.id FROM public.permissions p WHERE code='inventory.transfer.manage');
  -- Project permissions are irrelevant for transfers.
  UPDATE public.employee_permission_overrides SET effect='deny' WHERE employee_id=f.actor_employee_id
    AND permission_id=(SELECT p.id FROM public.permissions p WHERE code='project.read');
  PERFORM public.stage_d_transfer_command(id,'submit',2,'{}','security-submit');
  UPDATE public.employee_permission_overrides SET effect='deny' WHERE employee_id=f.actor_employee_id
    AND permission_id=(SELECT p.id FROM public.permissions p WHERE code='inventory.transfer.approve');
  PERFORM public.stage_d_transfer_expect_error(pg_temp.transfer_call_sql(id,'complete',3,'{}','security-complete'),'WAREHOUSE_TRANSFER_FORBIDDEN');
  UPDATE public.employee_permission_overrides SET effect='allow' WHERE employee_id=f.actor_employee_id
    AND permission_id=(SELECT p.id FROM public.permissions p WHERE code='inventory.transfer.approve');
  -- Approval is sufficient; stock/manage need not be granted to the approver.
  UPDATE public.employee_permission_overrides SET effect='deny' WHERE employee_id=f.actor_employee_id
    AND permission_id IN (SELECT p.id FROM public.permissions p WHERE code IN ('inventory.stock.view','inventory.transfer.manage'));
  PERFORM public.stage_d_transfer_expect_error(format('SELECT public.get_warehouse_transfer_order(%L,%L,%L,%L)',f.tenant_id,id,f.actor_user_id,f.actor_employee_id),
    'WAREHOUSE_TRANSFER_FORBIDDEN');
  completed:=public.stage_d_transfer_command(id,'complete',3,'{}','security-complete');
  IF completed->>'status'<>'completed' THEN RAISE EXCEPTION 'Approve-only failed'; END IF;
  UPDATE public.employee_permission_overrides SET effect='deny' WHERE employee_id=f.actor_employee_id
    AND permission_id=(SELECT p.id FROM public.permissions p WHERE code='inventory.transfer.approve');
  PERFORM public.stage_d_transfer_expect_error(pg_temp.transfer_call_sql(id,'complete',3,'{}','security-complete'),'WAREHOUSE_TRANSFER_FORBIDDEN');
  UPDATE public.employee_permission_overrides SET effect='allow' WHERE employee_id=f.actor_employee_id
    AND permission_id=(SELECT p.id FROM public.permissions p WHERE code='inventory.transfer.approve');
  UPDATE public.employee_permission_overrides SET effect='allow' WHERE employee_id=f.actor_employee_id
    AND permission_id IN (SELECT p.id FROM public.permissions p WHERE code IN ('inventory.stock.view','inventory.transfer.manage'));
  PERFORM public.stage_d_transfer_expect_error(pg_temp.transfer_call_sql(id,'cancel',4,'{}','security-terminal'),'WAREHOUSE_TRANSFER_STATE_CONFLICT');
  PERFORM public.stage_d_transfer_expect_error(format('UPDATE public.warehouse_transfer_orders SET reason=''tamper'' WHERE id=%L',id),'WAREHOUSE_TRANSFER_IMMUTABLE');
  PERFORM public.stage_d_transfer_expect_error(format('DELETE FROM public.warehouse_transfer_order_items WHERE transfer_order_id=%L',id),'WAREHOUSE_TRANSFER_IMMUTABLE');
  PERFORM public.stage_d_transfer_expect_error(format('UPDATE public.warehouse_transfer_order_items SET amount=0 WHERE transfer_order_id=%L',id),'WAREHOUSE_TRANSFER_IMMUTABLE');
  PERFORM public.stage_d_transfer_expect_error(format('INSERT INTO public.warehouse_transfer_order_items(tenant_id,transfer_order_id,source_warehouse_id,destination_warehouse_id,line_no,supplier_sku_id,quantity) VALUES(%L,%L,%L,%L,2,%L,1)',
    f.tenant_id,id,f.source_warehouse_id,f.destination_warehouse_id,f.second_sku_id),'WAREHOUSE_TRANSFER_IMMUTABLE');
  -- Execute a forged ledger INSERT as owner to prove the composite FK itself,
  -- not just the RPC, binds direction to warehouse and SKU.
  SELECT * INTO STRICT tx FROM public.inventory_transactions WHERE source_id=(SELECT i.id FROM public.warehouse_transfer_order_items i WHERE transfer_order_id=probe.id)
    AND source_type='warehouse_transfer_out_item';
  -- An owner-only draft copy needs an item for the unused source FK probe.
  INSERT INTO public.warehouse_transfer_order_items(tenant_id,transfer_order_id,source_warehouse_id,destination_warehouse_id,line_no,supplier_sku_id,quantity)
    VALUES(f.tenant_id,other_id,f.source_warehouse_id,f.destination_warehouse_id,1,f.sku_id,1) RETURNING warehouse_transfer_order_items.id INTO first_item;
  BEGIN
    INSERT INTO public.inventory_transactions SELECT (jsonb_populate_record(NULL::public.inventory_transactions,to_jsonb(tx)||jsonb_build_object(
      'id',gen_random_uuid(),'source_id',first_item,'warehouse_transfer_out_item_id',first_item,'warehouse_id',f.destination_warehouse_id))).*;
    RAISE EXCEPTION 'Composite FK accepted wrong warehouse';
  EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  BEGIN
    INSERT INTO public.inventory_transactions SELECT (jsonb_populate_record(NULL::public.inventory_transactions,to_jsonb(tx)||jsonb_build_object(
      'id',gen_random_uuid(),'source_id',first_item,'warehouse_transfer_out_item_id',first_item,'supplier_sku_id',f.second_sku_id))).*;
    RAISE EXCEPTION 'Composite FK accepted wrong SKU';
  EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  PERFORM public.stage_d_transfer_command(other_id,'cancel',1,'{}','security-cancel');
  PERFORM public.stage_d_transfer_expect_error(pg_temp.transfer_call_sql(other_id,'submit',2,'{}','security-cancelled'),'WAREHOUSE_TRANSFER_STATE_CONFLICT');
  PERFORM public.stage_d_transfer_expect_error(format('SELECT public.list_warehouse_transfer_orders(%L,%L,%L,NULL,NULL,NULL,NULL,1,101)',
    f.tenant_id,f.actor_user_id,f.actor_employee_id),'WAREHOUSE_TRANSFER_INVALID');
  PERFORM public.stage_d_transfer_expect_error(format('SELECT public.list_warehouse_transfer_order_items(%L,%L,%L,%L,0,20)',
    f.tenant_id,id,f.actor_user_id,f.actor_employee_id),'WAREHOUSE_TRANSFER_INVALID');
  IF public.stage_d_transfer_financial_snapshot(f.tenant_id) IS DISTINCT FROM snapshot THEN RAISE EXCEPTION 'Security commands changed finances'; END IF;
  -- Valid reason text must survive fingerprinting and frozen replay byte-for-byte.
  id:=gen_random_uuid();
  payload:=payload||jsonb_build_object('reason','仓库 "A" 补货'||chr(10)||'路径'||chr(92)||'B'||chr(9)||'结束');
  saved:=public.stage_d_transfer_command(id,'save_draft',0,payload,'security-escaped-save');
  IF saved->'order'->>'reason'<>payload->>'reason'
    OR public.stage_d_transfer_command(id,'save_draft',0,payload,'security-escaped-save')<>saved THEN
    RAISE EXCEPTION 'Escaped text did not preserve save/replay';
  END IF;
  UPDATE public.warehouse_transfer_orders SET version=2147483647 WHERE warehouse_transfer_orders.id=probe.id;
  PERFORM public.stage_d_transfer_expect_error(pg_temp.transfer_call_sql(id,'submit',2147483647,'{}','security-version-max'),
    'WAREHOUSE_TRANSFER_VERSION_CONFLICT');
  IF public.stage_d_transfer_command(id,'save_draft',0,payload,'security-escaped-save')<>saved THEN
    RAISE EXCEPTION 'Exhausted version prevented successful replay';
  END IF;
  id:=gen_random_uuid();
  payload:=jsonb_set(payload,'{items,0,quantity}','"99999999999999.9999"');
  PERFORM public.stage_d_transfer_command(id,'save_draft',0,payload,'security-max-quantity');
  q:=public.list_warehouse_transfer_order_items(f.tenant_id,id,f.actor_user_id,f.actor_employee_id);
  IF q->'items'->0->'quantity'<>to_jsonb('99999999999999.9999'::text) THEN
    RAISE EXCEPTION '18-digit quantity lost wire precision';
  END IF;
  PERFORM public.stage_d_transfer_expect_error(format('SELECT public.list_warehouse_transfer_orders(%L,%L,%L,NULL,NULL,''bogus'')',
    f.tenant_id,f.actor_user_id,f.actor_employee_id),'WAREHOUSE_TRANSFER_INVALID');
  PERFORM public.stage_d_transfer_expect_error(format('SELECT public.list_warehouse_transfer_orders(%L,%L,%L,NULL,NULL,NULL,%L)',
    f.tenant_id,f.actor_user_id,f.actor_employee_id,repeat('x',101)),'WAREHOUSE_TRANSFER_INVALID');
  id:=gen_random_uuid();
  payload:=jsonb_set(jsonb_set(payload,'{items,0,supplier_sku_id}',to_jsonb(f.second_sku_id)),'{items,0,quantity}','"1"');
  PERFORM public.stage_d_transfer_command(id,'save_draft',0,payload,'security-sku-save');
  PERFORM public.stage_d_transfer_command(id,'submit',1,'{}','security-sku-submit');
  UPDATE public.supplier_skus SET status='inactive' WHERE supplier_skus.id=f.second_sku_id;
  PERFORM public.stage_d_transfer_expect_error(pg_temp.transfer_call_sql(id,'complete',2,'{}','security-sku-complete'),'WAREHOUSE_TRANSFER_SKU_INVALID');
  PERFORM public.stage_d_transfer_expect_error(pg_temp.transfer_call_sql(gen_random_uuid(),'save_draft',0,payload,'security-inactive-sku-save'),
    'WAREHOUSE_TRANSFER_SKU_INVALID');
  UPDATE public.supplier_skus SET status='active' WHERE supplier_skus.id=f.second_sku_id;
  PERFORM public.stage_d_transfer_command(id,'cancel',2,'{}','security-submitted-cancel');
END;
$test$;
ROLLBACK;
SELECT 'EVIDENCE transfer security: strict strings/precision/keys/duplicates; frozen identity; tenant/actor/manage/approve/stock ACL; no project dependency; flags/stopped warehouse history/replay; terminal guards; directional SKU FK; page bounds';
