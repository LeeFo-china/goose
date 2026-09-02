-- Rollback: forward-only. Remove API consumers and the resolver before dropping
-- the rule table; existing purchase item cost-category snapshots stay unchanged.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

CREATE TABLE public.tenant_catalog_cost_category_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  rule_scope text NOT NULL,
  catalog_category_id uuid NULL
    REFERENCES public.catalog_categories(id) ON DELETE CASCADE,
  supplier_product_id uuid NULL
    REFERENCES public.supplier_products(id) ON DELETE CASCADE,
  cost_category_id uuid NOT NULL,
  version integer NOT NULL DEFAULT 1,
  created_by_employee_id uuid NOT NULL,
  updated_by_employee_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_catalog_cost_category_rules_scope_check
    CHECK (
      (rule_scope = 'category'
        AND catalog_category_id IS NOT NULL
        AND supplier_product_id IS NULL)
      OR
      (rule_scope = 'product'
        AND catalog_category_id IS NULL
        AND supplier_product_id IS NOT NULL)
    ),
  CONSTRAINT tenant_catalog_cost_category_rules_version_check
    CHECK (version > 0),
  CONSTRAINT tenant_catalog_cost_category_rules_cost_category_fkey
    FOREIGN KEY (cost_category_id, tenant_id)
    REFERENCES public.finance_cost_categories(id, tenant_id)
    ON DELETE RESTRICT,
  CONSTRAINT tenant_catalog_cost_category_rules_created_by_fkey
    FOREIGN KEY (created_by_employee_id, tenant_id)
    REFERENCES public.employees(id, tenant_id)
    ON DELETE RESTRICT,
  CONSTRAINT tenant_catalog_cost_category_rules_updated_by_fkey
    FOREIGN KEY (updated_by_employee_id, tenant_id)
    REFERENCES public.employees(id, tenant_id)
    ON DELETE RESTRICT
);

CREATE UNIQUE INDEX tenant_catalog_cost_category_rules_category_uidx
ON public.tenant_catalog_cost_category_rules(tenant_id, catalog_category_id)
WHERE rule_scope = 'category';

CREATE UNIQUE INDEX tenant_catalog_cost_category_rules_product_uidx
ON public.tenant_catalog_cost_category_rules(tenant_id, supplier_product_id)
WHERE rule_scope = 'product';

CREATE INDEX tenant_catalog_cost_category_rules_cost_category_idx
ON public.tenant_catalog_cost_category_rules(tenant_id, cost_category_id);

CREATE FUNCTION public.validate_tenant_catalog_cost_category_rule()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM cost_category.id
  FROM public.finance_cost_categories AS cost_category
  WHERE cost_category.id = NEW.cost_category_id
    AND cost_category.tenant_id = NEW.tenant_id
    AND cost_category.status = 'active';

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_COST_CATEGORY_RULE_INVALID';
  END IF;

  IF NEW.rule_scope = 'category' THEN
    PERFORM category.id
    FROM public.catalog_categories AS category
    WHERE category.id = NEW.catalog_category_id
      AND (
        (category.ownership_scope = 'platform'
          AND category.owner_tenant_id IS NULL)
        OR
        (category.ownership_scope = 'tenant'
          AND category.owner_tenant_id = NEW.tenant_id)
      );
  ELSE
    PERFORM product.id
    FROM public.supplier_products AS product
    WHERE product.id = NEW.supplier_product_id
      AND (
        (product.ownership_scope = 'platform'
          AND product.owner_tenant_id IS NULL)
        OR
        (product.ownership_scope = 'tenant'
          AND product.owner_tenant_id = NEW.tenant_id)
      );
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_COST_CATEGORY_RULE_INVALID';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    NEW.version := OLD.version + 1;
    NEW.updated_at := clock_timestamp();
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER tenant_catalog_cost_category_rules_validate
BEFORE INSERT OR UPDATE
ON public.tenant_catalog_cost_category_rules
FOR EACH ROW
EXECUTE FUNCTION public.validate_tenant_catalog_cost_category_rule();

