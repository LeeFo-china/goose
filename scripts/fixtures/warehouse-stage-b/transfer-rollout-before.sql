-- Synthetic pre-upgrade receipts in the disposable offline PostgreSQL only.
CREATE TABLE public.stage_d_transfer_rollout_history(tenant_id uuid, employee_id uuid, user_id uuid,
  typed_result jsonb, json_request jsonb, json_result jsonb);
DO $$
DECLARE t uuid:=gen_random_uuid(); e uuid:=gen_random_uuid(); u uuid:=gen_random_uuid(); typed_result jsonb; request jsonb; result jsonb;
BEGIN
  INSERT INTO public.tenants(id,name,slug) VALUES(t,'Transfer rollout history','transfer-rollout-history');
  INSERT INTO public.employees(id,tenant_id,name,status) VALUES(e,t,'Synthetic platform actor','active');
  typed_result:=public.set_tenant_supplier_rollout_settings(t,true,false,false,false,false,false,0,u,e,'transfer-pre-typed',NULL);
  IF typed_result->>'version' IS DISTINCT FROM '1' THEN RAISE EXCEPTION 'pre-upgrade typed setup failed'; END IF;
  request:=jsonb_build_object('tenant_id',t,'actor_employee_id',e,'module_enabled',true,
    'require_active_contract_for_new_order',false,'ownership_reads_enabled',false,'private_supplier_writes_enabled',false,
    'private_catalog_writes_enabled',false,'procurement_snapshot_v1_enabled',false,'warehouse_materials_enabled',false,
    'expected_version',1,'reason',NULL);
  result:=public.set_tenant_supplier_rollout_settings(request,u,'transfer-pre-json');
  IF result->>'version' IS DISTINCT FROM '2' THEN RAISE EXCEPTION 'pre-upgrade JSON setup failed'; END IF;
  INSERT INTO public.stage_d_transfer_rollout_history VALUES(t,e,u,typed_result,request,result);
END;
$$;
