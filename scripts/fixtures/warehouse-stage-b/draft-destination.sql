-- Synthetic fixtures only, in the offline disposable regression database.
BEGIN;
DO $test$
DECLARE
  v_tenant uuid := gen_random_uuid();
  v_other_tenant uuid := gen_random_uuid();
  v_warehouse uuid := gen_random_uuid();
  v_project uuid := gen_random_uuid();
  v_employee uuid := gen_random_uuid();
  v_result jsonb;
BEGIN
  INSERT INTO public.tenants(id, name, slug) VALUES
    (v_tenant, 'Stage B fixture', 'stage-b-fixture'),
    (v_other_tenant, 'Stage B other tenant', 'stage-b-other-fixture');
  INSERT INTO public.warehouses(id, tenant_id, name)
    VALUES (v_warehouse, v_tenant, 'Stage B warehouse');
  INSERT INTO public.employees(id,tenant_id,name,status)
    VALUES(v_employee,v_tenant,'Fixture operator','active');
  INSERT INTO public.projects(id, tenant_id, name, status)
    VALUES (v_project, v_tenant, 'Project compatibility', 'designing');
  INSERT INTO public.tenant_supplier_settings(tenant_id) VALUES (v_tenant)
    ON CONFLICT (tenant_id) DO NOTHING;

  BEGIN
    PERFORM public.resolve_supplier_purchase_batch_catalog(
      p_tenant_id => v_tenant, p_project_id => NULL,
      p_destination_type => 'warehouse', p_warehouse_id => v_warehouse);
    RAISE EXCEPTION 'Warehouse gate was bypassed';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM <> 'WAREHOUSE_PROCUREMENT_NOT_ENABLED' THEN RAISE; END IF;
  END;

  UPDATE public.tenant_supplier_settings SET module_enabled = true,
    enabled_by_employee_id = v_employee, enabled_at = now(),
    ownership_reads_enabled = true, private_supplier_writes_enabled = true,
    private_catalog_writes_enabled = true,
    procurement_snapshot_v1_enabled = true, purchase_batch_workflow_enabled = true,
    warehouse_procurement_enabled = true WHERE tenant_id = v_tenant;
  v_result := public.resolve_supplier_purchase_batch_catalog(
    p_tenant_id => v_tenant, p_project_id => NULL,
    p_destination_type => 'warehouse', p_warehouse_id => v_warehouse);
  IF v_result->'items' <> '[]'::jsonb OR (v_result->>'total')::int <> 0 THEN
    RAISE EXCEPTION 'Warehouse catalog empty-page contract failed: %', v_result;
  END IF;
  v_result := public.resolve_supplier_purchase_batch_catalog(v_tenant, v_project);
  IF (v_result->>'total')::int <> 0 THEN
    RAISE EXCEPTION 'Legacy project catalog changed';
  END IF;

  BEGIN
    PERFORM public.resolve_supplier_purchase_batch_catalog(
      p_tenant_id => v_tenant, p_project_id => v_project,
      p_destination_type => 'warehouse', p_warehouse_id => v_warehouse);
    RAISE EXCEPTION 'Mixed destination accepted';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
  END;
  BEGIN
    PERFORM public.resolve_supplier_purchase_batch_catalog(
      p_tenant_id => v_other_tenant, p_project_id => NULL,
      p_destination_type => 'warehouse', p_warehouse_id => v_warehouse);
    RAISE EXCEPTION 'Cross-tenant warehouse accepted';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM NOT IN ('WAREHOUSE_PROCUREMENT_NOT_ENABLED', 'WAREHOUSE_NOT_FOUND') THEN RAISE; END IF;
  END;
  UPDATE public.warehouses SET status = 'inactive' WHERE id = v_warehouse;
  BEGIN
    PERFORM public.resolve_supplier_purchase_batch_catalog(
      p_tenant_id => v_tenant, p_project_id => NULL,
      p_destination_type => 'warehouse', p_warehouse_id => v_warehouse);
    RAISE EXCEPTION 'Inactive warehouse accepted';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM <> 'WAREHOUSE_INACTIVE' THEN RAISE; END IF;
  END;
END;
$test$;
ROLLBACK;
