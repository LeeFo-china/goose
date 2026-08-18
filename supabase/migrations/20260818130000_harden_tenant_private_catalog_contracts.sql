-- Rollback: forward-only. Disable the catalog write routes, revoke EXECUTE on
-- the command functions added or replaced here, then install compensating
-- functions and constraints in a later migration. Preserve catalog rows,
-- supplier command events, ownership columns, and all previously applied
-- migrations; do not reverse this migration by deleting business data.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

-- Extend the existing append-only command ledger for spec and suggestion writes.
ALTER TABLE public.supplier_command_events
  DROP CONSTRAINT supplier_command_events_resource_type_check;

ALTER TABLE public.supplier_command_events
  ADD CONSTRAINT supplier_command_events_resource_type_check CHECK (
    resource_type IN (
      'supplier',
      'supplier_qualification_type',
      'supplier_qualification',
      'supplier_service_region',
      'supplier_address',
      'supplier_contact',
      'catalog_category',
      'catalog_brand',
      'catalog_unit',
      'catalog_spec_definition',
      'catalog_unit_suggestion',
      'tenant_supplier',
      'supplier_contract',
      'supplier_product',
      'supplier_sku',
      'supplier_price_list',
      'supplier_purchase_order',
      'supplier_purchase_requisition',
      'supplier_payment_request',
      'supplier_payment'
    )
  ) NOT VALID;

ALTER TABLE public.supplier_command_events
  VALIDATE CONSTRAINT supplier_command_events_resource_type_check;

ALTER TABLE public.catalog_unit_suggestions
  ADD COLUMN version integer NOT NULL DEFAULT 1;

ALTER TABLE public.catalog_unit_suggestions
  ADD CONSTRAINT catalog_unit_suggestions_version_check CHECK (version > 0);

CREATE INDEX catalog_categories_tenant_mapping_idx
ON public.catalog_categories(
  owner_tenant_id,
  mapped_platform_category_id,
  status,
  id
)
WHERE ownership_scope = 'tenant'
  AND mapped_platform_category_id IS NOT NULL;

CREATE INDEX catalog_brands_tenant_mapping_idx
ON public.catalog_brands(
  owner_tenant_id,
  mapped_platform_brand_id,
  status,
  id
)
WHERE ownership_scope = 'tenant'
  AND mapped_platform_brand_id IS NOT NULL;

CREATE INDEX catalog_spec_definitions_source_platform_idx
ON public.catalog_spec_definitions(
  source_platform_spec_id,
  owner_tenant_id,
  status,
  id
)
WHERE ownership_scope = 'tenant'
  AND source_platform_spec_id IS NOT NULL;

