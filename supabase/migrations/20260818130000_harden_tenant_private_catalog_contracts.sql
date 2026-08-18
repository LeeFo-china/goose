-- Rollback: forward-only. Disable catalog writes, revoke the catalog command
-- grants below, and install compensating hierarchy and no-brand guards in a
-- later migration. Preserve catalog rows, command events, ownership columns,
-- and every previously applied migration; never roll back by deleting facts.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

-- Fail closed against the schema that is already applied in development.
-- This deliberately does not add columns or silently accept an older shape.
DO $$
DECLARE
  v_column_count integer;
  v_constraint_name text;
  v_definition text;
  v_found boolean;
  v_function_signature text;
  v_index_name text;
  v_rls_count integer;
BEGIN
  SELECT count(*)::integer
  INTO v_column_count
  FROM information_schema.columns AS column_definition
  WHERE column_definition.table_schema = 'public'
    AND (
      (
        column_definition.table_name = 'catalog_unit_suggestions'
        AND (
          (column_definition.column_name = 'version' AND column_definition.udt_name = 'int4')
          OR column_definition.column_name = 'suggested_code'
          OR column_definition.column_name = 'reviewed_by_employee_id'
        )
      )
      OR (
        column_definition.table_name = 'catalog_spec_definitions'
        AND (
          (column_definition.column_name = 'enum_options' AND column_definition.udt_name = 'jsonb')
          OR column_definition.column_name = 'is_required'
          OR column_definition.column_name = 'is_filterable'
        )
      )
      OR (
        column_definition.table_name = 'catalog_categories'
        AND column_definition.column_name IN (
          'full_name', 'is_leaf', 'mapped_platform_category_id'
        )
      )
      OR (
        column_definition.table_name = 'catalog_brands'
        AND column_definition.column_name = 'mapped_platform_brand_id'
      )
    );

  IF v_column_count IS DISTINCT FROM 10 THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_CATALOG_SCHEMA_PRECONDITION_FAILED',
      DETAIL = 'catalog column shape does not match the applied jsonb/versioned schema';
  END IF;

  FOREACH v_constraint_name IN ARRAY ARRAY[
    'catalog_spec_definitions_category_code_key',
    'catalog_spec_definitions_enum_options_check',
    'catalog_spec_definitions_unit_dimension_check',
    'catalog_spec_definitions_ownership_check',
    'catalog_unit_suggestions_review_state_check',
    'catalog_unit_suggestions_version_check'
  ]
  LOOP
    SELECT EXISTS (
      SELECT 1
      FROM pg_constraint AS constraint_definition
      WHERE constraint_definition.conname = v_constraint_name
        AND constraint_definition.conrelid IN (
          'public.catalog_spec_definitions'::regclass,
          'public.catalog_unit_suggestions'::regclass
        )
    )
    INTO v_found;

    IF NOT v_found THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'SUPPLIER_CATALOG_SCHEMA_PRECONDITION_FAILED',
        DETAIL = 'required catalog constraint is missing: ' || v_constraint_name;
    END IF;
  END LOOP;

  FOREACH v_index_name IN ARRAY ARRAY[
    'catalog_categories_platform_code_unique_idx',
    'catalog_categories_tenant_code_unique_idx',
    'catalog_categories_mapping_lookup_idx',
    'catalog_brands_platform_code_unique_idx',
    'catalog_brands_tenant_code_unique_idx',
    'catalog_brands_mapping_lookup_idx',
    'catalog_spec_definitions_category_status_sort_idx',
    'catalog_spec_definitions_ownership_lookup_idx',
    'catalog_spec_definitions_source_copy_idx',
    'catalog_unit_suggestions_tenant_status_idx',
    'catalog_brands_active_platform_no_brand_idx',
    'catalog_brands_platform_no_brand_identity_idx'
  ]
  LOOP
    IF to_regclass('public.' || v_index_name) IS NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'SUPPLIER_CATALOG_SCHEMA_PRECONDITION_FAILED',
        DETAIL = 'required catalog index is missing: ' || v_index_name;
    END IF;
  END LOOP;

  IF to_regprocedure(
    'public.create_tenant_catalog_category(uuid,uuid,text,text,text,integer,uuid,uuid,uuid,uuid,text)'
  ) IS NULL
    OR to_regprocedure(
      'public.update_tenant_catalog_category(uuid,uuid,text,text,text,integer,uuid,integer,uuid,uuid,uuid,text)'
    ) IS NULL
    OR to_regprocedure(
      'public.create_tenant_catalog_brand(uuid,text,text,text,uuid,text,integer,uuid,uuid,uuid,uuid,text)'
    ) IS NULL
    OR to_regprocedure(
      'public.update_tenant_catalog_brand(uuid,text,text,text,uuid,text,integer,uuid,integer,uuid,uuid,uuid,text)'
    ) IS NULL
    OR to_regprocedure(
      'public.create_catalog_spec_definition(uuid,uuid,text,text,text,jsonb,text,boolean,boolean,boolean,integer,text,uuid,uuid,uuid,text)'
    ) IS NULL
    OR to_regprocedure(
      'public.update_catalog_spec_definition(uuid,uuid,text,text,text,jsonb,text,boolean,boolean,boolean,integer,text,integer,uuid,uuid,uuid,text)'
    ) IS NULL
    OR to_regprocedure(
      'public.copy_platform_category_specs(uuid,uuid,integer,uuid,uuid,uuid,text)'
    ) IS NULL
    OR to_regprocedure(
      'public.submit_tenant_catalog_unit_suggestion(uuid,text,text,text,text,text,uuid,uuid,uuid,text)'
    ) IS NULL
    OR to_regprocedure(
      'public.review_catalog_unit_suggestion(uuid,text,uuid,text,integer,uuid,uuid,text)'
    ) IS NULL
    OR to_regprocedure('public.validate_catalog_category_hierarchy()') IS NULL
    OR to_regprocedure('public.refresh_catalog_category_descendants()') IS NULL
    OR to_regprocedure('public.validate_catalog_brand_mapping()') IS NULL
    OR to_regprocedure('public.validate_catalog_spec_definition_ownership()') IS NULL
    OR to_regprocedure('public.validate_catalog_unit_suggestion_state()') IS NULL
    OR to_regprocedure('public.validate_supplier_product_catalog()') IS NULL
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_CATALOG_SCHEMA_PRECONDITION_FAILED',
      DETAIL = 'required catalog command or guard function is missing';
  END IF;

  FOREACH v_function_signature IN ARRAY ARRAY[
    'public.create_tenant_catalog_category(uuid,uuid,text,text,text,integer,uuid,uuid,uuid,uuid,text)',
    'public.update_tenant_catalog_category(uuid,uuid,text,text,text,integer,uuid,integer,uuid,uuid,uuid,text)',
    'public.create_tenant_catalog_brand(uuid,text,text,text,uuid,text,integer,uuid,uuid,uuid,uuid,text)',
    'public.update_tenant_catalog_brand(uuid,text,text,text,uuid,text,integer,uuid,integer,uuid,uuid,uuid,text)',
    'public.create_catalog_spec_definition(uuid,uuid,text,text,text,jsonb,text,boolean,boolean,boolean,integer,text,uuid,uuid,uuid,text)',
    'public.update_catalog_spec_definition(uuid,uuid,text,text,text,jsonb,text,boolean,boolean,boolean,integer,text,integer,uuid,uuid,uuid,text)',
    'public.copy_platform_category_specs(uuid,uuid,integer,uuid,uuid,uuid,text)',
    'public.submit_tenant_catalog_unit_suggestion(uuid,text,text,text,text,text,uuid,uuid,uuid,text)',
    'public.review_catalog_unit_suggestion(uuid,text,uuid,text,integer,uuid,uuid,text)'
  ]
  LOOP
    v_definition := pg_get_functiondef(to_regprocedure(v_function_signature));
    IF position('SECURITY DEFINER' IN v_definition) = 0
      OR position('supplier_command_events' IN v_definition) = 0
      OR position('p_idempotency_key' IN v_definition) = 0
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'SUPPLIER_CATALOG_COMMAND_CONTRACT_MISMATCH',
        DETAIL = v_function_signature;
    END IF;
  END LOOP;

  FOREACH v_function_signature IN ARRAY ARRAY[
    'public.update_tenant_catalog_category(uuid,uuid,text,text,text,integer,uuid,integer,uuid,uuid,uuid,text)',
    'public.update_tenant_catalog_brand(uuid,text,text,text,uuid,text,integer,uuid,integer,uuid,uuid,uuid,text)',
    'public.update_catalog_spec_definition(uuid,uuid,text,text,text,jsonb,text,boolean,boolean,boolean,integer,text,integer,uuid,uuid,uuid,text)',
    'public.copy_platform_category_specs(uuid,uuid,integer,uuid,uuid,uuid,text)',
    'public.review_catalog_unit_suggestion(uuid,text,uuid,text,integer,uuid,uuid,text)'
  ]
  LOOP
    v_definition := pg_get_functiondef(to_regprocedure(v_function_signature));
    IF position('p_expected_version' IN v_definition) = 0 THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'SUPPLIER_CATALOG_COMMAND_CONTRACT_MISMATCH',
        DETAIL = 'expected_version is missing from ' || v_function_signature;
    END IF;
  END LOOP;

  v_definition := pg_get_functiondef(to_regprocedure(
    'public.copy_platform_category_specs(uuid,uuid,integer,uuid,uuid,uuid,text)'
  ));
  IF position('source_platform_spec_id' IN v_definition) = 0
    OR position('''tenant''' IN v_definition) = 0
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_CATALOG_COMMAND_CONTRACT_MISMATCH',
      DETAIL = 'copied specs must be tenant-owned with platform provenance';
  END IF;

  v_definition := pg_get_functiondef(to_regprocedure(
    'public.review_catalog_unit_suggestion(uuid,text,uuid,text,integer,uuid,uuid,text)'
  ));
  IF position('INSERT INTO public.catalog_units' IN v_definition) > 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_CATALOG_COMMAND_CONTRACT_MISMATCH',
      DETAIL = 'unit suggestion review must not create a catalog unit';
  END IF;

  v_definition := pg_get_functiondef(
    to_regprocedure('public.validate_supplier_product_catalog()')
  );
  IF position('category.is_leaf' IN v_definition) = 0
    OR position('category.status' IN v_definition) = 0
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_CATALOG_COMMAND_CONTRACT_MISMATCH',
      DETAIL = 'supplier product catalog guard must require an active leaf';
  END IF;

  IF to_regclass('public.catalog_brands_active_platform_no_brand_idx') IS NULL
    OR to_regclass('public.catalog_brands_platform_no_brand_identity_idx') IS NULL
    OR NOT EXISTS (
      SELECT 1
      FROM pg_trigger AS trigger_definition
      WHERE trigger_definition.tgrelid = 'public.catalog_categories'::regclass
        AND trigger_definition.tgname = 'tr_catalog_categories_validate_hierarchy'
        AND NOT trigger_definition.tgisinternal
    )
    OR NOT EXISTS (
      SELECT 1
      FROM pg_trigger AS trigger_definition
      WHERE trigger_definition.tgrelid = 'public.supplier_products'::regclass
        AND trigger_definition.tgname = 'tr_supplier_products_validate_catalog'
        AND NOT trigger_definition.tgisinternal
    )
    OR NOT EXISTS (
      SELECT 1
      FROM pg_trigger AS trigger_definition
      WHERE trigger_definition.tgrelid = 'public.catalog_brands'::regclass
        AND trigger_definition.tgname = 'tr_catalog_brands_protect_platform_no_brand'
        AND NOT trigger_definition.tgisinternal
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_CATALOG_SCHEMA_PRECONDITION_FAILED',
      DETAIL = 'required catalog trigger or no-brand index is missing';
  END IF;

  SELECT count(*)::integer
  INTO v_rls_count
  FROM pg_class AS table_definition
  WHERE table_definition.oid IN (
    'public.catalog_categories'::regclass,
    'public.catalog_brands'::regclass,
    'public.catalog_spec_definitions'::regclass,
    'public.catalog_unit_suggestions'::regclass
  )
    AND table_definition.relrowsecurity
    AND table_definition.relforcerowsecurity;

  IF v_rls_count IS DISTINCT FROM 4 THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_CATALOG_SCHEMA_PRECONDITION_FAILED',
      DETAIL = 'catalog RLS is not enabled and forced on every catalog table';
  END IF;
END;
$$;

-- The original standard catalog allowed six levels. Keep the legacy function
-- safe if another trigger still references it, and make the table constraint
-- agree with the applied eight-level hierarchy implementation.
ALTER TABLE public.catalog_categories
  DROP CONSTRAINT catalog_categories_level_check,
  ADD CONSTRAINT catalog_categories_level_check
    CHECK (level BETWEEN 1 AND 8);

CREATE OR REPLACE FUNCTION public.set_catalog_category_level()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  parent_level integer;
  parent_status text;
BEGIN
  IF TG_OP = 'UPDATE'
    AND NEW.parent_id IS DISTINCT FROM OLD.parent_id
    AND EXISTS (
      WITH RECURSIVE descendants AS (
        SELECT child.id
        FROM public.catalog_categories AS child
        WHERE child.parent_id = OLD.id

        UNION

        SELECT child.id
        FROM public.catalog_categories AS child
        JOIN descendants ON child.parent_id = descendants.id
      )
      SELECT 1 FROM descendants
    )
  THEN
    RAISE EXCEPTION '只能移动叶子目录分类';
  END IF;

  IF TG_OP = 'UPDATE'
    AND OLD.status = 'active'
    AND NEW.status = 'inactive'
    AND EXISTS (
      SELECT 1
      FROM public.catalog_categories AS child
      WHERE child.parent_id = OLD.id
        AND child.status = 'active'
    )
  THEN
    RAISE EXCEPTION '存在启用的子分类，当前目录分类不能停用';
  END IF;

  IF NEW.parent_id IS NULL THEN
    NEW.level := 1;
    RETURN NEW;
  END IF;

  IF NEW.parent_id = NEW.id THEN
    RAISE EXCEPTION '目录分类不能将自身设为父分类';
  END IF;

  IF EXISTS (
    WITH RECURSIVE ancestors AS (
      SELECT
        parent.id,
        parent.parent_id,
        ARRAY[parent.id]::uuid[] AS path
      FROM public.catalog_categories AS parent
      WHERE parent.id = NEW.parent_id

      UNION ALL

      SELECT
        parent.id,
        parent.parent_id,
        ancestors.path || parent.id
      FROM public.catalog_categories AS parent
      JOIN ancestors ON parent.id = ancestors.parent_id
      WHERE NOT parent.id = ANY(ancestors.path)
    )
    SELECT 1
    FROM ancestors
    WHERE ancestors.id = NEW.id
  )
  THEN
    RAISE EXCEPTION '目录分类层级不能形成环';
  END IF;

  SELECT parent.level, parent.status
  INTO parent_level, parent_status
  FROM public.catalog_categories AS parent
  WHERE parent.id = NEW.parent_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION '父目录分类不存在';
  END IF;

  IF NEW.status = 'active' AND parent_status <> 'active' THEN
    RAISE EXCEPTION '启用的目录分类必须属于启用的父分类';
  END IF;

  NEW.level := parent_level + 1;
  IF NEW.level > 8 THEN
    RAISE EXCEPTION '目录分类层级不能超过 8 级';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.set_catalog_category_level()
  FROM PUBLIC, anon, authenticated, service_role;

-- This is the active hierarchy guard in the applied schema. It derives all
-- path fields, blocks cycles/depth overflow, and rejects any operation that
-- would turn a product-bearing parent into a non-leaf category.
CREATE OR REPLACE FUNCTION public.validate_catalog_category_hierarchy()
RETURNS trigger
LANGUAGE plpgsql
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
    SELECT mapped_category.*
    INTO mapped
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

    SELECT parent_category.*
    INTO parent
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
          SELECT 1
          FROM public.supplier_products AS product
          WHERE product.category_id = parent.id
        )
        OR EXISTS (
          SELECT 1
          FROM public.catalog_spec_definitions AS definition
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
    SELECT COALESCE(max(descendants.relative_depth), 0)
    INTO v_subtree_depth
    FROM descendants;

    IF NEW.level + v_subtree_depth > 8 THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001', MESSAGE = 'SUPPLIER_CATALOG_DEPTH_EXCEEDED';
    END IF;

    IF OLD.status = 'active'
      AND NEW.status = 'inactive'
      AND EXISTS (
        SELECT 1
        FROM public.catalog_categories AS child
        WHERE child.parent_id = OLD.id
          AND child.status = 'active'
      )
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001', MESSAGE = 'SUPPLIER_CATALOG_REFERENCE_IN_USE';
    END IF;
  END IF;

  NEW.is_leaf := NOT EXISTS (
    SELECT 1
    FROM public.catalog_categories AS child
    WHERE child.parent_id = NEW.id
  );

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_catalog_category_hierarchy()
  FROM PUBLIC, anon, authenticated, service_role;

-- Reconcile the platform no-brand identity. The applied schema requires audit
-- employee references, so a missing active platform employee is an explicit
-- migration precondition failure instead of a silent zero-row INSERT.
DROP INDEX public.catalog_brands_active_platform_no_brand_idx;
DROP INDEX public.catalog_brands_platform_no_brand_identity_idx;

DO $$
DECLARE
  v_actor_employee_id uuid;
  v_canonical_id uuid;
  v_canonical_count integer;
BEGIN
  SELECT brand.id
  INTO v_canonical_id
  FROM public.catalog_brands AS brand
  WHERE brand.ownership_scope = 'platform'
    AND brand.owner_tenant_id IS NULL
    AND (
      upper(btrim(brand.code)) = 'NO_BRAND'
      OR btrim(brand.name) = '无品牌'
    )
  ORDER BY
    CASE WHEN brand.code = 'NO_BRAND' THEN 0 ELSE 1 END,
    CASE WHEN brand.status = 'active' THEN 0 ELSE 1 END,
    brand.created_at,
    brand.id
  LIMIT 1
  FOR UPDATE;

  IF v_canonical_id IS NULL THEN
    SELECT employee.id
    INTO v_actor_employee_id
    FROM public.employees AS employee
    WHERE employee.tenant_id IS NULL
      AND employee.status = 'active'
    ORDER BY employee.created_at, employee.id
    LIMIT 1
    FOR SHARE;

    IF v_actor_employee_id IS NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'SUPPLIER_CATALOG_NO_BRAND_ACTOR_MISSING';
    END IF;

    INSERT INTO public.catalog_brands (
      code, name, legal_name, status, sort_order, version,
      created_by_employee_id, updated_by_employee_id,
      ownership_scope, owner_tenant_id
    )
    VALUES (
      'NO_BRAND', '无品牌', NULL, 'active', 9999, 1,
      v_actor_employee_id, v_actor_employee_id, 'platform', NULL
    )
    RETURNING id INTO v_canonical_id;
  END IF;

  UPDATE public.supplier_products AS product
  SET brand_id = v_canonical_id
  WHERE product.brand_id IN (
    SELECT duplicate.id
    FROM public.catalog_brands AS duplicate
    WHERE duplicate.ownership_scope = 'platform'
      AND duplicate.owner_tenant_id IS NULL
      AND duplicate.id <> v_canonical_id
      AND (
        upper(btrim(duplicate.code)) = 'NO_BRAND'
        OR btrim(duplicate.name) = '无品牌'
      )
  );

  UPDATE public.catalog_brands AS tenant_brand
  SET mapped_platform_brand_id = v_canonical_id
  WHERE tenant_brand.mapped_platform_brand_id IN (
    SELECT duplicate.id
    FROM public.catalog_brands AS duplicate
    WHERE duplicate.ownership_scope = 'platform'
      AND duplicate.owner_tenant_id IS NULL
      AND duplicate.id <> v_canonical_id
      AND (
        upper(btrim(duplicate.code)) = 'NO_BRAND'
        OR btrim(duplicate.name) = '无品牌'
      )
  );

  UPDATE public.catalog_brands AS duplicate
  SET code = 'NO_BRAND_LEGACY_' || replace(duplicate.id::text, '-', ''),
      name = CASE
        WHEN btrim(duplicate.name) = '无品牌' THEN '无品牌（历史）'
        ELSE duplicate.name
      END,
      status = 'inactive',
      version = duplicate.version + 1
  WHERE duplicate.ownership_scope = 'platform'
    AND duplicate.owner_tenant_id IS NULL
    AND duplicate.id <> v_canonical_id
    AND (
      upper(btrim(duplicate.code)) = 'NO_BRAND'
      OR btrim(duplicate.name) = '无品牌'
    );

  UPDATE public.catalog_brands AS canonical
  SET code = 'NO_BRAND',
      name = '无品牌',
      legal_name = NULL,
      status = 'active',
      sort_order = 9999,
      version = canonical.version + 1
  WHERE canonical.id = v_canonical_id
    AND (
      canonical.code IS DISTINCT FROM 'NO_BRAND'
      OR canonical.name IS DISTINCT FROM '无品牌'
      OR canonical.legal_name IS NOT NULL
      OR canonical.status IS DISTINCT FROM 'active'
      OR canonical.sort_order IS DISTINCT FROM 9999
    );

  SELECT count(*)::integer
  INTO v_canonical_count
  FROM public.catalog_brands AS brand
  WHERE brand.ownership_scope = 'platform'
    AND brand.owner_tenant_id IS NULL
    AND brand.code = 'NO_BRAND'
    AND brand.name = '无品牌'
    AND brand.status = 'active';

  IF v_canonical_count IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_CATALOG_NO_BRAND_INVARIANT_FAILED';
  END IF;
END;
$$;

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

CREATE OR REPLACE FUNCTION public.protect_platform_no_brand_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF OLD.ownership_scope = 'platform'
    AND OLD.owner_tenant_id IS NULL
    AND OLD.code = 'NO_BRAND'
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
      ERRCODE = 'P0001', MESSAGE = 'SHARED_RESOURCE_READ_ONLY';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.protect_platform_no_brand_identity()
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON TABLE
  public.catalog_categories,
  public.catalog_brands,
  public.catalog_spec_definitions,
  public.catalog_unit_suggestions
FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.catalog_categories,
  public.catalog_brands,
  public.catalog_spec_definitions,
  public.catalog_unit_suggestions
TO service_role;

REVOKE ALL ON FUNCTION public.refresh_catalog_category_descendants()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.validate_catalog_brand_mapping()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.validate_catalog_spec_definition_ownership()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.validate_catalog_unit_suggestion_state()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.validate_supplier_product_catalog()
  FROM PUBLIC, anon, authenticated, service_role;

-- Reassert the command boundary from the actually applied catalog migrations.
-- Browser roles stay denied; only the API service role receives EXECUTE.
REVOKE ALL ON FUNCTION public.create_tenant_catalog_category(
  uuid, uuid, text, text, text, integer, uuid, uuid, uuid, uuid, text
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_tenant_catalog_category(
  uuid, uuid, text, text, text, integer, uuid, uuid, uuid, uuid, text
) TO service_role;

REVOKE ALL ON FUNCTION public.update_tenant_catalog_category(
  uuid, uuid, text, text, text, integer, uuid, integer,
  uuid, uuid, uuid, text
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_tenant_catalog_category(
  uuid, uuid, text, text, text, integer, uuid, integer,
  uuid, uuid, uuid, text
) TO service_role;

REVOKE ALL ON FUNCTION public.create_tenant_catalog_brand(
  uuid, text, text, text, uuid, text, integer, uuid,
  uuid, uuid, uuid, text
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_tenant_catalog_brand(
  uuid, text, text, text, uuid, text, integer, uuid,
  uuid, uuid, uuid, text
) TO service_role;

REVOKE ALL ON FUNCTION public.update_tenant_catalog_brand(
  uuid, text, text, text, uuid, text, integer, uuid, integer,
  uuid, uuid, uuid, text
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_tenant_catalog_brand(
  uuid, text, text, text, uuid, text, integer, uuid, integer,
  uuid, uuid, uuid, text
) TO service_role;

REVOKE ALL ON FUNCTION public.create_catalog_spec_definition(
  uuid, uuid, text, text, text, jsonb, text, boolean, boolean, boolean,
  integer, text, uuid, uuid, uuid, text
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_catalog_spec_definition(
  uuid, uuid, text, text, text, jsonb, text, boolean, boolean, boolean,
  integer, text, uuid, uuid, uuid, text
) TO service_role;

REVOKE ALL ON FUNCTION public.update_catalog_spec_definition(
  uuid, uuid, text, text, text, jsonb, text, boolean, boolean, boolean,
  integer, text, integer, uuid, uuid, uuid, text
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_catalog_spec_definition(
  uuid, uuid, text, text, text, jsonb, text, boolean, boolean, boolean,
  integer, text, integer, uuid, uuid, uuid, text
) TO service_role;

REVOKE ALL ON FUNCTION public.copy_platform_category_specs(
  uuid, uuid, integer, uuid, uuid, uuid, text
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.copy_platform_category_specs(
  uuid, uuid, integer, uuid, uuid, uuid, text
) TO service_role;

REVOKE ALL ON FUNCTION public.submit_tenant_catalog_unit_suggestion(
  uuid, text, text, text, text, text, uuid, uuid, uuid, text
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.submit_tenant_catalog_unit_suggestion(
  uuid, text, text, text, text, text, uuid, uuid, uuid, text
) TO service_role;

REVOKE ALL ON FUNCTION public.review_catalog_unit_suggestion(
  uuid, text, uuid, text, integer, uuid, uuid, text
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.review_catalog_unit_suggestion(
  uuid, text, uuid, text, integer, uuid, uuid, text
) TO service_role;

COMMIT;
