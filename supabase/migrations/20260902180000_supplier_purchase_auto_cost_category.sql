-- Rollback: forward-only. Remove API calls before dropping this resolver;
-- no existing purchase, budget, payable or ledger rows are changed.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

CREATE FUNCTION public.resolve_tenant_supplier_sku_cost_categories(
  p_tenant_id uuid,
  p_supplier_sku_ids uuid[]
)
RETURNS TABLE (
  supplier_sku_id uuid,
  cost_category_id uuid,
  cost_category_name text,
  source text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF p_tenant_id IS NULL
    OR COALESCE(cardinality(p_supplier_sku_ids), 0) NOT BETWEEN 1 AND 100
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'SUPPLIER_COST_CATEGORY_RESOLUTION_INVALID';
  END IF;

  RETURN QUERY
  SELECT DISTINCT ON (sku.id)
    sku.id AS supplier_sku_id,
    resolved.cost_category_id,
    resolved.cost_category_name,
    resolved.source
  FROM public.supplier_skus AS sku
  JOIN public.supplier_products AS product
    ON product.id = sku.supplier_product_id
    AND product.supplier_id = sku.supplier_id
  CROSS JOIN LATERAL public.resolve_tenant_catalog_cost_category(
    p_tenant_id,
    product.id,
    product.category_id
  ) AS resolved
  WHERE sku.id = ANY(p_supplier_sku_ids)
    AND product.status = 'active'
    AND sku.status = 'active'
    AND product.ownership_scope = sku.ownership_scope
    AND product.owner_tenant_id IS NOT DISTINCT FROM sku.owner_tenant_id
    AND (
      (product.ownership_scope = 'platform'
        AND product.owner_tenant_id IS NULL)
      OR
      (product.ownership_scope = 'tenant'
        AND product.owner_tenant_id = p_tenant_id)
    )
  ORDER BY sku.id;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_tenant_supplier_sku_cost_categories(
  uuid, uuid[]
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.resolve_tenant_supplier_sku_cost_categories(
  uuid, uuid[]
) TO service_role;

COMMENT ON FUNCTION public.resolve_tenant_supplier_sku_cost_categories(
  uuid, uuid[]
) IS '批量解析采购 SKU 的租户成本分类，最多 100 个 SKU';

COMMIT;
