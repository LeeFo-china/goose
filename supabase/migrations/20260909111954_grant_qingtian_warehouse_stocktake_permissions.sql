-- Approved tenant-only repair: API system_admin expansion does not create the
-- role_permissions required by the warehouse database permission helper.
-- Baseline: both grants absent. Rollback: close warehouse_stocktakes_enabled,
-- preserve all inventory/financial facts, then use a reviewed forward migration
-- to revoke only these two newly inserted role/permission rows. Never remove
-- other grants or employee overrides (including explicit deny).
-- Once stocktake facts exist, keep a source-compatible API: disable writes or
-- forward-fix; never roll back to an API that cannot read stocktake sources.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='5min';

DO $$
DECLARE
  v_tenant_id constant uuid := '3eebca47-961f-4899-b976-a3d3208d326b';
  v_role_id constant uuid := 'e72850fe-dbba-427f-9109-f1779080a239';
  v_tenant public.tenants%ROWTYPE;
  v_role public.roles%ROWTYPE;
BEGIN
  SELECT * INTO v_tenant FROM public.tenants WHERE id=v_tenant_id FOR SHARE;
  -- Other environments need no corresponding tenant or role.
  IF NOT FOUND THEN RETURN; END IF;
  IF v_tenant.name IS DISTINCT FROM '固始晴天装饰工程有限公司' OR v_tenant.status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'QINGTIAN_STOCKTAKE_GRANT_TENANT_MISMATCH';
  END IF;
  SELECT * INTO v_role FROM public.roles WHERE id=v_role_id FOR SHARE;
  IF NOT FOUND OR v_role.tenant_id IS DISTINCT FROM v_tenant_id
    OR v_role.code IS DISTINCT FROM 'system_admin' OR v_role.status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'QINGTIAN_STOCKTAKE_GRANT_ROLE_MISMATCH';
  END IF;
  PERFORM id FROM public.permissions
    WHERE code IN('inventory.stocktake.manage','inventory.stocktake.approve') ORDER BY id FOR SHARE;
  IF (SELECT count(*) FROM public.permissions WHERE status='active' AND module='inventory' AND resource='stocktake'
    AND ((code='inventory.stocktake.manage' AND action='manage')
      OR (code='inventory.stocktake.approve' AND action='approve')))<>2 THEN
    RAISE EXCEPTION 'QINGTIAN_STOCKTAKE_GRANT_PERMISSION_MISMATCH';
  END IF;
  INSERT INTO public.role_permissions(role_id,permission_id,access_scope)
    SELECT v_role_id,id,'all' FROM public.permissions
    WHERE code IN('inventory.stocktake.manage','inventory.stocktake.approve')
    ON CONFLICT(role_id,permission_id) DO NOTHING;
  -- A narrower pre-existing grant requires review; do not silently widen it.
  IF (SELECT count(*) FROM public.role_permissions rp JOIN public.permissions p ON p.id=rp.permission_id
    WHERE rp.role_id=v_role_id AND p.code IN('inventory.stocktake.manage','inventory.stocktake.approve')
      AND rp.access_scope='all')<>2 THEN
    RAISE EXCEPTION 'QINGTIAN_STOCKTAKE_GRANT_SCOPE_MISMATCH';
  END IF;
END;
$$;
COMMIT;
