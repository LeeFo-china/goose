-- Independent Stage C settings read. No supplier settings or inventory facts change.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';

CREATE FUNCTION public.get_warehouse_material_settings(
  p_tenant_id uuid,p_actor_user_id uuid,p_actor_employee_id uuid
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  PERFORM public.__gooes_material_assert_actor(p_tenant_id,p_actor_user_id,p_actor_employee_id);
  IF NOT public.__gooes_has_tenant_procurement_permission(p_tenant_id,p_actor_employee_id,'project.read')
    OR NOT (
      public.__gooes_has_tenant_procurement_permission(p_tenant_id,p_actor_employee_id,'inventory.stock.view')
      OR public.__gooes_has_tenant_procurement_permission(p_tenant_id,p_actor_employee_id,'inventory.issue.manage')
      OR public.__gooes_has_tenant_procurement_permission(p_tenant_id,p_actor_employee_id,'inventory.issue.approve')
    ) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='WAREHOUSE_MATERIAL_FORBIDDEN';
  END IF;
  RETURN jsonb_build_object('warehouse_materials_enabled',COALESCE((
    SELECT module_enabled AND warehouse_materials_enabled FROM public.tenant_supplier_settings WHERE tenant_id=p_tenant_id
  ),false));
END;
$$;
REVOKE ALL ON FUNCTION public.get_warehouse_material_settings(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_warehouse_material_settings(uuid,uuid,uuid) TO service_role;
COMMIT;
