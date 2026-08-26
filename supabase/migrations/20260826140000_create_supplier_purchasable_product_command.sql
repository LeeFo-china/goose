-- Rollback: forward-only. Disable the purchasable-product API route and revoke
-- EXECUTE on command_supplier_purchasable_product_v1 in a reviewed forward
-- migration. Preserve all product, SKU, price-list, item, and command-event
-- rows because published prices may already be referenced by procurement.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

-- Harden the existing read and child command contracts before exposing the
-- composite command. Signatures and response envelopes remain unchanged.
-- Rollback-only smoke plan: seed two active tenant_supplier relationships for
-- one supplier with colliding product/SKU codes or names and separately-priced
-- published lists. Resolve each relationship with the collision keyword;
-- assert every returned list belongs to that tenant and tenant_supplier, then
-- roll back all fixtures. Page size 1 bounds returned rows while total remains
-- intentionally unbounded for ambiguity detection; leave EXPLAIN to Task 6.
CREATE OR REPLACE FUNCTION public.resolve_supplier_purchase_order_catalog(
  p_tenant_id uuid,
  p_tenant_supplier_id uuid,
  p_priced_at timestamptz,
  p_keyword text DEFAULT NULL,
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
  v_supplier_id uuid;
  v_eligibility record;
  v_page integer := GREATEST(COALESCE(p_page, 1), 1);
  v_page_size integer :=
    LEAST(GREATEST(COALESCE(p_page_size, 20), 1), 100);
  v_items jsonb;
  v_total bigint;
BEGIN
  IF p_tenant_id IS NULL
    OR p_tenant_supplier_id IS NULL
    OR p_priced_at IS NULL
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'SUPPLIER_ORDER_NOT_ELIGIBLE';
  END IF;

  SELECT eligibility.*
  INTO v_eligibility
  FROM public.get_tenant_supplier_order_eligibility_set(
    p_tenant_id,
    p_priced_at,
    p_tenant_supplier_id
  ) AS eligibility;

  IF NOT FOUND OR NOT v_eligibility.eligible THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_ORDER_NOT_ELIGIBLE',
      DETAIL = COALESCE(
        array_to_string(v_eligibility.blocking_reasons, ','),
        'tenant_supplier_not_found'
      );
  END IF;
  v_supplier_id := v_eligibility.supplier_id;

  PERFORM relationship.id
  FROM public.tenant_suppliers AS relationship
  WHERE relationship.id = p_tenant_supplier_id
    AND relationship.tenant_id = p_tenant_id
    AND relationship.supplier_id = v_supplier_id
    AND relationship.default_currency = 'CNY';
  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_ORDER_NOT_ELIGIBLE';
  END IF;

  WITH eligible_prices AS MATERIALIZED (
    SELECT
      product.id AS supplier_product_id,
      product.product_code,
      product.name AS product_name,
      sku.id AS supplier_sku_id,
      sku.sku_code,
      sku.name AS sku_name,
      sku.specification,
      sku.model,
      price_list.id AS supplier_price_list_id,
      price_list.price_list_code,
      price_list.version_number AS price_list_version,
      price_list.effective_from,
      price_list.effective_until,
      price_item.id AS supplier_price_list_item_id,
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
      price_item.tax_inclusive
    FROM public.supplier_price_list_items AS price_item
    JOIN public.supplier_price_lists AS price_list
      ON price_list.id = price_item.supplier_price_list_id
      AND price_list.supplier_id = price_item.supplier_id
    JOIN public.supplier_skus AS sku
      ON sku.id = price_item.supplier_sku_id
      AND sku.supplier_id = price_item.supplier_id
    JOIN public.supplier_products AS product
      ON product.id = sku.supplier_product_id
      AND product.supplier_id = sku.supplier_id
    JOIN public.catalog_units AS purchase_unit
      ON purchase_unit.id = price_item.purchase_unit_id
    JOIN public.catalog_units AS base_unit
      ON base_unit.id = price_item.base_unit_id
    WHERE price_item.supplier_id = v_supplier_id
      AND price_list.tenant_id = p_tenant_id
      AND price_list.tenant_supplier_id = p_tenant_supplier_id
      AND price_list.supplier_id = v_supplier_id
      AND price_list.lifecycle_status = 'published'
      AND price_list.scope_type = 'default'
      AND price_list.currency = 'CNY'
      AND price_list.effective_from <= p_priced_at
      AND (
        price_list.effective_until IS NULL
        OR price_list.effective_until > p_priced_at
      )
      AND product.status = 'active'
      AND sku.status = 'active'
      AND (
        NULLIF(btrim(p_keyword), '') IS NULL
        OR product.product_code ILIKE '%' || btrim(p_keyword) || '%'
        OR product.name ILIKE '%' || btrim(p_keyword) || '%'
        OR sku.sku_code ILIKE '%' || btrim(p_keyword) || '%'
        OR sku.name ILIKE '%' || btrim(p_keyword) || '%'
      )
  ),
  page_rows AS MATERIALIZED (
    SELECT eligible_prices.*
    FROM eligible_prices
    ORDER BY
      product_name ASC,
      sku_name ASC,
      supplier_sku_id ASC
    LIMIT v_page_size
    OFFSET (v_page - 1) * v_page_size
  )
  SELECT
    (SELECT count(*) FROM eligible_prices),
    COALESCE(
      (
        SELECT jsonb_agg(to_jsonb(page_rows) ORDER BY
          page_rows.product_name,
          page_rows.sku_name,
          page_rows.supplier_sku_id
        )
        FROM page_rows
      ),
      '[]'::jsonb
    )
  INTO v_total, v_items;

  RETURN jsonb_build_object(
    'items', v_items,
    'total', v_total,
    'page', v_page,
    'page_size', v_page_size
  );
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_supplier_purchase_order_catalog(
  uuid, uuid, timestamptz, text, integer, integer
)
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.resolve_supplier_purchase_order_catalog(
  uuid, uuid, timestamptz, text, integer, integer
)
TO service_role;

CREATE OR REPLACE FUNCTION public.command_supplier_price_list_v2(
  p_action text,
  p_price_list_id uuid,
  p_new_price_list_id uuid,
  p_tenant_id uuid,
  p_tenant_supplier_id uuid,
  p_supplier_id uuid,
  p_expected_version integer,
  p_payload jsonb,
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
  v_replay_resource public.supplier_price_lists%ROWTYPE;
  v_price_list public.supplier_price_lists%ROWTYPE;
  v_new public.supplier_price_lists%ROWTYPE;
  v_resource_id uuid;
  v_before jsonb;
  v_request jsonb;
  v_response jsonb;
  v_effective_from timestamptz;
  v_effective_until timestamptz;
  v_constraint_name text;
BEGIN
  IF p_action NOT IN ('create', 'update', 'publish', 'new_version', 'retire')
    OR p_price_list_id IS NULL
    OR p_tenant_id IS NULL
    OR p_tenant_supplier_id IS NULL
    OR p_supplier_id IS NULL
    OR p_payload IS NULL
    OR jsonb_typeof(p_payload) <> 'object'
    OR p_actor_user_id IS NULL
    OR p_actor_employee_id IS NULL
    OR p_idempotency_key IS NULL
    OR btrim(p_idempotency_key) = ''
    OR char_length(p_idempotency_key) > 120
    OR (p_action = 'create' AND p_expected_version IS NOT NULL)
    OR (p_action <> 'create' AND (
      p_expected_version IS NULL OR p_expected_version < 1
    ))
    OR (p_action = 'new_version' AND p_new_price_list_id IS NULL)
    OR (p_action <> 'new_version' AND p_new_price_list_id IS NOT NULL)
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'SUPPLIER_PRICE_LIST_INVALID_ACTION';
  END IF;

  PERFORM public.assert_supplier_price_v2_context(
    p_tenant_id,
    p_tenant_supplier_id,
    p_supplier_id,
    p_actor_user_id,
    p_actor_employee_id
  );

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'supplier-command:' || p_actor_user_id::text || ':' ||
        btrim(p_idempotency_key),
      0
    )
  );

  IF p_action = 'publish' THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'supplier-price-publish:' || p_tenant_id::text || ':' ||
          p_supplier_id::text,
        6720240729160000
      )
    );
  END IF;

  v_resource_id := CASE
    WHEN p_action = 'new_version' THEN p_new_price_list_id
    ELSE p_price_list_id
  END;

  IF p_action = 'new_version' THEN
    SELECT price_list.*
    INTO v_replay_resource
    FROM public.supplier_price_lists AS price_list
    WHERE price_list.id = v_resource_id
      AND price_list.tenant_id = p_tenant_id
      AND price_list.tenant_supplier_id = p_tenant_supplier_id
      AND price_list.supplier_id = p_supplier_id;
  ELSE
    SELECT price_list.*
    INTO v_replay_resource
    FROM public.supplier_price_lists AS price_list
    WHERE price_list.id = v_resource_id
      AND price_list.tenant_id = p_tenant_id
      AND price_list.tenant_supplier_id = p_tenant_supplier_id
      AND price_list.supplier_id = p_supplier_id
    FOR UPDATE;
  END IF;

  v_request := jsonb_build_object(
    'action', p_action,
    'tenant_id', p_tenant_id,
    'tenant_supplier_id', p_tenant_supplier_id,
    'supplier_id', p_supplier_id,
    'price_list_id', p_price_list_id,
    'new_price_list_id', p_new_price_list_id,
    'expected_version', p_expected_version,
    'payload', p_payload,
    'actor_employee_id', p_actor_employee_id
  );

  SELECT event.*
  INTO v_event
  FROM public.supplier_command_events AS event
  WHERE event.actor_user_id = p_actor_user_id
    AND event.idempotency_key = btrim(p_idempotency_key)
  FOR UPDATE;

  IF FOUND THEN
    IF v_replay_resource.id IS NULL THEN
      RETURN jsonb_build_object(
        'status', 'not_found',
        'error_code', 'SUPPLIER_PRICE_LIST_NOT_FOUND'
      );
    END IF;
    IF v_event.tenant_id IS DISTINCT FROM p_tenant_id
      OR v_event.resource_type <> 'supplier_price_list'
      OR v_event.resource_id <> v_resource_id
      OR v_event.command <> 'supplier_price_list_v2:' || p_action
      OR v_event.from_state -> '_request' IS DISTINCT FROM v_request
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'SUPPLIER_IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN jsonb_set(v_event.to_state, '{idempotent}', 'true'::jsonb, true);
  END IF;

  IF p_action = 'new_version'
    AND v_replay_resource.id IS NOT NULL
  THEN
    RETURN jsonb_build_object(
      'status', 'state_conflict',
      'error_code', 'SUPPLIER_PRICE_LIST_INVALID_ACTION',
      'reason', 'target_already_exists'
    );
  END IF;

  IF p_action NOT IN ('create', 'new_version')
    AND v_replay_resource.id IS NULL
  THEN
    RETURN jsonb_build_object(
      'status', 'not_found',
      'error_code', 'SUPPLIER_PRICE_LIST_NOT_FOUND'
    );
  END IF;

  BEGIN
    IF p_action = 'create' THEN
      IF v_replay_resource.id IS NOT NULL
        OR NULLIF(btrim(p_payload ->> 'price_list_code'), '') IS NULL
        OR NULLIF(btrim(p_payload ->> 'name'), '') IS NULL
        OR COALESCE(p_payload ->> 'currency', '') !~ '^[A-Z]{3}$'
        OR NULLIF(p_payload ->> 'effective_from', '') IS NULL
        OR EXISTS (
          SELECT 1
          FROM jsonb_object_keys(p_payload) AS field(key)
          WHERE field.key NOT IN (
            'price_list_code', 'name', 'currency',
            'effective_from', 'effective_until'
          )
        )
      THEN
        RAISE EXCEPTION USING
          ERRCODE = 'P0001',
          MESSAGE = 'SUPPLIER_PRICE_LIST_INVALID_ACTION';
      END IF;

      v_effective_from := (p_payload ->> 'effective_from')::timestamptz;
      v_effective_until := (p_payload ->> 'effective_until')::timestamptz;
      IF v_effective_until IS NOT NULL
        AND v_effective_until <= v_effective_from
      THEN
        RAISE EXCEPTION USING
          ERRCODE = 'P0001',
          MESSAGE = 'SUPPLIER_PRICE_LIST_INVALID_ACTION';
      END IF;

      PERFORM pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(
          'supplier-price-series:' || p_tenant_id::text || ':' ||
            p_supplier_id::text || ':' ||
            lower(btrim(p_payload ->> 'price_list_code')),
          6720240729160000
        )
      );

      IF EXISTS (
        SELECT 1
        FROM public.supplier_price_lists AS existing
        WHERE existing.tenant_id = p_tenant_id
          AND existing.tenant_supplier_id = p_tenant_supplier_id
          AND existing.supplier_id = p_supplier_id
          AND upper(btrim(existing.price_list_code)) =
            upper(btrim(p_payload ->> 'price_list_code'))
      ) THEN
        RETURN jsonb_build_object(
          'status', 'state_conflict',
          'error_code', 'SUPPLIER_PRICE_LIST_INVALID_ACTION'
        );
      END IF;

      INSERT INTO public.supplier_price_lists (
        id, tenant_id, tenant_supplier_id, supplier_id,
        price_list_code, version_number, scope_type, name, currency,
        lifecycle_status, effective_from, effective_until, row_version,
        acting_tenant_id, acting_employee_id, operation_source, proxy_reason,
        created_by_employee_id, updated_by_employee_id
      ) VALUES (
        p_price_list_id, p_tenant_id, p_tenant_supplier_id, p_supplier_id,
        btrim(p_payload ->> 'price_list_code'), 1, 'default',
        btrim(p_payload ->> 'name'), (p_payload ->> 'currency')::char(3),
        'draft', v_effective_from, v_effective_until, 1,
        p_tenant_id, p_actor_employee_id, 'tenant', NULL,
        p_actor_employee_id, p_actor_employee_id
      ) RETURNING * INTO v_price_list;

      v_before := NULL;
      v_response := jsonb_build_object(
        'status', 'created',
        'idempotent', false,
        'price_list', to_jsonb(v_price_list),
        'version', v_price_list.row_version
      );
    ELSIF p_action = 'new_version' THEN
      SELECT price_list.*
      INTO v_price_list
      FROM public.supplier_price_lists AS price_list
      WHERE price_list.id = p_price_list_id
        AND price_list.tenant_id = p_tenant_id
        AND price_list.tenant_supplier_id = p_tenant_supplier_id
        AND price_list.supplier_id = p_supplier_id
      FOR UPDATE;

      IF NOT FOUND THEN
        RETURN jsonb_build_object(
          'status', 'not_found',
          'error_code', 'SUPPLIER_PRICE_LIST_NOT_FOUND'
        );
      END IF;
      IF v_price_list.row_version <> p_expected_version THEN
        RETURN jsonb_build_object(
          'status', 'version_conflict',
          'error_code', 'SUPPLIER_PRICE_LIST_VERSION_CONFLICT',
          'version', v_price_list.row_version,
          'current_status', v_price_list.lifecycle_status
        );
      END IF;
      IF v_price_list.lifecycle_status NOT IN ('published', 'retired')
        OR p_payload <> '{}'::jsonb
      THEN
        RETURN jsonb_build_object(
          'status', 'state_conflict',
          'error_code', 'SUPPLIER_PRICE_LIST_INVALID_ACTION'
        );
      END IF;

      PERFORM pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(
          'supplier-price-series:' || p_tenant_id::text || ':' ||
            p_supplier_id::text || ':' ||
            lower(btrim(v_price_list.price_list_code)),
          6720240729160000
        )
      );

      IF EXISTS (
        SELECT 1
        FROM public.supplier_price_lists AS draft
        WHERE draft.tenant_id = p_tenant_id
          AND draft.tenant_supplier_id = p_tenant_supplier_id
          AND draft.supplier_id = p_supplier_id
          AND upper(btrim(draft.price_list_code)) =
            upper(btrim(v_price_list.price_list_code))
          AND draft.lifecycle_status = 'draft'
      ) THEN
        RETURN jsonb_build_object(
          'status', 'state_conflict',
          'error_code', 'SUPPLIER_PRICE_LIST_INVALID_ACTION',
          'reason', 'draft_already_exists'
        );
      END IF;

      PERFORM product.id
      FROM public.supplier_price_list_items AS item
      JOIN public.supplier_skus AS sku
        ON sku.id = item.supplier_sku_id
        AND sku.supplier_id = item.supplier_id
      JOIN public.supplier_products AS product
        ON product.id = sku.supplier_product_id
        AND product.supplier_id = sku.supplier_id
      WHERE item.supplier_price_list_id = v_price_list.id
        AND item.tenant_id = p_tenant_id
        AND item.supplier_id = p_supplier_id
      ORDER BY product.id
      FOR SHARE OF product;

      PERFORM sku.id
      FROM public.supplier_price_list_items AS item
      JOIN public.supplier_skus AS sku
        ON sku.id = item.supplier_sku_id
        AND sku.supplier_id = item.supplier_id
      WHERE item.supplier_price_list_id = v_price_list.id
        AND item.tenant_id = p_tenant_id
        AND item.supplier_id = p_supplier_id
      ORDER BY sku.id
      FOR SHARE OF sku;

      IF EXISTS (
        SELECT 1
        FROM public.supplier_price_list_items AS item
        WHERE item.supplier_price_list_id = v_price_list.id
          AND item.tenant_id = p_tenant_id
          AND item.supplier_id = p_supplier_id
          AND NOT EXISTS (
            SELECT 1
            FROM public.supplier_skus AS sku
            JOIN public.supplier_products AS product
              ON product.id = sku.supplier_product_id
              AND product.supplier_id = sku.supplier_id
            WHERE sku.id = item.supplier_sku_id
              AND sku.supplier_id = p_supplier_id
              AND product.id = item.supplier_product_id
              AND sku.status = 'active'
              AND product.status = 'active'
              AND (
                (
                  sku.ownership_scope = 'platform'
                  AND sku.owner_tenant_id IS NULL
                  AND product.ownership_scope = 'platform'
                  AND product.owner_tenant_id IS NULL
                )
                OR (
                  sku.ownership_scope = 'tenant'
                  AND sku.owner_tenant_id = p_tenant_id
                  AND product.ownership_scope = 'tenant'
                  AND product.owner_tenant_id = p_tenant_id
                )
              )
          )
      ) THEN
        RETURN jsonb_build_object(
          'status', 'state_conflict',
          'error_code', 'SUPPLIER_PRICE_LIST_INVALID_ACTION',
          'reason', 'invalid_product_or_sku'
        );
      END IF;

      INSERT INTO public.supplier_price_lists (
        id, tenant_id, tenant_supplier_id, supplier_id,
        price_list_code, version_number, scope_type, name, currency,
        lifecycle_status, effective_from, effective_until,
        supersedes_price_list_id, row_version,
        acting_tenant_id, acting_employee_id, operation_source, proxy_reason,
        created_by_employee_id, updated_by_employee_id
      ) VALUES (
        p_new_price_list_id, p_tenant_id, p_tenant_supplier_id, p_supplier_id,
        v_price_list.price_list_code, v_price_list.version_number + 1,
        v_price_list.scope_type, v_price_list.name, v_price_list.currency,
        'draft', v_price_list.effective_from, v_price_list.effective_until,
        v_price_list.id, 1, p_tenant_id, p_actor_employee_id,
        'tenant', NULL, p_actor_employee_id, p_actor_employee_id
      ) RETURNING * INTO v_new;

      INSERT INTO public.supplier_price_list_items (
        id, tenant_id, supplier_id, supplier_price_list_id,
        supplier_product_id, supplier_sku_id,
        minimum_quantity, maximum_quantity,
        purchase_unit_id, base_unit_id, base_unit_conversion,
        unit_price, tax_rate, tax_inclusive,
        acting_tenant_id, acting_employee_id, operation_source, proxy_reason,
        created_by_employee_id, updated_by_employee_id
      )
      SELECT
        gen_random_uuid(), p_tenant_id, p_supplier_id, v_new.id,
        item.supplier_product_id, item.supplier_sku_id,
        item.minimum_quantity, item.maximum_quantity,
        item.purchase_unit_id, item.base_unit_id, item.base_unit_conversion,
        item.unit_price, item.tax_rate, item.tax_inclusive,
        p_tenant_id, p_actor_employee_id, 'tenant', NULL,
        p_actor_employee_id, p_actor_employee_id
      FROM public.supplier_price_list_items AS item
      WHERE item.supplier_price_list_id = v_price_list.id
        AND item.tenant_id = p_tenant_id
        AND item.supplier_id = p_supplier_id;

      v_before := to_jsonb(v_price_list);
      v_price_list := v_new;
      v_response := jsonb_build_object(
        'status', 'created',
        'idempotent', false,
        'price_list', to_jsonb(v_price_list),
        'version', v_price_list.row_version
      );
    ELSE
      v_price_list := v_replay_resource;
      IF v_price_list.row_version <> p_expected_version THEN
        RETURN jsonb_build_object(
          'status', 'version_conflict',
          'error_code', 'SUPPLIER_PRICE_LIST_VERSION_CONFLICT',
          'version', v_price_list.row_version,
          'current_status', v_price_list.lifecycle_status
        );
      END IF;
      v_before := to_jsonb(v_price_list);

      IF p_action = 'update' THEN
        IF v_price_list.lifecycle_status <> 'draft'
          OR p_payload = '{}'::jsonb
          OR EXISTS (
            SELECT 1
            FROM jsonb_object_keys(p_payload) AS field(key)
            WHERE field.key NOT IN (
              'name', 'currency', 'effective_from', 'effective_until'
            )
          )
        THEN
          RETURN jsonb_build_object(
            'status', 'state_conflict',
            'error_code', 'SUPPLIER_PRICE_LIST_INVALID_ACTION'
          );
        END IF;

        v_effective_from := CASE WHEN p_payload ? 'effective_from'
          THEN (p_payload ->> 'effective_from')::timestamptz
          ELSE v_price_list.effective_from END;
        v_effective_until := CASE WHEN p_payload ? 'effective_until'
          THEN (p_payload ->> 'effective_until')::timestamptz
          ELSE v_price_list.effective_until END;
        IF (p_payload ? 'name' AND NULLIF(btrim(p_payload ->> 'name'), '') IS NULL)
          OR (p_payload ? 'currency' AND
            COALESCE(p_payload ->> 'currency', '') !~ '^[A-Z]{3}$')
          OR v_effective_from IS NULL
          OR (
            v_effective_until IS NOT NULL
            AND v_effective_until <= v_effective_from
          )
        THEN
          RAISE EXCEPTION USING
            ERRCODE = 'P0001',
            MESSAGE = 'SUPPLIER_PRICE_LIST_INVALID_ACTION';
        END IF;

        UPDATE public.supplier_price_lists AS price_list
        SET
          name = CASE WHEN p_payload ? 'name'
            THEN btrim(p_payload ->> 'name') ELSE price_list.name END,
          currency = CASE WHEN p_payload ? 'currency'
            THEN (p_payload ->> 'currency')::char(3)
            ELSE price_list.currency END,
          effective_from = v_effective_from,
          effective_until = v_effective_until,
          row_version = price_list.row_version + 1,
          acting_tenant_id = p_tenant_id,
          acting_employee_id = p_actor_employee_id,
          operation_source = 'tenant',
          proxy_reason = NULL,
          updated_by_employee_id = p_actor_employee_id,
          updated_at = pg_catalog.now()
        WHERE price_list.id = p_price_list_id
        RETURNING * INTO v_price_list;

        v_response := jsonb_build_object(
          'status', 'updated',
          'idempotent', false,
          'price_list', to_jsonb(v_price_list),
          'version', v_price_list.row_version
        );
      ELSIF p_action = 'publish' THEN
        IF v_price_list.lifecycle_status <> 'draft'
          OR p_payload <> '{}'::jsonb
        THEN
          RETURN jsonb_build_object(
            'status', 'state_conflict',
            'error_code', 'SUPPLIER_PRICE_LIST_INVALID_ACTION'
          );
        END IF;
        IF NOT (EXISTS (
          SELECT 1
          FROM public.supplier_price_list_items AS item
          WHERE item.supplier_price_list_id = v_price_list.id
            AND item.tenant_id = p_tenant_id
            AND item.supplier_id = p_supplier_id
        )) THEN
          RETURN jsonb_build_object(
            'status', 'state_conflict',
            'error_code', 'SUPPLIER_PRICE_LIST_INVALID_ACTION',
            'reason', 'empty_price_list'
          );
        END IF;

        PERFORM product.id
        FROM public.supplier_price_list_items AS item
        JOIN public.supplier_skus AS sku
          ON sku.id = item.supplier_sku_id
          AND sku.supplier_id = item.supplier_id
        JOIN public.supplier_products AS product
          ON product.id = sku.supplier_product_id
          AND product.supplier_id = sku.supplier_id
        WHERE item.supplier_price_list_id = v_price_list.id
          AND item.tenant_id = p_tenant_id
          AND item.supplier_id = p_supplier_id
        ORDER BY product.id
        FOR SHARE OF product;

        PERFORM sku.id
        FROM public.supplier_price_list_items AS item
        JOIN public.supplier_skus AS sku
          ON sku.id = item.supplier_sku_id
          AND sku.supplier_id = item.supplier_id
        WHERE item.supplier_price_list_id = v_price_list.id
          AND item.tenant_id = p_tenant_id
          AND item.supplier_id = p_supplier_id
        ORDER BY sku.id
        FOR SHARE OF sku;

        IF EXISTS (
          SELECT 1
          FROM public.supplier_price_list_items AS item
          WHERE item.supplier_price_list_id = v_price_list.id
            AND item.tenant_id = p_tenant_id
            AND item.supplier_id = p_supplier_id
            AND NOT EXISTS (
              SELECT 1
              FROM public.supplier_skus AS sku
              JOIN public.supplier_products AS product
                ON product.id = sku.supplier_product_id
                AND product.supplier_id = sku.supplier_id
              WHERE sku.id = item.supplier_sku_id
                AND sku.supplier_id = p_supplier_id
                AND product.id = item.supplier_product_id
                AND sku.status = 'active'
                AND product.status = 'active'
                AND (
                  (
                    sku.ownership_scope = 'platform'
                    AND sku.owner_tenant_id IS NULL
                    AND product.ownership_scope = 'platform'
                    AND product.owner_tenant_id IS NULL
                  )
                  OR (
                    sku.ownership_scope = 'tenant'
                    AND sku.owner_tenant_id = p_tenant_id
                    AND product.ownership_scope = 'tenant'
                    AND product.owner_tenant_id = p_tenant_id
                  )
                )
            )
        ) THEN
          RETURN jsonb_build_object(
            'status', 'state_conflict',
            'error_code', 'SUPPLIER_PRICE_LIST_INVALID_ACTION',
            'reason', 'invalid_product_or_sku'
          );
        END IF;

        IF EXISTS (
          SELECT 1
          FROM public.supplier_price_list_items AS draft_item
          JOIN public.supplier_price_list_items AS published_item
            ON published_item.supplier_sku_id = draft_item.supplier_sku_id
            AND published_item.tenant_id = p_tenant_id
            AND published_item.supplier_id = p_supplier_id
          JOIN public.supplier_price_lists AS published
            ON published.id = published_item.supplier_price_list_id
            AND published.tenant_id = p_tenant_id
            AND published.tenant_supplier_id = p_tenant_supplier_id
            AND published.supplier_id = p_supplier_id
            AND published.lifecycle_status = 'published'
          WHERE draft_item.supplier_price_list_id = v_price_list.id
            AND published.id <> v_price_list.id
            AND published.effective_from <
              COALESCE(v_price_list.effective_until, 'infinity'::timestamptz)
            AND COALESCE(
              published.effective_until,
              'infinity'::timestamptz
            ) > v_price_list.effective_from
        ) THEN
          RETURN jsonb_build_object(
            'status', 'period_conflict',
            'error_code', 'SUPPLIER_PRICE_PERIOD_CONFLICT'
          );
        END IF;

        UPDATE public.supplier_price_lists AS price_list
        SET
          lifecycle_status = 'published',
          published_at = pg_catalog.now(),
          row_version = price_list.row_version + 1,
          acting_tenant_id = p_tenant_id,
          acting_employee_id = p_actor_employee_id,
          operation_source = 'tenant',
          proxy_reason = NULL,
          updated_by_employee_id = p_actor_employee_id,
          updated_at = pg_catalog.now()
        WHERE price_list.id = p_price_list_id
        RETURNING * INTO v_price_list;

        v_response := jsonb_build_object(
          'status', 'published',
          'idempotent', false,
          'price_list', to_jsonb(v_price_list),
          'version', v_price_list.row_version
        );
      ELSE
        IF v_price_list.lifecycle_status <> 'published'
          OR p_payload <> '{}'::jsonb
        THEN
          RETURN jsonb_build_object(
            'status', 'state_conflict',
            'error_code', 'SUPPLIER_PRICE_LIST_INVALID_ACTION'
          );
        END IF;

        UPDATE public.supplier_price_lists AS price_list
        SET
          lifecycle_status = 'retired',
          row_version = price_list.row_version + 1,
          acting_employee_id = p_actor_employee_id,
          updated_by_employee_id = p_actor_employee_id,
          updated_at = pg_catalog.now()
        WHERE price_list.id = p_price_list_id
        RETURNING * INTO v_price_list;

        v_response := jsonb_build_object(
          'status', 'retired',
          'idempotent', false,
          'price_list', to_jsonb(v_price_list),
          'version', v_price_list.row_version
        );
      END IF;
    END IF;

    INSERT INTO public.supplier_command_events (
      tenant_id, resource_type, resource_id, command,
      from_state, to_state, reason,
      actor_user_id, actor_employee_id, idempotency_key, result_version
    ) VALUES (
      p_tenant_id, 'supplier_price_list', v_resource_id,
      'supplier_price_list_v2:' || p_action,
      COALESCE(v_before, '{}'::jsonb) || jsonb_build_object('_request', v_request),
      v_response, NULL,
      p_actor_user_id, p_actor_employee_id, btrim(p_idempotency_key),
      v_price_list.row_version
    );
  EXCEPTION
    WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS v_constraint_name = CONSTRAINT_NAME;
      IF v_constraint_name IN (
        'supplier_price_lists_pkey',
        'supplier_price_lists_id_supplier_key',
        'supplier_price_lists_id_tenant_supplier_key',
        'supplier_price_lists_tenant_series_version_uidx',
        'supplier_price_lists_tenant_one_draft_uidx',
        'supplier_command_events_actor_user_id_idempotency_key_key'
      ) THEN
        RETURN jsonb_build_object(
          'status', 'state_conflict',
          'error_code', 'SUPPLIER_PRICE_LIST_INVALID_ACTION'
        );
      ELSE
        RAISE;
      END IF;
    WHEN invalid_text_representation OR datetime_field_overflow
      OR numeric_value_out_of_range OR check_violation OR not_null_violation
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'SUPPLIER_PRICE_LIST_INVALID_ACTION';
  END;

  RETURN v_response;
