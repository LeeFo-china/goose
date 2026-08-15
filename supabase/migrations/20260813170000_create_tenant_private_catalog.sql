-- Rollback: forward-only. This migration adds tenant-private catalog fields,
-- spec definitions, unit suggestions, backfills category full paths, seeds the
-- platform "无品牌" brand, and adds guarded command functions. Rolling back is
-- destructive: drop the new functions and triggers first, then drop
-- catalog_unit_suggestions and catalog_spec_definitions, then drop the added
-- category/brand columns and the seeded no-brand row. Reconcile all downstream
-- catalog, product, and SKU references before any rollback.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

-- ---------------------------------------------------------------------------
-- 1. Tenant catalog mapping and display columns
-- ---------------------------------------------------------------------------

ALTER TABLE public.catalog_categories
  ADD COLUMN full_name text NULL,
  ADD COLUMN is_leaf boolean NOT NULL DEFAULT false,
  ADD COLUMN mapped_platform_category_id uuid NULL
    REFERENCES public.catalog_categories(id) ON DELETE RESTRICT;

ALTER TABLE public.catalog_categories
  ADD CONSTRAINT catalog_categories_full_name_trimmed_check
    CHECK (
      full_name IS NULL
      OR (full_name = btrim(full_name) AND full_name <> '')
    );

ALTER TABLE public.catalog_brands
  ADD COLUMN mapped_platform_brand_id uuid NULL
    REFERENCES public.catalog_brands(id) ON DELETE RESTRICT;

-- ---------------------------------------------------------------------------
-- 2. Category tree and mapping guards
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.guard_catalog_category_scope()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_parent public.catalog_categories%ROWTYPE;
  v_mapping public.catalog_categories%ROWTYPE;
BEGIN
  IF NEW.parent_id IS NOT NULL THEN
    SELECT * INTO v_parent
    FROM public.catalog_categories
    WHERE id = NEW.parent_id;
    IF v_parent.ownership_scope IS DISTINCT FROM NEW.ownership_scope
      OR v_parent.owner_tenant_id IS DISTINCT FROM NEW.owner_tenant_id
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'CATEGORY_OWNERSHIP_CONFLICT';
    END IF;
  END IF;

  IF NEW.mapped_platform_category_id IS NOT NULL THEN
    SELECT * INTO v_mapping
    FROM public.catalog_categories
    WHERE id = NEW.mapped_platform_category_id;
    IF v_mapping.ownership_scope IS DISTINCT FROM 'platform'
      OR v_mapping.owner_tenant_id IS NOT NULL
      OR v_mapping.status IS DISTINCT FROM 'active'
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'CATEGORY_OWNERSHIP_CONFLICT';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_catalog_category_scope()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER tr_catalog_categories_guard_scope
BEFORE INSERT OR UPDATE OF
  parent_id,
  ownership_scope,
  owner_tenant_id,
  mapped_platform_category_id
ON public.catalog_categories
FOR EACH ROW
EXECUTE FUNCTION public.guard_catalog_category_scope();

CREATE FUNCTION public.guard_catalog_brand_scope()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_mapping public.catalog_brands%ROWTYPE;
BEGIN
  IF NEW.mapped_platform_brand_id IS NOT NULL THEN
    SELECT * INTO v_mapping
    FROM public.catalog_brands
    WHERE id = NEW.mapped_platform_brand_id;
    IF v_mapping.ownership_scope IS DISTINCT FROM 'platform'
      OR v_mapping.owner_tenant_id IS NOT NULL
      OR v_mapping.status IS DISTINCT FROM 'active'
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'BRAND_OWNERSHIP_CONFLICT';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_catalog_brand_scope()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER tr_catalog_brands_guard_scope
BEFORE INSERT OR UPDATE OF
  ownership_scope,
  owner_tenant_id,
  mapped_platform_brand_id
ON public.catalog_brands
FOR EACH ROW
EXECUTE FUNCTION public.guard_catalog_brand_scope();

-- ---------------------------------------------------------------------------
-- 3. Category spec definitions
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.catalog_enum_options_are_distinct(options text[])
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
  SELECT cardinality(options) = (
    SELECT count(DISTINCT item) FROM unnest(options) AS item
  );
