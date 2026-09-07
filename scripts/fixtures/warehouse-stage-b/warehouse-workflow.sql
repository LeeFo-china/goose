BEGIN;
DO $test$
DECLARE
  t uuid := gen_random_uuid(); u uuid := gen_random_uuid(); e uuid := gen_random_uuid();
  w uuid := gen_random_uuid(); p uuid := gen_random_uuid(); b uuid := gen_random_uuid();
  s uuid := gen_random_uuid(); r uuid := gen_random_uuid(); c uuid := gen_random_uuid();
  brand uuid := gen_random_uuid(); unit_id uuid := gen_random_uuid(); cost uuid := gen_random_uuid();
  product uuid := gen_random_uuid(); sku uuid := gen_random_uuid();
  legacy_batch uuid := gen_random_uuid(); other_warehouse uuid := gen_random_uuid();
  reviewer_user uuid := gen_random_uuid(); reviewer uuid := gen_random_uuid();
  order_id uuid; role_name text; task_id uuid; instance_id uuid; v_context jsonb; list_count integer;
  permissions text[] := ARRAY['supplier.purchase-requisition.approve','supplier.purchase-requisition.view','inventory.warehouse.view'];
  result jsonb; items jsonb;
BEGIN
  INSERT INTO public.tenants(id,name,slug) VALUES (t,'Draft fixture','stage-b-draft');
  INSERT INTO auth.users(id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data)
    VALUES (u,'authenticated','authenticated','stage-b-draft@smoke.invalid','','{}','{}');
  INSERT INTO public.employees(id,tenant_id,user_id,name,status) VALUES(e,t,u,'Applicant','active');
  INSERT INTO public.projects(id,tenant_id,name,status) VALUES(p,t,'Legacy project','designing');
  INSERT INTO public.warehouses(id,tenant_id,name) VALUES(w,t,'Warehouse');
  INSERT INTO public.warehouses(id,tenant_id,name) VALUES(other_warehouse,t,'Other warehouse');
  INSERT INTO public.tenant_supplier_settings(tenant_id,module_enabled,require_active_contract_for_new_order,
    ownership_reads_enabled,private_supplier_writes_enabled,private_catalog_writes_enabled,
    procurement_snapshot_v1_enabled,purchase_batch_workflow_enabled,warehouse_procurement_enabled,
    enabled_by_employee_id,enabled_at)
    VALUES(t,true,false,true,true,true,true,true,true,e,now()) ON CONFLICT(tenant_id) DO UPDATE SET
      module_enabled=true, require_active_contract_for_new_order=false,
      enabled_by_employee_id=e,enabled_at=now(),
      ownership_reads_enabled=true,private_supplier_writes_enabled=true,private_catalog_writes_enabled=true,
      procurement_snapshot_v1_enabled=true,purchase_batch_workflow_enabled=true,warehouse_procurement_enabled=true;
  INSERT INTO public.finance_cost_categories(id,tenant_id,code,name) VALUES(cost,t,'stage-b-cost','Material');
  INSERT INTO public.catalog_categories(id,code,name,full_name,level,created_by_employee_id,updated_by_employee_id)
    VALUES(c,'STAGE-B-CATEGORY','Material','Material',1,e,e);
  INSERT INTO public.catalog_brands(id,code,name,created_by_employee_id,updated_by_employee_id)
    VALUES(brand,'STAGE-B-BRAND','Brand',e,e);
  INSERT INTO public.catalog_units(id,code,name,symbol,created_by_employee_id,updated_by_employee_id)
    VALUES(unit_id,'STAGE-B-UNIT','Piece','pc',e,e);
  INSERT INTO public.suppliers(id,code,name,legal_name,supplier_type,ownership_scope,owner_tenant_id,
    onboarding_status,operational_status,reviewed_by_employee_id,reviewed_at,created_by_employee_id,updated_by_employee_id)
    VALUES(s,'STAGE-B-SUPPLIER','Supplier','Supplier','manufacturer','tenant',t,'approved','active',e,now(),e,e);
  INSERT INTO public.tenant_suppliers(id,tenant_id,supplier_id,relationship_status,default_currency,
    internal_supplier_code,started_at,created_by_employee_id,updated_by_employee_id)
    VALUES(r,t,s,'active','CNY','STAGE-B-SUPPLIER',current_date,e,e);
  result := public.command_supplier_purchasable_product_v1(product,sku,t,r,s,
    jsonb_build_object('product_code','TP-' || left(replace(product::text,'-',''),16),'name','Material','category_id',c,'brand_id',brand),
    jsonb_build_object('sku_code','TS-' || left(replace(sku::text,'-',''),16),'name','Material','purchase_unit_id',unit_id,'spec_values','{}'::jsonb),
    '{"unit_price":"10.00","tax_rate":"0.130000","tax_inclusive":true}'::jsonb,u,e,'fixture-product');
  IF result->>'status' <> 'created' THEN RAISE EXCEPTION 'Fixture product failed: %',result; END IF;
  items := jsonb_build_array(jsonb_build_object('supplier_sku_id',sku,'cost_category_id',cost,'quantity','10'));
  result := public.save_supplier_purchase_batch_draft(b,t,NULL,0,'Warehouse replenishment',NULL,NULL,items,u,e,'warehouse-save','warehouse',w);
  IF result->>'status' <> 'saved' THEN RAISE EXCEPTION 'Warehouse draft failed: %',result; END IF;
  INSERT INTO auth.users(id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data)
    VALUES(reviewer_user,'authenticated','authenticated','stage-b-review@smoke.invalid','','{}','{}');
  INSERT INTO public.employees(id,tenant_id,user_id,name,status) VALUES(reviewer,t,reviewer_user,'Reviewer','active');

  INSERT INTO public.permissions(code,name,module,resource,action)
    SELECT code,code,'supplier','purchase-requisition','view' FROM unnest(ARRAY[
      'supplier.purchase-requisition.view','supplier.purchase-requisition.manage',
      'supplier.purchase-requisition.approve','inventory.warehouse.view','inventory.warehouse.manage'
    ]) AS code ON CONFLICT(code) DO NOTHING;
  INSERT INTO public.employee_permission_overrides(employee_id,permission_id,effect,access_scope)
    SELECT e,id,'allow','all' FROM public.permissions WHERE code IN (
      'supplier.purchase-requisition.manage','inventory.warehouse.manage');
  INSERT INTO public.employee_permission_overrides(employee_id,permission_id,effect,access_scope)
    SELECT reviewer,id,'allow','all' FROM public.permissions WHERE code IN (
      'supplier.purchase-requisition.view','supplier.purchase-requisition.approve','inventory.warehouse.view','inventory.warehouse.manage');
  -- Neither actor has project permissions. Applicant has ONLY the two manage
  -- permissions; reviewer has no procurement manage. Preserve distinct roles.
  PERFORM public.__gooes_ensure_supplier_purchase_batch_workflow_template(t);
  BEGIN
    UPDATE public.employee_permission_overrides SET effect='deny'
      WHERE employee_id=reviewer AND permission_id=(SELECT id FROM public.permissions WHERE code='inventory.warehouse.manage');
    PERFORM public.submit_supplier_purchase_batch_with_workflow(b,t,1,u,e,'no-warehouse-approver');
    RAISE EXCEPTION 'Warehouse submit accepted a candidate without warehouse manage';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN IF SQLERRM<>'SUPPLIER_PURCHASE_BATCH_NO_APPROVER' THEN RAISE; END IF;
  END;
  result := public.submit_supplier_purchase_batch_with_workflow(b,t,1,u,e,'warehouse-workflow-submit');
  IF result->>'status'<>'submitted' OR result->'batch'->>'budget_status'<>'not_applicable' THEN
    RAISE EXCEPTION 'Warehouse workflow submit failed: %',result;
  END IF;
  SELECT instance.id,task.id,instance.context INTO STRICT instance_id,task_id,v_context
    FROM public.workflow_instances AS instance JOIN public.workflow_tasks AS task ON task.instance_id=instance.id
    WHERE instance.tenant_id=t AND instance.subject_id=b::text AND task.status='pending';
  IF v_context->>'destination_type'<>'warehouse' OR v_context->>'warehouse_id'<>w::text
    OR v_context->'project_id'<>'null'::jsonb OR v_context->>'warehouse_name'<>'Warehouse' THEN
    RAISE EXCEPTION 'Warehouse workflow destination was not frozen: %',v_context;
  END IF;
  SELECT count(*) INTO list_count FROM public.list_accessible_supplier_purchase_batch_workflow_tasks(
    t,reviewer,'{}'::text[],permissions,'{}'::uuid[],'pending',b::text,1,20) AS listed
    WHERE listed.id=task_id AND listed.instance->'context'=v_context;
  IF list_count<>1 THEN RAISE EXCEPTION 'Warehouse pending task missing without project scope'; END IF;
  SELECT count(*) INTO list_count FROM public.list_accessible_supplier_purchase_batch_workflow_tasks(
    t,reviewer,'{}'::text[],permissions,'{}'::uuid[],'pending',b::text,2,1) AS listed
    WHERE listed.id IS NULL AND listed.total_count=1;
  IF list_count<>1 THEN RAISE EXCEPTION 'Warehouse pagination lost out-of-range total sentinel'; END IF;
  SELECT count(*) INTO list_count FROM public.list_accessible_supplier_purchase_batch_workflow_tasks(
    t,reviewer,'{}'::text[],ARRAY['supplier.purchase-requisition.approve','supplier.purchase-requisition.view'],NULL,'pending',b::text,1,20)
    AS listed WHERE listed.id IS NOT NULL;
  IF list_count<>0 THEN RAISE EXCEPTION 'Warehouse task leaked without warehouse view'; END IF;
  BEGIN
    UPDATE public.employee_permission_overrides SET effect='deny'
      WHERE employee_id=reviewer AND permission_id=(SELECT id FROM public.permissions WHERE code='inventory.warehouse.manage');
    PERFORM public.complete_supplier_purchase_batch_workflow_task(t,b,task_id,'approve',NULL,'{}',reviewer_user,reviewer,'denied-review');
    RAISE EXCEPTION 'Warehouse review bypassed explicit deny';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN IF SQLERRM<>'FORBIDDEN' THEN RAISE; END IF;
  END;
  BEGIN
    UPDATE public.tenant_supplier_settings SET warehouse_procurement_enabled=false WHERE tenant_id=t;
    PERFORM public.complete_supplier_purchase_batch_workflow_task(t,b,task_id,'approve',NULL,'{}',reviewer_user,reviewer,'closed-review');
    RAISE EXCEPTION 'Warehouse review bypassed closed gate';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN IF SQLERRM<>'WAREHOUSE_PROCUREMENT_NOT_ENABLED' THEN RAISE; END IF;
  END;

  BEGIN
    result := public.withdraw_supplier_purchase_batch_workflow(t,b,2,'Revise destination',u,e,'warehouse-withdraw');
    IF result->>'status'<>'withdrawn' THEN RAISE EXCEPTION 'Warehouse withdraw failed: %',result; END IF;
    result := public.save_supplier_purchase_batch_draft(b,t,p,3,'Project revision',NULL,NULL,items,u,e,'after-withdraw');
    IF result->>'status'<>'saved' THEN RAISE EXCEPTION 'Destination revision failed: %',result; END IF;
    SELECT count(*) INTO list_count FROM public.list_accessible_supplier_purchase_batch_workflow_tasks(
      t,reviewer,'{}'::text[],permissions,'{}'::uuid[],'canceled',b::text,1,20) AS listed
      WHERE listed.id=task_id AND listed.instance->'context'=v_context;
    IF list_count<>1 THEN RAISE EXCEPTION 'Historical warehouse task used current project scope'; END IF;
    SELECT count(*) INTO list_count FROM public.list_accessible_workflow_tasks_with_supplier_scope(
      t,reviewer,'{}'::text[],permissions,'canceled','supplier_purchase_batch',b::text,NULL,true,reviewer,'{}'::uuid[],1,20)
      AS listed WHERE listed.id=task_id AND listed.instance->'context'=v_context;
    IF list_count<>1 THEN RAISE EXCEPTION 'Mixed historical warehouse task used current project scope'; END IF;
    RAISE EXCEPTION USING ERRCODE='P9001',MESSAGE='rollback withdrawal branch';
  EXCEPTION WHEN SQLSTATE 'P9001' THEN NULL;
  END;

  BEGIN
    result := public.complete_supplier_purchase_batch_workflow_task(t,b,task_id,'reject','Revise order','{}',reviewer_user,reviewer,'warehouse-reject-replay');
    IF result->>'status'<>'rejected' THEN RAISE EXCEPTION 'Warehouse workflow rejection failed: %',result; END IF;
    result := public.save_supplier_purchase_batch_draft(b,t,p,3,'New project draft',NULL,NULL,items,u,e,'rejected-destination-change');
    IF result->>'status'<>'saved' THEN RAISE EXCEPTION 'Rejected destination revision failed: %',result; END IF;
    result := public.complete_supplier_purchase_batch_workflow_task(t,b,task_id,'reject','Revise order','{}',reviewer_user,reviewer,'warehouse-reject-replay');
    IF result->>'idempotent'<>'true' OR result->'batch'->>'destination_type'<>'warehouse' THEN
      RAISE EXCEPTION 'Historical warehouse replay used the new project: %',result;
    END IF;
    SELECT count(*) INTO list_count FROM public.list_accessible_supplier_purchase_batch_workflow_tasks(
      t,reviewer,'{}'::text[],ARRAY['supplier.purchase-requisition.approve','supplier.purchase-requisition.view'],NULL,'completed',b::text,1,20)
      AS listed WHERE listed.id IS NOT NULL;
    IF list_count<>0 THEN RAISE EXCEPTION 'Project reader saw historical warehouse task'; END IF;
    RAISE EXCEPTION USING ERRCODE='P9001',MESSAGE='rollback rejection branch';
  EXCEPTION WHEN SQLSTATE 'P9001' THEN NULL;
  END;

  result := public.complete_supplier_purchase_batch_workflow_task(t,b,task_id,'approve',NULL,'{}',reviewer_user,reviewer,'warehouse-workflow-review');
  IF result->>'status'<>'ordered' OR result->'workflow_state'->>'instance_status'<>'completed'
    OR result->'workflow_state'->>'current_node_key'<>'approved_end' THEN
    RAISE EXCEPTION 'Warehouse workflow approval did not finish: %',result;
  END IF;
  IF EXISTS(SELECT 1 FROM public.project_cost_commitments WHERE tenant_id=t)
    OR EXISTS(SELECT 1 FROM public.project_cost_events WHERE tenant_id=t)
    OR (SELECT count(*) FROM public.supplier_purchase_orders WHERE purchase_batch_id=b AND destination_type='warehouse' AND warehouse_id=w AND project_id IS NULL AND status='submitted')<>1 THEN
    RAISE EXCEPTION 'Warehouse workflow accounting mismatch';
  END IF;
  UPDATE public.tenant_supplier_settings SET warehouse_procurement_enabled=false WHERE tenant_id=t;
  result := public.complete_supplier_purchase_batch_workflow_task(t,b,task_id,'approve',NULL,'{}',reviewer_user,reviewer,'warehouse-workflow-review');
  IF result->>'idempotent'<>'true' THEN RAISE EXCEPTION 'Frozen warehouse review replay failed'; END IF;
  BEGIN
    UPDATE public.employee_permission_overrides SET effect='deny'
      WHERE employee_id=reviewer AND permission_id=(SELECT id FROM public.permissions WHERE code='inventory.warehouse.manage');
    PERFORM public.complete_supplier_purchase_batch_workflow_task(t,b,task_id,'approve',NULL,'{}',reviewer_user,reviewer,'warehouse-workflow-review');
    RAISE EXCEPTION 'Warehouse replay bypassed frozen permissions';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN IF SQLERRM<>'FORBIDDEN' THEN RAISE; END IF;
  END;

  -- Reverse history boundary: a project approval remains project-scoped after
  -- its rejected draft is changed to warehouse replenishment.
  UPDATE public.tenant_supplier_settings SET warehouse_procurement_enabled=true WHERE tenant_id=t;
  INSERT INTO public.permissions(code,name,module,resource,action)
    VALUES('project.read','Project read','project','project','read') ON CONFLICT(code) DO NOTHING;
  INSERT INTO public.employee_permission_overrides(employee_id,permission_id,effect,access_scope)
    SELECT reviewer,id,'allow','all' FROM public.permissions WHERE code='project.read';
  INSERT INTO public.project_cost_budgets(tenant_id,project_id,cost_category_id,budget_amount,created_by,updated_by)
    VALUES(t,p,cost,10000,e,e);
  result := public.save_supplier_purchase_batch_draft(legacy_batch,t,p,0,'Project history',NULL,NULL,items,u,e,'legacy-history-save');
  IF result->>'status'<>'saved' THEN RAISE EXCEPTION 'Project history draft failed: %',result; END IF;
  result := public.submit_supplier_purchase_batch_with_workflow(legacy_batch,t,1,u,e,'legacy-history-submit');
  IF result->>'status'<>'submitted' THEN RAISE EXCEPTION 'Project history submit failed: %',result; END IF;
  SELECT task.id INTO STRICT task_id FROM public.workflow_tasks AS task JOIN public.workflow_instances AS instance ON instance.id=task.instance_id
    WHERE instance.tenant_id=t AND instance.subject_id=legacy_batch::text AND task.status='pending';
  result := public.complete_supplier_purchase_batch_workflow_task(t,legacy_batch,task_id,'reject','Change destination','{}',reviewer_user,reviewer,'legacy-history-reject');
  IF result->>'status'<>'rejected' THEN RAISE EXCEPTION 'Project history reject failed: %',result; END IF;
  result := public.save_supplier_purchase_batch_draft(legacy_batch,t,NULL,3,'Warehouse revision',NULL,NULL,items,u,e,'legacy-history-change','warehouse',w);
  IF result->>'status'<>'saved' THEN RAISE EXCEPTION 'Project to warehouse revision failed: %',result; END IF;
  SELECT count(*) INTO list_count FROM public.list_accessible_supplier_purchase_batch_workflow_tasks(
    t,reviewer,'{}'::text[],permissions,'{}'::uuid[],'completed',legacy_batch::text,1,20) AS listed WHERE listed.id IS NOT NULL;
  IF list_count<>0 THEN RAISE EXCEPTION 'Warehouse scope leaked historical project task'; END IF;
  SELECT count(*) INTO list_count FROM public.list_accessible_workflow_tasks_with_supplier_scope(
    t,reviewer,'{}'::text[],permissions,'completed','supplier_purchase_batch',legacy_batch::text,NULL,true,reviewer,'{}'::uuid[],1,20)
    AS listed WHERE listed.id IS NOT NULL;
  IF list_count<>0 THEN RAISE EXCEPTION 'Mixed warehouse scope leaked historical project task'; END IF;
  SELECT count(*) INTO list_count FROM public.list_accessible_supplier_purchase_batch_workflow_tasks(
    t,reviewer,'{}'::text[],ARRAY['supplier.purchase-requisition.approve','supplier.purchase-requisition.view'],ARRAY[p],'completed',legacy_batch::text,1,20)
    AS listed WHERE listed.id=task_id AND listed.instance->'context'->>'project_id'=p::text;
  IF list_count<>1 THEN RAISE EXCEPTION 'Authorized historical project task disappeared'; END IF;
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
    IF has_function_privilege(role_name,'public.__gooes_has_tenant_procurement_permission(uuid,uuid,text)','EXECUTE')
      OR has_function_privilege(role_name,'public.__gooes_assert_warehouse_workflow_actor(uuid,uuid,uuid,jsonb,text)','EXECUTE') THEN
      RAISE EXCEPTION 'Private workflow permission helper exposed to %',role_name;
    END IF;
  END LOOP;
END;
$test$;
ROLLBACK;
