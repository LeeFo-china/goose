-- Requires material-workflow.sql; actual risk/budget commands over real cost facts.
BEGIN;
DO $test$
DECLARE
  f public.stage_c_material_fixture%ROWTYPE;
  b uuid := gen_random_uuid(); issue_id uuid := gen_random_uuid(); return_id uuid := gen_random_uuid();
  issue_item_id uuid; reviewer_user uuid := gen_random_uuid(); reviewer_employee uuid := gen_random_uuid();
  result jsonb; flag text;
BEGIN
  SELECT * INTO STRICT f FROM public.stage_c_material_fixture;
  PERFORM set_config('request.jwt.claim.role','service_role',true);
  INSERT INTO public.project_cost_budgets(tenant_id,project_id,cost_category_id,budget_amount,created_by,updated_by)
    VALUES(f.tenant_id,f.project_id,f.cost_id,0.01,f.actor_employee_id,f.actor_employee_id);
  IF NOT EXISTS(SELECT 1 FROM public.search_finance_project_risk_ids(
    p_tenant_id=>f.tenant_id,p_keyword=>f.project_id::text)) THEN
    RAISE EXCEPTION 'risk fixture project missing';
  END IF;
  FOREACH flag IN ARRAY ARRAY['category_over_budget','project_over_budget','negative_actual_profit'] LOOP
    IF EXISTS(SELECT 1 FROM public.search_finance_project_risk_ids(
      p_tenant_id=>f.tenant_id,p_keyword=>f.project_id::text,p_risk_flag=>flag)) THEN
      RAISE EXCEPTION 'net-zero project incorrectly has risk %',flag;
    END IF;
  END LOOP;
  UPDATE public.project_cost_budgets SET budget_amount=0.08
    WHERE tenant_id=f.tenant_id AND project_id=f.project_id;
  result := public.save_supplier_purchase_batch_draft(b,f.tenant_id,f.project_id,0,'Net-cost regression',NULL,NULL,
    jsonb_build_array(jsonb_build_object('supplier_sku_id',f.sku_id,'cost_category_id',f.cost_id,'quantity','1')),
    f.actor_user_id,f.actor_employee_id,'net-cost-save');
  IF result->>'status' IS DISTINCT FROM 'saved' THEN RAISE EXCEPTION 'draft failed: %',result; END IF;
  result := public.__gooes_supplier_purchase_batch_budget_preflight(f.tenant_id,b,f.project_id);
  IF result->>'budget_status' IS DISTINCT FROM 'within_budget'
    OR (result->'budget_snapshot'->f.cost_id::text->>'expense_amount')::numeric IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'preflight costs not net: %',result;
  END IF;

  -- Positive control: a new real issue MUST consume budget; do not merely ignore warehouse facts.
  PERFORM public.command_warehouse_material_order(issue_id,f.tenant_id,'issue','save_draft',0,
    jsonb_build_object('warehouse_id',f.warehouse_id,'project_id',f.project_id,
      'items',jsonb_build_array(jsonb_build_object('supplier_sku_id',f.sku_id,'quantity','0.3'))),
    f.actor_user_id,f.actor_employee_id,'net-positive-save');
  PERFORM public.command_warehouse_material_order(issue_id,f.tenant_id,'issue','submit',1,'{}',
    f.actor_user_id,f.actor_employee_id,'net-positive-submit');
  PERFORM public.command_warehouse_material_order(issue_id,f.tenant_id,'issue','complete',2,'{}',
    f.actor_user_id,f.actor_employee_id,'net-positive-complete');
  result := public.__gooes_supplier_purchase_batch_budget_preflight(f.tenant_id,b,f.project_id);
  IF result->>'budget_status' IS DISTINCT FROM 'over_budget'
    OR (result->'budget_snapshot'->f.cost_id::text->>'expense_amount')::numeric IS DISTINCT FROM 0.02 THEN
    RAISE EXCEPTION 'new issue did not consume budget: %',result;
  END IF;
  SELECT id INTO STRICT issue_item_id FROM public.warehouse_issue_order_items WHERE issue_order_id=issue_id;
  PERFORM public.command_warehouse_material_order(return_id,f.tenant_id,'return','save_draft',0,
    jsonb_build_object('original_issue_order_id',issue_id,
      'items',jsonb_build_array(jsonb_build_object('original_issue_item_id',issue_item_id,'quantity','0.3'))),
    f.actor_user_id,f.actor_employee_id,'net-return-save');
  PERFORM public.command_warehouse_material_order(return_id,f.tenant_id,'return','complete',1,'{}',
    f.actor_user_id,f.actor_employee_id,'net-return-complete');
  result := public.__gooes_supplier_purchase_batch_budget_preflight(f.tenant_id,b,f.project_id);
  IF result->>'budget_status' IS DISTINCT FROM 'within_budget' THEN
    RAISE EXCEPTION 'return did not restore budget: %',result;
  END IF;
  result := public.submit_supplier_purchase_batch(b,f.tenant_id,1,f.actor_user_id,f.actor_employee_id,'net-cost-submit');
  IF result->>'status' IS DISTINCT FROM 'submitted'
    OR result->'batch'->>'budget_status' IS DISTINCT FROM 'within_budget' THEN
    RAISE EXCEPTION 'submit costs not net: %',result;
  END IF;
  INSERT INTO auth.users(id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data)
    VALUES(reviewer_user,'authenticated','authenticated','net-cost-review@smoke.invalid','','{}','{}');
  INSERT INTO public.employees(id,tenant_id,user_id,name,status)
    VALUES(reviewer_employee,f.tenant_id,reviewer_user,'Net reviewer','active');
  result := public.review_supplier_purchase_batch(b,f.tenant_id,2,'approve',NULL,false,
    reviewer_user,reviewer_employee,'net-cost-review');
  IF result->>'status' IS DISTINCT FROM 'ordered' THEN RAISE EXCEPTION 'review costs not net: %',result; END IF;
END;
$test$;
ROLLBACK;
SELECT 'EVIDENCE real risk/preflight/submit/review consume net material cost; new issue consumes and return restores available budget';
