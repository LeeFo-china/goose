-- Stocktake read model contract and behavior. Depends on stocktake-workflow.sql.
DO $$
DECLARE signature text; role_name text;
BEGIN
  FOREACH signature IN ARRAY ARRAY[
    'get_warehouse_stocktake_settings(uuid,uuid,uuid)',
    'get_warehouse_stocktake_order(uuid,uuid,uuid,uuid)',
    'list_warehouse_stocktake_orders(uuid,uuid,uuid,uuid,text,text,integer,integer)',
    'list_warehouse_stocktake_order_items(uuid,uuid,uuid,uuid,integer,integer)'
  ] LOOP
    IF to_regprocedure('public.'||signature) IS NULL THEN
      RAISE EXCEPTION 'Missing stocktake read RPC: %',signature;
    END IF;
    FOREACH role_name IN ARRAY ARRAY['public','anon','authenticated'] LOOP
      IF has_function_privilege(role_name,'public.'||signature,'EXECUTE') THEN
        RAISE EXCEPTION 'Stocktake read RPC leaked to %: %',role_name,signature;
      END IF;
    END LOOP;
    IF NOT has_function_privilege('service_role','public.'||signature,'EXECUTE') THEN
      RAISE EXCEPTION 'Stocktake read RPC unavailable to service_role: %',signature;
    END IF;
  END LOOP;
END;
$$;

BEGIN;
CREATE TEMP TABLE stocktake_wire_evidence(payload jsonb);
DO $test$
DECLARE f public.stage_d2_fixture%ROWTYPE; result jsonb; order_id uuid; completed_id uuid; draft_id uuid:=gen_random_uuid();
  completed_summary jsonb; completed_items jsonb; draft_summary jsonb; draft_items jsonb; mixed_id uuid; noop_id uuid;
  foreign_tenant uuid:=gen_random_uuid(); foreign_user uuid:=gen_random_uuid(); foreign_employee uuid:=gen_random_uuid();
