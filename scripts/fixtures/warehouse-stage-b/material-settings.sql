-- Run after material-workflow.sql on the offline disposable database only.
-- All fixture permission/status/flag probes roll back; the RPC itself only reads.
BEGIN;
CREATE FUNCTION pg_temp.material_settings_expect_error(p_sql text,p_error text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM=p_error THEN RETURN; END IF;
    RAISE EXCEPTION 'Expected %, got %',p_error,SQLERRM;
  END;
  RAISE EXCEPTION 'Expected error %, but settings read succeeded',p_error;
END;
$$;
DO $test$
DECLARE
  f public.stage_c_material_fixture%ROWTYPE; result jsonb; selected_permission text;
  before_setting jsonb; role_id uuid; read_id uuid;
BEGIN
  SELECT * INTO STRICT f FROM public.stage_c_material_fixture;
  PERFORM set_config('request.jwt.claim.role','service_role',true);
  IF has_function_privilege('anon','public.get_warehouse_material_settings(uuid,uuid,uuid)','EXECUTE')
    OR has_function_privilege('authenticated','public.get_warehouse_material_settings(uuid,uuid,uuid)','EXECUTE')
    OR NOT has_function_privilege('service_role','public.get_warehouse_material_settings(uuid,uuid,uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'Material settings RPC ACL invalid';
  END IF;
  IF public.__gooes_has_tenant_procurement_permission(f.tenant_id,f.actor_employee_id,'supplier.view') THEN
    RAISE EXCEPTION 'Fixture actor unexpectedly has supplier.view';
  END IF;
  SELECT id INTO STRICT read_id FROM public.permissions WHERE code='project.read';
  SELECT to_jsonb(s) INTO before_setting FROM public.tenant_supplier_settings s WHERE tenant_id=f.tenant_id;
  FOREACH selected_permission IN ARRAY ARRAY['inventory.issue.manage','inventory.stock.view','inventory.issue.approve'] LOOP
    DELETE FROM public.employee_permission_overrides
      WHERE employee_id=f.actor_employee_id AND permission_id IN (
        SELECT id FROM public.permissions WHERE code IN ('inventory.issue.manage','inventory.stock.view','inventory.issue.approve'));
    SELECT id INTO STRICT role_id FROM public.permissions WHERE code=selected_permission;
    INSERT INTO public.employee_permission_overrides(employee_id,permission_id,effect,access_scope)
      VALUES(f.actor_employee_id,role_id,'allow','self');
    result:=public.get_warehouse_material_settings(f.tenant_id,f.actor_user_id,f.actor_employee_id);
    IF result<>'{"warehouse_materials_enabled":true}'::jsonb THEN
      RAISE EXCEPTION 'Independent % read failed or leaked settings: %',selected_permission,result;
    END IF;
  END LOOP;
  IF before_setting IS DISTINCT FROM (SELECT to_jsonb(s) FROM public.tenant_supplier_settings s WHERE tenant_id=f.tenant_id) THEN
    RAISE EXCEPTION 'Settings read mutated current settings';
  END IF;
  DELETE FROM public.employee_permission_overrides WHERE employee_id=f.actor_employee_id AND permission_id=read_id;
  PERFORM pg_temp.material_settings_expect_error(format('SELECT public.get_warehouse_material_settings(%L,%L,%L)',
    f.tenant_id,f.actor_user_id,f.actor_employee_id),'WAREHOUSE_MATERIAL_FORBIDDEN');
  INSERT INTO public.employee_permission_overrides(employee_id,permission_id,effect,access_scope)
    VALUES(f.actor_employee_id,read_id,'allow','self');
  DELETE FROM public.employee_permission_overrides WHERE employee_id=f.actor_employee_id AND permission_id=role_id;
  PERFORM pg_temp.material_settings_expect_error(format('SELECT public.get_warehouse_material_settings(%L,%L,%L)',
    f.tenant_id,f.actor_user_id,f.actor_employee_id),'WAREHOUSE_MATERIAL_FORBIDDEN');
  INSERT INTO public.employee_permission_overrides(employee_id,permission_id,effect,access_scope)
    VALUES(f.actor_employee_id,role_id,'allow','self');
  PERFORM pg_temp.material_settings_expect_error(format('SELECT public.get_warehouse_material_settings(%L,%L,%L)',
    gen_random_uuid(),f.actor_user_id,f.actor_employee_id),'WAREHOUSE_MATERIAL_ACTOR_INVALID');
  PERFORM pg_temp.material_settings_expect_error(format('SELECT public.get_warehouse_material_settings(%L,%L,%L)',
    f.tenant_id,gen_random_uuid(),f.actor_employee_id),'WAREHOUSE_MATERIAL_ACTOR_INVALID');
  UPDATE public.employees SET status='leaved' WHERE id=f.actor_employee_id;
  PERFORM pg_temp.material_settings_expect_error(format('SELECT public.get_warehouse_material_settings(%L,%L,%L)',
    f.tenant_id,f.actor_user_id,f.actor_employee_id),'WAREHOUSE_MATERIAL_ACTOR_INVALID');
  UPDATE public.employees SET status='active' WHERE id=f.actor_employee_id;
  PERFORM set_config('request.jwt.claim.role','authenticated',true);
  PERFORM pg_temp.material_settings_expect_error(format('SELECT public.get_warehouse_material_settings(%L,%L,%L)',
    f.tenant_id,f.actor_user_id,f.actor_employee_id),'WAREHOUSE_MATERIAL_FORBIDDEN');
  PERFORM set_config('request.jwt.claim.role','service_role',true);
  UPDATE public.tenant_supplier_settings SET warehouse_materials_enabled=false WHERE tenant_id=f.tenant_id;
  IF public.get_warehouse_material_settings(f.tenant_id,f.actor_user_id,f.actor_employee_id)<>'{"warehouse_materials_enabled":false}'::jsonb THEN
    RAISE EXCEPTION 'Disabled C must remain readable';
  END IF;
  DELETE FROM public.tenant_supplier_settings WHERE tenant_id=f.tenant_id;
  IF public.get_warehouse_material_settings(f.tenant_id,f.actor_user_id,f.actor_employee_id)<>'{"warehouse_materials_enabled":false}'::jsonb THEN
    RAISE EXCEPTION 'Missing settings must read as false';
  END IF;
END;
$test$;
ROLLBACK;
SELECT 'EVIDENCE material settings: independent manage/stock/approve reads; project.read required; strict actor/tenant/ACL; disabled and missing settings return false; no other settings exposed';
