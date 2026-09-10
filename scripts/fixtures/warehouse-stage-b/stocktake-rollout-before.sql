-- Genuine receipts created before the stocktake column exists in the disposable database.
DO $$
BEGIN
  IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public'
    AND table_name='tenant_supplier_settings' AND column_name='warehouse_stocktakes_enabled') THEN
    RAISE EXCEPTION 'stocktake column exists before historical receipt fixture';
  END IF;
END;
$$;
CREATE TABLE public.stage_d2_rollout_history(tenant_id uuid,employee_id uuid,user_id uuid,
  typed_result jsonb,json_request jsonb,json_result jsonb);
DO $$
DECLARE t uuid:=gen_random_uuid(); e uuid:=gen_random_uuid(); u uuid:=gen_random_uuid(); typed_result jsonb; request jsonb; result jsonb;
BEGIN
  INSERT INTO public.tenants(id,name,slug) VALUES(t,'Stocktake rollout history','stocktake-rollout-history');
  INSERT INTO public.employees(id,tenant_id,name,status) VALUES(e,t,'Synthetic platform actor','active');
  typed_result:=public.set_tenant_supplier_rollout_settings(t,true,false,false,false,false,false,0,u,e,'stocktake-pre-typed',NULL);
  request:=jsonb_build_object('tenant_id',t,'actor_employee_id',e,'module_enabled',true,
    'require_active_contract_for_new_order',false,'ownership_reads_enabled',false,'private_supplier_writes_enabled',false,
    'private_catalog_writes_enabled',false,'procurement_snapshot_v1_enabled',false,'warehouse_materials_enabled',false,
    'warehouse_transfers_enabled',false,'expected_version',1,'reason',NULL);
  result:=public.set_tenant_supplier_rollout_settings(request,u,'stocktake-pre-json');
  IF typed_result->>'version' IS DISTINCT FROM '1' OR result->>'version' IS DISTINCT FROM '2'
    OR typed_result->'setting' ? 'warehouse_stocktakes_enabled'
    OR result->'setting' ? 'warehouse_stocktakes_enabled' THEN RAISE EXCEPTION 'pre-stocktake receipts invalid'; END IF;
  INSERT INTO public.stage_d2_rollout_history VALUES(t,e,u,typed_result,request,result);
END;
$$;