BEGIN
  SELECT * INTO STRICT f FROM public.stage_d2_fixture;
  PERFORM set_config('request.jwt.claim.role','service_role',true);
  SELECT id INTO STRICT completed_id FROM public.warehouse_stocktake_orders
    WHERE tenant_id=f.tenant_id AND status='completed' ORDER BY created_at,id LIMIT 1;
  SELECT o.id INTO STRICT mixed_id FROM public.warehouse_stocktake_orders o
    WHERE o.tenant_id=f.tenant_id AND o.status='completed'
      AND (SELECT count(*) FROM public.warehouse_stocktake_order_items i WHERE i.stocktake_order_id=o.id)=3;
  SELECT o.id INTO STRICT noop_id FROM public.warehouse_stocktake_orders o
    WHERE o.tenant_id=f.tenant_id AND o.status='completed'
      AND NOT EXISTS(SELECT 1 FROM public.warehouse_stocktake_order_items i
        WHERE i.stocktake_order_id=o.id AND i.difference_quantity<>0) LIMIT 1;
  SELECT id INTO STRICT order_id FROM public.warehouse_stocktake_orders
    WHERE tenant_id=f.tenant_id ORDER BY created_at DESC,id DESC LIMIT 1;

  result:=public.get_warehouse_stocktake_order(f.tenant_id,completed_id,f.actor_user_id,f.actor_employee_id);
  IF result->>'warehouse_name' IS NULL OR result->>'item_count' IS NULL
    OR result->>'counted_count' IS NULL OR result->>'difference_count' IS NULL
    OR result ? 'total_amount' OR result ? 'net_amount'
    OR jsonb_typeof(result->'gain_amount') IS DISTINCT FROM 'string'
    OR jsonb_typeof(result->'loss_amount') IS DISTINCT FROM 'string' THEN
    RAISE EXCEPTION 'Stocktake completed summary mismatch: %',result;
  END IF;
  result:=public.get_warehouse_stocktake_order(f.tenant_id,mixed_id,f.actor_user_id,f.actor_employee_id);
  completed_summary:=result;
  IF result->>'item_count' IS DISTINCT FROM '3' OR result->>'counted_count' IS DISTINCT FROM '3'
    OR result->>'difference_count' IS DISTINCT FROM '2' OR result->>'gain_amount' IS DISTINCT FROM '15.00'
    OR result->>'loss_amount' IS DISTINCT FROM '0.01' THEN
    RAISE EXCEPTION 'Stocktake mixed gain/loss summary mismatch: %',result;
  END IF;
  result:=public.get_warehouse_stocktake_order(f.tenant_id,noop_id,f.actor_user_id,f.actor_employee_id);
  IF result->>'difference_count' IS DISTINCT FROM '0' OR result->>'gain_amount' IS DISTINCT FROM '0.00'
    OR result->>'loss_amount' IS DISTINCT FROM '0.00' THEN
    RAISE EXCEPTION 'Stocktake completed zero-side summary mismatch: %',result;
  END IF;

  result:=public.list_warehouse_stocktake_order_items(f.tenant_id,mixed_id,f.actor_user_id,f.actor_employee_id,1,20);
  completed_items:=result;
  IF result->>'total' IS DISTINCT FROM '3' OR jsonb_array_length(result->'items') IS DISTINCT FROM 3
    OR jsonb_typeof(result->'items'->0->'book_quantity') IS DISTINCT FROM 'string'
    OR jsonb_typeof(result->'items'->0->'book_value') IS DISTINCT FROM 'string'
    OR jsonb_typeof(result->'items'->0->'book_unit_cost') IS DISTINCT FROM 'string'
    OR jsonb_typeof(result->'items'->0->'counted_quantity') IS DISTINCT FROM 'string'
    OR jsonb_typeof(result->'items'->0->'difference_quantity') IS DISTINCT FROM 'string'
    OR jsonb_typeof(result->'items'->0->'unit_cost') IS DISTINCT FROM 'string'
    OR jsonb_typeof(result->'items'->0->'amount') IS DISTINCT FROM 'string'
    OR result->'items'->0->>'sku_name' IS NULL OR result->'items'->0->>'sku_code' IS NULL THEN
    RAISE EXCEPTION 'Stocktake item wire model mismatch: %',result;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(result->'items') x
      WHERE x->>'supplier_sku_id'=f.sku_id::text AND x->>'book_quantity'='0.3000'
        AND x->>'book_value'='0.02' AND x->>'book_unit_cost'='0.0667'
        AND x->>'counted_quantity'='0.2000' AND x->>'difference_quantity'='-0.1000'
        AND x->>'unit_cost'='0.0667' AND x->>'amount'='0.01')
    OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(result->'items') x
      WHERE x->>'supplier_sku_id'=f.second_sku_id::text AND x->>'difference_quantity'='1.0000'
        AND x->>'amount'='15.00')
    OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(result->'items') x
      WHERE x->>'supplier_sku_id'=f.missing_sku_id::text AND x->>'counted_quantity'='0.0000'
        AND x->>'difference_quantity'='0.0000' AND x->>'amount'='0.00') THEN
    RAISE EXCEPTION 'Stocktake exact signed item values mismatch: %',result;
  END IF;
  result:=public.list_warehouse_stocktake_order_items(f.tenant_id,order_id,f.actor_user_id,f.actor_employee_id,99,20);
  IF result->'items' IS DISTINCT FROM '[]'::jsonb OR coalesce((result->>'total')::integer,0)<1 THEN RAISE EXCEPTION 'Stocktake empty item page lost total: %',result; END IF;

  PERFORM public.stage_d2_command(draft_id,'save_draft',0,public.stage_d2_draft(ARRAY[f.sku_id]),'stocktake-read-draft');
  draft_summary:=public.get_warehouse_stocktake_order(f.tenant_id,draft_id,f.actor_user_id,f.actor_employee_id);
  draft_items:=public.list_warehouse_stocktake_order_items(f.tenant_id,draft_id,f.actor_user_id,f.actor_employee_id);
  IF draft_summary->'gain_amount' IS DISTINCT FROM 'null'::jsonb OR draft_summary->'loss_amount' IS DISTINCT FROM 'null'::jsonb
    OR draft_items->'items'->0->'book_quantity' IS DISTINCT FROM 'null'::jsonb
    OR draft_items->'items'->0->'counted_quantity' IS DISTINCT FROM 'null'::jsonb
    OR draft_items->'items'->0->'difference_quantity' IS DISTINCT FROM 'null'::jsonb THEN
    RAISE EXCEPTION 'Draft NULL snapshot mismatch: %, %',draft_summary,draft_items;
  END IF;
  INSERT INTO stocktake_wire_evidence VALUES(jsonb_build_object('completedSummary',completed_summary,
    'completedItems',completed_items,'draftSummary',draft_summary,'draftItems',draft_items));

  result:=public.list_warehouse_stocktake_orders(f.tenant_id,f.actor_user_id,f.actor_employee_id,NULL,NULL,
    completed_summary->>'order_no',1,20);
  IF (SELECT x FROM jsonb_array_elements(result->'items') x WHERE x->>'id'=mixed_id::text)
      IS DISTINCT FROM completed_summary THEN RAISE EXCEPTION 'Completed list/get projection mismatch: %',result; END IF;
  result:=public.list_warehouse_stocktake_orders(f.tenant_id,f.actor_user_id,f.actor_employee_id,NULL,NULL,
    draft_summary->>'order_no',1,20);
  IF (SELECT x FROM jsonb_array_elements(result->'items') x WHERE x->>'id'=draft_id::text)
      IS DISTINCT FROM draft_summary THEN RAISE EXCEPTION 'Draft list/get projection mismatch: %',result; END IF;

  result:=public.list_warehouse_stocktake_orders(f.tenant_id,f.actor_user_id,f.actor_employee_id,NULL,NULL,NULL,99,20);
  IF result->'items' IS DISTINCT FROM '[]'::jsonb OR coalesce((result->>'total')::integer,0)<1 THEN RAISE EXCEPTION 'Stocktake empty order page lost total: %',result; END IF;
  result:=public.list_warehouse_stocktake_orders(f.tenant_id,f.actor_user_id,f.actor_employee_id,NULL,NULL,NULL,NULL,NULL);
  IF result->>'page' IS DISTINCT FROM '1' OR result->>'pageSize' IS DISTINCT FROM '20' THEN RAISE EXCEPTION 'Stocktake paging defaults mismatch: %',result; END IF;
  result:=public.list_warehouse_stocktake_orders(f.tenant_id,f.actor_user_id,f.actor_employee_id,NULL,NULL,NULL,1,100);
  IF result->>'pageSize' IS DISTINCT FROM '100' THEN RAISE EXCEPTION 'Stocktake max page size mismatch: %',result; END IF;
  result:=public.list_warehouse_stocktake_orders(f.tenant_id,f.actor_user_id,f.actor_employee_id,f.warehouse_id,'completed','盘点',1,100);
  IF (result->>'total')::integer<1 OR EXISTS(SELECT 1 FROM jsonb_array_elements(result->'items') x
    WHERE x->>'warehouse_id' IS DISTINCT FROM f.warehouse_id::text OR x->>'status' IS DISTINCT FROM 'completed') THEN
    RAISE EXCEPTION 'Stocktake filters mismatch: %',result;
  END IF;
  IF (public.list_warehouse_stocktake_orders(f.tenant_id,f.actor_user_id,f.actor_employee_id,NULL,NULL,'  ',1,20)->>'total')
      IS DISTINCT FROM (public.list_warehouse_stocktake_orders(f.tenant_id,f.actor_user_id,f.actor_employee_id)->>'total')
    OR public.list_warehouse_stocktake_orders(f.tenant_id,f.actor_user_id,f.actor_employee_id,NULL,NULL,repeat('😀',50),1,20) IS NULL THEN
    RAISE EXCEPTION 'Stocktake trimmed/UTF-16 keyword boundary';
  END IF;

  PERFORM public.stage_d_transfer_expect_error(format('SELECT public.get_warehouse_stocktake_order(%L,%L,%L,%L)',
    f.tenant_id,gen_random_uuid(),f.actor_user_id,f.actor_employee_id),'WAREHOUSE_STOCKTAKE_NOT_FOUND');
  PERFORM public.stage_d_transfer_expect_error(format('SELECT public.get_warehouse_stocktake_order(%L,%L,%L,%L)',
    f.tenant_id,completed_id,gen_random_uuid(),f.actor_employee_id),'WAREHOUSE_STOCKTAKE_ACTOR_INVALID');
  PERFORM public.stage_d_transfer_expect_error(format('SELECT public.list_warehouse_stocktake_orders(%L,%L,%L,NULL,''bogus'')',
    f.tenant_id,f.actor_user_id,f.actor_employee_id),'WAREHOUSE_STOCKTAKE_INVALID');
  PERFORM public.stage_d_transfer_expect_error(format('SELECT public.list_warehouse_stocktake_orders(%L,%L,%L,NULL,NULL,%L)',
    f.tenant_id,f.actor_user_id,f.actor_employee_id,repeat('x',101)),'WAREHOUSE_STOCKTAKE_INVALID');
  PERFORM public.stage_d_transfer_expect_error(format('SELECT public.list_warehouse_stocktake_orders(%L,%L,%L,NULL,NULL,%L)',
    f.tenant_id,f.actor_user_id,f.actor_employee_id,repeat('😀',51)),'WAREHOUSE_STOCKTAKE_INVALID');
  PERFORM public.stage_d_transfer_expect_error(format('SELECT public.list_warehouse_stocktake_order_items(%L,%L,%L,%L,0,20)',
    f.tenant_id,completed_id,f.actor_user_id,f.actor_employee_id),'WAREHOUSE_STOCKTAKE_INVALID');
  PERFORM public.stage_d_transfer_expect_error(format('SELECT public.list_warehouse_stocktake_orders(%L,%L,%L,NULL,NULL,NULL,1,101)',
    f.tenant_id,f.actor_user_id,f.actor_employee_id),'WAREHOUSE_STOCKTAKE_INVALID');

  -- Settings accepts each actual stocktake role, while cost-bearing reads require stock.view.
  UPDATE public.employee_permission_overrides SET effect='deny' WHERE employee_id=f.actor_employee_id
    AND permission_id IN (SELECT id FROM public.permissions WHERE code IN ('inventory.stock.view','inventory.stocktake.approve'));
  IF public.get_warehouse_stocktake_settings(f.tenant_id,f.actor_user_id,f.actor_employee_id) IS NULL THEN RAISE EXCEPTION 'Manage-only settings'; END IF;
  PERFORM public.stage_d_transfer_expect_error(format('SELECT public.get_warehouse_stocktake_order(%L,%L,%L,%L)',
    f.tenant_id,completed_id,f.actor_user_id,f.actor_employee_id),'WAREHOUSE_STOCKTAKE_FORBIDDEN');
  UPDATE public.employee_permission_overrides SET effect='deny' WHERE employee_id=f.actor_employee_id
    AND permission_id=(SELECT id FROM public.permissions WHERE code='inventory.stocktake.manage');
  UPDATE public.employee_permission_overrides SET effect='allow' WHERE employee_id=f.actor_employee_id
    AND permission_id=(SELECT id FROM public.permissions WHERE code='inventory.stocktake.approve');
  IF public.get_warehouse_stocktake_settings(f.tenant_id,f.actor_user_id,f.actor_employee_id) IS NULL THEN RAISE EXCEPTION 'Approve-only settings'; END IF;
  UPDATE public.employee_permission_overrides SET effect='deny' WHERE employee_id=f.actor_employee_id
    AND permission_id=(SELECT id FROM public.permissions WHERE code='inventory.stocktake.approve');
  PERFORM public.stage_d_transfer_expect_error(format('SELECT public.get_warehouse_stocktake_settings(%L,%L,%L)',
    f.tenant_id,f.actor_user_id,f.actor_employee_id),'WAREHOUSE_STOCKTAKE_FORBIDDEN');
  UPDATE public.employee_permission_overrides SET effect='allow' WHERE employee_id=f.actor_employee_id
    AND permission_id IN (SELECT id FROM public.permissions WHERE code IN ('inventory.stock.view','inventory.stocktake.manage','inventory.stocktake.approve'));

  UPDATE public.employees SET status='suspended' WHERE id=f.actor_employee_id;
  PERFORM public.stage_d_transfer_expect_error(format('SELECT public.get_warehouse_stocktake_settings(%L,%L,%L)',
    f.tenant_id,f.actor_user_id,f.actor_employee_id),'WAREHOUSE_STOCKTAKE_ACTOR_INVALID');
  UPDATE public.employees SET status='active' WHERE id=f.actor_employee_id;

  UPDATE public.tenant_supplier_settings SET warehouse_stocktakes_enabled=false WHERE tenant_id=f.tenant_id;
  UPDATE public.warehouses SET status='inactive' WHERE id=f.warehouse_id;
  PERFORM public.get_warehouse_stocktake_order(f.tenant_id,completed_id,f.actor_user_id,f.actor_employee_id);
  PERFORM public.list_warehouse_stocktake_orders(f.tenant_id,f.actor_user_id,f.actor_employee_id);
  PERFORM public.list_warehouse_stocktake_order_items(f.tenant_id,completed_id,f.actor_user_id,f.actor_employee_id);
  IF public.get_warehouse_stocktake_settings(f.tenant_id,f.actor_user_id,f.actor_employee_id)->>'warehouse_stocktakes_enabled' IS DISTINCT FROM 'false' THEN
    RAISE EXCEPTION 'Disabled stocktake setting remained effective';
  END IF;
  UPDATE public.tenant_supplier_settings SET warehouse_stocktakes_enabled=false,warehouse_transfers_enabled=false,
    warehouse_materials_enabled=false,warehouse_procurement_enabled=false,purchase_batch_workflow_enabled=false,
    procurement_snapshot_v1_enabled=false,private_catalog_writes_enabled=false,private_supplier_writes_enabled=false,
    ownership_reads_enabled=false,module_enabled=false WHERE tenant_id=f.tenant_id;
  IF public.get_warehouse_stocktake_settings(f.tenant_id,f.actor_user_id,f.actor_employee_id)->>'warehouse_stocktakes_enabled' IS DISTINCT FROM 'false' THEN
    RAISE EXCEPTION 'Closed parent module remained effective';
  END IF;
  PERFORM public.get_warehouse_stocktake_order(f.tenant_id,completed_id,f.actor_user_id,f.actor_employee_id);
  PERFORM public.list_warehouse_stocktake_orders(f.tenant_id,f.actor_user_id,f.actor_employee_id);
  PERFORM public.list_warehouse_stocktake_order_items(f.tenant_id,completed_id,f.actor_user_id,f.actor_employee_id);

  INSERT INTO public.tenants(id,name,slug) VALUES(foreign_tenant,'Foreign stocktake tenant','foreign-stocktake-'||left(foreign_tenant::text,8));
  INSERT INTO auth.users(id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data)
    VALUES(foreign_user,'authenticated','authenticated','foreign-stocktake@smoke.invalid','','{}','{}');
  INSERT INTO public.employees(id,tenant_id,user_id,name,status) VALUES(foreign_employee,foreign_tenant,foreign_user,'Foreign stocktake','active');
  INSERT INTO public.employee_permission_overrides(employee_id,permission_id,effect,access_scope)
    SELECT foreign_employee,p.id,'allow','all' FROM public.permissions p WHERE p.code='inventory.stock.view';
  PERFORM public.stage_d_transfer_expect_error(format('SELECT public.get_warehouse_stocktake_order(%L,%L,%L,%L)',
    foreign_tenant,completed_id,foreign_user,foreign_employee),'WAREHOUSE_STOCKTAKE_NOT_FOUND');
  PERFORM public.stage_d_transfer_expect_error(format('SELECT public.list_warehouse_stocktake_order_items(%L,%L,%L,%L)',
    foreign_tenant,completed_id,foreign_user,foreign_employee),'WAREHOUSE_STOCKTAKE_NOT_FOUND');
END;
$test$;
SELECT 'EVIDENCE stocktake wire: '||payload::text FROM stocktake_wire_evidence;
ROLLBACK;
SELECT 'EVIDENCE stocktake reads: service-only ACL, summaries and decimal strings, filters/paging/validation, closed history, identity and tenant isolation';
