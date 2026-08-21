-- Rollback: forward-only. In a reviewed maintenance-window migration, first
-- revoke EXECUTE on the two v2 commands, restore the prior operation_source
-- and proxy_reason constraints only after proving no tenant rows remain, and
-- drop the private v2 context helper. Never reopen the legacy six writers;
-- replace them only with an equally authorized, atomic and audited command.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

ALTER TABLE public.supplier_price_lists
  ALTER COLUMN proxy_reason DROP NOT NULL,
  DROP CONSTRAINT supplier_price_lists_operation_source_check,
  DROP CONSTRAINT supplier_price_lists_proxy_reason_check,
  ADD CONSTRAINT supplier_price_lists_operation_source_check
    CHECK (operation_source IN ('tenant_proxy', 'tenant')),
  ADD CONSTRAINT supplier_price_lists_proxy_reason_check CHECK (
    (
      operation_source = 'tenant'
      AND proxy_reason IS NULL
    )
    OR (
      operation_source = 'tenant_proxy'
      AND proxy_reason = btrim(proxy_reason)
      AND proxy_reason <> ''
    )
  );

ALTER TABLE public.supplier_price_list_items
  ALTER COLUMN proxy_reason DROP NOT NULL,
  DROP CONSTRAINT supplier_price_items_operation_source_check,
  DROP CONSTRAINT supplier_price_items_proxy_reason_check,
  ADD CONSTRAINT supplier_price_items_operation_source_check
    CHECK (operation_source IN ('tenant_proxy', 'tenant')),
  ADD CONSTRAINT supplier_price_items_proxy_reason_check CHECK (
    (
      operation_source = 'tenant'
      AND proxy_reason IS NULL
    )
    OR (
      operation_source = 'tenant_proxy'
      AND proxy_reason = btrim(proxy_reason)
      AND proxy_reason <> ''
    )
  );

CREATE FUNCTION public.assert_supplier_price_v2_context(
  p_tenant_id uuid,
  p_tenant_supplier_id uuid,
  p_supplier_id uuid,
  p_actor_user_id uuid,
  p_actor_employee_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM employee.id
  FROM public.employees AS employee
  WHERE employee.id = p_actor_employee_id
    AND employee.user_id = p_actor_user_id
    AND employee.tenant_id = p_tenant_id
    AND employee.status = 'active'
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_PROXY_ACTOR_INVALID';
  END IF;

  PERFORM relationship.id
  FROM public.tenant_suppliers AS relationship
  JOIN public.suppliers AS supplier
    ON supplier.id = relationship.supplier_id
  WHERE relationship.id = p_tenant_supplier_id
    AND relationship.tenant_id = p_tenant_id
    AND relationship.supplier_id = p_supplier_id
    AND relationship.relationship_status = 'active'
    AND supplier.onboarding_status = 'approved'
    AND supplier.operational_status = 'active'
  FOR SHARE OF relationship, supplier;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_ORDER_NOT_ELIGIBLE';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_supplier_price_v2_context(
  uuid, uuid, uuid, uuid, uuid
)
FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.command_supplier_price_list_v2(
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
      RETURN jsonb_build_object(
        'status', 'state_conflict',
        'error_code', 'SUPPLIER_PRICE_LIST_INVALID_ACTION'
      );
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

CREATE FUNCTION public.command_supplier_price_item_v2(
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
      RETURN jsonb_build_object(
        'status', 'state_conflict',
        'error_code', 'SUPPLIER_PRICE_LIST_INVALID_ACTION',
        'reason', 'duplicate_sku_or_item'
      );
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

REVOKE ALL ON FUNCTION public.create_supplier_price_list(
  uuid, uuid, uuid, text, text, text, timestamptz, timestamptz,
  uuid, uuid, text, text
)
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.publish_supplier_price_list(
  uuid, uuid, uuid, integer, uuid, uuid, text, text
)
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.create_supplier_price_list_version(
  uuid, uuid, uuid, uuid, integer, uuid, uuid, text, text
)
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.retire_supplier_price_list(
  uuid, uuid, uuid, integer, uuid, uuid, text, text
)
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.upsert_supplier_price_list_item(
  uuid, uuid, uuid, uuid, uuid, numeric, numeric, boolean,
  integer, uuid, uuid, text, text
)
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.delete_supplier_price_list_item(
  uuid, uuid, uuid, uuid, integer, uuid, uuid, text, text
)
FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON TABLE public.supplier_price_lists
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.supplier_price_list_items
FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.supplier_price_lists TO service_role;
GRANT SELECT ON TABLE public.supplier_price_list_items TO service_role;

COMMIT;