END;
$$;

REVOKE ALL ON FUNCTION public.command_supplier_price_list_v2(
  text, uuid, uuid, uuid, uuid, uuid, integer, jsonb, uuid, uuid, text
)
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.command_supplier_price_list_v2(
  text, uuid, uuid, uuid, uuid, uuid, integer, jsonb, uuid, uuid, text
)
TO service_role;

CREATE OR REPLACE FUNCTION public.command_supplier_price_item_v2(
  p_action text,
  p_item_id uuid,
  p_price_list_id uuid,
  p_tenant_id uuid,
  p_tenant_supplier_id uuid,
  p_supplier_id uuid,
  p_expected_version integer,
  p_payload jsonb,
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
  v_price_list public.supplier_price_lists%ROWTYPE;
  v_item public.supplier_price_list_items%ROWTYPE;
  v_before_list jsonb;
  v_before_item jsonb;
  v_request jsonb;
  v_response jsonb;
  v_supplier_product_id uuid;
  v_sku_id uuid;
  v_purchase_unit_id uuid;
  v_base_unit_id uuid;
  v_base_unit_conversion numeric(18, 8);
  v_unit_price numeric;
  v_tax_rate numeric;
  v_tax_inclusive boolean;
  v_constraint_name text;
BEGIN
  IF p_action NOT IN ('upsert', 'delete')
    OR p_item_id IS NULL
    OR p_price_list_id IS NULL
    OR p_tenant_id IS NULL
    OR p_tenant_supplier_id IS NULL
    OR p_supplier_id IS NULL
    OR p_expected_version IS NULL
    OR p_expected_version < 1
    OR p_payload IS NULL
    OR jsonb_typeof(p_payload) <> 'object'
    OR p_actor_user_id IS NULL
    OR p_actor_employee_id IS NULL
    OR p_idempotency_key IS NULL
    OR btrim(p_idempotency_key) = ''
    OR char_length(p_idempotency_key) > 120
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'SUPPLIER_PRICE_LIST_INVALID_ACTION';
  END IF;

  PERFORM public.assert_supplier_price_v2_context(
    p_tenant_id,
    p_tenant_supplier_id,
    p_supplier_id,
    p_actor_user_id,
    p_actor_employee_id
  );

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'supplier-command:' || p_actor_user_id::text || ':' ||
        btrim(p_idempotency_key),
      0
    )
  );

  SELECT price_list.*
  INTO v_price_list
  FROM public.supplier_price_lists AS price_list
  WHERE price_list.id = p_price_list_id
    AND price_list.tenant_id = p_tenant_id
    AND price_list.tenant_supplier_id = p_tenant_supplier_id
    AND price_list.supplier_id = p_supplier_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'status', 'not_found',
      'error_code', 'SUPPLIER_PRICE_LIST_NOT_FOUND'
    );
  END IF;

  v_request := jsonb_build_object(
    'action', p_action,
    'tenant_id', p_tenant_id,
    'tenant_supplier_id', p_tenant_supplier_id,
    'supplier_id', p_supplier_id,
    'price_list_id', p_price_list_id,
    'item_id', p_item_id,
    'expected_version', p_expected_version,
    'payload', p_payload,
    'actor_employee_id', p_actor_employee_id
  );

  SELECT event.*
  INTO v_event
  FROM public.supplier_command_events AS event
  WHERE event.actor_user_id = p_actor_user_id
    AND event.idempotency_key = btrim(p_idempotency_key)
  FOR UPDATE;

  IF FOUND THEN
    IF v_event.tenant_id IS DISTINCT FROM p_tenant_id
      OR v_event.resource_type <> 'supplier_price_list'
      OR v_event.resource_id <> p_price_list_id
      OR v_event.command <> 'supplier_price_item_v2:' || p_action
      OR v_event.from_state -> '_request' IS DISTINCT FROM v_request
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'SUPPLIER_IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN jsonb_set(v_event.to_state, '{idempotent}', 'true'::jsonb, true);
  END IF;

  IF v_price_list.row_version <> p_expected_version THEN
    RETURN jsonb_build_object(
      'status', 'version_conflict',
      'error_code', 'SUPPLIER_PRICE_LIST_VERSION_CONFLICT',
      'version', v_price_list.row_version,
      'current_status', v_price_list.lifecycle_status
    );
  END IF;
  IF v_price_list.lifecycle_status <> 'draft' THEN
    RETURN jsonb_build_object(
      'status', 'state_conflict',
      'error_code', 'SUPPLIER_PRICE_LIST_INVALID_ACTION'
    );
  END IF;

  SELECT item.*
  INTO v_item
  FROM public.supplier_price_list_items AS item
  WHERE item.id = p_item_id
    AND item.supplier_price_list_id = p_price_list_id
    AND item.tenant_id = p_tenant_id
    AND item.supplier_id = p_supplier_id
  FOR UPDATE;

  v_before_list := to_jsonb(v_price_list);
  v_before_item := CASE WHEN v_item.id IS NULL THEN NULL ELSE to_jsonb(v_item) END;

  BEGIN
    IF p_action = 'upsert' THEN
      IF NULLIF(p_payload ->> 'sku_id', '') IS NULL
        OR NULLIF(p_payload ->> 'unit_price', '') IS NULL
        OR NULLIF(p_payload ->> 'tax_rate', '') IS NULL
        OR jsonb_typeof(p_payload -> 'tax_inclusive') <> 'boolean'
        OR EXISTS (
          SELECT 1
          FROM jsonb_object_keys(p_payload) AS field(key)
          WHERE field.key NOT IN (
            'sku_id', 'unit_price', 'tax_rate', 'tax_inclusive'
          )
        )
      THEN
        RAISE EXCEPTION USING
          ERRCODE = 'P0001',
          MESSAGE = 'SUPPLIER_PRICE_LIST_INVALID_ACTION';
      END IF;

      v_sku_id := (p_payload ->> 'sku_id')::uuid;
      v_unit_price := (p_payload ->> 'unit_price')::numeric;
      v_tax_rate := (p_payload ->> 'tax_rate')::numeric;
      v_tax_inclusive := (p_payload ->> 'tax_inclusive')::boolean;
      IF v_unit_price::text IN ('NaN', 'Infinity', '-Infinity')
        OR v_unit_price < 0
        OR v_unit_price > 999999999999.99::numeric
        OR v_tax_rate::text IN ('NaN', 'Infinity', '-Infinity')
        OR v_tax_rate < 0
        OR v_tax_rate > 1
      THEN
        RAISE EXCEPTION USING
          ERRCODE = 'P0001',
          MESSAGE = 'SUPPLIER_PRICE_LIST_INVALID_ACTION';
      END IF;

      PERFORM product.id
      FROM public.supplier_skus AS sku
      JOIN public.supplier_products AS product
        ON product.id = sku.supplier_product_id
        AND product.supplier_id = sku.supplier_id
      WHERE sku.id = v_sku_id
        AND sku.supplier_id = p_supplier_id
        AND sku.status = 'active'
        AND product.status = 'active'
        AND (
          (
            sku.ownership_scope = 'platform'
            AND sku.owner_tenant_id IS NULL
            AND product.ownership_scope = 'platform'
            AND product.owner_tenant_id IS NULL
          )
          OR (
            sku.ownership_scope = 'tenant'
            AND sku.owner_tenant_id = p_tenant_id
            AND product.ownership_scope = 'tenant'
            AND product.owner_tenant_id = p_tenant_id
          )
        )
      ORDER BY product.id
      FOR SHARE OF product;

      IF NOT FOUND THEN
        RETURN jsonb_build_object(
          'status', 'not_found',
          'error_code', 'SUPPLIER_SKU_NOT_FOUND'
        );
      END IF;

      SELECT
        product.id,
        sku.purchase_unit_id,
        sku.base_unit_id,
        sku.base_unit_conversion
      INTO
        v_supplier_product_id,
        v_purchase_unit_id,
        v_base_unit_id,
        v_base_unit_conversion
      FROM public.supplier_skus AS sku
      JOIN public.supplier_products AS product
        ON product.id = sku.supplier_product_id
        AND product.supplier_id = sku.supplier_id
      WHERE sku.id = v_sku_id
        AND sku.supplier_id = p_supplier_id
        AND sku.status = 'active'
        AND product.status = 'active'
        AND (
          (
            sku.ownership_scope = 'platform'
            AND sku.owner_tenant_id IS NULL
            AND product.ownership_scope = 'platform'
            AND product.owner_tenant_id IS NULL
          )
          OR (
            sku.ownership_scope = 'tenant'
            AND sku.owner_tenant_id = p_tenant_id
            AND product.ownership_scope = 'tenant'
            AND product.owner_tenant_id = p_tenant_id
          )
        )
      ORDER BY sku.id
      FOR SHARE OF sku;

      IF NOT FOUND THEN
        RETURN jsonb_build_object(
          'status', 'not_found',
          'error_code', 'SUPPLIER_SKU_NOT_FOUND'
        );
      END IF;

      IF v_item.id IS NULL THEN
        INSERT INTO public.supplier_price_list_items (
          id, tenant_id, supplier_id, supplier_price_list_id,
          supplier_product_id, supplier_sku_id,
          minimum_quantity, maximum_quantity,
          purchase_unit_id, base_unit_id, base_unit_conversion,
          unit_price, tax_rate, tax_inclusive,
          acting_tenant_id, acting_employee_id, operation_source, proxy_reason,
          created_by_employee_id, updated_by_employee_id
        ) VALUES (
          p_item_id, p_tenant_id, p_supplier_id, p_price_list_id,
          v_supplier_product_id, v_sku_id, 1, NULL,
          v_purchase_unit_id, v_base_unit_id, v_base_unit_conversion,
          v_unit_price::numeric(14, 2), v_tax_rate::numeric(7, 6),
          v_tax_inclusive, p_tenant_id, p_actor_employee_id,
          'tenant', NULL, p_actor_employee_id, p_actor_employee_id
        ) RETURNING * INTO v_item;
      ELSE
        UPDATE public.supplier_price_list_items AS item
        SET
          supplier_product_id = v_supplier_product_id,
          supplier_sku_id = v_sku_id,
          purchase_unit_id = v_purchase_unit_id,
          base_unit_id = v_base_unit_id,
          base_unit_conversion = v_base_unit_conversion,
          unit_price = v_unit_price::numeric(14, 2),
          tax_rate = v_tax_rate::numeric(7, 6),
          tax_inclusive = v_tax_inclusive,
          acting_tenant_id = p_tenant_id,
          acting_employee_id = p_actor_employee_id,
          operation_source = 'tenant',
          proxy_reason = NULL,
          updated_by_employee_id = p_actor_employee_id,
          updated_at = pg_catalog.now()
        WHERE item.id = p_item_id
          AND item.supplier_price_list_id = p_price_list_id
          AND item.tenant_id = p_tenant_id
          AND item.supplier_id = p_supplier_id
        RETURNING * INTO v_item;
      END IF;

      UPDATE public.supplier_price_lists AS price_list
      SET
        row_version = price_list.row_version + 1,
        acting_tenant_id = p_tenant_id,
        acting_employee_id = p_actor_employee_id,
        operation_source = 'tenant',
        proxy_reason = NULL,
        updated_by_employee_id = p_actor_employee_id,
        updated_at = pg_catalog.now()
      WHERE price_list.id = p_price_list_id
      RETURNING * INTO v_price_list;

      v_response := jsonb_build_object(
        'status', 'updated',
        'idempotent', false,
        'price_list', to_jsonb(v_price_list),
        'item', to_jsonb(v_item) || jsonb_build_object(
          'minimum_quantity', v_item.minimum_quantity::text,
          'maximum_quantity', CASE WHEN v_item.maximum_quantity IS NULL
            THEN NULL ELSE to_jsonb(v_item.maximum_quantity::text) END,
          'base_unit_conversion', v_item.base_unit_conversion::text,
          'unit_price', v_item.unit_price::text,
          'tax_rate', v_item.tax_rate::text
        ),
        'version', v_price_list.row_version
      );
    ELSE
      IF p_payload <> '{}'::jsonb THEN
        RAISE EXCEPTION USING
          ERRCODE = 'P0001',
          MESSAGE = 'SUPPLIER_PRICE_LIST_INVALID_ACTION';
      END IF;
      IF v_item.id IS NULL THEN
        RETURN jsonb_build_object(
          'status', 'not_found',
          'error_code', 'SUPPLIER_PRICE_ITEM_NOT_FOUND'
        );
      END IF;

      DELETE FROM public.supplier_price_list_items AS item
      WHERE item.id = p_item_id
        AND item.supplier_price_list_id = p_price_list_id
        AND item.tenant_id = p_tenant_id
        AND item.supplier_id = p_supplier_id;

      UPDATE public.supplier_price_lists AS price_list
      SET
        row_version = price_list.row_version + 1,
        acting_tenant_id = p_tenant_id,
        acting_employee_id = p_actor_employee_id,
        operation_source = 'tenant',
        proxy_reason = NULL,
        updated_by_employee_id = p_actor_employee_id,
        updated_at = pg_catalog.now()
      WHERE price_list.id = p_price_list_id
      RETURNING * INTO v_price_list;

      v_response := jsonb_build_object(
        'status', 'deleted',
        'idempotent', false,
        'price_list', to_jsonb(v_price_list),
        'version', v_price_list.row_version
      );
    END IF;

    INSERT INTO public.supplier_command_events (
      tenant_id, resource_type, resource_id, command,
      from_state, to_state, reason,
      actor_user_id, actor_employee_id, idempotency_key, result_version
    ) VALUES (
      p_tenant_id, 'supplier_price_list', p_price_list_id,
      'supplier_price_item_v2:' || p_action,
      jsonb_build_object(
        '_request', v_request,
        'price_list', v_before_list,
        'item', v_before_item
      ),
      v_response, NULL,
      p_actor_user_id, p_actor_employee_id, btrim(p_idempotency_key),
      v_price_list.row_version
    );
  EXCEPTION
    WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS v_constraint_name = CONSTRAINT_NAME;
      IF v_constraint_name IN (
        'supplier_price_list_items_pkey',
        'supplier_price_list_items_list_sku_key',
        'supplier_command_events_actor_user_id_idempotency_key_key'
      ) THEN
        RETURN jsonb_build_object(
          'status', 'state_conflict',
          'error_code', 'SUPPLIER_PRICE_LIST_INVALID_ACTION',
          'reason', 'duplicate_sku_or_item'
        );
      ELSE
        RAISE;
      END IF;
    WHEN invalid_text_representation OR numeric_value_out_of_range
      OR check_violation OR not_null_violation
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'SUPPLIER_PRICE_LIST_INVALID_ACTION';
  END;

  RETURN v_response;
