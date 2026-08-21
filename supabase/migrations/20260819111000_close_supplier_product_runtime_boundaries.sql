-- Rollback: forward-only. First disable product and SKU writes and revoke the
-- public unit-conversion command. In a reviewed forward migration, restore the
-- previous wrapper definitions only after retaining the actor, visibility,
-- precision and deterministic-lock guarantees. Restore a legacy writer ACL
-- only after replacing that writer with an equivalent audited command.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

-- These historical SECURITY DEFINER functions had default PUBLIC EXECUTE or
-- stale grants. They are not safe v2 command surfaces and must remain closed.
REVOKE ALL ON FUNCTION public.create_platform_supplier_product(
  uuid, uuid, text, text, uuid, uuid, text, uuid, uuid, text
)
FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.create_platform_supplier_sku(
  uuid, uuid, uuid, text, text, text, text, uuid, uuid, uuid, text
)
FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.create_supplier_product(
  uuid, uuid, uuid, text, text, uuid, uuid, text, uuid, uuid, text, text
)
FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.create_supplier_sku(
  uuid, uuid, uuid, uuid, text, text, text, text, uuid, boolean, boolean,
  boolean, uuid, uuid, text, text
)
FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.mutate_supplier_product_pre_v2_unsafe(
  uuid, uuid, uuid, text, integer, uuid, uuid, text, text
)
FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.mutate_supplier_sku_for_product_pre_v2_unsafe(
  uuid, uuid, uuid, uuid, text, integer, uuid, uuid, text, text
)
FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.supplier_sku_spec_value_is_valid(
  p_value jsonb,
  definition public.catalog_spec_definitions
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_text text;
  v_date date;
BEGIN
  IF p_value IS NULL OR p_value = 'null'::jsonb THEN
    RETURN false;
  END IF;

  CASE definition.value_type
    WHEN 'text' THEN
      RETURN jsonb_typeof(p_value) = 'string'
        AND btrim(p_value #>> '{}') <> '';
    WHEN 'number' THEN
      RETURN jsonb_typeof(p_value) = 'number';
    WHEN 'boolean' THEN
      RETURN jsonb_typeof(p_value) = 'boolean';
    WHEN 'date' THEN
      IF jsonb_typeof(p_value) <> 'string' THEN
        RETURN false;
      END IF;
      v_text := p_value #>> '{}';
      IF v_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
        RETURN false;
      END IF;
      v_date := to_date(v_text, 'YYYY-MM-DD');
      RETURN to_char(v_date, 'YYYY-MM-DD') = v_text;
    WHEN 'single_enum' THEN
      RETURN jsonb_typeof(p_value) = 'string'
        AND EXISTS (
          SELECT 1
          FROM jsonb_array_elements(definition.enum_options) AS option(value)
          WHERE option.value = p_value
        );
    WHEN 'multi_enum' THEN
      RETURN jsonb_typeof(p_value) = 'array'
        AND (NOT definition.is_required OR jsonb_array_length(p_value) > 0)
        AND NOT EXISTS (
          SELECT 1
          FROM jsonb_array_elements(p_value) AS element(value)
          WHERE jsonb_typeof(element.value) <> 'string'
            OR NOT EXISTS (
              SELECT 1
              FROM jsonb_array_elements(definition.enum_options) AS option(value)
              WHERE option.value = element.value
            )
        )
        AND (
          SELECT count(*) FROM jsonb_array_elements(p_value)
        ) = (
          SELECT count(DISTINCT element.value)
          FROM jsonb_array_elements(p_value) AS element(value)
        );
    ELSE
      RETURN false;
  END CASE;
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'SPEC_TEMPLATE_VALIDATION_ERROR';
END;
$$;

ALTER FUNCTION public.validate_supplier_sku_unit_conversion_graph(uuid, jsonb)
  RENAME TO validate_supplier_sku_unit_conversion_graph_pre_precision_unsafe;

REVOKE ALL ON FUNCTION
  public.validate_supplier_sku_unit_conversion_graph_pre_precision_unsafe(
    uuid, jsonb
  )
FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.validate_supplier_sku_unit_conversion_graph(
  p_supplier_sku_id uuid,
  p_edges jsonb
)
RETURNS numeric(18, 8)
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_factor numeric(18, 8);
BEGIN
  IF jsonb_typeof(p_edges) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'UNIT_CONVERSION_INVALID';
  END IF;

  -- One globally ordered lock set covers purchase/base and every edge unit.
  -- The renamed validator may lock them again, but can no longer invert order.
  PERFORM unit.id
  FROM public.catalog_units AS unit
  WHERE unit.id IN (
    SELECT (raw_edge.value ->> 'from_unit_id')::uuid
    FROM jsonb_array_elements(p_edges) AS raw_edge(value)
    UNION
    SELECT (raw_edge.value ->> 'to_unit_id')::uuid
    FROM jsonb_array_elements(p_edges) AS raw_edge(value)
    UNION
    SELECT sku.purchase_unit_id
    FROM public.supplier_skus AS sku
    WHERE sku.id = p_supplier_sku_id
    UNION
    SELECT sku.base_unit_id
    FROM public.supplier_skus AS sku
    WHERE sku.id = p_supplier_sku_id
  )
  ORDER BY unit.id
  FOR SHARE;

  v_factor :=
    public.validate_supplier_sku_unit_conversion_graph_pre_precision_unsafe(
      p_supplier_sku_id,
      p_edges
    );

  IF v_factor IS NULL OR v_factor <= 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'UNIT_CONVERSION_INVALID';
  END IF;

  RETURN v_factor;
EXCEPTION
  WHEN OTHERS THEN
    IF SQLSTATE = 'P0001' AND SQLERRM = 'UNIT_CONVERSION_INVALID' THEN
      RAISE;
    END IF;
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'UNIT_CONVERSION_INVALID';
END;
$$;

REVOKE ALL ON FUNCTION
  public.validate_supplier_sku_unit_conversion_graph(uuid, jsonb)
FROM PUBLIC, anon, authenticated, service_role;

ALTER FUNCTION public.replace_supplier_sku_unit_conversions(
  uuid, integer, jsonb, uuid, uuid, uuid, text
)
  RENAME TO replace_supplier_sku_unit_conversions_pre_visibility_unsafe;

REVOKE ALL ON FUNCTION
  public.replace_supplier_sku_unit_conversions_pre_visibility_unsafe(
    uuid, integer, jsonb, uuid, uuid, uuid, text
  )
FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.replace_supplier_sku_unit_conversions(
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
  FOR SHARE;

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