$$;

REVOKE ALL ON FUNCTION public.catalog_enum_options_are_distinct(text[])
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE public.catalog_spec_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL
    REFERENCES public.catalog_categories(id) ON DELETE RESTRICT,
  code text NOT NULL,
  name text NOT NULL,
  value_type text NOT NULL,
  required boolean NOT NULL DEFAULT false,
  enum_options text[] NOT NULL DEFAULT '{}',
  unit_dimension text NULL,
  participates_in_sku_name boolean NOT NULL DEFAULT false,
  filterable boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 100,
  ownership_scope text NOT NULL,
  owner_tenant_id uuid NULL
    REFERENCES public.tenants(id) ON DELETE RESTRICT,
  source_platform_spec_id uuid NULL
    REFERENCES public.catalog_spec_definitions(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'active',
  version integer NOT NULL DEFAULT 1,
  created_by_employee_id uuid NOT NULL
    REFERENCES public.employees(id) ON DELETE RESTRICT,
  updated_by_employee_id uuid NOT NULL
    REFERENCES public.employees(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT catalog_spec_definitions_code_trimmed_check
    CHECK (code = btrim(code) AND code <> ''),
  CONSTRAINT catalog_spec_definitions_name_trimmed_check
    CHECK (name = btrim(name) AND name <> ''),
  CONSTRAINT catalog_spec_definitions_value_type_check
    CHECK (
      value_type IN (
        'text', 'number', 'boolean', 'single_enum', 'multi_enum', 'date'
      )
    ),
  CONSTRAINT catalog_spec_definitions_enum_options_check
    CHECK (
      (
        value_type IN ('single_enum', 'multi_enum')
        AND cardinality(enum_options) > 0
        AND public.catalog_enum_options_are_distinct(enum_options)
      )
      OR (
        value_type NOT IN ('single_enum', 'multi_enum')
        AND cardinality(enum_options) = 0
      )
    ),
  CONSTRAINT catalog_spec_definitions_ownership_check
    CHECK (
      (ownership_scope = 'platform' AND owner_tenant_id IS NULL)
      OR (ownership_scope = 'tenant' AND owner_tenant_id IS NOT NULL)
    ),
  CONSTRAINT catalog_spec_definitions_status_check
    CHECK (status IN ('active', 'inactive')),
  CONSTRAINT catalog_spec_definitions_version_check
    CHECK (version > 0),
  CONSTRAINT catalog_spec_definitions_category_code_unique
    UNIQUE (category_id, code)
);

CREATE INDEX catalog_spec_definitions_category_status_sort_idx
ON public.catalog_spec_definitions(category_id, status, sort_order, id);

CREATE INDEX catalog_spec_definitions_ownership_tenant_idx
ON public.catalog_spec_definitions(ownership_scope, owner_tenant_id);

-- ---------------------------------------------------------------------------
-- 4. Unit suggestions (tenant submits, platform processes)
-- ---------------------------------------------------------------------------

CREATE TABLE public.catalog_unit_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL
    REFERENCES public.tenants(id) ON DELETE RESTRICT,
  name text NOT NULL,
  symbol text NOT NULL,
  dimension text NOT NULL,
  note text NULL,
  status text NOT NULL DEFAULT 'pending',
  processed_by_employee_id uuid NULL
    REFERENCES public.employees(id) ON DELETE RESTRICT,
  processed_at timestamptz NULL,
  created_by_employee_id uuid NOT NULL
    REFERENCES public.employees(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT catalog_unit_suggestions_name_trimmed_check
    CHECK (name = btrim(name) AND name <> ''),
  CONSTRAINT catalog_unit_suggestions_symbol_trimmed_check
    CHECK (symbol = btrim(symbol) AND symbol <> ''),
  CONSTRAINT catalog_unit_suggestions_dimension_trimmed_check
    CHECK (dimension = btrim(dimension) AND dimension <> ''),
  CONSTRAINT catalog_unit_suggestions_status_check
    CHECK (status IN ('pending', 'approved', 'rejected'))
);

CREATE INDEX catalog_unit_suggestions_tenant_status_idx
ON public.catalog_unit_suggestions(tenant_id, status, created_at, id);

-- ---------------------------------------------------------------------------
-- 5. Backfill platform category full paths and leaf flags
-- ---------------------------------------------------------------------------

WITH RECURSIVE category_tree AS (
  SELECT
    id,
    parent_id,
    name,
    ARRAY[name] AS path_names
  FROM public.catalog_categories
  WHERE parent_id IS NULL

  UNION ALL

  SELECT
    child.id,
    child.parent_id,
    child.name,
    tree.path_names || child.name
  FROM public.catalog_categories AS child
  JOIN category_tree AS tree ON tree.id = child.parent_id
)
UPDATE public.catalog_categories AS category
SET
  full_name = array_to_string(tree.path_names, ' / '),
  is_leaf = NOT EXISTS (
    SELECT 1
    FROM public.catalog_categories AS child
    WHERE child.parent_id = category.id
  )
FROM category_tree AS tree
WHERE tree.id = category.id;

-- ---------------------------------------------------------------------------
-- 6. Seed and normalize the platform no-brand record
-- ---------------------------------------------------------------------------

INSERT INTO public.catalog_brands (
  code,
  name,
  legal_name,
  status,
  sort_order,
  version,
  ownership_scope,
  owner_tenant_id,
  created_by_employee_id,
  updated_by_employee_id
)
SELECT
  'no_brand',
  '无品牌',
  NULL,
  'active',
  0,
  1,
  'platform',
  NULL,
  employee.id,
  employee.id
FROM public.employees AS employee
WHERE employee.tenant_id IS NULL
ORDER BY employee.created_at
LIMIT 1
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  ownership_scope = EXCLUDED.ownership_scope,
  owner_tenant_id = EXCLUDED.owner_tenant_id,
  status = EXCLUDED.status;

-- ---------------------------------------------------------------------------
-- 7. Tenant catalog command functions
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.create_tenant_catalog_category(
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
  v_level integer := 1;
  v_full_name text;
  v_event public.supplier_command_events%ROWTYPE;
BEGIN
  IF p_category_id IS NULL
    OR p_tenant_id IS NULL
    OR p_code IS NULL OR btrim(p_code) = ''
    OR p_name IS NULL OR btrim(p_name) = ''
    OR p_actor_user_id IS NULL
    OR p_actor_employee_id IS NULL
    OR p_idempotency_key IS NULL OR btrim(p_idempotency_key) = ''
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023', MESSAGE = 'SUPPLIER_STATE_CONFLICT';
  END IF;

  IF p_parent_id IS NOT NULL THEN
    SELECT * INTO v_parent
    FROM public.catalog_categories
    WHERE id = p_parent_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001', MESSAGE = 'CATEGORY_OWNERSHIP_CONFLICT';
    END IF;
    IF v_parent.ownership_scope IS DISTINCT FROM 'tenant'
      OR v_parent.owner_tenant_id IS DISTINCT FROM p_tenant_id
    THEN
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

  UPDATE public.catalog_categories
  SET is_leaf = false
  WHERE id = p_parent_id;

  INSERT INTO public.supplier_command_events (
    tenant_id, resource_type, resource_id, command, from_state, to_state,
    actor_user_id, actor_employee_id, idempotency_key, result_version
  )
  VALUES (
    p_tenant_id, 'catalog_category', v_category.id, 'create_tenant_catalog_category',
    jsonb_build_object('_request', to_jsonb(v_parent)),
    to_jsonb(v_category),
    p_actor_user_id, p_actor_employee_id, p_idempotency_key, v_category.version
  );

  RETURN jsonb_build_object(
    'status', 'created',
    'category', to_jsonb(v_category),
    'version', v_category.version
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_tenant_catalog_category(
  uuid, uuid, uuid, text, text, uuid, uuid, uuid, text
) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.update_tenant_catalog_category(
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
  v_category public.catalog_categories%ROWTYPE;
  v_parent public.catalog_categories%ROWTYPE;
BEGIN
  SELECT * INTO v_category
  FROM public.catalog_categories
  WHERE id = p_category_id
  FOR UPDATE;
  IF NOT FOUND
    OR v_category.ownership_scope IS DISTINCT FROM 'tenant'
    OR v_category.owner_tenant_id IS DISTINCT FROM p_tenant_id
    OR v_category.version IS DISTINCT FROM p_expected_version
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'CATEGORY_OWNERSHIP_CONFLICT';
  END IF;

  IF v_category.parent_id IS NOT NULL THEN
    SELECT * INTO v_parent
    FROM public.catalog_categories
    WHERE id = v_category.parent_id;
    v_category.full_name := v_parent.full_name || ' / ' || btrim(p_name);
  ELSE
    v_category.full_name := btrim(p_name);
  END IF;

  UPDATE public.catalog_categories
  SET
    name = btrim(p_name),
    full_name = v_category.full_name,
    mapped_platform_category_id = p_mapped_platform_category_id,
    version = version + 1,
    updated_by_employee_id = p_actor_employee_id,
    updated_at = now()
  WHERE id = p_category_id
  RETURNING * INTO v_category;

  INSERT INTO public.supplier_command_events (
    tenant_id, resource_type, resource_id, command, from_state, to_state,
    actor_user_id, actor_employee_id, idempotency_key, result_version
  )
  VALUES (
    p_tenant_id, 'catalog_category', v_category.id, 'update_tenant_catalog_category',
    jsonb_build_object('_request', to_jsonb(v_category)),
    to_jsonb(v_category),
    p_actor_user_id, p_actor_employee_id, p_idempotency_key, v_category.version
  );

  RETURN jsonb_build_object(
    'status', 'updated',
    'category', to_jsonb(v_category),
    'version', v_category.version
  );
END;
$$;

REVOKE ALL ON FUNCTION public.update_tenant_catalog_category(
  uuid, uuid, text, uuid, integer, uuid, uuid, text
) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.create_tenant_catalog_brand(
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
BEGIN
  IF p_brand_id IS NULL OR p_tenant_id IS NULL
    OR p_code IS NULL OR btrim(p_code) = ''
    OR p_name IS NULL OR btrim(p_name) = ''
    OR p_actor_user_id IS NULL OR p_actor_employee_id IS NULL
    OR p_idempotency_key IS NULL OR btrim(p_idempotency_key) = ''
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023', MESSAGE = 'SUPPLIER_STATE_CONFLICT';
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

  INSERT INTO public.supplier_command_events (
    tenant_id, resource_type, resource_id, command, from_state, to_state,
    actor_user_id, actor_employee_id, idempotency_key, result_version
  )
  VALUES (
    p_tenant_id, 'catalog_brand', v_brand.id, 'create_tenant_catalog_brand',
    jsonb_build_object('_request', '{}'::jsonb), to_jsonb(v_brand),
    p_actor_user_id, p_actor_employee_id, p_idempotency_key, v_brand.version
  );

  RETURN jsonb_build_object(
    'status', 'created', 'brand', to_jsonb(v_brand), 'version', v_brand.version
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_tenant_catalog_brand(
  uuid, uuid, text, text, uuid, uuid, uuid, text
) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.update_tenant_catalog_brand(
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
  v_brand public.catalog_brands%ROWTYPE;
BEGIN
  SELECT * INTO v_brand
  FROM public.catalog_brands
  WHERE id = p_brand_id
  FOR UPDATE;
  IF NOT FOUND
    OR v_brand.ownership_scope IS DISTINCT FROM 'tenant'
    OR v_brand.owner_tenant_id IS DISTINCT FROM p_tenant_id
    OR v_brand.version IS DISTINCT FROM p_expected_version
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'BRAND_OWNERSHIP_CONFLICT';
  END IF;

  UPDATE public.catalog_brands
  SET
    name = btrim(p_name),
    mapped_platform_brand_id = p_mapped_platform_brand_id,
    version = version + 1,
    updated_by_employee_id = p_actor_employee_id,
    updated_at = now()
  WHERE id = p_brand_id
  RETURNING * INTO v_brand;

  RETURN jsonb_build_object(
    'status', 'updated', 'brand', to_jsonb(v_brand), 'version', v_brand.version
  );
END;
$$;

REVOKE ALL ON FUNCTION public.update_tenant_catalog_brand(
  uuid, uuid, text, uuid, integer, uuid, uuid, text
) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.copy_platform_category_specs(
  p_target_category_id uuid,
  p_tenant_id uuid,
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
  v_category public.catalog_categories%ROWTYPE;
  v_platform_category_id uuid;
  v_copied integer := 0;
BEGIN
  SELECT * INTO v_category
  FROM public.catalog_categories
  WHERE id = p_target_category_id
  FOR UPDATE;
  IF NOT FOUND
    OR v_category.ownership_scope IS DISTINCT FROM 'tenant'
    OR v_category.owner_tenant_id IS DISTINCT FROM p_tenant_id
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'CATEGORY_OWNERSHIP_CONFLICT';
  END IF;

  v_platform_category_id := v_category.mapped_platform_category_id;
  IF v_platform_category_id IS NULL THEN
    RETURN jsonb_build_object('status', 'updated', 'copied_count', 0);
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
  WHERE source.category_id = v_platform_category_id
    AND source.ownership_scope = 'platform'
  ON CONFLICT (category_id, code) DO NOTHING;

  GET DIAGNOSTICS v_copied = ROW_COUNT;

  RETURN jsonb_build_object(
    'status', 'updated', 'copied_count', v_copied
  );
END;
$$;

REVOKE ALL ON FUNCTION public.copy_platform_category_specs(
  uuid, uuid, uuid, uuid, text
) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.submit_catalog_unit_suggestion(
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
BEGIN
  IF p_tenant_id IS NULL OR p_name IS NULL OR btrim(p_name) = ''
    OR p_symbol IS NULL OR btrim(p_symbol) = ''
    OR p_dimension IS NULL OR btrim(p_dimension) = ''
    OR p_actor_user_id IS NULL OR p_actor_employee_id IS NULL
    OR p_idempotency_key IS NULL OR btrim(p_idempotency_key) = ''
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023', MESSAGE = 'SUPPLIER_STATE_CONFLICT';
  END IF;

  SELECT event.* INTO v_event
  FROM public.supplier_command_events AS event
  WHERE event.actor_user_id = p_actor_user_id
    AND event.idempotency_key = p_idempotency_key
  FOR UPDATE;
  IF FOUND THEN
    IF v_event.resource_type <> 'catalog_unit_suggestion'
      OR v_event.command <> 'submit_catalog_unit_suggestion'
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001', MESSAGE = 'SUPPLIER_IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN jsonb_build_object(
      'status', 'created', 'idempotent', true,
      'suggestion', v_event.to_state
    );
  END IF;

  INSERT INTO public.catalog_unit_suggestions (
    tenant_id, name, symbol, dimension, note, status,
    created_by_employee_id
  )
  VALUES (
    p_tenant_id, btrim(p_name), btrim(p_symbol), btrim(p_dimension),
    NULLIF(btrim(p_note), ''), 'pending', p_actor_employee_id
  )
  RETURNING * INTO v_suggestion;

  INSERT INTO public.supplier_command_events (
    tenant_id, resource_type, resource_id, command, from_state, to_state,
    actor_user_id, actor_employee_id, idempotency_key, result_version
  )
  VALUES (
    p_tenant_id, 'catalog_unit_suggestion', v_suggestion.id,
    'submit_catalog_unit_suggestion', jsonb_build_object('_request', '{}'::jsonb),
    to_jsonb(v_suggestion), p_actor_user_id, p_actor_employee_id,
    p_idempotency_key, 1
  );

  RETURN jsonb_build_object(
    'status', 'created', 'suggestion', to_jsonb(v_suggestion)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.submit_catalog_unit_suggestion(
  uuid, text, text, text, text, uuid, uuid, text
) FROM PUBLIC, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 8. Row level security
-- ---------------------------------------------------------------------------

ALTER TABLE public.catalog_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_categories FORCE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_brands FORCE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_spec_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_spec_definitions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_unit_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_unit_suggestions FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.catalog_spec_definitions
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.catalog_unit_suggestions
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.catalog_categories
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.catalog_brands
  FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE public.catalog_categories TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE public.catalog_brands TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE public.catalog_spec_definitions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE public.catalog_unit_suggestions TO service_role;

COMMIT;