CREATE FUNCTION public.resolve_tenant_catalog_cost_category(
  p_tenant_id uuid,
  p_supplier_product_id uuid,
  p_catalog_category_id uuid
)
RETURNS TABLE (
  cost_category_id uuid,
  cost_category_code text,
  cost_category_name text,
  source text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  WITH RECURSIVE category_path AS (
    SELECT
      category.id,
      category.parent_id,
      0 AS depth,
      ARRAY[category.id]::uuid[] AS path
    FROM public.catalog_categories AS category
    WHERE category.id = p_catalog_category_id
      AND (
        (category.ownership_scope = 'platform'
          AND category.owner_tenant_id IS NULL)
        OR
        (category.ownership_scope = 'tenant'
          AND category.owner_tenant_id = p_tenant_id)
      )

    UNION ALL

    SELECT
      parent.id,
      parent.parent_id,
      child.depth + 1,
      child.path || parent.id
    FROM category_path AS child
    JOIN public.catalog_categories AS parent ON parent.id = child.parent_id
    WHERE child.depth < 7
      AND NOT parent.id = ANY(child.path)
      AND (
        (parent.ownership_scope = 'platform'
          AND parent.owner_tenant_id IS NULL)
        OR
        (parent.ownership_scope = 'tenant'
          AND parent.owner_tenant_id = p_tenant_id)
      )
  ),
  candidate AS (
    SELECT
      rule.cost_category_id,
      'product'::text AS source,
      0 AS depth
    FROM public.tenant_catalog_cost_category_rules AS rule
    JOIN public.supplier_products AS product
      ON product.id = rule.supplier_product_id
    WHERE rule.tenant_id = p_tenant_id
      AND rule.rule_scope = 'product'
      AND rule.supplier_product_id = p_supplier_product_id
      AND (
        (product.ownership_scope = 'platform'
          AND product.owner_tenant_id IS NULL)
        OR
        (product.ownership_scope = 'tenant'
          AND product.owner_tenant_id = p_tenant_id)
      )

    UNION ALL

    SELECT
      rule.cost_category_id,
      CASE WHEN category_path.depth = 0
        THEN 'category'::text ELSE 'ancestor'::text END AS source,
      category_path.depth
    FROM category_path
    JOIN public.tenant_catalog_cost_category_rules AS rule
      ON rule.catalog_category_id = category_path.id
      AND rule.tenant_id = p_tenant_id
      AND rule.rule_scope = 'category'
  )
  SELECT
    candidate.cost_category_id,
    cost_category.code AS cost_category_code,
    cost_category.name AS cost_category_name,
    candidate.source
  FROM candidate
  JOIN public.finance_cost_categories AS cost_category
    ON cost_category.id = candidate.cost_category_id
    AND cost_category.tenant_id = p_tenant_id
  WHERE cost_category.status = 'active'
  ORDER BY
    CASE candidate.source WHEN 'product' THEN 0 ELSE 1 END,
    candidate.depth ASC
  LIMIT 1;
$$;

ALTER TABLE public.tenant_catalog_cost_category_rules ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.tenant_catalog_cost_category_rules
FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
ON public.tenant_catalog_cost_category_rules TO service_role;

REVOKE ALL ON FUNCTION public.validate_tenant_catalog_cost_category_rule()
FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.resolve_tenant_catalog_cost_category(
  uuid, uuid, uuid
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.resolve_tenant_catalog_cost_category(
  uuid, uuid, uuid
) TO service_role;

COMMENT ON TABLE public.tenant_catalog_cost_category_rules IS
  '租户商品目录到财务成本分类的默认规则及商品例外覆盖';
COMMENT ON FUNCTION public.resolve_tenant_catalog_cost_category(
  uuid, uuid, uuid
) IS '按商品覆盖、当前分类、最近上级分类顺序解析采购成本分类';

COMMIT;
