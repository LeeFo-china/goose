-- Rollback: revoke the five RPCs before hiding API/UI entry points. Preserve
-- batch, item, child requisition, commitment, and command-event audit facts.
-- The preceding concurrent-index preflight is deliberately non-transactional;
-- this command migration is transactional and may be retried as a unit.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

CREATE FUNCTION public.supplier_purchase_batch_to_jsonb(
  p_batch public.supplier_purchase_batches
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT pg_catalog.to_jsonb(p_batch) || pg_catalog.jsonb_build_object(
    'subtotal_amount', p_batch.subtotal_amount::text,
    'tax_amount', p_batch.tax_amount::text,
    'total_amount', p_batch.total_amount::text
  );
$$;

REVOKE ALL ON FUNCTION public.supplier_purchase_batch_to_jsonb(
  public.supplier_purchase_batches
) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.record_supplier_purchase_batch_command_result(
  p_tenant_id uuid,
  p_batch_id uuid,
  p_command_type text,
  p_idempotency_key text,
  p_request_fingerprint text,
  p_request jsonb,
  p_actor_user_id uuid,
  p_actor_employee_id uuid,
  p_result jsonb,
  p_result_version integer
)
RETURNS jsonb
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  INSERT INTO public.supplier_purchase_batch_command_events(
    tenant_id, purchase_batch_id, command_type, idempotency_key,
    request_fingerprint, request, actor_user_id, actor_employee_id,
    result, result_version
  ) VALUES (
    p_tenant_id, p_batch_id, p_command_type, p_idempotency_key,
    p_request_fingerprint, p_request, p_actor_user_id, p_actor_employee_id,
    p_result || pg_catalog.jsonb_build_object('idempotent', false),
    p_result_version
  )
  RETURNING result;
$$;

REVOKE ALL ON FUNCTION public.record_supplier_purchase_batch_command_result(
  uuid, uuid, text, text, text, jsonb, uuid, uuid, jsonb, integer
) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.resolve_supplier_purchase_batch_catalog(
  p_tenant_id uuid,
  p_project_id uuid,
  p_keyword text DEFAULT NULL,
  p_category_id uuid DEFAULT NULL,
  p_brand_id uuid DEFAULT NULL,
  p_tenant_supplier_id uuid DEFAULT NULL,
  p_priced_at timestamptz DEFAULT clock_timestamp(),
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 20
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_items jsonb;
  v_total integer;
  v_offset bigint;
  v_keyword_pattern text;
BEGIN
  IF p_tenant_id IS NULL OR p_project_id IS NULL OR p_priced_at IS NULL
    OR p_page IS NULL OR p_page_size IS NULL
    OR p_page < 1 OR p_page_size NOT BETWEEN 1 AND 100
    OR char_length(COALESCE(p_keyword, '')) > 100
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

  PERFORM project.id
  FROM public.projects AS project
  WHERE project.id = p_project_id AND project.tenant_id = p_tenant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_PURCHASE_BATCH_PROJECT_INVALID';
  END IF;

  WITH eligibility AS MATERIALIZED (
    SELECT eligible.*
    FROM public.get_tenant_supplier_order_eligibility_set(
      p_tenant_id, p_priced_at, p_tenant_supplier_id
    ) AS eligible
    WHERE eligible.eligible
  ),
  price_candidates AS MATERIALIZED (
    SELECT
      product.id AS supplier_product_id,
      product.product_code,
      product.name AS product_name,
      sku.id AS supplier_sku_id,
      sku.sku_code,
      sku.name AS sku_name,
      sku.specification,
      sku.model,
      product.category_id,
      category.name AS category_name,
      product.brand_id,
      brand.name AS brand_name,
      relationship.id AS tenant_supplier_id,
      relationship.supplier_id,
      supplier.name AS supplier_name,
      price_list.id AS supplier_price_list_id,
      price_item.id AS supplier_price_list_item_id,
      price_list.price_list_code,
      price_list.version_number AS price_list_version,
      price_list.effective_from,
      price_list.effective_until,
      price_item.purchase_unit_id,
      purchase_unit.code AS purchase_unit_code,
      purchase_unit.name AS purchase_unit_name,
      purchase_unit.symbol AS purchase_unit_symbol,
      price_item.base_unit_id,
      base_unit.code AS base_unit_code,
      base_unit.name AS base_unit_name,
      base_unit.symbol AS base_unit_symbol,
      price_item.base_unit_conversion::text AS base_unit_conversion,
      price_item.unit_price::text AS unit_price,
      price_item.tax_rate::text AS tax_rate,
      price_item.tax_inclusive,
      price_list.currency::text AS currency,
      'purchasable'::text AS purchasable_status,
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
    JOIN public.suppliers AS supplier ON supplier.id = relationship.supplier_id
    JOIN public.supplier_skus AS sku
      ON sku.id = price_item.supplier_sku_id
      AND sku.supplier_id = price_item.supplier_id
    JOIN public.supplier_products AS product
      ON product.id = sku.supplier_product_id
      AND product.supplier_id = sku.supplier_id
      AND product.id = price_item.supplier_product_id
    JOIN public.catalog_categories AS category
      ON category.id = product.category_id AND category.status = 'active'
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
      AND (price_list.effective_until IS NULL
        OR price_list.effective_until > p_priced_at)
      AND product.status = 'active' AND sku.status = 'active'
      AND (
        (supplier.ownership_scope = 'platform' AND supplier.owner_tenant_id IS NULL)
        OR (supplier.ownership_scope = 'tenant' AND supplier.owner_tenant_id = p_tenant_id)
      )
      AND product.ownership_scope = sku.ownership_scope
      AND product.owner_tenant_id IS NOT DISTINCT FROM sku.owner_tenant_id
      AND ((product.ownership_scope = 'platform' AND product.owner_tenant_id IS NULL)
        OR (product.ownership_scope = 'tenant' AND product.owner_tenant_id = p_tenant_id))
      AND ((category.ownership_scope = 'platform' AND category.owner_tenant_id IS NULL)
        OR (category.ownership_scope = 'tenant' AND category.owner_tenant_id = p_tenant_id))
      AND ((brand.ownership_scope = 'platform' AND brand.owner_tenant_id IS NULL)
        OR (brand.ownership_scope = 'tenant' AND brand.owner_tenant_id = p_tenant_id))
      AND sku.purchase_unit_id = price_item.purchase_unit_id
      AND sku.base_unit_id = price_item.base_unit_id
      AND sku.base_unit_conversion = price_item.base_unit_conversion
      AND (p_category_id IS NULL OR product.category_id = p_category_id)
      AND (p_brand_id IS NULL OR product.brand_id = p_brand_id)
      AND (v_keyword_pattern IS NULL
        OR product.product_code ILIKE v_keyword_pattern ESCAPE '\'
        OR product.name ILIKE v_keyword_pattern ESCAPE '\'
        OR sku.sku_code ILIKE v_keyword_pattern ESCAPE '\'
        OR sku.name ILIKE v_keyword_pattern ESCAPE '\')
  ),
  resolved AS MATERIALIZED (
    SELECT * FROM price_candidates WHERE candidate_count = 1
  ),
  page_rows AS MATERIALIZED (
    SELECT * FROM resolved
    ORDER BY product_name, sku_name, supplier_name, supplier_sku_id
    LIMIT p_page_size OFFSET v_offset
  )
  SELECT
    (SELECT COUNT(*)::integer FROM resolved),
    COALESCE((SELECT jsonb_agg(to_jsonb(page_rows) - 'candidate_count'
      ORDER BY product_name, sku_name, supplier_name, supplier_sku_id)
      FROM page_rows), '[]'::jsonb)
  INTO v_total, v_items;

  RETURN jsonb_build_object(
    'items', v_items, 'total', v_total,
    'page', p_page, 'page_size', p_page_size
  );
END;
$$;

CREATE FUNCTION public.submit_supplier_purchase_batch(
  p_batch_id uuid,
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
  v_batch public.supplier_purchase_batches%ROWTYPE;
  v_event public.supplier_purchase_batch_command_events%ROWTYPE;
  v_request jsonb;
  v_fingerprint text;
  v_result jsonb;
  v_checked_at timestamptz := clock_timestamp();
  v_changed_count integer;
  v_item_count integer;
  v_current_price_count integer;
  v_locked_relationship_count integer;
  v_category_count integer;
  v_locked_category_count integer;
  v_budget_status text;
  v_budget_snapshot jsonb;
  v_next_generation integer;
  v_requisition_ids jsonb;
  v_price_change_details jsonb;
  v_supplier_id uuid;
BEGIN
  IF p_batch_id IS NULL OR p_tenant_id IS NULL
    OR p_expected_version IS NULL OR p_expected_version <= 0
    OR p_actor_user_id IS NULL OR p_actor_employee_id IS NULL
    OR p_idempotency_key IS NULL OR btrim(p_idempotency_key) = ''
    OR p_idempotency_key <> btrim(p_idempotency_key)
    OR char_length(p_idempotency_key) > 120
  THEN
    RETURN jsonb_build_object('status', 'validation_error',
      'idempotent', false,
      'error_code', 'SUPPLIER_PURCHASE_BATCH_VALIDATION_ERROR',
      'version', 0);
  END IF;
  PERFORM public.assert_supplier_purchase_order_actor(
    p_tenant_id, p_actor_user_id, p_actor_employee_id
  );
  v_request := jsonb_build_object(
    'tenant_id', p_tenant_id, 'batch_id', p_batch_id,
    'expected_version', p_expected_version,
    'actor_user_id', p_actor_user_id,
    'actor_employee_id', p_actor_employee_id
  );
  v_fingerprint := encode(extensions.digest(
    convert_to(v_request::text, 'UTF8'), 'sha256'
  ), 'hex');
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'supplier-purchase-batch-command:' || p_tenant_id::text || ':' ||
      p_batch_id::text || ':submit:' || p_idempotency_key,
    6720240826142000
  ));
  SELECT event.* INTO v_event
  FROM public.supplier_purchase_batch_command_events AS event
  WHERE event.tenant_id = p_tenant_id
    AND event.purchase_batch_id = p_batch_id
    AND event.command_type = 'submit'
    AND event.idempotency_key = p_idempotency_key
  FOR UPDATE;
  IF FOUND THEN
    IF v_event.request_fingerprint IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001',
        MESSAGE = 'SUPPLIER_IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN v_event.result || jsonb_build_object('idempotent', true);
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'supplier-purchase-batch-id:' || p_batch_id::text, 6720240826142000
  ));
  SELECT batch.* INTO v_batch
  FROM public.supplier_purchase_batches AS batch
  WHERE batch.id = p_batch_id AND batch.tenant_id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN public.record_supplier_purchase_batch_command_result(
      p_tenant_id, p_batch_id, 'submit', p_idempotency_key, v_fingerprint,
      v_request, p_actor_user_id, p_actor_employee_id,
      jsonb_build_object('status', 'not_found',
        'error_code', 'SUPPLIER_PURCHASE_BATCH_NOT_FOUND', 'version', 0), 0
    );
  END IF;
  IF v_batch.status <> 'draft' THEN
    RETURN public.record_supplier_purchase_batch_command_result(
      p_tenant_id, p_batch_id, 'submit', p_idempotency_key, v_fingerprint,
      v_request, p_actor_user_id, p_actor_employee_id,
      jsonb_build_object('status', 'state_conflict',
        'error_code', 'SUPPLIER_PURCHASE_BATCH_STATE_CONFLICT',
        'version', v_batch.version), v_batch.version
    );
  END IF;
  IF v_batch.version <> p_expected_version THEN
    RETURN public.record_supplier_purchase_batch_command_result(
      p_tenant_id, p_batch_id, 'submit', p_idempotency_key, v_fingerprint,
      v_request, p_actor_user_id, p_actor_employee_id,
      jsonb_build_object('status', 'version_conflict',
        'error_code', 'SUPPLIER_PURCHASE_BATCH_VERSION_CONFLICT',
        'version', v_batch.version), v_batch.version
    );
  END IF;
  PERFORM project.id FROM public.projects AS project
  WHERE project.id = v_batch.project_id AND project.tenant_id = p_tenant_id
  FOR SHARE;
  IF NOT FOUND THEN
    RETURN public.record_supplier_purchase_batch_command_result(
      p_tenant_id, p_batch_id, 'submit', p_idempotency_key, v_fingerprint,
      v_request, p_actor_user_id, p_actor_employee_id,
      jsonb_build_object('status', 'project_invalid',
        'error_code', 'SUPPLIER_PURCHASE_BATCH_PROJECT_INVALID',
        'version', v_batch.version),
      v_batch.version
    );
  END IF;

  WITH selected AS MATERIALIZED (
    SELECT DISTINCT item.tenant_supplier_id, item.supplier_id
    FROM public.supplier_purchase_batch_items AS item
    WHERE item.tenant_id = p_tenant_id AND item.purchase_batch_id = p_batch_id
  ), locked_relationships AS MATERIALIZED (
    SELECT relationship.id
    FROM public.tenant_suppliers AS relationship
    JOIN selected ON selected.tenant_supplier_id = relationship.id
      AND selected.supplier_id = relationship.supplier_id
    WHERE relationship.tenant_id = p_tenant_id
      AND relationship.default_currency = 'CNY'
    ORDER BY relationship.id
    FOR UPDATE OF relationship
  )
  SELECT COUNT(*)::integer INTO v_locked_relationship_count
  FROM locked_relationships;
  IF v_locked_relationship_count <> v_batch.supplier_count THEN
    RETURN public.record_supplier_purchase_batch_command_result(
      p_tenant_id, p_batch_id, 'submit', p_idempotency_key, v_fingerprint,
      v_request, p_actor_user_id, p_actor_employee_id,
      jsonb_build_object('status', 'supplier_not_eligible',
        'error_code', 'SUPPLIER_PURCHASE_BATCH_SUPPLIER_INELIGIBLE',
        'version', v_batch.version), v_batch.version
    );
  END IF;

  IF EXISTS (
    SELECT 1 FROM (
      SELECT DISTINCT item.tenant_supplier_id, item.supplier_id
      FROM public.supplier_purchase_batch_items AS item
      WHERE item.tenant_id = p_tenant_id
        AND item.purchase_batch_id = p_batch_id
    ) AS selected
    LEFT JOIN public.get_tenant_supplier_order_eligibility_set(
      p_tenant_id, v_checked_at, NULL
    ) AS eligibility ON eligibility.tenant_supplier_id = selected.tenant_supplier_id
      AND eligibility.supplier_id = selected.supplier_id
    WHERE eligibility.tenant_supplier_id IS NULL OR NOT eligibility.eligible
  ) THEN
    RETURN public.record_supplier_purchase_batch_command_result(
      p_tenant_id, p_batch_id, 'submit', p_idempotency_key, v_fingerprint,
      v_request, p_actor_user_id, p_actor_employee_id,
      jsonb_build_object('status', 'supplier_not_eligible',
        'error_code', 'SUPPLIER_PURCHASE_BATCH_SUPPLIER_INELIGIBLE',
        'version', v_batch.version),
      v_batch.version
    );
  END IF;

  FOR v_supplier_id IN
    SELECT DISTINCT item.supplier_id
    FROM public.supplier_purchase_batch_items AS item
    WHERE item.tenant_id = p_tenant_id AND item.purchase_batch_id = p_batch_id
    ORDER BY item.supplier_id
  LOOP
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
      'supplier-price-publish:' || p_tenant_id::text || ':' ||
        v_supplier_id::text,
      6720240729160000
    ));
  END LOOP;

  WITH frozen AS MATERIALIZED (
    SELECT item.* FROM public.supplier_purchase_batch_items AS item
    WHERE item.tenant_id = p_tenant_id AND item.purchase_batch_id = p_batch_id
  ),
  locked_current_candidates AS MATERIALIZED (
    SELECT frozen.id AS frozen_id, price_item.id AS supplier_price_list_item_id,
      price_item.supplier_price_list_id, price_item.supplier_product_id,
      price_item.supplier_sku_id, price_item.purchase_unit_id,
      price_item.base_unit_id, price_item.base_unit_conversion,
      price_item.unit_price, price_item.tax_rate, price_item.tax_inclusive,
      price_list.price_list_code, price_list.version_number,
      price_list.effective_from, price_list.effective_until,
      product.product_code, product.name AS product_name,
      product.category_id, category.name AS category_name,
      product.brand_id, brand.name AS brand_name,
      sku.sku_code, sku.name AS sku_name, sku.specification, sku.model,
      purchase_unit.code AS purchase_unit_code,
      purchase_unit.name AS purchase_unit_name,
      purchase_unit.symbol AS purchase_unit_symbol,
      base_unit.code AS base_unit_code, base_unit.name AS base_unit_name,
      base_unit.symbol AS base_unit_symbol, supplier.name AS supplier_name,
      frozen.tenant_supplier_id,
      frozen.supplier_sku_id AS frozen_supplier_sku_id,
      CASE WHEN price_item.tax_inclusive THEN round(round(frozen.quantity * price_item.unit_price, 2) / (1 + price_item.tax_rate), 2)
        ELSE round(frozen.quantity * price_item.unit_price, 2) END AS line_subtotal_amount,
      CASE WHEN price_item.tax_inclusive THEN round(frozen.quantity * price_item.unit_price, 2) - round(round(frozen.quantity * price_item.unit_price, 2) / (1 + price_item.tax_rate), 2)
        ELSE round(round(frozen.quantity * price_item.unit_price, 2) * price_item.tax_rate, 2) END AS line_tax_amount,
      CASE WHEN price_item.tax_inclusive THEN round(frozen.quantity * price_item.unit_price, 2)
        ELSE round(frozen.quantity * price_item.unit_price, 2) + round(round(frozen.quantity * price_item.unit_price, 2) * price_item.tax_rate, 2) END AS line_total_amount
    FROM frozen
    JOIN public.supplier_price_list_items AS price_item
      ON price_item.supplier_sku_id = frozen.supplier_sku_id
      AND price_item.supplier_id = frozen.supplier_id
    JOIN public.supplier_price_lists AS price_list
      ON price_list.id = price_item.supplier_price_list_id
      AND price_list.tenant_id = p_tenant_id
      AND price_list.tenant_supplier_id = frozen.tenant_supplier_id
      AND price_list.supplier_id = frozen.supplier_id
    JOIN public.tenant_suppliers AS relationship
      ON relationship.id = frozen.tenant_supplier_id
      AND relationship.tenant_id = p_tenant_id
      AND relationship.supplier_id = frozen.supplier_id
      AND relationship.default_currency = 'CNY'
    JOIN public.supplier_skus AS sku ON sku.id = price_item.supplier_sku_id
      AND sku.supplier_id = price_item.supplier_id AND sku.status = 'active'
    JOIN public.supplier_products AS product ON product.id = sku.supplier_product_id
      AND product.supplier_id = sku.supplier_id
      AND product.id = price_item.supplier_product_id
      AND product.status = 'active'
    JOIN public.catalog_categories AS category ON category.id = product.category_id
      AND category.status = 'active'
    JOIN public.catalog_brands AS brand ON brand.id = product.brand_id
      AND brand.status = 'active'
    JOIN public.catalog_units AS purchase_unit ON purchase_unit.id = price_item.purchase_unit_id
      AND purchase_unit.status = 'active'
    JOIN public.catalog_units AS base_unit ON base_unit.id = price_item.base_unit_id
      AND base_unit.status = 'active'
    JOIN public.suppliers AS supplier ON supplier.id = frozen.supplier_id
    WHERE price_item.tenant_id = p_tenant_id
      AND price_list.lifecycle_status = 'published'
      AND price_list.scope_type = 'default' AND price_list.currency = 'CNY'
      AND price_list.effective_from <= v_checked_at
      AND (price_list.effective_until IS NULL OR price_list.effective_until > v_checked_at)
      AND ((supplier.ownership_scope = 'platform' AND supplier.owner_tenant_id IS NULL)
        OR (supplier.ownership_scope = 'tenant' AND supplier.owner_tenant_id = p_tenant_id))
      AND product.ownership_scope = sku.ownership_scope
      AND product.owner_tenant_id IS NOT DISTINCT FROM sku.owner_tenant_id
      AND ((product.ownership_scope = 'platform' AND product.owner_tenant_id IS NULL)
        OR (product.ownership_scope = 'tenant' AND product.owner_tenant_id = p_tenant_id))
      AND ((category.ownership_scope = 'platform' AND category.owner_tenant_id IS NULL)
        OR (category.ownership_scope = 'tenant' AND category.owner_tenant_id = p_tenant_id))
      AND ((brand.ownership_scope = 'platform' AND brand.owner_tenant_id IS NULL)
        OR (brand.ownership_scope = 'tenant' AND brand.owner_tenant_id = p_tenant_id))
      AND sku.purchase_unit_id = price_item.purchase_unit_id
      AND sku.base_unit_id = price_item.base_unit_id
      AND sku.base_unit_conversion = price_item.base_unit_conversion
    ORDER BY frozen.id, price_item.id
    FOR SHARE OF price_item, price_list, relationship, sku, product, category,
      brand, purchase_unit, base_unit, supplier
  ),
  current_candidates AS MATERIALIZED (
    SELECT locked.*,
      COUNT(*) OVER (
        PARTITION BY locked.tenant_supplier_id, locked.frozen_supplier_sku_id
      ) AS candidate_count
    FROM locked_current_candidates AS locked
  ),
  current_prices AS MATERIALIZED (
    SELECT * FROM current_candidates WHERE candidate_count = 1
  ),
  comparisons AS MATERIALIZED (
    SELECT frozen.*, current.frozen_id AS current_frozen_id,
      current.unit_price AS current_unit_price,
      current.version_number AS current_price_version,
      (current.frozen_id IS NULL
        OR current.supplier_price_list_item_id IS DISTINCT FROM frozen.supplier_price_list_item_id
        OR current.supplier_price_list_id IS DISTINCT FROM frozen.supplier_price_list_id
        OR current.supplier_product_id IS DISTINCT FROM frozen.supplier_product_id
        OR current.unit_price IS DISTINCT FROM frozen.unit_price
        OR current.tax_rate IS DISTINCT FROM frozen.tax_rate
        OR current.tax_inclusive IS DISTINCT FROM frozen.tax_inclusive
        OR current.purchase_unit_id IS DISTINCT FROM frozen.purchase_unit_id
        OR current.base_unit_id IS DISTINCT FROM frozen.base_unit_id
        OR current.base_unit_conversion IS DISTINCT FROM frozen.base_unit_conversion
        OR current.price_list_code IS DISTINCT FROM frozen.price_list_code_snapshot
        OR current.version_number IS DISTINCT FROM frozen.price_list_version_snapshot
        OR current.effective_from IS DISTINCT FROM frozen.price_effective_from_snapshot
        OR current.effective_until IS DISTINCT FROM frozen.price_effective_until_snapshot
        OR current.product_code IS DISTINCT FROM frozen.product_code_snapshot
        OR current.product_name IS DISTINCT FROM frozen.product_name_snapshot
        OR current.category_id IS DISTINCT FROM frozen.catalog_category_id
        OR current.category_name IS DISTINCT FROM frozen.category_name_snapshot
        OR current.brand_id IS DISTINCT FROM frozen.brand_id
        OR current.brand_name IS DISTINCT FROM frozen.brand_name_snapshot
        OR current.sku_code IS DISTINCT FROM frozen.sku_code_snapshot
        OR current.sku_name IS DISTINCT FROM frozen.sku_name_snapshot
        OR current.specification IS DISTINCT FROM frozen.specification_snapshot
        OR current.model IS DISTINCT FROM frozen.model_snapshot
        OR current.purchase_unit_code IS DISTINCT FROM frozen.purchase_unit_code_snapshot
        OR current.purchase_unit_name IS DISTINCT FROM frozen.purchase_unit_name_snapshot
        OR current.purchase_unit_symbol IS DISTINCT FROM frozen.purchase_unit_symbol_snapshot
        OR current.base_unit_code IS DISTINCT FROM frozen.base_unit_code_snapshot
        OR current.base_unit_name IS DISTINCT FROM frozen.base_unit_name_snapshot
        OR current.base_unit_symbol IS DISTINCT FROM frozen.base_unit_symbol_snapshot
        OR current.supplier_name IS DISTINCT FROM frozen.supplier_name_snapshot
        OR current.line_subtotal_amount IS DISTINCT FROM frozen.line_subtotal_amount
        OR current.line_tax_amount IS DISTINCT FROM frozen.line_tax_amount
        OR current.line_total_amount IS DISTINCT FROM frozen.line_total_amount
      ) AS changed
    FROM frozen
    LEFT JOIN current_prices AS current ON current.frozen_id = frozen.id
  )
  SELECT COUNT(*)::integer,
    COUNT(current_frozen_id)::integer,
    COUNT(*) FILTER (WHERE changed)::integer,
    COALESCE(jsonb_agg(jsonb_build_object(
      'kind', 'price',
      'supplier_sku_id', supplier_sku_id,
      'product_name', product_name_snapshot,
      'sku_name', sku_name_snapshot,
      'frozen_unit_price', unit_price::text,
      'current_unit_price', current_unit_price::text,
      'frozen_price_version', price_list_version_snapshot,
      'current_price_version', current_price_version
    ) ORDER BY line_no) FILTER (WHERE changed), '[]'::jsonb)
  INTO v_item_count, v_current_price_count, v_changed_count,
    v_price_change_details
  FROM comparisons;
  IF v_item_count = 0 OR v_item_count <> v_batch.item_count THEN
    RETURN public.record_supplier_purchase_batch_command_result(
      p_tenant_id, p_batch_id, 'submit', p_idempotency_key, v_fingerprint,
      v_request, p_actor_user_id, p_actor_employee_id,
      jsonb_build_object('status', 'state_conflict',
        'error_code', 'SUPPLIER_PURCHASE_BATCH_STATE_CONFLICT',
        'version', v_batch.version), v_batch.version
    );
  END IF;
  IF v_current_price_count <> v_batch.item_count OR v_changed_count > 0 THEN
    RETURN public.record_supplier_purchase_batch_command_result(
      p_tenant_id, p_batch_id, 'submit', p_idempotency_key, v_fingerprint,
      v_request, p_actor_user_id, p_actor_employee_id,
      jsonb_build_object('status', 'price_changed',
        'error_code', 'SUPPLIER_PURCHASE_BATCH_PRICE_CHANGED',
        'version', v_batch.version,
        'details', v_price_change_details), v_batch.version
    );
  END IF;

  PERFORM public.lock_project_cost_budget_scope(p_tenant_id, v_batch.project_id);
  WITH requested_by_category AS MATERIALIZED (
    SELECT batch_item.cost_category_id, SUM(batch_item.line_total_amount) AS amount
    FROM public.supplier_purchase_batch_items AS batch_item
    WHERE batch_item.tenant_id = p_tenant_id
      AND batch_item.purchase_batch_id = p_batch_id
    GROUP BY batch_item.cost_category_id
  ) SELECT COUNT(*)::integer INTO v_category_count FROM requested_by_category;

  WITH requested_by_category AS MATERIALIZED (
    SELECT DISTINCT batch_item.cost_category_id
    FROM public.supplier_purchase_batch_items AS batch_item
    WHERE batch_item.tenant_id = p_tenant_id
      AND batch_item.purchase_batch_id = p_batch_id
  ), locked_categories AS MATERIALIZED (
    SELECT finance_category.id FROM public.finance_cost_categories AS finance_category
    JOIN requested_by_category AS requested
      ON requested.cost_category_id = finance_category.id
    WHERE finance_category.tenant_id = p_tenant_id
      AND finance_category.status = 'active'
    ORDER BY finance_category.id FOR UPDATE OF finance_category
  ) SELECT COUNT(*)::integer INTO v_locked_category_count FROM locked_categories;
  IF v_locked_category_count <> v_category_count THEN
    RETURN public.record_supplier_purchase_batch_command_result(
      p_tenant_id, p_batch_id, 'submit', p_idempotency_key, v_fingerprint,
      v_request, p_actor_user_id, p_actor_employee_id,
      jsonb_build_object('status', 'state_conflict',
        'error_code', 'SUPPLIER_PURCHASE_BATCH_BUDGET_CHANGED',
        'version', v_batch.version), v_batch.version
    );
  END IF;

  PERFORM budget.id FROM public.project_cost_budgets AS budget
  WHERE budget.tenant_id = p_tenant_id AND budget.project_id = v_batch.project_id
    AND budget.status = 'active' AND budget.cost_category_id IN (
      SELECT item.cost_category_id FROM public.supplier_purchase_batch_items AS item
      WHERE item.tenant_id = p_tenant_id AND item.purchase_batch_id = p_batch_id)
  ORDER BY budget.cost_category_id, budget.id FOR UPDATE;
  PERFORM commitment.id FROM public.project_cost_commitments AS commitment
  WHERE commitment.tenant_id = p_tenant_id AND commitment.project_id = v_batch.project_id
    AND commitment.status IN ('reserved', 'converted', 'consumed')
    AND commitment.cost_category_id IN (
      SELECT item.cost_category_id FROM public.supplier_purchase_batch_items AS item
      WHERE item.tenant_id = p_tenant_id AND item.purchase_batch_id = p_batch_id)
  ORDER BY commitment.cost_category_id, commitment.id FOR UPDATE;

  WITH requested_by_category AS MATERIALIZED (
    SELECT batch_item.cost_category_id,
      SUM(batch_item.line_total_amount)::numeric(18,2) AS amount
    FROM public.supplier_purchase_batch_items AS batch_item
    WHERE batch_item.tenant_id = p_tenant_id
      AND batch_item.purchase_batch_id = p_batch_id
    GROUP BY batch_item.cost_category_id
  ), budget_totals AS MATERIALIZED (
    SELECT requested.cost_category_id,
      COALESCE(MAX(budget.budget_amount), 0)::numeric(18,2) AS budget_amount
    FROM requested_by_category AS requested
    LEFT JOIN public.project_cost_budgets AS budget
      ON budget.tenant_id = p_tenant_id AND budget.project_id = v_batch.project_id
      AND budget.cost_category_id = requested.cost_category_id
      AND budget.status = 'active'
    GROUP BY requested.cost_category_id
  ), expense_rows AS MATERIALIZED (
    SELECT cost_event.cost_category_id, cost_event.amount
    FROM public.project_cost_events AS cost_event
    WHERE cost_event.tenant_id = p_tenant_id
      AND cost_event.project_id = v_batch.project_id
  ), expense_totals AS MATERIALIZED (
    SELECT requested.cost_category_id,
      COALESCE(SUM(expense.amount), 0)::numeric(18,2) AS expense_amount
    FROM requested_by_category AS requested LEFT JOIN expense_rows AS expense
      ON expense.cost_category_id = requested.cost_category_id
    GROUP BY requested.cost_category_id
  ), current_generation_children AS MATERIALIZED (
    SELECT requisition.id FROM public.supplier_purchase_requisitions AS requisition
    WHERE requisition.tenant_id = p_tenant_id
      AND requisition.purchase_batch_id = p_batch_id
      AND requisition.split_generation = v_batch.split_generation
  ), other_commitment_totals AS MATERIALIZED (
    SELECT requested.cost_category_id,
      COALESCE(SUM(greatest(commitment.amount - commitment.recognized_amount, 0)), 0)::numeric(18,2)
        AS other_commitment_amount
    FROM requested_by_category AS requested
    LEFT JOIN public.project_cost_commitments AS commitment
      ON commitment.tenant_id = p_tenant_id
      AND commitment.project_id = v_batch.project_id
      AND commitment.cost_category_id = requested.cost_category_id
      AND commitment.status IN ('reserved', 'converted')
      AND commitment.source_id NOT IN (SELECT id FROM current_generation_children)
    GROUP BY requested.cost_category_id
  ), snapshots AS MATERIALIZED (
    SELECT requested.cost_category_id, requested.amount,
      budget.budget_amount, expense.expense_amount,
      other.other_commitment_amount,
      (budget.budget_amount - expense.expense_amount - other.other_commitment_amount)::numeric(18,2)
        AS available_amount
    FROM requested_by_category AS requested
    JOIN budget_totals AS budget USING (cost_category_id)
    JOIN expense_totals AS expense USING (cost_category_id)
    JOIN other_commitment_totals AS other USING (cost_category_id)
  ) SELECT CASE WHEN bool_and(amount <= available_amount)
      THEN 'within_budget' ELSE 'over_budget' END,
    jsonb_object_agg(cost_category_id::text, jsonb_build_object(
      'requested_amount', amount::text,
      'budget_amount', budget_amount::text,
      'expense_amount', expense_amount::text,
      'other_commitment_amount', other_commitment_amount::text,
      'available_amount', available_amount::text
    ) ORDER BY cost_category_id)
  INTO v_budget_status, v_budget_snapshot FROM snapshots;

  IF EXISTS (
    SELECT 1 FROM public.project_cost_commitments AS commitment
    JOIN public.supplier_purchase_requisitions AS requisition
      ON requisition.id = commitment.source_id AND requisition.tenant_id = commitment.tenant_id
    WHERE requisition.tenant_id = p_tenant_id
      AND requisition.purchase_batch_id = p_batch_id
      AND requisition.split_generation = v_batch.split_generation
      AND commitment.status IN ('converted', 'consumed')
  ) THEN
    RETURN public.record_supplier_purchase_batch_command_result(
      p_tenant_id, p_batch_id, 'submit', p_idempotency_key, v_fingerprint,
      v_request, p_actor_user_id, p_actor_employee_id,
      jsonb_build_object('status', 'state_conflict',
        'error_code', 'SUPPLIER_PURCHASE_BATCH_STATE_CONFLICT',
        'version', v_batch.version), v_batch.version
    );
  END IF;
  UPDATE public.project_cost_commitments AS commitment SET status = 'released',
    released_by_employee_id = p_actor_employee_id, released_at = v_checked_at,
    release_reason = 'batch revision superseded', updated_at = v_checked_at
  FROM public.supplier_purchase_requisitions AS requisition
  WHERE requisition.id = commitment.source_id
    AND requisition.tenant_id = p_tenant_id
    AND requisition.purchase_batch_id = p_batch_id
    AND requisition.split_generation = v_batch.split_generation
    AND commitment.status = 'reserved';
  UPDATE public.supplier_purchase_requisitions AS requisition SET
    status = 'cancelled', cancelled_by_employee_id = p_actor_employee_id,
    cancelled_at = v_checked_at, cancel_reason = 'batch revision superseded',
    updated_by_employee_id = p_actor_employee_id, updated_at = v_checked_at,
    version = requisition.version + 1
  WHERE requisition.tenant_id = p_tenant_id
    AND requisition.purchase_batch_id = p_batch_id
    AND requisition.split_generation = v_batch.split_generation
    AND requisition.status IN ('draft', 'pending_approval');

  v_next_generation := v_batch.split_generation + 1;
  WITH suppliers AS MATERIALIZED (
    SELECT item.tenant_supplier_id, item.supplier_id,
      SUM(item.line_subtotal_amount)::numeric(18,2) AS subtotal_amount,
      SUM(item.line_tax_amount)::numeric(18,2) AS tax_amount,
      SUM(item.line_total_amount)::numeric(18,2) AS total_amount
    FROM public.supplier_purchase_batch_items AS item
    WHERE item.tenant_id = p_tenant_id AND item.purchase_batch_id = p_batch_id
    GROUP BY item.tenant_supplier_id, item.supplier_id
  ), inserted AS (
    INSERT INTO public.supplier_purchase_requisitions(
      tenant_id, project_id, tenant_supplier_id, supplier_id, status,
      budget_status, reason, expected_delivery_date, remark, priced_at,
      subtotal_amount, tax_amount, total_amount, purchase_batch_id,
      split_generation, created_by_employee_id, updated_by_employee_id,
      submitted_by_employee_id, submitted_at
    ) SELECT p_tenant_id, v_batch.project_id, supplier.tenant_supplier_id,
      supplier.supplier_id, 'pending_approval', v_budget_status, v_batch.reason,
      v_batch.expected_delivery_date, v_batch.remark, v_batch.priced_at,
      supplier.subtotal_amount, supplier.tax_amount, supplier.total_amount,
      p_batch_id, v_next_generation, p_actor_employee_id, p_actor_employee_id,
      p_actor_employee_id, v_checked_at
    FROM suppliers AS supplier ORDER BY supplier.tenant_supplier_id
    RETURNING id
  ) SELECT jsonb_agg(id ORDER BY id) INTO v_requisition_ids FROM inserted;

  INSERT INTO public.supplier_purchase_requisition_items(
    tenant_id, purchase_requisition_id, line_no, cost_category_id,
    supplier_product_id, supplier_sku_id, supplier_price_list_id,
    supplier_price_list_item_id, product_code_snapshot, product_name_snapshot,
    sku_code_snapshot, sku_name_snapshot, specification_snapshot, model_snapshot,
    purchase_unit_id, purchase_unit_code_snapshot, purchase_unit_name_snapshot,
    purchase_unit_symbol_snapshot, base_unit_id, base_unit_code_snapshot,
    base_unit_name_snapshot, base_unit_symbol_snapshot, base_unit_conversion,
    price_list_code_snapshot, price_list_version_snapshot,
    price_effective_from_snapshot, price_effective_until_snapshot, quantity,
    unit_price, tax_rate, tax_inclusive, line_subtotal_amount,
    line_tax_amount, line_total_amount
  ) SELECT p_tenant_id, requisition.id,
    row_number() OVER (PARTITION BY batch_item.tenant_supplier_id
      ORDER BY batch_item.line_no, batch_item.id)::integer,
    batch_item.cost_category_id, batch_item.supplier_product_id,
    batch_item.supplier_sku_id, batch_item.supplier_price_list_id,
    batch_item.supplier_price_list_item_id, batch_item.product_code_snapshot,
    batch_item.product_name_snapshot, batch_item.sku_code_snapshot,
    batch_item.sku_name_snapshot, batch_item.specification_snapshot,
    batch_item.model_snapshot, batch_item.purchase_unit_id,
    batch_item.purchase_unit_code_snapshot, batch_item.purchase_unit_name_snapshot,
    batch_item.purchase_unit_symbol_snapshot, batch_item.base_unit_id,
    batch_item.base_unit_code_snapshot, batch_item.base_unit_name_snapshot,
    batch_item.base_unit_symbol_snapshot, batch_item.base_unit_conversion,
    batch_item.price_list_code_snapshot, batch_item.price_list_version_snapshot,
    batch_item.price_effective_from_snapshot,
    batch_item.price_effective_until_snapshot, batch_item.quantity,
    batch_item.unit_price, batch_item.tax_rate, batch_item.tax_inclusive,
    batch_item.line_subtotal_amount, batch_item.line_tax_amount,
    batch_item.line_total_amount
  FROM public.supplier_purchase_batch_items AS batch_item
  JOIN public.supplier_purchase_requisitions AS requisition
    ON requisition.tenant_id = batch_item.tenant_id
    AND requisition.purchase_batch_id = batch_item.purchase_batch_id
    AND requisition.split_generation = v_next_generation
    AND requisition.tenant_supplier_id = batch_item.tenant_supplier_id
  WHERE batch_item.tenant_id = p_tenant_id
    AND batch_item.purchase_batch_id = p_batch_id;

  WITH child_by_category AS MATERIALIZED (
    SELECT requisition.id AS purchase_requisition_id,
      item.cost_category_id, SUM(item.line_total_amount)::numeric(18,2) AS amount
    FROM public.supplier_purchase_requisitions AS requisition
    JOIN public.supplier_purchase_requisition_items AS item
      ON item.purchase_requisition_id = requisition.id
      AND item.tenant_id = requisition.tenant_id
    WHERE requisition.tenant_id = p_tenant_id
      AND requisition.purchase_batch_id = p_batch_id
      AND requisition.split_generation = v_next_generation
    GROUP BY requisition.id, item.cost_category_id
  )
  INSERT INTO public.project_cost_commitments(
    tenant_id, project_id, cost_category_id, source_type, source_id,
    amount, status, budget_amount_snapshot, expense_amount_snapshot,
    other_commitment_amount_snapshot, available_amount_snapshot,
    created_by_employee_id
  ) SELECT p_tenant_id, v_batch.project_id, child.cost_category_id,
    'supplier_purchase_requisition', child.purchase_requisition_id,
    child.amount, 'reserved',
    (v_budget_snapshot -> child.cost_category_id::text ->> 'budget_amount')::numeric,
    (v_budget_snapshot -> child.cost_category_id::text ->> 'expense_amount')::numeric,
    (v_budget_snapshot -> child.cost_category_id::text ->> 'other_commitment_amount')::numeric,
    (v_budget_snapshot -> child.cost_category_id::text ->> 'available_amount')::numeric,
    p_actor_employee_id FROM child_by_category AS child;

  UPDATE public.supplier_purchase_batches AS batch SET
    status = 'pending_approval', budget_checked_at = v_checked_at,
    budget_status = v_budget_status, budget_snapshot = v_budget_snapshot,
    split_generation = v_next_generation,
    submitted_by_employee_id = p_actor_employee_id,
    submitted_at = v_checked_at, reviewed_by_employee_id = NULL,
    reviewed_at = NULL, review_remark = NULL,
    version = batch.version + 1, updated_by_employee_id = p_actor_employee_id,
    updated_at = v_checked_at
  WHERE batch.id = p_batch_id AND batch.tenant_id = p_tenant_id
  RETURNING * INTO v_batch;
  v_result := jsonb_build_object('status', 'submitted', 'idempotent', false,
    'batch', public.supplier_purchase_batch_to_jsonb(v_batch),
    'requisition_ids', COALESCE(v_requisition_ids, '[]'::jsonb),
    'version', v_batch.version);
  INSERT INTO public.supplier_purchase_batch_command_events(
    tenant_id, purchase_batch_id, command_type, idempotency_key,
    request_fingerprint, request, actor_user_id, actor_employee_id,
    result, result_version
  ) VALUES (p_tenant_id, p_batch_id, 'submit', p_idempotency_key,
    v_fingerprint, v_request, p_actor_user_id, p_actor_employee_id,
    v_result, v_batch.version);
  RETURN v_result;
