-- Rollback: forward-only. Drop list_supplier_product_sku_counts in a follow-up migration.
BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

CREATE FUNCTION public.list_supplier_product_sku_counts(
  p_supplier_id uuid,
  p_product_ids uuid[],
  p_ownership_scope text,
  p_tenant_id uuid DEFAULT NULL
)
RETURNS TABLE (
  supplier_product_id uuid,
  sku_count integer,
  active_sku_count integer
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF p_supplier_id IS NULL THEN
    RAISE EXCEPTION 'SUPPLIER_ID_REQUIRED' USING ERRCODE = '22023';
  END IF;

  IF p_ownership_scope NOT IN ('platform', 'tenant') THEN
    RAISE EXCEPTION 'SUPPLIER_OWNERSHIP_SCOPE_INVALID' USING ERRCODE = '22023';
  END IF;

  IF p_ownership_scope = 'tenant' AND p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'SUPPLIER_TENANT_ID_REQUIRED' USING ERRCODE = '22023';
  END IF;

  IF COALESCE(array_length(p_product_ids, 1), 0) > 100 THEN
    RAISE EXCEPTION 'SUPPLIER_PRODUCT_COUNT_BATCH_TOO_LARGE'
      USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT
    sku.supplier_product_id,
    COUNT(*)::integer AS sku_count,
    COUNT(*) FILTER (WHERE sku.status = 'active')::integer AS active_sku_count
  FROM public.supplier_skus AS sku
  WHERE sku.supplier_id = p_supplier_id
    AND sku.supplier_product_id = ANY(p_product_ids)
    AND (
      (
        sku.ownership_scope = 'platform'
        AND sku.owner_tenant_id IS NULL
      )
      OR (
        p_ownership_scope = 'tenant'
        AND sku.ownership_scope = p_ownership_scope
        AND sku.owner_tenant_id = p_tenant_id
      )
    )
  GROUP BY sku.supplier_product_id;
END;
$$;

REVOKE ALL ON FUNCTION public.list_supplier_product_sku_counts(
  uuid, uuid[], text, uuid
) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.list_supplier_product_sku_counts(
  uuid, uuid[], text, uuid
) TO service_role;

COMMIT;
