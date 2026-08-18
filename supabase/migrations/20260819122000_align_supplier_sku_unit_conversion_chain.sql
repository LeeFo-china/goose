-- Rollback: forward-only. Revoke EXECUTE on the v3 replacement command and
-- restore service_role EXECUTE on v2 only as an emergency rollback. Keep the
-- v2 validator and all SKU/conversion/event rows so no business data is lost.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

CREATE FUNCTION public.validate_supplier_sku_unit_conversion_graph_v2(
  p_purchase_unit_id uuid,
  p_base_unit_id uuid,
  p_edges jsonb
)
RETURNS numeric(18, 8)
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_edge_count integer;
  v_reachable_edge_count integer;
  v_path_count bigint;
  v_conversion_factor numeric(18, 8);
BEGIN
  IF p_purchase_unit_id IS NULL
    OR p_base_unit_id IS NULL
    OR jsonb_typeof(p_edges) IS DISTINCT FROM 'array'
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

  WITH edges AS (
    SELECT
      (raw_edge.value ->> 'from_unit_id')::uuid AS from_unit_id,
      (raw_edge.value ->> 'to_unit_id')::uuid AS to_unit_id,
      (raw_edge.value ->> 'factor')::numeric(18, 6) AS factor
    FROM jsonb_array_elements(p_edges) AS raw_edge(value)
  )
  SELECT count(*) INTO v_edge_count FROM edges;

  -- Lock the complete unit set in one deterministic order. The chain is
  -- product-specific, so an edge may intentionally bridge unit dimensions.
  PERFORM unit.id
  FROM public.catalog_units AS unit
  WHERE unit.id IN (
    SELECT p_purchase_unit_id
    UNION
    SELECT p_base_unit_id
    UNION
    SELECT (raw_edge.value ->> 'from_unit_id')::uuid
    FROM jsonb_array_elements(p_edges) AS raw_edge(value)
    UNION
    SELECT (raw_edge.value ->> 'to_unit_id')::uuid
    FROM jsonb_array_elements(p_edges) AS raw_edge(value)
  )
  ORDER BY unit.id
  FOR SHARE;

  IF EXISTS (
    WITH required_units(unit_id) AS (
      SELECT p_purchase_unit_id
      UNION
      SELECT p_base_unit_id
      UNION
      SELECT (raw_edge.value ->> 'from_unit_id')::uuid
      FROM jsonb_array_elements(p_edges) AS raw_edge(value)
      UNION
      SELECT (raw_edge.value ->> 'to_unit_id')::uuid
      FROM jsonb_array_elements(p_edges) AS raw_edge(value)
    )
    SELECT 1
    FROM required_units AS required
    LEFT JOIN public.catalog_units AS unit ON unit.id = required.unit_id
    WHERE unit.status IS DISTINCT FROM 'active'
  )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'UNIT_CONVERSION_INVALID';
  END IF;

  IF EXISTS (
    WITH edges AS (
      SELECT
        (raw_edge.value ->> 'from_unit_id')::uuid AS from_unit_id,
        (raw_edge.value ->> 'to_unit_id')::uuid AS to_unit_id,
        (raw_edge.value ->> 'factor')::numeric(18, 6) AS factor
      FROM jsonb_array_elements(p_edges) AS raw_edge(value)
    )
    SELECT 1
    FROM edges AS edge
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
  OR EXISTS (
    WITH edges AS (
      SELECT (raw_edge.value ->> 'from_unit_id')::uuid AS from_unit_id
      FROM jsonb_array_elements(p_edges) AS raw_edge(value)
    )
    SELECT 1 FROM edges AS edge
    GROUP BY edge.from_unit_id HAVING count(*) > 1
  )
  OR EXISTS (
    WITH edges AS (
      SELECT (raw_edge.value ->> 'to_unit_id')::uuid AS to_unit_id
      FROM jsonb_array_elements(p_edges) AS raw_edge(value)
    )
    SELECT 1 FROM edges AS edge
    GROUP BY edge.to_unit_id HAVING count(*) > 1
  )
  OR EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_edges) AS raw_edge(value)
    WHERE (raw_edge.value ->> 'to_unit_id')::uuid = p_purchase_unit_id
  )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'UNIT_CONVERSION_INVALID';
  END IF;

  WITH RECURSIVE edges AS (
    SELECT
      (raw_edge.value ->> 'from_unit_id')::uuid AS from_unit_id,
      (raw_edge.value ->> 'to_unit_id')::uuid AS to_unit_id,
      (raw_edge.value ->> 'factor')::numeric(18, 6) AS factor
    FROM jsonb_array_elements(p_edges) AS raw_edge(value)
  ), path AS (
    SELECT
      p_purchase_unit_id AS current_unit_id,
      1::numeric AS conversion_factor,
      ARRAY[p_purchase_unit_id]::uuid[] AS visited_units
    UNION ALL
    SELECT
      edge.to_unit_id,
      path.conversion_factor * edge.factor,
      path.visited_units || edge.to_unit_id
    FROM path
    JOIN edges AS edge ON edge.from_unit_id = path.current_unit_id
    WHERE NOT (edge.to_unit_id = ANY(path.visited_units))
  )
  SELECT count(*), min(path.conversion_factor)
  INTO v_path_count, v_conversion_factor
  FROM path
  WHERE path.current_unit_id = p_base_unit_id;

  IF v_path_count IS DISTINCT FROM 1
    OR v_conversion_factor IS NULL
    OR v_conversion_factor <= 0
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'UNIT_CONVERSION_INVALID';
  END IF;

  WITH RECURSIVE edges AS (
    SELECT
      (raw_edge.value ->> 'from_unit_id')::uuid AS from_unit_id,
      (raw_edge.value ->> 'to_unit_id')::uuid AS to_unit_id
    FROM jsonb_array_elements(p_edges) AS raw_edge(value)
  ), reachable_from_purchase(unit_id, visited_units) AS (
    SELECT p_purchase_unit_id, ARRAY[p_purchase_unit_id]::uuid[]
    UNION ALL
    SELECT edge.to_unit_id, reachable.visited_units || edge.to_unit_id
    FROM reachable_from_purchase AS reachable
    JOIN edges AS edge ON edge.from_unit_id = reachable.unit_id
    WHERE NOT (edge.to_unit_id = ANY(reachable.visited_units))
  )
  SELECT count(*) INTO v_reachable_edge_count
  FROM edges AS edge
  JOIN reachable_from_purchase AS reachable
    ON reachable.unit_id = edge.from_unit_id;

  IF v_reachable_edge_count IS DISTINCT FROM v_edge_count THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'UNIT_CONVERSION_INVALID';
  END IF;

  RETURN v_conversion_factor;