END;
$$;

CREATE FUNCTION public.cancel_supplier_purchase_batch(
  p_batch_id uuid,
  p_tenant_id uuid,
  p_expected_version integer,
  p_reason text,
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
  v_batch public.supplier_purchase_batches%ROWTYPE;
  v_event public.supplier_purchase_batch_command_events%ROWTYPE;
  v_request jsonb;
  v_fingerprint text;
  v_result jsonb;
  v_cancelled_at timestamptz := clock_timestamp();
BEGIN
  IF p_batch_id IS NULL OR p_tenant_id IS NULL
    OR p_expected_version IS NULL OR p_expected_version <= 0
    OR p_reason IS NULL OR btrim(p_reason) = ''
    OR char_length(btrim(p_reason)) > 500
    OR p_actor_user_id IS NULL OR p_actor_employee_id IS NULL
    OR p_idempotency_key IS NULL OR btrim(p_idempotency_key) = ''
    OR p_idempotency_key <> btrim(p_idempotency_key)
    OR char_length(p_idempotency_key) > 120
  THEN RETURN jsonb_build_object('status', 'validation_error',
    'idempotent', false,
    'error_code', 'SUPPLIER_PURCHASE_BATCH_VALIDATION_ERROR',
    'version', 0); END IF;
  PERFORM public.assert_supplier_purchase_order_actor(
    p_tenant_id, p_actor_user_id, p_actor_employee_id
  );
  v_request := jsonb_build_object(
    'tenant_id', p_tenant_id, 'batch_id', p_batch_id,
    'expected_version', p_expected_version, 'reason', btrim(p_reason),
    'actor_user_id', p_actor_user_id,
    'actor_employee_id', p_actor_employee_id
  );
  v_fingerprint := encode(extensions.digest(
    convert_to(v_request::text, 'UTF8'), 'sha256'
  ), 'hex');
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'supplier-purchase-batch-command:' || p_tenant_id::text || ':' ||
      p_batch_id::text || ':cancel:' || p_idempotency_key,
    6720240826142000
  ));
  SELECT event.* INTO v_event
  FROM public.supplier_purchase_batch_command_events AS event
  WHERE event.tenant_id = p_tenant_id
    AND event.purchase_batch_id = p_batch_id
    AND event.command_type = 'cancel'
    AND event.idempotency_key = p_idempotency_key
  FOR UPDATE;
  IF FOUND THEN
    IF v_event.request_fingerprint IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001',
        MESSAGE = 'SUPPLIER_IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN v_event.result || jsonb_build_object('idempotent', true);
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'supplier-purchase-batch-id:' || p_batch_id::text, 6720240826142000
  ));
  SELECT batch.* INTO v_batch FROM public.supplier_purchase_batches AS batch
  WHERE batch.id = p_batch_id AND batch.tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN public.record_supplier_purchase_batch_command_result(
      p_tenant_id, p_batch_id, 'cancel', p_idempotency_key, v_fingerprint,
      v_request, p_actor_user_id, p_actor_employee_id,
      jsonb_build_object('status', 'not_found',
        'error_code', 'SUPPLIER_PURCHASE_BATCH_NOT_FOUND', 'version', 0), 0
    );
  END IF;
  IF v_batch.status NOT IN ('draft', 'pending_approval') THEN
    RETURN public.record_supplier_purchase_batch_command_result(
      p_tenant_id, p_batch_id, 'cancel', p_idempotency_key, v_fingerprint,
      v_request, p_actor_user_id, p_actor_employee_id,
      jsonb_build_object('status', 'state_conflict',
        'error_code', 'SUPPLIER_PURCHASE_BATCH_STATE_CONFLICT',
        'version', v_batch.version), v_batch.version
    );
  END IF;
  IF v_batch.version <> p_expected_version THEN
    RETURN public.record_supplier_purchase_batch_command_result(
      p_tenant_id, p_batch_id, 'cancel', p_idempotency_key, v_fingerprint,
      v_request, p_actor_user_id, p_actor_employee_id,
      jsonb_build_object('status', 'version_conflict',
        'error_code', 'SUPPLIER_PURCHASE_BATCH_VERSION_CONFLICT',
        'version', v_batch.version), v_batch.version
    );
  END IF;
  PERFORM requisition.id FROM public.supplier_purchase_requisitions AS requisition
  WHERE requisition.tenant_id = p_tenant_id
    AND requisition.purchase_batch_id = p_batch_id
    AND requisition.split_generation = v_batch.split_generation
  ORDER BY requisition.tenant_supplier_id, requisition.id FOR UPDATE;
  IF EXISTS (
    SELECT 1 FROM public.supplier_purchase_requisitions AS requisition
    WHERE requisition.tenant_id = p_tenant_id
      AND requisition.purchase_batch_id = p_batch_id
      AND requisition.split_generation = v_batch.split_generation
      AND requisition.purchase_order_id IS NOT NULL
  ) THEN RETURN public.record_supplier_purchase_batch_command_result(
    p_tenant_id, p_batch_id, 'cancel', p_idempotency_key, v_fingerprint,
    v_request, p_actor_user_id, p_actor_employee_id,
    jsonb_build_object('status', 'state_conflict',
      'error_code', 'SUPPLIER_PURCHASE_BATCH_STATE_CONFLICT',
      'version', v_batch.version), v_batch.version
  ); END IF;
  PERFORM commitment.id FROM public.project_cost_commitments AS commitment
  JOIN public.supplier_purchase_requisitions AS requisition
    ON requisition.id = commitment.source_id
    AND requisition.tenant_id = commitment.tenant_id
  WHERE requisition.tenant_id = p_tenant_id
    AND requisition.purchase_batch_id = p_batch_id
    AND requisition.split_generation = v_batch.split_generation
  ORDER BY commitment.cost_category_id, commitment.id FOR UPDATE OF commitment;
  IF EXISTS (
    SELECT 1 FROM public.project_cost_commitments AS commitment
    JOIN public.supplier_purchase_requisitions AS requisition
      ON requisition.id = commitment.source_id
      AND requisition.tenant_id = commitment.tenant_id
    WHERE requisition.tenant_id = p_tenant_id
      AND requisition.purchase_batch_id = p_batch_id
      AND requisition.split_generation = v_batch.split_generation
      AND commitment.status IN ('converted', 'consumed')
  ) THEN RETURN public.record_supplier_purchase_batch_command_result(
    p_tenant_id, p_batch_id, 'cancel', p_idempotency_key, v_fingerprint,
    v_request, p_actor_user_id, p_actor_employee_id,
    jsonb_build_object('status', 'state_conflict',
      'error_code', 'SUPPLIER_PURCHASE_BATCH_STATE_CONFLICT',
      'version', v_batch.version), v_batch.version
  ); END IF;
  UPDATE public.project_cost_commitments AS commitment SET status = 'released',
    released_by_employee_id = p_actor_employee_id,
    released_at = v_cancelled_at, release_reason = btrim(p_reason),
    updated_at = v_cancelled_at
  FROM public.supplier_purchase_requisitions AS requisition
  WHERE requisition.id = commitment.source_id
    AND requisition.tenant_id = p_tenant_id
    AND requisition.purchase_batch_id = p_batch_id
    AND requisition.split_generation = v_batch.split_generation
    AND commitment.status = 'reserved';
  UPDATE public.supplier_purchase_requisitions AS requisition SET
    status = 'cancelled', cancelled_by_employee_id = p_actor_employee_id,
    cancelled_at = v_cancelled_at, cancel_reason = btrim(p_reason),
    updated_by_employee_id = p_actor_employee_id,
    updated_at = v_cancelled_at, version = requisition.version + 1
  WHERE requisition.tenant_id = p_tenant_id
    AND requisition.purchase_batch_id = p_batch_id
    AND requisition.split_generation = v_batch.split_generation
    AND requisition.status IN ('draft', 'pending_approval');
  UPDATE public.supplier_purchase_batches AS batch SET status = 'cancelled',
    cancelled_by_employee_id = p_actor_employee_id,
    cancelled_at = v_cancelled_at, cancel_reason = btrim(p_reason),
    version = batch.version + 1, updated_by_employee_id = p_actor_employee_id,
    updated_at = v_cancelled_at
  WHERE batch.id = p_batch_id AND batch.tenant_id = p_tenant_id
  RETURNING * INTO v_batch;
  v_result := jsonb_build_object('status', 'cancelled', 'idempotent', false,
    'batch', public.supplier_purchase_batch_to_jsonb(v_batch),
    'version', v_batch.version);
  INSERT INTO public.supplier_purchase_batch_command_events(
    tenant_id, purchase_batch_id, command_type, idempotency_key,
    request_fingerprint, request, actor_user_id, actor_employee_id,
    result, result_version
  ) VALUES (p_tenant_id, p_batch_id, 'cancel', p_idempotency_key,
    v_fingerprint, v_request, p_actor_user_id, p_actor_employee_id,
    v_result, v_batch.version);
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_supplier_purchase_batch(
  uuid, uuid, integer, uuid, uuid, text
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.submit_supplier_purchase_batch(
  uuid, uuid, integer, uuid, uuid, text
) TO service_role;
REVOKE ALL ON FUNCTION public.cancel_supplier_purchase_batch(
  uuid, uuid, integer, text, uuid, uuid, text
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cancel_supplier_purchase_batch(
  uuid, uuid, integer, text, uuid, uuid, text
) TO service_role;

REVOKE ALL ON FUNCTION public.resolve_supplier_purchase_batch_catalog(
  uuid, uuid, text, uuid, uuid, uuid, timestamptz, integer, integer
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.resolve_supplier_purchase_batch_catalog(
  uuid, uuid, text, uuid, uuid, uuid, timestamptz, integer, integer
) TO service_role;

CREATE FUNCTION public.save_supplier_purchase_batch_draft(
  p_batch_id uuid,
  p_tenant_id uuid,
  p_project_id uuid,
  p_expected_version integer,
  p_reason text,
  p_expected_delivery_date date,
  p_remark text,
  p_items jsonb,
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
  v_batch public.supplier_purchase_batches%ROWTYPE;
  v_event public.supplier_purchase_batch_command_events%ROWTYPE;
  v_request jsonb;
  v_fingerprint text;
  v_result jsonb;
  v_resolved jsonb;
  v_split_preview jsonb;
  v_priced_at timestamptz;
  v_requested_count integer;
  v_resolved_count integer;
  v_supplier_count integer;
  v_subtotal numeric(18, 2);
  v_tax numeric(18, 2);
  v_total numeric(18, 2);
  v_exists boolean;
  v_supplier_id uuid;
BEGIN
  IF p_batch_id IS NULL OR p_tenant_id IS NULL OR p_project_id IS NULL
    OR p_expected_version IS NULL OR p_expected_version < 0
    OR p_reason IS NULL OR btrim(p_reason) = ''
    OR char_length(btrim(p_reason)) > 500
    OR (p_remark IS NOT NULL AND (btrim(p_remark) = ''
      OR char_length(btrim(p_remark)) > 500))
    OR p_actor_user_id IS NULL OR p_actor_employee_id IS NULL
    OR p_idempotency_key IS NULL OR btrim(p_idempotency_key) = ''
    OR p_idempotency_key <> btrim(p_idempotency_key)
    OR char_length(p_idempotency_key) > 120
  THEN
    RETURN jsonb_build_object('status', 'validation_error',
      'idempotent', false,
      'error_code', 'SUPPLIER_PURCHASE_BATCH_VALIDATION_ERROR',
      'version', 0);
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RETURN jsonb_build_object('status', 'validation_error',
      'idempotent', false,
      'error_code', 'SUPPLIER_PURCHASE_BATCH_VALIDATION_ERROR',
      'version', 0);
  END IF;
  IF jsonb_array_length(p_items) NOT BETWEEN 1 AND 100 THEN
    RETURN jsonb_build_object('status', 'validation_error',
      'idempotent', false,
      'error_code', 'SUPPLIER_PURCHASE_BATCH_VALIDATION_ERROR',
      'version', 0);
  END IF;

  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_items) AS item(value)
    WHERE jsonb_typeof(item.value) <> 'object') THEN
    RETURN jsonb_build_object('status', 'validation_error',
      'idempotent', false,
      'error_code', 'SUPPLIER_PURCHASE_BATCH_VALIDATION_ERROR',
      'version', 0);
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_items) AS item(value)
    WHERE EXISTS (SELECT 1 FROM jsonb_object_keys(item.value) AS key
        WHERE key NOT IN ('supplier_sku_id', 'cost_category_id', 'quantity'))
      OR NOT (item.value ?& ARRAY['supplier_sku_id','cost_category_id','quantity'])
      OR jsonb_typeof(item.value -> 'supplier_sku_id') <> 'string'
      OR jsonb_typeof(item.value -> 'cost_category_id') <> 'string'
      OR jsonb_typeof(item.value -> 'quantity') <> 'string'
      OR (item.value ->> 'quantity') !~
        '^(?:0|[1-9][0-9]{0,13})(?:\.[0-9]{1,4})?$'
      OR (item.value ->> 'quantity') !~ '[1-9]'
  ) THEN
    RETURN jsonb_build_object('status', 'validation_error',
      'idempotent', false,
      'error_code', 'SUPPLIER_PURCHASE_BATCH_VALIDATION_ERROR',
      'version', 0);
  END IF;

  BEGIN
    SELECT COUNT(*)::integer INTO v_requested_count
    FROM jsonb_to_recordset(p_items) AS item(
      supplier_sku_id uuid, cost_category_id uuid, quantity numeric
    )
    WHERE item.quantity > 0 AND scale(item.quantity) <= 4;
  EXCEPTION WHEN invalid_text_representation OR invalid_parameter_value
    OR numeric_value_out_of_range THEN
    RETURN jsonb_build_object('status', 'validation_error',
      'idempotent', false,
      'error_code', 'SUPPLIER_PURCHASE_BATCH_VALIDATION_ERROR',
      'version', 0);
  END;
  IF v_requested_count <> jsonb_array_length(p_items) OR EXISTS (
    SELECT 1 FROM jsonb_to_recordset(p_items) AS item(
      supplier_sku_id uuid, cost_category_id uuid, quantity numeric
    ) GROUP BY lower(item.supplier_sku_id::text) HAVING COUNT(*) > 1
  ) THEN
    RETURN jsonb_build_object('status', 'validation_error',
      'idempotent', false,
      'error_code', 'SUPPLIER_PURCHASE_BATCH_DUPLICATE_SKU',
      'version', 0);
  END IF;

  PERFORM public.assert_supplier_purchase_order_actor(
    p_tenant_id, p_actor_user_id, p_actor_employee_id
  );
  v_request := jsonb_build_object(
    'tenant_id', p_tenant_id, 'batch_id', p_batch_id,
    'project_id', p_project_id, 'expected_version', p_expected_version,
    'reason', btrim(p_reason),
    'expected_delivery_date', p_expected_delivery_date,
    'remark', CASE WHEN p_remark IS NULL THEN NULL ELSE btrim(p_remark) END,
    'items', p_items, 'actor_user_id', p_actor_user_id,
    'actor_employee_id', p_actor_employee_id
  );
  v_fingerprint := encode(extensions.digest(
    convert_to(v_request::text, 'UTF8'), 'sha256'
  ), 'hex');

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'supplier-purchase-batch-command:' || p_tenant_id::text || ':' ||
      p_batch_id::text || ':save_draft:' || p_idempotency_key,
    6720240826142000
  ));
  SELECT event.* INTO v_event
  FROM public.supplier_purchase_batch_command_events AS event
  WHERE event.tenant_id = p_tenant_id
    AND event.purchase_batch_id = p_batch_id
    AND event.command_type = 'save_draft'
    AND event.idempotency_key = p_idempotency_key
  FOR UPDATE;
  IF FOUND THEN
    IF v_event.request_fingerprint IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001',
        MESSAGE = 'SUPPLIER_IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN v_event.result || jsonb_build_object('idempotent', true);
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'supplier-purchase-batch-id:' || p_batch_id::text, 6720240826142000
  ));
  SELECT batch.* INTO v_batch
  FROM public.supplier_purchase_batches AS batch
  WHERE batch.id = p_batch_id AND batch.tenant_id = p_tenant_id
  FOR UPDATE;
  v_exists := FOUND;
  IF NOT v_exists AND p_expected_version = 0 THEN
    IF EXISTS (SELECT 1 FROM public.supplier_purchase_batches
      WHERE id = p_batch_id) THEN
      RETURN public.record_supplier_purchase_batch_command_result(
        p_tenant_id, p_batch_id, 'save_draft', p_idempotency_key,
        v_fingerprint, v_request, p_actor_user_id, p_actor_employee_id,
        jsonb_build_object('status', 'state_conflict',
          'error_code', 'SUPPLIER_PURCHASE_BATCH_ID_CONFLICT',
          'version', 0), 0
      );
    END IF;
  ELSIF NOT v_exists THEN
    RETURN public.record_supplier_purchase_batch_command_result(
      p_tenant_id, p_batch_id, 'save_draft', p_idempotency_key,
      v_fingerprint, v_request, p_actor_user_id, p_actor_employee_id,
      jsonb_build_object('status', 'not_found',
        'error_code', 'SUPPLIER_PURCHASE_BATCH_NOT_FOUND', 'version', 0), 0
    );
  ELSIF p_expected_version = 0 OR v_batch.version <> p_expected_version THEN
    RETURN public.record_supplier_purchase_batch_command_result(
      p_tenant_id, p_batch_id, 'save_draft', p_idempotency_key,
      v_fingerprint, v_request, p_actor_user_id, p_actor_employee_id,
      jsonb_build_object('status', 'version_conflict',
        'error_code', 'SUPPLIER_PURCHASE_BATCH_VERSION_CONFLICT',
        'version', v_batch.version), v_batch.version
    );
  ELSIF v_batch.status <> 'draft' THEN
    RETURN public.record_supplier_purchase_batch_command_result(
      p_tenant_id, p_batch_id, 'save_draft', p_idempotency_key,
      v_fingerprint, v_request, p_actor_user_id, p_actor_employee_id,
      jsonb_build_object('status', 'state_conflict',
        'error_code', 'SUPPLIER_PURCHASE_BATCH_STATE_CONFLICT',
        'version', v_batch.version), v_batch.version
    );
  END IF;

  PERFORM project.id FROM public.projects AS project
  WHERE project.id = p_project_id AND project.tenant_id = p_tenant_id
  FOR SHARE;
  IF NOT FOUND THEN
    IF v_exists THEN
      RETURN public.record_supplier_purchase_batch_command_result(
        p_tenant_id, p_batch_id, 'save_draft', p_idempotency_key,
        v_fingerprint, v_request, p_actor_user_id, p_actor_employee_id,
        jsonb_build_object('status', 'project_invalid',
          'error_code', 'SUPPLIER_PURCHASE_BATCH_PROJECT_INVALID',
          'version', v_batch.version),
        v_batch.version
      );
    END IF;
    RETURN public.record_supplier_purchase_batch_command_result(
      p_tenant_id, p_batch_id, 'save_draft', p_idempotency_key,
      v_fingerprint, v_request, p_actor_user_id, p_actor_employee_id,
      jsonb_build_object('status', 'project_invalid',
        'error_code', 'SUPPLIER_PURCHASE_BATCH_PROJECT_INVALID',
        'version', 0), 0
    );
  END IF;
  v_priced_at := clock_timestamp();

  PERFORM relationship.id
  FROM public.tenant_suppliers AS relationship
  JOIN (
    SELECT DISTINCT sku.supplier_id
    FROM jsonb_to_recordset(p_items) AS requested(supplier_sku_id uuid)
    JOIN public.supplier_skus AS sku ON sku.id = requested.supplier_sku_id
  ) AS requested_supplier ON requested_supplier.supplier_id = relationship.supplier_id
  WHERE relationship.tenant_id = p_tenant_id
    AND relationship.default_currency = 'CNY'
  ORDER BY relationship.id FOR SHARE OF relationship;

  FOR v_supplier_id IN
    SELECT DISTINCT sku.supplier_id
    FROM jsonb_to_recordset(p_items) AS requested(supplier_sku_id uuid)
    JOIN public.supplier_skus AS sku ON sku.id = requested.supplier_sku_id
    ORDER BY sku.supplier_id
  LOOP
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
      'supplier-price-publish:' || p_tenant_id::text || ':' ||
        v_supplier_id::text,
      6720240729160000
    ));
  END LOOP;

  WITH requested_items AS MATERIALIZED (
    SELECT requested.supplier_sku_id, requested.cost_category_id,
      requested.quantity::numeric(18, 4) AS quantity, requested.ordinality
    FROM jsonb_to_recordset(p_items) WITH ORDINALITY AS requested(
      supplier_sku_id uuid, cost_category_id uuid, quantity numeric,
      ordinality bigint
    )
  ),
  eligibility AS MATERIALIZED (
    SELECT eligible.* FROM public.get_tenant_supplier_order_eligibility_set(
      p_tenant_id, v_priced_at, NULL
    ) AS eligible WHERE eligible.eligible
  ),
  locked_price_candidates AS MATERIALIZED (
    SELECT requested.*, relationship.id AS tenant_supplier_id,
      relationship.supplier_id, supplier.name AS supplier_name,
      product.id AS supplier_product_id, product.product_code,
      product.name AS product_name, product.category_id AS catalog_category_id,
      category.name AS category_name, product.brand_id,
      brand.name AS brand_name, sku.sku_code, sku.name AS sku_name,
      sku.specification, sku.model, price_list.id AS supplier_price_list_id,
      price_list.price_list_code,
      price_list.version_number AS price_list_version,
      price_list.effective_from, price_list.effective_until,
      price_item.id AS supplier_price_list_item_id,
      price_item.purchase_unit_id, purchase_unit.code AS purchase_unit_code,
      purchase_unit.name AS purchase_unit_name,
      purchase_unit.symbol AS purchase_unit_symbol,
      price_item.base_unit_id, base_unit.code AS base_unit_code,
      base_unit.name AS base_unit_name, base_unit.symbol AS base_unit_symbol,
      price_item.base_unit_conversion, price_item.unit_price,
      price_item.tax_rate, price_item.tax_inclusive
    FROM public.supplier_price_list_items AS price_item
    JOIN requested_items AS requested
      ON requested.supplier_sku_id = price_item.supplier_sku_id
    JOIN public.supplier_price_lists AS price_list
      ON price_list.id = price_item.supplier_price_list_id
      AND price_list.tenant_id = p_tenant_id
      AND price_list.supplier_id = price_item.supplier_id
    JOIN public.tenant_suppliers AS relationship
      ON relationship.id = price_list.tenant_supplier_id
      AND relationship.tenant_id = price_list.tenant_id
      AND relationship.supplier_id = price_list.supplier_id
    JOIN eligibility ON eligibility.tenant_supplier_id = relationship.id
      AND eligibility.supplier_id = relationship.supplier_id
    JOIN public.suppliers AS supplier ON supplier.id = relationship.supplier_id
    JOIN public.supplier_skus AS sku ON sku.id = price_item.supplier_sku_id
      AND sku.supplier_id = price_item.supplier_id
    JOIN public.supplier_products AS product ON product.id = sku.supplier_product_id
      AND product.supplier_id = sku.supplier_id
      AND product.id = price_item.supplier_product_id
    JOIN public.catalog_categories AS category ON category.id = product.category_id
      AND category.status = 'active'
    JOIN public.catalog_brands AS brand ON brand.id = product.brand_id
      AND brand.status = 'active'
    JOIN public.catalog_units AS purchase_unit ON purchase_unit.id = price_item.purchase_unit_id
      AND purchase_unit.status = 'active'
    JOIN public.catalog_units AS base_unit ON base_unit.id = price_item.base_unit_id
      AND base_unit.status = 'active'
    JOIN public.finance_cost_categories AS finance_category
      ON finance_category.id = requested.cost_category_id
      AND finance_category.tenant_id = p_tenant_id
      AND finance_category.status = 'active'
    WHERE price_item.tenant_id = p_tenant_id
      AND price_list.lifecycle_status = 'published'
      AND price_list.scope_type = 'default' AND price_list.currency = 'CNY'
      AND relationship.default_currency = 'CNY'
      AND price_list.effective_from <= v_priced_at
      AND (price_list.effective_until IS NULL OR price_list.effective_until > v_priced_at)
      AND product.status = 'active' AND sku.status = 'active'
      AND ((supplier.ownership_scope = 'platform' AND supplier.owner_tenant_id IS NULL)
        OR (supplier.ownership_scope = 'tenant' AND supplier.owner_tenant_id = p_tenant_id))
      AND product.ownership_scope = sku.ownership_scope
      AND product.owner_tenant_id IS NOT DISTINCT FROM sku.owner_tenant_id
      AND ((product.ownership_scope = 'platform' AND product.owner_tenant_id IS NULL)
        OR (product.ownership_scope = 'tenant' AND product.owner_tenant_id = p_tenant_id))
      AND ((category.ownership_scope = 'platform' AND category.owner_tenant_id IS NULL)
        OR (category.ownership_scope = 'tenant' AND category.owner_tenant_id = p_tenant_id))
      AND ((brand.ownership_scope = 'platform' AND brand.owner_tenant_id IS NULL)
        OR (brand.ownership_scope = 'tenant' AND brand.owner_tenant_id = p_tenant_id))
      AND sku.purchase_unit_id = price_item.purchase_unit_id
      AND sku.base_unit_id = price_item.base_unit_id
      AND sku.base_unit_conversion = price_item.base_unit_conversion
    ORDER BY relationship.id, sku.id, price_item.id, finance_category.id
    FOR SHARE OF price_item, price_list, supplier, sku, product, category, brand,
      purchase_unit, base_unit, finance_category
  ),
  price_candidates AS MATERIALIZED (
    SELECT locked.*,
      COUNT(*) OVER (
        PARTITION BY locked.tenant_supplier_id, locked.supplier_sku_id
      ) AS candidate_count
    FROM locked_price_candidates AS locked
  ),
  resolved_items AS MATERIALIZED (
    SELECT candidate.*,
      row_number() OVER (ORDER BY candidate.ordinality)::integer AS line_no,
      CASE WHEN candidate.tax_inclusive THEN round(round(candidate.quantity * candidate.unit_price, 2) / (1 + candidate.tax_rate), 2)
        ELSE round(candidate.quantity * candidate.unit_price, 2) END::numeric(18,2) AS line_subtotal_amount,
      CASE WHEN candidate.tax_inclusive THEN round(candidate.quantity * candidate.unit_price, 2) - round(round(candidate.quantity * candidate.unit_price, 2) / (1 + candidate.tax_rate), 2)
        ELSE round(round(candidate.quantity * candidate.unit_price, 2) * candidate.tax_rate, 2) END::numeric(18,2) AS line_tax_amount,
      CASE WHEN candidate.tax_inclusive THEN round(candidate.quantity * candidate.unit_price, 2)
        ELSE round(candidate.quantity * candidate.unit_price, 2) + round(round(candidate.quantity * candidate.unit_price, 2) * candidate.tax_rate, 2) END::numeric(18,2) AS line_total_amount
    FROM price_candidates AS candidate WHERE candidate.candidate_count = 1
  )
  SELECT COUNT(*)::integer, COUNT(DISTINCT tenant_supplier_id)::integer,
    COALESCE(jsonb_agg(to_jsonb(resolved) ORDER BY line_no), '[]'::jsonb),
    COALESCE(SUM(line_subtotal_amount), 0), COALESCE(SUM(line_tax_amount), 0),
    COALESCE(SUM(line_total_amount), 0)
  INTO v_resolved_count, v_supplier_count, v_resolved,
    v_subtotal, v_tax, v_total
  FROM resolved_items AS resolved;

  IF v_resolved_count <> v_requested_count THEN
    RETURN public.record_supplier_purchase_batch_command_result(
      p_tenant_id, p_batch_id, 'save_draft', p_idempotency_key,
      v_fingerprint, v_request, p_actor_user_id, p_actor_employee_id,
      jsonb_build_object('status', 'price_changed',
        'error_code', 'SUPPLIER_PURCHASE_BATCH_ITEM_UNAVAILABLE',
        'version', CASE WHEN v_exists THEN v_batch.version ELSE 0 END),
      CASE WHEN v_exists THEN v_batch.version ELSE 0 END
    );
  END IF;
  IF v_supplier_count > 20 THEN
    RETURN public.record_supplier_purchase_batch_command_result(
      p_tenant_id, p_batch_id, 'save_draft', p_idempotency_key,
      v_fingerprint, v_request, p_actor_user_id, p_actor_employee_id,
      jsonb_build_object('status', 'validation_error',
        'error_code', 'SUPPLIER_PURCHASE_BATCH_LIMIT_EXCEEDED',
        'version', CASE WHEN v_exists THEN v_batch.version ELSE 0 END),
      CASE WHEN v_exists THEN v_batch.version ELSE 0 END
    );
  END IF;

  IF NOT v_exists THEN
    INSERT INTO public.supplier_purchase_batches(
      id, tenant_id, project_id, reason, expected_delivery_date, remark,
      priced_at, subtotal_amount, tax_amount, total_amount,
      supplier_count, item_count, created_by_employee_id, updated_by_employee_id
    ) VALUES (
      p_batch_id, p_tenant_id, p_project_id, btrim(p_reason),
      p_expected_delivery_date,
      CASE WHEN p_remark IS NULL THEN NULL ELSE btrim(p_remark) END,
      v_priced_at, v_subtotal, v_tax, v_total, v_supplier_count,
      v_resolved_count, p_actor_employee_id, p_actor_employee_id
    ) RETURNING * INTO v_batch;
  ELSE
    DELETE FROM public.supplier_purchase_batch_items
    WHERE tenant_id = p_tenant_id AND purchase_batch_id = p_batch_id;
    UPDATE public.supplier_purchase_batches AS batch SET
      project_id = p_project_id, reason = btrim(p_reason),
      expected_delivery_date = p_expected_delivery_date,
      remark = CASE WHEN p_remark IS NULL THEN NULL ELSE btrim(p_remark) END,
      priced_at = v_priced_at, subtotal_amount = v_subtotal,
      tax_amount = v_tax, total_amount = v_total,
      budget_checked_at = NULL, budget_status = 'unchecked',
      budget_snapshot = '{}'::jsonb, supplier_count = v_supplier_count,
      item_count = v_resolved_count, version = batch.version + 1,
      updated_by_employee_id = p_actor_employee_id, updated_at = v_priced_at
    WHERE batch.id = p_batch_id AND batch.tenant_id = p_tenant_id
    RETURNING * INTO v_batch;
  END IF;

  INSERT INTO public.supplier_purchase_batch_items(
    tenant_id, purchase_batch_id, line_no, supplier_sku_id, quantity,
    cost_category_id, supplier_id, tenant_supplier_id, supplier_product_id,
    supplier_price_list_id, supplier_price_list_item_id, catalog_category_id,
    category_name_snapshot, brand_id, brand_name_snapshot,
    product_code_snapshot, product_name_snapshot, sku_code_snapshot,
    sku_name_snapshot, specification_snapshot, model_snapshot,
    purchase_unit_id, purchase_unit_code_snapshot, purchase_unit_name_snapshot,
    purchase_unit_symbol_snapshot, base_unit_id, base_unit_code_snapshot,
    base_unit_name_snapshot, base_unit_symbol_snapshot, base_unit_conversion,
    supplier_name_snapshot, price_list_code_snapshot,
    price_list_version_snapshot, price_effective_from_snapshot,
    price_effective_until_snapshot, priced_at, unit_price, tax_rate,
    tax_inclusive, line_subtotal_amount, line_tax_amount, line_total_amount
  ) SELECT p_tenant_id, p_batch_id, item.line_no, item.supplier_sku_id,
    item.quantity, item.cost_category_id, item.supplier_id,
    item.tenant_supplier_id, item.supplier_product_id,
    item.supplier_price_list_id, item.supplier_price_list_item_id,
    item.catalog_category_id, item.category_name, item.brand_id,
    item.brand_name, item.product_code, item.product_name, item.sku_code,
    item.sku_name, item.specification, item.model, item.purchase_unit_id,
    item.purchase_unit_code, item.purchase_unit_name, item.purchase_unit_symbol,
    item.base_unit_id, item.base_unit_code, item.base_unit_name,
    item.base_unit_symbol, item.base_unit_conversion, item.supplier_name,
    item.price_list_code, item.price_list_version, item.effective_from,
    item.effective_until, v_priced_at, item.unit_price, item.tax_rate,
    item.tax_inclusive, item.line_subtotal_amount, item.line_tax_amount,
    item.line_total_amount
  FROM jsonb_to_recordset(v_resolved) AS item(
    line_no integer, supplier_sku_id uuid, quantity numeric(18,4),
    cost_category_id uuid, supplier_id uuid, tenant_supplier_id uuid,
    supplier_product_id uuid, supplier_price_list_id uuid,
    supplier_price_list_item_id uuid, catalog_category_id uuid,
    category_name text, brand_id uuid, brand_name text, product_code text,
    product_name text, sku_code text, sku_name text, specification text,
    model text, purchase_unit_id uuid, purchase_unit_code text,
    purchase_unit_name text, purchase_unit_symbol text, base_unit_id uuid,
    base_unit_code text, base_unit_name text, base_unit_symbol text,
    base_unit_conversion numeric(18,8), supplier_name text,
    price_list_code text, price_list_version integer,
    effective_from timestamptz, effective_until timestamptz,
    unit_price numeric(14,2), tax_rate numeric(7,6), tax_inclusive boolean,
    line_subtotal_amount numeric(18,2), line_tax_amount numeric(18,2),
    line_total_amount numeric(18,2)
  );

  WITH preview AS MATERIALIZED (
    SELECT item.tenant_supplier_id, item.supplier_id,
      MIN(item.supplier_name) AS supplier_name,
      COUNT(*)::integer AS item_count,
      SUM(item.line_subtotal_amount)::numeric(18,2) AS subtotal_amount,
      SUM(item.line_tax_amount)::numeric(18,2) AS tax_amount,
      SUM(item.line_total_amount)::numeric(18,2) AS total_amount
    FROM jsonb_to_recordset(v_resolved) AS item(
      tenant_supplier_id uuid, supplier_id uuid, supplier_name text,
      line_subtotal_amount numeric(18,2), line_tax_amount numeric(18,2),
      line_total_amount numeric(18,2)
    )
    GROUP BY item.tenant_supplier_id, item.supplier_id
  )
  SELECT jsonb_agg(jsonb_build_object(
    'tenant_supplier_id', preview.tenant_supplier_id,
    'supplier_id', preview.supplier_id,
    'supplier_name', preview.supplier_name,
    'item_count', preview.item_count,
    'subtotal_amount', preview.subtotal_amount::text,
    'tax_amount', preview.tax_amount::text,
    'total_amount', preview.total_amount::text
  ) ORDER BY preview.tenant_supplier_id)
  INTO v_split_preview
  FROM preview;

  v_result := jsonb_build_object('status', 'saved', 'idempotent', false,
    'batch', public.supplier_purchase_batch_to_jsonb(v_batch),
    'split_preview', v_split_preview,
    'version', v_batch.version);
  INSERT INTO public.supplier_purchase_batch_command_events(
    tenant_id, purchase_batch_id, command_type, idempotency_key,
    request_fingerprint, request, actor_user_id, actor_employee_id,
    result, result_version
  ) VALUES (p_tenant_id, p_batch_id, 'save_draft', p_idempotency_key,
    v_fingerprint, v_request, p_actor_user_id, p_actor_employee_id,
    v_result, v_batch.version);
  RETURN v_result;
