-- Rollback: forward-only. Keep the two legacy state mutators closed until an
-- audited v2 replacement validates user, employee, tenant, relationship and
-- resource visibility before replay. Restore the previous conversion wrapper
-- only if its first SKU lock remains the final write lock mode.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

REVOKE ALL ON FUNCTION public.mutate_supplier_product(
  uuid, uuid, uuid, text, integer, uuid, uuid, text, text
)
FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.mutate_supplier_sku_for_product(
  uuid, uuid, uuid, uuid, text, integer, uuid, uuid, text, text
)
FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.replace_supplier_sku_unit_conversions(
  p_supplier_sku_id uuid,
  p_expected_sku_version integer,
  p_edges jsonb,
  p_acting_tenant_id uuid,
  p_actor_user_id uuid,
  p_actor_employee_id uuid,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_response jsonb;
BEGIN
  PERFORM employee.id
  FROM public.employees AS employee
  WHERE employee.id = p_actor_employee_id
    AND employee.user_id = p_actor_user_id
    AND employee.tenant_id IS NOT DISTINCT FROM p_acting_tenant_id
    AND employee.status = 'active'
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'SUPPLIER_PROXY_ACTOR_INVALID';
  END IF;

  -- Take the final lock mode immediately. Concurrent commands now serialize
  -- here instead of both holding SHARE and deadlocking during lock upgrade.
  PERFORM supplier_sku.id
  FROM public.supplier_skus AS supplier_sku
  WHERE supplier_sku.id = p_supplier_sku_id
    AND (
      (
        p_acting_tenant_id IS NULL
        AND supplier_sku.ownership_scope = 'platform'
        AND supplier_sku.owner_tenant_id IS NULL
      )
      OR (
        p_acting_tenant_id IS NOT NULL
        AND supplier_sku.ownership_scope = 'tenant'
        AND supplier_sku.owner_tenant_id IS NOT DISTINCT FROM
          p_acting_tenant_id
      )
    )
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'SUPPLIER_SKU_NOT_FOUND';
  END IF;

  v_response :=
    public.replace_supplier_sku_unit_conversions_pre_visibility_unsafe(
      p_supplier_sku_id,
      p_expected_sku_version,
      p_edges,
      p_acting_tenant_id,
      p_actor_user_id,
      p_actor_employee_id,
      p_idempotency_key
    );
  RETURN v_response;
END;
$$;

REVOKE ALL ON FUNCTION public.replace_supplier_sku_unit_conversions(
  uuid, integer, jsonb, uuid, uuid, uuid, text
)
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.replace_supplier_sku_unit_conversions(
  uuid, integer, jsonb, uuid, uuid, uuid, text
)
TO service_role;

COMMIT;
