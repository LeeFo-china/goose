-- Only run through verify-warehouse-stage-b-database.ts: this fixture commits
-- synthetic seed rows so two isolated PostgreSQL sessions can share them.
-- No source business rows or existing database are modified.
CREATE EXTENSION IF NOT EXISTS dblink WITH SCHEMA extensions;
CREATE TABLE public.stage_b_workflow_lock_fixture(
  tenant_id uuid, batch_id uuid, actor_user_id uuid, actor_employee_id uuid,
  reviewer_user_id uuid, reviewer_employee_id uuid, task_id uuid
);
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
  order_id uuid; role_name text;
  result jsonb; items jsonb;
BEGIN
  INSERT INTO public.tenants(id,name,slug) VALUES (t,'Lock fixture','stage-b-lock');
  INSERT INTO auth.users(id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data)
    VALUES (u,'authenticated','authenticated','stage-b-lock@smoke.invalid','','{}','{}');
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
    VALUES(c,'STAGE-B-LOCK-CATEGORY','Material','Material',1,e,e);
  INSERT INTO public.catalog_brands(id,code,name,created_by_employee_id,updated_by_employee_id)
    VALUES(brand,'STAGE-B-LOCK-BRAND','Brand',e,e);
  INSERT INTO public.catalog_units(id,code,name,symbol,created_by_employee_id,updated_by_employee_id)
    VALUES(unit_id,'STAGE-B-LOCK-UNIT','Piece','pc',e,e);
  INSERT INTO public.suppliers(id,code,name,legal_name,supplier_type,ownership_scope,owner_tenant_id,
    onboarding_status,operational_status,reviewed_by_employee_id,reviewed_at,created_by_employee_id,updated_by_employee_id)
    VALUES(s,'STAGE-B-LOCK-SUPPLIER','Supplier','Supplier','manufacturer','tenant',t,'approved','active',e,now(),e,e);
  INSERT INTO public.tenant_suppliers(id,tenant_id,supplier_id,relationship_status,default_currency,
    internal_supplier_code,started_at,created_by_employee_id,updated_by_employee_id)
    VALUES(r,t,s,'active','CNY','STAGE-B-LOCK-SUPPLIER',current_date,e,e);
  result := public.command_supplier_purchasable_product_v1(product,sku,t,r,s,
    jsonb_build_object('product_code','TP-' || left(replace(product::text,'-',''),16),'name','Material','category_id',c,'brand_id',brand),
    jsonb_build_object('sku_code','TS-' || left(replace(sku::text,'-',''),16),'name','Material','purchase_unit_id',unit_id,'spec_values','{}'::jsonb),
    '{"unit_price":"10.00","tax_rate":"0.130000","tax_inclusive":true}'::jsonb,u,e,'fixture-product');
  IF result->>'status' <> 'created' THEN RAISE EXCEPTION 'Fixture product failed: %',result; END IF;
  items := jsonb_build_array(jsonb_build_object('supplier_sku_id',sku,'cost_category_id',cost,'quantity','10'));
  result := public.save_supplier_purchase_batch_draft(b,t,NULL,0,'Warehouse replenishment',NULL,NULL,items,u,e,'warehouse-save','warehouse',w);
  IF result->>'status' <> 'saved' THEN RAISE EXCEPTION 'Warehouse draft failed: %',result; END IF;
  INSERT INTO auth.users(id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data)
    VALUES(reviewer_user,'authenticated','authenticated','stage-b-lock-review@smoke.invalid','','{}','{}');
  INSERT INTO public.employees(id,tenant_id,user_id,name,status) VALUES(reviewer,t,reviewer_user,'Reviewer','active');

  INSERT INTO public.permissions(code,name,module,resource,action)
    VALUES ('project.read','Project read','project','project','read'),
      ('supplier.purchase-requisition.view','Procurement read','supplier','purchase-requisition','view'),
      ('supplier.purchase-requisition.approve','Procurement approve','supplier','purchase-requisition','approve')
    ON CONFLICT(code) DO NOTHING;
  INSERT INTO public.employee_permission_overrides(employee_id,permission_id,effect,access_scope)
    SELECT reviewer,id,'allow','all' FROM public.permissions
    WHERE code IN ('project.read','supplier.purchase-requisition.view','supplier.purchase-requisition.approve');
  INSERT INTO public.project_cost_budgets(tenant_id,project_id,cost_category_id,budget_amount,created_by,updated_by)
    VALUES(t,p,cost,10000,e,e);
  PERFORM public.__gooes_ensure_supplier_purchase_batch_workflow_template(t);
  result := public.save_supplier_purchase_batch_draft(legacy_batch,t,p,0,'Concurrent project regression',NULL,NULL,items,u,e,'project-save');
  IF result->>'status'<>'saved' THEN RAISE EXCEPTION 'Project draft failed: %',result; END IF;
  result := public.submit_supplier_purchase_batch_with_workflow(legacy_batch,t,1,u,e,'project-workflow-submit');
  IF result->>'status'<>'submitted' THEN RAISE EXCEPTION 'Project workflow submit failed: %',result; END IF;
  INSERT INTO public.stage_b_workflow_lock_fixture
    SELECT t,legacy_batch,u,e,reviewer_user,reviewer,task.id
    FROM public.workflow_tasks AS task JOIN public.workflow_instances AS instance ON instance.id=task.instance_id
    WHERE task.tenant_id=t AND instance.subject_id=legacy_batch::text AND task.status='pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'Project workflow did not create approval task'; END IF;
END;
$test$;
COMMIT;

DO $concurrency$
DECLARE
  fixture public.stage_b_workflow_lock_fixture%ROWTYPE;
  deadline timestamptz;
  v_command_status text;