EXCEPTION WHEN numeric_value_out_of_range THEN
  IF v_fingerprint IS NULL THEN
    RETURN jsonb_build_object('status', 'validation_error',
      'idempotent', false,
      'error_code', 'SUPPLIER_PURCHASE_BATCH_LIMIT_EXCEEDED', 'version', 0);
  END IF;
  -- The EXCEPTION subtransaction released locks acquired in the failed block.
  -- Re-enter the canonical lock order and replay a concurrent first result.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'supplier-purchase-batch-command:' || p_tenant_id::text || ':' ||
      p_batch_id::text || ':save_draft:' || p_idempotency_key,
    6720240826142000
  ));
  SELECT event.* INTO v_event
  FROM public.supplier_purchase_batch_command_events AS event
  WHERE event.tenant_id = p_tenant_id
    AND event.purchase_batch_id = p_batch_id
    AND event.command_type = 'save_draft'
    AND event.idempotency_key = p_idempotency_key
  FOR UPDATE;
  IF FOUND THEN
    IF v_event.request_fingerprint IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001',
        MESSAGE = 'SUPPLIER_IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN v_event.result || jsonb_build_object('idempotent', true);
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'supplier-purchase-batch-id:' || p_batch_id::text, 6720240826142000
  ));
  SELECT batch.* INTO v_batch
  FROM public.supplier_purchase_batches AS batch
  WHERE batch.id = p_batch_id AND batch.tenant_id = p_tenant_id
  FOR UPDATE;
  v_exists := FOUND;
  RETURN public.record_supplier_purchase_batch_command_result(
    p_tenant_id, p_batch_id, 'save_draft', p_idempotency_key,
    v_fingerprint, v_request, p_actor_user_id, p_actor_employee_id,
    jsonb_build_object('status', 'validation_error',
      'error_code', 'SUPPLIER_PURCHASE_BATCH_LIMIT_EXCEEDED',
      'version', CASE WHEN v_exists AND v_batch.version IS NOT NULL
        THEN v_batch.version ELSE 0 END),
    CASE WHEN v_exists AND v_batch.version IS NOT NULL
      THEN v_batch.version ELSE 0 END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.save_supplier_purchase_batch_draft(
  uuid, uuid, uuid, integer, text, date, text, jsonb, uuid, uuid, text
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_supplier_purchase_batch_draft(
  uuid, uuid, uuid, integer, text, date, text, jsonb, uuid, uuid, text
) TO service_role;

-- Keep the public order contract stable while bringing its final validation
-- onto the tenant-scoped price identity introduced by the v2 price commands.
CREATE OR REPLACE FUNCTION public.submit_supplier_purchase_order(
  p_order_id uuid,
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
  v_event public.supplier_command_events%ROWTYPE;
  v_identity public.supplier_purchase_orders%ROWTYPE;
  v_order public.supplier_purchase_orders%ROWTYPE;
  v_before jsonb;
  v_request jsonb;
  v_eligibility record;
  v_checked_at timestamptz := statement_timestamp();
  v_item_count integer;
  v_item_subtotal numeric;
  v_item_tax numeric;
  v_item_total numeric;
  v_price_mismatch_count integer;
BEGIN
  IF p_order_id IS NULL OR p_tenant_id IS NULL
    OR p_expected_version IS NULL OR p_expected_version <= 0
    OR p_actor_user_id IS NULL OR p_actor_employee_id IS NULL
    OR p_idempotency_key IS NULL OR btrim(p_idempotency_key) = ''
    OR p_idempotency_key <> btrim(p_idempotency_key)
    OR char_length(p_idempotency_key) > 120
  THEN
    RETURN jsonb_build_object('status', 'validation_error',
      'error_code', 'SUPPLIER_PURCHASE_ORDER_VALIDATION_ERROR');
  END IF;
  PERFORM public.assert_supplier_purchase_order_actor(
    p_tenant_id, p_actor_user_id, p_actor_employee_id
  );
  v_request := jsonb_build_object(
    'tenant_id', p_tenant_id, 'order_id', p_order_id,
    'expected_version', p_expected_version,
    'actor_employee_id', p_actor_employee_id
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'supplier-command:' || p_actor_user_id::text || ':' ||
      p_idempotency_key, 0
  ));
  SELECT event.* INTO v_event
  FROM public.supplier_command_events AS event
  WHERE event.actor_user_id = p_actor_user_id
    AND event.idempotency_key = p_idempotency_key
  FOR UPDATE;
  IF FOUND THEN
    IF v_event.tenant_id IS DISTINCT FROM p_tenant_id
      OR v_event.resource_type <> 'supplier_purchase_order'
      OR v_event.resource_id <> p_order_id
      OR v_event.command <> 'submit_supplier_purchase_order'
      OR v_event.from_state -> '_request' IS DISTINCT FROM v_request
    THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001',
        MESSAGE = 'SUPPLIER_IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN jsonb_build_object('status', 'submitted', 'idempotent', true,
      'purchase_order', v_event.to_state, 'version', v_event.result_version);
  END IF;

  -- Draft identity columns are immutable. Read them before taking the stable
  -- relationship/price locks, then re-read the order FOR UPDATE below.
  SELECT purchase_order.* INTO v_identity
  FROM public.supplier_purchase_orders AS purchase_order
  WHERE purchase_order.id = p_order_id
    AND purchase_order.tenant_id = p_tenant_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'not_found',
      'error_code', 'SUPPLIER_PURCHASE_ORDER_NOT_FOUND');
  END IF;
  PERFORM project.id FROM public.projects AS project
  WHERE project.id = v_identity.project_id
    AND project.tenant_id = p_tenant_id
  FOR SHARE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'project_invalid',
      'error_code', 'SUPPLIER_PURCHASE_ORDER_PROJECT_INVALID');
  END IF;
  PERFORM relationship.id
  FROM public.tenant_suppliers AS relationship
  JOIN public.suppliers AS supplier
    ON supplier.id = relationship.supplier_id
  WHERE relationship.id = v_identity.tenant_supplier_id
    AND relationship.tenant_id = p_tenant_id
    AND relationship.supplier_id = v_identity.supplier_id
    AND relationship.default_currency = 'CNY'
  FOR SHARE OF relationship, supplier;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'supplier_not_eligible',
      'error_code', 'SUPPLIER_ORDER_NOT_ELIGIBLE');
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'supplier-price-publish:' || p_tenant_id::text || ':' ||
      v_identity.supplier_id::text,
    6720240729160000
  ));

  SELECT purchase_order.* INTO v_order
  FROM public.supplier_purchase_orders AS purchase_order
  WHERE purchase_order.id = p_order_id
    AND purchase_order.tenant_id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'not_found',
      'error_code', 'SUPPLIER_PURCHASE_ORDER_NOT_FOUND');
  END IF;
  IF v_order.project_id IS DISTINCT FROM v_identity.project_id
    OR v_order.tenant_supplier_id IS DISTINCT FROM v_identity.tenant_supplier_id
    OR v_order.supplier_id IS DISTINCT FROM v_identity.supplier_id
    OR v_order.status <> 'draft'
  THEN
    RETURN jsonb_build_object('status', 'state_conflict',
      'error_code', 'SUPPLIER_PURCHASE_ORDER_STATE_CONFLICT');
  END IF;
  IF v_order.version <> p_expected_version THEN
    RETURN jsonb_build_object('status', 'version_conflict',
      'error_code', 'SUPPLIER_PURCHASE_ORDER_VERSION_CONFLICT',
      'version', v_order.version);
  END IF;
  SELECT eligibility.* INTO v_eligibility
  FROM public.get_tenant_supplier_order_eligibility_set(
    p_tenant_id, v_checked_at, v_order.tenant_supplier_id
  ) AS eligibility;
  IF NOT FOUND OR NOT v_eligibility.eligible
    OR v_eligibility.supplier_id <> v_order.supplier_id
  THEN
    RETURN jsonb_build_object('status', 'supplier_not_eligible',
      'error_code', 'SUPPLIER_ORDER_NOT_ELIGIBLE');
  END IF;

  SELECT count(*)::integer,
    COALESCE(sum(item.subtotal_amount), 0),
    COALESCE(sum(item.tax_amount), 0),
    COALESCE(sum(item.total_amount), 0)
  INTO v_item_count, v_item_subtotal, v_item_tax, v_item_total
  FROM public.supplier_purchase_order_items AS item
  WHERE item.supplier_purchase_order_id = p_order_id
    AND item.tenant_id = p_tenant_id
    AND item.supplier_id = v_order.supplier_id;
  IF v_item_count = 0 OR v_item_subtotal IS DISTINCT FROM v_order.subtotal_amount
    OR v_item_tax IS DISTINCT FROM v_order.tax_amount
    OR v_item_total IS DISTINCT FROM v_order.total_amount
  THEN
    RETURN jsonb_build_object('status', 'state_conflict',
      'error_code', 'SUPPLIER_PURCHASE_ORDER_STATE_CONFLICT');
  END IF;

  WITH locked_candidates AS MATERIALIZED (
    SELECT order_item.id AS order_item_id,
      price_item.id AS supplier_price_list_item_id,
      price_list.id AS supplier_price_list_id,
      price_item.supplier_product_id, price_item.supplier_sku_id,
      price_item.purchase_unit_id, price_item.base_unit_id,
      price_item.base_unit_conversion, price_item.unit_price,
      price_item.tax_rate, price_item.tax_inclusive,
      price_list.price_list_code, price_list.version_number,
      price_list.effective_from, price_list.effective_until,
      product.product_code, product.name AS product_name,
      sku.sku_code, sku.name AS sku_name, sku.specification, sku.model,
      purchase_unit.code AS purchase_unit_code,
      purchase_unit.name AS purchase_unit_name,
      purchase_unit.symbol AS purchase_unit_symbol,
      base_unit.code AS base_unit_code,
      base_unit.name AS base_unit_name,
      base_unit.symbol AS base_unit_symbol,
      CASE WHEN price_item.tax_inclusive THEN
        round(round(order_item.quantity * price_item.unit_price, 2) /
          (1 + price_item.tax_rate), 2)
      ELSE round(order_item.quantity * price_item.unit_price, 2)
      END AS subtotal_amount,
      CASE WHEN price_item.tax_inclusive THEN
        round(order_item.quantity * price_item.unit_price, 2) -
          round(round(order_item.quantity * price_item.unit_price, 2) /
            (1 + price_item.tax_rate), 2)
      ELSE round(round(order_item.quantity * price_item.unit_price, 2) *
        price_item.tax_rate, 2)
      END AS tax_amount,
      CASE WHEN price_item.tax_inclusive THEN
        round(order_item.quantity * price_item.unit_price, 2)
      ELSE round(order_item.quantity * price_item.unit_price, 2) +
        round(round(order_item.quantity * price_item.unit_price, 2) *
          price_item.tax_rate, 2)
      END AS total_amount
    FROM public.supplier_purchase_order_items AS order_item
    JOIN public.supplier_price_list_items AS price_item
      ON price_item.tenant_id = p_tenant_id
      AND price_item.supplier_id = order_item.supplier_id
      AND price_item.supplier_sku_id = order_item.supplier_sku_id
      AND price_item.supplier_product_id = order_item.supplier_product_id
    JOIN public.supplier_price_lists AS price_list
      ON price_list.id = price_item.supplier_price_list_id
      AND price_list.tenant_id = p_tenant_id
      AND price_list.tenant_supplier_id = v_order.tenant_supplier_id
      AND price_list.supplier_id = order_item.supplier_id
    JOIN public.supplier_skus AS sku
      ON sku.id = price_item.supplier_sku_id
      AND sku.supplier_id = price_item.supplier_id
      AND sku.supplier_product_id = price_item.supplier_product_id
      AND sku.status = 'active'
    JOIN public.supplier_products AS product
      ON product.id = price_item.supplier_product_id
      AND product.supplier_id = price_item.supplier_id
      AND product.status = 'active'
    JOIN public.catalog_categories AS category
      ON category.id = product.category_id AND category.status = 'active'
    JOIN public.catalog_brands AS brand
      ON brand.id = product.brand_id AND brand.status = 'active'
    JOIN public.catalog_units AS purchase_unit
      ON purchase_unit.id = price_item.purchase_unit_id
      AND purchase_unit.status = 'active'
    JOIN public.catalog_units AS base_unit
      ON base_unit.id = price_item.base_unit_id
      AND base_unit.status = 'active'
    JOIN public.suppliers AS supplier ON supplier.id = price_item.supplier_id
    WHERE order_item.supplier_purchase_order_id = p_order_id
      AND order_item.tenant_id = p_tenant_id
      AND order_item.supplier_id = v_order.supplier_id
      AND price_list.lifecycle_status = 'published'
      AND price_list.scope_type = 'default'
      AND price_list.currency = 'CNY'
      AND price_list.effective_from <= v_checked_at
      AND (price_list.effective_until IS NULL
        OR price_list.effective_until > v_checked_at)
      AND ((supplier.ownership_scope = 'platform'
          AND supplier.owner_tenant_id IS NULL)
        OR (supplier.ownership_scope = 'tenant'
          AND supplier.owner_tenant_id = p_tenant_id))
      AND product.ownership_scope = sku.ownership_scope
      AND product.owner_tenant_id IS NOT DISTINCT FROM sku.owner_tenant_id
      AND ((product.ownership_scope = 'platform'
          AND product.owner_tenant_id IS NULL)
        OR (product.ownership_scope = 'tenant'
          AND product.owner_tenant_id = p_tenant_id))
      AND ((category.ownership_scope = 'platform'
          AND category.owner_tenant_id IS NULL)
        OR (category.ownership_scope = 'tenant'
          AND category.owner_tenant_id = p_tenant_id))
      AND ((brand.ownership_scope = 'platform'
          AND brand.owner_tenant_id IS NULL)
        OR (brand.ownership_scope = 'tenant'
          AND brand.owner_tenant_id = p_tenant_id))
      AND sku.purchase_unit_id = price_item.purchase_unit_id
      AND sku.base_unit_id = price_item.base_unit_id
      AND sku.base_unit_conversion = price_item.base_unit_conversion
    ORDER BY order_item.id, price_item.id
    FOR SHARE OF price_item, price_list, sku, product, category, brand,
      purchase_unit, base_unit, supplier
  ), candidates AS MATERIALIZED (
    SELECT locked.*,
      count(*) OVER (PARTITION BY locked.order_item_id) AS candidate_count
    FROM locked_candidates AS locked
  ), current_price_candidates AS MATERIALIZED (
    SELECT candidate.* FROM candidates AS candidate
    WHERE candidate.candidate_count = 1
  )
  SELECT count(*) FILTER (WHERE current.order_item_id IS NULL OR
    current.supplier_price_list_item_id IS DISTINCT FROM
      order_item.supplier_price_list_item_id OR
    current.supplier_price_list_id IS DISTINCT FROM
      order_item.supplier_price_list_id OR
    current.supplier_product_id IS DISTINCT FROM order_item.supplier_product_id OR
    current.supplier_sku_id IS DISTINCT FROM order_item.supplier_sku_id OR
    current.unit_price IS DISTINCT FROM order_item.unit_price OR
    current.tax_rate IS DISTINCT FROM order_item.tax_rate OR
    current.tax_inclusive IS DISTINCT FROM order_item.tax_inclusive OR
    current.purchase_unit_id IS DISTINCT FROM order_item.purchase_unit_id OR
    current.base_unit_id IS DISTINCT FROM order_item.base_unit_id OR
    current.base_unit_conversion IS DISTINCT FROM order_item.base_unit_conversion OR
    current.price_list_code IS DISTINCT FROM order_item.price_list_code_snapshot OR
    current.version_number IS DISTINCT FROM order_item.price_list_version_snapshot OR
    current.effective_from IS DISTINCT FROM order_item.price_effective_from_snapshot OR
    current.effective_until IS DISTINCT FROM order_item.price_effective_until_snapshot OR
    current.product_code IS DISTINCT FROM order_item.product_code_snapshot OR
    current.product_name IS DISTINCT FROM order_item.product_name_snapshot OR
    current.sku_code IS DISTINCT FROM order_item.sku_code_snapshot OR
    current.sku_name IS DISTINCT FROM order_item.sku_name_snapshot OR
    current.specification IS DISTINCT FROM order_item.specification_snapshot OR
    current.model IS DISTINCT FROM order_item.model_snapshot OR
    current.purchase_unit_code IS DISTINCT FROM order_item.purchase_unit_code_snapshot OR
    current.purchase_unit_name IS DISTINCT FROM order_item.purchase_unit_name_snapshot OR
    current.purchase_unit_symbol IS DISTINCT FROM order_item.purchase_unit_symbol_snapshot OR
    current.base_unit_code IS DISTINCT FROM order_item.base_unit_code_snapshot OR
    current.base_unit_name IS DISTINCT FROM order_item.base_unit_name_snapshot OR
    current.base_unit_symbol IS DISTINCT FROM order_item.base_unit_symbol_snapshot OR
    current.subtotal_amount IS DISTINCT FROM order_item.subtotal_amount OR
    current.tax_amount IS DISTINCT FROM order_item.tax_amount OR
    current.total_amount IS DISTINCT FROM order_item.total_amount)::integer
  INTO v_price_mismatch_count
  FROM public.supplier_purchase_order_items AS order_item
  LEFT JOIN current_price_candidates AS current
    ON current.order_item_id = order_item.id
  WHERE order_item.supplier_purchase_order_id = p_order_id
    AND order_item.tenant_id = p_tenant_id;
  IF v_price_mismatch_count > 0 THEN
    RETURN jsonb_build_object('status', 'price_changed',
      'error_code', 'SUPPLIER_PURCHASE_ORDER_PRICE_CHANGED');
  END IF;

  v_before := public.supplier_purchase_order_snapshot(v_order);
  UPDATE public.supplier_purchase_orders AS purchase_order
  SET status = 'submitted', submitted_by_employee_id = p_actor_employee_id,
      submitted_at = v_checked_at, version = purchase_order.version + 1,
      updated_by_employee_id = p_actor_employee_id, updated_at = v_checked_at
  WHERE purchase_order.id = p_order_id
    AND purchase_order.tenant_id = p_tenant_id
  RETURNING * INTO v_order;
  INSERT INTO public.supplier_command_events(
    tenant_id, resource_type, resource_id, command, from_state, to_state,
    actor_user_id, actor_employee_id, idempotency_key, result_version
  ) VALUES (
    p_tenant_id, 'supplier_purchase_order', p_order_id,
    'submit_supplier_purchase_order',
    v_before || jsonb_build_object('_request', v_request),
    public.supplier_purchase_order_snapshot(v_order),
    p_actor_user_id, p_actor_employee_id, p_idempotency_key, v_order.version
  );
  RETURN jsonb_build_object('status', 'submitted', 'idempotent', false,
    'purchase_order', public.supplier_purchase_order_snapshot(v_order),
    'version', v_order.version);
