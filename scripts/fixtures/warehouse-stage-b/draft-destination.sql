-- Synthetic fixtures only, in the offline disposable regression database.
BEGIN;
DO $test$
DECLARE
  v_tenant uuid := gen_random_uuid();
  v_other_tenant uuid := gen_random_uuid();
  v_warehouse uuid := gen_random_uuid();
  v_other_warehouse uuid := gen_random_uuid();
  v_project uuid := gen_random_uuid();
  v_employee uuid := gen_random_uuid();
  v_other_employee uuid := gen_random_uuid();
  v_result jsonb;
BEGIN
  INSERT INTO public.tenants(id, name, slug) VALUES
    (v_tenant, 'Stage B fixture', 'stage-b-fixture'),
    (v_other_tenant, 'Stage B other tenant', 'stage-b-other-fixture');
  INSERT INTO public.warehouses(id, tenant_id, name)
    VALUES (v_warehouse, v_tenant, 'Stage B warehouse'),
      (v_other_warehouse, v_other_tenant, 'Stage B other warehouse');
  INSERT INTO public.employees(id,tenant_id,name,status)
    VALUES(v_employee,v_tenant,'Fixture operator','active'),
      (v_other_employee,v_other_tenant,'Other fixture operator','active');
  INSERT INTO public.projects(id, tenant_id, name, status)
    VALUES (v_project, v_tenant, 'Project compatibility', 'designing');
  INSERT INTO public.tenant_supplier_settings(tenant_id) VALUES (v_tenant),(v_other_tenant)
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

  -- Open the second tenant too: a closed gate must not mask a tenant-scope bug.
  UPDATE public.tenant_supplier_settings SET module_enabled = true,
    enabled_by_employee_id = v_other_employee, enabled_at = now(),
    ownership_reads_enabled = true, private_supplier_writes_enabled = true,
    private_catalog_writes_enabled = true,
    procurement_snapshot_v1_enabled = true, purchase_batch_workflow_enabled = true,
    warehouse_procurement_enabled = true WHERE tenant_id = v_other_tenant;
  v_result := public.resolve_supplier_purchase_batch_catalog(
    p_tenant_id => v_other_tenant, p_project_id => NULL,
    p_destination_type => 'warehouse', p_warehouse_id => v_other_warehouse);
  IF v_result->'items' IS DISTINCT FROM '[]'::jsonb OR (v_result->>'total')::int IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'Second tenant own-warehouse catalog control failed: %',v_result;
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
    IF SQLERRM IS DISTINCT FROM 'WAREHOUSE_NOT_FOUND' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.resolve_supplier_purchase_batch_catalog(
      p_tenant_id => v_tenant, p_project_id => NULL,
      p_destination_type => 'warehouse', p_warehouse_id => v_other_warehouse);
    RAISE EXCEPTION 'Reverse cross-tenant warehouse accepted';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM IS DISTINCT FROM 'WAREHOUSE_NOT_FOUND' THEN RAISE; END IF;
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

-- Runtime ACL metadata for command signatures absent from previous fixtures.
DO $acl$
DECLARE signature text;
BEGIN
  FOREACH signature IN ARRAY ARRAY[
    'public.create_tenant_warehouse(uuid,uuid,text,text,text,text,uuid,boolean,uuid,uuid,text)',
    'public.update_tenant_warehouse(uuid,uuid,integer,text,text,boolean,text,boolean,text,boolean,uuid,boolean,boolean,text,uuid,uuid,text)',
    'public.confirm_supplier_purchase_order_fulfillment(uuid,uuid,integer,timestamptz,text,uuid,uuid,text)',
    'public.create_supplier_purchase_order_receipt(uuid,uuid,uuid,integer,text,timestamptz,text,jsonb,uuid,uuid,text)'
  ] LOOP
    IF has_function_privilege('anon',signature,'EXECUTE')
      OR has_function_privilege('authenticated',signature,'EXECUTE')
      OR NOT has_function_privilege('service_role',signature,'EXECUTE') THEN
      RAISE EXCEPTION 'Warehouse/receipt command ACL regression: %',signature;
    END IF;
  END LOOP;
  IF has_function_privilege('anon','public.ensure_default_tenant_warehouse()','EXECUTE')
    OR has_function_privilege('authenticated','public.ensure_default_tenant_warehouse()','EXECUTE')
    OR has_function_privilege('service_role','public.ensure_default_tenant_warehouse()','EXECUTE') THEN
    RAISE EXCEPTION 'Default-warehouse trigger helper exposed to application roles';
  END IF;
END;
$acl$;
ROLLBACK;
