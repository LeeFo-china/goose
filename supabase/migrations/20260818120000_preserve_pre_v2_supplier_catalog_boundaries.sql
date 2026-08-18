-- Rollback: forward-only. Before replacing this compatibility layer, disable
-- the pre-v2 supplier product and price write routes, then install replacement
-- guard functions and triggers in a new forward migration. Do not remove the
-- ownership or tenant columns and do not edit previously applied migrations.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

CREATE OR REPLACE FUNCTION public.guard_supplier_product_ownership()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_supplier public.suppliers%ROWTYPE;
  v_category public.catalog_categories%ROWTYPE;
  v_brand public.catalog_brands%ROWTYPE;
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
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_OWNERSHIP_IMMUTABLE';
  END IF;

  SELECT * INTO v_supplier
  FROM public.suppliers
  WHERE id = NEW.supplier_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'PRODUCT_OWNERSHIP_CONFLICT';
  END IF;

  IF NEW.ownership_scope = 'platform' THEN
    IF v_supplier.ownership_scope IS DISTINCT FROM 'platform'
      OR v_supplier.owner_tenant_id IS NOT NULL
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'PRODUCT_OWNERSHIP_CONFLICT';
    END IF;
  ELSIF NEW.ownership_scope = 'tenant' THEN
    IF NEW.owner_tenant_id IS DISTINCT FROM NEW.acting_tenant_id
      OR (
        v_supplier.ownership_scope = 'tenant'
        AND v_supplier.owner_tenant_id IS DISTINCT FROM NEW.owner_tenant_id
      )
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'PRODUCT_OWNERSHIP_CONFLICT';
    END IF;
  ELSE
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'PRODUCT_OWNERSHIP_CONFLICT';
  END IF;

  SELECT * INTO v_category
  FROM public.catalog_categories
  WHERE id = NEW.category_id;

  IF NOT FOUND
    OR (
      NEW.ownership_scope = 'platform'
      AND v_category.ownership_scope IS DISTINCT FROM 'platform'
    )
    OR (
      NEW.ownership_scope = 'tenant'
      AND v_category.ownership_scope = 'tenant'
      AND v_category.owner_tenant_id IS DISTINCT FROM NEW.owner_tenant_id
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'PRODUCT_OWNERSHIP_CONFLICT';
  END IF;

  SELECT * INTO v_brand
  FROM public.catalog_brands
  WHERE id = NEW.brand_id;

  IF NOT FOUND
    OR (
      NEW.ownership_scope = 'platform'
      AND v_brand.ownership_scope IS DISTINCT FROM 'platform'
    )
    OR (
      NEW.ownership_scope = 'tenant'
      AND v_brand.ownership_scope = 'tenant'
      AND v_brand.owner_tenant_id IS DISTINCT FROM NEW.owner_tenant_id
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'PRODUCT_OWNERSHIP_CONFLICT';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_supplier_product_ownership()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.guard_supplier_sku_ownership()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_product public.supplier_products%ROWTYPE;
BEGIN
  SELECT * INTO v_product
  FROM public.supplier_products
  WHERE id = NEW.supplier_product_id
    AND supplier_id = NEW.supplier_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'PRODUCT_OWNERSHIP_CONFLICT';
  END IF;

  IF TG_OP = 'INSERT'
    AND NEW.ownership_scope IS NULL
    AND NEW.owner_tenant_id IS NULL
  THEN
    NEW.ownership_scope := v_product.ownership_scope;
    NEW.owner_tenant_id := v_product.owner_tenant_id;
  END IF;

  IF TG_OP = 'UPDATE'
    AND (
      NEW.ownership_scope IS DISTINCT FROM OLD.ownership_scope
      OR NEW.owner_tenant_id IS DISTINCT FROM OLD.owner_tenant_id
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_OWNERSHIP_IMMUTABLE';
  END IF;

  IF v_product.ownership_scope IS DISTINCT FROM 'tenant'
    OR v_product.owner_tenant_id IS DISTINCT FROM NEW.acting_tenant_id
    OR v_product.ownership_scope IS DISTINCT FROM NEW.ownership_scope
    OR v_product.owner_tenant_id IS DISTINCT FROM NEW.owner_tenant_id
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'PRODUCT_OWNERSHIP_CONFLICT';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_supplier_sku_ownership()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.guard_supplier_product_tenant_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF OLD.ownership_scope IS DISTINCT FROM 'tenant'
    OR OLD.owner_tenant_id IS DISTINCT FROM NEW.acting_tenant_id
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'PRODUCT_OWNERSHIP_CONFLICT';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_supplier_product_tenant_write()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER tr_supplier_products_guard_tenant_write
BEFORE UPDATE ON public.supplier_products
FOR EACH ROW
EXECUTE FUNCTION public.guard_supplier_product_tenant_write();

CREATE OR REPLACE FUNCTION public.guard_supplier_sku_tenant_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF OLD.ownership_scope IS DISTINCT FROM 'tenant'
    OR OLD.owner_tenant_id IS DISTINCT FROM NEW.acting_tenant_id
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'PRODUCT_OWNERSHIP_CONFLICT';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_supplier_sku_tenant_write()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER tr_supplier_skus_guard_tenant_write
BEFORE UPDATE ON public.supplier_skus
FOR EACH ROW
EXECUTE FUNCTION public.guard_supplier_sku_tenant_write();

CREATE OR REPLACE FUNCTION public.guard_supplier_price_tenant()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_source_tenant_id uuid;
  v_price_list_tenant_id uuid;
  v_sku_ownership_scope text;
  v_sku_owner_tenant_id uuid;
BEGIN
  IF TG_OP = 'INSERT' AND NEW.tenant_id IS NULL THEN
    NEW.tenant_id := NEW.acting_tenant_id;
  END IF;

  IF TG_OP = 'UPDATE'
    AND NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'PRODUCT_OWNERSHIP_CONFLICT';
  END IF;

  IF NEW.tenant_id IS DISTINCT FROM NEW.acting_tenant_id THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'PRODUCT_OWNERSHIP_CONFLICT';
  END IF;

  IF TG_TABLE_NAME = 'supplier_price_lists'
    AND NEW.supersedes_price_list_id IS NOT NULL
  THEN
    SELECT source.tenant_id INTO v_source_tenant_id
    FROM public.supplier_price_lists AS source
    WHERE source.id = NEW.supersedes_price_list_id
      AND source.supplier_id = NEW.supplier_id;

    IF NOT FOUND
      OR v_source_tenant_id IS DISTINCT FROM NEW.tenant_id
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'PRODUCT_OWNERSHIP_CONFLICT';
    END IF;
  ELSIF TG_TABLE_NAME = 'supplier_price_list_items' THEN
    SELECT price_list.tenant_id INTO v_price_list_tenant_id
    FROM public.supplier_price_lists AS price_list
    WHERE price_list.id = NEW.supplier_price_list_id
      AND price_list.supplier_id = NEW.supplier_id;

    IF NOT FOUND
      OR v_price_list_tenant_id IS DISTINCT FROM NEW.tenant_id
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'PRODUCT_OWNERSHIP_CONFLICT';
    END IF;

    SELECT sku.ownership_scope, sku.owner_tenant_id
    INTO v_sku_ownership_scope, v_sku_owner_tenant_id
    FROM public.supplier_skus AS sku
    WHERE sku.id = NEW.supplier_sku_id
      AND sku.supplier_id = NEW.supplier_id;

    IF NOT FOUND
      OR (
        v_sku_ownership_scope = 'tenant'
        AND v_sku_owner_tenant_id IS DISTINCT FROM NEW.tenant_id
      )
      OR (
        v_sku_ownership_scope IS NULL
        AND v_sku_owner_tenant_id IS NOT NULL
      )
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'PRODUCT_OWNERSHIP_CONFLICT';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_supplier_price_tenant()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER tr_supplier_price_lists_guard_source_tenant
BEFORE UPDATE OF supersedes_price_list_id
ON public.supplier_price_lists
FOR EACH ROW
EXECUTE FUNCTION public.guard_supplier_price_tenant();

CREATE TRIGGER tr_supplier_price_items_guard_scope
BEFORE UPDATE OF supplier_price_list_id, supplier_sku_id
ON public.supplier_price_list_items
FOR EACH ROW
EXECUTE FUNCTION public.guard_supplier_price_tenant();

-- The pre-v2 lifecycle functions read row state before they attempt an update.
-- Wrap them with an immutable tenant-scope check so a version/status conflict
-- cannot reveal another tenant's resource metadata.

ALTER FUNCTION public.mutate_supplier_product(
  uuid, uuid, uuid, text, integer, uuid, uuid, text, text
)
RENAME TO mutate_supplier_product_pre_v2_unsafe;

REVOKE ALL ON FUNCTION public.mutate_supplier_product_pre_v2_unsafe(
  uuid, uuid, uuid, text, integer, uuid, uuid, text, text
)
FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.mutate_supplier_product(
  p_tenant_id uuid,
  p_supplier_id uuid,
  p_product_id uuid,
  p_action text,
  p_expected_version integer,
  p_actor_user_id uuid,
  p_actor_employee_id uuid,
  p_idempotency_key text,
  p_proxy_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.supplier_command_events AS event
    WHERE event.actor_user_id = p_actor_user_id
      AND event.idempotency_key = p_idempotency_key
      AND event.tenant_id IS NOT DISTINCT FROM p_tenant_id
  ) THEN
    PERFORM product.id
    FROM public.supplier_products AS product
    WHERE product.id = p_product_id
      AND product.supplier_id = p_supplier_id
      AND product.ownership_scope = 'tenant'
      AND product.owner_tenant_id = p_tenant_id
    FOR SHARE;

    IF NOT FOUND THEN
      RETURN jsonb_build_object(
        'status', 'not_found',
        'error_code', 'SUPPLIER_PRODUCT_NOT_FOUND'
      );
    END IF;
  END IF;

  RETURN public.mutate_supplier_product_pre_v2_unsafe(
    p_tenant_id,
    p_supplier_id,
    p_product_id,
    p_action,
    p_expected_version,
    p_actor_user_id,
    p_actor_employee_id,
    p_idempotency_key,
    p_proxy_reason
  );
END;
$$;

REVOKE ALL ON FUNCTION public.mutate_supplier_product(
  uuid, uuid, uuid, text, integer, uuid, uuid, text, text
)
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.mutate_supplier_product(
  uuid, uuid, uuid, text, integer, uuid, uuid, text, text
)
TO service_role;

ALTER FUNCTION public.mutate_supplier_sku_for_product(
  uuid, uuid, uuid, uuid, text, integer, uuid, uuid, text, text
)
RENAME TO mutate_supplier_sku_for_product_pre_v2_unsafe;

REVOKE ALL ON FUNCTION public.mutate_supplier_sku_for_product_pre_v2_unsafe(
  uuid, uuid, uuid, uuid, text, integer, uuid, uuid, text, text
)
FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.mutate_supplier_sku(
  uuid, uuid, uuid, text, integer, uuid, uuid, text, text
)
FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.mutate_supplier_sku_for_product(
  p_tenant_id uuid,
  p_supplier_id uuid,
  p_product_id uuid,
  p_sku_id uuid,
  p_action text,
  p_expected_version integer,
  p_actor_user_id uuid,
  p_actor_employee_id uuid,
  p_idempotency_key text,
  p_proxy_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.supplier_command_events AS event
    WHERE event.actor_user_id = p_actor_user_id
      AND event.idempotency_key = p_idempotency_key
      AND event.tenant_id IS NOT DISTINCT FROM p_tenant_id
  ) THEN
    PERFORM sku.id
    FROM public.supplier_skus AS sku
    JOIN public.supplier_products AS product
      ON product.id = sku.supplier_product_id
      AND product.supplier_id = sku.supplier_id
    WHERE sku.id = p_sku_id
      AND sku.supplier_id = p_supplier_id
      AND sku.supplier_product_id = p_product_id
      AND sku.ownership_scope = 'tenant'
      AND sku.owner_tenant_id = p_tenant_id
      AND product.ownership_scope = 'tenant'
      AND product.owner_tenant_id = p_tenant_id
    FOR SHARE OF sku, product;

    IF NOT FOUND THEN
      RETURN jsonb_build_object(
        'status', 'not_found',
        'error_code', 'SUPPLIER_SKU_NOT_FOUND'
      );
    END IF;
  END IF;

  RETURN public.mutate_supplier_sku_for_product_pre_v2_unsafe(
    p_tenant_id,
    p_supplier_id,
    p_product_id,
    p_sku_id,
    p_action,
    p_expected_version,
    p_actor_user_id,
    p_actor_employee_id,
    p_idempotency_key,
    p_proxy_reason
  );
END;
$$;

REVOKE ALL ON FUNCTION public.mutate_supplier_sku_for_product(
  uuid, uuid, uuid, uuid, text, integer, uuid, uuid, text, text
)
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.mutate_supplier_sku_for_product(
  uuid, uuid, uuid, uuid, text, integer, uuid, uuid, text, text
)
TO service_role;

ALTER FUNCTION public.publish_supplier_price_list(
  uuid, uuid, uuid, integer, uuid, uuid, text, text
)
RENAME TO publish_supplier_price_list_pre_v2_unsafe;

REVOKE ALL ON FUNCTION public.publish_supplier_price_list_pre_v2_unsafe(
  uuid, uuid, uuid, integer, uuid, uuid, text, text
)
FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.publish_supplier_price_list(
  p_price_list_id uuid,
  p_tenant_id uuid,
  p_supplier_id uuid,
  p_expected_version integer,
  p_actor_user_id uuid,
  p_actor_employee_id uuid,
  p_idempotency_key text,
  p_proxy_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.supplier_command_events AS event
    WHERE event.actor_user_id = p_actor_user_id
      AND event.idempotency_key = p_idempotency_key
      AND event.tenant_id IS NOT DISTINCT FROM p_tenant_id
  ) AND NOT EXISTS (
    SELECT 1
    FROM public.supplier_price_lists AS price_list
    WHERE price_list.id = p_price_list_id
      AND price_list.supplier_id = p_supplier_id
      AND price_list.tenant_id = p_tenant_id
  ) THEN
    RETURN jsonb_build_object(
      'status', 'not_found',
      'error_code', 'SUPPLIER_PRICE_LIST_NOT_FOUND'
    );
  END IF;

  RETURN public.publish_supplier_price_list_pre_v2_unsafe(
    p_price_list_id,
    p_tenant_id,
    p_supplier_id,
    p_expected_version,
    p_actor_user_id,
    p_actor_employee_id,
    p_idempotency_key,
    p_proxy_reason
  );
END;
$$;

REVOKE ALL ON FUNCTION public.publish_supplier_price_list(
  uuid, uuid, uuid, integer, uuid, uuid, text, text
)
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.publish_supplier_price_list(
  uuid, uuid, uuid, integer, uuid, uuid, text, text
)
TO service_role;

ALTER FUNCTION public.create_supplier_price_list_version(
  uuid, uuid, uuid, uuid, integer, uuid, uuid, text, text
)
RENAME TO create_supplier_price_list_version_pre_v2_unsafe;

REVOKE ALL ON FUNCTION public.create_supplier_price_list_version_pre_v2_unsafe(
  uuid, uuid, uuid, uuid, integer, uuid, uuid, text, text
)
FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.create_supplier_price_list_version(
  p_new_price_list_id uuid,
  p_tenant_id uuid,
  p_supplier_id uuid,
  p_source_price_list_id uuid,
  p_expected_version integer,
  p_actor_user_id uuid,
  p_actor_employee_id uuid,
  p_idempotency_key text,
  p_proxy_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.supplier_command_events AS event
    WHERE event.actor_user_id = p_actor_user_id
      AND event.idempotency_key = p_idempotency_key
      AND event.tenant_id IS NOT DISTINCT FROM p_tenant_id
  ) AND NOT EXISTS (
    SELECT 1
    FROM public.supplier_price_lists AS source
    WHERE source.id = p_source_price_list_id
      AND source.supplier_id = p_supplier_id
      AND source.tenant_id = p_tenant_id
  ) THEN
    RETURN jsonb_build_object(
      'status', 'not_found',
      'error_code', 'SUPPLIER_PRICE_LIST_NOT_FOUND'
    );
  END IF;

  RETURN public.create_supplier_price_list_version_pre_v2_unsafe(
    p_new_price_list_id,
    p_tenant_id,
    p_supplier_id,
    p_source_price_list_id,
    p_expected_version,
    p_actor_user_id,
    p_actor_employee_id,
    p_idempotency_key,
    p_proxy_reason
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_supplier_price_list_version(
  uuid, uuid, uuid, uuid, integer, uuid, uuid, text, text
)
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.create_supplier_price_list_version(
  uuid, uuid, uuid, uuid, integer, uuid, uuid, text, text
)
TO service_role;

ALTER FUNCTION public.retire_supplier_price_list(
  uuid, uuid, uuid, integer, uuid, uuid, text, text
)
RENAME TO retire_supplier_price_list_pre_v2_unsafe;

REVOKE ALL ON FUNCTION public.retire_supplier_price_list_pre_v2_unsafe(
  uuid, uuid, uuid, integer, uuid, uuid, text, text
)
FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.retire_supplier_price_list(
  p_price_list_id uuid,
  p_tenant_id uuid,
  p_supplier_id uuid,
  p_expected_version integer,
  p_actor_user_id uuid,
  p_actor_employee_id uuid,
  p_idempotency_key text,
  p_proxy_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.supplier_command_events AS event
    WHERE event.actor_user_id = p_actor_user_id
      AND event.idempotency_key = p_idempotency_key
      AND event.tenant_id IS NOT DISTINCT FROM p_tenant_id
  ) AND NOT EXISTS (
    SELECT 1
    FROM public.supplier_price_lists AS price_list
    WHERE price_list.id = p_price_list_id
      AND price_list.supplier_id = p_supplier_id
      AND price_list.tenant_id = p_tenant_id
  ) THEN
    RETURN jsonb_build_object(
      'status', 'not_found',
      'error_code', 'SUPPLIER_PRICE_LIST_NOT_FOUND'
    );
  END IF;

  RETURN public.retire_supplier_price_list_pre_v2_unsafe(
    p_price_list_id,
    p_tenant_id,
    p_supplier_id,
    p_expected_version,
    p_actor_user_id,
    p_actor_employee_id,
    p_idempotency_key,
    p_proxy_reason
  );
END;
$$;

REVOKE ALL ON FUNCTION public.retire_supplier_price_list(
  uuid, uuid, uuid, integer, uuid, uuid, text, text
)
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.retire_supplier_price_list(
  uuid, uuid, uuid, integer, uuid, uuid, text, text
)
TO service_role;

ALTER FUNCTION public.upsert_supplier_price_list_item(
  uuid, uuid, uuid, uuid, uuid, numeric, numeric, boolean,
  integer, uuid, uuid, text, text
)
RENAME TO upsert_supplier_price_list_item_pre_v2_unsafe;

REVOKE ALL ON FUNCTION public.upsert_supplier_price_list_item_pre_v2_unsafe(
  uuid, uuid, uuid, uuid, uuid, numeric, numeric, boolean,
  integer, uuid, uuid, text, text
)
FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.upsert_supplier_price_list_item(
  p_item_id uuid,
  p_price_list_id uuid,
  p_tenant_id uuid,
  p_supplier_id uuid,
  p_sku_id uuid,
  p_unit_price numeric,
  p_tax_rate numeric,
  p_tax_inclusive boolean,
  p_expected_version integer,
  p_actor_user_id uuid,
  p_actor_employee_id uuid,
  p_idempotency_key text,
  p_proxy_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.supplier_command_events AS event
    WHERE event.actor_user_id = p_actor_user_id
      AND event.idempotency_key = p_idempotency_key
      AND event.tenant_id IS NOT DISTINCT FROM p_tenant_id
  ) THEN
    PERFORM price_list.id
    FROM public.supplier_price_lists AS price_list
    WHERE price_list.id = p_price_list_id
      AND price_list.supplier_id = p_supplier_id
      AND price_list.tenant_id = p_tenant_id
    FOR SHARE;

    IF NOT FOUND THEN
      RETURN jsonb_build_object(
        'status', 'not_found',
        'error_code', 'SUPPLIER_PRICE_LIST_NOT_FOUND'
      );
    END IF;

    PERFORM sku.id
    FROM public.supplier_skus AS sku
    WHERE sku.id = p_sku_id
      AND sku.supplier_id = p_supplier_id
      AND (
        (sku.ownership_scope = 'platform' AND sku.owner_tenant_id IS NULL)
        OR (
          sku.ownership_scope = 'tenant'
          AND sku.owner_tenant_id = p_tenant_id
        )
        OR (
          sku.ownership_scope IS NULL
          AND sku.owner_tenant_id IS NULL
        )
      )
    FOR SHARE;

    IF NOT FOUND THEN
      RETURN jsonb_build_object(
        'status', 'not_found',
        'error_code', 'SUPPLIER_SKU_NOT_FOUND'
      );
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.supplier_price_list_items AS item
      WHERE item.id = p_item_id
    ) AND NOT EXISTS (
      SELECT 1
      FROM public.supplier_price_list_items AS item
      WHERE item.id = p_item_id
        AND item.supplier_price_list_id = p_price_list_id
        AND item.supplier_id = p_supplier_id
        AND item.tenant_id = p_tenant_id
    ) THEN
      RETURN jsonb_build_object(
        'status', 'state_conflict',
        'error_code', 'SUPPLIER_PRICE_LIST_INVALID_ACTION'
      );
    END IF;
  END IF;

  RETURN public.upsert_supplier_price_list_item_pre_v2_unsafe(
    p_item_id,
    p_price_list_id,
    p_tenant_id,
    p_supplier_id,
    p_sku_id,
    p_unit_price,
    p_tax_rate,
    p_tax_inclusive,
    p_expected_version,
    p_actor_user_id,
    p_actor_employee_id,
    p_idempotency_key,
    p_proxy_reason
  );
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_supplier_price_list_item(
  uuid, uuid, uuid, uuid, uuid, numeric, numeric, boolean,
  integer, uuid, uuid, text, text
)
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.upsert_supplier_price_list_item(
  uuid, uuid, uuid, uuid, uuid, numeric, numeric, boolean,
  integer, uuid, uuid, text, text
)
TO service_role;

ALTER FUNCTION public.delete_supplier_price_list_item(
  uuid, uuid, uuid, uuid, integer, uuid, uuid, text, text
)
RENAME TO delete_supplier_price_list_item_pre_v2_unsafe;

REVOKE ALL ON FUNCTION public.delete_supplier_price_list_item_pre_v2_unsafe(
  uuid, uuid, uuid, uuid, integer, uuid, uuid, text, text
)
FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.delete_supplier_price_list_item(
  p_item_id uuid,
  p_price_list_id uuid,
  p_tenant_id uuid,
  p_supplier_id uuid,
  p_expected_version integer,
  p_actor_user_id uuid,
  p_actor_employee_id uuid,
  p_idempotency_key text,
  p_proxy_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.supplier_command_events AS event
    WHERE event.actor_user_id = p_actor_user_id
      AND event.idempotency_key = p_idempotency_key
      AND event.tenant_id IS NOT DISTINCT FROM p_tenant_id
  ) THEN
    PERFORM price_list.id
    FROM public.supplier_price_lists AS price_list
    WHERE price_list.id = p_price_list_id
      AND price_list.supplier_id = p_supplier_id
      AND price_list.tenant_id = p_tenant_id
    FOR SHARE;

    IF NOT FOUND THEN
      RETURN jsonb_build_object(
        'status', 'not_found',
        'error_code', 'SUPPLIER_PRICE_LIST_NOT_FOUND'
      );
    END IF;

    PERFORM item.id
    FROM public.supplier_price_list_items AS item
    WHERE item.id = p_item_id
      AND item.supplier_price_list_id = p_price_list_id
      AND item.supplier_id = p_supplier_id
      AND item.tenant_id = p_tenant_id
    FOR SHARE;

    IF NOT FOUND THEN
      RETURN jsonb_build_object(
        'status', 'not_found',
        'error_code', 'SUPPLIER_PRICE_ITEM_NOT_FOUND'
      );
    END IF;
  END IF;

  RETURN public.delete_supplier_price_list_item_pre_v2_unsafe(
    p_item_id,
    p_price_list_id,
    p_tenant_id,
    p_supplier_id,
    p_expected_version,
    p_actor_user_id,
    p_actor_employee_id,
    p_idempotency_key,
    p_proxy_reason
  );
END;
$$;

REVOKE ALL ON FUNCTION public.delete_supplier_price_list_item(
  uuid, uuid, uuid, uuid, integer, uuid, uuid, text, text
)
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.delete_supplier_price_list_item(
  uuid, uuid, uuid, uuid, integer, uuid, uuid, text, text
)
TO service_role;

COMMIT;