BEGIN
  SELECT * INTO STRICT fixture FROM public.stage_b_workflow_lock_fixture;
  PERFORM extensions.dblink_connect('submit','host=/tmp dbname=postgres user=postgres application_name=stage-b-concurrent-submit');
  PERFORM extensions.dblink_connect('review','host=/tmp dbname=postgres user=postgres application_name=stage-b-concurrent-review');
  PERFORM extensions.dblink_exec('submit','SET statement_timeout=''8s''');
  PERFORM extensions.dblink_exec('review','SET statement_timeout=''8s''');
  PERFORM extensions.dblink_exec('submit','BEGIN');
  -- Stop a real submit at its first shared row lock. The review must wait for
  -- this lock WITHOUT owning the later batch advisory lock.
  PERFORM extensions.dblink_exec('submit',format(
    'DO $lock$ BEGIN PERFORM tenant_id FROM public.tenant_supplier_settings WHERE tenant_id=%L::uuid FOR UPDATE; END $lock$',
    fixture.tenant_id));
  IF extensions.dblink_send_query('review',format(
    $sql$DO $review$ DECLARE result jsonb; BEGIN
      result := public.complete_supplier_purchase_batch_workflow_task(
        %L::uuid,%L::uuid,%L::uuid,'approve',NULL,'{}'::jsonb,%L::uuid,%L::uuid,'concurrent-review');
      IF result->>'status'<>'ordered' THEN RAISE EXCEPTION 'Unexpected review result: %%',result; END IF;
    END $review$;$sql$,fixture.tenant_id,fixture.batch_id,fixture.task_id,fixture.reviewer_user_id,fixture.reviewer_employee_id))<>1
  THEN RAISE EXCEPTION 'Could not dispatch concurrent review'; END IF;
  deadline := clock_timestamp()+interval '4 seconds';
  LOOP
    PERFORM pg_stat_clear_snapshot();
    EXIT WHEN EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name='stage-b-concurrent-review' AND wait_event_type='Lock');
    IF extensions.dblink_is_busy('review')=0 OR clock_timestamp()>deadline THEN
      RAISE EXCEPTION 'Review did not reach its shared lock';
    END IF;
    PERFORM pg_sleep(0.01);
  END LOOP;

  -- Different key, same submitted project batch: the submit should promptly
  -- return STATE_CONFLICT, not deadlock with its in-flight reviewer.
  IF extensions.dblink_send_query('submit',format(
    $sql$DO $submit$ BEGIN
      PERFORM public.submit_supplier_purchase_batch_with_workflow(
        %L::uuid,%L::uuid,2,%L::uuid,%L::uuid,'concurrent-resubmit');
      RAISE EXCEPTION 'Submitted batch accepted another submit';
    EXCEPTION WHEN SQLSTATE 'P0001' THEN
      IF SQLERRM<>'SUPPLIER_PURCHASE_BATCH_STATE_CONFLICT' THEN RAISE; END IF;
    END $submit$;$sql$,fixture.batch_id,fixture.tenant_id,fixture.actor_user_id,fixture.actor_employee_id))<>1
  THEN RAISE EXCEPTION 'Could not dispatch concurrent submit'; END IF;
  -- dblink_get_result propagates SQLSTATE 40P01 if either real command deadlocks.
  SELECT command_status INTO v_command_status FROM extensions.dblink_get_result('submit') AS result(command_status text);
  IF v_command_status<>'DO' THEN RAISE EXCEPTION 'Concurrent submit did not finish: %',v_command_status; END IF;
  PERFORM * FROM extensions.dblink_get_result('submit') AS result(command_status text);
  PERFORM extensions.dblink_exec('submit','COMMIT');
  SELECT command_status INTO v_command_status FROM extensions.dblink_get_result('review') AS result(command_status text);
  IF v_command_status<>'DO' THEN RAISE EXCEPTION 'Concurrent review did not finish: %',v_command_status; END IF;
  PERFORM * FROM extensions.dblink_get_result('review') AS result(command_status text);
  PERFORM extensions.dblink_disconnect('submit');
  PERFORM extensions.dblink_disconnect('review');
  IF (SELECT count(*) FROM public.supplier_purchase_orders WHERE tenant_id=fixture.tenant_id AND purchase_batch_id=fixture.batch_id AND status='submitted')<>1 THEN
    RAISE EXCEPTION 'Concurrent review failed to create exactly one submitted order';
  END IF;
  IF (SELECT count(*) FROM public.project_cost_commitments WHERE tenant_id=fixture.tenant_id AND status='converted')<>1 THEN
    RAISE EXCEPTION 'Concurrent review broke project commitment conversion';
  END IF;
END;
$concurrency$;

DO $effective_lock_order$
DECLARE v_name text; v_definition text; settings_at integer; warehouse_at integer; batch_at integer;
BEGIN
  FOREACH v_name IN ARRAY ARRAY['complete_supplier_purchase_batch_workflow_task','__gooes_complete_supplier_purchase_batch_workflow_task_v1'] LOOP
    v_definition := pg_get_functiondef(('public.' || v_name || '(uuid,uuid,uuid,text,text,jsonb,uuid,uuid,text)')::regprocedure);
    settings_at := strpos(v_definition,'PERFORM settings.tenant_id FROM public.tenant_supplier_settings');
    warehouse_at := strpos(v_definition,'PERFORM warehouse.id FROM public.warehouses');
    batch_at := strpos(v_definition,'''supplier-purchase-batch-id:''');
    IF settings_at=0 OR warehouse_at<=settings_at OR batch_at<=warehouse_at THEN
      RAISE EXCEPTION 'Review wrapper lock order regressed: %',v_name;
    END IF;
  END LOOP;
END;
$effective_lock_order$;
