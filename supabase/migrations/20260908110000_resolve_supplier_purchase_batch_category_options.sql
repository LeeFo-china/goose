-- Read-only RPC rollback:
-- DROP FUNCTION public.resolve_supplier_purchase_batch_category_options(uuid,timestamptz,text,integer,integer);

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '1min';

CREATE FUNCTION public.resolve_supplier_purchase_batch_category_options(
  p_tenant_id uuid,
  p_priced_at timestamptz,
  p_keyword text DEFAULT NULL,
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 20
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_items jsonb;
  v_total integer;
  v_offset bigint;
  v_keyword_pattern text;
BEGIN
  IF p_tenant_id IS NULL OR p_priced_at IS NULL
    OR p_page IS NULL OR p_page_size IS NULL
    OR p_page < 1 OR p_page_size NOT BETWEEN 1 AND 100
    OR char_length(COALESCE(p_keyword, '')) > 80
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'SUPPLIER_PURCHASE_BATCH_VALIDATION_ERROR';
  END IF;

  v_offset := (p_page::bigint - 1) * p_page_size::bigint;
  v_keyword_pattern := NULLIF(btrim(p_keyword), '');
  IF v_keyword_pattern IS NOT NULL THEN
    v_keyword_pattern := '%' || replace(replace(replace(
      v_keyword_pattern, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  END IF;

  WITH relationships AS MATERIALIZED (
    SELECT
      relationship.tenant_id,
      relationship.id AS tenant_supplier_id,
      relationship.supplier_id,
      relationship.relationship_status,
      supplier.supplier_type,
      supplier.ownership_scope,
      supplier.owner_tenant_id,
      supplier.onboarding_status,
      supplier.operational_status
    FROM public.tenant_suppliers AS relationship
    JOIN public.suppliers AS supplier
      ON supplier.id = relationship.supplier_id
    WHERE relationship.tenant_id = p_tenant_id
  ),
  qualification_status AS MATERIALIZED (
    SELECT
      relationship.tenant_supplier_id,
      qualification_type.id AS qualification_type_id,
      COALESCE(
        bool_or(qualification.verification_status = 'verified'),
        false
      ) AS has_verified,
      COALESCE(bool_or(
        qualification.verification_status = 'verified'
        AND (
          qualification.valid_from IS NULL
          OR qualification.valid_from <= p_priced_at::date
        )
        AND (
          qualification.valid_until IS NULL
          OR qualification.valid_until >= p_priced_at::date
        )
      ), false) AS has_current_valid,
      COALESCE(bool_and(
        qualification.valid_until IS NOT NULL
        AND qualification.valid_until < p_priced_at::date
      ) FILTER (
        WHERE qualification.verification_status = 'verified'
      ), false) AS all_verified_expired
    FROM relationships AS relationship
    JOIN public.supplier_qualification_types AS qualification_type
      ON qualification_type.status = 'active'
      AND qualification_type.blocks_new_orders
      AND (
        relationship.ownership_scope <> 'tenant'
        OR relationship.owner_tenant_id IS DISTINCT FROM relationship.tenant_id
      )
      AND (
        cardinality(qualification_type.applicable_supplier_types) = 0
        OR relationship.supplier_type =
          ANY (qualification_type.applicable_supplier_types)
      )
    LEFT JOIN public.supplier_qualifications AS qualification
      ON qualification.supplier_id = relationship.supplier_id
      AND qualification.qualification_type_id = qualification_type.id
    GROUP BY relationship.tenant_supplier_id, qualification_type.id
  ),
  qualification_rollup AS MATERIALIZED (
    SELECT
      qualification_status.tenant_supplier_id,
      bool_or(
        NOT qualification_status.has_current_valid
        AND NOT (
          qualification_status.has_verified
          AND qualification_status.all_verified_expired
        )
      ) AS has_missing,
      bool_or(
        NOT qualification_status.has_current_valid
        AND qualification_status.has_verified
        AND qualification_status.all_verified_expired
      ) AS has_expired
    FROM qualification_status
    GROUP BY qualification_status.tenant_supplier_id
  ),
  contract_status AS MATERIALIZED (
    SELECT
      relationship.tenant_supplier_id,
      COALESCE(bool_or(
        contract.lifecycle_status = 'active'
        AND contract.valid_from <= p_priced_at::date
        AND contract.valid_until >= p_priced_at::date
      ), false) AS has_active_contract
    FROM relationships AS relationship
    LEFT JOIN public.supplier_contracts AS contract
      ON contract.tenant_id = relationship.tenant_id
      AND contract.tenant_supplier_id = relationship.tenant_supplier_id
    GROUP BY relationship.tenant_supplier_id
  ),
  evaluated AS MATERIALIZED (
    SELECT
      relationship.tenant_supplier_id,
      relationship.supplier_id,
      ARRAY_REMOVE(ARRAY[
        CASE WHEN NOT COALESCE(setting.module_enabled, false)
          THEN 'module_disabled' END,
        CASE WHEN relationship.onboarding_status <> 'approved'
          THEN 'supplier_not_approved' END,
        CASE WHEN relationship.operational_status = 'suspended'
          THEN 'supplier_suspended' END,
        CASE WHEN relationship.operational_status = 'blacklisted'
          THEN 'supplier_blacklisted' END,
        CASE WHEN relationship.relationship_status <> 'active'
          THEN 'relationship_not_active' END,
        CASE WHEN COALESCE(qualification_rollup.has_missing, false)
          THEN 'required_qualification_missing' END,
        CASE WHEN COALESCE(qualification_rollup.has_expired, false)
          THEN 'required_qualification_expired' END,
        CASE WHEN COALESCE(
          setting.require_active_contract_for_new_order,
          false
        ) AND NOT COALESCE(contract_status.has_active_contract, false)
          THEN 'active_contract_required' END
      ], NULL)::text[] AS blocking_reasons
    FROM relationships AS relationship
    LEFT JOIN public.tenant_supplier_settings AS setting
      ON setting.tenant_id = relationship.tenant_id
    LEFT JOIN qualification_rollup
      ON qualification_rollup.tenant_supplier_id =
        relationship.tenant_supplier_id
    LEFT JOIN contract_status
      ON contract_status.tenant_supplier_id = relationship.tenant_supplier_id
  ),
  eligibility AS MATERIALIZED (
    SELECT
      evaluated.tenant_supplier_id,
      evaluated.supplier_id,
      cardinality(evaluated.blocking_reasons) = 0 AS eligible
    FROM evaluated
  ),
  price_candidates AS MATERIALIZED (
    SELECT
      category.id,
      category.code,
      category.name,
      category.full_name,
      category.status,
      relationship.id AS tenant_supplier_id,
      sku.id AS supplier_sku_id,
      COUNT(*) OVER (
        PARTITION BY relationship.id, sku.id
      ) AS candidate_count
    FROM public.supplier_price_list_items AS price_item
    JOIN public.supplier_price_lists AS price_list
      ON price_list.id = price_item.supplier_price_list_id
      AND price_list.tenant_id = p_tenant_id
      AND price_list.supplier_id = price_item.supplier_id
    JOIN public.tenant_suppliers AS relationship
      ON relationship.id = price_list.tenant_supplier_id
      AND relationship.tenant_id = price_list.tenant_id
      AND relationship.supplier_id = price_list.supplier_id
    JOIN eligibility
      ON eligibility.tenant_supplier_id = relationship.id
      AND eligibility.supplier_id = relationship.supplier_id
      AND eligibility.eligible
    JOIN public.suppliers AS supplier
      ON supplier.id = relationship.supplier_id
    JOIN public.supplier_skus AS sku
      ON sku.id = price_item.supplier_sku_id
      AND sku.supplier_id = price_item.supplier_id
    JOIN public.supplier_products AS product
      ON product.id = sku.supplier_product_id
      AND product.supplier_id = sku.supplier_id
      AND product.id = price_item.supplier_product_id
    JOIN public.catalog_categories AS category
      ON category.id = product.category_id
      AND category.status = 'active'
      AND category.is_leaf
    JOIN public.catalog_brands AS brand
      ON brand.id = product.brand_id AND brand.status = 'active'
    JOIN public.catalog_units AS purchase_unit
      ON purchase_unit.id = price_item.purchase_unit_id
      AND purchase_unit.status = 'active'
    JOIN public.catalog_units AS base_unit
      ON base_unit.id = price_item.base_unit_id
      AND base_unit.status = 'active'
    WHERE price_item.tenant_id = p_tenant_id
      AND price_list.lifecycle_status = 'published'
      AND price_list.scope_type = 'default'
      AND price_list.currency = 'CNY'
      AND relationship.default_currency = 'CNY'
      AND price_list.effective_from <= p_priced_at
      AND (
        price_list.effective_until IS NULL
        OR price_list.effective_until > p_priced_at
      )
      AND product.status = 'active'
      AND sku.status = 'active'
      AND (
        (supplier.ownership_scope = 'platform'
          AND supplier.owner_tenant_id IS NULL)
        OR (supplier.ownership_scope = 'tenant'
          AND supplier.owner_tenant_id = p_tenant_id)
      )
      AND product.ownership_scope = sku.ownership_scope
      AND product.owner_tenant_id IS NOT DISTINCT FROM sku.owner_tenant_id
      AND (
        (product.ownership_scope = 'platform'
          AND product.owner_tenant_id IS NULL)
        OR (product.ownership_scope = 'tenant'
          AND product.owner_tenant_id = p_tenant_id)
      )
      AND (
        (category.ownership_scope = 'platform'
          AND category.owner_tenant_id IS NULL)
        OR (category.ownership_scope = 'tenant'
          AND category.owner_tenant_id = p_tenant_id)
      )
      AND (
        (brand.ownership_scope = 'platform'
          AND brand.owner_tenant_id IS NULL)
        OR (brand.ownership_scope = 'tenant'
          AND brand.owner_tenant_id = p_tenant_id)
      )
      AND sku.purchase_unit_id = price_item.purchase_unit_id
      AND sku.base_unit_id = price_item.base_unit_id
      AND sku.base_unit_conversion = price_item.base_unit_conversion
      AND (
        v_keyword_pattern IS NULL
        OR category.code ILIKE v_keyword_pattern ESCAPE '\'
        OR category.name ILIKE v_keyword_pattern ESCAPE '\'
        OR category.full_name ILIKE v_keyword_pattern ESCAPE '\'
      )
  ),
  resolved_categories AS MATERIALIZED (
    SELECT DISTINCT id, code, name, full_name, status
    FROM price_candidates WHERE candidate_count = 1
  ),
  page_rows AS MATERIALIZED (
    SELECT id, code, name, full_name, status
    FROM resolved_categories
    ORDER BY full_name, id
    LIMIT p_page_size OFFSET v_offset
  )
  SELECT
    (SELECT COUNT(*)::integer FROM resolved_categories),
    COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', page.id,
          'code', page.code,
          'name', page.name,
          'full_name', page.full_name,
          'status', page.status
        ) ORDER BY page.full_name, page.id
      )
      FROM page_rows AS page
    ), '[]'::jsonb)
  INTO v_total, v_items;

  RETURN jsonb_build_object(
    'items', v_items,
    'total', v_total,
    'page', p_page,
    'page_size', p_page_size
  );
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_supplier_purchase_batch_category_options(
  uuid, timestamptz, text, integer, integer
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.resolve_supplier_purchase_batch_category_options(
  uuid, timestamptz, text, integer, integer
) TO service_role;

COMMIT;
