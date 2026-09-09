BEGIN;
DO $$
DECLARE f public.stage_d2_stocktake_grant_fixture%ROWTYPE; permission text;
BEGIN
  SELECT * INTO STRICT f FROM public.stage_d2_stocktake_grant_fixture;
  FOREACH permission IN ARRAY ARRAY['inventory.stocktake.manage','inventory.stocktake.approve'] LOOP
    PERFORM public.stage_d2_stocktake_grant_assert(f.tenant_id,f.employee_id,permission,true);
    PERFORM public.stage_d2_stocktake_grant_assert(f.tenant_id,f.denied_employee_id,permission,false);
    PERFORM public.stage_d2_stocktake_grant_assert(f.tenant_id,f.ordinary_employee_id,permission,false);
    PERFORM public.stage_d2_stocktake_grant_assert(f.foreign_tenant_id,f.foreign_employee_id,permission,false);
    PERFORM public.stage_d2_stocktake_grant_assert(f.foreign_tenant_id,f.employee_id,permission,false);
    PERFORM public.stage_d2_stocktake_grant_assert(f.tenant_id,f.foreign_employee_id,permission,false);
    UPDATE public.employees SET status='suspended' WHERE id=f.employee_id;
    PERFORM public.stage_d2_stocktake_grant_assert(f.tenant_id,f.employee_id,permission,false);
    UPDATE public.employees SET status='active' WHERE id=f.employee_id;
    UPDATE public.roles SET status='inactive' WHERE id=f.role_id;
    PERFORM public.stage_d2_stocktake_grant_assert(f.tenant_id,f.employee_id,permission,false);
    UPDATE public.roles SET status='active' WHERE id=f.role_id;
    UPDATE public.permissions SET status='inactive' WHERE code=permission;
    PERFORM public.stage_d2_stocktake_grant_assert(f.tenant_id,f.employee_id,permission,false);
    UPDATE public.permissions SET status='active' WHERE code=permission;
    BEGIN
      PERFORM public.__gooes_stocktake_assert_actor(f.tenant_id,f.foreign_employee_id,f.employee_id,permission);
      RAISE EXCEPTION 'mismatched user must not inherit stocktake grant';
    EXCEPTION WHEN insufficient_privilege THEN
      IF SQLERRM<>'WAREHOUSE_STOCKTAKE_ACTOR_INVALID' THEN RAISE; END IF;
    END;
    PERFORM set_config('request.jwt.claim.role','authenticated',true);
    BEGIN
      PERFORM public.__gooes_stocktake_assert_actor(f.tenant_id,f.employee_id,f.employee_id,permission);
      RAISE EXCEPTION 'non-service caller must not use stocktake actor helper';
    EXCEPTION WHEN insufficient_privilege THEN
      IF SQLERRM<>'WAREHOUSE_STOCKTAKE_FORBIDDEN' THEN RAISE; END IF;
    END;
    PERFORM set_config('request.jwt.claim.role','service_role',true);
    UPDATE public.tenants SET status='suspended' WHERE id=f.tenant_id;
    BEGIN
      PERFORM public.__gooes_stocktake_assert_actor(f.tenant_id,f.employee_id,f.employee_id,permission);
      RAISE EXCEPTION 'inactive tenant must not inherit stocktake grant';
    EXCEPTION WHEN insufficient_privilege THEN
      IF SQLERRM<>'WAREHOUSE_STOCKTAKE_ACTOR_INVALID' THEN RAISE; END IF;
    END;
    UPDATE public.tenants SET status='active' WHERE id=f.tenant_id;
  END LOOP;
  IF (SELECT count(*) FROM public.role_permissions rp JOIN public.permissions p ON p.id=rp.permission_id
    WHERE rp.role_id=f.role_id AND p.code IN('inventory.stocktake.manage','inventory.stocktake.approve') AND rp.access_scope='all')<>2 THEN
    RAISE EXCEPTION 'expected exactly two target stocktake grants with scope all';
  END IF;
END;
$$;
ROLLBACK;
DO $$ BEGIN
  IF public.stage_d2_stocktake_grant_snapshot(true) IS DISTINCT FROM (SELECT snapshot FROM public.stage_d2_stocktake_grant_before) THEN
    RAISE EXCEPTION 'migration changed unrelated grants, overrides, rollout, facts, or function definitions/ACLs';
  END IF;
END $$;
SELECT 'EVIDENCE target administrator has exactly manage/approve all; explicit deny, inactive employee/role/permission, ordinary and foreign administrators denied; unrelated state and function ACLs unchanged';
