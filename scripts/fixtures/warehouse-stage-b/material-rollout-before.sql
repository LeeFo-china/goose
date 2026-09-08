-- Executed before Stage C schema exists, preserving a genuinely old JSON receipt.
CREATE TABLE public.stage_c_historical_rollout(tenant_id uuid,employee_id uuid,user_id uuid,result jsonb);
DO $test$
DECLARE t uuid:=gen_random_uuid(); e uuid:=gen_random_uuid(); u uuid:=gen_random_uuid(); result jsonb;
BEGIN
  IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public'
    AND table_name='tenant_supplier_settings' AND column_name='warehouse_materials_enabled') THEN
    RAISE EXCEPTION 'Historical fixture ran after Stage C schema';
  END IF;
  INSERT INTO public.tenants(id,name,slug) VALUES(t,'Historical materials rollout','material-rollout-history');
  INSERT INTO public.employees(id,tenant_id,name,status) VALUES(e,t,'Historical platform actor','active');
  result:=public.set_tenant_supplier_rollout_settings(t,true,false,false,false,false,false,
    0,u,e,'material-before-schema',NULL);
  IF result->>'version'<>'1' OR result->'setting' ? 'warehouse_materials_enabled' THEN
    RAISE EXCEPTION 'Historical receipt is not pre-C';
  END IF;
  INSERT INTO public.stage_c_historical_rollout VALUES(t,e,u,result);
END;
$test$;