CREATE FUNCTION public.get_supplier_catalog_command_event(
  p_tenant_id uuid,
  p_actor_user_id uuid,
  p_idempotency_key text,
  p_resource_type text,
  p_command text,
  p_request jsonb
)
RETURNS public.supplier_command_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_event public.supplier_command_events%ROWTYPE;
BEGIN
  IF p_actor_user_id IS NULL
    OR p_idempotency_key IS NULL
    OR btrim(p_idempotency_key) = ''
    OR char_length(p_idempotency_key) > 120
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023', MESSAGE = 'SUPPLIER_IDEMPOTENCY_CONFLICT';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'supplier-catalog-command:' || p_actor_user_id::text || ':' || p_idempotency_key,
      0
    )
  );

  SELECT event.* INTO v_event
  FROM public.supplier_command_events AS event
  WHERE event.actor_user_id = p_actor_user_id
    AND event.idempotency_key = p_idempotency_key
  FOR UPDATE;

  IF FOUND
    AND (
      v_event.tenant_id IS DISTINCT FROM p_tenant_id
      OR v_event.resource_type IS DISTINCT FROM p_resource_type
      OR v_event.command IS DISTINCT FROM p_command
      OR v_event.from_state -> '_request' IS DISTINCT FROM p_request
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'SUPPLIER_IDEMPOTENCY_CONFLICT';
  END IF;

  RETURN v_event;
END;
$$;

REVOKE ALL ON FUNCTION public.get_supplier_catalog_command_event(
  uuid, uuid, text, text, text, jsonb
) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.record_supplier_catalog_command(
  p_tenant_id uuid,
  p_resource_type text,
  p_resource_id uuid,
  p_command text,
  p_request jsonb,
  p_from_state jsonb,
  p_to_state jsonb,
  p_actor_user_id uuid,
  p_actor_employee_id uuid,
  p_idempotency_key text,
  p_result_version integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  INSERT INTO public.supplier_command_events (
    tenant_id, resource_type, resource_id, command, from_state, to_state,
    actor_user_id, actor_employee_id, idempotency_key, result_version
  )
  VALUES (
    p_tenant_id, p_resource_type, p_resource_id, p_command,
    jsonb_build_object('_request', p_request, '_before', p_from_state),
    p_to_state, p_actor_user_id, p_actor_employee_id,
    p_idempotency_key, p_result_version
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_supplier_catalog_command(
  uuid, text, uuid, text, jsonb, jsonb, jsonb, uuid, uuid, text, integer
) FROM PUBLIC, anon, authenticated, service_role;

-- Category and brand invariants apply even if a privileged caller writes a row
-- directly instead of using a command function.
CREATE OR REPLACE FUNCTION public.guard_catalog_category_scope()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_parent public.catalog_categories%ROWTYPE;
  v_mapping public.catalog_categories%ROWTYPE;
  v_cycle boolean := false;
  v_level integer := 1;
  v_subtree_depth integer := 0;
BEGIN
  IF NEW.parent_id IS NOT NULL THEN
    SELECT parent.* INTO v_parent
    FROM public.catalog_categories AS parent
    WHERE parent.id = NEW.parent_id
    FOR SHARE;

    IF NOT FOUND
      OR v_parent.ownership_scope IS DISTINCT FROM NEW.ownership_scope
      OR v_parent.owner_tenant_id IS DISTINCT FROM NEW.owner_tenant_id
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001', MESSAGE = 'CATEGORY_OWNERSHIP_CONFLICT';
    END IF;

    WITH RECURSIVE ancestors AS (
      SELECT
        parent.id,
        parent.parent_id,
        ARRAY[parent.id]::uuid[] AS path_ids
      FROM public.catalog_categories AS parent
      WHERE parent.id = NEW.parent_id

      UNION ALL

      SELECT
        parent.id,
        parent.parent_id,
        ancestors.path_ids || parent.id
      FROM public.catalog_categories AS parent
      JOIN ancestors ON parent.id = ancestors.parent_id
      WHERE NOT parent.id = ANY(ancestors.path_ids)
    )
    SELECT
      count(*)::integer + 1,
      COALESCE(bool_or(NEW.id = ANY(ancestors.path_ids)), false)
    INTO v_level, v_cycle
    FROM ancestors;

    WITH RECURSIVE descendants AS (
      SELECT child.id, 1 AS relative_depth
      FROM public.catalog_categories AS child
      WHERE child.parent_id = NEW.id

      UNION ALL

      SELECT child.id, descendants.relative_depth + 1
      FROM public.catalog_categories AS child
      JOIN descendants ON child.parent_id = descendants.id
    )
    SELECT COALESCE(max(descendants.relative_depth), 0)
    INTO v_subtree_depth
    FROM descendants;

    IF v_cycle OR v_level > 8 OR v_level + v_subtree_depth > 8 THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001', MESSAGE = 'CATEGORY_OWNERSHIP_CONFLICT';
    END IF;

    NEW.level := v_level;
    NEW.full_name := v_parent.full_name || ' / ' || btrim(NEW.name);
  ELSE
    NEW.level := 1;
    NEW.full_name := btrim(NEW.name);
  END IF;

  IF NEW.mapped_platform_category_id IS NOT NULL THEN
    SELECT mapping.* INTO v_mapping
    FROM public.catalog_categories AS mapping
    WHERE mapping.id = NEW.mapped_platform_category_id
    FOR SHARE;

    IF NEW.ownership_scope IS DISTINCT FROM 'tenant'
      OR NEW.owner_tenant_id IS NULL
      OR NOT FOUND
      OR v_mapping.ownership_scope IS DISTINCT FROM 'platform'
      OR v_mapping.owner_tenant_id IS NOT NULL
      OR v_mapping.status IS DISTINCT FROM 'active'
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001', MESSAGE = 'CATEGORY_OWNERSHIP_CONFLICT';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_catalog_category_scope()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS tr_catalog_categories_guard_scope
ON public.catalog_categories;
CREATE TRIGGER tr_catalog_categories_guard_scope
BEFORE INSERT OR UPDATE OF
  parent_id, name, ownership_scope, owner_tenant_id, mapped_platform_category_id
ON public.catalog_categories
FOR EACH ROW
EXECUTE FUNCTION public.guard_catalog_category_scope();

CREATE OR REPLACE FUNCTION public.refresh_catalog_category_leaf_state()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_OP <> 'DELETE' AND NEW.parent_id IS NOT NULL THEN
    UPDATE public.catalog_categories
    SET is_leaf = false
    WHERE id = NEW.parent_id;
  END IF;

  IF TG_OP <> 'INSERT'
    AND OLD.parent_id IS NOT NULL
    AND OLD.parent_id IS DISTINCT FROM (
      CASE WHEN TG_OP = 'DELETE' THEN NULL::uuid ELSE NEW.parent_id END
    )
  THEN
    UPDATE public.catalog_categories AS parent
    SET is_leaf = NOT EXISTS (
      SELECT 1
      FROM public.catalog_categories AS child
      WHERE child.parent_id = OLD.parent_id
    )
    WHERE parent.id = OLD.parent_id;
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_catalog_category_leaf_state()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER tr_catalog_categories_refresh_leaf_state
AFTER INSERT OR DELETE OR UPDATE OF parent_id ON public.catalog_categories
FOR EACH ROW
EXECUTE FUNCTION public.refresh_catalog_category_leaf_state();

CREATE FUNCTION public.refresh_tenant_catalog_descendant_paths(
  p_category_id uuid
)
RETURNS void
LANGUAGE sql
SET search_path = pg_catalog, public
AS $$
  WITH RECURSIVE descendants AS (
    SELECT
      child.id,
      parent.level + 1 AS level,
      parent.full_name || ' / ' || child.name AS full_name
    FROM public.catalog_categories AS parent
    JOIN public.catalog_categories AS child ON child.parent_id = parent.id
    WHERE parent.id = p_category_id

    UNION ALL

    SELECT
      child.id,
      descendants.level + 1,
      descendants.full_name || ' / ' || child.name
    FROM descendants
    JOIN public.catalog_categories AS child ON child.parent_id = descendants.id
  )
  UPDATE public.catalog_categories AS category
  SET level = descendants.level,
      full_name = descendants.full_name
  FROM descendants
  WHERE category.id = descendants.id;
$$;

REVOKE ALL ON FUNCTION public.refresh_tenant_catalog_descendant_paths(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.refresh_catalog_category_descendant_paths_trigger()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM public.refresh_tenant_catalog_descendant_paths(NEW.id);
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_catalog_category_descendant_paths_trigger()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER tr_catalog_categories_refresh_descendant_paths
AFTER UPDATE OF parent_id, name ON public.catalog_categories
FOR EACH ROW
EXECUTE FUNCTION public.refresh_catalog_category_descendant_paths_trigger();

CREATE OR REPLACE FUNCTION public.guard_catalog_brand_scope()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_mapping public.catalog_brands%ROWTYPE;
BEGIN
  IF NEW.mapped_platform_brand_id IS NOT NULL THEN
    SELECT mapping.* INTO v_mapping
    FROM public.catalog_brands AS mapping
    WHERE mapping.id = NEW.mapped_platform_brand_id
    FOR SHARE;

    IF NEW.ownership_scope IS DISTINCT FROM 'tenant'
      OR NEW.owner_tenant_id IS NULL
      OR NOT FOUND
      OR v_mapping.ownership_scope IS DISTINCT FROM 'platform'
      OR v_mapping.owner_tenant_id IS NOT NULL
      OR v_mapping.status IS DISTINCT FROM 'active'
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001', MESSAGE = 'BRAND_OWNERSHIP_CONFLICT';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_catalog_brand_scope()
  FROM PUBLIC, anon, authenticated, service_role;

-- Stronger option and unit-dimension shapes supplement the historical checks.
CREATE FUNCTION public.catalog_enum_options_are_valid(options text[])
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
  SELECT cardinality(options) > 0
    AND NOT EXISTS (
      SELECT 1
      FROM unnest(options) AS option_value
      WHERE btrim(option_value) = ''
    )
    AND cardinality(options) = (
      SELECT count(DISTINCT btrim(option_value))
      FROM unnest(options) AS option_value
    );
$$;

REVOKE ALL ON FUNCTION public.catalog_enum_options_are_valid(text[])
  FROM PUBLIC, anon, authenticated, service_role;

WITH normalized AS (
  SELECT
    spec.id,
    COALESCE(
      array_agg(DISTINCT btrim(option_value.value) ORDER BY btrim(option_value.value))
        FILTER (WHERE btrim(option_value.value) <> ''),
      '{}'::text[]
    ) AS options
  FROM public.catalog_spec_definitions AS spec
  LEFT JOIN LATERAL unnest(spec.enum_options) AS option_value(value) ON true
  WHERE spec.value_type IN ('single_enum', 'multi_enum')
  GROUP BY spec.id
)
UPDATE public.catalog_spec_definitions AS spec
SET enum_options = normalized.options
FROM normalized
WHERE spec.id = normalized.id
  AND spec.enum_options IS DISTINCT FROM normalized.options;

UPDATE public.catalog_spec_definitions
SET enum_options = '{}'
WHERE value_type NOT IN ('single_enum', 'multi_enum')
  AND cardinality(enum_options) <> 0;

UPDATE public.catalog_spec_definitions
SET unit_dimension = CASE
  WHEN value_type = 'number' THEN NULLIF(btrim(unit_dimension), '')
  ELSE NULL
END
WHERE unit_dimension IS NOT NULL;

ALTER TABLE public.catalog_spec_definitions
  ADD CONSTRAINT catalog_spec_definitions_options_shape_check CHECK (
    (
      value_type IN ('single_enum', 'multi_enum')
      AND public.catalog_enum_options_are_valid(enum_options)
    )
    OR (
      value_type NOT IN ('single_enum', 'multi_enum')
      AND cardinality(enum_options) = 0
    )
  ) NOT VALID;

ALTER TABLE public.catalog_spec_definitions
  ADD CONSTRAINT catalog_spec_definitions_unit_dimension_check CHECK (
    (
      value_type = 'number'
      AND (
        unit_dimension IS NULL
        OR (unit_dimension = btrim(unit_dimension) AND unit_dimension <> '')
      )
    )
    OR (value_type <> 'number' AND unit_dimension IS NULL)
  ) NOT VALID;

ALTER TABLE public.catalog_spec_definitions
  VALIDATE CONSTRAINT catalog_spec_definitions_options_shape_check;
ALTER TABLE public.catalog_spec_definitions
  VALIDATE CONSTRAINT catalog_spec_definitions_unit_dimension_check;

CREATE FUNCTION public.guard_catalog_spec_definition_scope()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_category public.catalog_categories%ROWTYPE;
  v_source public.catalog_spec_definitions%ROWTYPE;
BEGIN
  SELECT category.* INTO v_category
  FROM public.catalog_categories AS category
  WHERE category.id = NEW.category_id
  FOR SHARE;

  IF NOT FOUND
    OR v_category.ownership_scope IS DISTINCT FROM NEW.ownership_scope
    OR v_category.owner_tenant_id IS DISTINCT FROM NEW.owner_tenant_id
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'SPEC_DEFINITION_INVALID';
  END IF;

  IF TG_OP = 'UPDATE'
    AND (
      NEW.ownership_scope IS DISTINCT FROM OLD.ownership_scope
      OR NEW.owner_tenant_id IS DISTINCT FROM OLD.owner_tenant_id
      OR NEW.source_platform_spec_id IS DISTINCT FROM OLD.source_platform_spec_id
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'SUPPLIER_OWNERSHIP_IMMUTABLE';
  END IF;

  IF NEW.source_platform_spec_id IS NOT NULL THEN
    SELECT source.* INTO v_source
    FROM public.catalog_spec_definitions AS source
    WHERE source.id = NEW.source_platform_spec_id
    FOR SHARE;

    IF NEW.ownership_scope IS DISTINCT FROM 'tenant'
      OR NEW.owner_tenant_id IS NULL
      OR NOT FOUND
      OR v_source.ownership_scope IS DISTINCT FROM 'platform'
      OR v_source.owner_tenant_id IS NOT NULL
      OR v_source.category_id IS DISTINCT FROM v_category.mapped_platform_category_id
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001', MESSAGE = 'SPEC_DEFINITION_INVALID';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_catalog_spec_definition_scope()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER tr_catalog_spec_definitions_guard_scope
BEFORE INSERT OR UPDATE OF
  category_id, ownership_scope, owner_tenant_id, source_platform_spec_id
ON public.catalog_spec_definitions
FOR EACH ROW
EXECUTE FUNCTION public.guard_catalog_spec_definition_scope();

-- Product rows can reference only active leaf categories. Historical rows stay
-- readable; the trigger applies this invariant to future inserts and updates.
CREATE OR REPLACE FUNCTION public.guard_supplier_product_ownership()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_supplier public.suppliers%ROWTYPE;
  v_category public.catalog_categories%ROWTYPE;
  v_brand public.catalog_brands%ROWTYPE;
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

  SELECT supplier.* INTO v_supplier
  FROM public.suppliers AS supplier
  WHERE supplier.id = NEW.supplier_id;

  IF NOT FOUND
    OR (
      NEW.ownership_scope = 'platform'
      AND (
        v_supplier.ownership_scope IS DISTINCT FROM 'platform'
        OR v_supplier.owner_tenant_id IS NOT NULL
      )
    )
    OR (
      NEW.ownership_scope = 'tenant'
      AND (
        NEW.owner_tenant_id IS DISTINCT FROM NEW.acting_tenant_id
        OR (
          v_supplier.ownership_scope = 'tenant'
          AND v_supplier.owner_tenant_id IS DISTINCT FROM NEW.owner_tenant_id
        )
      )
    )
    OR NEW.ownership_scope NOT IN ('platform', 'tenant')
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'PRODUCT_OWNERSHIP_CONFLICT';
  END IF;

  SELECT category.* INTO v_category
  FROM public.catalog_categories AS category
  WHERE category.id = NEW.category_id;

  IF NOT FOUND
    OR v_category.status IS DISTINCT FROM 'active'
    OR v_category.is_leaf IS DISTINCT FROM true
    OR (
      NEW.ownership_scope = 'platform'
      AND v_category.ownership_scope IS DISTINCT FROM 'platform'
    )
    OR (
      NEW.ownership_scope = 'tenant'
      AND v_category.ownership_scope = 'tenant'
      AND v_category.owner_tenant_id IS DISTINCT FROM NEW.owner_tenant_id
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'PRODUCT_OWNERSHIP_CONFLICT';
  END IF;

  SELECT brand.* INTO v_brand
  FROM public.catalog_brands AS brand
  WHERE brand.id = NEW.brand_id;

  IF NOT FOUND
    OR (
      NEW.ownership_scope = 'platform'
      AND v_brand.ownership_scope IS DISTINCT FROM 'platform'
    )
    OR (
      NEW.ownership_scope = 'tenant'
      AND v_brand.ownership_scope = 'tenant'
      AND v_brand.owner_tenant_id IS DISTINCT FROM NEW.owner_tenant_id
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'PRODUCT_OWNERSHIP_CONFLICT';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_supplier_product_ownership()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.guard_catalog_unit_suggestion_scope()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM employee.id
    FROM public.employees AS employee
    WHERE employee.id = NEW.created_by_employee_id
      AND employee.tenant_id = NEW.tenant_id
      AND employee.status = 'active'
    FOR SHARE;

    IF NOT FOUND
      OR NEW.status IS DISTINCT FROM 'pending'
      OR NEW.processed_by_employee_id IS NOT NULL
      OR NEW.processed_at IS NOT NULL
      OR NEW.version IS DISTINCT FROM 1
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001', MESSAGE = 'UNIT_SUGGESTION_INVALID';
    END IF;
  ELSE
    IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
      OR NEW.name IS DISTINCT FROM OLD.name
      OR NEW.symbol IS DISTINCT FROM OLD.symbol
      OR NEW.dimension IS DISTINCT FROM OLD.dimension
      OR NEW.note IS DISTINCT FROM OLD.note
      OR NEW.created_by_employee_id IS DISTINCT FROM OLD.created_by_employee_id
      OR OLD.status IS DISTINCT FROM 'pending'
      OR NEW.status NOT IN ('approved', 'rejected')
      OR NEW.processed_by_employee_id IS NULL
      OR NEW.processed_at IS NULL
      OR NEW.version IS DISTINCT FROM OLD.version + 1
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001', MESSAGE = 'UNIT_SUGGESTION_INVALID';
    END IF;

    PERFORM public.assert_platform_operator_actor(NEW.processed_by_employee_id);
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_catalog_unit_suggestion_scope()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER tr_catalog_unit_suggestions_guard_scope
BEFORE INSERT OR UPDATE ON public.catalog_unit_suggestions
FOR EACH ROW
EXECUTE FUNCTION public.guard_catalog_unit_suggestion_scope();

-- Category commands.
CREATE OR REPLACE FUNCTION public.create_tenant_catalog_category(
  p_category_id uuid,
  p_tenant_id uuid,
  p_parent_id uuid,
  p_code text,
  p_name text,
  p_mapped_platform_category_id uuid,
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
  v_parent public.catalog_categories%ROWTYPE;
  v_category public.catalog_categories%ROWTYPE;
  v_event public.supplier_command_events%ROWTYPE;
  v_request jsonb;
  v_level integer := 1;
  v_full_name text;
BEGIN
  PERFORM public.assert_tenant_supplier_actor(
    p_tenant_id, p_actor_user_id, p_actor_employee_id
  );
  v_request := jsonb_build_object(
    'category_id', p_category_id, 'parent_id', p_parent_id,
    'code', p_code, 'name', p_name,
    'mapped_platform_category_id', p_mapped_platform_category_id
  );
  v_event := public.get_supplier_catalog_command_event(
    p_tenant_id, p_actor_user_id, p_idempotency_key,
    'catalog_category', 'create_tenant_catalog_category', v_request
  );
  IF v_event.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'status', 'created', 'idempotent', true,
      'category', v_event.to_state, 'version', v_event.result_version
    );
  END IF;

  IF p_category_id IS NULL
    OR p_code IS NULL OR btrim(p_code) = ''
    OR p_name IS NULL OR btrim(p_name) = ''
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023', MESSAGE = 'SUPPLIER_STATE_CONFLICT';
  END IF;

  IF p_parent_id IS NOT NULL THEN
    SELECT parent.* INTO v_parent
    FROM public.catalog_categories AS parent
    WHERE parent.id = p_parent_id
      AND parent.ownership_scope = 'tenant'
      AND parent.owner_tenant_id = p_tenant_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001', MESSAGE = 'CATEGORY_OWNERSHIP_CONFLICT';
    END IF;
    v_level := v_parent.level + 1;
    v_full_name := v_parent.full_name || ' / ' || btrim(p_name);
    IF v_level > 8 THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001', MESSAGE = 'CATEGORY_OWNERSHIP_CONFLICT';
    END IF;
  ELSE
    v_full_name := btrim(p_name);
  END IF;

  INSERT INTO public.catalog_categories (
    id, parent_id, code, name, level, full_name, is_leaf,
    mapped_platform_category_id, ownership_scope, owner_tenant_id,
    status, sort_order, version, created_by_employee_id, updated_by_employee_id
  )
  VALUES (
    p_category_id, p_parent_id, p_code, btrim(p_name), v_level, v_full_name,
    true, p_mapped_platform_category_id, 'tenant', p_tenant_id,
    'active', 100, 1, p_actor_employee_id, p_actor_employee_id
  )
  RETURNING * INTO v_category;

  PERFORM public.record_supplier_catalog_command(
    p_tenant_id, 'catalog_category', v_category.id,
    'create_tenant_catalog_category', v_request, '{}'::jsonb,
    to_jsonb(v_category), p_actor_user_id, p_actor_employee_id,
    p_idempotency_key, v_category.version
  );
  RETURN jsonb_build_object(
    'status', 'created', 'idempotent', false,
    'category', to_jsonb(v_category), 'version', v_category.version
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.update_tenant_catalog_category(
  p_category_id uuid,
  p_tenant_id uuid,
  p_name text,
  p_mapped_platform_category_id uuid,
  p_expected_version integer,
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
  v_before public.catalog_categories%ROWTYPE;
  v_category public.catalog_categories%ROWTYPE;
  v_event public.supplier_command_events%ROWTYPE;
  v_request jsonb;
BEGIN
  PERFORM public.assert_tenant_supplier_actor(
    p_tenant_id, p_actor_user_id, p_actor_employee_id
  );
  v_request := jsonb_build_object(
    'category_id', p_category_id, 'name', p_name,
    'mapped_platform_category_id', p_mapped_platform_category_id,
    'expected_version', p_expected_version
  );
  v_event := public.get_supplier_catalog_command_event(
    p_tenant_id, p_actor_user_id, p_idempotency_key,
    'catalog_category', 'update_tenant_catalog_category', v_request
  );
  IF v_event.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'status', 'updated', 'idempotent', true,
      'category', v_event.to_state, 'version', v_event.result_version
    );
  END IF;

  SELECT category.* INTO v_before
  FROM public.catalog_categories AS category
  WHERE category.id = p_category_id
    AND category.ownership_scope = 'tenant'
    AND category.owner_tenant_id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND OR v_before.version IS DISTINCT FROM p_expected_version THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'CATEGORY_OWNERSHIP_CONFLICT';
  END IF;

  UPDATE public.catalog_categories
  SET name = btrim(p_name),
      mapped_platform_category_id = p_mapped_platform_category_id,
      version = version + 1,
      updated_by_employee_id = p_actor_employee_id,
      updated_at = now()
  WHERE id = p_category_id
  RETURNING * INTO v_category;

  PERFORM public.refresh_tenant_catalog_descendant_paths(v_category.id);
  SELECT category.* INTO v_category
  FROM public.catalog_categories AS category
  WHERE category.id = p_category_id;

  PERFORM public.record_supplier_catalog_command(
    p_tenant_id, 'catalog_category', v_category.id,
    'update_tenant_catalog_category', v_request, to_jsonb(v_before),
    to_jsonb(v_category), p_actor_user_id, p_actor_employee_id,
    p_idempotency_key, v_category.version
  );
  RETURN jsonb_build_object(
    'status', 'updated', 'idempotent', false,
    'category', to_jsonb(v_category), 'version', v_category.version
  );
END;
$$;

-- Brand commands.
CREATE OR REPLACE FUNCTION public.create_tenant_catalog_brand(
  p_brand_id uuid,
  p_tenant_id uuid,
  p_code text,
  p_name text,
  p_mapped_platform_brand_id uuid,
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
  v_brand public.catalog_brands%ROWTYPE;
  v_event public.supplier_command_events%ROWTYPE;
  v_request jsonb;
BEGIN
  PERFORM public.assert_tenant_supplier_actor(
    p_tenant_id, p_actor_user_id, p_actor_employee_id
  );
  v_request := jsonb_build_object(
    'brand_id', p_brand_id, 'code', p_code, 'name', p_name,
    'mapped_platform_brand_id', p_mapped_platform_brand_id
  );
  v_event := public.get_supplier_catalog_command_event(
    p_tenant_id, p_actor_user_id, p_idempotency_key,
    'catalog_brand', 'create_tenant_catalog_brand', v_request
  );
  IF v_event.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'status', 'created', 'idempotent', true,
      'brand', v_event.to_state, 'version', v_event.result_version
    );
  END IF;

  INSERT INTO public.catalog_brands (
    id, code, name, mapped_platform_brand_id, ownership_scope, owner_tenant_id,
    status, sort_order, version, created_by_employee_id, updated_by_employee_id
  )
  VALUES (
    p_brand_id, p_code, btrim(p_name), p_mapped_platform_brand_id,
    'tenant', p_tenant_id, 'active', 100, 1,
    p_actor_employee_id, p_actor_employee_id
  )
  RETURNING * INTO v_brand;

  PERFORM public.record_supplier_catalog_command(
    p_tenant_id, 'catalog_brand', v_brand.id,
    'create_tenant_catalog_brand', v_request, '{}'::jsonb,
    to_jsonb(v_brand), p_actor_user_id, p_actor_employee_id,
    p_idempotency_key, v_brand.version
  );
  RETURN jsonb_build_object(
    'status', 'created', 'idempotent', false,
    'brand', to_jsonb(v_brand), 'version', v_brand.version
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.update_tenant_catalog_brand(
  p_brand_id uuid,
  p_tenant_id uuid,
  p_name text,
  p_mapped_platform_brand_id uuid,
  p_expected_version integer,
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
  v_before public.catalog_brands%ROWTYPE;
  v_brand public.catalog_brands%ROWTYPE;
  v_event public.supplier_command_events%ROWTYPE;
  v_request jsonb;
BEGIN
  PERFORM public.assert_tenant_supplier_actor(
    p_tenant_id, p_actor_user_id, p_actor_employee_id
  );
  v_request := jsonb_build_object(
    'brand_id', p_brand_id, 'name', p_name,
    'mapped_platform_brand_id', p_mapped_platform_brand_id,
    'expected_version', p_expected_version
  );
  v_event := public.get_supplier_catalog_command_event(
    p_tenant_id, p_actor_user_id, p_idempotency_key,
    'catalog_brand', 'update_tenant_catalog_brand', v_request
  );
  IF v_event.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'status', 'updated', 'idempotent', true,
      'brand', v_event.to_state, 'version', v_event.result_version
    );
  END IF;

  SELECT brand.* INTO v_before
  FROM public.catalog_brands AS brand
  WHERE brand.id = p_brand_id
    AND brand.ownership_scope = 'tenant'
    AND brand.owner_tenant_id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND OR v_before.version IS DISTINCT FROM p_expected_version THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'BRAND_OWNERSHIP_CONFLICT';
  END IF;

  UPDATE public.catalog_brands
  SET name = btrim(p_name),
      mapped_platform_brand_id = p_mapped_platform_brand_id,
      version = version + 1,
      updated_by_employee_id = p_actor_employee_id,
      updated_at = now()
  WHERE id = p_brand_id
  RETURNING * INTO v_brand;

  PERFORM public.record_supplier_catalog_command(
    p_tenant_id, 'catalog_brand', v_brand.id,
    'update_tenant_catalog_brand', v_request, to_jsonb(v_before),
    to_jsonb(v_brand), p_actor_user_id, p_actor_employee_id,
    p_idempotency_key, v_brand.version
  );
  RETURN jsonb_build_object(
    'status', 'updated', 'idempotent', false,
    'brand', to_jsonb(v_brand), 'version', v_brand.version
  );
END;
$$;

-- Tenant spec commands.
CREATE FUNCTION public.create_tenant_catalog_spec_definition(
  p_spec_id uuid,
  p_tenant_id uuid,
  p_category_id uuid,
  p_code text,
  p_name text,
  p_value_type text,
  p_required boolean,
  p_enum_options text[],
  p_unit_dimension text,
  p_participates_in_sku_name boolean,
  p_filterable boolean,
  p_sort_order integer,
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
  v_spec public.catalog_spec_definitions%ROWTYPE;
  v_event public.supplier_command_events%ROWTYPE;
  v_request jsonb;
BEGIN
  PERFORM public.assert_tenant_supplier_actor(
    p_tenant_id, p_actor_user_id, p_actor_employee_id
  );
  v_request := jsonb_build_object(
    'spec_id', p_spec_id, 'category_id', p_category_id, 'code', p_code,
    'name', p_name, 'value_type', p_value_type, 'required', p_required,
    'enum_options', to_jsonb(p_enum_options), 'unit_dimension', p_unit_dimension,
    'participates_in_sku_name', p_participates_in_sku_name,
    'filterable', p_filterable, 'sort_order', p_sort_order
  );
  v_event := public.get_supplier_catalog_command_event(
    p_tenant_id, p_actor_user_id, p_idempotency_key,
    'catalog_spec_definition', 'create_tenant_catalog_spec_definition', v_request
  );
  IF v_event.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'status', 'created', 'idempotent', true,
      'spec', v_event.to_state, 'version', v_event.result_version
    );
  END IF;

  PERFORM category.id
  FROM public.catalog_categories AS category
  WHERE category.id = p_category_id
    AND category.ownership_scope = 'tenant'
    AND category.owner_tenant_id = p_tenant_id
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'SPEC_DEFINITION_INVALID';
  END IF;

  INSERT INTO public.catalog_spec_definitions (
    id, category_id, code, name, value_type, required, enum_options,
    unit_dimension, participates_in_sku_name, filterable, sort_order,
    ownership_scope, owner_tenant_id, source_platform_spec_id, status,
    version, created_by_employee_id, updated_by_employee_id
  )
  VALUES (
    p_spec_id, p_category_id, p_code, btrim(p_name), p_value_type, p_required,
    COALESCE(p_enum_options, '{}'::text[]), NULLIF(btrim(p_unit_dimension), ''),
    p_participates_in_sku_name, p_filterable, p_sort_order,
    'tenant', p_tenant_id, NULL, 'active', 1,
    p_actor_employee_id, p_actor_employee_id
  )
  RETURNING * INTO v_spec;

  PERFORM public.record_supplier_catalog_command(
    p_tenant_id, 'catalog_spec_definition', v_spec.id,
    'create_tenant_catalog_spec_definition', v_request, '{}'::jsonb,
    to_jsonb(v_spec), p_actor_user_id, p_actor_employee_id,
    p_idempotency_key, v_spec.version
  );
  RETURN jsonb_build_object(
    'status', 'created', 'idempotent', false,
    'spec', to_jsonb(v_spec), 'version', v_spec.version
  );
END;
$$;

CREATE FUNCTION public.update_tenant_catalog_spec_definition(
  p_spec_id uuid,
  p_tenant_id uuid,
  p_name text,
  p_required boolean,
  p_enum_options text[],
  p_unit_dimension text,
  p_participates_in_sku_name boolean,
  p_filterable boolean,
  p_sort_order integer,
  p_status text,
  p_expected_version integer,
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
  v_before public.catalog_spec_definitions%ROWTYPE;
  v_spec public.catalog_spec_definitions%ROWTYPE;
  v_event public.supplier_command_events%ROWTYPE;
  v_request jsonb;
BEGIN
  PERFORM public.assert_tenant_supplier_actor(
    p_tenant_id, p_actor_user_id, p_actor_employee_id
  );
  v_request := jsonb_build_object(
    'spec_id', p_spec_id, 'name', p_name, 'required', p_required,
    'enum_options', to_jsonb(p_enum_options), 'unit_dimension', p_unit_dimension,
    'participates_in_sku_name', p_participates_in_sku_name,
    'filterable', p_filterable, 'sort_order', p_sort_order,
    'status', p_status, 'expected_version', p_expected_version
  );
  v_event := public.get_supplier_catalog_command_event(
    p_tenant_id, p_actor_user_id, p_idempotency_key,
    'catalog_spec_definition', 'update_tenant_catalog_spec_definition', v_request
  );
  IF v_event.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'status', 'updated', 'idempotent', true,
      'spec', v_event.to_state, 'version', v_event.result_version
    );
  END IF;

  SELECT spec.* INTO v_before
  FROM public.catalog_spec_definitions AS spec
  WHERE spec.id = p_spec_id
    AND spec.ownership_scope = 'tenant'
    AND spec.owner_tenant_id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND OR v_before.version IS DISTINCT FROM p_expected_version THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'SPEC_DEFINITION_INVALID';
  END IF;

  UPDATE public.catalog_spec_definitions
  SET name = btrim(p_name),
      required = p_required,
      enum_options = COALESCE(p_enum_options, '{}'::text[]),
      unit_dimension = NULLIF(btrim(p_unit_dimension), ''),
      participates_in_sku_name = p_participates_in_sku_name,
      filterable = p_filterable,
      sort_order = p_sort_order,
      status = p_status,
      version = version + 1,
      updated_by_employee_id = p_actor_employee_id,
      updated_at = now()
  WHERE id = p_spec_id
  RETURNING * INTO v_spec;

  PERFORM public.record_supplier_catalog_command(
    p_tenant_id, 'catalog_spec_definition', v_spec.id,
    'update_tenant_catalog_spec_definition', v_request, to_jsonb(v_before),
    to_jsonb(v_spec), p_actor_user_id, p_actor_employee_id,
    p_idempotency_key, v_spec.version
  );
  RETURN jsonb_build_object(
    'status', 'updated', 'idempotent', false,
    'spec', to_jsonb(v_spec), 'version', v_spec.version
  );
END;
$$;

CREATE FUNCTION public.copy_platform_category_specs(
  p_target_category_id uuid,
  p_tenant_id uuid,
  p_expected_version integer,
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
  v_before public.catalog_categories%ROWTYPE;
  v_category public.catalog_categories%ROWTYPE;
  v_event public.supplier_command_events%ROWTYPE;
  v_request jsonb;
  v_copied integer := 0;
BEGIN
  PERFORM public.assert_tenant_supplier_actor(
    p_tenant_id, p_actor_user_id, p_actor_employee_id
  );
  v_request := jsonb_build_object(
    'target_category_id', p_target_category_id,
    'expected_version', p_expected_version
  );
  v_event := public.get_supplier_catalog_command_event(
    p_tenant_id, p_actor_user_id, p_idempotency_key,
    'catalog_category', 'copy_platform_category_specs', v_request
  );
  IF v_event.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'status', 'updated', 'idempotent', true,
      'category', v_event.to_state, 'version', v_event.result_version
    );
  END IF;

  SELECT category.* INTO v_before
  FROM public.catalog_categories AS category
  WHERE category.id = p_target_category_id
    AND category.ownership_scope = 'tenant'
    AND category.owner_tenant_id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND OR v_before.version IS DISTINCT FROM p_expected_version THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'CATEGORY_OWNERSHIP_CONFLICT';
  END IF;

  INSERT INTO public.catalog_spec_definitions (
    category_id, code, name, value_type, required, enum_options, unit_dimension,
    participates_in_sku_name, filterable, sort_order, ownership_scope,
    owner_tenant_id, source_platform_spec_id, status, version,
    created_by_employee_id, updated_by_employee_id
  )
  SELECT
    p_target_category_id, source.code, source.name, source.value_type,
    source.required, source.enum_options, source.unit_dimension,
    source.participates_in_sku_name, source.filterable, source.sort_order,
    'tenant', p_tenant_id, source.id, source.status, 1,
    p_actor_employee_id, p_actor_employee_id
  FROM public.catalog_spec_definitions AS source
  WHERE source.category_id = v_before.mapped_platform_category_id
    AND source.ownership_scope = 'platform'
    AND source.owner_tenant_id IS NULL
    AND source.status = 'active'
  ON CONFLICT (category_id, code) DO NOTHING;
  GET DIAGNOSTICS v_copied = ROW_COUNT;

  UPDATE public.catalog_categories
  SET version = version + 1,
      updated_by_employee_id = p_actor_employee_id,
      updated_at = now()
  WHERE id = p_target_category_id
  RETURNING * INTO v_category;

  PERFORM public.record_supplier_catalog_command(
    p_tenant_id, 'catalog_category', v_category.id,
    'copy_platform_category_specs', v_request, to_jsonb(v_before),
    to_jsonb(v_category) || jsonb_build_object('copied_count', v_copied),
    p_actor_user_id, p_actor_employee_id, p_idempotency_key, v_category.version
  );
  RETURN jsonb_build_object(
    'status', 'updated', 'idempotent', false, 'copied_count', v_copied,
    'category', to_jsonb(v_category), 'version', v_category.version
  );
END;
$$;

-- Unit suggestion commands. Approval records a decision only; it never creates
-- a catalog unit. Unit creation remains a separate platform-owned workflow.
CREATE OR REPLACE FUNCTION public.submit_catalog_unit_suggestion(
  p_tenant_id uuid,
  p_name text,
  p_symbol text,
  p_dimension text,
  p_note text,
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
  v_suggestion public.catalog_unit_suggestions%ROWTYPE;
  v_event public.supplier_command_events%ROWTYPE;
  v_request jsonb;
BEGIN
  PERFORM public.assert_tenant_supplier_actor(
    p_tenant_id, p_actor_user_id, p_actor_employee_id
  );
  v_request := jsonb_build_object(
    'name', p_name, 'symbol', p_symbol,
    'dimension', p_dimension, 'note', p_note
  );
  v_event := public.get_supplier_catalog_command_event(
    p_tenant_id, p_actor_user_id, p_idempotency_key,
    'catalog_unit_suggestion', 'submit_catalog_unit_suggestion', v_request
  );
  IF v_event.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'status', 'created', 'idempotent', true,
      'suggestion', v_event.to_state, 'version', v_event.result_version
    );
  END IF;

  INSERT INTO public.catalog_unit_suggestions (
    tenant_id, name, symbol, dimension, note, status, version,
    created_by_employee_id
  )
  VALUES (
    p_tenant_id, btrim(p_name), btrim(p_symbol), btrim(p_dimension),
    NULLIF(btrim(p_note), ''), 'pending', 1, p_actor_employee_id
  )
  RETURNING * INTO v_suggestion;

  PERFORM public.record_supplier_catalog_command(
    p_tenant_id, 'catalog_unit_suggestion', v_suggestion.id,
    'submit_catalog_unit_suggestion', v_request, '{}'::jsonb,
    to_jsonb(v_suggestion), p_actor_user_id, p_actor_employee_id,
    p_idempotency_key, v_suggestion.version
  );
  RETURN jsonb_build_object(
    'status', 'created', 'idempotent', false,
    'suggestion', to_jsonb(v_suggestion), 'version', v_suggestion.version
  );
END;
$$;

CREATE FUNCTION public.process_catalog_unit_suggestion(
  p_suggestion_id uuid,
  p_tenant_id uuid,
  p_status text,
  p_expected_version integer,
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
  v_before public.catalog_unit_suggestions%ROWTYPE;
  v_suggestion public.catalog_unit_suggestions%ROWTYPE;
  v_event public.supplier_command_events%ROWTYPE;
  v_request jsonb;
BEGIN
  PERFORM public.assert_platform_operator_actor(p_actor_employee_id);
  PERFORM employee.id
  FROM public.employees AS employee
  WHERE employee.id = p_actor_employee_id
    AND employee.user_id = p_actor_user_id
    AND employee.tenant_id IS NULL
    AND employee.status = 'active'
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'PLATFORM_SUPER_ADMIN_REQUIRED';
  END IF;
  v_request := jsonb_build_object(
    'suggestion_id', p_suggestion_id, 'tenant_id', p_tenant_id,
    'status', p_status, 'expected_version', p_expected_version
  );
  v_event := public.get_supplier_catalog_command_event(
    p_tenant_id, p_actor_user_id, p_idempotency_key,
    'catalog_unit_suggestion', 'process_catalog_unit_suggestion', v_request
  );
  IF v_event.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'status', 'updated', 'idempotent', true,
      'suggestion', v_event.to_state, 'version', v_event.result_version
    );
  END IF;

  IF p_status NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023', MESSAGE = 'UNIT_SUGGESTION_INVALID';
  END IF;

  SELECT suggestion.* INTO v_before
  FROM public.catalog_unit_suggestions AS suggestion
  WHERE suggestion.id = p_suggestion_id
    AND suggestion.tenant_id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND
    OR v_before.status IS DISTINCT FROM 'pending'
    OR v_before.version IS DISTINCT FROM p_expected_version
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'UNIT_SUGGESTION_INVALID';
  END IF;

  UPDATE public.catalog_unit_suggestions
  SET status = p_status,
      processed_by_employee_id = p_actor_employee_id,
      processed_at = now(),
      version = version + 1,
      updated_at = now()
  WHERE id = p_suggestion_id
  RETURNING * INTO v_suggestion;

  PERFORM public.record_supplier_catalog_command(
    p_tenant_id, 'catalog_unit_suggestion', v_suggestion.id,
    'process_catalog_unit_suggestion', v_request, to_jsonb(v_before),
    to_jsonb(v_suggestion), p_actor_user_id, p_actor_employee_id,
    p_idempotency_key, v_suggestion.version
  );
  RETURN jsonb_build_object(
    'status', 'updated', 'idempotent', false,
    'suggestion', to_jsonb(v_suggestion), 'version', v_suggestion.version
  );
END;
$$;

-- All commands fail closed for browser roles and are exposed only through the
-- server-side service role. Trigger and helper functions remain non-callable.
REVOKE ALL ON FUNCTION public.create_tenant_catalog_category(
  uuid, uuid, uuid, text, text, uuid, uuid, uuid, text
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_tenant_catalog_category(
  uuid, uuid, uuid, text, text, uuid, uuid, uuid, text
) TO service_role;

REVOKE ALL ON FUNCTION public.update_tenant_catalog_category(
  uuid, uuid, text, uuid, integer, uuid, uuid, text
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_tenant_catalog_category(
  uuid, uuid, text, uuid, integer, uuid, uuid, text
) TO service_role;

REVOKE ALL ON FUNCTION public.create_tenant_catalog_brand(
  uuid, uuid, text, text, uuid, uuid, uuid, text
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_tenant_catalog_brand(
  uuid, uuid, text, text, uuid, uuid, uuid, text
) TO service_role;

REVOKE ALL ON FUNCTION public.update_tenant_catalog_brand(
  uuid, uuid, text, uuid, integer, uuid, uuid, text
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_tenant_catalog_brand(
  uuid, uuid, text, uuid, integer, uuid, uuid, text
) TO service_role;

REVOKE ALL ON FUNCTION public.create_tenant_catalog_spec_definition(
  uuid, uuid, uuid, text, text, text, boolean, text[], text, boolean,
  boolean, integer, uuid, uuid, text
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_tenant_catalog_spec_definition(
  uuid, uuid, uuid, text, text, text, boolean, text[], text, boolean,
  boolean, integer, uuid, uuid, text
) TO service_role;

REVOKE ALL ON FUNCTION public.update_tenant_catalog_spec_definition(
  uuid, uuid, text, boolean, text[], text, boolean, boolean, integer, text,
  integer, uuid, uuid, text
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_tenant_catalog_spec_definition(
  uuid, uuid, text, boolean, text[], text, boolean, boolean, integer, text,
  integer, uuid, uuid, text
) TO service_role;

REVOKE ALL ON FUNCTION public.copy_platform_category_specs(
  uuid, uuid, integer, uuid, uuid, text
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.copy_platform_category_specs(
  uuid, uuid, integer, uuid, uuid, text
) TO service_role;

REVOKE ALL ON FUNCTION public.submit_catalog_unit_suggestion(
  uuid, text, text, text, text, uuid, uuid, text
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.submit_catalog_unit_suggestion(
  uuid, text, text, text, text, uuid, uuid, text
) TO service_role;

REVOKE ALL ON FUNCTION public.process_catalog_unit_suggestion(
  uuid, uuid, text, integer, uuid, uuid, text
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.process_catalog_unit_suggestion(
  uuid, uuid, text, integer, uuid, uuid, text
) TO service_role;

COMMIT;
