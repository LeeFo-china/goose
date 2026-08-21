-- Rollback: forward-only. In a new maintenance-window migration, first
-- revoke EXECUTE from the six public wrappers, drop the six public wrappers,
-- rename the six private functions back to their public names, and restore
-- service_role EXECUTE on those functions. Restore service_role table writes only after
-- a reviewed replacement preserves authorization, idempotency,
-- optimistic locking, audit events, and lifecycle controls.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

CREATE FUNCTION public.assert_supplier_price_runtime_actor(
  p_tenant_id uuid,
  p_supplier_id uuid,
  p_actor_user_id uuid,
  p_actor_employee_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_tenant_supplier_id uuid;
BEGIN
  PERFORM employee.id
  FROM public.employees AS employee
  WHERE employee.id = p_actor_employee_id
    AND employee.user_id = p_actor_user_id
    AND employee.tenant_id = p_tenant_id
    AND employee.status = 'active'
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_PROXY_ACTOR_INVALID';
  END IF;

  SELECT relationship.id
  INTO v_tenant_supplier_id
  FROM public.tenant_suppliers AS relationship
  WHERE relationship.tenant_id = p_tenant_id
    AND relationship.supplier_id = p_supplier_id
    AND relationship.relationship_status = 'active'
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_ORDER_NOT_ELIGIBLE';
  END IF;

  RETURN v_tenant_supplier_id;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_supplier_price_runtime_actor(
  uuid,
  uuid,
  uuid,
  uuid
)
FROM PUBLIC, anon, authenticated, service_role;

ALTER FUNCTION public.create_supplier_price_list(
  uuid,
  uuid,
  uuid,
  text,
  text,
  text,
  timestamptz,
  timestamptz,
  uuid,
  uuid,
  text,
  text
)
RENAME TO create_supplier_price_list_pre_actor_binding_unsafe;

ALTER FUNCTION public.publish_supplier_price_list(
  uuid,
  uuid,
  uuid,
  integer,
  uuid,
  uuid,
  text,
  text
)
RENAME TO publish_supplier_price_list_pre_actor_binding_unsafe;

ALTER FUNCTION public.create_supplier_price_list_version(
  uuid,
  uuid,
  uuid,
  uuid,
  integer,
  uuid,
  uuid,
  text,
  text
)
RENAME TO create_supplier_price_list_version_pre_actor_binding_unsafe;

ALTER FUNCTION public.retire_supplier_price_list(
  uuid,
  uuid,
  uuid,
  integer,
  uuid,
  uuid,
  text,
  text
)
RENAME TO retire_supplier_price_list_pre_actor_binding_unsafe;

ALTER FUNCTION public.upsert_supplier_price_list_item(
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  numeric,
  numeric,
  boolean,
  integer,
  uuid,
  uuid,
  text,
  text
)
RENAME TO upsert_supplier_price_list_item_pre_actor_binding_unsafe;

ALTER FUNCTION public.delete_supplier_price_list_item(
  uuid,
  uuid,
  uuid,
  uuid,
  integer,
  uuid,
  uuid,
  text,
  text
)
RENAME TO delete_supplier_price_list_item_pre_actor_binding_unsafe;

REVOKE ALL ON FUNCTION public.create_supplier_price_list_pre_actor_binding_unsafe(
  uuid,
  uuid,
  uuid,
  text,
  text,
  text,
  timestamptz,
  timestamptz,
  uuid,
  uuid,
  text,
  text
)
FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.publish_supplier_price_list_pre_actor_binding_unsafe(
  uuid,
  uuid,
  uuid,
  integer,
  uuid,
  uuid,
  text,
  text
)
FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.create_supplier_price_list_version_pre_actor_binding_unsafe(
  uuid,
  uuid,
  uuid,
  uuid,
  integer,
  uuid,
  uuid,
  text,
  text
)
FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.retire_supplier_price_list_pre_actor_binding_unsafe(
  uuid,
  uuid,
  uuid,
  integer,
  uuid,
  uuid,
  text,
  text
)
FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.upsert_supplier_price_list_item_pre_actor_binding_unsafe(
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  numeric,
  numeric,
  boolean,
  integer,
  uuid,
  uuid,
  text,
  text
)
FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.delete_supplier_price_list_item_pre_actor_binding_unsafe(
  uuid,
  uuid,
  uuid,
  uuid,
  integer,
  uuid,
  uuid,
  text,
  text
)
FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.create_supplier_price_list(
  p_price_list_id uuid,
  p_tenant_id uuid,
  p_supplier_id uuid,
  p_price_list_code text,
  p_name text,
  p_currency text,
  p_effective_from timestamptz,
  p_effective_until timestamptz,
  p_actor_user_id uuid,
  p_actor_employee_id uuid,
  p_idempotency_key text,
  p_proxy_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM public.assert_supplier_price_runtime_actor(
    p_tenant_id,
    p_supplier_id,
    p_actor_user_id,
    p_actor_employee_id
  );

  RETURN public.create_supplier_price_list_pre_actor_binding_unsafe(
    p_price_list_id,
    p_tenant_id,
    p_supplier_id,
    p_price_list_code,
    p_name,
    p_currency,
    p_effective_from,
    p_effective_until,
    p_actor_user_id,
    p_actor_employee_id,
    p_idempotency_key,
    p_proxy_reason
  );
END;
$$;

CREATE FUNCTION public.publish_supplier_price_list(
  p_price_list_id uuid,
  p_tenant_id uuid,
  p_supplier_id uuid,
  p_expected_version integer,
  p_actor_user_id uuid,
  p_actor_employee_id uuid,
  p_idempotency_key text,
  p_proxy_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM public.assert_supplier_price_runtime_actor(
    p_tenant_id,
    p_supplier_id,
    p_actor_user_id,
    p_actor_employee_id
  );

  RETURN public.publish_supplier_price_list_pre_actor_binding_unsafe(
    p_price_list_id,
    p_tenant_id,
    p_supplier_id,
    p_expected_version,
    p_actor_user_id,
    p_actor_employee_id,
    p_idempotency_key,
    p_proxy_reason
  );
END;
$$;

CREATE FUNCTION public.create_supplier_price_list_version(
  p_new_price_list_id uuid,
  p_tenant_id uuid,
  p_supplier_id uuid,
  p_source_price_list_id uuid,
  p_expected_version integer,
  p_actor_user_id uuid,
  p_actor_employee_id uuid,
  p_idempotency_key text,
  p_proxy_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM public.assert_supplier_price_runtime_actor(
    p_tenant_id,
    p_supplier_id,
    p_actor_user_id,
    p_actor_employee_id
  );

  RETURN public.create_supplier_price_list_version_pre_actor_binding_unsafe(
    p_new_price_list_id,
    p_tenant_id,
    p_supplier_id,
    p_source_price_list_id,
    p_expected_version,
    p_actor_user_id,
    p_actor_employee_id,
    p_idempotency_key,
    p_proxy_reason
  );
END;
$$;

CREATE FUNCTION public.retire_supplier_price_list(
  p_price_list_id uuid,
  p_tenant_id uuid,
  p_supplier_id uuid,
  p_expected_version integer,
  p_actor_user_id uuid,
  p_actor_employee_id uuid,
  p_idempotency_key text,
  p_proxy_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM public.assert_supplier_price_runtime_actor(
    p_tenant_id,
    p_supplier_id,
    p_actor_user_id,
    p_actor_employee_id
  );

  RETURN public.retire_supplier_price_list_pre_actor_binding_unsafe(
    p_price_list_id,
    p_tenant_id,
    p_supplier_id,
    p_expected_version,
    p_actor_user_id,
    p_actor_employee_id,
    p_idempotency_key,
    p_proxy_reason
  );
END;
$$;

CREATE FUNCTION public.upsert_supplier_price_list_item(
  p_item_id uuid,
  p_price_list_id uuid,
  p_tenant_id uuid,
  p_supplier_id uuid,
  p_sku_id uuid,
  p_unit_price numeric,
  p_tax_rate numeric,
  p_tax_inclusive boolean,
  p_expected_version integer,
  p_actor_user_id uuid,
  p_actor_employee_id uuid,
  p_idempotency_key text,
  p_proxy_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF p_unit_price IS NULL
    OR p_unit_price::text IN ('NaN', 'Infinity', '-Infinity')
    OR p_unit_price < 0
    OR p_unit_price > 999999999999.99::numeric
    OR p_tax_rate IS NULL
    OR p_tax_rate::text IN ('NaN', 'Infinity', '-Infinity')
    OR p_tax_rate < 0
    OR p_tax_rate > 1
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'SUPPLIER_PRICE_LIST_INVALID_ACTION';
  END IF;

  PERFORM public.assert_supplier_price_runtime_actor(
    p_tenant_id,
    p_supplier_id,
    p_actor_user_id,
    p_actor_employee_id
  );

  RETURN public.upsert_supplier_price_list_item_pre_actor_binding_unsafe(
    p_item_id,
    p_price_list_id,
    p_tenant_id,
    p_supplier_id,
    p_sku_id,
    p_unit_price,
    p_tax_rate,
    p_tax_inclusive,
    p_expected_version,
    p_actor_user_id,
    p_actor_employee_id,
    p_idempotency_key,
    p_proxy_reason
  );
END;
$$;

CREATE FUNCTION public.delete_supplier_price_list_item(
  p_item_id uuid,
  p_price_list_id uuid,
  p_tenant_id uuid,
  p_supplier_id uuid,
  p_expected_version integer,
  p_actor_user_id uuid,
  p_actor_employee_id uuid,
  p_idempotency_key text,
  p_proxy_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM public.assert_supplier_price_runtime_actor(
    p_tenant_id,
    p_supplier_id,
    p_actor_user_id,
    p_actor_employee_id
  );

  RETURN public.delete_supplier_price_list_item_pre_actor_binding_unsafe(
    p_item_id,
    p_price_list_id,
    p_tenant_id,
    p_supplier_id,
    p_expected_version,
    p_actor_user_id,
    p_actor_employee_id,
    p_idempotency_key,
    p_proxy_reason
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_supplier_price_list(
  uuid,
  uuid,
  uuid,
  text,
  text,
  text,
  timestamptz,
  timestamptz,
  uuid,
  uuid,
  text,
  text
)
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.create_supplier_price_list(
  uuid,
  uuid,
  uuid,
  text,
  text,
  text,
  timestamptz,
  timestamptz,
  uuid,
  uuid,
  text,
  text
)
TO service_role;

REVOKE ALL ON FUNCTION public.publish_supplier_price_list(
  uuid,
  uuid,
  uuid,
  integer,
  uuid,
  uuid,
  text,
  text
)
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.publish_supplier_price_list(
  uuid,
  uuid,
  uuid,
  integer,
  uuid,
  uuid,
  text,
  text
)
TO service_role;

REVOKE ALL ON FUNCTION public.create_supplier_price_list_version(
  uuid,
  uuid,
  uuid,
  uuid,
  integer,
  uuid,
  uuid,
  text,
  text
)
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.create_supplier_price_list_version(
  uuid,
  uuid,
  uuid,
  uuid,
  integer,
  uuid,
  uuid,
  text,
  text
)
TO service_role;

REVOKE ALL ON FUNCTION public.retire_supplier_price_list(
  uuid,
  uuid,
  uuid,
  integer,
  uuid,
  uuid,
  text,
  text
)
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.retire_supplier_price_list(
  uuid,
  uuid,
  uuid,
  integer,
  uuid,
  uuid,
  text,
  text
)
TO service_role;

REVOKE ALL ON FUNCTION public.upsert_supplier_price_list_item(
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  numeric,
  numeric,
  boolean,
  integer,
  uuid,
  uuid,
  text,
  text
)
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.upsert_supplier_price_list_item(
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  numeric,
  numeric,
  boolean,
  integer,
  uuid,
  uuid,
  text,
  text
)
TO service_role;

REVOKE ALL ON FUNCTION public.delete_supplier_price_list_item(
  uuid,
  uuid,
  uuid,
  uuid,
  integer,
  uuid,
  uuid,
  text,
  text
)
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.delete_supplier_price_list_item(
  uuid,
  uuid,
  uuid,
  uuid,
  integer,
  uuid,
  uuid,
  text,
  text
)
TO service_role;

REVOKE ALL ON TABLE public.supplier_price_lists
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.supplier_price_list_items
FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT ON TABLE public.supplier_price_lists TO service_role;
GRANT SELECT ON TABLE public.supplier_price_list_items TO service_role;

COMMIT;
