-- Rollback: forward-only. First disable product and SKU write routes and revoke
-- EXECUTE on replace_supplier_sku_unit_conversions. In a reviewed forward
-- migration, restore the previous function definitions and trigger set, restore
-- the service_role conversion-table grants only if a safe replacement command
-- is already deployed, and drop the v3 spec check only after auditing affected
-- rows. Preserve existing ownership and spec data; never infer historical NULL
-- owners or rewrite historical NULL spec_values during rollback.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

-- Refuse to harden an unrecognized schema. The three physical edge constraints
-- are retained; graph correctness is enforced by the atomic command below.
DO $$
BEGIN
  IF to_regclass('public.supplier_products') IS NULL
    OR to_regclass('public.supplier_skus') IS NULL
    OR to_regclass('public.supplier_sku_unit_conversions') IS NULL
    OR to_regclass('public.catalog_spec_definitions') IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_constraint
      WHERE conname = 'supplier_sku_unit_conversions_factor_check'
        AND conrelid = 'public.supplier_sku_unit_conversions'::regclass
    )
    OR NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_constraint
      WHERE conname = 'supplier_sku_unit_conversions_self_check'
        AND conrelid = 'public.supplier_sku_unit_conversions'::regclass
    )
    OR NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_constraint
      WHERE conname = 'supplier_sku_unit_conversions_sku_edge_key'
        AND conrelid = 'public.supplier_sku_unit_conversions'::regclass
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_PRODUCT_SCHEMA_STATE_UNSUPPORTED';
  END IF;
END;
$$;

-- Platform employees have a NULL tenant. IS NOT DISTINCT FROM is intentional:
-- it validates platform NULL/NULL and tenant UUID/UUID with one fail-closed rule.
CREATE OR REPLACE FUNCTION public.validate_supplier_proxy_actor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM employee.id
  FROM public.employees AS employee
  WHERE employee.id = NEW.acting_employee_id
    AND employee.tenant_id IS NOT DISTINCT FROM NEW.acting_tenant_id
    AND employee.status = 'active';

  IF NOT FOUND
    OR (
      TG_OP = 'INSERT'
      AND NEW.created_by_employee_id IS DISTINCT FROM NEW.acting_employee_id
    )
    OR NEW.updated_by_employee_id IS DISTINCT FROM NEW.acting_employee_id
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'SUPPLIER_PROXY_ACTOR_INVALID';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_supplier_product_ownership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_supplier_scope text;
  v_supplier_tenant_id uuid;
  v_category_scope text;
  v_category_tenant_id uuid;
  v_brand_scope text;
  v_brand_tenant_id uuid;