END;
$$;

CREATE FUNCTION public.convert_supplier_purchase_requisition_for_batch(
  p_batch_id uuid,
  p_tenant_id uuid,
  p_split_generation integer,
  p_requisition_id uuid,
  p_expected_version integer,
  p_order_id uuid,
  p_reviewed_at timestamptz,
  p_actor_user_id uuid,
  p_actor_employee_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_requisition public.supplier_purchase_requisitions%ROWTYPE;
  v_order public.supplier_purchase_orders%ROWTYPE;
  v_item_count integer;
  v_inserted_item_count integer;
BEGIN
  IF p_batch_id IS NULL OR p_tenant_id IS NULL
    OR p_split_generation IS NULL OR p_split_generation <= 0
    OR p_requisition_id IS NULL OR p_expected_version IS NULL
    OR p_expected_version <= 0 OR p_order_id IS NULL
    OR p_reviewed_at IS NULL OR p_actor_user_id IS NULL
    OR p_actor_employee_id IS NULL
  THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_PURCHASE_BATCH_VALIDATION_ERROR';
  END IF;
  SELECT requisition.* INTO v_requisition
  FROM public.supplier_purchase_requisitions AS requisition
  WHERE requisition.id = p_requisition_id
    AND requisition.tenant_id = p_tenant_id
    AND requisition.purchase_batch_id = p_batch_id
    AND requisition.split_generation = p_split_generation
    AND requisition.status = 'pending_approval'
    AND requisition.version = p_expected_version
  FOR UPDATE;
  IF NOT FOUND OR v_requisition.purchase_order_id IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_PURCHASE_BATCH_STATE_CONFLICT';
  END IF;
  IF EXISTS (SELECT 1 FROM public.supplier_purchase_orders WHERE id = p_order_id)
  THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_PURCHASE_ORDER_ID_CONFLICT';
  END IF;

  SELECT count(*)::integer INTO v_item_count
  FROM public.supplier_purchase_requisition_items AS item
  WHERE item.purchase_requisition_id = p_requisition_id
    AND item.tenant_id = p_tenant_id;
  IF v_item_count = 0 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_PURCHASE_BATCH_ITEM_UNAVAILABLE';
  END IF;

  INSERT INTO public.supplier_purchase_orders(
    id, tenant_id, project_id, tenant_supplier_id, supplier_id, order_no,
    status, currency, expected_delivery_date, remark, priced_at,
    subtotal_amount, tax_amount, total_amount, version,
    created_by_employee_id, updated_by_employee_id,
    purchase_requisition_id, purchase_batch_id
  ) VALUES (
    p_order_id, p_tenant_id, v_requisition.project_id,
    v_requisition.tenant_supplier_id, v_requisition.supplier_id,
    'PO-' || to_char(p_reviewed_at, 'YYYYMMDD') || '-' ||
      lpad(nextval('public.supplier_purchase_order_number_seq')::text, 8, '0'),
    'draft', 'CNY', v_requisition.expected_delivery_date,
    v_requisition.remark, v_requisition.priced_at, v_requisition.subtotal_amount,
    v_requisition.tax_amount, v_requisition.total_amount, 1,
    p_actor_employee_id, p_actor_employee_id,
    p_requisition_id, p_batch_id
  ) RETURNING * INTO v_order;

  INSERT INTO public.supplier_purchase_order_items(
    tenant_id, supplier_id, supplier_purchase_order_id, line_no,
    cost_category_id, supplier_product_id, supplier_sku_id,
    supplier_price_list_id, supplier_price_list_item_id,
    product_code_snapshot, product_name_snapshot, sku_code_snapshot,
    sku_name_snapshot, specification_snapshot, model_snapshot,
    purchase_unit_id, purchase_unit_code_snapshot,
    purchase_unit_name_snapshot, purchase_unit_symbol_snapshot,
    base_unit_id, base_unit_code_snapshot, base_unit_name_snapshot,
    base_unit_symbol_snapshot, base_unit_conversion,
    price_list_code_snapshot, price_list_version_snapshot,
    price_effective_from_snapshot, price_effective_until_snapshot,
    quantity, unit_price, tax_rate, tax_inclusive,
    subtotal_amount, tax_amount, total_amount
  ) SELECT
    item.tenant_id, v_requisition.supplier_id, p_order_id, item.line_no,
    item.cost_category_id, item.supplier_product_id, item.supplier_sku_id,
    item.supplier_price_list_id, item.supplier_price_list_item_id,
    item.product_code_snapshot, item.product_name_snapshot,
    item.sku_code_snapshot, item.sku_name_snapshot,
    item.specification_snapshot, item.model_snapshot,
    item.purchase_unit_id, item.purchase_unit_code_snapshot,
    item.purchase_unit_name_snapshot, item.purchase_unit_symbol_snapshot,
    item.base_unit_id, item.base_unit_code_snapshot,
    item.base_unit_name_snapshot, item.base_unit_symbol_snapshot,
    item.base_unit_conversion, item.price_list_code_snapshot,
    item.price_list_version_snapshot, item.price_effective_from_snapshot,
    item.price_effective_until_snapshot, item.quantity, item.unit_price,
    item.tax_rate, item.tax_inclusive, item.line_subtotal_amount,
    item.line_tax_amount, item.line_total_amount
  FROM public.supplier_purchase_requisition_items AS item
  WHERE item.purchase_requisition_id = p_requisition_id
    AND item.tenant_id = p_tenant_id
  ORDER BY item.line_no, item.id;
  GET DIAGNOSTICS v_inserted_item_count = ROW_COUNT;
  IF v_inserted_item_count <> v_item_count THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_PURCHASE_BATCH_ITEM_UNAVAILABLE';
  END IF;

  RETURN jsonb_build_object('status', 'saved', 'idempotent', false,
    'purchase_order_id', v_order.id,
    'purchase_order', public.supplier_purchase_order_snapshot(v_order),
    'version', v_order.version);
END;
$$;

REVOKE ALL ON FUNCTION public.convert_supplier_purchase_requisition_for_batch(
  uuid, uuid, integer, uuid, integer, uuid, timestamptz, uuid, uuid
) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.review_supplier_purchase_batch(
  p_batch_id uuid,
  p_tenant_id uuid,
  p_expected_version integer,
  p_action text,
  p_remark text,
  p_can_override_budget boolean,
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
  v_batch public.supplier_purchase_batches%ROWTYPE;
  v_event public.supplier_purchase_batch_command_events%ROWTYPE;
  v_request jsonb;
  v_fingerprint text;
  v_result jsonb;
  v_reviewed_at timestamptz := statement_timestamp();
  v_supplier_id uuid;
  v_relationship_count integer;
  v_current_price_count integer;
  v_changed_count integer;
  v_child_count integer;
  v_invalid_child_count integer;
  v_child_headers_match boolean;
  v_child_items_match boolean;
  v_commitments_match boolean;
  v_expected_commitment_count integer;
  v_actual_commitment_count integer;
  v_existing_order_count integer;
  v_category_count integer;
  v_active_category_count integer;
  v_budget_status text;
  v_budget_snapshot jsonb;
  v_supplier_blockers jsonb := '[]'::jsonb;
  v_price_blockers jsonb := '[]'::jsonb;
  v_item_blockers jsonb := '[]'::jsonb;
  v_budget_blockers jsonb := '[]'::jsonb;
  v_blockers jsonb := '[]'::jsonb;
  v_requires_revision boolean := false;
  v_revision_code text;
  v_child record;
  v_order_id uuid;
  v_order_result jsonb;
  v_order public.supplier_purchase_orders%ROWTYPE;
  v_requisition_ids jsonb := '[]'::jsonb;
  v_orders jsonb := '[]'::jsonb;
  v_converted_count integer;
  v_distinct_order_count integer;
BEGIN
  IF p_batch_id IS NULL OR p_tenant_id IS NULL
    OR p_expected_version IS NULL OR p_expected_version <= 0
    OR p_action IS NULL OR p_action NOT IN ('approve', 'reject')
    OR p_can_override_budget IS NULL
    OR (p_action = 'reject' AND p_can_override_budget)
    OR (p_action = 'reject' AND (
      p_remark IS NULL OR btrim(p_remark) = ''
      OR char_length(btrim(p_remark)) > 500
    ))
    OR (p_remark IS NOT NULL AND (
      btrim(p_remark) = '' OR char_length(btrim(p_remark)) > 500
    ))
    OR p_actor_user_id IS NULL OR p_actor_employee_id IS NULL
    OR p_idempotency_key IS NULL OR btrim(p_idempotency_key) = ''
    OR p_idempotency_key <> btrim(p_idempotency_key)
    OR char_length(p_idempotency_key) > 120
  THEN
    RETURN jsonb_build_object('status', 'validation_error',
      'idempotent', false,
      'error_code', 'SUPPLIER_PURCHASE_BATCH_VALIDATION_ERROR',
      'version', 0);
  END IF;
  PERFORM public.assert_supplier_purchase_order_actor(
    p_tenant_id, p_actor_user_id, p_actor_employee_id
  );
  v_request := jsonb_build_object(
    'tenant_id', p_tenant_id, 'batch_id', p_batch_id,
    'expected_version', p_expected_version, 'action', p_action,
    'remark', CASE WHEN p_remark IS NULL THEN NULL ELSE btrim(p_remark) END,
    'can_override_budget', p_can_override_budget,
    'actor_user_id', p_actor_user_id,
    'actor_employee_id', p_actor_employee_id
  );
  v_fingerprint := encode(extensions.digest(
    convert_to(v_request::text, 'UTF8'), 'sha256'
  ), 'hex');
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'supplier-purchase-batch-command:' || p_tenant_id::text || ':' ||
      p_batch_id::text || ':review:' || p_idempotency_key,
    6720240826142000
  ));
  SELECT event.* INTO v_event
  FROM public.supplier_purchase_batch_command_events AS event
  WHERE event.tenant_id = p_tenant_id
    AND event.purchase_batch_id = p_batch_id
    AND event.command_type = 'review'
    AND event.idempotency_key = p_idempotency_key
  FOR UPDATE;
  IF FOUND THEN
    IF v_event.request_fingerprint IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001',
        MESSAGE = 'SUPPLIER_IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN v_event.result || jsonb_build_object('idempotent', true);
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'supplier-purchase-batch-id:' || p_batch_id::text, 6720240826142000
  ));
  SELECT batch.* INTO v_batch
  FROM public.supplier_purchase_batches AS batch
  WHERE batch.id = p_batch_id AND batch.tenant_id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN public.record_supplier_purchase_batch_command_result(
      p_tenant_id, p_batch_id, 'review', p_idempotency_key, v_fingerprint,
      v_request, p_actor_user_id, p_actor_employee_id,
      jsonb_build_object('status', 'not_found',
        'error_code', 'SUPPLIER_PURCHASE_BATCH_NOT_FOUND', 'version', 0), 0
    );
  END IF;
  IF v_batch.version <> p_expected_version THEN
    RETURN public.record_supplier_purchase_batch_command_result(
      p_tenant_id, p_batch_id, 'review', p_idempotency_key, v_fingerprint,
      v_request, p_actor_user_id, p_actor_employee_id,
      jsonb_build_object('status', 'version_conflict',
        'error_code', 'SUPPLIER_PURCHASE_BATCH_VERSION_CONFLICT',
        'version', v_batch.version), v_batch.version
    );
  END IF;
  IF v_batch.status <> 'pending_approval' THEN
    RETURN public.record_supplier_purchase_batch_command_result(
      p_tenant_id, p_batch_id, 'review', p_idempotency_key, v_fingerprint,
      v_request, p_actor_user_id, p_actor_employee_id,
      jsonb_build_object('status', 'state_conflict',
        'error_code', 'SUPPLIER_PURCHASE_BATCH_STATE_CONFLICT',
        'version', v_batch.version), v_batch.version
    );
  END IF;
  IF v_batch.created_by_employee_id = p_actor_employee_id
    OR v_batch.submitted_by_employee_id = p_actor_employee_id
  THEN
    RETURN public.record_supplier_purchase_batch_command_result(
      p_tenant_id, p_batch_id, 'review', p_idempotency_key, v_fingerprint,
      v_request, p_actor_user_id, p_actor_employee_id,
      jsonb_build_object('status', 'state_conflict',
        'error_code', 'SUPPLIER_PURCHASE_BATCH_SELF_REVIEW',
        'version', v_batch.version), v_batch.version
    );
  END IF;
  PERFORM project.id FROM public.projects AS project
  WHERE project.id = v_batch.project_id AND project.tenant_id = p_tenant_id
  FOR SHARE;
  IF NOT FOUND THEN
    RETURN public.record_supplier_purchase_batch_command_result(
      p_tenant_id, p_batch_id, 'review', p_idempotency_key, v_fingerprint,
      v_request, p_actor_user_id, p_actor_employee_id,
      jsonb_build_object('status', 'project_invalid',
        'error_code', 'SUPPLIER_PURCHASE_BATCH_PROJECT_INVALID',
        'version', v_batch.version), v_batch.version
    );
  END IF;

  PERFORM relationship.id
  FROM public.tenant_suppliers AS relationship
  JOIN (
    SELECT DISTINCT item.tenant_supplier_id, item.supplier_id
    FROM public.supplier_purchase_batch_items AS item
    WHERE item.tenant_id = p_tenant_id AND item.purchase_batch_id = p_batch_id
  ) AS selected ON selected.tenant_supplier_id = relationship.id
    AND selected.supplier_id = relationship.supplier_id
  WHERE relationship.tenant_id = p_tenant_id
    AND relationship.default_currency = 'CNY'
  ORDER BY relationship.id
  FOR UPDATE OF relationship;
  WITH selected AS MATERIALIZED (
    SELECT DISTINCT item.tenant_supplier_id, item.supplier_id
    FROM public.supplier_purchase_batch_items AS item
    WHERE item.tenant_id = p_tenant_id AND item.purchase_batch_id = p_batch_id
  ), checked_relationships AS MATERIALIZED (
    SELECT selected.tenant_supplier_id, selected.supplier_id,
      relationship.id AS locked_id
    FROM selected LEFT JOIN public.tenant_suppliers AS relationship
      ON relationship.id = selected.tenant_supplier_id
      AND relationship.tenant_id = p_tenant_id
      AND relationship.supplier_id = selected.supplier_id
      AND relationship.default_currency = 'CNY'
  ) SELECT count(locked_id)::integer,
    COALESCE(jsonb_agg(jsonb_build_object(
      'kind', 'supplier',
      'tenant_supplier_id', tenant_supplier_id,
      'supplier_id', supplier_id,
      'reason', 'RELATIONSHIP_OR_CURRENCY_CHANGED'
    ) ORDER BY tenant_supplier_id) FILTER (WHERE locked_id IS NULL), '[]'::jsonb)
  INTO v_relationship_count, v_supplier_blockers
  FROM checked_relationships;

  WITH selected AS MATERIALIZED (
    SELECT DISTINCT item.tenant_supplier_id, item.supplier_id
    FROM public.supplier_purchase_batch_items AS item
    WHERE item.tenant_id = p_tenant_id AND item.purchase_batch_id = p_batch_id
  )
  SELECT v_supplier_blockers || COALESCE(jsonb_agg(jsonb_build_object(
      'kind', 'supplier',
      'tenant_supplier_id', selected.tenant_supplier_id,
      'supplier_id', selected.supplier_id,
      'reason', 'SUPPLIER_NOT_ELIGIBLE'
    ) ORDER BY selected.tenant_supplier_id) FILTER (
      WHERE eligibility.tenant_supplier_id IS NULL OR NOT eligibility.eligible
    ), '[]'::jsonb)
  INTO v_supplier_blockers
  FROM selected
  LEFT JOIN public.get_tenant_supplier_order_eligibility_set(
    p_tenant_id, v_reviewed_at, NULL
  ) AS eligibility
    ON eligibility.tenant_supplier_id = selected.tenant_supplier_id
    AND eligibility.supplier_id = selected.supplier_id;

  FOR v_supplier_id IN
    SELECT DISTINCT item.supplier_id
    FROM public.supplier_purchase_batch_items AS item
    WHERE item.tenant_id = p_tenant_id AND item.purchase_batch_id = p_batch_id
    ORDER BY item.supplier_id
  LOOP
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
      'supplier-price-publish:' || p_tenant_id::text || ':' ||
        v_supplier_id::text,
      6720240729160000
    ));
  END LOOP;

  WITH frozen AS MATERIALIZED (
    SELECT item.* FROM public.supplier_purchase_batch_items AS item
    WHERE item.tenant_id = p_tenant_id AND item.purchase_batch_id = p_batch_id
  ), locked_current_candidates AS MATERIALIZED (
    SELECT frozen.id AS frozen_id,
      price_item.id AS supplier_price_list_item_id,
      price_item.supplier_price_list_id, price_item.supplier_product_id,
      price_item.supplier_sku_id, price_item.purchase_unit_id,
      price_item.base_unit_id, price_item.base_unit_conversion,
      price_item.unit_price, price_item.tax_rate, price_item.tax_inclusive,
      price_list.price_list_code, price_list.version_number,
      price_list.effective_from, price_list.effective_until,
      product.product_code, product.name AS product_name,
      product.category_id, category.name AS category_name,
      product.brand_id, brand.name AS brand_name,
      sku.sku_code, sku.name AS sku_name, sku.specification, sku.model,
      purchase_unit.code AS purchase_unit_code,
      purchase_unit.name AS purchase_unit_name,
      purchase_unit.symbol AS purchase_unit_symbol,
      base_unit.code AS base_unit_code, base_unit.name AS base_unit_name,
      base_unit.symbol AS base_unit_symbol, supplier.name AS supplier_name,
      CASE WHEN price_item.tax_inclusive THEN
        round(round(frozen.quantity * price_item.unit_price, 2) /
          (1 + price_item.tax_rate), 2)
      ELSE round(frozen.quantity * price_item.unit_price, 2) END
        AS line_subtotal_amount,
      CASE WHEN price_item.tax_inclusive THEN
        round(frozen.quantity * price_item.unit_price, 2) -
          round(round(frozen.quantity * price_item.unit_price, 2) /
            (1 + price_item.tax_rate), 2)
      ELSE round(round(frozen.quantity * price_item.unit_price, 2) *
        price_item.tax_rate, 2) END AS line_tax_amount,
      CASE WHEN price_item.tax_inclusive THEN
        round(frozen.quantity * price_item.unit_price, 2)
      ELSE round(frozen.quantity * price_item.unit_price, 2) +
        round(round(frozen.quantity * price_item.unit_price, 2) *
          price_item.tax_rate, 2) END AS line_total_amount
    FROM frozen
    JOIN public.supplier_price_list_items AS price_item
      ON price_item.tenant_id = p_tenant_id
      AND price_item.supplier_sku_id = frozen.supplier_sku_id
      AND price_item.supplier_id = frozen.supplier_id
      AND price_item.supplier_product_id = frozen.supplier_product_id
    JOIN public.supplier_price_lists AS price_list
      ON price_list.id = price_item.supplier_price_list_id
      AND price_list.tenant_id = p_tenant_id
      AND price_list.tenant_supplier_id = frozen.tenant_supplier_id
      AND price_list.supplier_id = frozen.supplier_id
    JOIN public.tenant_suppliers AS relationship
      ON relationship.id = frozen.tenant_supplier_id
      AND relationship.tenant_id = p_tenant_id
      AND relationship.supplier_id = frozen.supplier_id
      AND relationship.default_currency = 'CNY'
    JOIN public.supplier_skus AS sku
      ON sku.id = price_item.supplier_sku_id
      AND sku.supplier_id = price_item.supplier_id
      AND sku.supplier_product_id = price_item.supplier_product_id
      AND sku.status = 'active'
    JOIN public.supplier_products AS product
      ON product.id = price_item.supplier_product_id
      AND product.supplier_id = price_item.supplier_id
      AND product.status = 'active'
    JOIN public.catalog_categories AS category
      ON category.id = product.category_id AND category.status = 'active'
    JOIN public.catalog_brands AS brand
      ON brand.id = product.brand_id AND brand.status = 'active'
    JOIN public.catalog_units AS purchase_unit
      ON purchase_unit.id = price_item.purchase_unit_id
      AND purchase_unit.status = 'active'
    JOIN public.catalog_units AS base_unit
      ON base_unit.id = price_item.base_unit_id
      AND base_unit.status = 'active'
    JOIN public.suppliers AS supplier ON supplier.id = frozen.supplier_id
    WHERE price_list.lifecycle_status = 'published'
      AND price_list.scope_type = 'default' AND price_list.currency = 'CNY'
      AND price_list.effective_from <= v_reviewed_at
      AND (price_list.effective_until IS NULL
        OR price_list.effective_until > v_reviewed_at)
      AND ((supplier.ownership_scope = 'platform'
          AND supplier.owner_tenant_id IS NULL)
        OR (supplier.ownership_scope = 'tenant'
          AND supplier.owner_tenant_id = p_tenant_id))
      AND product.ownership_scope = sku.ownership_scope
      AND product.owner_tenant_id IS NOT DISTINCT FROM sku.owner_tenant_id
      AND ((product.ownership_scope = 'platform'
          AND product.owner_tenant_id IS NULL)
        OR (product.ownership_scope = 'tenant'
          AND product.owner_tenant_id = p_tenant_id))
      AND ((category.ownership_scope = 'platform'
          AND category.owner_tenant_id IS NULL)
        OR (category.ownership_scope = 'tenant'
          AND category.owner_tenant_id = p_tenant_id))
      AND ((brand.ownership_scope = 'platform'
          AND brand.owner_tenant_id IS NULL)
        OR (brand.ownership_scope = 'tenant'
          AND brand.owner_tenant_id = p_tenant_id))
      AND sku.purchase_unit_id = price_item.purchase_unit_id
      AND sku.base_unit_id = price_item.base_unit_id
      AND sku.base_unit_conversion = price_item.base_unit_conversion
    ORDER BY frozen.id, price_item.id
    FOR SHARE OF price_item, price_list, relationship, sku, product,
      category, brand, purchase_unit, base_unit, supplier
  ), candidates AS MATERIALIZED (
    SELECT locked.*,
      count(*) OVER (PARTITION BY locked.frozen_id) AS candidate_count
    FROM locked_current_candidates AS locked
  ), current_prices AS MATERIALIZED (
    SELECT candidate.* FROM candidates AS candidate
    WHERE candidate.candidate_count = 1
  ), comparisons AS MATERIALIZED (
    SELECT frozen.*, current.frozen_id AS current_frozen_id,
      current.unit_price AS current_unit_price,
      current.version_number AS current_price_version,
      (current.frozen_id IS NULL
        OR current.supplier_price_list_item_id IS DISTINCT FROM frozen.supplier_price_list_item_id
        OR current.supplier_price_list_id IS DISTINCT FROM frozen.supplier_price_list_id
        OR current.supplier_product_id IS DISTINCT FROM frozen.supplier_product_id
        OR current.supplier_sku_id IS DISTINCT FROM frozen.supplier_sku_id
        OR current.unit_price IS DISTINCT FROM frozen.unit_price
        OR current.tax_rate IS DISTINCT FROM frozen.tax_rate
        OR current.tax_inclusive IS DISTINCT FROM frozen.tax_inclusive
        OR current.purchase_unit_id IS DISTINCT FROM frozen.purchase_unit_id
        OR current.base_unit_id IS DISTINCT FROM frozen.base_unit_id
        OR current.base_unit_conversion IS DISTINCT FROM frozen.base_unit_conversion
        OR current.price_list_code IS DISTINCT FROM frozen.price_list_code_snapshot
        OR current.version_number IS DISTINCT FROM frozen.price_list_version_snapshot
        OR current.effective_from IS DISTINCT FROM frozen.price_effective_from_snapshot
        OR current.effective_until IS DISTINCT FROM frozen.price_effective_until_snapshot
        OR current.product_code IS DISTINCT FROM frozen.product_code_snapshot
        OR current.product_name IS DISTINCT FROM frozen.product_name_snapshot
        OR current.category_id IS DISTINCT FROM frozen.catalog_category_id
        OR current.category_name IS DISTINCT FROM frozen.category_name_snapshot
        OR current.brand_id IS DISTINCT FROM frozen.brand_id
        OR current.brand_name IS DISTINCT FROM frozen.brand_name_snapshot
        OR current.sku_code IS DISTINCT FROM frozen.sku_code_snapshot
        OR current.sku_name IS DISTINCT FROM frozen.sku_name_snapshot
        OR current.specification IS DISTINCT FROM frozen.specification_snapshot
        OR current.model IS DISTINCT FROM frozen.model_snapshot
        OR current.purchase_unit_code IS DISTINCT FROM frozen.purchase_unit_code_snapshot
        OR current.purchase_unit_name IS DISTINCT FROM frozen.purchase_unit_name_snapshot
        OR current.purchase_unit_symbol IS DISTINCT FROM frozen.purchase_unit_symbol_snapshot
        OR current.base_unit_code IS DISTINCT FROM frozen.base_unit_code_snapshot
        OR current.base_unit_name IS DISTINCT FROM frozen.base_unit_name_snapshot
        OR current.base_unit_symbol IS DISTINCT FROM frozen.base_unit_symbol_snapshot
        OR current.supplier_name IS DISTINCT FROM frozen.supplier_name_snapshot
        OR current.line_subtotal_amount IS DISTINCT FROM frozen.line_subtotal_amount
        OR current.line_tax_amount IS DISTINCT FROM frozen.line_tax_amount
        OR current.line_total_amount IS DISTINCT FROM frozen.line_total_amount) AS changed
    FROM frozen LEFT JOIN current_prices AS current
      ON current.frozen_id = frozen.id
  )
  SELECT count(current_frozen_id)::integer,
    count(*) FILTER (WHERE changed)::integer,
    COALESCE(jsonb_agg(jsonb_build_object(
      'kind', 'price', 'supplier_sku_id', supplier_sku_id,
      'product_name', product_name_snapshot, 'sku_name', sku_name_snapshot,
      'frozen_unit_price', unit_price::text,
      'current_unit_price', current_unit_price::text,
      'frozen_price_version', price_list_version_snapshot,
      'current_price_version', current_price_version
    ) ORDER BY line_no) FILTER (WHERE changed), '[]'::jsonb)
  INTO v_current_price_count, v_changed_count, v_price_blockers
  FROM comparisons;
  IF v_relationship_count <> v_batch.supplier_count
    OR jsonb_array_length(v_supplier_blockers) > 0
    OR v_current_price_count <> v_batch.item_count OR v_changed_count > 0
  THEN v_requires_revision := true; END IF;

  PERFORM public.lock_project_cost_budget_scope(p_tenant_id, v_batch.project_id);
  PERFORM finance_category.id
  FROM public.finance_cost_categories AS finance_category
  WHERE finance_category.tenant_id = p_tenant_id
    AND finance_category.status = 'active'
    AND finance_category.id IN (
      SELECT item.cost_category_id
      FROM public.supplier_purchase_batch_items AS item
      WHERE item.tenant_id = p_tenant_id AND item.purchase_batch_id = p_batch_id
    )
  ORDER BY finance_category.id FOR UPDATE;
  SELECT count(DISTINCT item.cost_category_id)::integer,
    count(DISTINCT finance_category.id)::integer
  INTO v_category_count, v_active_category_count
  FROM public.supplier_purchase_batch_items AS item
  LEFT JOIN public.finance_cost_categories AS finance_category
    ON finance_category.id = item.cost_category_id
    AND finance_category.tenant_id = item.tenant_id
    AND finance_category.status = 'active'
  WHERE item.tenant_id = p_tenant_id AND item.purchase_batch_id = p_batch_id;
  IF v_active_category_count <> v_category_count THEN
    v_requires_revision := true;
    SELECT v_item_blockers || COALESCE(jsonb_agg(jsonb_build_object(
      'kind', 'item', 'supplier_sku_id', item.supplier_sku_id,
      'reason', 'COST_CATEGORY_CHANGED'
    ) ORDER BY item.line_no) FILTER (WHERE finance_category.id IS NULL),
      '[]'::jsonb)
    INTO v_item_blockers
    FROM public.supplier_purchase_batch_items AS item
    LEFT JOIN public.finance_cost_categories AS finance_category
      ON finance_category.id = item.cost_category_id
      AND finance_category.tenant_id = item.tenant_id
      AND finance_category.status = 'active'
    WHERE item.tenant_id = p_tenant_id AND item.purchase_batch_id = p_batch_id;
  END IF;
  PERFORM budget.id FROM public.project_cost_budgets AS budget
  WHERE budget.tenant_id = p_tenant_id AND budget.project_id = v_batch.project_id
    AND budget.status = 'active' AND budget.cost_category_id IN (
      SELECT item.cost_category_id FROM public.supplier_purchase_batch_items AS item
      WHERE item.tenant_id = p_tenant_id AND item.purchase_batch_id = p_batch_id)
  ORDER BY budget.cost_category_id, budget.id FOR UPDATE;
  PERFORM commitment.id
  FROM public.project_cost_commitments AS commitment
  WHERE commitment.tenant_id = p_tenant_id
    AND ((commitment.project_id = v_batch.project_id
      AND commitment.cost_category_id IN (
        SELECT item.cost_category_id
        FROM public.supplier_purchase_batch_items AS item
        WHERE item.tenant_id = p_tenant_id
          AND item.purchase_batch_id = p_batch_id))
      OR commitment.source_id IN (
        SELECT requisition.id
        FROM public.supplier_purchase_requisitions AS requisition
        WHERE requisition.tenant_id = p_tenant_id
          AND requisition.purchase_batch_id = p_batch_id
          AND requisition.split_generation = v_batch.split_generation))
  ORDER BY commitment.cost_category_id, commitment.id FOR UPDATE;
  PERFORM requisition.id
  FROM public.supplier_purchase_requisitions AS requisition
  WHERE requisition.tenant_id = p_tenant_id
    AND requisition.purchase_batch_id = p_batch_id
    AND requisition.split_generation = v_batch.split_generation
  ORDER BY requisition.tenant_supplier_id, requisition.id
  FOR UPDATE;
  SELECT count(*)::integer,
    count(*) FILTER (WHERE requisition.status <> 'pending_approval'
      OR requisition.purchase_order_id IS NOT NULL)::integer
  INTO v_child_count, v_invalid_child_count
  FROM public.supplier_purchase_requisitions AS requisition
  WHERE requisition.tenant_id = p_tenant_id
    AND requisition.purchase_batch_id = p_batch_id
    AND requisition.split_generation = v_batch.split_generation;
  PERFORM purchase_order.id
  FROM public.supplier_purchase_orders AS purchase_order
  WHERE purchase_order.tenant_id = p_tenant_id
    AND purchase_order.purchase_batch_id = p_batch_id
  ORDER BY purchase_order.tenant_supplier_id, purchase_order.id
  FOR UPDATE;
  SELECT count(*)::integer INTO v_existing_order_count
  FROM public.supplier_purchase_orders AS purchase_order
  WHERE purchase_order.tenant_id = p_tenant_id
    AND purchase_order.purchase_batch_id = p_batch_id;

  SELECT count(*)::integer,
    COALESCE(bool_and(
      requisition.project_id = v_batch.project_id
      AND requisition.status = 'pending_approval'
      AND requisition.purchase_order_id IS NULL
      AND requisition.currency = 'CNY'
      AND requisition.reason = v_batch.reason
      AND requisition.expected_delivery_date IS NOT DISTINCT FROM
        v_batch.expected_delivery_date
      AND requisition.remark IS NOT DISTINCT FROM v_batch.remark
      AND requisition.priced_at = v_batch.priced_at
      AND requisition.budget_status = v_batch.budget_status
      AND requisition.subtotal_amount = totals.subtotal_amount
      AND requisition.tax_amount = totals.tax_amount
      AND requisition.total_amount = totals.total_amount
    ), false) AS child_headers_match
  INTO v_child_count, v_child_headers_match
  FROM public.supplier_purchase_requisitions AS requisition
  JOIN (
    SELECT item.tenant_supplier_id,
      sum(item.line_subtotal_amount)::numeric(18,2) AS subtotal_amount,
      sum(item.line_tax_amount)::numeric(18,2) AS tax_amount,
      sum(item.line_total_amount)::numeric(18,2) AS total_amount
    FROM public.supplier_purchase_batch_items AS item
    WHERE item.tenant_id = p_tenant_id AND item.purchase_batch_id = p_batch_id
    GROUP BY item.tenant_supplier_id
  ) AS totals ON totals.tenant_supplier_id = requisition.tenant_supplier_id
  WHERE requisition.tenant_id = p_tenant_id
    AND requisition.purchase_batch_id = p_batch_id
    AND requisition.split_generation = v_batch.split_generation;

  SELECT NOT EXISTS (
    SELECT 1
    FROM (
      SELECT item.*,
        row_number() OVER (PARTITION BY item.tenant_supplier_id
          ORDER BY item.line_no, item.id)::integer AS expected_line_no
      FROM public.supplier_purchase_batch_items AS item
      WHERE item.tenant_id = p_tenant_id
        AND item.purchase_batch_id = p_batch_id
    ) AS batch_item
    LEFT JOIN public.supplier_purchase_requisitions AS requisition
      ON requisition.tenant_id = batch_item.tenant_id
      AND requisition.purchase_batch_id = batch_item.purchase_batch_id
      AND requisition.split_generation = v_batch.split_generation
      AND requisition.tenant_supplier_id = batch_item.tenant_supplier_id
      AND requisition.supplier_id = batch_item.supplier_id
    LEFT JOIN public.supplier_purchase_requisition_items AS child_item
      ON child_item.tenant_id = requisition.tenant_id
      AND child_item.purchase_requisition_id = requisition.id
      AND child_item.supplier_sku_id = batch_item.supplier_sku_id
    WHERE batch_item.tenant_id = p_tenant_id
      AND batch_item.purchase_batch_id = p_batch_id
      AND (child_item.id IS NULL
        OR child_item.line_no IS DISTINCT FROM batch_item.expected_line_no
        OR child_item.cost_category_id IS DISTINCT FROM batch_item.cost_category_id
        OR child_item.supplier_product_id IS DISTINCT FROM batch_item.supplier_product_id
        OR child_item.supplier_price_list_id IS DISTINCT FROM batch_item.supplier_price_list_id
        OR child_item.supplier_price_list_item_id IS DISTINCT FROM batch_item.supplier_price_list_item_id
        OR child_item.product_code_snapshot IS DISTINCT FROM batch_item.product_code_snapshot
        OR child_item.product_name_snapshot IS DISTINCT FROM batch_item.product_name_snapshot
        OR child_item.sku_code_snapshot IS DISTINCT FROM batch_item.sku_code_snapshot
        OR child_item.sku_name_snapshot IS DISTINCT FROM batch_item.sku_name_snapshot
        OR child_item.specification_snapshot IS DISTINCT FROM batch_item.specification_snapshot
        OR child_item.model_snapshot IS DISTINCT FROM batch_item.model_snapshot
        OR child_item.purchase_unit_id IS DISTINCT FROM batch_item.purchase_unit_id
        OR child_item.purchase_unit_code_snapshot IS DISTINCT FROM batch_item.purchase_unit_code_snapshot
        OR child_item.purchase_unit_name_snapshot IS DISTINCT FROM batch_item.purchase_unit_name_snapshot
        OR child_item.purchase_unit_symbol_snapshot IS DISTINCT FROM batch_item.purchase_unit_symbol_snapshot
        OR child_item.base_unit_id IS DISTINCT FROM batch_item.base_unit_id
        OR child_item.base_unit_code_snapshot IS DISTINCT FROM batch_item.base_unit_code_snapshot
        OR child_item.base_unit_name_snapshot IS DISTINCT FROM batch_item.base_unit_name_snapshot
        OR child_item.base_unit_symbol_snapshot IS DISTINCT FROM batch_item.base_unit_symbol_snapshot
        OR child_item.base_unit_conversion IS DISTINCT FROM batch_item.base_unit_conversion
        OR child_item.price_list_code_snapshot IS DISTINCT FROM batch_item.price_list_code_snapshot
        OR child_item.price_list_version_snapshot IS DISTINCT FROM batch_item.price_list_version_snapshot
        OR child_item.price_effective_from_snapshot IS DISTINCT FROM batch_item.price_effective_from_snapshot
        OR child_item.price_effective_until_snapshot IS DISTINCT FROM batch_item.price_effective_until_snapshot
        OR child_item.quantity IS DISTINCT FROM batch_item.quantity
        OR child_item.unit_price IS DISTINCT FROM batch_item.unit_price
        OR child_item.tax_rate IS DISTINCT FROM batch_item.tax_rate
        OR child_item.tax_inclusive IS DISTINCT FROM batch_item.tax_inclusive
        OR child_item.line_subtotal_amount IS DISTINCT FROM batch_item.line_subtotal_amount
        OR child_item.line_tax_amount IS DISTINCT FROM batch_item.line_tax_amount
        OR child_item.line_total_amount IS DISTINCT FROM batch_item.line_total_amount)
  ) AND (
    SELECT count(*) FROM public.supplier_purchase_requisition_items AS child_item
    JOIN public.supplier_purchase_requisitions AS requisition
      ON requisition.id = child_item.purchase_requisition_id
      AND requisition.tenant_id = child_item.tenant_id
    WHERE requisition.tenant_id = p_tenant_id
      AND requisition.purchase_batch_id = p_batch_id
      AND requisition.split_generation = v_batch.split_generation
  ) = v_batch.item_count AS child_items_match
  INTO v_child_items_match;
  IF v_child_count <> v_batch.supplier_count
    OR NOT v_child_headers_match OR NOT v_child_items_match
  THEN
    v_requires_revision := true;
    SELECT v_item_blockers || COALESCE(jsonb_agg(jsonb_build_object(
      'kind', 'item', 'supplier_sku_id', item.supplier_sku_id,
      'reason', 'CHILD_FROZEN_FACTS_CHANGED'
    ) ORDER BY item.line_no), '[]'::jsonb)
    INTO v_item_blockers
    FROM public.supplier_purchase_batch_items AS item
    WHERE item.tenant_id = p_tenant_id AND item.purchase_batch_id = p_batch_id;
  END IF;

  WITH expected_commitments AS MATERIALIZED (
    SELECT p_tenant_id AS tenant_id, v_batch.project_id AS project_id,
      item.cost_category_id,
      'supplier_purchase_requisition'::text AS source_type,
      requisition.id AS source_id, 'reserved'::text AS status,
      sum(item.line_total_amount)::numeric(18,2) AS amount,
      (v_batch.budget_snapshot -> item.cost_category_id::text ->>
        'budget_amount')::numeric AS budget_amount_snapshot,
      (v_batch.budget_snapshot -> item.cost_category_id::text ->>
        'expense_amount')::numeric AS expense_amount_snapshot,
      (v_batch.budget_snapshot -> item.cost_category_id::text ->>
        'other_commitment_amount')::numeric AS other_commitment_amount_snapshot,
      (v_batch.budget_snapshot -> item.cost_category_id::text ->>
        'available_amount')::numeric AS available_amount_snapshot
    FROM public.supplier_purchase_requisitions AS requisition
    JOIN public.supplier_purchase_requisition_items AS item
      ON item.purchase_requisition_id = requisition.id
      AND item.tenant_id = requisition.tenant_id
    WHERE requisition.tenant_id = p_tenant_id
      AND requisition.purchase_batch_id = p_batch_id
      AND requisition.split_generation = v_batch.split_generation
    GROUP BY requisition.id, item.cost_category_id
  ), actual_commitments AS MATERIALIZED (
    SELECT commitment.*
    FROM public.project_cost_commitments AS commitment
    JOIN public.supplier_purchase_requisitions AS requisition
      ON requisition.id = commitment.source_id
      AND requisition.tenant_id = commitment.tenant_id
    WHERE requisition.tenant_id = p_tenant_id
      AND requisition.purchase_batch_id = p_batch_id
      AND requisition.split_generation = v_batch.split_generation
  ), comparisons AS MATERIALIZED (
    SELECT expected.*, commitment.id AS commitment_id
    FROM expected_commitments AS expected
    LEFT JOIN actual_commitments AS commitment
      ON commitment.tenant_id = expected.tenant_id
      AND commitment.project_id = expected.project_id
      AND commitment.cost_category_id = expected.cost_category_id
      AND commitment.source_type = expected.source_type
      AND commitment.source_id = expected.source_id
      AND commitment.status = expected.status
      AND commitment.amount = expected.amount
      AND commitment.recognized_amount = 0
      AND commitment.budget_amount_snapshot = expected.budget_amount_snapshot
      AND commitment.expense_amount_snapshot = expected.expense_amount_snapshot
      AND commitment.other_commitment_amount_snapshot =
        expected.other_commitment_amount_snapshot
      AND commitment.available_amount_snapshot = expected.available_amount_snapshot
  )
  SELECT (SELECT count(*)::integer FROM expected_commitments),
    (SELECT count(*)::integer FROM actual_commitments),
    COALESCE(bool_and(commitment_id IS NOT NULL), false)
  INTO v_expected_commitment_count, v_actual_commitment_count,
    v_commitments_match
  FROM comparisons;
  v_commitments_match := v_expected_commitment_count > 0
    AND v_expected_commitment_count = v_actual_commitment_count
    AND v_commitments_match;

  IF p_action = 'reject' THEN
    IF v_child_count <> v_batch.supplier_count OR v_invalid_child_count > 0
      OR NOT v_child_headers_match OR NOT v_child_items_match
      OR v_existing_order_count > 0
    THEN
      RETURN public.record_supplier_purchase_batch_command_result(
        p_tenant_id, p_batch_id, 'review', p_idempotency_key, v_fingerprint,
        v_request, p_actor_user_id, p_actor_employee_id,
        jsonb_build_object('status', 'state_conflict',
          'error_code', 'SUPPLIER_PURCHASE_BATCH_STATE_CONFLICT',
        'version', v_batch.version), v_batch.version
      );
    END IF;
    IF NOT COALESCE(v_commitments_match, false) THEN
      RETURN public.record_supplier_purchase_batch_command_result(
        p_tenant_id, p_batch_id, 'review', p_idempotency_key, v_fingerprint,
        v_request, p_actor_user_id, p_actor_employee_id,
        jsonb_build_object('status', 'state_conflict',
          'error_code', 'SUPPLIER_PURCHASE_BATCH_STATE_CONFLICT',
          'version', v_batch.version), v_batch.version
      );
    END IF;
    UPDATE public.project_cost_commitments AS commitment
    SET status = 'released', released_by_employee_id = p_actor_employee_id,
      released_at = v_reviewed_at, release_reason = 'batch rejected',
      updated_at = v_reviewed_at
    FROM public.supplier_purchase_requisitions AS requisition
    WHERE requisition.id = commitment.source_id
      AND requisition.tenant_id = p_tenant_id
      AND requisition.purchase_batch_id = p_batch_id
      AND requisition.split_generation = v_batch.split_generation
      AND commitment.status = 'reserved';
    UPDATE public.supplier_purchase_requisitions AS requisition
    SET status = 'rejected', reviewed_by_employee_id = p_actor_employee_id,
      reviewed_at = v_reviewed_at, review_remark = btrim(p_remark),
      updated_by_employee_id = p_actor_employee_id,
      updated_at = v_reviewed_at, version = requisition.version + 1
    WHERE requisition.tenant_id = p_tenant_id
      AND requisition.purchase_batch_id = p_batch_id
      AND requisition.split_generation = v_batch.split_generation
      AND requisition.status = 'pending_approval';
    UPDATE public.supplier_purchase_batches AS batch
    SET status = 'rejected', reviewed_by_employee_id = p_actor_employee_id,
      reviewed_at = v_reviewed_at, review_remark = btrim(p_remark),
      updated_by_employee_id = p_actor_employee_id,
      updated_at = v_reviewed_at, version = batch.version + 1
    WHERE batch.id = p_batch_id AND batch.tenant_id = p_tenant_id
    RETURNING * INTO v_batch;
    v_result := jsonb_build_object('status', 'rejected',
      'batch', public.supplier_purchase_batch_to_jsonb(v_batch),
      'version', v_batch.version);
    RETURN public.record_supplier_purchase_batch_command_result(
      p_tenant_id, p_batch_id, 'review', p_idempotency_key, v_fingerprint,
      v_request, p_actor_user_id, p_actor_employee_id,
      v_result, v_batch.version
    );
  END IF;

  IF v_existing_order_count > 0 THEN
    RETURN public.record_supplier_purchase_batch_command_result(
      p_tenant_id, p_batch_id, 'review', p_idempotency_key, v_fingerprint,
      v_request, p_actor_user_id, p_actor_employee_id,
      jsonb_build_object('status', 'state_conflict',
        'error_code', 'SUPPLIER_PURCHASE_BATCH_STATE_CONFLICT',
        'version', v_batch.version), v_batch.version
    );
  END IF;

  IF NOT COALESCE(v_commitments_match, false) THEN
    v_requires_revision := true;
    SELECT v_item_blockers || COALESCE(jsonb_agg(jsonb_build_object(
        'kind', 'item', 'supplier_sku_id', item.supplier_sku_id,
        'reason', 'BUDGET_COMMITMENT_CHANGED'
      ) ORDER BY item.line_no), '[]'::jsonb)
    INTO v_item_blockers
    FROM public.supplier_purchase_batch_items AS item
    WHERE item.tenant_id = p_tenant_id AND item.purchase_batch_id = p_batch_id;
  END IF;

  WITH requested_by_category AS MATERIALIZED (
    SELECT item.cost_category_id,
      sum(item.line_total_amount)::numeric(18,2) AS amount
    FROM public.supplier_purchase_batch_items AS item
    WHERE item.tenant_id = p_tenant_id AND item.purchase_batch_id = p_batch_id
    GROUP BY item.cost_category_id
  ), current_generation_children AS MATERIALIZED (
    SELECT requisition.id FROM public.supplier_purchase_requisitions AS requisition
    WHERE requisition.tenant_id = p_tenant_id
      AND requisition.purchase_batch_id = p_batch_id
      AND requisition.split_generation = v_batch.split_generation
  ), budget_totals AS MATERIALIZED (
    SELECT requested.cost_category_id,
      COALESCE(max(budget.budget_amount), 0)::numeric(18,2) AS budget_amount
    FROM requested_by_category AS requested
    LEFT JOIN public.project_cost_budgets AS budget
      ON budget.tenant_id = p_tenant_id AND budget.project_id = v_batch.project_id
      AND budget.cost_category_id = requested.cost_category_id
      AND budget.status = 'active'
    GROUP BY requested.cost_category_id
  ), expense_totals AS MATERIALIZED (
    SELECT requested.cost_category_id,
      COALESCE(sum(cost_event.amount), 0)::numeric(18,2) AS expense_amount
    FROM requested_by_category AS requested
    LEFT JOIN public.project_cost_events AS cost_event
      ON cost_event.tenant_id = p_tenant_id
      AND cost_event.project_id = v_batch.project_id
      AND cost_event.cost_category_id = requested.cost_category_id
    GROUP BY requested.cost_category_id
  ), other_commitment_totals AS MATERIALIZED (
    SELECT requested.cost_category_id,
      COALESCE(sum(greatest(commitment.amount - commitment.recognized_amount, 0)), 0)::numeric(18,2)
        AS other_commitment_amount
    FROM requested_by_category AS requested
    LEFT JOIN public.project_cost_commitments AS commitment
      ON commitment.tenant_id = p_tenant_id
      AND commitment.project_id = v_batch.project_id
      AND commitment.cost_category_id = requested.cost_category_id
      AND commitment.status IN ('reserved', 'converted')
      AND commitment.source_id NOT IN (
        SELECT id FROM current_generation_children
      )
    GROUP BY requested.cost_category_id
  ), current_budget AS MATERIALIZED (
    SELECT requested.cost_category_id, requested.amount,
      budget.budget_amount, expense.expense_amount,
      other.other_commitment_amount,
      (budget.budget_amount - expense.expense_amount -
        other.other_commitment_amount)::numeric(18,2) AS available_amount
    FROM requested_by_category AS requested
    JOIN budget_totals AS budget USING (cost_category_id)
    JOIN expense_totals AS expense USING (cost_category_id)
    JOIN other_commitment_totals AS other USING (cost_category_id)
  )
  SELECT CASE WHEN bool_and(amount <= available_amount)
      THEN 'within_budget' ELSE 'over_budget' END,
    jsonb_object_agg(cost_category_id::text, jsonb_build_object(
      'requested_amount', amount::text,
      'budget_amount', budget_amount::text,
      'expense_amount', expense_amount::text,
      'other_commitment_amount', other_commitment_amount::text,
      'available_amount', available_amount::text
    ) ORDER BY cost_category_id)
  INTO v_budget_status, v_budget_snapshot FROM current_budget;

  IF v_budget_snapshot IS DISTINCT FROM v_batch.budget_snapshot
    OR v_budget_status IS DISTINCT FROM v_batch.budget_status
  THEN
    v_requires_revision := true;
    WITH category_ids AS MATERIALIZED (
      SELECT key AS cost_category_id
      FROM jsonb_object_keys(v_batch.budget_snapshot || v_budget_snapshot) AS key
    )
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'kind', 'budget', 'cost_category_id', cost_category_id::uuid,
      'submitted_requested_amount', COALESCE(
        v_batch.budget_snapshot -> cost_category_id ->> 'requested_amount', '0'),
      'current_requested_amount', COALESCE(
        v_budget_snapshot -> cost_category_id ->> 'requested_amount', '0'),
      'submitted_available_amount', COALESCE(
        v_batch.budget_snapshot -> cost_category_id ->> 'available_amount', '0'),
      'current_available_amount', COALESCE(
        v_budget_snapshot -> cost_category_id ->> 'available_amount', '0')
    ) ORDER BY cost_category_id), '[]'::jsonb)
    INTO v_budget_blockers FROM category_ids;
  END IF;

  v_blockers := v_supplier_blockers || v_price_blockers ||
    v_item_blockers || v_budget_blockers;
  IF v_requires_revision THEN
    UPDATE public.project_cost_commitments AS commitment
    SET status = 'released', released_by_employee_id = p_actor_employee_id,
      released_at = v_reviewed_at,
      release_reason = 'batch facts changed before review',
      updated_at = v_reviewed_at
    FROM public.supplier_purchase_requisitions AS requisition
    WHERE requisition.id = commitment.source_id
      AND requisition.tenant_id = p_tenant_id
      AND requisition.purchase_batch_id = p_batch_id
      AND requisition.split_generation = v_batch.split_generation
      AND commitment.status = 'reserved';
    UPDATE public.supplier_purchase_requisitions AS requisition
    SET status = 'draft', budget_status = 'unchecked',
      submitted_by_employee_id = NULL, submitted_at = NULL,
      reviewed_by_employee_id = NULL, reviewed_at = NULL,
      review_remark = NULL, cancelled_by_employee_id = NULL,
      cancelled_at = NULL, cancel_reason = NULL, purchase_order_id = NULL,
      updated_by_employee_id = p_actor_employee_id,
      updated_at = v_reviewed_at, version = requisition.version + 1
    WHERE requisition.tenant_id = p_tenant_id
      AND requisition.purchase_batch_id = p_batch_id
      AND requisition.split_generation = v_batch.split_generation
      AND requisition.status = 'pending_approval';
    UPDATE public.supplier_purchase_batches AS batch
    SET status = 'draft', budget_checked_at = NULL,
      budget_status = 'unchecked', budget_snapshot = '{}'::jsonb,
      submitted_by_employee_id = NULL, submitted_at = NULL,
      reviewed_by_employee_id = NULL, reviewed_at = NULL,
      review_remark = NULL, updated_by_employee_id = p_actor_employee_id,
      updated_at = v_reviewed_at, version = batch.version + 1
    WHERE batch.id = p_batch_id AND batch.tenant_id = p_tenant_id
    RETURNING * INTO v_batch;
    v_revision_code := CASE
      WHEN jsonb_array_length(v_supplier_blockers) > 0
        THEN 'SUPPLIER_PURCHASE_BATCH_SUPPLIER_INELIGIBLE'
      WHEN jsonb_array_length(v_price_blockers) > 0
        THEN 'SUPPLIER_PURCHASE_BATCH_PRICE_CHANGED'
      WHEN jsonb_array_length(v_item_blockers) > 0
        THEN 'SUPPLIER_PURCHASE_BATCH_ITEM_UNAVAILABLE'
      ELSE 'SUPPLIER_PURCHASE_BATCH_BUDGET_CHANGED'
    END;
    v_result := jsonb_build_object(
      'status', 'revision_required', 'error_code', v_revision_code,
      'batch', public.supplier_purchase_batch_to_jsonb(v_batch),
      'details', v_blockers, 'version', v_batch.version
    );
    v_result := public.record_supplier_purchase_batch_command_result(
      p_tenant_id, p_batch_id, 'review', p_idempotency_key, v_fingerprint,
      v_request, p_actor_user_id, p_actor_employee_id,
      v_result, v_batch.version
    );
    RETURN v_result;
  END IF;

  IF v_batch.budget_status = 'over_budget'
    AND NOT p_can_override_budget
  THEN
    RETURN public.record_supplier_purchase_batch_command_result(
      p_tenant_id, p_batch_id, 'review', p_idempotency_key, v_fingerprint,
      v_request, p_actor_user_id, p_actor_employee_id,
      jsonb_build_object('status', 'state_conflict',
        'error_code', 'SUPPLIER_PURCHASE_BATCH_BUDGET_OVERRIDE_REQUIRED',
        'version', v_batch.version), v_batch.version
    );
  END IF;

  FOR v_child IN
    SELECT requisition.*
    FROM public.supplier_purchase_requisitions AS requisition
    WHERE requisition.tenant_id = p_tenant_id
      AND requisition.purchase_batch_id = p_batch_id
      AND requisition.split_generation = v_batch.split_generation
      AND requisition.status = 'pending_approval'
    ORDER BY requisition.tenant_supplier_id, requisition.id
  LOOP
    v_order_id := gen_random_uuid();
    PERFORM public.convert_supplier_purchase_requisition_for_batch(
      p_batch_id, p_tenant_id, v_batch.split_generation, v_child.id,
      v_child.version, v_order_id, v_reviewed_at,
      p_actor_user_id, p_actor_employee_id
    );
    v_order_result := public.submit_supplier_purchase_order(
      v_order_id, p_tenant_id, 1, p_actor_user_id, p_actor_employee_id,
      'supplier-batch-order:' || v_order_id::text
    );
    IF v_order_result ->> 'status' IS DISTINCT FROM 'submitted'
      OR (v_order_result ->> 'idempotent')::boolean IS DISTINCT FROM false
      OR (v_order_result -> 'purchase_order' ->> 'id')::uuid
        IS DISTINCT FROM v_order_id
      OR (v_order_result ->> 'version')::integer IS DISTINCT FROM 2
      OR v_order_result -> 'purchase_order' ->> 'status'
        IS DISTINCT FROM 'submitted'
    THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001',
        MESSAGE = COALESCE(
          v_order_result ->> 'error_code',
          'SUPPLIER_PURCHASE_BATCH_STATE_CONFLICT'
        );
    END IF;
    UPDATE public.supplier_purchase_requisitions AS requisition
    SET status = 'converted', purchase_order_id = v_order_id,
      reviewed_by_employee_id = p_actor_employee_id,
      reviewed_at = v_reviewed_at,
      review_remark = CASE WHEN p_remark IS NULL THEN NULL ELSE btrim(p_remark) END,
      updated_by_employee_id = p_actor_employee_id,
      updated_at = v_reviewed_at, version = requisition.version + 1
    WHERE requisition.id = v_child.id AND requisition.tenant_id = p_tenant_id
      AND requisition.purchase_batch_id = p_batch_id
      AND requisition.split_generation = v_batch.split_generation
      AND requisition.status = 'pending_approval'
      AND requisition.version = v_child.version;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001',
        MESSAGE = 'SUPPLIER_PURCHASE_BATCH_STATE_CONFLICT';
    END IF;
    UPDATE public.project_cost_commitments AS commitment
    SET status = 'converted', updated_at = v_reviewed_at
    WHERE commitment.tenant_id = p_tenant_id
      AND commitment.source_id = v_child.id
      AND commitment.status = 'reserved';
    SELECT purchase_order.* INTO v_order
    FROM public.supplier_purchase_orders AS purchase_order
    WHERE purchase_order.id = v_order_id AND purchase_order.tenant_id = p_tenant_id
      AND purchase_order.purchase_requisition_id = v_child.id
      AND purchase_order.purchase_batch_id = p_batch_id
      AND purchase_order.tenant_supplier_id = v_child.tenant_supplier_id
      AND purchase_order.supplier_id = v_child.supplier_id
      AND purchase_order.status = 'submitted' AND purchase_order.version = 2;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001',
        MESSAGE = 'SUPPLIER_PURCHASE_BATCH_STATE_CONFLICT';
    END IF;
    v_requisition_ids := v_requisition_ids || jsonb_build_array(v_child.id);
    v_orders := v_orders || jsonb_build_array(jsonb_build_object(
      'id', v_order.id, 'order_no', v_order.order_no,
      'tenant_supplier_id', v_order.tenant_supplier_id,
      'supplier_id', v_order.supplier_id,
      'supplier_name', (
        SELECT min(item.supplier_name_snapshot)
        FROM public.supplier_purchase_batch_items AS item
        WHERE item.tenant_id = p_tenant_id
          AND item.purchase_batch_id = p_batch_id
          AND item.tenant_supplier_id = v_order.tenant_supplier_id
      ), 'status', 'submitted'
    ));
  END LOOP;

  SELECT count(*)::integer, count(DISTINCT purchase_order_id)::integer
  INTO v_converted_count, v_distinct_order_count
  FROM public.supplier_purchase_requisitions AS requisition
  WHERE requisition.tenant_id = p_tenant_id
    AND requisition.purchase_batch_id = p_batch_id
    AND requisition.split_generation = v_batch.split_generation
    AND requisition.status = 'converted';
  IF v_converted_count <> v_batch.supplier_count
    OR v_distinct_order_count <> v_batch.supplier_count
  THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_PURCHASE_BATCH_STATE_CONFLICT';
  END IF;
  UPDATE public.supplier_purchase_batches AS batch
  SET status = 'ordered', reviewed_by_employee_id = p_actor_employee_id,
    reviewed_at = v_reviewed_at,
    review_remark = CASE WHEN p_remark IS NULL THEN NULL ELSE btrim(p_remark) END,
    updated_by_employee_id = p_actor_employee_id,
    updated_at = v_reviewed_at, version = batch.version + 1
  WHERE batch.id = p_batch_id AND batch.tenant_id = p_tenant_id
  RETURNING * INTO v_batch;
  v_result := jsonb_build_object('status', 'ordered',
    'batch', public.supplier_purchase_batch_to_jsonb(v_batch),
    'requisition_ids', v_requisition_ids, 'orders', v_orders,
    'version', v_batch.version);
  RETURN public.record_supplier_purchase_batch_command_result(
    p_tenant_id, p_batch_id, 'review', p_idempotency_key, v_fingerprint,
    v_request, p_actor_user_id, p_actor_employee_id,
    v_result, v_batch.version
  );
END;
$$;

REVOKE ALL ON FUNCTION public.review_supplier_purchase_batch(
  uuid, uuid, integer, text, text, boolean, uuid, uuid, text
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.review_supplier_purchase_batch(
  uuid, uuid, integer, text, text, boolean, uuid, uuid, text
) TO service_role;

COMMIT;