END;
$$;

REVOKE ALL ON FUNCTION public.command_supplier_price_item_v2(
  text, uuid, uuid, uuid, uuid, uuid, integer, jsonb, uuid, uuid, text
)
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.command_supplier_price_item_v2(
  text, uuid, uuid, uuid, uuid, uuid, integer, jsonb, uuid, uuid, text
)
TO service_role;


CREATE FUNCTION public.command_supplier_purchasable_product_v1(
  p_product_id uuid,
  p_sku_id uuid,
  p_tenant_id uuid,
  p_tenant_supplier_id uuid,
  p_supplier_id uuid,
  p_product jsonb,
  p_sku jsonb,
  p_price jsonb,
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
  v_source_price_list public.supplier_price_lists%ROWTYPE;
  v_parent_request jsonb;
  v_parent_fingerprint text;
  v_parent_key text;
  v_child_key text;
  v_product_response jsonb;
  v_sku_response jsonb;
  v_price_list_response jsonb;
  v_price_item_response jsonb;
  v_catalog_response jsonb;
  v_catalog_item jsonb;
  v_response jsonb;
  v_category_id uuid;
  v_brand_id uuid;
  v_purchase_unit_id uuid;
  v_price_list_id uuid;
  v_price_item_id uuid;
  v_price_list_version integer;
  v_constraint_name text;
  v_error_message text;
  v_error_detail text;
  v_unit_price numeric(14, 2);
  v_tax_rate numeric(7, 6);
  v_priced_at timestamptz := pg_catalog.transaction_timestamp();
BEGIN
  -- This entire validation block intentionally precedes every advisory or row
  -- lock. The HTTP schema is not a trust boundary for direct RPC callers.
  IF p_product_id IS NULL
    OR p_sku_id IS NULL
    OR p_product_id = p_sku_id
    OR p_tenant_id IS NULL
    OR p_tenant_supplier_id IS NULL
    OR p_supplier_id IS NULL
    OR p_actor_user_id IS NULL
    OR p_actor_employee_id IS NULL
    OR p_product IS NULL
    OR jsonb_typeof(p_product) <> 'object'
    OR p_sku IS NULL
    OR jsonb_typeof(p_sku) <> 'object'
    OR p_price IS NULL
    OR jsonb_typeof(p_price) <> 'object'
    OR p_idempotency_key IS NULL
    OR btrim(p_idempotency_key) = ''
    OR char_length(p_idempotency_key) > 120
  THEN
    RETURN jsonb_build_object(
      'status', 'validation_error',
      'idempotent', false,
      'error_code', 'SUPPLIER_PURCHASABLE_PRODUCT_CREATE_FAILED',
      'reason', 'validation_error'
    );
  END IF;

  IF NOT (p_product ? 'product_code')
    OR NOT (p_product ? 'name')
    OR NOT (p_product ? 'category_id')
    OR NOT (p_product ? 'brand_id')
    OR jsonb_typeof(p_product -> 'product_code') <> 'string'
    OR jsonb_typeof(p_product -> 'name') <> 'string'
    OR jsonb_typeof(p_product -> 'category_id') <> 'string'
    OR jsonb_typeof(p_product -> 'brand_id') <> 'string'
    OR NULLIF(btrim(p_product ->> 'name'), '') IS NULL
    OR btrim(p_product ->> 'name') IS DISTINCT FROM (p_product ->> 'name')
    OR char_length(p_product ->> 'name') > 160
    OR (p_product ->> 'product_code') IS DISTINCT FROM
      'TP-' || left(replace(p_product_id::text, '-', ''), 16)
    OR COALESCE(p_product ->> 'category_id', '') !~*
      '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    OR COALESCE(p_product ->> 'brand_id', '') !~*
      '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    OR (
      p_product ? 'description'
      AND jsonb_typeof(p_product -> 'description') NOT IN ('string', 'null')
    )
    OR (
      jsonb_typeof(p_product -> 'description') = 'string'
      AND (
        NULLIF(btrim(p_product ->> 'description'), '') IS NULL
        OR btrim(p_product ->> 'description') IS DISTINCT FROM
          (p_product ->> 'description')
      )
    )
    OR EXISTS (
      SELECT 1
      FROM jsonb_object_keys(p_product) AS field(key)
      WHERE field.key NOT IN (
        'product_code', 'name', 'category_id', 'brand_id', 'description'
      )
    )
  THEN
    RETURN jsonb_build_object(
      'status', 'validation_error',
      'idempotent', false,
      'error_code', 'SUPPLIER_PURCHASABLE_PRODUCT_CREATE_FAILED',
      'reason', 'invalid_product'
    );
  END IF;

  IF NOT (p_sku ? 'sku_code')
    OR NOT (p_sku ? 'name')
    OR NOT (p_sku ? 'purchase_unit_id')
    OR NOT (p_sku ? 'spec_values')
    OR jsonb_typeof(p_sku -> 'sku_code') <> 'string'
    OR jsonb_typeof(p_sku -> 'name') <> 'string'
    OR jsonb_typeof(p_sku -> 'purchase_unit_id') <> 'string'
    OR jsonb_typeof(p_sku -> 'spec_values') <> 'object'
    OR NULLIF(btrim(p_sku ->> 'name'), '') IS NULL
    OR btrim(p_sku ->> 'name') IS DISTINCT FROM (p_sku ->> 'name')
    OR char_length(p_sku ->> 'name') > 160
    OR (p_sku ->> 'sku_code') IS DISTINCT FROM
      'TS-' || left(replace(p_sku_id::text, '-', ''), 16)
    OR COALESCE(p_sku ->> 'purchase_unit_id', '') !~*
      '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    OR (
      p_sku ? 'specification'
      AND jsonb_typeof(p_sku -> 'specification') NOT IN ('string', 'null')
    )
    OR (
      jsonb_typeof(p_sku -> 'specification') = 'string'
      AND (
        NULLIF(btrim(p_sku ->> 'specification'), '') IS NULL
        OR btrim(p_sku ->> 'specification') IS DISTINCT FROM
          (p_sku ->> 'specification')
      )
    )
    OR (
      p_sku ? 'model'
      AND jsonb_typeof(p_sku -> 'model') NOT IN ('string', 'null')
    )
    OR (
      jsonb_typeof(p_sku -> 'model') = 'string'
      AND (
        NULLIF(btrim(p_sku ->> 'model'), '') IS NULL
        OR btrim(p_sku ->> 'model') IS DISTINCT FROM (p_sku ->> 'model')
      )
    )
    OR (
      p_sku ? 'batch_managed'
      AND jsonb_typeof(p_sku -> 'batch_managed') <> 'boolean'
    )
    OR (
      p_sku ? 'color_managed'
      AND jsonb_typeof(p_sku -> 'color_managed') <> 'boolean'
    )
    OR (
      p_sku ? 'serial_managed'
      AND jsonb_typeof(p_sku -> 'serial_managed') <> 'boolean'
    )
    OR EXISTS (
      SELECT 1
      FROM jsonb_each(p_sku -> 'spec_values') AS spec(key, value)
      WHERE CASE jsonb_typeof(spec.value)
        WHEN 'string' THEN false
        WHEN 'number' THEN false
        WHEN 'boolean' THEN false
        WHEN 'array' THEN EXISTS (
          SELECT 1
          FROM jsonb_array_elements(spec.value) AS element(value)
          WHERE jsonb_typeof(element.value) <> 'string'
        )
        ELSE true
      END
    )
    OR EXISTS (
      SELECT 1
      FROM jsonb_object_keys(p_sku) AS field(key)
      WHERE field.key NOT IN (
        'sku_code', 'name', 'specification', 'model', 'purchase_unit_id',
        'batch_managed', 'color_managed', 'serial_managed', 'spec_values'
      )
    )
  THEN
    RETURN jsonb_build_object(
      'status', 'validation_error',
      'idempotent', false,
      'error_code', 'SUPPLIER_PURCHASABLE_PRODUCT_CREATE_FAILED',
      'reason', 'invalid_sku'
    );
  END IF;

  IF NOT (p_price ? 'unit_price')
    OR NOT (p_price ? 'tax_rate')
    OR NOT (p_price ? 'tax_inclusive')
    OR jsonb_typeof(p_price -> 'unit_price') <> 'string'
    OR jsonb_typeof(p_price -> 'tax_rate') <> 'string'
    OR jsonb_typeof(p_price -> 'tax_inclusive') <> 'boolean'
    OR COALESCE(p_price ->> 'unit_price', '') !~
      '^(0|[1-9][0-9]{0,11})(\.[0-9]{1,2})?$'
    OR COALESCE(p_price ->> 'tax_rate', '') !~
      '^(0|1)(\.[0-9]{1,6})?$'
    OR EXISTS (
      SELECT 1
      FROM jsonb_object_keys(p_price) AS field(key)
      WHERE field.key NOT IN ('unit_price', 'tax_rate', 'tax_inclusive')
    )
  THEN
    RETURN jsonb_build_object(
      'status', 'validation_error',
      'idempotent', false,
      'error_code', 'SUPPLIER_PURCHASABLE_PRODUCT_CREATE_FAILED',
      'reason', 'invalid_price'
    );
  END IF;

  v_category_id := (p_product ->> 'category_id')::uuid;
  v_brand_id := (p_product ->> 'brand_id')::uuid;
  v_purchase_unit_id := (p_sku ->> 'purchase_unit_id')::uuid;
  v_unit_price := (p_price ->> 'unit_price')::numeric(14, 2);
  v_tax_rate := (p_price ->> 'tax_rate')::numeric(7, 6);

  IF v_unit_price <= 0
    OR v_unit_price > 999999999999.99::numeric
    OR v_tax_rate < 0
    OR v_tax_rate > 1
  THEN
    RETURN jsonb_build_object(
      'status', 'validation_error',
      'idempotent', false,
      'error_code', 'SUPPLIER_PURCHASABLE_PRODUCT_CREATE_FAILED',
      'reason', 'invalid_price'
    );
  END IF;

  v_parent_request := jsonb_build_object(
    'product_id', p_product_id,
    'sku_id', p_sku_id,
    'tenant_id', p_tenant_id,
    'tenant_supplier_id', p_tenant_supplier_id,
    'supplier_id', p_supplier_id,
    'product', p_product,
    'sku', p_sku,
    'price', p_price,
    'actor_user_id', p_actor_user_id,
    'actor_employee_id', p_actor_employee_id,
    'idempotency_key', btrim(p_idempotency_key)
  );
  v_parent_fingerprint := pg_catalog.md5(v_parent_request::text);
  v_parent_key := 'supplier-purchasable-product:' ||
    pg_catalog.md5(btrim(p_idempotency_key));

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_parent_key, 20260826140000)
  );

  SELECT event.*
  INTO v_event
  FROM public.supplier_command_events AS event
  WHERE event.actor_user_id = p_actor_user_id
    AND event.idempotency_key = v_parent_key
  FOR UPDATE;

  IF FOUND THEN
    IF v_event.tenant_id IS DISTINCT FROM p_tenant_id
      OR v_event.resource_type <> 'supplier_product'
      OR v_event.resource_id <> p_product_id
      OR v_event.command <> 'supplier_purchasable_product_v1:create'
      OR v_event.from_state ->> '_fingerprint' IS DISTINCT FROM
        v_parent_fingerprint
      OR v_event.from_state -> '_request' IS DISTINCT FROM v_parent_request
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'SUPPLIER_IDEMPOTENCY_CONFLICT';
    END IF;

    RETURN jsonb_set(v_event.to_state, '{idempotent}', 'true'::jsonb, true);
  END IF;

  PERFORM employee.id
  FROM public.employees AS employee
  WHERE employee.id = p_actor_employee_id
    AND employee.user_id = p_actor_user_id
    AND employee.tenant_id = p_tenant_id
    AND employee.status = 'active'
  FOR SHARE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'status', 'validation_error',
      'idempotent', false,
      'error_code', 'SUPPLIER_PROXY_ACTOR_INVALID',
      'reason', 'actor_invalid'
    );
  END IF;

  PERFORM relationship.id
  FROM public.tenant_suppliers AS relationship
  JOIN public.suppliers AS supplier
    ON supplier.id = relationship.supplier_id
  WHERE relationship.id = p_tenant_supplier_id
    AND relationship.tenant_id = p_tenant_id
    AND relationship.supplier_id = p_supplier_id
    AND relationship.relationship_status = 'active'
    AND relationship.default_currency = 'CNY'
    AND supplier.onboarding_status = 'approved'
    AND supplier.operational_status = 'active'
    AND (
      (supplier.ownership_scope = 'platform' AND supplier.owner_tenant_id IS NULL)
      OR (
        supplier.ownership_scope = 'tenant'
        AND supplier.owner_tenant_id = p_tenant_id
      )
    )
  FOR UPDATE OF relationship;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'status', 'state_conflict',
      'idempotent', false,
      'error_code', 'SUPPLIER_ORDER_NOT_ELIGIBLE',
      'reason', 'tenant_supplier_unavailable'
    );
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'supplier-price-series:' || p_tenant_id::text || ':' ||
        p_supplier_id::text || ':default',
      6720240729160000
    )
  );

  PERFORM price_list.id
  FROM public.supplier_price_lists AS price_list
  WHERE price_list.tenant_id = p_tenant_id
    AND price_list.tenant_supplier_id = p_tenant_supplier_id
    AND price_list.supplier_id = p_supplier_id
    AND upper(btrim(price_list.price_list_code)) = 'DEFAULT'
    AND price_list.scope_type = 'default'
    AND price_list.currency = 'CNY'
  ORDER BY price_list.version_number, price_list.id
  FOR UPDATE;

  IF EXISTS (
    SELECT 1
    FROM public.supplier_price_lists AS draft
    WHERE draft.tenant_id = p_tenant_id
      AND draft.tenant_supplier_id = p_tenant_supplier_id
      AND draft.supplier_id = p_supplier_id
      AND upper(btrim(draft.price_list_code)) = 'DEFAULT'
      AND draft.scope_type = 'default'
      AND draft.currency = 'CNY'
      AND draft.lifecycle_status = 'draft'
  ) THEN
    RETURN jsonb_build_object(
      'status', 'state_conflict',
      'idempotent', false,
      'error_code', 'SUPPLIER_PURCHASABLE_PRODUCT_CREATE_FAILED',
      'reason', 'default_price_list_draft_exists'
    );
  END IF;

  SELECT price_list.*
  INTO v_source_price_list
  FROM public.supplier_price_lists AS price_list
  WHERE price_list.tenant_id = p_tenant_id
    AND price_list.tenant_supplier_id = p_tenant_supplier_id
    AND price_list.supplier_id = p_supplier_id
    AND upper(btrim(price_list.price_list_code)) = 'DEFAULT'
    AND price_list.scope_type = 'default'
    AND price_list.currency = 'CNY'
    AND price_list.lifecycle_status IN ('published', 'retired')
  ORDER BY
    CASE WHEN price_list.lifecycle_status = 'published' THEN 0 ELSE 1 END,
    price_list.version_number DESC,
    price_list.id DESC
  LIMIT 1;

  IF (
    SELECT count(*)
    FROM public.supplier_price_lists AS published
    WHERE published.tenant_id = p_tenant_id
      AND published.tenant_supplier_id = p_tenant_supplier_id
      AND published.supplier_id = p_supplier_id
      AND upper(btrim(published.price_list_code)) = 'DEFAULT'
      AND published.scope_type = 'default'
      AND published.currency = 'CNY'
      AND published.lifecycle_status = 'published'
  ) > 1 THEN
    RETURN jsonb_build_object(
      'status', 'state_conflict',
      'idempotent', false,
      'error_code', 'SUPPLIER_PURCHASABLE_PRODUCT_CREATE_FAILED',
      'reason', 'multiple_published_default_price_lists'
    );
  END IF;

  PERFORM category.id
  FROM public.catalog_categories AS category
  WHERE category.id = v_category_id
    AND category.status = 'active'
    AND (
      (category.ownership_scope = 'platform' AND category.owner_tenant_id IS NULL)
      OR (
        category.ownership_scope = 'tenant'
        AND category.owner_tenant_id = p_tenant_id
      )
    )
  FOR SHARE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'status', 'state_conflict',
      'idempotent', false,
      'error_code', 'SUPPLIER_PURCHASABLE_PRODUCT_CREATE_FAILED',
      'reason', 'category_not_found'
    );
  END IF;

  PERFORM brand.id
  FROM public.catalog_brands AS brand
  WHERE brand.id = v_brand_id
    AND brand.status = 'active'
    AND (
      (brand.ownership_scope = 'platform' AND brand.owner_tenant_id IS NULL)
      OR (
        brand.ownership_scope = 'tenant'
        AND brand.owner_tenant_id = p_tenant_id
      )
    )
  FOR SHARE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'status', 'state_conflict',
      'idempotent', false,
      'error_code', 'SUPPLIER_PURCHASABLE_PRODUCT_CREATE_FAILED',
      'reason', 'brand_not_found'
    );
  END IF;

  PERFORM unit_record.id
  FROM public.catalog_units AS unit_record
  WHERE unit_record.id = v_purchase_unit_id
    AND unit_record.status = 'active'
  FOR SHARE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'status', 'state_conflict',
      'idempotent', false,
      'error_code', 'SUPPLIER_PURCHASABLE_PRODUCT_CREATE_FAILED',
      'reason', 'purchase_unit_not_found'
    );
  END IF;

  PERFORM product.id
  FROM public.supplier_products AS product
  WHERE product.id = p_product_id
    OR (
      product.supplier_id = p_supplier_id
      AND product.ownership_scope = 'tenant'
      AND product.owner_tenant_id = p_tenant_id
      AND upper(btrim(product.product_code)) =
        upper(btrim(p_product ->> 'product_code'))
    )
  ORDER BY product.id
  FOR UPDATE;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'status', 'state_conflict',
      'idempotent', false,
      'error_code', 'SUPPLIER_PURCHASABLE_PRODUCT_CREATE_FAILED',
      'reason', 'product_conflict'
    );
  END IF;

  PERFORM sku.id
  FROM public.supplier_skus AS sku
  WHERE sku.id = p_sku_id
    OR (
      sku.supplier_id = p_supplier_id
      AND sku.ownership_scope = 'tenant'
      AND sku.owner_tenant_id = p_tenant_id
      AND upper(btrim(sku.sku_code)) = upper(btrim(p_sku ->> 'sku_code'))
    )
  ORDER BY sku.id
  FOR UPDATE;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'status', 'state_conflict',
      'idempotent', false,
      'error_code', 'SUPPLIER_PURCHASABLE_PRODUCT_CREATE_FAILED',
      'reason', 'sku_conflict'
    );
  END IF;

  BEGIN
    v_child_key := v_parent_key || ':product-create';
    SELECT public.command_supplier_product_v2(
      p_action => 'create',
      p_ownership_scope => 'tenant',
      p_tenant_id => p_tenant_id,
      p_tenant_supplier_id => p_tenant_supplier_id,
      p_supplier_id => p_supplier_id,
      p_product_id => p_product_id,
      p_expected_version => NULL::integer,
      p_payload => p_product,
      p_actor_user_id => p_actor_user_id,
      p_actor_employee_id => p_actor_employee_id,
      p_idempotency_key => v_child_key
    ) INTO v_product_response;
    IF v_product_response ->> 'status' IS DISTINCT FROM 'created' THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'SUPPLIER_PURCHASABLE_PRODUCT_CREATE_FAILED',
        DETAIL = COALESCE(
          v_product_response ->> 'error_code',
          'product_create_failed'
        );
    END IF;

    v_child_key := v_parent_key || ':product-activate';
    SELECT public.command_supplier_product_v2(
      p_action => 'activate',
      p_ownership_scope => 'tenant',
      p_tenant_id => p_tenant_id,
      p_tenant_supplier_id => p_tenant_supplier_id,
      p_supplier_id => p_supplier_id,
      p_product_id => p_product_id,
      p_expected_version => (v_product_response ->> 'version')::integer,
      p_payload => '{}'::jsonb,
      p_actor_user_id => p_actor_user_id,
      p_actor_employee_id => p_actor_employee_id,
      p_idempotency_key => v_child_key
    ) INTO v_product_response;
    IF v_product_response ->> 'status' IS DISTINCT FROM 'updated'
      OR v_product_response -> 'product' ->> 'status' IS DISTINCT FROM 'active'
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'SUPPLIER_PURCHASABLE_PRODUCT_CREATE_FAILED',
        DETAIL = COALESCE(
          v_product_response ->> 'error_code',
          'product_activate_failed'
        );
    END IF;

    v_child_key := v_parent_key || ':sku-create';
    SELECT public.command_supplier_sku_v2(
      p_action => 'create',
      p_ownership_scope => 'tenant',
      p_tenant_id => p_tenant_id,
      p_tenant_supplier_id => p_tenant_supplier_id,
      p_supplier_id => p_supplier_id,
      p_supplier_product_id => p_product_id,
      p_sku_id => p_sku_id,
      p_expected_version => NULL::integer,
      p_payload => p_sku,
      p_actor_user_id => p_actor_user_id,
      p_actor_employee_id => p_actor_employee_id,
      p_idempotency_key => v_child_key
    ) INTO v_sku_response;
    IF v_sku_response ->> 'status' IS DISTINCT FROM 'created' THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'SUPPLIER_PURCHASABLE_PRODUCT_CREATE_FAILED',
        DETAIL = COALESCE(v_sku_response ->> 'error_code', 'sku_create_failed');
    END IF;

    v_child_key := v_parent_key || ':sku-activate';
    SELECT public.command_supplier_sku_v2(
      p_action => 'activate',
      p_ownership_scope => 'tenant',
      p_tenant_id => p_tenant_id,
      p_tenant_supplier_id => p_tenant_supplier_id,
      p_supplier_id => p_supplier_id,
      p_supplier_product_id => p_product_id,
      p_sku_id => p_sku_id,
      p_expected_version => (v_sku_response ->> 'version')::integer,
      p_payload => '{}'::jsonb,
      p_actor_user_id => p_actor_user_id,
      p_actor_employee_id => p_actor_employee_id,
      p_idempotency_key => v_child_key
    ) INTO v_sku_response;
    IF v_sku_response ->> 'status' IS DISTINCT FROM 'updated'
      OR v_sku_response -> 'sku' ->> 'status' IS DISTINCT FROM 'active'
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'SUPPLIER_PURCHASABLE_PRODUCT_CREATE_FAILED',
        DETAIL = COALESCE(
          v_sku_response ->> 'error_code',
          'sku_activate_failed'
        );
    END IF;

    v_price_list_id := gen_random_uuid();
    IF v_source_price_list.id IS NULL THEN
      v_child_key := v_parent_key || ':price-list-create';
      SELECT public.command_supplier_price_list_v2(
        p_action => 'create',
        p_price_list_id => v_price_list_id,
        p_new_price_list_id => NULL::uuid,
        p_tenant_id => p_tenant_id,
        p_tenant_supplier_id => p_tenant_supplier_id,
        p_supplier_id => p_supplier_id,
        p_expected_version => NULL::integer,
        p_payload => jsonb_build_object(
          'price_list_code', 'DEFAULT',
          'name', '默认供货价',
          'currency', 'CNY',
          'effective_from', v_priced_at,
          'effective_until', NULL
        ),
        p_actor_user_id => p_actor_user_id,
        p_actor_employee_id => p_actor_employee_id,
        p_idempotency_key => v_child_key
      ) INTO v_price_list_response;
    ELSE
      v_child_key := v_parent_key || ':price-list-new-version';
      SELECT public.command_supplier_price_list_v2(
        p_action => 'new_version',
        p_price_list_id => v_source_price_list.id,
        p_new_price_list_id => v_price_list_id,
        p_tenant_id => p_tenant_id,
        p_tenant_supplier_id => p_tenant_supplier_id,
        p_supplier_id => p_supplier_id,
        p_expected_version => v_source_price_list.row_version,
        p_payload => '{}'::jsonb,
        p_actor_user_id => p_actor_user_id,
        p_actor_employee_id => p_actor_employee_id,
        p_idempotency_key => v_child_key
      ) INTO v_price_list_response;

      IF v_price_list_response ->> 'status' IS DISTINCT FROM 'created' THEN
        RAISE EXCEPTION USING
          ERRCODE = 'P0001',
          MESSAGE = 'SUPPLIER_PURCHASABLE_PRODUCT_CREATE_FAILED',
          DETAIL = COALESCE(
            v_price_list_response ->> 'error_code',
            'price_list_version_failed'
          );
      END IF;

      IF EXISTS (
        SELECT 1
        FROM public.supplier_price_list_items AS old_item
        WHERE old_item.supplier_price_list_id = v_source_price_list.id
          AND old_item.tenant_id = p_tenant_id
          AND old_item.supplier_id = p_supplier_id
          AND NOT EXISTS (
            SELECT 1
            FROM public.supplier_price_list_items AS copied_item
            WHERE copied_item.supplier_price_list_id = v_price_list_id
              AND copied_item.tenant_id = old_item.tenant_id
              AND copied_item.supplier_id = old_item.supplier_id
              AND copied_item.supplier_product_id = old_item.supplier_product_id
              AND copied_item.supplier_sku_id = old_item.supplier_sku_id
              AND copied_item.minimum_quantity = old_item.minimum_quantity
              AND copied_item.maximum_quantity IS NOT DISTINCT FROM
                old_item.maximum_quantity
              AND copied_item.purchase_unit_id = old_item.purchase_unit_id
              AND copied_item.base_unit_id = old_item.base_unit_id
              AND copied_item.base_unit_conversion =
                old_item.base_unit_conversion
              AND copied_item.unit_price = old_item.unit_price
              AND copied_item.tax_rate = old_item.tax_rate
              AND copied_item.tax_inclusive = old_item.tax_inclusive
          )
      ) THEN
        RAISE EXCEPTION USING
          ERRCODE = 'P0001',
          MESSAGE = 'SUPPLIER_PURCHASABLE_PRODUCT_CREATE_FAILED',
          DETAIL = 'price_list_copy_incomplete';
      END IF;

      v_child_key := v_parent_key || ':price-list-effective-period';
      SELECT public.command_supplier_price_list_v2(
        p_action => 'update',
        p_price_list_id => v_price_list_id,
        p_new_price_list_id => NULL::uuid,
        p_tenant_id => p_tenant_id,
        p_tenant_supplier_id => p_tenant_supplier_id,
        p_supplier_id => p_supplier_id,
        p_expected_version =>
          (v_price_list_response ->> 'version')::integer,
        p_payload => jsonb_build_object(
          'effective_from', v_priced_at,
          'effective_until', NULL
        ),
        p_actor_user_id => p_actor_user_id,
        p_actor_employee_id => p_actor_employee_id,
        p_idempotency_key => v_child_key
      ) INTO v_price_list_response;
    END IF;

    IF COALESCE(v_price_list_response ->> 'status', '') NOT IN (
      'created', 'updated'
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'SUPPLIER_PURCHASABLE_PRODUCT_CREATE_FAILED',
        DETAIL = COALESCE(
          v_price_list_response ->> 'error_code',
          'price_list_prepare_failed'
        );
    END IF;
    v_price_list_version := (v_price_list_response ->> 'version')::integer;

    v_price_item_id := gen_random_uuid();
    v_child_key := v_parent_key || ':price-item-upsert';
    SELECT public.command_supplier_price_item_v2(
      p_action => 'upsert',
      p_item_id => v_price_item_id,
      p_price_list_id => v_price_list_id,
      p_tenant_id => p_tenant_id,
      p_tenant_supplier_id => p_tenant_supplier_id,
      p_supplier_id => p_supplier_id,
      p_expected_version => v_price_list_version,
      p_payload => jsonb_build_object(
        'sku_id', p_sku_id,
        'unit_price', p_price ->> 'unit_price',
        'tax_rate', p_price ->> 'tax_rate',
        'tax_inclusive', p_price -> 'tax_inclusive'
      ),
      p_actor_user_id => p_actor_user_id,
      p_actor_employee_id => p_actor_employee_id,
      p_idempotency_key => v_child_key
    ) INTO v_price_item_response;
    IF v_price_item_response ->> 'status' IS DISTINCT FROM 'updated' THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'SUPPLIER_PURCHASABLE_PRODUCT_CREATE_FAILED',
        DETAIL = COALESCE(
          v_price_item_response ->> 'error_code',
          'price_item_upsert_failed'
        );
    END IF;
    v_price_list_version := (v_price_item_response ->> 'version')::integer;

    IF v_source_price_list.lifecycle_status = 'published' THEN
      v_child_key := v_parent_key || ':price-list-retire-source';
      SELECT public.command_supplier_price_list_v2(
        p_action => 'retire',
        p_price_list_id => v_source_price_list.id,
        p_new_price_list_id => NULL::uuid,
        p_tenant_id => p_tenant_id,
        p_tenant_supplier_id => p_tenant_supplier_id,
        p_supplier_id => p_supplier_id,
        p_expected_version => v_source_price_list.row_version,
        p_payload => '{}'::jsonb,
        p_actor_user_id => p_actor_user_id,
        p_actor_employee_id => p_actor_employee_id,
        p_idempotency_key => v_child_key
      ) INTO v_price_list_response;
      IF v_price_list_response ->> 'status' IS DISTINCT FROM 'retired' THEN
        RAISE EXCEPTION USING
          ERRCODE = 'P0001',
          MESSAGE = 'SUPPLIER_PURCHASABLE_PRODUCT_CREATE_FAILED',
          DETAIL = COALESCE(
            v_price_list_response ->> 'error_code',
            'price_list_retire_failed'
          );
      END IF;
    END IF;

    v_child_key := v_parent_key || ':price-list-publish';
    SELECT public.command_supplier_price_list_v2(
      p_action => 'publish',
      p_price_list_id => v_price_list_id,
      p_new_price_list_id => NULL::uuid,
      p_tenant_id => p_tenant_id,
      p_tenant_supplier_id => p_tenant_supplier_id,
      p_supplier_id => p_supplier_id,
      p_expected_version => v_price_list_version,
      p_payload => '{}'::jsonb,
      p_actor_user_id => p_actor_user_id,
      p_actor_employee_id => p_actor_employee_id,
      p_idempotency_key => v_child_key
    ) INTO v_price_list_response;
    IF v_price_list_response ->> 'status' IS DISTINCT FROM 'published' THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'SUPPLIER_PURCHASABLE_PRODUCT_CREATE_FAILED',
        DETAIL = COALESCE(
          v_price_list_response ->> 'error_code',
          'price_list_publish_failed'
        );
    END IF;

    SELECT public.resolve_supplier_purchase_order_catalog(
      p_tenant_id,
      p_tenant_supplier_id,
      v_priced_at,
      p_sku ->> 'sku_code',
      1,
      1
    ) INTO v_catalog_response;

    IF jsonb_typeof(v_catalog_response) <> 'object'
      OR jsonb_typeof(v_catalog_response -> 'total') <> 'number'
      OR COALESCE(v_catalog_response ->> 'total', '') !~ '^[0-9]+$'
      OR jsonb_typeof(v_catalog_response -> 'items') <> 'array'
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'SUPPLIER_PURCHASABLE_PRODUCT_CREATE_FAILED',
        DETAIL = 'catalog_result_not_exact';
    END IF;

    -- sku_code is UUID-derived and unique for this newly-created tenant SKU.
    -- The resolver is intentionally fuzzy, so its untruncated total must also
    -- prove that no product/name/code false-positive matched the same keyword.
    IF (v_catalog_response ->> 'total')::bigint <> 1
      OR jsonb_array_length(v_catalog_response -> 'items') <> 1
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'SUPPLIER_PURCHASABLE_PRODUCT_CREATE_FAILED',
        DETAIL = 'catalog_result_not_exact';
    END IF;

    v_catalog_item := v_catalog_response -> 'items' -> 0;

    IF jsonb_typeof(v_catalog_item) <> 'object'
      OR v_catalog_item ->> 'supplier_product_id' IS DISTINCT FROM
        p_product_id::text
      OR v_catalog_item ->> 'supplier_sku_id' IS DISTINCT FROM p_sku_id::text
      OR v_catalog_item ->> 'supplier_price_list_id' IS DISTINCT FROM
        v_price_list_id::text
      OR v_catalog_item ->> 'supplier_price_list_item_id' IS DISTINCT FROM
        v_price_item_id::text
      OR v_catalog_item ->> 'purchase_unit_id' IS DISTINCT FROM
        v_purchase_unit_id::text
      OR v_catalog_item ->> 'base_unit_id' IS DISTINCT FROM
        v_purchase_unit_id::text
      OR jsonb_typeof(v_catalog_item -> 'tax_inclusive') <> 'boolean'
      OR v_catalog_item -> 'tax_inclusive' IS DISTINCT FROM
        p_price -> 'tax_inclusive'
      OR v_price_item_response -> 'item' ->> 'id' IS DISTINCT FROM
        v_price_item_id::text
      OR v_price_item_response -> 'item' ->> 'supplier_price_list_id'
        IS DISTINCT FROM v_price_list_id::text
      OR v_price_item_response -> 'item' ->> 'supplier_product_id'
        IS DISTINCT FROM p_product_id::text
      OR v_price_item_response -> 'item' ->> 'supplier_sku_id'
        IS DISTINCT FROM p_sku_id::text
      OR v_price_item_response -> 'item' ->> 'purchase_unit_id'
        IS DISTINCT FROM v_purchase_unit_id::text
      OR v_price_item_response -> 'item' ->> 'base_unit_id'
        IS DISTINCT FROM v_purchase_unit_id::text
      OR v_price_list_response -> 'price_list' ->> 'id' IS DISTINCT FROM
        v_price_list_id::text
      OR v_price_list_response -> 'price_list' ->> 'tenant_supplier_id'
        IS DISTINCT FROM p_tenant_supplier_id::text
      OR v_price_list_response -> 'price_list' ->> 'supplier_id'
        IS DISTINCT FROM p_supplier_id::text
      OR v_price_list_response -> 'price_list' ->> 'currency'
        IS DISTINCT FROM 'CNY'
      OR v_price_list_response -> 'price_list' ->> 'lifecycle_status'
        IS DISTINCT FROM 'published'
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'SUPPLIER_PURCHASABLE_PRODUCT_CREATE_FAILED',
        DETAIL = 'catalog_item_mismatch';
    END IF;

    IF COALESCE(v_catalog_item ->> 'unit_price', '') !~
        '^(0|[1-9][0-9]{0,11})(\.[0-9]{1,2})?$'
      OR COALESCE(v_catalog_item ->> 'tax_rate', '') !~
        '^(0|1)(\.[0-9]{1,6})?$'
      OR COALESCE(v_price_item_response -> 'item' ->> 'unit_price', '') !~
        '^(0|[1-9][0-9]{0,11})(\.[0-9]{1,2})?$'
      OR COALESCE(v_price_item_response -> 'item' ->> 'tax_rate', '') !~
        '^(0|1)(\.[0-9]{1,6})?$'
      OR COALESCE(v_catalog_item ->> 'base_unit_conversion', '') !~
        '^(0|[1-9][0-9]{0,9})(\.[0-9]{1,8})?$'
      OR COALESCE(
        v_price_item_response -> 'item' ->> 'base_unit_conversion', ''
      ) !~ '^(0|[1-9][0-9]{0,9})(\.[0-9]{1,8})?$'
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'SUPPLIER_PURCHASABLE_PRODUCT_CREATE_FAILED',
        DETAIL = 'catalog_item_mismatch';
    END IF;

    IF (v_catalog_item ->> 'unit_price')::numeric(14, 2) <>
        v_unit_price
      OR (v_catalog_item ->> 'tax_rate')::numeric(7, 6) <> v_tax_rate
      OR (v_price_item_response -> 'item' ->> 'unit_price')::numeric(14, 2)
        <> v_unit_price
      OR (v_price_item_response -> 'item' ->> 'tax_rate')::numeric(7, 6)
        <> v_tax_rate
      OR (v_catalog_item ->> 'base_unit_conversion')::numeric(18, 8)
        <> 1::numeric
      OR (
        v_price_item_response -> 'item' ->> 'base_unit_conversion'
      )::numeric(18, 8) <> 1::numeric
      OR v_price_item_response -> 'item' -> 'tax_inclusive'
        IS DISTINCT FROM p_price -> 'tax_inclusive'
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'SUPPLIER_PURCHASABLE_PRODUCT_CREATE_FAILED',
        DETAIL = 'catalog_item_mismatch';
    END IF;

    v_response := jsonb_build_object(
      'status', 'created',
      'idempotent', false,
      'product', v_product_response -> 'product',
      'sku', v_sku_response -> 'sku',
      'price', v_price_item_response -> 'item',
      'catalog_item', v_catalog_item
    );

    INSERT INTO public.supplier_command_events (
      tenant_id,
      resource_type,
      resource_id,
      command,
      from_state,
      to_state,
      reason,
      actor_user_id,
      actor_employee_id,
      idempotency_key,
      result_version
    ) VALUES (
      p_tenant_id,
      'supplier_product',
      p_product_id,
      'supplier_purchasable_product_v1:create',
      jsonb_build_object(
        '_fingerprint', v_parent_fingerprint,
        '_request', v_parent_request
      ),
      v_response,
      NULL,
      p_actor_user_id,
      p_actor_employee_id,
      v_parent_key,
      (v_product_response ->> 'version')::integer
    );
  EXCEPTION
    WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS v_constraint_name = CONSTRAINT_NAME;
      IF v_constraint_name IN (
        'supplier_products_pkey',
        'supplier_products_id_supplier_key',
        'supplier_products_tenant_code_unique_idx',
        'supplier_skus_pkey',
        'supplier_skus_id_supplier_key',
        'supplier_skus_tenant_code_unique_idx'
      ) THEN
        RETURN jsonb_build_object(
          'status', 'state_conflict',
          'idempotent', false,
          'error_code', 'SUPPLIER_PURCHASABLE_PRODUCT_CREATE_FAILED',
          'reason', 'unique_conflict'
        );
      ELSIF v_constraint_name =
        'supplier_command_events_actor_user_id_idempotency_key_key'
      THEN
        RAISE EXCEPTION USING
          ERRCODE = 'P0001',
          MESSAGE = 'SUPPLIER_IDEMPOTENCY_CONFLICT';
      ELSE
        RAISE;
      END IF;
    WHEN SQLSTATE 'P0001' THEN
      GET STACKED DIAGNOSTICS
        v_error_message = MESSAGE_TEXT,
        v_error_detail = PG_EXCEPTION_DETAIL;
      IF v_error_message = 'SUPPLIER_PURCHASABLE_PRODUCT_CREATE_FAILED' THEN
        RETURN jsonb_build_object(
          'status', 'state_conflict',
          'idempotent', false,
          'error_code', 'SUPPLIER_PURCHASABLE_PRODUCT_CREATE_FAILED',
          'reason', COALESCE(v_error_detail, 'state_conflict')
        );
      ELSIF v_error_message = 'SUPPLIER_PROXY_ACTOR_INVALID' THEN
        RETURN jsonb_build_object(
          'status', 'validation_error',
          'idempotent', false,
          'error_code', 'SUPPLIER_PROXY_ACTOR_INVALID',
          'reason', 'actor_invalid'
        );
      ELSIF v_error_message IN (
        'TENANT_SUPPLIER_NOT_FOUND',
        'SUPPLIER_NOT_FOUND',
        'SUPPLIER_ORDER_NOT_ELIGIBLE',
        'SUPPLIER_PRODUCT_STATE_CONFLICT',
        'SUPPLIER_SKU_STATE_CONFLICT',
        'SUPPLIER_PRICE_LIST_INVALID_ACTION',
        'UNIT_CONVERSION_INVALID'
      ) THEN
        RETURN jsonb_build_object(
          'status', 'state_conflict',
          'idempotent', false,
          'error_code', v_error_message,
          'reason', COALESCE(v_error_detail, 'state_conflict')
        );
      ELSE
        RAISE;
      END IF;
  END;

  RETURN v_response;
END;
$$;

REVOKE ALL ON FUNCTION public.command_supplier_purchasable_product_v1(
  uuid, uuid, uuid, uuid, uuid, jsonb, jsonb, jsonb, uuid, uuid, text
)
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.command_supplier_purchasable_product_v1(
  uuid, uuid, uuid, uuid, uuid, jsonb, jsonb, jsonb, uuid, uuid, text
)
TO service_role;

COMMIT;
