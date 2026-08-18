-- Rollback: forward-only. Disable private catalog writes, restore the prior
-- guard functions and ACLs in a new migration, and reconcile every catalog,
-- product, specification, and unit-suggestion reference before reversing any
-- column conversion. The text[] to jsonb conversion is lossless, but reverting
-- the unit-suggestion shape is intentionally unsupported after new writes.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

CREATE TEMPORARY TABLE catalog_schema_materialization_state (
  state text PRIMARY KEY CHECK (state IN ('repository_chain', 'granular_v2'))
) ON COMMIT DROP;

-- Identify only the two schema shapes known to have existed. Any partial or
-- hand-edited mixture fails closed instead of being accepted by permissive DDL.
DO $$
DECLARE
  v_is_repository_chain boolean;
  v_is_granular_v2 boolean;
  v_state text;
  v_trigger_fingerprint text[];
  v_function_fingerprint text[];
  v_constraint_fingerprint text[];
  v_index_fingerprint text[];
BEGIN
  IF to_regclass('public.catalog_categories') IS NULL
    OR to_regclass('public.catalog_brands') IS NULL
    OR to_regclass('public.catalog_units') IS NULL
    OR to_regclass('public.catalog_spec_definitions') IS NULL
    OR to_regclass('public.catalog_unit_suggestions') IS NULL
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_CATALOG_SCHEMA_STATE_UNSUPPORTED',
      DETAIL = 'one or more catalog tables are missing';
  END IF;

  SELECT
    EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'catalog_spec_definitions'
        AND column_name = 'enum_options'
        AND udt_name = '_text'
    )
    AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'catalog_spec_definitions'
        AND column_name = 'required' AND udt_name = 'bool'
    )
    AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'catalog_spec_definitions'
        AND column_name = 'filterable' AND udt_name = 'bool'
    )
    AND NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'catalog_spec_definitions'
        AND column_name IN ('is_required', 'is_filterable')
    )
    AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'catalog_unit_suggestions'
        AND column_name = 'name'
    )
    AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'catalog_unit_suggestions'
        AND column_name = 'created_by_employee_id'
    )
    AND NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'catalog_unit_suggestions'
        AND column_name IN (
          'suggested_code', 'suggested_name', 'version',
          'submitted_by_employee_id', 'approved_catalog_unit_id'
        )
    )
    AND NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'catalog_units'
        AND column_name = 'unit_dimension'
    )
    AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'catalog_categories'
        AND column_name = 'full_name'
        AND is_nullable = 'YES'
    )
    AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'catalog_categories'
        AND column_name = 'is_leaf'
        AND column_default = 'false'
    )
    AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'catalog_unit_suggestions'
        AND column_name = 'status'
        AND column_default = '''pending''::text'
    )
  INTO v_is_repository_chain;

  SELECT
    EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'catalog_spec_definitions'
        AND column_name = 'enum_options'
        AND udt_name = 'jsonb'
    )
    AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'catalog_spec_definitions'
        AND column_name = 'is_required' AND udt_name = 'bool'
    )
    AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'catalog_spec_definitions'
        AND column_name = 'is_filterable' AND udt_name = 'bool'
    )
    AND NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'catalog_spec_definitions'
        AND column_name IN ('required', 'filterable')
    )
    AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'catalog_unit_suggestions'
        AND column_name = 'suggested_code'
        AND is_nullable = 'NO'
    )
    AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'catalog_unit_suggestions'
        AND column_name = 'submitted_by_employee_id'
    )
    AND NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'catalog_unit_suggestions'
        AND column_name IN ('name', 'created_by_employee_id')
    )
    AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'catalog_units'
        AND column_name = 'unit_dimension'
        AND udt_name = 'text'
        AND is_nullable = 'NO'
    )
    AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'catalog_categories'
        AND column_name = 'full_name'
        AND is_nullable = 'NO'
    )
    AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'catalog_categories'
        AND column_name = 'is_leaf'
        AND column_default = 'true'
    )
    AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'catalog_unit_suggestions'
        AND column_name = 'status'
        AND column_default = '''submitted''::text'
    )
  INTO v_is_granular_v2;

  IF v_is_repository_chain = v_is_granular_v2 THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_CATALOG_SCHEMA_STATE_UNSUPPORTED',
      DETAIL = 'catalog schema is mixed, incomplete, or already diverged';
  END IF;

  v_state := CASE
    WHEN v_is_repository_chain THEN 'repository_chain'
    ELSE 'granular_v2'
  END;

  SELECT array_agg(
    table_definition.relname || '|' || trigger_definition.tgname || '|' ||
      procedure_definition.proname
    ORDER BY table_definition.relname, trigger_definition.tgname
  )
  INTO v_trigger_fingerprint
  FROM pg_trigger AS trigger_definition
  JOIN pg_class AS table_definition
    ON table_definition.oid = trigger_definition.tgrelid
  JOIN pg_namespace AS namespace_definition
    ON namespace_definition.oid = table_definition.relnamespace
  JOIN pg_proc AS procedure_definition
    ON procedure_definition.oid = trigger_definition.tgfoid
  WHERE namespace_definition.nspname = 'public'
    AND NOT trigger_definition.tgisinternal
    AND table_definition.relname IN (
      'catalog_categories',
      'catalog_brands',
      'catalog_units',
      'catalog_spec_definitions',
      'catalog_unit_suggestions'
    );

  SELECT array_agg(procedure_definition.proname ORDER BY procedure_definition.proname)
  INTO v_function_fingerprint
  FROM pg_proc AS procedure_definition
  JOIN pg_namespace AS namespace_definition
    ON namespace_definition.oid = procedure_definition.pronamespace
  WHERE namespace_definition.nspname = 'public'
    AND procedure_definition.pronargs = 0
    AND procedure_definition.proname IN (
      'guard_catalog_brand_scope',
      'guard_catalog_category_scope',
      'guard_supplier_ownership_immutable',
      'lock_catalog_category_hierarchy',
      'lock_catalog_unit_hierarchy',
      'protect_active_supplier_catalog_reference',
      'protect_platform_no_brand_identity',
      'refresh_catalog_category_descendants',
      'set_catalog_category_level',
      'sync_catalog_base_unit_dimension_to_derived',
      'update_updated_at_column',
      'validate_catalog_brand_mapping',
      'validate_catalog_category_hierarchy',
      'validate_catalog_spec_definition_ownership',
      'validate_catalog_unit_base',
      'validate_catalog_unit_dimension',
      'validate_catalog_unit_suggestion_state',
      'validate_supplier_proxy_actor',
      'validate_supplier_product_catalog'
    );

  SELECT array_agg(
    table_definition.relname || '|' || constraint_definition.conname
    ORDER BY table_definition.relname, constraint_definition.conname
  )
  INTO v_constraint_fingerprint
  FROM pg_constraint AS constraint_definition
  JOIN pg_class AS table_definition
    ON table_definition.oid = constraint_definition.conrelid
  JOIN pg_namespace AS namespace_definition
    ON namespace_definition.oid = table_definition.relnamespace
  WHERE namespace_definition.nspname = 'public'
    AND constraint_definition.conname IN (
      'catalog_categories_full_name_trimmed_check',
      'catalog_categories_level_check',
      'catalog_categories_mapping_scope_check',
      'catalog_brands_mapping_scope_check',
      'catalog_spec_definitions_enum_options_check',
      'catalog_spec_definitions_ownership_check',
      'catalog_spec_definitions_unit_dimension_check',
      'catalog_unit_suggestions_dimension_trimmed_check',
      'catalog_unit_suggestions_name_trimmed_check',
      'catalog_unit_suggestions_review_state_check',
      'catalog_unit_suggestions_status_check',
      'catalog_unit_suggestions_symbol_trimmed_check',
      'catalog_unit_suggestions_version_check',
      'catalog_units_dimension_check'
    );

  SELECT array_agg(
    index_definition.relname || '|' || pg_get_indexdef(index_definition.oid)
    ORDER BY index_definition.relname
  )
  INTO v_index_fingerprint
  FROM pg_index AS index_catalog
  JOIN pg_class AS index_definition
    ON index_definition.oid = index_catalog.indexrelid
  JOIN pg_namespace AS namespace_definition
    ON namespace_definition.oid = index_definition.relnamespace
  WHERE namespace_definition.nspname = 'public'
    AND index_definition.relname IN (
      'catalog_brands_active_platform_no_brand_idx',
      'catalog_brands_mapping_lookup_idx',
      'catalog_brands_platform_code_unique_idx',
      'catalog_brands_platform_no_brand_identity_idx',
      'catalog_brands_tenant_code_unique_idx',
      'catalog_categories_mapping_lookup_idx',
      'catalog_categories_platform_code_unique_idx',
      'catalog_categories_scope_path_idx',
      'catalog_categories_tenant_code_unique_idx',
      'catalog_spec_definitions_category_status_sort_idx',
      'catalog_spec_definitions_ownership_lookup_idx',
      'catalog_spec_definitions_ownership_tenant_idx',
      'catalog_spec_definitions_source_copy_idx',
      'catalog_unit_suggestions_queue_idx',
      'catalog_unit_suggestions_tenant_page_idx',
      'catalog_units_dimension_status_idx'
    );

  IF (
    v_state = 'repository_chain'
    AND (
      v_trigger_fingerprint IS DISTINCT FROM ARRAY[
        'catalog_brands|tr_catalog_brands_guard_ownership_immutable|guard_supplier_ownership_immutable',
        'catalog_brands|tr_catalog_brands_guard_scope|guard_catalog_brand_scope',
        'catalog_brands|tr_catalog_brands_protect_supplier_products|protect_active_supplier_catalog_reference',
        'catalog_brands|tr_catalog_brands_updated_at|update_updated_at_column',
        'catalog_categories|tr_catalog_categories_guard_ownership_immutable|guard_supplier_ownership_immutable',
        'catalog_categories|tr_catalog_categories_guard_scope|guard_catalog_category_scope',
        'catalog_categories|tr_catalog_categories_lock_hierarchy|lock_catalog_category_hierarchy',
        'catalog_categories|tr_catalog_categories_protect_supplier_products|protect_active_supplier_catalog_reference',
        'catalog_categories|tr_catalog_categories_set_level|set_catalog_category_level',
        'catalog_categories|tr_catalog_categories_updated_at|update_updated_at_column',
        'catalog_units|tr_catalog_units_lock_hierarchy|lock_catalog_unit_hierarchy',
        'catalog_units|tr_catalog_units_updated_at|update_updated_at_column',
        'catalog_units|tr_catalog_units_validate_base|validate_catalog_unit_base'
      ]::text[]
      OR v_function_fingerprint IS DISTINCT FROM ARRAY[
        'guard_catalog_brand_scope',
        'guard_catalog_category_scope',
        'guard_supplier_ownership_immutable',
        'lock_catalog_category_hierarchy',
        'lock_catalog_unit_hierarchy',
        'protect_active_supplier_catalog_reference',
        'set_catalog_category_level',
        'update_updated_at_column',
        'validate_catalog_unit_base',
        'validate_supplier_product_catalog',
        'validate_supplier_proxy_actor'
      ]::text[]
      OR v_constraint_fingerprint IS DISTINCT FROM ARRAY[
        'catalog_categories|catalog_categories_full_name_trimmed_check',
        'catalog_categories|catalog_categories_level_check',
        'catalog_spec_definitions|catalog_spec_definitions_enum_options_check',
        'catalog_spec_definitions|catalog_spec_definitions_ownership_check',
        'catalog_unit_suggestions|catalog_unit_suggestions_dimension_trimmed_check',
        'catalog_unit_suggestions|catalog_unit_suggestions_name_trimmed_check',
        'catalog_unit_suggestions|catalog_unit_suggestions_status_check',
        'catalog_unit_suggestions|catalog_unit_suggestions_symbol_trimmed_check'
      ]::text[]
      OR v_index_fingerprint IS DISTINCT FROM ARRAY[
        'catalog_brands_platform_code_unique_idx|CREATE UNIQUE INDEX catalog_brands_platform_code_unique_idx ON public.catalog_brands USING btree (upper(btrim(code))) WHERE (ownership_scope = ''platform''::text)',
        'catalog_brands_tenant_code_unique_idx|CREATE UNIQUE INDEX catalog_brands_tenant_code_unique_idx ON public.catalog_brands USING btree (owner_tenant_id, upper(btrim(code))) WHERE (ownership_scope = ''tenant''::text)',
        'catalog_categories_platform_code_unique_idx|CREATE UNIQUE INDEX catalog_categories_platform_code_unique_idx ON public.catalog_categories USING btree (upper(btrim(code))) WHERE (ownership_scope = ''platform''::text)',
        'catalog_categories_tenant_code_unique_idx|CREATE UNIQUE INDEX catalog_categories_tenant_code_unique_idx ON public.catalog_categories USING btree (owner_tenant_id, upper(btrim(code))) WHERE (ownership_scope = ''tenant''::text)',
        'catalog_spec_definitions_category_status_sort_idx|CREATE INDEX catalog_spec_definitions_category_status_sort_idx ON public.catalog_spec_definitions USING btree (category_id, status, sort_order, id)',
        'catalog_spec_definitions_ownership_tenant_idx|CREATE INDEX catalog_spec_definitions_ownership_tenant_idx ON public.catalog_spec_definitions USING btree (ownership_scope, owner_tenant_id)'
      ]::text[]
    )
  ) OR (
    v_state = 'granular_v2'
    AND (
      v_trigger_fingerprint IS DISTINCT FROM ARRAY[
        'catalog_brands|tr_catalog_brands_guard_ownership_immutable|guard_supplier_ownership_immutable',
        'catalog_brands|tr_catalog_brands_protect_platform_no_brand|protect_platform_no_brand_identity',
        'catalog_brands|tr_catalog_brands_protect_supplier_products|protect_active_supplier_catalog_reference',
        'catalog_brands|tr_catalog_brands_updated_at|update_updated_at_column',
        'catalog_brands|tr_catalog_brands_validate_mapping|validate_catalog_brand_mapping',
        'catalog_categories|tr_catalog_categories_guard_ownership_immutable|guard_supplier_ownership_immutable',
        'catalog_categories|tr_catalog_categories_lock_hierarchy|lock_catalog_category_hierarchy',
        'catalog_categories|tr_catalog_categories_protect_supplier_products|protect_active_supplier_catalog_reference',
        'catalog_categories|tr_catalog_categories_refresh_after_delete|refresh_catalog_category_descendants',
        'catalog_categories|tr_catalog_categories_refresh_descendants|refresh_catalog_category_descendants',
        'catalog_categories|tr_catalog_categories_updated_at|update_updated_at_column',
        'catalog_categories|tr_catalog_categories_validate_hierarchy|validate_catalog_category_hierarchy',
        'catalog_spec_definitions|tr_catalog_spec_definitions_guard_ownership_immutable|guard_supplier_ownership_immutable',
        'catalog_spec_definitions|tr_catalog_spec_definitions_updated_at|update_updated_at_column',
        'catalog_spec_definitions|tr_catalog_spec_definitions_validate_ownership|validate_catalog_spec_definition_ownership',
        'catalog_unit_suggestions|tr_catalog_unit_suggestions_updated_at|update_updated_at_column',
        'catalog_unit_suggestions|tr_catalog_unit_suggestions_validate_state|validate_catalog_unit_suggestion_state',
        'catalog_units|tr_catalog_units_lock_hierarchy|lock_catalog_unit_hierarchy',
        'catalog_units|tr_catalog_units_sync_base_dimension|sync_catalog_base_unit_dimension_to_derived',
        'catalog_units|tr_catalog_units_updated_at|update_updated_at_column',
        'catalog_units|tr_catalog_units_validate_base|validate_catalog_unit_base',
        'catalog_units|tr_catalog_units_validate_dimension|validate_catalog_unit_dimension'
      ]::text[]
      OR v_function_fingerprint IS DISTINCT FROM ARRAY[
        'guard_supplier_ownership_immutable',
        'lock_catalog_category_hierarchy',
        'lock_catalog_unit_hierarchy',
        'protect_active_supplier_catalog_reference',
        'protect_platform_no_brand_identity',
        'refresh_catalog_category_descendants',
        'sync_catalog_base_unit_dimension_to_derived',
        'update_updated_at_column',
        'validate_catalog_brand_mapping',
        'validate_catalog_category_hierarchy',
        'validate_catalog_spec_definition_ownership',
        'validate_catalog_unit_base',
        'validate_catalog_unit_dimension',
        'validate_catalog_unit_suggestion_state',
        'validate_supplier_product_catalog',
        'validate_supplier_proxy_actor'
      ]::text[]
      OR v_constraint_fingerprint IS DISTINCT FROM ARRAY[
        'catalog_brands|catalog_brands_mapping_scope_check',
        'catalog_categories|catalog_categories_full_name_trimmed_check',
        'catalog_categories|catalog_categories_level_check',
        'catalog_categories|catalog_categories_mapping_scope_check',
        'catalog_spec_definitions|catalog_spec_definitions_enum_options_check',
        'catalog_spec_definitions|catalog_spec_definitions_ownership_check',
        'catalog_spec_definitions|catalog_spec_definitions_unit_dimension_check',
        'catalog_unit_suggestions|catalog_unit_suggestions_review_state_check',
        'catalog_unit_suggestions|catalog_unit_suggestions_status_check',
        'catalog_unit_suggestions|catalog_unit_suggestions_version_check',
        'catalog_units|catalog_units_dimension_check'
      ]::text[]
      OR v_index_fingerprint IS DISTINCT FROM ARRAY[
        'catalog_brands_active_platform_no_brand_idx|CREATE UNIQUE INDEX catalog_brands_active_platform_no_brand_idx ON public.catalog_brands USING btree ((1)) WHERE ((ownership_scope = ''platform''::text) AND (owner_tenant_id IS NULL) AND (status = ''active''::text) AND (upper(btrim(code)) = ''NO_BRAND''::text))',
        'catalog_brands_mapping_lookup_idx|CREATE INDEX catalog_brands_mapping_lookup_idx ON public.catalog_brands USING btree (mapped_platform_brand_id, owner_tenant_id, id) WHERE (mapped_platform_brand_id IS NOT NULL)',
        'catalog_brands_platform_code_unique_idx|CREATE UNIQUE INDEX catalog_brands_platform_code_unique_idx ON public.catalog_brands USING btree (code) WHERE (ownership_scope = ''platform''::text)',
        'catalog_brands_platform_no_brand_identity_idx|CREATE UNIQUE INDEX catalog_brands_platform_no_brand_identity_idx ON public.catalog_brands USING btree ((1)) WHERE ((ownership_scope = ''platform''::text) AND (owner_tenant_id IS NULL) AND ((upper(btrim(code)) = ''NO_BRAND''::text) OR (btrim(name) = ''无品牌''::text)))',
        'catalog_brands_tenant_code_unique_idx|CREATE UNIQUE INDEX catalog_brands_tenant_code_unique_idx ON public.catalog_brands USING btree (owner_tenant_id, code) WHERE (ownership_scope = ''tenant''::text)',
        'catalog_categories_mapping_lookup_idx|CREATE INDEX catalog_categories_mapping_lookup_idx ON public.catalog_categories USING btree (mapped_platform_category_id, owner_tenant_id, id) WHERE (mapped_platform_category_id IS NOT NULL)',
        'catalog_categories_platform_code_unique_idx|CREATE UNIQUE INDEX catalog_categories_platform_code_unique_idx ON public.catalog_categories USING btree (code) WHERE (ownership_scope = ''platform''::text)',
        'catalog_categories_scope_path_idx|CREATE INDEX catalog_categories_scope_path_idx ON public.catalog_categories USING btree (ownership_scope, owner_tenant_id, full_name, id)',
        'catalog_categories_tenant_code_unique_idx|CREATE UNIQUE INDEX catalog_categories_tenant_code_unique_idx ON public.catalog_categories USING btree (owner_tenant_id, code) WHERE (ownership_scope = ''tenant''::text)',
        'catalog_spec_definitions_category_status_sort_idx|CREATE INDEX catalog_spec_definitions_category_status_sort_idx ON public.catalog_spec_definitions USING btree (category_id, status, sort_order, id)',
        'catalog_spec_definitions_ownership_lookup_idx|CREATE INDEX catalog_spec_definitions_ownership_lookup_idx ON public.catalog_spec_definitions USING btree (ownership_scope, owner_tenant_id, category_id, status, id)',
        'catalog_spec_definitions_source_copy_idx|CREATE UNIQUE INDEX catalog_spec_definitions_source_copy_idx ON public.catalog_spec_definitions USING btree (category_id, source_platform_spec_id) WHERE (source_platform_spec_id IS NOT NULL)',
        'catalog_unit_suggestions_queue_idx|CREATE INDEX catalog_unit_suggestions_queue_idx ON public.catalog_unit_suggestions USING btree (status, created_at, id)',
        'catalog_unit_suggestions_tenant_page_idx|CREATE INDEX catalog_unit_suggestions_tenant_page_idx ON public.catalog_unit_suggestions USING btree (tenant_id, created_at DESC, id DESC)',
        'catalog_units_dimension_status_idx|CREATE INDEX catalog_units_dimension_status_idx ON public.catalog_units USING btree (unit_dimension, status, sort_order, id)'
      ]::text[]
    )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_CATALOG_SCHEMA_STATE_UNSUPPORTED',
      DETAIL = 'catalog object fingerprint does not match the recognized schema state';
  END IF;

  INSERT INTO catalog_schema_materialization_state(state)
  VALUES (v_state);
END;
$$;

-- Both recognized histories contain one platform no-brand row with the same
-- identity but different code casing. Preserve its id and every reference;
-- refuse ambiguous or business-bearing aliases instead of merging rows.
DO $$
DECLARE
  v_no_brand_id uuid;
  v_candidate_count bigint;
BEGIN
  SELECT count(*)
  INTO v_candidate_count
  FROM public.catalog_brands AS brand
  WHERE lower(btrim(brand.code)) = 'no_brand'
    OR btrim(brand.name) = '无品牌';

  SELECT brand.id
  INTO v_no_brand_id
  FROM public.catalog_brands AS brand
  WHERE lower(btrim(brand.code)) = 'no_brand'
    OR btrim(brand.name) = '无品牌'
  ORDER BY brand.id
  LIMIT 1;

  IF v_candidate_count IS DISTINCT FROM 1
    OR NOT EXISTS (
      SELECT 1
      FROM public.catalog_brands AS brand
      WHERE brand.id = v_no_brand_id
        AND lower(btrim(brand.code)) = 'no_brand'
        AND btrim(brand.name) = '无品牌'
        AND brand.legal_name IS NULL
        AND brand.ownership_scope = 'platform'
        AND brand.owner_tenant_id IS NULL
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_CATALOG_NO_BRAND_MAPPING_REQUIRED',
      DETAIL = 'no-brand identity is missing, ambiguous, tenant-owned, or contains business data';
  END IF;

  UPDATE public.catalog_brands
  SET code = 'NO_BRAND', name = '无品牌', status = 'active'
  WHERE id = v_no_brand_id;
END;
$$;

-- Replace inherited trigger helpers before any data mutation. Object names are
-- part of state recognition, but their previous bodies and ACLs are not trusted.
CREATE OR REPLACE FUNCTION public.guard_supplier_ownership_immutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.ownership_scope IS DISTINCT FROM OLD.ownership_scope
    OR NEW.owner_tenant_id IS DISTINCT FROM OLD.owner_tenant_id
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'SUPPLIER_OWNERSHIP_IMMUTABLE';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.lock_catalog_category_hierarchy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
BEGIN
  -- Low-frequency catalog configuration writes are intentionally serialized
  -- across tenants so parent moves and descendant refreshes use one lock order.
  PERFORM pg_catalog.pg_advisory_xact_lock(6720240723142000::bigint);
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.lock_catalog_unit_hierarchy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
BEGIN
  -- Low-frequency unit configuration writes use one global lock because base
  -- unit chains may be shared by platform and tenant catalog definitions.
  PERFORM pg_catalog.pg_advisory_xact_lock(6720240723142001::bigint);
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
BEGIN
  NEW.updated_at := pg_catalog.now();
  RETURN NEW;
END;
$$;

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
    AND employee.tenant_id = NEW.acting_tenant_id
    AND employee.status = 'active';

  IF NOT FOUND
    OR (TG_OP = 'INSERT' AND NEW.created_by_employee_id <> NEW.acting_employee_id)
    OR NEW.updated_by_employee_id <> NEW.acting_employee_id
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

  SELECT supplier.ownership_scope, supplier.owner_tenant_id
  INTO v_supplier_scope, v_supplier_tenant_id
  FROM public.suppliers AS supplier
  WHERE supplier.id = NEW.supplier_id
  FOR SHARE;

  IF NOT FOUND
    OR (
      NEW.ownership_scope = 'platform'
      AND (v_supplier_scope <> 'platform' OR v_supplier_tenant_id IS NOT NULL)
    )
    OR (
      NEW.ownership_scope = 'tenant'
      AND (
        NEW.owner_tenant_id IS DISTINCT FROM NEW.acting_tenant_id
        OR (
          v_supplier_scope = 'tenant'
          AND v_supplier_tenant_id IS DISTINCT FROM NEW.owner_tenant_id
        )
      )
    )
    OR NEW.ownership_scope NOT IN ('platform', 'tenant')
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'PRODUCT_OWNERSHIP_CONFLICT';
  END IF;

  SELECT category.ownership_scope, category.owner_tenant_id
  INTO v_category_scope, v_category_tenant_id
  FROM public.catalog_categories AS category
  WHERE category.id = NEW.category_id
  FOR SHARE;

  SELECT brand.ownership_scope, brand.owner_tenant_id
  INTO v_brand_scope, v_brand_tenant_id
  FROM public.catalog_brands AS brand
  WHERE brand.id = NEW.brand_id
  FOR SHARE;

  IF v_category_scope IS NULL
    OR v_brand_scope IS NULL
    OR (
      NEW.ownership_scope = 'platform'
      AND (v_category_scope <> 'platform' OR v_brand_scope <> 'platform')
    )
    OR (
      NEW.ownership_scope = 'tenant'
      AND (
        (v_category_scope = 'tenant' AND v_category_tenant_id IS DISTINCT FROM NEW.owner_tenant_id)
        OR (v_brand_scope = 'tenant' AND v_brand_tenant_id IS DISTINCT FROM NEW.owner_tenant_id)
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
  IF OLD.ownership_scope IS DISTINCT FROM 'tenant'
    OR OLD.owner_tenant_id IS DISTINCT FROM NEW.acting_tenant_id
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'PRODUCT_OWNERSHIP_CONFLICT';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_catalog_unit_base()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_base_unit_id uuid;
  v_base_status text;
BEGIN
  IF TG_OP = 'UPDATE'
    AND OLD.base_unit_id IS NULL
    AND OLD.status = 'active'
    AND NEW.status = 'inactive'
    AND EXISTS (
      SELECT 1 FROM public.catalog_units AS derived_unit
      WHERE derived_unit.base_unit_id = OLD.id
        AND derived_unit.id <> NEW.id
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'SUPPLIER_CATALOG_REFERENCE_IN_USE';
  END IF;

  IF NEW.base_unit_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.base_unit_id = NEW.id THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'UNIT_CONVERSION_INVALID';
  END IF;

  IF TG_OP = 'UPDATE'
    AND NEW.base_unit_id IS DISTINCT FROM OLD.base_unit_id
    AND EXISTS (
      SELECT 1 FROM public.catalog_units AS derived_unit
      WHERE derived_unit.base_unit_id = OLD.id
        AND derived_unit.id <> NEW.id
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'SUPPLIER_CATALOG_REFERENCE_IN_USE';
  END IF;

  SELECT base_unit.base_unit_id, base_unit.status
  INTO v_base_unit_id, v_base_status
  FROM public.catalog_units AS base_unit
  WHERE base_unit.id = NEW.base_unit_id
  FOR UPDATE;

  IF NOT FOUND
    OR v_base_unit_id IS NOT NULL
    OR v_base_status IS DISTINCT FROM 'active'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'UNIT_CONVERSION_INVALID';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.protect_active_supplier_catalog_reference()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF OLD.status = 'active'
    AND NEW.status = 'inactive'
    AND (
      (
        TG_TABLE_NAME = 'catalog_categories'
        AND (
          EXISTS (
            SELECT 1 FROM public.supplier_products AS product
            WHERE product.category_id = OLD.id AND product.status = 'active'
          )
          OR EXISTS (
            SELECT 1 FROM public.catalog_categories AS tenant_category
            WHERE tenant_category.mapped_platform_category_id = OLD.id
          )
          OR EXISTS (
            SELECT 1 FROM public.catalog_spec_definitions AS definition
            WHERE definition.category_id = OLD.id
          )
        )
      )
      OR (
        TG_TABLE_NAME = 'catalog_brands'
        AND (
          EXISTS (
            SELECT 1 FROM public.supplier_products AS product
            WHERE product.brand_id = OLD.id AND product.status = 'active'
          )
          OR EXISTS (
            SELECT 1 FROM public.catalog_brands AS tenant_brand
            WHERE tenant_brand.mapped_platform_brand_id = OLD.id
          )
        )
      )
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'SUPPLIER_CATALOG_REFERENCE_IN_USE';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.protect_platform_no_brand_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF OLD.ownership_scope = 'platform'
    AND OLD.owner_tenant_id IS NULL
    AND lower(btrim(OLD.code)) = 'no_brand'
    AND OLD.name = '无品牌'
    AND OLD.status = 'active'
    AND (
      TG_OP = 'DELETE'
      OR NEW.ownership_scope IS DISTINCT FROM 'platform'
      OR NEW.owner_tenant_id IS NOT NULL
      OR NEW.code IS DISTINCT FROM 'NO_BRAND'
      OR NEW.name IS DISTINCT FROM '无品牌'
      OR NEW.legal_name IS NOT NULL
      OR NEW.status IS DISTINCT FROM 'active'
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'SUPPLIER_CATALOG_NO_BRAND_IMMUTABLE';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

-- A repository-chain suggestion cannot be assigned a truthful code, approval
-- target, or review remark. Refuse to invent those audit facts.
DO $$
BEGIN
  IF (SELECT state FROM catalog_schema_materialization_state) =
      'repository_chain'
    AND EXISTS (SELECT 1 FROM public.catalog_unit_suggestions)
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_CATALOG_UNIT_SUGGESTION_MAPPING_REQUIRED',
      DETAIL = 'legacy unit suggestions require an explicit business mapping';
  END IF;
END;
$$;

-- Validate data before removing legacy checks or changing physical types.
DO $$
DECLARE
  v_reached_count bigint;
  v_total_count bigint;
  v_max_depth integer;
  v_invalid_legacy_enum boolean := false;
BEGIN
  IF (SELECT state FROM catalog_schema_materialization_state) =
      'repository_chain'
  THEN
    EXECUTE $query$
      SELECT EXISTS (
        SELECT 1
        FROM public.catalog_spec_definitions AS definition
        WHERE (
          definition.value_type IN ('single_enum', 'multi_enum')
          AND (
            cardinality(definition.enum_options) = 0
            OR EXISTS (
              SELECT 1
              FROM unnest(definition.enum_options) AS option(value)
              WHERE btrim(option.value) = ''
            )
            OR (
              SELECT count(*)
              FROM unnest(definition.enum_options) AS option(value)
            ) <> (
              SELECT count(DISTINCT lower(btrim(option.value)))
              FROM unnest(definition.enum_options) AS option(value)
            )
          )
        )
        OR (
          definition.value_type NOT IN ('single_enum', 'multi_enum')
          AND cardinality(definition.enum_options) <> 0
        )
      )
    $query$ INTO v_invalid_legacy_enum;
  ELSE
    EXECUTE $query$
      SELECT EXISTS (
        SELECT 1
        FROM public.catalog_spec_definitions AS definition
        WHERE (
          definition.value_type IN ('single_enum', 'multi_enum')
          AND (
            jsonb_typeof(definition.enum_options) <> 'array'
            OR jsonb_array_length(definition.enum_options) = 0
            OR EXISTS (
              SELECT 1
              FROM jsonb_array_elements(definition.enum_options) AS option(value)
              WHERE jsonb_typeof(option.value) <> 'string'
                OR btrim(option.value #>> '{}') = ''
            )
            OR (
              SELECT count(*)
              FROM jsonb_array_elements(definition.enum_options)
            ) <> (
              SELECT count(DISTINCT lower(btrim(option.value #>> '{}')))
              FROM jsonb_array_elements(definition.enum_options) AS option(value)
            )
          )
        )
        OR (
          definition.value_type NOT IN ('single_enum', 'multi_enum')
          AND definition.enum_options <> '[]'::jsonb
        )
      )
    $query$ INTO v_invalid_legacy_enum;
  END IF;

  IF v_invalid_legacy_enum THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_CATALOG_SCHEMA_STATE_UNSUPPORTED',
      DETAIL = 'legacy enum options contain blanks, normalized duplicates, or invalid values';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.catalog_categories AS child
    LEFT JOIN public.catalog_categories AS parent ON parent.id = child.parent_id
    WHERE child.parent_id IS NOT NULL AND parent.id IS NULL
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_CATALOG_SCHEMA_STATE_UNSUPPORTED',
      DETAIL = 'catalog category hierarchy contains an orphan';
  END IF;

  WITH RECURSIVE category_tree AS (
    SELECT
      category.id,
      category.parent_id,
      1 AS depth,
      ARRAY[category.id]::uuid[] AS path
    FROM public.catalog_categories AS category
    WHERE category.parent_id IS NULL

    UNION ALL

    SELECT
      child.id,
      child.parent_id,
      category_tree.depth + 1,
      category_tree.path || child.id
    FROM public.catalog_categories AS child
    JOIN category_tree ON category_tree.id = child.parent_id
    WHERE NOT child.id = ANY(category_tree.path)
      AND category_tree.depth < 9
  )
  SELECT count(*), max(depth)
  INTO v_reached_count, v_max_depth
  FROM category_tree;

  SELECT count(*) INTO v_total_count FROM public.catalog_categories;

  IF v_reached_count IS DISTINCT FROM v_total_count THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_CATALOG_SCHEMA_STATE_UNSUPPORTED',
      DETAIL = 'catalog category hierarchy contains a cycle or exceeds eight levels';
  END IF;

  IF coalesce(v_max_depth, 0) > 8 THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_CATALOG_SCHEMA_STATE_UNSUPPORTED',
      DETAIL = 'catalog category hierarchy exceeds eight levels';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.catalog_categories AS category
    WHERE NOT (
      (category.ownership_scope = 'platform' AND category.owner_tenant_id IS NULL)
      OR (category.ownership_scope = 'tenant' AND category.owner_tenant_id IS NOT NULL)
    )
  ) OR EXISTS (
    SELECT 1
    FROM public.catalog_brands AS brand
    WHERE NOT (
      (brand.ownership_scope = 'platform' AND brand.owner_tenant_id IS NULL)
      OR (brand.ownership_scope = 'tenant' AND brand.owner_tenant_id IS NOT NULL)
    )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_CATALOG_SCHEMA_STATE_UNSUPPORTED',
      DETAIL = 'catalog ownership rows are inconsistent';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.catalog_categories AS child
    JOIN public.catalog_categories AS parent ON parent.id = child.parent_id
    WHERE child.ownership_scope IS DISTINCT FROM parent.ownership_scope
      OR child.owner_tenant_id IS DISTINCT FROM parent.owner_tenant_id
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_CATALOG_SCHEMA_STATE_UNSUPPORTED',
      DETAIL = 'catalog category parent ownership is inconsistent';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.catalog_categories AS category
    LEFT JOIN public.catalog_categories AS mapped
      ON mapped.id = category.mapped_platform_category_id
    WHERE category.mapped_platform_category_id IS NOT NULL
      AND (
        category.ownership_scope <> 'tenant'
        OR category.owner_tenant_id IS NULL
        OR mapped.id IS NULL
        OR mapped.ownership_scope <> 'platform'
        OR mapped.owner_tenant_id IS NOT NULL
        OR mapped.status <> 'active'
      )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_CATALOG_SCHEMA_STATE_UNSUPPORTED',
      DETAIL = 'catalog category mapping is not tenant to active platform';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.catalog_brands AS brand
    LEFT JOIN public.catalog_brands AS mapped
      ON mapped.id = brand.mapped_platform_brand_id
    WHERE brand.mapped_platform_brand_id IS NOT NULL
      AND (
        brand.ownership_scope <> 'tenant'
        OR brand.owner_tenant_id IS NULL
        OR mapped.id IS NULL
        OR mapped.ownership_scope <> 'platform'
        OR mapped.owner_tenant_id IS NOT NULL
        OR mapped.status <> 'active'
      )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_CATALOG_SCHEMA_STATE_UNSUPPORTED',
      DETAIL = 'catalog brand mapping is not tenant to active platform';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.catalog_categories AS category
    WHERE EXISTS (
      SELECT 1
      FROM public.catalog_categories AS child
      WHERE child.parent_id = category.id
    )
      AND (
        EXISTS (
          SELECT 1
          FROM public.supplier_products AS product
          WHERE product.category_id = category.id
        )
        OR EXISTS (
          SELECT 1
          FROM public.catalog_spec_definitions AS definition
          WHERE definition.category_id = category.id
        )
      )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_CATALOG_REFERENCE_IN_USE',
      DETAIL = 'an existing product or specification references an actual non-leaf category';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.catalog_spec_definitions AS definition
    LEFT JOIN public.catalog_categories AS category
      ON category.id = definition.category_id
    LEFT JOIN public.catalog_spec_definitions AS source
      ON source.id = definition.source_platform_spec_id
    WHERE category.id IS NULL
      OR category.status <> 'active'
      OR category.ownership_scope IS DISTINCT FROM definition.ownership_scope
      OR category.owner_tenant_id IS DISTINCT FROM definition.owner_tenant_id
      OR (
        definition.source_platform_spec_id IS NOT NULL
        AND (
          source.id IS NULL
          OR source.ownership_scope <> 'platform'
          OR source.owner_tenant_id IS NOT NULL
          OR source.status <> 'active'
          OR definition.ownership_scope <> 'tenant'
          OR source.id = definition.id
          OR category.mapped_platform_category_id IS DISTINCT FROM source.category_id
        )
      )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_CATALOG_SCHEMA_STATE_UNSUPPORTED',
      DETAIL = 'catalog specification ownership or source mapping is inconsistent';
  END IF;
END;
$$;

-- Remove only the trigger/constraint set belonging to the recognized state.
DO $$
DECLARE
  v_state text := (SELECT state FROM catalog_schema_materialization_state);
BEGIN
  IF v_state = 'repository_chain' THEN
    EXECUTE 'DROP TRIGGER tr_catalog_categories_set_level ON public.catalog_categories';
    EXECUTE 'DROP TRIGGER tr_catalog_categories_guard_scope ON public.catalog_categories';
    EXECUTE 'DROP TRIGGER tr_catalog_brands_guard_scope ON public.catalog_brands';
    EXECUTE 'DROP TRIGGER tr_supplier_products_guard_ownership ON public.supplier_products';
    EXECUTE 'DROP TRIGGER tr_supplier_products_guard_tenant_write ON public.supplier_products';

    EXECUTE 'ALTER TABLE public.catalog_categories DROP CONSTRAINT catalog_categories_level_check';
    EXECUTE 'ALTER TABLE public.catalog_categories DROP CONSTRAINT catalog_categories_full_name_trimmed_check';
    EXECUTE 'ALTER TABLE public.catalog_spec_definitions DROP CONSTRAINT catalog_spec_definitions_enum_options_check';
    EXECUTE 'ALTER TABLE public.catalog_spec_definitions DROP CONSTRAINT catalog_spec_definitions_ownership_check';
    EXECUTE 'ALTER TABLE public.catalog_unit_suggestions DROP CONSTRAINT catalog_unit_suggestions_name_trimmed_check';
    EXECUTE 'ALTER TABLE public.catalog_unit_suggestions DROP CONSTRAINT catalog_unit_suggestions_symbol_trimmed_check';
    EXECUTE 'ALTER TABLE public.catalog_unit_suggestions DROP CONSTRAINT catalog_unit_suggestions_dimension_trimmed_check';
    EXECUTE 'ALTER TABLE public.catalog_unit_suggestions DROP CONSTRAINT catalog_unit_suggestions_status_check';
  ELSE
    EXECUTE 'DROP TRIGGER tr_catalog_categories_validate_hierarchy ON public.catalog_categories';
    EXECUTE 'DROP TRIGGER tr_catalog_categories_refresh_descendants ON public.catalog_categories';
    EXECUTE 'DROP TRIGGER tr_catalog_categories_refresh_after_delete ON public.catalog_categories';
    EXECUTE 'DROP TRIGGER tr_catalog_brands_validate_mapping ON public.catalog_brands';
    EXECUTE 'DROP TRIGGER tr_catalog_brands_protect_platform_no_brand ON public.catalog_brands';
    EXECUTE 'DROP TRIGGER tr_catalog_spec_definitions_validate_ownership ON public.catalog_spec_definitions';
    EXECUTE 'DROP TRIGGER tr_catalog_spec_definitions_guard_ownership_immutable ON public.catalog_spec_definitions';
    EXECUTE 'DROP TRIGGER tr_catalog_spec_definitions_updated_at ON public.catalog_spec_definitions';
    EXECUTE 'DROP TRIGGER tr_catalog_unit_suggestions_validate_state ON public.catalog_unit_suggestions';
    EXECUTE 'DROP TRIGGER tr_catalog_unit_suggestions_updated_at ON public.catalog_unit_suggestions';
    EXECUTE 'DROP TRIGGER tr_catalog_units_validate_dimension ON public.catalog_units';
    EXECUTE 'DROP TRIGGER tr_catalog_units_sync_base_dimension ON public.catalog_units';

    EXECUTE 'ALTER TABLE public.catalog_categories DROP CONSTRAINT catalog_categories_level_check';
    EXECUTE 'ALTER TABLE public.catalog_categories DROP CONSTRAINT catalog_categories_full_name_trimmed_check';
    EXECUTE 'ALTER TABLE public.catalog_categories DROP CONSTRAINT catalog_categories_mapping_scope_check';
    EXECUTE 'ALTER TABLE public.catalog_brands DROP CONSTRAINT catalog_brands_mapping_scope_check';
    EXECUTE 'ALTER TABLE public.catalog_spec_definitions DROP CONSTRAINT catalog_spec_definitions_enum_options_check';
    EXECUTE 'ALTER TABLE public.catalog_spec_definitions DROP CONSTRAINT catalog_spec_definitions_unit_dimension_check';
    EXECUTE 'ALTER TABLE public.catalog_spec_definitions DROP CONSTRAINT catalog_spec_definitions_ownership_check';
    EXECUTE 'ALTER TABLE public.catalog_unit_suggestions DROP CONSTRAINT catalog_unit_suggestions_code_check';
    EXECUTE 'ALTER TABLE public.catalog_unit_suggestions DROP CONSTRAINT catalog_unit_suggestions_name_check';
    EXECUTE 'ALTER TABLE public.catalog_unit_suggestions DROP CONSTRAINT catalog_unit_suggestions_symbol_check';
    EXECUTE 'ALTER TABLE public.catalog_unit_suggestions DROP CONSTRAINT catalog_unit_suggestions_dimension_check';
    EXECUTE 'ALTER TABLE public.catalog_unit_suggestions DROP CONSTRAINT catalog_unit_suggestions_reason_check';
    EXECUTE 'ALTER TABLE public.catalog_unit_suggestions DROP CONSTRAINT catalog_unit_suggestions_status_check';
    EXECUTE 'ALTER TABLE public.catalog_unit_suggestions DROP CONSTRAINT catalog_unit_suggestions_version_check';
    EXECUTE 'ALTER TABLE public.catalog_unit_suggestions DROP CONSTRAINT catalog_unit_suggestions_review_remark_check';
    EXECUTE 'ALTER TABLE public.catalog_unit_suggestions DROP CONSTRAINT catalog_unit_suggestions_review_state_check';
    EXECUTE 'ALTER TABLE public.catalog_units DROP CONSTRAINT catalog_units_dimension_check';
  END IF;

  EXECUTE 'DROP TRIGGER tr_catalog_categories_guard_ownership_immutable ON public.catalog_categories';
  EXECUTE 'DROP TRIGGER tr_catalog_categories_lock_hierarchy ON public.catalog_categories';
  EXECUTE 'DROP TRIGGER tr_catalog_categories_updated_at ON public.catalog_categories';
  EXECUTE 'DROP TRIGGER tr_catalog_categories_protect_supplier_products ON public.catalog_categories';
  EXECUTE 'DROP TRIGGER tr_catalog_brands_guard_ownership_immutable ON public.catalog_brands';
  EXECUTE 'DROP TRIGGER tr_catalog_brands_updated_at ON public.catalog_brands';
  EXECUTE 'DROP TRIGGER tr_catalog_brands_protect_supplier_products ON public.catalog_brands';
  EXECUTE 'DROP TRIGGER tr_catalog_units_lock_hierarchy ON public.catalog_units';
  EXECUTE 'DROP TRIGGER tr_catalog_units_updated_at ON public.catalog_units';
  EXECUTE 'DROP TRIGGER tr_catalog_units_validate_base ON public.catalog_units';
END;
$$;

-- Materialize the repository-chain columns. The suggestion table is known to
-- be empty at this point, so required new audit fields are not fabricated.
DO $$
BEGIN
  IF (SELECT state FROM catalog_schema_materialization_state) =
      'repository_chain'
  THEN
    EXECUTE $ddl$
      ALTER TABLE public.catalog_spec_definitions
        RENAME COLUMN required TO is_required
    $ddl$;
    EXECUTE $ddl$
      ALTER TABLE public.catalog_spec_definitions
        RENAME COLUMN filterable TO is_filterable
    $ddl$;
    EXECUTE $ddl$
      ALTER TABLE public.catalog_spec_definitions
        ALTER COLUMN enum_options DROP DEFAULT,
        ALTER COLUMN enum_options TYPE jsonb USING to_jsonb(enum_options),
        ALTER COLUMN enum_options SET DEFAULT '[]'::jsonb,
        ALTER COLUMN ownership_scope SET DEFAULT 'platform'
    $ddl$;

    EXECUTE $ddl$
      ALTER TABLE public.catalog_unit_suggestions
        RENAME COLUMN name TO suggested_name
    $ddl$;
    EXECUTE $ddl$
      ALTER TABLE public.catalog_unit_suggestions
        RENAME COLUMN symbol TO suggested_symbol
    $ddl$;
    EXECUTE $ddl$
      ALTER TABLE public.catalog_unit_suggestions
        RENAME COLUMN dimension TO unit_dimension
    $ddl$;
    EXECUTE $ddl$
      ALTER TABLE public.catalog_unit_suggestions
        RENAME COLUMN note TO reason
    $ddl$;
    EXECUTE $ddl$
      ALTER TABLE public.catalog_unit_suggestions
        RENAME COLUMN processed_by_employee_id TO reviewed_by_employee_id
    $ddl$;
    EXECUTE $ddl$
      ALTER TABLE public.catalog_unit_suggestions
        RENAME COLUMN processed_at TO reviewed_at
    $ddl$;
    EXECUTE $ddl$
      ALTER TABLE public.catalog_unit_suggestions
        RENAME COLUMN created_by_employee_id TO submitted_by_employee_id
    $ddl$;
    EXECUTE $ddl$
      ALTER TABLE public.catalog_unit_suggestions
        ADD COLUMN suggested_code text NOT NULL,
        ADD COLUMN version integer NOT NULL DEFAULT 1,
        ADD COLUMN review_remark text NULL,
        ADD COLUMN approved_catalog_unit_id uuid NULL
          REFERENCES public.catalog_units(id) ON DELETE RESTRICT,
        ALTER COLUMN status SET DEFAULT 'submitted'
    $ddl$;

    EXECUTE $ddl$
      ALTER TABLE public.catalog_units ADD COLUMN unit_dimension text NULL
    $ddl$;
    EXECUTE $ddl$
      UPDATE public.catalog_units
      SET unit_dimension = 'legacy_unclassified'
      WHERE unit_dimension IS NULL
    $ddl$;
    EXECUTE $ddl$
      ALTER TABLE public.catalog_units
        ALTER COLUMN unit_dimension SET DEFAULT 'legacy_unclassified'
    $ddl$;
  END IF;
END;
$$;

-- Rebuild category projections with cycle/depth already proven safe.
WITH RECURSIVE category_paths AS (
  SELECT
    category.id,
    btrim(category.name)::text AS full_name,
    1 AS level,
    ARRAY[category.id]::uuid[] AS path
  FROM public.catalog_categories AS category
  WHERE category.parent_id IS NULL

  UNION ALL

  SELECT
    child.id,
    category_paths.full_name || ' / ' || btrim(child.name),
    category_paths.level + 1,
    category_paths.path || child.id
  FROM public.catalog_categories AS child
  JOIN category_paths ON category_paths.id = child.parent_id
  WHERE NOT child.id = ANY(category_paths.path)
)
UPDATE public.catalog_categories AS category
SET full_name = category_paths.full_name,
    level = category_paths.level
FROM category_paths
WHERE category.id = category_paths.id
  AND (
    category.full_name IS DISTINCT FROM category_paths.full_name
    OR category.level IS DISTINCT FROM category_paths.level
  );

UPDATE public.catalog_categories AS category
SET is_leaf = NOT EXISTS (
  SELECT 1
  FROM public.catalog_categories AS child
  WHERE child.parent_id = category.id
)
WHERE category.is_leaf IS DISTINCT FROM NOT EXISTS (
  SELECT 1
  FROM public.catalog_categories AS child
  WHERE child.parent_id = category.id
);

ALTER TABLE public.catalog_categories
  ALTER COLUMN is_leaf SET DEFAULT true;

ALTER TABLE public.catalog_spec_definitions
  ALTER COLUMN ownership_scope SET DEFAULT 'platform';

ALTER TABLE public.catalog_units
  ALTER COLUMN unit_dimension SET DEFAULT 'legacy_unclassified';

-- Guard functions are schema invariants, not business command entry points.
CREATE OR REPLACE FUNCTION public.validate_catalog_category_hierarchy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  parent public.catalog_categories%ROWTYPE;
  mapped public.catalog_categories%ROWTYPE;
  v_subtree_depth integer := 0;
BEGIN
  IF TG_OP = 'UPDATE'
    AND pg_trigger_depth() = 1
    AND NEW.parent_id IS NOT DISTINCT FROM OLD.parent_id
    AND NEW.name IS NOT DISTINCT FROM OLD.name
    AND (
      NEW.level IS DISTINCT FROM OLD.level
      OR NEW.full_name IS DISTINCT FROM OLD.full_name
      OR NEW.is_leaf IS DISTINCT FROM OLD.is_leaf
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_CATALOG_DERIVED_FIELD_IMMUTABLE';
  END IF;

  IF NEW.mapped_platform_category_id IS NOT NULL THEN
    SELECT mapped_category.* INTO mapped
    FROM public.catalog_categories AS mapped_category
    WHERE mapped_category.id = NEW.mapped_platform_category_id
    FOR SHARE;

    IF NEW.ownership_scope IS DISTINCT FROM 'tenant'
      OR NEW.owner_tenant_id IS NULL
      OR NOT FOUND
      OR mapped.ownership_scope IS DISTINCT FROM 'platform'
      OR mapped.owner_tenant_id IS NOT NULL
      OR mapped.status IS DISTINCT FROM 'active'
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001', MESSAGE = 'CATEGORY_OWNERSHIP_CONFLICT';
    END IF;
  END IF;

  IF NEW.parent_id IS NULL THEN
    NEW.level := 1;
    NEW.full_name := btrim(NEW.name);
  ELSE
    IF NEW.parent_id = NEW.id
      OR EXISTS (
        WITH RECURSIVE ancestors AS (
          SELECT
            ancestor.id,
            ancestor.parent_id,
            ARRAY[ancestor.id]::uuid[] AS path
          FROM public.catalog_categories AS ancestor
          WHERE ancestor.id = NEW.parent_id

          UNION ALL

          SELECT
            ancestor.id,
            ancestor.parent_id,
            ancestors.path || ancestor.id
          FROM public.catalog_categories AS ancestor
          JOIN ancestors ON ancestors.parent_id = ancestor.id
          WHERE NOT ancestor.id = ANY(ancestors.path)
        )
        SELECT 1 FROM ancestors WHERE ancestors.id = NEW.id
      )
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001', MESSAGE = 'SUPPLIER_CATALOG_CYCLE';
    END IF;

    SELECT parent_category.* INTO parent
    FROM public.catalog_categories AS parent_category
    WHERE parent_category.id = NEW.parent_id
    FOR UPDATE;

    IF NOT FOUND
      OR parent.ownership_scope IS DISTINCT FROM NEW.ownership_scope
      OR parent.owner_tenant_id IS DISTINCT FROM NEW.owner_tenant_id
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001', MESSAGE = 'CATEGORY_OWNERSHIP_CONFLICT';
    END IF;

    IF NEW.status = 'active' AND parent.status <> 'active' THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001', MESSAGE = 'SUPPLIER_CATALOG_REFERENCE_INVALID';
    END IF;

    IF (TG_OP = 'INSERT' OR NEW.parent_id IS DISTINCT FROM OLD.parent_id)
      AND (
        EXISTS (
          SELECT 1 FROM public.supplier_products AS product
          WHERE product.category_id = parent.id
        )
        OR EXISTS (
          SELECT 1 FROM public.catalog_spec_definitions AS definition
          WHERE definition.category_id = parent.id
        )
      )
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001', MESSAGE = 'SUPPLIER_CATALOG_REFERENCE_IN_USE';
    END IF;

    NEW.level := parent.level + 1;
    IF NEW.level > 8 THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001', MESSAGE = 'SUPPLIER_CATALOG_DEPTH_EXCEEDED';
    END IF;
    NEW.full_name := parent.full_name || ' / ' || btrim(NEW.name);
  END IF;

  IF TG_OP = 'UPDATE' THEN
    WITH RECURSIVE descendants AS (
      SELECT child.id, 1 AS relative_depth
      FROM public.catalog_categories AS child
      WHERE child.parent_id = OLD.id

      UNION ALL

      SELECT child.id, descendants.relative_depth + 1
      FROM public.catalog_categories AS child
      JOIN descendants ON descendants.id = child.parent_id
    )
    SELECT coalesce(max(relative_depth), 0)
    INTO v_subtree_depth
    FROM descendants;

    IF NEW.level + v_subtree_depth > 8 THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001', MESSAGE = 'SUPPLIER_CATALOG_DEPTH_EXCEEDED';
    END IF;

    IF OLD.status = 'active'
      AND NEW.status = 'inactive'
      AND EXISTS (
        SELECT 1 FROM public.catalog_categories AS child
        WHERE child.parent_id = OLD.id AND child.status = 'active'
      )
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001', MESSAGE = 'SUPPLIER_CATALOG_REFERENCE_IN_USE';
    END IF;
  END IF;

  NEW.is_leaf := NOT EXISTS (
    SELECT 1 FROM public.catalog_categories AS child
    WHERE child.parent_id = NEW.id
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_catalog_category_descendants()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NULL;
  END IF;

  IF TG_OP <> 'DELETE' THEN
    WITH RECURSIVE descendants AS (
      SELECT
        child.id,
        NEW.level + 1 AS level,
        NEW.full_name || ' / ' || btrim(child.name) AS full_name,
        ARRAY[NEW.id, child.id]::uuid[] AS path
      FROM public.catalog_categories AS child
      WHERE child.parent_id = NEW.id

      UNION ALL

      SELECT
        child.id,
        descendants.level + 1,
        descendants.full_name || ' / ' || btrim(child.name),
        descendants.path || child.id
      FROM public.catalog_categories AS child
      JOIN descendants ON descendants.id = child.parent_id
      WHERE NOT child.id = ANY(descendants.path)
    )
    UPDATE public.catalog_categories AS category
    SET level = descendants.level,
        full_name = descendants.full_name
    FROM descendants
    WHERE category.id = descendants.id
      AND (
        category.level IS DISTINCT FROM descendants.level
        OR category.full_name IS DISTINCT FROM descendants.full_name
      );
  END IF;

  IF TG_OP = 'DELETE' THEN
    UPDATE public.catalog_categories AS category
    SET is_leaf = NOT EXISTS (
      SELECT 1 FROM public.catalog_categories AS child
      WHERE child.parent_id = category.id
    )
    WHERE category.id = OLD.parent_id;
  ELSIF TG_OP = 'INSERT' THEN
    UPDATE public.catalog_categories AS category
    SET is_leaf = NOT EXISTS (
      SELECT 1 FROM public.catalog_categories AS child
      WHERE child.parent_id = category.id
    )
    WHERE category.id IN (NEW.id, NEW.parent_id);
  ELSE
    UPDATE public.catalog_categories AS category
    SET is_leaf = NOT EXISTS (
      SELECT 1 FROM public.catalog_categories AS child
      WHERE child.parent_id = category.id
    )
    WHERE category.id IN (NEW.id, NEW.parent_id, OLD.parent_id);
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_catalog_brand_mapping()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  mapped public.catalog_brands%ROWTYPE;
BEGIN
  IF NEW.mapped_platform_brand_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT mapped_brand.* INTO mapped
  FROM public.catalog_brands AS mapped_brand
  WHERE mapped_brand.id = NEW.mapped_platform_brand_id
  FOR SHARE;

  IF NEW.ownership_scope IS DISTINCT FROM 'tenant'
    OR NEW.owner_tenant_id IS NULL
    OR NOT FOUND
    OR mapped.ownership_scope IS DISTINCT FROM 'platform'
    OR mapped.owner_tenant_id IS NOT NULL
    OR mapped.status IS DISTINCT FROM 'active'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'BRAND_OWNERSHIP_CONFLICT';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_catalog_spec_definition_ownership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  category public.catalog_categories%ROWTYPE;
  source public.catalog_spec_definitions%ROWTYPE;
BEGIN
  SELECT catalog_category.* INTO category
  FROM public.catalog_categories AS catalog_category
  WHERE catalog_category.id = NEW.category_id
  FOR SHARE;

  IF NOT FOUND
    OR category.status <> 'active'
    OR NOT category.is_leaf
    OR category.ownership_scope IS DISTINCT FROM NEW.ownership_scope
    OR category.owner_tenant_id IS DISTINCT FROM NEW.owner_tenant_id
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'SPEC_TEMPLATE_VALIDATION_ERROR';
  END IF;

  IF NEW.value_type IN ('single_enum', 'multi_enum') THEN
    IF jsonb_typeof(NEW.enum_options) IS DISTINCT FROM 'array'
      OR jsonb_array_length(NEW.enum_options) = 0
      OR EXISTS (
        SELECT 1
        FROM jsonb_array_elements(NEW.enum_options) AS option(value)
        WHERE jsonb_typeof(option.value) IS DISTINCT FROM 'string'
          OR btrim(option.value #>> '{}') = ''
      )
      OR (
        SELECT count(*) FROM jsonb_array_elements(NEW.enum_options)
      ) <> (
        SELECT count(DISTINCT lower(btrim(option.value #>> '{}')))
        FROM jsonb_array_elements(NEW.enum_options) AS option(value)
      )
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001', MESSAGE = 'SPEC_TEMPLATE_VALIDATION_ERROR';
    END IF;
  ELSIF NEW.enum_options IS DISTINCT FROM '[]'::jsonb THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'SPEC_TEMPLATE_VALIDATION_ERROR';
  END IF;

  IF NEW.source_platform_spec_id IS NOT NULL THEN
    SELECT source_definition.* INTO source
    FROM public.catalog_spec_definitions AS source_definition
    WHERE source_definition.id = NEW.source_platform_spec_id
    FOR SHARE;

    IF NOT FOUND
      OR source.ownership_scope IS DISTINCT FROM 'platform'
      OR source.owner_tenant_id IS NOT NULL
      OR source.status IS DISTINCT FROM 'active'
      OR NEW.ownership_scope IS DISTINCT FROM 'tenant'
      OR source.id = NEW.id
      OR category.mapped_platform_category_id IS DISTINCT FROM source.category_id
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001', MESSAGE = 'SPEC_TEMPLATE_VALIDATION_ERROR';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE'
    AND (
      NEW.category_id IS DISTINCT FROM OLD.category_id
      OR NEW.source_platform_spec_id IS DISTINCT FROM OLD.source_platform_spec_id
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'SUPPLIER_OWNERSHIP_IMMUTABLE';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_catalog_unit_suggestion_state()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM employee.id
    FROM public.employees AS employee
    WHERE employee.id = NEW.submitted_by_employee_id
      AND employee.tenant_id = NEW.tenant_id
      AND employee.status = 'active';

    IF NOT FOUND OR NEW.status <> 'submitted' THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001', MESSAGE = 'SUPPLIER_PROXY_ACTOR_INVALID';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
    OR NEW.suggested_code IS DISTINCT FROM OLD.suggested_code
    OR NEW.suggested_name IS DISTINCT FROM OLD.suggested_name
    OR NEW.suggested_symbol IS DISTINCT FROM OLD.suggested_symbol
    OR NEW.unit_dimension IS DISTINCT FROM OLD.unit_dimension
    OR NEW.reason IS DISTINCT FROM OLD.reason
    OR NEW.submitted_by_employee_id IS DISTINCT FROM OLD.submitted_by_employee_id
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'SUPPLIER_OWNERSHIP_IMMUTABLE';
  END IF;

  IF OLD.status <> 'submitted'
    OR NEW.status NOT IN ('approved', 'rejected')
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'SUPPLIER_STATE_CONFLICT';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_catalog_unit_dimension()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_base_dimension text;
BEGIN
  IF NEW.base_unit_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT base_unit.unit_dimension INTO v_base_dimension
  FROM public.catalog_units AS base_unit
  WHERE base_unit.id = NEW.base_unit_id
  FOR SHARE;

  IF NOT FOUND OR v_base_dimension IS DISTINCT FROM NEW.unit_dimension THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'UNIT_CONVERSION_INVALID';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_catalog_base_unit_dimension_to_derived()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.base_unit_id IS NULL
    AND NEW.unit_dimension IS DISTINCT FROM OLD.unit_dimension
  THEN
    UPDATE public.catalog_units AS derived_unit
    SET unit_dimension = NEW.unit_dimension
    WHERE derived_unit.base_unit_id = NEW.id
      AND derived_unit.unit_dimension IS DISTINCT FROM NEW.unit_dimension;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_supplier_product_catalog()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM category.id
  FROM public.catalog_categories AS category
  WHERE category.id = NEW.category_id
    AND category.status = 'active'
    AND category.is_leaf
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'SUPPLIER_CATALOG_REFERENCE_INVALID';
  END IF;

  PERFORM brand.id
  FROM public.catalog_brands AS brand
  WHERE brand.id = NEW.brand_id AND brand.status = 'active'
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'SUPPLIER_CATALOG_REFERENCE_INVALID';
  END IF;

  IF NEW.status = 'active'
    AND NOT EXISTS (
      SELECT 1 FROM public.supplier_skus AS sku
      WHERE sku.supplier_product_id = NEW.id
        AND sku.supplier_id = NEW.supplier_id
        AND sku.status = 'active'
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'SUPPLIER_PRODUCT_STATE_CONFLICT';
  END IF;
  RETURN NEW;
END;
$$;

-- Add low-blocking CHECK constraints first, validate them separately, then
-- promote the two materialized columns to NOT NULL without a second table scan.
ALTER TABLE public.catalog_categories
  ADD CONSTRAINT catalog_categories_v2_level_check
    CHECK (level BETWEEN 1 AND 8) NOT VALID,
  ADD CONSTRAINT catalog_categories_v2_full_name_check
    CHECK (full_name = btrim(full_name) AND full_name <> '') NOT VALID,
  ADD CONSTRAINT catalog_categories_v2_full_name_not_null
    CHECK (full_name IS NOT NULL) NOT VALID,
  ADD CONSTRAINT catalog_categories_v2_mapping_scope_check
    CHECK (
      (ownership_scope = 'platform' AND mapped_platform_category_id IS NULL)
      OR ownership_scope = 'tenant'
    ) NOT VALID;

ALTER TABLE public.catalog_brands
  ADD CONSTRAINT catalog_brands_v2_mapping_scope_check
    CHECK (
      (ownership_scope = 'platform' AND mapped_platform_brand_id IS NULL)
      OR ownership_scope = 'tenant'
    ) NOT VALID;

ALTER TABLE public.catalog_spec_definitions
  ADD CONSTRAINT catalog_spec_definitions_v2_enum_options_check
    CHECK (
      (
        value_type IN ('single_enum', 'multi_enum')
        AND jsonb_typeof(enum_options) = 'array'
        AND jsonb_array_length(enum_options) > 0
      )
      OR (
        value_type NOT IN ('single_enum', 'multi_enum')
        AND enum_options = '[]'::jsonb
      )
    ) NOT VALID,
  ADD CONSTRAINT catalog_spec_definitions_v2_unit_dimension_check
    CHECK (
      (
        value_type = 'number'
        AND (
          unit_dimension IS NULL
          OR (unit_dimension = btrim(unit_dimension) AND unit_dimension <> '')
        )
      )
      OR (value_type <> 'number' AND unit_dimension IS NULL)
    ) NOT VALID,
  ADD CONSTRAINT catalog_spec_definitions_v2_ownership_check
    CHECK (
      (
        ownership_scope = 'platform'
        AND owner_tenant_id IS NULL
        AND source_platform_spec_id IS NULL
      )
      OR (ownership_scope = 'tenant' AND owner_tenant_id IS NOT NULL)
    ) NOT VALID;

ALTER TABLE public.catalog_unit_suggestions
  ADD CONSTRAINT catalog_unit_suggestions_v2_code_check
    CHECK (
      suggested_code = upper(btrim(suggested_code))
      AND suggested_code ~ '^[A-Z0-9_-]{2,64}$'
    ) NOT VALID,
  ADD CONSTRAINT catalog_unit_suggestions_v2_name_check
    CHECK (suggested_name = btrim(suggested_name) AND suggested_name <> '')
    NOT VALID,
  ADD CONSTRAINT catalog_unit_suggestions_v2_symbol_check
    CHECK (suggested_symbol = btrim(suggested_symbol) AND suggested_symbol <> '')
    NOT VALID,
  ADD CONSTRAINT catalog_unit_suggestions_v2_dimension_check
    CHECK (unit_dimension = btrim(unit_dimension) AND unit_dimension <> '')
    NOT VALID,
  ADD CONSTRAINT catalog_unit_suggestions_v2_reason_check
    CHECK (reason IS NULL OR (reason = btrim(reason) AND reason <> ''))
    NOT VALID,
  ADD CONSTRAINT catalog_unit_suggestions_v2_status_check
    CHECK (status IN ('submitted', 'approved', 'rejected')) NOT VALID,
  ADD CONSTRAINT catalog_unit_suggestions_v2_version_check
    CHECK (version > 0) NOT VALID,
  ADD CONSTRAINT catalog_unit_suggestions_v2_review_remark_check
    CHECK (
      review_remark IS NULL
      OR (review_remark = btrim(review_remark) AND review_remark <> '')
    ) NOT VALID,
  ADD CONSTRAINT catalog_unit_suggestions_v2_review_state_check
    CHECK (
      (
        status = 'submitted'
        AND reviewed_by_employee_id IS NULL
        AND reviewed_at IS NULL
        AND review_remark IS NULL
        AND approved_catalog_unit_id IS NULL
      )
      OR (
        status = 'approved'
        AND reviewed_by_employee_id IS NOT NULL
        AND reviewed_at IS NOT NULL
        AND approved_catalog_unit_id IS NOT NULL
      )
      OR (
        status = 'rejected'
        AND reviewed_by_employee_id IS NOT NULL
        AND reviewed_at IS NOT NULL
        AND review_remark IS NOT NULL
        AND approved_catalog_unit_id IS NULL
      )
    ) NOT VALID;

ALTER TABLE public.catalog_units
  ADD CONSTRAINT catalog_units_v2_dimension_check
    CHECK (
      unit_dimension = btrim(unit_dimension)
      AND unit_dimension <> ''
    ) NOT VALID,
  ADD CONSTRAINT catalog_units_v2_dimension_not_null
    CHECK (unit_dimension IS NOT NULL) NOT VALID;

ALTER TABLE public.catalog_categories
  VALIDATE CONSTRAINT catalog_categories_v2_level_check;
ALTER TABLE public.catalog_categories
  VALIDATE CONSTRAINT catalog_categories_v2_full_name_check;
ALTER TABLE public.catalog_categories
  VALIDATE CONSTRAINT catalog_categories_v2_full_name_not_null;
ALTER TABLE public.catalog_categories
  VALIDATE CONSTRAINT catalog_categories_v2_mapping_scope_check;
ALTER TABLE public.catalog_brands
  VALIDATE CONSTRAINT catalog_brands_v2_mapping_scope_check;
ALTER TABLE public.catalog_spec_definitions
  VALIDATE CONSTRAINT catalog_spec_definitions_v2_enum_options_check;
ALTER TABLE public.catalog_spec_definitions
  VALIDATE CONSTRAINT catalog_spec_definitions_v2_unit_dimension_check;
ALTER TABLE public.catalog_spec_definitions
  VALIDATE CONSTRAINT catalog_spec_definitions_v2_ownership_check;
ALTER TABLE public.catalog_unit_suggestions
  VALIDATE CONSTRAINT catalog_unit_suggestions_v2_code_check;
ALTER TABLE public.catalog_unit_suggestions
  VALIDATE CONSTRAINT catalog_unit_suggestions_v2_name_check;
ALTER TABLE public.catalog_unit_suggestions
  VALIDATE CONSTRAINT catalog_unit_suggestions_v2_symbol_check;
ALTER TABLE public.catalog_unit_suggestions
  VALIDATE CONSTRAINT catalog_unit_suggestions_v2_dimension_check;
ALTER TABLE public.catalog_unit_suggestions
  VALIDATE CONSTRAINT catalog_unit_suggestions_v2_reason_check;
ALTER TABLE public.catalog_unit_suggestions
  VALIDATE CONSTRAINT catalog_unit_suggestions_v2_status_check;
ALTER TABLE public.catalog_unit_suggestions
  VALIDATE CONSTRAINT catalog_unit_suggestions_v2_version_check;
ALTER TABLE public.catalog_unit_suggestions
  VALIDATE CONSTRAINT catalog_unit_suggestions_v2_review_remark_check;
ALTER TABLE public.catalog_unit_suggestions
  VALIDATE CONSTRAINT catalog_unit_suggestions_v2_review_state_check;
ALTER TABLE public.catalog_units
  VALIDATE CONSTRAINT catalog_units_v2_dimension_check;
ALTER TABLE public.catalog_units
  VALIDATE CONSTRAINT catalog_units_v2_dimension_not_null;

ALTER TABLE public.catalog_categories ALTER COLUMN full_name SET NOT NULL;
ALTER TABLE public.catalog_units ALTER COLUMN unit_dimension SET NOT NULL;

-- Rename byte-for-byte equivalent indexes and preserve non-equivalent legacy
-- indexes. This avoids both write amplification and a DROP/rebuild window.
DO $$
BEGIN
  IF (SELECT state FROM catalog_schema_materialization_state) =
      'repository_chain'
  THEN
    ALTER INDEX public.catalog_categories_platform_code_unique_idx
      RENAME TO catalog_categories_v2_platform_code_uidx;
    ALTER INDEX public.catalog_categories_tenant_code_unique_idx
      RENAME TO catalog_categories_v2_tenant_code_uidx;
    ALTER INDEX public.catalog_brands_platform_code_unique_idx
      RENAME TO catalog_brands_v2_platform_code_uidx;
    ALTER INDEX public.catalog_brands_tenant_code_unique_idx
      RENAME TO catalog_brands_v2_tenant_code_uidx;
    ALTER INDEX public.catalog_spec_definitions_category_status_sort_idx
      RENAME TO catalog_spec_definitions_v2_category_page_idx;

    CREATE INDEX catalog_categories_v2_mapping_lookup_idx
    ON public.catalog_categories(
      mapped_platform_category_id, owner_tenant_id, id
    ) WHERE mapped_platform_category_id IS NOT NULL;
    CREATE INDEX catalog_categories_v2_scope_path_idx
    ON public.catalog_categories(
      ownership_scope, owner_tenant_id, full_name, id
    );
    CREATE INDEX catalog_brands_v2_mapping_lookup_idx
    ON public.catalog_brands(
      mapped_platform_brand_id, owner_tenant_id, id
    ) WHERE mapped_platform_brand_id IS NOT NULL;
    CREATE UNIQUE INDEX catalog_brands_active_platform_no_brand_idx
    ON public.catalog_brands((1))
    WHERE ownership_scope = 'platform'
      AND owner_tenant_id IS NULL
      AND status = 'active'
      AND upper(btrim(code)) = 'NO_BRAND';
    CREATE UNIQUE INDEX catalog_brands_platform_no_brand_identity_idx
    ON public.catalog_brands((1))
    WHERE ownership_scope = 'platform'
      AND owner_tenant_id IS NULL
      AND (
        upper(btrim(code)) = 'NO_BRAND'
        OR btrim(name) = '无品牌'
      );
    CREATE UNIQUE INDEX catalog_spec_definitions_v2_category_code_uidx
    ON public.catalog_spec_definitions(category_id, upper(btrim(code)));
    CREATE UNIQUE INDEX catalog_spec_definitions_v2_source_copy_uidx
    ON public.catalog_spec_definitions(category_id, source_platform_spec_id)
    WHERE source_platform_spec_id IS NOT NULL;
    CREATE INDEX catalog_spec_definitions_v2_ownership_lookup_idx
    ON public.catalog_spec_definitions(
      ownership_scope, owner_tenant_id, category_id, status, id
    );
    CREATE INDEX catalog_units_v2_dimension_status_idx
    ON public.catalog_units(unit_dimension, status, sort_order, id);
    CREATE INDEX catalog_unit_suggestions_v2_queue_idx
    ON public.catalog_unit_suggestions(status, created_at, id);
    CREATE INDEX catalog_unit_suggestions_v2_tenant_page_idx
    ON public.catalog_unit_suggestions(tenant_id, created_at DESC, id DESC);
  ELSE
    ALTER INDEX public.catalog_categories_mapping_lookup_idx
      RENAME TO catalog_categories_v2_mapping_lookup_idx;
    ALTER INDEX public.catalog_categories_scope_path_idx
      RENAME TO catalog_categories_v2_scope_path_idx;
    ALTER INDEX public.catalog_brands_mapping_lookup_idx
      RENAME TO catalog_brands_v2_mapping_lookup_idx;
    ALTER INDEX public.catalog_spec_definitions_category_status_sort_idx
      RENAME TO catalog_spec_definitions_v2_category_page_idx;
    ALTER INDEX public.catalog_spec_definitions_source_copy_idx
      RENAME TO catalog_spec_definitions_v2_source_copy_uidx;
    ALTER INDEX public.catalog_spec_definitions_ownership_lookup_idx
      RENAME TO catalog_spec_definitions_v2_ownership_lookup_idx;
    ALTER INDEX public.catalog_units_dimension_status_idx
      RENAME TO catalog_units_v2_dimension_status_idx;
    ALTER INDEX public.catalog_unit_suggestions_queue_idx
      RENAME TO catalog_unit_suggestions_v2_queue_idx;
    ALTER INDEX public.catalog_unit_suggestions_tenant_page_idx
      RENAME TO catalog_unit_suggestions_v2_tenant_page_idx;

    CREATE UNIQUE INDEX catalog_categories_v2_platform_code_uidx
    ON public.catalog_categories(upper(btrim(code)))
    WHERE ownership_scope = 'platform';
    CREATE UNIQUE INDEX catalog_categories_v2_tenant_code_uidx
    ON public.catalog_categories(owner_tenant_id, upper(btrim(code)))
    WHERE ownership_scope = 'tenant';
    CREATE UNIQUE INDEX catalog_brands_v2_platform_code_uidx
    ON public.catalog_brands(upper(btrim(code)))
    WHERE ownership_scope = 'platform';
    CREATE UNIQUE INDEX catalog_brands_v2_tenant_code_uidx
    ON public.catalog_brands(owner_tenant_id, upper(btrim(code)))
    WHERE ownership_scope = 'tenant';
    CREATE UNIQUE INDEX catalog_spec_definitions_v2_category_code_uidx
    ON public.catalog_spec_definitions(category_id, upper(btrim(code)));
  END IF;
END;
$$;

-- The active-reference guards run on low-frequency catalog configuration
-- writes. A large product table must use a separately reviewed concurrent-index
-- migration instead of holding a normal CREATE INDEX lock in this transaction.
DO $$
DECLARE
  v_table_bytes bigint;
  v_estimated_rows double precision;
BEGIN
  SELECT pg_relation_size('public.supplier_products'::regclass),
         greatest(table_definition.reltuples, 0)
  INTO v_table_bytes, v_estimated_rows
  FROM pg_class AS table_definition
  WHERE table_definition.oid = 'public.supplier_products'::regclass;

  IF v_table_bytes > 536870912 OR v_estimated_rows > 5000000 THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_CATALOG_INDEX_BUILD_TOO_LARGE',
      DETAIL = format(
        'supplier_products bytes=%s estimated_rows=%s; use a concurrent index migration',
        v_table_bytes,
        v_estimated_rows
      );
  END IF;
END;
$$;

CREATE INDEX supplier_products_active_category_ref_idx
ON public.supplier_products(category_id)
WHERE status = 'active' AND category_id IS NOT NULL;

CREATE INDEX supplier_products_active_brand_ref_idx
ON public.supplier_products(brand_id)
WHERE status = 'active' AND brand_id IS NOT NULL;

-- Trigger execution keeps the caller identity. Direct helper calls remain
-- denied; service_role receives only the reference reads needed by catalog
-- table triggers below. The production workflow runs as supabase_admin, so
-- CREATE OR REPLACE preserves that owner without an incompatible SET ROLE in
-- Supabase CLI shadow databases.

-- Install one deterministic trigger set after both schemas have converged.
CREATE TRIGGER tr_catalog_categories_v2_lock_hierarchy
BEFORE INSERT OR UPDATE ON public.catalog_categories
FOR EACH STATEMENT
EXECUTE FUNCTION public.lock_catalog_category_hierarchy();

CREATE TRIGGER tr_catalog_categories_v2_guard_ownership_immutable
BEFORE UPDATE OF ownership_scope, owner_tenant_id ON public.catalog_categories
FOR EACH ROW
EXECUTE FUNCTION public.guard_supplier_ownership_immutable();

CREATE TRIGGER tr_catalog_categories_v2_validate_hierarchy
BEFORE INSERT OR UPDATE ON public.catalog_categories
FOR EACH ROW
EXECUTE FUNCTION public.validate_catalog_category_hierarchy();

CREATE TRIGGER tr_catalog_categories_v2_refresh_descendants
AFTER INSERT OR UPDATE OF parent_id, name ON public.catalog_categories
FOR EACH ROW
EXECUTE FUNCTION public.refresh_catalog_category_descendants();

CREATE TRIGGER tr_catalog_categories_v2_refresh_after_delete
AFTER DELETE ON public.catalog_categories
FOR EACH ROW
EXECUTE FUNCTION public.refresh_catalog_category_descendants();

CREATE TRIGGER tr_catalog_categories_v2_protect_references
BEFORE UPDATE OF status ON public.catalog_categories
FOR EACH ROW
EXECUTE FUNCTION public.protect_active_supplier_catalog_reference();

CREATE TRIGGER tr_catalog_categories_v2_updated_at
BEFORE UPDATE ON public.catalog_categories
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER tr_catalog_brands_v2_guard_ownership_immutable
BEFORE UPDATE OF ownership_scope, owner_tenant_id ON public.catalog_brands
FOR EACH ROW
EXECUTE FUNCTION public.guard_supplier_ownership_immutable();

CREATE TRIGGER tr_catalog_brands_v2_validate_mapping
BEFORE INSERT OR UPDATE OF
  mapped_platform_brand_id, ownership_scope, owner_tenant_id, status
ON public.catalog_brands
FOR EACH ROW
EXECUTE FUNCTION public.validate_catalog_brand_mapping();

CREATE TRIGGER tr_catalog_brands_v2_protect_references
BEFORE UPDATE OF status ON public.catalog_brands
FOR EACH ROW
EXECUTE FUNCTION public.protect_active_supplier_catalog_reference();

CREATE TRIGGER tr_catalog_brands_v2_protect_platform_no_brand
BEFORE UPDATE OR DELETE ON public.catalog_brands
FOR EACH ROW
EXECUTE FUNCTION public.protect_platform_no_brand_identity();

CREATE TRIGGER tr_catalog_brands_v2_updated_at
BEFORE UPDATE ON public.catalog_brands
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER tr_catalog_spec_definitions_v2_validate_ownership
BEFORE INSERT OR UPDATE ON public.catalog_spec_definitions
FOR EACH ROW
EXECUTE FUNCTION public.validate_catalog_spec_definition_ownership();

CREATE TRIGGER tr_catalog_spec_definitions_v2_guard_ownership_immutable
BEFORE UPDATE OF ownership_scope, owner_tenant_id
ON public.catalog_spec_definitions
FOR EACH ROW
EXECUTE FUNCTION public.guard_supplier_ownership_immutable();

CREATE TRIGGER tr_catalog_spec_definitions_v2_updated_at
BEFORE UPDATE ON public.catalog_spec_definitions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER tr_catalog_unit_suggestions_v2_validate_state
BEFORE INSERT OR UPDATE ON public.catalog_unit_suggestions
FOR EACH ROW
EXECUTE FUNCTION public.validate_catalog_unit_suggestion_state();

CREATE TRIGGER tr_catalog_unit_suggestions_v2_updated_at
BEFORE UPDATE ON public.catalog_unit_suggestions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER tr_catalog_units_v2_validate_dimension
BEFORE INSERT OR UPDATE OF base_unit_id, unit_dimension
ON public.catalog_units
FOR EACH ROW
EXECUTE FUNCTION public.validate_catalog_unit_dimension();

CREATE TRIGGER tr_catalog_units_v2_validate_base
BEFORE INSERT OR UPDATE ON public.catalog_units
FOR EACH ROW
EXECUTE FUNCTION public.validate_catalog_unit_base();

CREATE TRIGGER tr_catalog_units_v2_lock_hierarchy
BEFORE INSERT OR UPDATE ON public.catalog_units
FOR EACH STATEMENT
EXECUTE FUNCTION public.lock_catalog_unit_hierarchy();

CREATE TRIGGER tr_catalog_units_v2_sync_base_dimension
AFTER UPDATE OF unit_dimension ON public.catalog_units
FOR EACH ROW
EXECUTE FUNCTION public.sync_catalog_base_unit_dimension_to_derived();

CREATE TRIGGER tr_catalog_units_v2_updated_at
BEFORE UPDATE ON public.catalog_units
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER tr_supplier_products_v2_guard_ownership
BEFORE INSERT OR UPDATE OF
  supplier_id, category_id, brand_id, ownership_scope, owner_tenant_id
ON public.supplier_products
FOR EACH ROW
EXECUTE FUNCTION public.guard_supplier_product_ownership();

CREATE TRIGGER tr_supplier_products_v2_guard_tenant_write
BEFORE UPDATE ON public.supplier_products
FOR EACH ROW
EXECUTE FUNCTION public.guard_supplier_product_tenant_write();

-- Remove obsolete enum helpers only after their recognized checks are gone.
DO $$
BEGIN
  IF (SELECT state FROM catalog_schema_materialization_state) =
      'repository_chain'
  THEN
    EXECUTE 'DROP FUNCTION public.set_catalog_category_level()';
    EXECUTE 'DROP FUNCTION public.guard_catalog_category_scope()';
    EXECUTE 'DROP FUNCTION public.guard_catalog_brand_scope()';
    EXECUTE 'DROP FUNCTION public.catalog_enum_options_are_distinct(text[])';
  ELSE
    EXECUTE 'DROP FUNCTION public.catalog_enum_options_are_valid(jsonb)';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_supplier_ownership_immutable()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.lock_catalog_category_hierarchy()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.lock_catalog_unit_hierarchy()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.protect_active_supplier_catalog_reference()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.protect_platform_no_brand_identity()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.update_updated_at_column()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.validate_supplier_proxy_actor()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.guard_supplier_product_ownership()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.guard_supplier_product_tenant_write()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.validate_catalog_unit_base()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.validate_catalog_category_hierarchy()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.refresh_catalog_category_descendants()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.validate_catalog_brand_mapping()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.validate_catalog_spec_definition_ownership()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.validate_catalog_unit_suggestion_state()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.validate_catalog_unit_dimension()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.sync_catalog_base_unit_dimension_to_derived()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.validate_supplier_product_catalog()
  FROM PUBLIC, anon, authenticated, service_role;

ALTER TABLE public.catalog_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_categories FORCE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_brands FORCE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_units FORCE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_spec_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_spec_definitions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_unit_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_unit_suggestions FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.catalog_categories
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.catalog_brands
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.catalog_units
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.catalog_spec_definitions
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.catalog_unit_suggestions
  FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.catalog_categories
  TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.catalog_brands
  TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.catalog_units
  TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.catalog_spec_definitions
  TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.catalog_unit_suggestions
  TO service_role;

REVOKE SELECT ON TABLE public.employees, public.supplier_products
  FROM service_role;
GRANT SELECT (id, tenant_id, status) ON public.employees
  TO service_role;
GRANT SELECT (category_id, brand_id, status) ON public.supplier_products
  TO service_role;

DO $$
BEGIN
  IF (SELECT state FROM catalog_schema_materialization_state) = 'granular_v2'
  THEN
    EXECUTE 'DROP POLICY catalog_categories_service_role_all ON public.catalog_categories';
    EXECUTE 'DROP POLICY catalog_brands_service_role_all ON public.catalog_brands';
    EXECUTE 'DROP POLICY catalog_spec_definitions_service_role_all ON public.catalog_spec_definitions';
    EXECUTE 'DROP POLICY catalog_unit_suggestions_service_role_all ON public.catalog_unit_suggestions';
  END IF;
END;
$$;

CREATE POLICY catalog_categories_v2_service_role_all
ON public.catalog_categories FOR ALL TO service_role
USING (true) WITH CHECK (true);

CREATE POLICY catalog_brands_v2_service_role_all
ON public.catalog_brands FOR ALL TO service_role
USING (true) WITH CHECK (true);

CREATE POLICY catalog_units_v2_service_role_all
ON public.catalog_units FOR ALL TO service_role
USING (true) WITH CHECK (true);

CREATE POLICY catalog_spec_definitions_v2_service_role_all
ON public.catalog_spec_definitions FOR ALL TO service_role
USING (true) WITH CHECK (true);

CREATE POLICY catalog_unit_suggestions_v2_service_role_all
ON public.catalog_unit_suggestions FOR ALL TO service_role
USING (true) WITH CHECK (true);

COMMIT;
