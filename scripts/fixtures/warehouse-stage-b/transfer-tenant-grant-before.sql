-- Synthetic rows only, in disposable offline PostgreSQL. Reuse the authorized
-- identity keys/name so the exact production migration bytes are tested.
CREATE TABLE public.stage_d_transfer_grant_fixture(tenant_id uuid, role_id uuid, employee_id uuid,
  denied_employee_id uuid, ordinary_employee_id uuid, foreign_tenant_id uuid, foreign_employee_id uuid);
INSERT INTO public.stage_d_transfer_grant_fixture VALUES
  ('3eebca47-961f-4899-b976-a3d3208d326b','e72850fe-dbba-427f-9109-f1779080a239',
   '91000000-0000-4000-8000-000000000003','91000000-0000-4000-8000-000000000004',
   '91000000-0000-4000-8000-000000000005','91000000-0000-4000-8000-000000000006',
   '91000000-0000-4000-8000-000000000007');
INSERT INTO public.tenants(id,name,slug)
  SELECT tenant_id,'固始晴天装饰工程有限公司','synthetic-transfer-grant' FROM public.stage_d_transfer_grant_fixture
  UNION ALL SELECT foreign_tenant_id,'Synthetic foreign grant tenant','synthetic-transfer-foreign' FROM public.stage_d_transfer_grant_fixture;
INSERT INTO public.roles(id,tenant_id,code,name,status)
  SELECT role_id,tenant_id,'system_admin','Synthetic administrator','active' FROM public.stage_d_transfer_grant_fixture
  UNION ALL SELECT gen_random_uuid(),tenant_id,'ordinary','Synthetic ordinary role','active' FROM public.stage_d_transfer_grant_fixture
  UNION ALL SELECT gen_random_uuid(),foreign_tenant_id,'system_admin','Synthetic foreign administrator','active' FROM public.stage_d_transfer_grant_fixture;
INSERT INTO public.employees(id,tenant_id,name,status)
  SELECT employee_id,tenant_id,'Synthetic administrator','active' FROM public.stage_d_transfer_grant_fixture
  UNION ALL SELECT denied_employee_id,tenant_id,'Synthetic denied administrator','active' FROM public.stage_d_transfer_grant_fixture
  UNION ALL SELECT ordinary_employee_id,tenant_id,'Synthetic ordinary employee','active' FROM public.stage_d_transfer_grant_fixture
  UNION ALL SELECT foreign_employee_id,foreign_tenant_id,'Synthetic foreign administrator','active' FROM public.stage_d_transfer_grant_fixture;
INSERT INTO public.employee_roles(employee_id,role_id)
  SELECT e.id,r.id FROM public.employees e JOIN public.roles r ON r.tenant_id=e.tenant_id
  CROSS JOIN public.stage_d_transfer_grant_fixture f
  WHERE (e.id IN(f.employee_id,f.denied_employee_id,f.foreign_employee_id) AND r.code='system_admin')
    OR (e.id=f.ordinary_employee_id AND r.code='ordinary');
INSERT INTO public.employee_permission_overrides(employee_id,permission_id,effect,access_scope,reason)
  SELECT f.denied_employee_id,p.id,'deny',NULL,'Synthetic explicit deny must survive migration'
  FROM public.stage_d_transfer_grant_fixture f CROSS JOIN public.permissions p
  WHERE p.code IN('inventory.transfer.manage','inventory.transfer.approve');
INSERT INTO public.role_permissions(role_id,permission_id,access_scope)
  SELECT r.id,p.id,'self' FROM public.roles r CROSS JOIN public.permissions p
  WHERE p.code='inventory.stock.view';
INSERT INTO public.tenant_supplier_settings(tenant_id,module_enabled,warehouse_transfers_enabled)
  SELECT tenant_id,false,false FROM public.stage_d_transfer_grant_fixture;

CREATE FUNCTION public.stage_d_transfer_grant_assert(p_tenant uuid,p_employee uuid,p_code text,p_expected boolean)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF public.__gooes_has_tenant_procurement_permission(p_tenant,p_employee,p_code) IS DISTINCT FROM p_expected THEN
    RAISE EXCEPTION 'transfer grant helper expected % for % / %',p_expected,p_employee,p_code;
  END IF;
  BEGIN
    PERFORM public.__gooes_transfer_assert_permission(p_tenant,p_employee,p_code);
    IF NOT p_expected THEN RAISE EXCEPTION 'transfer permission assertion unexpectedly allowed %',p_code; END IF;
  EXCEPTION WHEN insufficient_privilege THEN
    IF p_expected OR SQLERRM<>'WAREHOUSE_TRANSFER_FORBIDDEN' THEN RAISE; END IF;
  END;
END;
$$;

-- Exact snapshots cover pre-existing grants, bindings/overrides, rollout state,
-- inventory/financial facts and every public function definition/ACL.
CREATE FUNCTION public.stage_d_transfer_grant_snapshot(p_exclude_target boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE result jsonb:='{}'; rows jsonb; relation text;
BEGIN
  FOREACH relation IN ARRAY ARRAY['tenants','roles','permissions','employee_roles','employees',
    'employee_permission_overrides','tenant_supplier_settings','supplier_command_events',
    'warehouses','inventory_balances','inventory_transactions','warehouse_transfer_orders','warehouse_transfer_order_items',
    'warehouse_transfer_command_events','project_cost_events','supplier_payable_events','supplier_payments','finance_ledger_entries'] LOOP
    EXECUTE format('SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),''[]''::jsonb) FROM public.%I t',relation) INTO rows;
    result:=result||jsonb_build_object(relation,rows);
  END LOOP;
  SELECT COALESCE(jsonb_agg(to_jsonb(rp) ORDER BY rp.id),'[]'::jsonb) INTO rows FROM public.role_permissions rp
    WHERE NOT(p_exclude_target AND rp.role_id=(SELECT role_id FROM public.stage_d_transfer_grant_fixture)
      AND rp.permission_id IN(SELECT id FROM public.permissions WHERE code IN('inventory.transfer.manage','inventory.transfer.approve')));
  result:=result||jsonb_build_object('role_permissions',rows);
  SELECT jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'definition',pg_get_functiondef(p.oid),
    'acl',p.proacl::text,'owner',p.proowner,'config',p.proconfig) ORDER BY p.oid) INTO rows
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind='f';
  RETURN result||jsonb_build_object('functions',rows);
END;
$$;
DO $$
DECLARE f public.stage_d_transfer_grant_fixture%ROWTYPE; permission text;
BEGIN
  SELECT * INTO STRICT f FROM public.stage_d_transfer_grant_fixture;
  IF EXISTS(SELECT 1 FROM public.role_permissions rp JOIN public.permissions p ON p.id=rp.permission_id
    WHERE rp.role_id=f.role_id AND p.code IN('inventory.transfer.manage','inventory.transfer.approve')) THEN
    RAISE EXCEPTION 'pre-migration target transfer grants must be absent';
  END IF;
  FOREACH permission IN ARRAY ARRAY['inventory.transfer.manage','inventory.transfer.approve'] LOOP
    PERFORM public.stage_d_transfer_grant_assert(f.tenant_id,f.employee_id,permission,false);
  END LOOP;
END;
$$;
CREATE TABLE public.stage_d_transfer_grant_before AS SELECT public.stage_d_transfer_grant_snapshot() AS snapshot;
