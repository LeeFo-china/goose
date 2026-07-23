-- Rollback: in a new migration, drop the six catalog triggers, then drop
-- catalog_units, catalog_brands, and catalog_categories in that order, and
-- finally drop validate_catalog_unit_base(), set_catalog_category_level(),
-- and lock_catalog_category_hierarchy().
-- This is destructive and removes the platform standard catalog, so export
-- and reconcile all downstream catalog references before rollback.

BEGIN;

CREATE TABLE public.catalog_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id uuid NULL
    REFERENCES public.catalog_categories(id) ON DELETE RESTRICT,
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  level integer NOT NULL,
  status text NOT NULL DEFAULT 'active',
  sort_order integer NOT NULL DEFAULT 100,
  version integer NOT NULL DEFAULT 1,
  created_by_employee_id uuid NOT NULL
    REFERENCES public.employees(id) ON DELETE RESTRICT,
  updated_by_employee_id uuid NOT NULL
    REFERENCES public.employees(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT catalog_categories_code_trimmed_check
    CHECK (code = btrim(code) AND code <> ''),
  CONSTRAINT catalog_categories_name_trimmed_check
    CHECK (name = btrim(name) AND name <> ''),
  CONSTRAINT catalog_categories_level_check
    CHECK (level BETWEEN 1 AND 6),
  CONSTRAINT catalog_categories_status_check
    CHECK (status IN ('active', 'inactive')),
  CONSTRAINT catalog_categories_version_check
    CHECK (version > 0)
);

CREATE TABLE public.catalog_brands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  legal_name text NULL,
  logo_file_id uuid NULL
    REFERENCES public.platform_file_objects(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active',
  sort_order integer NOT NULL DEFAULT 100,
  version integer NOT NULL DEFAULT 1,
  created_by_employee_id uuid NOT NULL
    REFERENCES public.employees(id) ON DELETE RESTRICT,
  updated_by_employee_id uuid NOT NULL
    REFERENCES public.employees(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT catalog_brands_code_trimmed_check
    CHECK (code = btrim(code) AND code <> ''),
  CONSTRAINT catalog_brands_name_trimmed_check
    CHECK (name = btrim(name) AND name <> ''),
  CONSTRAINT catalog_brands_legal_name_trimmed_check CHECK (
    legal_name IS NULL
    OR (legal_name = btrim(legal_name) AND legal_name <> '')
  ),
  CONSTRAINT catalog_brands_status_check
    CHECK (status IN ('active', 'inactive')),
  CONSTRAINT catalog_brands_version_check
    CHECK (version > 0)
);

CREATE TABLE public.catalog_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  symbol text NOT NULL,
  base_unit_id uuid NULL
    REFERENCES public.catalog_units(id) ON DELETE RESTRICT,
  conversion_factor numeric(18, 6) NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'active',
  sort_order integer NOT NULL DEFAULT 100,
  version integer NOT NULL DEFAULT 1,
  created_by_employee_id uuid NOT NULL
    REFERENCES public.employees(id) ON DELETE RESTRICT,
  updated_by_employee_id uuid NOT NULL
    REFERENCES public.employees(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT catalog_units_code_trimmed_check
    CHECK (code = btrim(code) AND code <> ''),
  CONSTRAINT catalog_units_name_trimmed_check
    CHECK (name = btrim(name) AND name <> ''),
  CONSTRAINT catalog_units_symbol_trimmed_check
    CHECK (symbol = btrim(symbol) AND symbol <> ''),
  CONSTRAINT catalog_units_conversion_factor_positive_check
    CHECK (conversion_factor > 0),
  CONSTRAINT catalog_units_base_conversion_check CHECK (
    (base_unit_id IS NULL AND conversion_factor = 1)
    OR base_unit_id IS NOT NULL
  ),
  CONSTRAINT catalog_units_status_check
    CHECK (status IN ('active', 'inactive')),
  CONSTRAINT catalog_units_version_check
    CHECK (version > 0)
);

CREATE INDEX catalog_categories_parent_status_sort_idx
ON public.catalog_categories(parent_id, status, sort_order, id);

CREATE INDEX catalog_brands_status_name_idx
ON public.catalog_brands(status, name, id);

CREATE INDEX catalog_units_status_sort_idx
ON public.catalog_units(status, sort_order, id);

CREATE INDEX catalog_units_base_unit_lookup_idx
ON public.catalog_units(base_unit_id)
WHERE base_unit_id IS NOT NULL;

CREATE FUNCTION public.lock_catalog_category_hierarchy()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  -- Fixed transaction lock serializes all category hierarchy mutations before
  -- PostgreSQL acquires any target-row lock in the following row triggers.
  PERFORM pg_catalog.pg_advisory_xact_lock(6720240723142000::bigint);
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.lock_catalog_category_hierarchy()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.set_catalog_category_level()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  parent_level integer;
BEGIN
  IF TG_OP = 'UPDATE'
    AND NEW.parent_id IS DISTINCT FROM OLD.parent_id THEN
    IF EXISTS (
      WITH RECURSIVE descendants AS (
        SELECT child.id
        FROM public.catalog_categories AS child
        WHERE child.parent_id = OLD.id

        UNION

        SELECT child.id
        FROM public.catalog_categories AS child
        JOIN descendants ON child.parent_id = descendants.id
      )
      SELECT 1
      FROM descendants
    ) THEN
      RAISE EXCEPTION '只能移动叶子目录分类';
    END IF;
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
  ) THEN
    RAISE EXCEPTION '目录分类层级不能形成环';
  END IF;

  SELECT parent.level
  INTO parent_level
  FROM public.catalog_categories AS parent
  WHERE parent.id = NEW.parent_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION '父目录分类不存在';
  END IF;

  NEW.level := parent_level + 1;
  IF NEW.level > 6 THEN
    RAISE EXCEPTION '目录分类层级不能超过 6 级';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.set_catalog_category_level()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.validate_catalog_unit_base()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  parent_base_unit_id uuid;