BEGIN
  IF TG_OP = 'INSERT'
    AND NEW.ownership_scope IS NULL
    AND NEW.owner_tenant_id IS NULL
  THEN
    NEW.ownership_scope := 'tenant';
    NEW.owner_tenant_id := NEW.acting_tenant_id;
  END IF;

  IF TG_OP = 'UPDATE'
    AND (
      NEW.ownership_scope IS DISTINCT FROM OLD.ownership_scope
      OR NEW.owner_tenant_id IS DISTINCT FROM OLD.owner_tenant_id
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'SUPPLIER_OWNERSHIP_IMMUTABLE';
  END IF;

  IF NEW.ownership_scope NOT IN ('platform', 'tenant')
    OR NOT (
      NEW.acting_tenant_id IS NOT DISTINCT FROM NEW.owner_tenant_id
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'PRODUCT_OWNERSHIP_CONFLICT';
  END IF;

  SELECT supplier.ownership_scope, supplier.owner_tenant_id
  INTO v_supplier_scope, v_supplier_tenant_id
  FROM public.suppliers AS supplier
  WHERE supplier.id = NEW.supplier_id
  FOR SHARE;

  IF NOT FOUND
    OR (
      NEW.ownership_scope = 'platform'
      AND (
        v_supplier_scope IS DISTINCT FROM 'platform'
        OR v_supplier_tenant_id IS NOT NULL
      )
    )
    OR (
      NEW.ownership_scope = 'tenant'
      AND NOT (
        (v_supplier_scope = 'platform' AND v_supplier_tenant_id IS NULL)
        OR (
          v_supplier_scope = 'tenant'
          AND v_supplier_tenant_id IS NOT DISTINCT FROM NEW.owner_tenant_id
        )
      )
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'PRODUCT_OWNERSHIP_CONFLICT';
  END IF;

  SELECT category.ownership_scope, category.owner_tenant_id
  INTO v_category_scope, v_category_tenant_id
  FROM public.catalog_categories AS category
  WHERE category.id = NEW.category_id
  FOR SHARE;

  IF NOT FOUND
    OR (
      NEW.ownership_scope = 'platform'
      AND v_category_scope IS DISTINCT FROM 'platform'
    )
    OR (
      NEW.ownership_scope = 'tenant'
      AND NOT (
        v_category_scope = 'platform'
        OR (
          v_category_scope = 'tenant'
          AND v_category_tenant_id IS NOT DISTINCT FROM NEW.owner_tenant_id
        )
      )
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'PRODUCT_OWNERSHIP_CONFLICT';
  END IF;

  SELECT brand.ownership_scope, brand.owner_tenant_id
  INTO v_brand_scope, v_brand_tenant_id
  FROM public.catalog_brands AS brand
  WHERE brand.id = NEW.brand_id
  FOR SHARE;

  IF NOT FOUND
    OR (
      NEW.ownership_scope = 'platform'
      AND v_brand_scope IS DISTINCT FROM 'platform'
    )
    OR (
      NEW.ownership_scope = 'tenant'
      AND NOT (
        v_brand_scope = 'platform'
        OR (
          v_brand_scope = 'tenant'
          AND v_brand_tenant_id IS NOT DISTINCT FROM NEW.owner_tenant_id
        )
      )
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'PRODUCT_OWNERSHIP_CONFLICT';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_supplier_product_tenant_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT (
    OLD.ownership_scope IN ('platform', 'tenant')
    AND OLD.owner_tenant_id IS NOT DISTINCT FROM NEW.acting_tenant_id
  )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'PRODUCT_OWNERSHIP_CONFLICT';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_supplier_sku_ownership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_product public.supplier_products%ROWTYPE;
BEGIN
  SELECT product.* INTO v_product
  FROM public.supplier_products AS product
  WHERE product.id = NEW.supplier_product_id
    AND product.supplier_id = NEW.supplier_id
  FOR SHARE;

  IF NOT FOUND OR v_product.ownership_scope IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'PRODUCT_OWNERSHIP_CONFLICT';
  END IF;

  IF TG_OP = 'INSERT'
    AND NEW.ownership_scope IS NULL
    AND NEW.owner_tenant_id IS NULL
  THEN
    NEW.ownership_scope := v_product.ownership_scope;
    NEW.owner_tenant_id := v_product.owner_tenant_id;
  END IF;

  IF TG_OP = 'UPDATE'
    AND (
      NEW.ownership_scope IS DISTINCT FROM OLD.ownership_scope
      OR NEW.owner_tenant_id IS DISTINCT FROM OLD.owner_tenant_id
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'SUPPLIER_OWNERSHIP_IMMUTABLE';
  END IF;

  IF NOT (
    v_product.ownership_scope IS NOT DISTINCT FROM NEW.ownership_scope
    AND v_product.owner_tenant_id IS NOT DISTINCT FROM NEW.owner_tenant_id
    AND NEW.acting_tenant_id IS NOT DISTINCT FROM v_product.owner_tenant_id
    AND NEW.ownership_scope IN ('platform', 'tenant')
  )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'PRODUCT_OWNERSHIP_CONFLICT';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_supplier_sku_tenant_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT (
    OLD.ownership_scope IN ('platform', 'tenant')
    AND OLD.owner_tenant_id IS NOT DISTINCT FROM NEW.acting_tenant_id
  )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'PRODUCT_OWNERSHIP_CONFLICT';
  END IF;
  RETURN NEW;
END;
$$;

-- NOT VALID preserves historical rows. PostgreSQL still enforces this check on
-- every new or changed row; the trigger below additionally forbids new NULLs.
ALTER TABLE public.supplier_skus
  ADD CONSTRAINT supplier_skus_v3_spec_values_object_check
    CHECK (
      spec_values IS NULL
      OR jsonb_typeof(spec_values) = 'object'
    ) NOT VALID;

CREATE FUNCTION public.supplier_sku_spec_value_is_valid(
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
      RETURN jsonb_typeof(p_value) = 'string';
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
        AND (
          NOT definition.is_required
          OR jsonb_array_length(p_value) > 0
        )
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

CREATE FUNCTION public.validate_supplier_sku_spec_values()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_category_id uuid;
BEGIN
  SELECT product.category_id INTO v_category_id
  FROM public.supplier_products AS product
  WHERE product.id = NEW.supplier_product_id
    AND product.supplier_id = NEW.supplier_id
  FOR SHARE;

  IF NOT FOUND
    OR jsonb_typeof(NEW.spec_values) IS DISTINCT FROM 'object'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'SPEC_TEMPLATE_VALIDATION_ERROR';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_object_keys(NEW.spec_values) AS spec_key(code)
    LEFT JOIN public.catalog_spec_definitions AS definition
      ON definition.category_id = v_category_id
      AND definition.status = 'active'
      AND definition.code = spec_key.code
    WHERE definition.id IS NULL
  )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'SPEC_TEMPLATE_VALIDATION_ERROR';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.catalog_spec_definitions AS definition
    WHERE definition.category_id = v_category_id
      AND definition.status = 'active'
      AND definition.is_required
      AND (
        NOT (NEW.spec_values ? definition.code)
        OR NEW.spec_values -> definition.code = 'null'::jsonb
      )
  )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'SPEC_TEMPLATE_VALIDATION_ERROR';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.catalog_spec_definitions AS definition
    WHERE definition.category_id = v_category_id
      AND definition.status = 'active'
      AND NEW.spec_values ? definition.code
      AND NOT public.supplier_sku_spec_value_is_valid(
        NEW.spec_values -> definition.code,
        definition
      )
  )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'SPEC_TEMPLATE_VALIDATION_ERROR';
  END IF;
  RETURN NEW;
END;
$$;

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
  v_purchase_unit_id uuid;
  v_base_unit_id uuid;
  v_purchase_status text;
  v_base_status text;
  v_purchase_dimension text;
  v_base_dimension text;
  v_edge_count integer;
  v_relevant_edge_count integer;
  v_path_count bigint;
  v_conversion_factor numeric;
BEGIN
  IF jsonb_typeof(p_edges) IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_edges) > 100
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'UNIT_CONVERSION_INVALID';
  END IF;

  IF EXISTS (
      SELECT 1
      FROM jsonb_array_elements(p_edges) AS raw_edge(value)
      WHERE jsonb_typeof(raw_edge.value) <> 'object'
        OR NOT (raw_edge.value ?& ARRAY[
          'from_unit_id', 'to_unit_id', 'factor'
        ])
        OR (
          SELECT count(*) FROM jsonb_object_keys(raw_edge.value)
        ) <> 3
        OR jsonb_typeof(raw_edge.value -> 'from_unit_id') <> 'string'
        OR jsonb_typeof(raw_edge.value -> 'to_unit_id') <> 'string'
        OR jsonb_typeof(raw_edge.value -> 'factor') <> 'string'
        OR raw_edge.value ->> 'factor'
          !~ '^(0|[1-9][0-9]{0,11})(\.[0-9]{1,6})?$'
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'UNIT_CONVERSION_INVALID';
  END IF;

  SELECT sku.purchase_unit_id, sku.base_unit_id
  INTO v_purchase_unit_id, v_base_unit_id
  FROM public.supplier_skus AS sku
  WHERE sku.id = p_supplier_sku_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'UNIT_CONVERSION_INVALID';
  END IF;

  SELECT purchase_unit.status, purchase_unit.unit_dimension,
    base_unit.status, base_unit.unit_dimension
  INTO v_purchase_status, v_purchase_dimension,
    v_base_status, v_base_dimension
  FROM public.catalog_units AS purchase_unit
  CROSS JOIN public.catalog_units AS base_unit
  WHERE purchase_unit.id = v_purchase_unit_id
    AND base_unit.id = v_base_unit_id
    AND purchase_unit.unit_dimension IS NOT DISTINCT FROM
      base_unit.unit_dimension
  FOR SHARE OF purchase_unit, base_unit;

  IF NOT FOUND
    OR v_purchase_status IS DISTINCT FROM 'active'
    OR v_base_status IS DISTINCT FROM 'active'
    OR NOT (
      v_purchase_dimension IS NOT DISTINCT FROM v_base_dimension
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'UNIT_CONVERSION_INVALID';
  END IF;

  WITH edges AS (
    SELECT
      (raw_edge.value ->> 'from_unit_id')::uuid AS from_unit_id,
      (raw_edge.value ->> 'to_unit_id')::uuid AS to_unit_id,
      (raw_edge.value ->> 'factor')::numeric AS factor
    FROM jsonb_array_elements(p_edges) AS raw_edge(value)
  )
  SELECT count(*) INTO v_edge_count FROM edges;

  IF v_purchase_unit_id = v_base_unit_id THEN
    IF v_edge_count <> 0 THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001', MESSAGE = 'UNIT_CONVERSION_INVALID';
    END IF;
    RETURN 1::numeric(18, 8);
  END IF;

  IF v_edge_count = 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'UNIT_CONVERSION_INVALID';
  END IF;

  -- Lock every referenced unit in deterministic order so an intermediate unit
  -- cannot be disabled between validation and edge replacement.
  PERFORM unit.id
  FROM public.catalog_units AS unit
  WHERE unit.id IN (
    SELECT (raw_edge.value ->> 'from_unit_id')::uuid
    FROM jsonb_array_elements(p_edges) AS raw_edge(value)
    UNION
    SELECT (raw_edge.value ->> 'to_unit_id')::uuid
    FROM jsonb_array_elements(p_edges) AS raw_edge(value)
  )
  ORDER BY unit.id
  FOR SHARE;

  IF EXISTS (
    WITH edges AS (
      SELECT
        (raw_edge.value ->> 'from_unit_id')::uuid AS from_unit_id,
        (raw_edge.value ->> 'to_unit_id')::uuid AS to_unit_id,
        (raw_edge.value ->> 'factor')::numeric AS factor
      FROM jsonb_array_elements(p_edges) AS raw_edge(value)
    )
    SELECT 1 FROM edges AS edge
    WHERE edge.factor <= 0 OR edge.from_unit_id = edge.to_unit_id
  )
  OR EXISTS (
    WITH edges AS (
      SELECT
        (raw_edge.value ->> 'from_unit_id')::uuid AS from_unit_id,
        (raw_edge.value ->> 'to_unit_id')::uuid AS to_unit_id
      FROM jsonb_array_elements(p_edges) AS raw_edge(value)
    )
    SELECT 1 FROM edges AS edge
    GROUP BY edge.from_unit_id, edge.to_unit_id HAVING count(*) > 1
  )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'UNIT_CONVERSION_INVALID';
  END IF;

  IF EXISTS (
    WITH edges AS (
      SELECT
        (raw_edge.value ->> 'from_unit_id')::uuid AS from_unit_id,
        (raw_edge.value ->> 'to_unit_id')::uuid AS to_unit_id
      FROM jsonb_array_elements(p_edges) AS raw_edge(value)
    )
    SELECT 1
    FROM edges AS edge
    LEFT JOIN public.catalog_units AS from_unit
      ON from_unit.id = edge.from_unit_id
    LEFT JOIN public.catalog_units AS to_unit
      ON to_unit.id = edge.to_unit_id
    WHERE from_unit.status IS DISTINCT FROM 'active'
      OR to_unit.status IS DISTINCT FROM 'active'
      OR NOT (
        from_unit.unit_dimension IS NOT DISTINCT FROM to_unit.unit_dimension
      )
      OR from_unit.unit_dimension IS DISTINCT FROM v_purchase_dimension
      OR to_unit.unit_dimension IS DISTINCT FROM v_purchase_dimension
  )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'UNIT_CONVERSION_INVALID';
  END IF;

  IF EXISTS (
    WITH RECURSIVE edges AS (
      SELECT
        (raw_edge.value ->> 'from_unit_id')::uuid AS from_unit_id,
        (raw_edge.value ->> 'to_unit_id')::uuid AS to_unit_id
      FROM jsonb_array_elements(p_edges) AS raw_edge(value)
    ), path AS (
      SELECT edge.from_unit_id, edge.to_unit_id,
        ARRAY[edge.from_unit_id, edge.to_unit_id]::uuid[] AS visited_units
      FROM edges AS edge
      UNION ALL
      SELECT path.from_unit_id, edge.to_unit_id,
        path.visited_units || edge.to_unit_id
      FROM path
      JOIN edges AS edge ON edge.from_unit_id = path.to_unit_id
      WHERE NOT (edge.to_unit_id = ANY(path.visited_units))
    )
    SELECT 1
    FROM path
    JOIN edges AS edge ON edge.from_unit_id = path.to_unit_id
    WHERE edge.to_unit_id = ANY(path.visited_units)
  )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'UNIT_CONVERSION_INVALID';
  END IF;

  WITH RECURSIVE edges AS (
    SELECT
      (raw_edge.value ->> 'from_unit_id')::uuid AS from_unit_id,
      (raw_edge.value ->> 'to_unit_id')::uuid AS to_unit_id,
      (raw_edge.value ->> 'factor')::numeric AS factor
    FROM jsonb_array_elements(p_edges) AS raw_edge(value)
  ), path AS (
    SELECT v_purchase_unit_id AS current_unit_id,
      1::numeric AS conversion_factor,
      ARRAY[v_purchase_unit_id]::uuid[] AS visited_units
    UNION ALL
    SELECT edge.to_unit_id,
      path.conversion_factor * edge.factor,
      path.visited_units || edge.to_unit_id
    FROM path
    JOIN edges AS edge ON edge.from_unit_id = path.current_unit_id
    WHERE NOT (edge.to_unit_id = ANY(path.visited_units))
  )
  SELECT count(*), min(path.conversion_factor)
  INTO v_path_count, v_conversion_factor
  FROM path
  WHERE path.current_unit_id = v_base_unit_id;

  IF v_path_count IS DISTINCT FROM 1 OR v_conversion_factor <= 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'UNIT_CONVERSION_INVALID';
  END IF;

  WITH RECURSIVE edges AS (
    SELECT
      (raw_edge.value ->> 'from_unit_id')::uuid AS from_unit_id,
      (raw_edge.value ->> 'to_unit_id')::uuid AS to_unit_id
    FROM jsonb_array_elements(p_edges) AS raw_edge(value)
  ), reachable_from_purchase(unit_id) AS (
    SELECT v_purchase_unit_id
    UNION
    SELECT edge.to_unit_id
    FROM reachable_from_purchase AS reachable
    JOIN edges AS edge ON edge.from_unit_id = reachable.unit_id
  ), reaches_base(unit_id) AS (
    SELECT v_base_unit_id
    UNION
    SELECT edge.from_unit_id
    FROM reaches_base AS reachable
    JOIN edges AS edge ON edge.to_unit_id = reachable.unit_id
  )
  SELECT count(*) INTO v_relevant_edge_count
  FROM edges AS edge
  WHERE edge.from_unit_id IN (SELECT unit_id FROM reachable_from_purchase)
    AND edge.to_unit_id IN (SELECT unit_id FROM reaches_base);

  IF v_relevant_edge_count IS DISTINCT FROM v_edge_count THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'UNIT_CONVERSION_INVALID';
  END IF;

  RETURN v_conversion_factor::numeric(18, 8);
EXCEPTION
  WHEN OTHERS THEN
    IF SQLSTATE = 'P0001' AND SQLERRM = 'UNIT_CONVERSION_INVALID' THEN
      RAISE;
    END IF;
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'UNIT_CONVERSION_INVALID';
END;
$$;

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
  sku public.supplier_skus%ROWTYPE;
  v_event public.supplier_command_events%ROWTYPE;
  v_request jsonb;
  v_response jsonb;
  v_conversion_factor numeric(18, 8);
BEGIN
  IF p_supplier_sku_id IS NULL
    OR p_expected_sku_version IS NULL OR p_expected_sku_version <= 0
    OR jsonb_typeof(p_edges) IS DISTINCT FROM 'array'
    OR p_actor_user_id IS NULL OR p_actor_employee_id IS NULL
    OR p_idempotency_key IS NULL OR btrim(p_idempotency_key) = ''
    OR char_length(p_idempotency_key) > 120
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'UNIT_CONVERSION_INVALID';
  END IF;

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

  v_request := jsonb_build_object(
    'supplier_sku_id', p_supplier_sku_id,
    'expected_sku_version', p_expected_sku_version,
    'edges', p_edges,
    'acting_tenant_id', p_acting_tenant_id,
    'actor_employee_id', p_actor_employee_id
  );

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'supplier-command:' || p_actor_user_id::text || ':' ||
        p_idempotency_key,
      0
    )
  );

  SELECT event.* INTO v_event
  FROM public.supplier_command_events AS event
  WHERE event.actor_user_id = p_actor_user_id
    AND event.idempotency_key = p_idempotency_key
  FOR UPDATE;

  IF FOUND THEN
    IF v_event.tenant_id IS DISTINCT FROM p_acting_tenant_id
      OR v_event.resource_type <> 'supplier_sku'
      OR v_event.resource_id <> p_supplier_sku_id
      OR v_event.command <> 'replace_supplier_sku_unit_conversions'
      OR v_event.from_state -> '_request' IS DISTINCT FROM v_request
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001', MESSAGE = 'SUPPLIER_IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN jsonb_set(v_event.to_state, '{idempotent}', 'true'::jsonb, true);
  END IF;

  SELECT supplier_sku.* INTO sku
  FROM public.supplier_skus AS supplier_sku
  WHERE supplier_sku.id = p_supplier_sku_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'SUPPLIER_SKU_NOT_FOUND';
  END IF;

  IF sku.ownership_scope NOT IN ('platform', 'tenant')
    OR NOT (
      sku.owner_tenant_id IS NOT DISTINCT FROM p_acting_tenant_id
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'PRODUCT_OWNERSHIP_CONFLICT';
  END IF;

  IF sku.version IS DISTINCT FROM p_expected_sku_version THEN
    RETURN jsonb_build_object(
      'status', 'version_conflict',
      'error_code', 'SUPPLIER_VERSION_CONFLICT',
      'version', sku.version
    );
  END IF;

  v_conversion_factor :=
    public.validate_supplier_sku_unit_conversion_graph(
      p_supplier_sku_id,
      p_edges
    );

  DELETE FROM public.supplier_sku_unit_conversions AS conversion
  WHERE conversion.supplier_sku_id = p_supplier_sku_id;

  INSERT INTO public.supplier_sku_unit_conversions (
    supplier_sku_id,
    from_unit_id,
    to_unit_id,
    factor,
    status,
    version,
    created_by_employee_id,
    updated_by_employee_id
  )
  SELECT
    p_supplier_sku_id,
    (raw_edge.value ->> 'from_unit_id')::uuid,
    (raw_edge.value ->> 'to_unit_id')::uuid,
    (raw_edge.value ->> 'factor')::numeric(18, 6),
    'active',
    1,
    p_actor_employee_id,
    p_actor_employee_id
  FROM jsonb_array_elements(p_edges) AS raw_edge(value);

  UPDATE public.supplier_skus AS supplier_sku
  SET base_unit_conversion = v_conversion_factor,
    version = sku.version + 1,
    acting_tenant_id = p_acting_tenant_id,
    acting_employee_id = p_actor_employee_id,
    operation_source = CASE
      WHEN p_acting_tenant_id IS NULL THEN 'platform'
      ELSE 'tenant_proxy'
    END,
    proxy_reason = CASE
      WHEN p_acting_tenant_id IS NULL THEN NULL
      ELSE '维护 SKU 单位换算'
    END,
    updated_by_employee_id = p_actor_employee_id,
    updated_at = pg_catalog.now()
  WHERE supplier_sku.id = p_supplier_sku_id;

  v_response := jsonb_build_object(
    'status', 'updated',
    'idempotent', false,
    'supplier_sku_id', p_supplier_sku_id,
    'version', sku.version + 1,
    'base_unit_conversion', v_conversion_factor::text,
    'edges', p_edges
  );

  INSERT INTO public.supplier_command_events (
    tenant_id,
    resource_type,
    resource_id,
    command,
    from_state,
    to_state,
    reason,
    actor_user_id,
    actor_employee_id,
    idempotency_key,
    result_version
  )
  VALUES (
    p_acting_tenant_id,
    'supplier_sku',
    p_supplier_sku_id,
    'replace_supplier_sku_unit_conversions',
    jsonb_build_object('_request', v_request),
    v_response,
    '维护 SKU 单位换算',
    p_actor_user_id,
    p_actor_employee_id,
    p_idempotency_key,
    sku.version + 1
  );

  RETURN v_response;
END;
$$;

-- Normalize the affected trigger set so every row is checked exactly once.
DROP TRIGGER tr_supplier_products_validate_proxy_actor
  ON public.supplier_products;
DROP TRIGGER tr_supplier_products_v2_guard_ownership
  ON public.supplier_products;
DROP TRIGGER tr_supplier_products_v2_guard_tenant_write
  ON public.supplier_products;
DROP TRIGGER tr_supplier_skus_validate_proxy_actor
  ON public.supplier_skus;
DROP TRIGGER tr_supplier_skus_guard_ownership
  ON public.supplier_skus;
DROP TRIGGER tr_supplier_skus_guard_tenant_write
  ON public.supplier_skus;

CREATE TRIGGER tr_supplier_products_v3_guard_actor_scope
BEFORE INSERT OR UPDATE ON public.supplier_products
FOR EACH ROW
EXECUTE FUNCTION public.validate_supplier_proxy_actor();

CREATE TRIGGER tr_supplier_products_v3_guard_ownership
BEFORE INSERT OR UPDATE OF
  supplier_id, category_id, brand_id, ownership_scope, owner_tenant_id
ON public.supplier_products
FOR EACH ROW
EXECUTE FUNCTION public.guard_supplier_product_ownership();

CREATE TRIGGER tr_supplier_products_v3_guard_write_scope
BEFORE UPDATE ON public.supplier_products
FOR EACH ROW
EXECUTE FUNCTION public.guard_supplier_product_tenant_write();

CREATE TRIGGER tr_supplier_skus_v3_guard_actor_scope
BEFORE INSERT OR UPDATE ON public.supplier_skus
FOR EACH ROW
EXECUTE FUNCTION public.validate_supplier_proxy_actor();

CREATE TRIGGER tr_supplier_skus_v3_guard_ownership
BEFORE INSERT OR UPDATE OF
  supplier_id, supplier_product_id, ownership_scope, owner_tenant_id
ON public.supplier_skus
FOR EACH ROW
EXECUTE FUNCTION public.guard_supplier_sku_ownership();

CREATE TRIGGER tr_supplier_skus_v3_guard_write_scope
BEFORE UPDATE ON public.supplier_skus
FOR EACH ROW
EXECUTE FUNCTION public.guard_supplier_sku_tenant_write();

CREATE TRIGGER tr_supplier_skus_v3_validate_specs
BEFORE INSERT OR UPDATE ON public.supplier_skus
FOR EACH ROW
EXECUTE FUNCTION public.validate_supplier_sku_spec_values();

REVOKE ALL ON FUNCTION public.validate_supplier_proxy_actor()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.guard_supplier_product_ownership()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.guard_supplier_product_tenant_write()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.guard_supplier_sku_ownership()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.guard_supplier_sku_tenant_write()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.supplier_sku_spec_value_is_valid(
  jsonb, public.catalog_spec_definitions
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.validate_supplier_sku_spec_values()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.validate_supplier_sku_unit_conversion_graph(
  uuid, jsonb
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.replace_supplier_sku_unit_conversions(
  uuid, integer, jsonb, uuid, uuid, uuid, text
) FROM PUBLIC, anon, authenticated, service_role;

ALTER TABLE public.supplier_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_products FORCE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_skus ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_skus FORCE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_sku_unit_conversions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_sku_unit_conversions FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.supplier_sku_unit_conversions
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.supplier_sku_unit_conversions
  TO service_role;

GRANT EXECUTE ON FUNCTION public.replace_supplier_sku_unit_conversions(
  uuid, integer, jsonb, uuid, uuid, uuid, text
) TO service_role;

COMMIT;