EXCEPTION
  WHEN OTHERS THEN
    IF SQLSTATE = 'P0001' AND SQLERRM = 'UNIT_CONVERSION_INVALID' THEN
      RAISE;
    END IF;
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'UNIT_CONVERSION_INVALID';
END;
$$;

CREATE OR REPLACE FUNCTION public.prepare_supplier_sku_unit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_purchase_unit_status text;
  v_purchase_unit_base_id uuid;
  v_purchase_unit_conversion numeric(18, 6);
  v_product_status text;
  v_edges jsonb;
  v_graph_factor numeric(18, 8);
BEGIN
  SELECT unit.status, unit.base_unit_id, unit.conversion_factor
  INTO
    v_purchase_unit_status,
    v_purchase_unit_base_id,
    v_purchase_unit_conversion
  FROM public.catalog_units AS unit
  WHERE unit.id = NEW.purchase_unit_id
  FOR SHARE;

  IF NOT FOUND OR v_purchase_unit_status <> 'active' THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'SUPPLIER_CATALOG_REFERENCE_INVALID';
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.base_unit_id := COALESCE(
      v_purchase_unit_base_id,
      NEW.purchase_unit_id
    );
    NEW.base_unit_conversion := CASE
      WHEN v_purchase_unit_base_id IS NULL THEN 1
      ELSE v_purchase_unit_conversion::numeric(18, 8)
    END;
  ELSIF NEW.purchase_unit_id IS DISTINCT FROM OLD.purchase_unit_id
    OR NEW.base_unit_id IS DISTINCT FROM OLD.base_unit_id
    OR NEW.base_unit_conversion IS DISTINCT FROM OLD.base_unit_conversion
  THEN
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'from_unit_id', conversion.from_unit_id::text,
          'to_unit_id', conversion.to_unit_id::text,
          'factor', conversion.factor::text
        )
        ORDER BY conversion.from_unit_id, conversion.to_unit_id
      ),
      '[]'::jsonb
    )
    INTO v_edges
    FROM public.supplier_sku_unit_conversions AS conversion
    WHERE conversion.supplier_sku_id = NEW.id
      AND conversion.status = 'active';

    v_graph_factor :=
      public.validate_supplier_sku_unit_conversion_graph_v2(
        NEW.purchase_unit_id,
        NEW.base_unit_id,
        v_edges
      );

    IF v_graph_factor IS DISTINCT FROM NEW.base_unit_conversion THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001', MESSAGE = 'UNIT_CONVERSION_INVALID';
    END IF;
  END IF;

  SELECT product.status INTO v_product_status
  FROM public.supplier_products AS product
  WHERE product.id = NEW.supplier_product_id
    AND product.supplier_id = NEW.supplier_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'SUPPLIER_PRODUCT_NOT_FOUND';
  END IF;

  IF NEW.status = 'active' AND v_product_status = 'inactive' THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'SUPPLIER_SKU_STATE_CONFLICT';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.prepare_supplier_sku_unit()
FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER tr_supplier_skus_prepare_unit ON public.supplier_skus;

CREATE TRIGGER tr_supplier_skus_prepare_unit
BEFORE INSERT OR UPDATE OF
  supplier_id,
  supplier_product_id,
  purchase_unit_id,
  base_unit_id,
  base_unit_conversion,
  status
ON public.supplier_skus
FOR EACH ROW
EXECUTE FUNCTION public.prepare_supplier_sku_unit();

CREATE FUNCTION public.replace_supplier_sku_unit_conversions_v3(
  p_ownership_scope text,
  p_tenant_id uuid,
  p_tenant_supplier_id uuid,
  p_supplier_id uuid,
  p_supplier_product_id uuid,
  p_supplier_sku_id uuid,
  p_expected_sku_version integer,
  p_purchase_unit_id uuid,
  p_base_unit_id uuid,
  p_edges jsonb,
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
  v_sku public.supplier_skus%ROWTYPE;
  v_event public.supplier_command_events%ROWTYPE;
  v_request jsonb;
  v_before jsonb;
  v_response jsonb;
  v_factor numeric(18, 8);
BEGIN
  IF p_supplier_product_id IS NULL
    OR p_supplier_sku_id IS NULL
    OR COALESCE(p_expected_sku_version, 0) < 1
    OR p_purchase_unit_id IS NULL
    OR p_base_unit_id IS NULL
    OR jsonb_typeof(p_edges) IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_edges) > 100
    OR p_idempotency_key IS NULL
    OR btrim(p_idempotency_key) = ''
    OR char_length(p_idempotency_key) > 120
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'UNIT_CONVERSION_INVALID';
  END IF;

  PERFORM public.assert_supplier_product_v2_context(
    p_ownership_scope,
    p_tenant_id,
    p_tenant_supplier_id,
    p_supplier_id,
    p_actor_user_id,
    p_actor_employee_id
  );

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'supplier-command:' || p_actor_user_id::text || ':' ||
        btrim(p_idempotency_key),
      0
    )
  );

  SELECT sku.* INTO v_sku
  FROM public.supplier_skus AS sku
  JOIN public.supplier_products AS product
    ON product.id = sku.supplier_product_id
    AND product.supplier_id = sku.supplier_id
  WHERE sku.id = p_supplier_sku_id
    AND sku.supplier_id = p_supplier_id
    AND sku.supplier_product_id = p_supplier_product_id
    AND sku.ownership_scope = p_ownership_scope
    AND sku.owner_tenant_id IS NOT DISTINCT FROM CASE
      WHEN p_ownership_scope = 'tenant' THEN p_tenant_id
      ELSE NULL
    END
    AND product.ownership_scope = p_ownership_scope
    AND product.owner_tenant_id IS NOT DISTINCT FROM sku.owner_tenant_id
  FOR UPDATE OF sku;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'status', 'not_found',
      'error_code', 'SUPPLIER_SKU_NOT_FOUND'
    );
  END IF;

  v_request := jsonb_build_object(
    'ownership_scope', p_ownership_scope,
    'tenant_id', p_tenant_id,
    'tenant_supplier_id', p_tenant_supplier_id,
    'supplier_id', p_supplier_id,
    'supplier_product_id', p_supplier_product_id,
    'supplier_sku_id', p_supplier_sku_id,
    'expected_sku_version', p_expected_sku_version,
    'purchase_unit_id', p_purchase_unit_id,
    'base_unit_id', p_base_unit_id,
    'edges', p_edges,
    'actor_employee_id', p_actor_employee_id
  );

  SELECT event.* INTO v_event
  FROM public.supplier_command_events AS event
  WHERE event.actor_user_id = p_actor_user_id
    AND event.idempotency_key = btrim(p_idempotency_key)
  FOR UPDATE;

  IF FOUND THEN
    IF v_event.tenant_id IS DISTINCT FROM p_tenant_id
      OR v_event.resource_type <> 'supplier_sku'
      OR v_event.resource_id <> p_supplier_sku_id
      OR v_event.command <> 'supplier_sku_unit_conversions_v3'
      OR v_event.from_state -> '_request' IS DISTINCT FROM v_request
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001', MESSAGE = 'SUPPLIER_IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN jsonb_set(v_event.to_state, '{idempotent}', 'true'::jsonb, true);
  END IF;

  IF v_sku.version IS DISTINCT FROM p_expected_sku_version THEN
    RETURN jsonb_build_object(
      'status', 'version_conflict',
      'error_code', 'SUPPLIER_SKU_VERSION_CONFLICT',
      'version', v_sku.version,
      'current_status', v_sku.status
    );
  END IF;

  v_before := to_jsonb(v_sku);
  v_factor := public.validate_supplier_sku_unit_conversion_graph_v2(
    p_purchase_unit_id,
    p_base_unit_id,
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
    (edge.value ->> 'from_unit_id')::uuid,
    (edge.value ->> 'to_unit_id')::uuid,
    (edge.value ->> 'factor')::numeric(18, 6),
    'active',
    1,
    p_actor_employee_id,
    p_actor_employee_id
  FROM jsonb_array_elements(p_edges) AS edge(value);

  UPDATE public.supplier_skus AS sku
  SET purchase_unit_id = p_purchase_unit_id,
    base_unit_id = p_base_unit_id,
    base_unit_conversion = v_factor,
    version = sku.version + 1,
    acting_tenant_id = CASE
      WHEN p_ownership_scope = 'tenant' THEN p_tenant_id ELSE NULL END,
    acting_employee_id = p_actor_employee_id,
    operation_source = CASE
      WHEN p_ownership_scope = 'tenant' THEN 'tenant' ELSE 'platform' END,
    proxy_reason = NULL,
    updated_by_employee_id = p_actor_employee_id,
    updated_at = pg_catalog.now()
  WHERE sku.id = p_supplier_sku_id
  RETURNING * INTO v_sku;

  v_response := jsonb_build_object(
    'status', 'updated',
    'idempotent', false,
    'sku', to_jsonb(v_sku),
    'version', v_sku.version,
    'base_unit_conversion', v_factor::text,
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
  ) VALUES (
    p_tenant_id,
    'supplier_sku',
    p_supplier_sku_id,
    'supplier_sku_unit_conversions_v3',
    v_before || jsonb_build_object('_request', v_request),
    v_response,
    NULL,
    p_actor_user_id,
    p_actor_employee_id,
    btrim(p_idempotency_key),
    v_sku.version
  );

  RETURN v_response;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_supplier_sku_unit_conversion_graph_v2(
  uuid, uuid, jsonb
)
FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.replace_supplier_sku_unit_conversions_v2(
  text, uuid, uuid, uuid, uuid, uuid, integer, jsonb, uuid, uuid, text
)
FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.replace_supplier_sku_unit_conversions_v3(
  text, uuid, uuid, uuid, uuid, uuid, integer, uuid, uuid, jsonb,
  uuid, uuid, text
)
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.replace_supplier_sku_unit_conversions_v3(
  text, uuid, uuid, uuid, uuid, uuid, integer, uuid, uuid, jsonb,
  uuid, uuid, text
)
TO service_role;

COMMIT;
