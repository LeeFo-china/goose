-- Disposable offline fixture only. Run after material-workflow, transfer-contract,
-- transfer-workflow and transfer-concurrency, then transfer-cross-command-concurrency.
CREATE TABLE public.stage_d_cross_case (
  name text PRIMARY KEY, kind text NOT NULL, transfer_first boolean NOT NULL,
  transfer_id uuid NOT NULL, other_id uuid NOT NULL, issue_id uuid,
  purchase_order_id uuid, purchase_item_id uuid, fulfillment_version integer,
  received_at timestamptz NOT NULL DEFAULT now(), financial_before jsonb NOT NULL,
  inventory_before bigint NOT NULL
);

CREATE FUNCTION public.stage_d_cross_prepare(p_name text,p_kind text,p_transfer_first boolean)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  f public.stage_c_material_fixture%ROWTYPE; v_issue uuid:=gen_random_uuid();
  v_other uuid:=gen_random_uuid(); v_batch uuid:=gen_random_uuid(); v_order uuid; v_item uuid;
  v_reviewer_user uuid:=gen_random_uuid(); v_reviewer uuid:=gen_random_uuid();
  v_version integer; r jsonb; v_now timestamptz:=now();
BEGIN
  SELECT * INTO STRICT f FROM public.stage_c_material_fixture;
  PERFORM set_config('request.jwt.claim.role','service_role',true);
  IF p_kind='return' THEN
    r:=public.command_warehouse_material_order(v_issue,f.tenant_id,'issue','save_draft',0,
      jsonb_build_object('warehouse_id',f.warehouse_id,'project_id',f.project_id,
        'items',jsonb_build_array(jsonb_build_object('supplier_sku_id',f.sku_id,'quantity','0.1'))),
      f.actor_user_id,f.actor_employee_id,p_name||'-issue-save');
    IF r->>'status' IS DISTINCT FROM 'saved' THEN RAISE EXCEPTION 'Issue save: %',r; END IF;
    r:=public.command_warehouse_material_order(v_issue,f.tenant_id,'issue','submit',1,'{}',
      f.actor_user_id,f.actor_employee_id,p_name||'-issue-submit');
    IF r->>'status' IS DISTINCT FROM 'submitted' THEN RAISE EXCEPTION 'Issue submit: %',r; END IF;
    r:=public.command_warehouse_material_order(v_issue,f.tenant_id,'issue','complete',2,'{}',
      f.actor_user_id,f.actor_employee_id,p_name||'-issue-complete');
    IF r->>'status' IS DISTINCT FROM 'completed' THEN RAISE EXCEPTION 'Issue complete: %',r; END IF;
    SELECT id INTO STRICT v_item FROM public.warehouse_issue_order_items WHERE issue_order_id=v_issue;
    r:=public.command_warehouse_material_order(v_other,f.tenant_id,'return','save_draft',0,
      jsonb_build_object('original_issue_order_id',v_issue,'items',jsonb_build_array(
        jsonb_build_object('original_issue_item_id',v_item,'quantity','0.1'))),
      f.actor_user_id,f.actor_employee_id,p_name||'-return-save');
    IF r->>'status' IS DISTINCT FROM 'saved' THEN RAISE EXCEPTION 'Return save: %',r; END IF;
  ELSIF p_kind='receipt' THEN
    INSERT INTO auth.users(id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data)
      VALUES(v_reviewer_user,'authenticated','authenticated',p_name||'@smoke.invalid','','{}','{}');
    INSERT INTO public.employees(id,tenant_id,user_id,name,status)
      VALUES(v_reviewer,f.tenant_id,v_reviewer_user,'Cross-command reviewer','active');
    r:=public.save_supplier_purchase_batch_draft(v_batch,f.tenant_id,NULL,0,p_name,NULL,NULL,
      jsonb_build_array(jsonb_build_object('supplier_sku_id',f.sku_id,'cost_category_id',f.cost_id,'quantity','0.3')),
      f.actor_user_id,f.actor_employee_id,p_name||'-purchase-save','warehouse',f.warehouse_id);
    IF r->>'status' IS DISTINCT FROM 'saved' THEN RAISE EXCEPTION 'Purchase save: %',r; END IF;
    r:=public.__gooes_submit_supplier_purchase_batch_destinations_v2(v_batch,f.tenant_id,1,
      f.actor_user_id,f.actor_employee_id,p_name||'-purchase-submit',true);
    IF r->>'status' IS DISTINCT FROM 'submitted' THEN RAISE EXCEPTION 'Purchase submit: %',r; END IF;
    r:=public.__gooes_review_supplier_purchase_batch_destinations_v2(v_batch,f.tenant_id,2,'approve',NULL,false,
      v_reviewer_user,v_reviewer,p_name||'-purchase-review',true);
    IF r->>'status' IS DISTINCT FROM 'ordered' THEN RAISE EXCEPTION 'Purchase review: %',r; END IF;
    v_order:=(r->'orders'->0->>'id')::uuid;
    SELECT id INTO STRICT v_item FROM public.supplier_purchase_order_items WHERE supplier_purchase_order_id=v_order;
    r:=public.confirm_supplier_purchase_order_fulfillment(v_order,f.tenant_id,2,v_now,NULL,
      f.actor_user_id,f.actor_employee_id,p_name||'-confirm');
    IF r->>'status' IS DISTINCT FROM 'confirmed' THEN RAISE EXCEPTION 'Purchase confirm: %',r; END IF;
    SELECT version INTO STRICT v_version FROM public.supplier_purchase_order_fulfillments WHERE supplier_purchase_order_id=v_order;
  ELSE RAISE EXCEPTION 'Unknown cross-command kind %',p_kind;
  END IF;
  INSERT INTO public.stage_d_cross_case VALUES(p_name,p_kind,p_transfer_first,
    public.stage_d_transfer_prepare(false,'0.1'),v_other,
    CASE WHEN p_kind='return' THEN v_issue END,v_order,
    CASE WHEN p_kind='receipt' THEN v_item END,v_version,v_now,
    public.stage_d_transfer_financial_snapshot(f.tenant_id),
    (SELECT count(*) FROM public.inventory_transactions WHERE tenant_id=f.tenant_id));
END;
$$;

CREATE FUNCTION public.stage_d_cross_other(p_name text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE c public.stage_d_cross_case%ROWTYPE; f public.stage_c_material_fixture%ROWTYPE;
BEGIN
  SELECT * INTO STRICT c FROM public.stage_d_cross_case WHERE name=p_name;
  SELECT * INTO STRICT f FROM public.stage_c_material_fixture;
  PERFORM set_config('request.jwt.claim.role','service_role',true);
  IF c.kind='return' THEN
    RETURN public.command_warehouse_material_order(c.other_id,f.tenant_id,'return','complete',1,'{}',
      f.actor_user_id,f.actor_employee_id,p_name||'-complete');
  END IF;
  RETURN public.create_supplier_purchase_order_receipt(c.other_id,c.purchase_order_id,f.tenant_id,c.fulfillment_version,
    p_name,c.received_at,NULL,jsonb_build_array(jsonb_build_object('purchase_order_item_id',c.purchase_item_id,
      'accepted_quantity',0.3,'rejected_quantity',0)),f.actor_user_id,f.actor_employee_id,p_name||'-complete');
END;
$$;