BEGIN
  IF NEW.base_unit_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.base_unit_id = NEW.id THEN
    RAISE EXCEPTION '目录单位不能将自身设为基准单位';
  END IF;

  IF TG_OP = 'UPDATE'
    AND EXISTS (
      SELECT 1
      FROM public.catalog_units AS derived_unit
      WHERE derived_unit.base_unit_id = OLD.id
        AND derived_unit.id <> NEW.id
    ) THEN
    RAISE EXCEPTION '已有派生单位引用的基准单位不能改为派生单位';
  END IF;

  SELECT base_unit.base_unit_id
  INTO parent_base_unit_id
  FROM public.catalog_units AS base_unit
  WHERE base_unit.id = NEW.base_unit_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION '基准单位不存在';
  END IF;

  IF parent_base_unit_id IS NOT NULL THEN
    RAISE EXCEPTION '派生单位只能引用基准单位';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_catalog_unit_base()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER tr_catalog_categories_lock_hierarchy
BEFORE INSERT OR UPDATE ON public.catalog_categories
FOR EACH STATEMENT
EXECUTE FUNCTION public.lock_catalog_category_hierarchy();

CREATE TRIGGER tr_catalog_categories_set_level
BEFORE INSERT OR UPDATE ON public.catalog_categories
FOR EACH ROW
EXECUTE FUNCTION public.set_catalog_category_level();

CREATE TRIGGER tr_catalog_units_validate_base
BEFORE INSERT OR UPDATE ON public.catalog_units
FOR EACH ROW
EXECUTE FUNCTION public.validate_catalog_unit_base();

CREATE TRIGGER tr_catalog_categories_updated_at
BEFORE UPDATE ON public.catalog_categories
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER tr_catalog_brands_updated_at
BEFORE UPDATE ON public.catalog_brands
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER tr_catalog_units_updated_at
BEFORE UPDATE ON public.catalog_units
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.catalog_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_categories FORCE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_brands FORCE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_units FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.catalog_categories FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.catalog_brands FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.catalog_units FROM PUBLIC, anon, authenticated;

REVOKE ALL ON TABLE public.catalog_categories FROM service_role;
REVOKE ALL ON TABLE public.catalog_brands FROM service_role;
REVOKE ALL ON TABLE public.catalog_units FROM service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.catalog_categories TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.catalog_brands TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.catalog_units TO service_role;

COMMIT;
