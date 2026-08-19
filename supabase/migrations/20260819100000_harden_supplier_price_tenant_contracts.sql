-- Rollback: forward-only and maintenance-window only. First revoke EXECUTE on
-- all six public price commands and disable direct price writes. Export and
-- preserve every published/retired list, item, and supplier command event. In
-- a reviewed forward migration, restore create_supplier_price_list from
-- 20260813180000, the five compatibility wrappers and four legacy guards from
-- 20260818120000, and the published-data lock from 20260729160000. Drop the v2
-- triggers/helpers, composite keys, tenant indexes, and nullable identity
-- columns only after reconciling every dependent purchase reference. Recreate
-- the legacy global version and draft keys only after proving one tenant owns
-- every normalized series. If either proof fails, do not downgrade. Never edit
-- an applied migration or delete published price history.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

-- Reject normalized duplicates before replacing the legacy exact/global keys.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.supplier_price_lists AS price_list
    GROUP BY
      price_list.tenant_id,
      price_list.supplier_id,
      upper(btrim(price_list.price_list_code)),
      price_list.version_number
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_PRICE_LIST_INVALID_ACTION',
      DETAIL = 'tenant_series_duplicate';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.supplier_price_lists AS price_list
    WHERE price_list.lifecycle_status = 'draft'
    GROUP BY
      price_list.tenant_id,
      price_list.supplier_id,
      upper(btrim(price_list.price_list_code))
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_PRICE_LIST_INVALID_ACTION',
      DETAIL = 'tenant_draft_duplicate';
  END IF;
END;
$$;

ALTER TABLE public.supplier_price_lists
  ADD COLUMN tenant_supplier_id uuid NULL;

ALTER TABLE public.supplier_price_list_items
  ADD COLUMN supplier_product_id uuid NULL;

-- Both backfills use existing unique identities. Missing relationships remain
-- NULL and readable; every subsequent write fails closed until reconciled.
ALTER TABLE public.supplier_price_lists DISABLE TRIGGER USER;
ALTER TABLE public.supplier_price_list_items DISABLE TRIGGER USER;

UPDATE public.supplier_price_lists AS price_list
SET tenant_supplier_id = relationship.id
FROM public.tenant_suppliers AS relationship
WHERE relationship.tenant_id = price_list.tenant_id
  AND relationship.supplier_id = price_list.supplier_id
  AND price_list.tenant_supplier_id IS NULL;

UPDATE public.supplier_price_list_items AS item
SET supplier_product_id = sku.supplier_product_id
FROM public.supplier_skus AS sku
WHERE sku.id = item.supplier_sku_id
  AND sku.supplier_id = item.supplier_id
  AND item.supplier_product_id IS NULL;

ALTER TABLE public.supplier_price_lists ENABLE TRIGGER USER;
ALTER TABLE public.supplier_price_list_items ENABLE TRIGGER USER;

ALTER TABLE public.supplier_price_lists
  DROP CONSTRAINT supplier_price_lists_supplier_version_key;

DROP INDEX supplier_price_lists_one_draft_idx;

ALTER TABLE public.supplier_price_lists
  ADD CONSTRAINT supplier_price_lists_id_tenant_supplier_key
  UNIQUE (id, tenant_id, supplier_id);

ALTER TABLE public.supplier_price_lists
  ADD CONSTRAINT supplier_price_lists_relationship_fkey
  FOREIGN KEY (tenant_supplier_id, tenant_id, supplier_id)
  REFERENCES public.tenant_suppliers(id, tenant_id, supplier_id)
  ON DELETE RESTRICT
  NOT VALID;

ALTER TABLE public.supplier_price_lists
  ADD CONSTRAINT supplier_price_lists_supersedes_tenant_fkey
  FOREIGN KEY (supersedes_price_list_id, tenant_id, supplier_id)
  REFERENCES public.supplier_price_lists(id, tenant_id, supplier_id)
  ON DELETE RESTRICT
  NOT VALID;

ALTER TABLE public.supplier_price_list_items
  ADD CONSTRAINT supplier_price_items_list_tenant_supplier_fkey
  FOREIGN KEY (supplier_price_list_id, tenant_id, supplier_id)
  REFERENCES public.supplier_price_lists(id, tenant_id, supplier_id)
  ON DELETE RESTRICT
  NOT VALID;

ALTER TABLE public.supplier_price_list_items
  ADD CONSTRAINT supplier_price_items_product_supplier_fkey
  FOREIGN KEY (supplier_product_id, supplier_id)
  REFERENCES public.supplier_products(id, supplier_id)
  ON DELETE RESTRICT
  NOT VALID;

ALTER TABLE public.supplier_price_lists
  VALIDATE CONSTRAINT supplier_price_lists_relationship_fkey;
ALTER TABLE public.supplier_price_list_items
  VALIDATE CONSTRAINT supplier_price_items_list_tenant_supplier_fkey;
ALTER TABLE public.supplier_price_list_items
  VALIDATE CONSTRAINT supplier_price_items_product_supplier_fkey;

CREATE UNIQUE INDEX supplier_price_lists_tenant_series_version_uidx
ON public.supplier_price_lists(
  tenant_id,
  supplier_id,
  upper(btrim(price_list_code)),
  version_number
);

CREATE UNIQUE INDEX supplier_price_lists_tenant_one_draft_uidx
ON public.supplier_price_lists(
  tenant_id,
  supplier_id,
  upper(btrim(price_list_code))
)
WHERE lifecycle_status = 'draft';

CREATE INDEX supplier_price_lists_tenant_supplier_status_idx
ON public.supplier_price_lists(
  tenant_id,
  supplier_id,
  lifecycle_status,
  effective_from DESC,
  id DESC
);

CREATE INDEX supplier_price_lists_tenant_relationship_status_idx
ON public.supplier_price_lists(
  tenant_id,
  supplier_id,
  tenant_supplier_id,
  lifecycle_status,
  id DESC
);

CREATE INDEX supplier_price_items_tenant_supplier_list_idx
ON public.supplier_price_list_items(
  tenant_id,
  supplier_id,
  supplier_price_list_id,
  supplier_sku_id
);

CREATE INDEX supplier_price_items_tenant_product_sku_idx
ON public.supplier_price_list_items(
  tenant_id,
  supplier_id,
  supplier_product_id,
  supplier_sku_id
);

CREATE FUNCTION public.assert_supplier_price_scope(
  p_tenant_id uuid,
  p_supplier_id uuid,
  p_actor_employee_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_tenant_supplier_id uuid;
BEGIN
  PERFORM public.assert_supplier_proxy_scope(
    p_tenant_id,
    p_supplier_id,
    p_actor_employee_id
  );

  SELECT relationship.id
  INTO v_tenant_supplier_id
  FROM public.tenant_suppliers AS relationship
  WHERE relationship.tenant_id = p_tenant_id
    AND relationship.supplier_id = p_supplier_id
    AND relationship.relationship_status = 'active'
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_ORDER_NOT_ELIGIBLE';
  END IF;

  RETURN v_tenant_supplier_id;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_supplier_price_scope(uuid, uuid, uuid)
FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.resolve_supplier_price_sku(
  p_tenant_id uuid,
  p_supplier_id uuid,
  p_sku_id uuid
)
RETURNS TABLE (
  supplier_product_id uuid,
  purchase_unit_id uuid,
  base_unit_id uuid,
  base_unit_conversion numeric(18, 8),
  product_status text,
  sku_status text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT
    product.id,
    sku.purchase_unit_id,
    sku.base_unit_id,
    sku.base_unit_conversion,
    product.status,
    sku.status
  FROM public.supplier_skus AS sku
  JOIN public.supplier_products AS product
    ON product.id = sku.supplier_product_id
    AND product.supplier_id = sku.supplier_id
  WHERE sku.id = p_sku_id
    AND sku.supplier_id = p_supplier_id
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
    );
$$;

REVOKE ALL ON FUNCTION public.resolve_supplier_price_sku(uuid, uuid, uuid)
FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.guard_supplier_price_tenant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.tenant_id IS NULL
    OR NEW.acting_tenant_id IS NULL
    OR NEW.tenant_id IS DISTINCT FROM NEW.acting_tenant_id
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_PRICE_LIST_INVALID_ACTION';
  END IF;

  IF TG_OP = 'UPDATE'
    AND NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_PRICE_LIST_INVALID_ACTION';
  END IF;

  IF TG_TABLE_NAME = 'supplier_price_lists' THEN
    IF NEW.tenant_supplier_id IS NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'SUPPLIER_PRICE_LIST_INVALID_ACTION';
    END IF;

    IF TG_OP = 'UPDATE' AND (
      NEW.supplier_id IS DISTINCT FROM OLD.supplier_id
      OR NEW.tenant_supplier_id IS DISTINCT FROM OLD.tenant_supplier_id
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'SUPPLIER_PRICE_LIST_INVALID_ACTION';
    END IF;

    PERFORM relationship.id
    FROM public.tenant_suppliers AS relationship
    WHERE relationship.id = NEW.tenant_supplier_id
      AND relationship.tenant_id = NEW.tenant_id
      AND relationship.supplier_id = NEW.supplier_id
      AND relationship.relationship_status = 'active'
    FOR SHARE;

    IF NOT FOUND THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'SUPPLIER_ORDER_NOT_ELIGIBLE';
    END IF;

    IF NEW.supersedes_price_list_id IS NOT NULL THEN
      PERFORM source.id
      FROM public.supplier_price_lists AS source
      WHERE source.id = NEW.supersedes_price_list_id
        AND source.tenant_id = NEW.tenant_id
        AND source.supplier_id = NEW.supplier_id
        AND upper(btrim(source.price_list_code)) =
          upper(btrim(NEW.price_list_code))
      FOR SHARE;

      IF NOT FOUND THEN
        RAISE EXCEPTION USING
          ERRCODE = 'P0001',
          MESSAGE = 'SUPPLIER_PRICE_LIST_INVALID_ACTION';
      END IF;
    END IF;

    RETURN NEW;
  END IF;

  IF NEW.supplier_product_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_PRICE_LIST_INVALID_ACTION';
  END IF;

  PERFORM price_list.id
  FROM public.supplier_price_lists AS price_list
  JOIN public.tenant_suppliers AS relationship
    ON relationship.id = price_list.tenant_supplier_id
    AND relationship.tenant_id = price_list.tenant_id
    AND relationship.supplier_id = price_list.supplier_id
    AND relationship.relationship_status = 'active'
  WHERE price_list.id = NEW.supplier_price_list_id
    AND price_list.tenant_id = NEW.tenant_id
    AND price_list.supplier_id = NEW.supplier_id
  FOR SHARE OF price_list, relationship;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_PRICE_LIST_INVALID_ACTION';
  END IF;

  PERFORM sku.id
  FROM public.supplier_skus AS sku
  JOIN public.supplier_products AS product
    ON product.id = sku.supplier_product_id
    AND product.supplier_id = sku.supplier_id
  WHERE sku.id = NEW.supplier_sku_id
    AND sku.supplier_id = NEW.supplier_id
    AND sku.supplier_product_id = NEW.supplier_product_id
    AND product.id = NEW.supplier_product_id
    AND product.supplier_id = NEW.supplier_id
    AND (
      (
        sku.ownership_scope = 'platform'
        AND sku.owner_tenant_id IS NULL
        AND product.ownership_scope = 'platform'
        AND product.owner_tenant_id IS NULL
      )
      OR (
        sku.ownership_scope = 'tenant'
        AND sku.owner_tenant_id = NEW.tenant_id
        AND product.ownership_scope = 'tenant'
        AND product.owner_tenant_id = NEW.tenant_id
      )
    )
  FOR SHARE OF sku, product;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_PRICE_LIST_INVALID_ACTION';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_supplier_price_tenant()
FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER tr_supplier_price_lists_guard_tenant
ON public.supplier_price_lists;
DROP TRIGGER tr_supplier_price_lists_guard_source_tenant
ON public.supplier_price_lists;
DROP TRIGGER tr_supplier_price_items_guard_tenant
ON public.supplier_price_list_items;
DROP TRIGGER tr_supplier_price_items_guard_scope
ON public.supplier_price_list_items;

CREATE TRIGGER tr_supplier_price_lists_v2_guard_tenant
BEFORE INSERT OR UPDATE ON public.supplier_price_lists
FOR EACH ROW
EXECUTE FUNCTION public.guard_supplier_price_tenant();

CREATE TRIGGER tr_supplier_price_items_v2_guard_tenant
BEFORE INSERT OR UPDATE ON public.supplier_price_list_items
FOR EACH ROW
EXECUTE FUNCTION public.guard_supplier_price_tenant();

CREATE OR REPLACE FUNCTION public.lock_published_supplier_price_data()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_price_list_id uuid;
  v_price_list_status text;
BEGIN
  IF TG_TABLE_NAME = 'supplier_price_lists' THEN
    IF TG_OP = 'DELETE' AND OLD.lifecycle_status <> 'draft' THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'SUPPLIER_PRICE_LIST_INVALID_ACTION';
    END IF;

    IF TG_OP = 'UPDATE' AND OLD.lifecycle_status <> 'draft' THEN
      IF NOT (
        OLD.lifecycle_status = 'published'
        AND NEW.lifecycle_status = 'retired'
        AND NEW.id IS NOT DISTINCT FROM OLD.id
        AND NEW.tenant_id IS NOT DISTINCT FROM OLD.tenant_id
        AND NEW.tenant_supplier_id IS NOT DISTINCT FROM OLD.tenant_supplier_id
        AND NEW.supplier_id IS NOT DISTINCT FROM OLD.supplier_id
        AND NEW.price_list_code IS NOT DISTINCT FROM OLD.price_list_code
        AND NEW.version_number IS NOT DISTINCT FROM OLD.version_number
        AND NEW.scope_type IS NOT DISTINCT FROM OLD.scope_type
        AND NEW.name IS NOT DISTINCT FROM OLD.name
        AND NEW.currency IS NOT DISTINCT FROM OLD.currency
        AND NEW.effective_from IS NOT DISTINCT FROM OLD.effective_from
        AND NEW.effective_until IS NOT DISTINCT FROM OLD.effective_until
        AND NEW.supersedes_price_list_id IS NOT DISTINCT FROM
          OLD.supersedes_price_list_id
        AND NEW.published_at IS NOT DISTINCT FROM OLD.published_at
        AND NEW.acting_tenant_id IS NOT DISTINCT FROM OLD.acting_tenant_id
        AND NEW.operation_source IS NOT DISTINCT FROM OLD.operation_source
        AND NEW.created_by_employee_id IS NOT DISTINCT FROM
          OLD.created_by_employee_id
        AND NEW.created_at IS NOT DISTINCT FROM OLD.created_at
        AND NEW.row_version = OLD.row_version + 1
      ) THEN
        RAISE EXCEPTION USING
          ERRCODE = 'P0001',
          MESSAGE = 'SUPPLIER_PRICE_LIST_INVALID_ACTION';
      END IF;
    END IF;

    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  v_price_list_id := CASE
    WHEN TG_OP = 'INSERT' THEN NEW.supplier_price_list_id
    ELSE OLD.supplier_price_list_id
  END;

  SELECT price_list.lifecycle_status
  INTO v_price_list_status
  FROM public.supplier_price_lists AS price_list
  WHERE price_list.id = v_price_list_id
  FOR SHARE;

  IF v_price_list_status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_PRICE_LIST_INVALID_ACTION';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE'
    AND NEW.supplier_price_list_id IS DISTINCT FROM OLD.supplier_price_list_id
  THEN
    SELECT price_list.lifecycle_status
    INTO v_price_list_status
    FROM public.supplier_price_lists AS price_list
    WHERE price_list.id = NEW.supplier_price_list_id
    FOR SHARE;

    IF v_price_list_status IS DISTINCT FROM 'draft' THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'SUPPLIER_PRICE_LIST_INVALID_ACTION';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.lock_published_supplier_price_data()
FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.create_supplier_price_list(
  p_price_list_id uuid,
  p_tenant_id uuid,
  p_supplier_id uuid,
  p_price_list_code text,
  p_name text,
  p_currency text,
  p_effective_from timestamptz,
  p_effective_until timestamptz,
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
DECLARE
  v_event public.supplier_command_events%ROWTYPE;
  v_price_list public.supplier_price_lists%ROWTYPE;
  v_tenant_supplier_id uuid;
  v_request jsonb;
  v_snapshot jsonb;
BEGIN
  IF p_price_list_id IS NULL OR p_tenant_id IS NULL
    OR p_supplier_id IS NULL
    OR p_price_list_code IS NULL OR btrim(p_price_list_code) = ''
    OR p_name IS NULL OR btrim(p_name) = ''
    OR p_currency IS NULL OR p_currency !~ '^[A-Z]{3}$'
    OR p_effective_from IS NULL
    OR (
      p_effective_until IS NOT NULL
      AND p_effective_until <= p_effective_from
    )
    OR p_actor_user_id IS NULL OR p_actor_employee_id IS NULL
    OR p_idempotency_key IS NULL OR btrim(p_idempotency_key) = ''
    OR char_length(p_idempotency_key) > 120
    OR p_proxy_reason IS NULL OR btrim(p_proxy_reason) = ''
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'SUPPLIER_PRICE_LIST_INVALID_ACTION';
  END IF;

  v_request := jsonb_build_object(
    'tenant_id', p_tenant_id,
    'supplier_id', p_supplier_id,
    'price_list_code', p_price_list_code,
    'name', p_name,
    'currency', p_currency,
    'effective_from', p_effective_from,
    'effective_until', p_effective_until,
    'actor_employee_id', p_actor_employee_id,
    'proxy_reason', p_proxy_reason
  );

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'supplier-command:' || p_actor_user_id::text || ':' ||
        p_idempotency_key,
      0
    )
  );

  SELECT event.*
  INTO v_event
  FROM public.supplier_command_events AS event
  WHERE event.actor_user_id = p_actor_user_id
    AND event.idempotency_key = p_idempotency_key
  FOR UPDATE;

  IF FOUND THEN
    IF v_event.tenant_id IS DISTINCT FROM p_tenant_id
      OR v_event.resource_type <> 'supplier_price_list'
      OR v_event.resource_id <> p_price_list_id
      OR v_event.command <> 'create_supplier_price_list'
      OR v_event.from_state -> '_request' IS DISTINCT FROM v_request
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'SUPPLIER_IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN jsonb_build_object(
      'status', 'created',
      'idempotent', true,
      'price_list', v_event.to_state,
      'version', v_event.result_version
    );
  END IF;

  v_tenant_supplier_id := public.assert_supplier_price_scope(
    p_tenant_id,
    p_supplier_id,
    p_actor_employee_id
  );

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'supplier-price-series:' || p_tenant_id::text || ':' ||
        p_supplier_id::text || ':' || lower(btrim(p_price_list_code)),
      6720240729160000
    )
  );

  IF EXISTS (
    SELECT 1
    FROM public.supplier_price_lists AS existing
    WHERE existing.tenant_id = p_tenant_id
      AND existing.supplier_id = p_supplier_id
      AND upper(btrim(existing.price_list_code)) =
        upper(btrim(p_price_list_code))
  ) THEN
    RETURN jsonb_build_object(
      'status', 'state_conflict',
      'error_code', 'SUPPLIER_PRICE_LIST_INVALID_ACTION'
    );
  END IF;

  BEGIN
    INSERT INTO public.supplier_price_lists (
      id,
      tenant_id,
      tenant_supplier_id,
      supplier_id,
      price_list_code,
      version_number,
      scope_type,
      name,
      currency,
      lifecycle_status,
      effective_from,
      effective_until,
      row_version,
      acting_tenant_id,
      acting_employee_id,
      operation_source,
      proxy_reason,
      created_by_employee_id,
      updated_by_employee_id
    )
    VALUES (
      p_price_list_id,
      p_tenant_id,
      v_tenant_supplier_id,
      p_supplier_id,
      btrim(p_price_list_code),
      1,
      'default',
      btrim(p_name),
      p_currency::char(3),
      'draft',
      p_effective_from,
      p_effective_until,
      1,
      p_tenant_id,
      p_actor_employee_id,
      'tenant_proxy',
      btrim(p_proxy_reason),
      p_actor_employee_id,
      p_actor_employee_id
    )
    RETURNING * INTO v_price_list;
  EXCEPTION
    WHEN unique_violation THEN
      RETURN jsonb_build_object(
        'status', 'state_conflict',
        'error_code', 'SUPPLIER_PRICE_LIST_INVALID_ACTION'
      );
  END;

  v_snapshot := to_jsonb(v_price_list);

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
    'supplier_price_list',
    v_price_list.id,
    'create_supplier_price_list',
    jsonb_build_object('_request', v_request),
    v_snapshot,
    btrim(p_proxy_reason),
    p_actor_user_id,
    p_actor_employee_id,
    p_idempotency_key,
    v_price_list.row_version
  );

  RETURN jsonb_build_object(
    'status', 'created',
    'idempotent', false,
    'price_list', v_snapshot,
    'version', v_price_list.row_version
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.publish_supplier_price_list(
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
DECLARE
  v_event public.supplier_command_events%ROWTYPE;
  v_draft public.supplier_price_lists%ROWTYPE;
  v_tenant_supplier_id uuid;
  v_before jsonb;
  v_request jsonb;
  v_snapshot jsonb;
BEGIN
  IF p_price_list_id IS NULL OR p_tenant_id IS NULL
    OR p_supplier_id IS NULL
    OR p_expected_version IS NULL OR p_expected_version < 1
    OR p_actor_user_id IS NULL OR p_actor_employee_id IS NULL
    OR p_idempotency_key IS NULL OR btrim(p_idempotency_key) = ''
    OR char_length(p_idempotency_key) > 120
    OR p_proxy_reason IS NULL OR btrim(p_proxy_reason) = ''
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'SUPPLIER_PRICE_LIST_INVALID_ACTION';
  END IF;

  v_request := jsonb_build_object(
    'tenant_id', p_tenant_id,
    'supplier_id', p_supplier_id,
    'price_list_id', p_price_list_id,
    'expected_version', p_expected_version,
    'actor_employee_id', p_actor_employee_id,
    'proxy_reason', p_proxy_reason
  );

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'supplier-command:' || p_actor_user_id::text || ':' ||
        p_idempotency_key,
      0
    )
  );

  SELECT event.*
  INTO v_event
  FROM public.supplier_command_events AS event
  WHERE event.actor_user_id = p_actor_user_id
    AND event.idempotency_key = p_idempotency_key
  FOR UPDATE;

  IF FOUND THEN
    IF v_event.tenant_id IS DISTINCT FROM p_tenant_id
      OR v_event.resource_type <> 'supplier_price_list'
      OR v_event.resource_id <> p_price_list_id
      OR v_event.command <> 'publish_supplier_price_list'
      OR v_event.from_state -> '_request' IS DISTINCT FROM v_request
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'SUPPLIER_IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN jsonb_build_object(
      'status', 'published',
      'idempotent', true,
      'price_list', v_event.to_state,
      'version', v_event.result_version
    );
  END IF;

  v_tenant_supplier_id := public.assert_supplier_price_scope(
    p_tenant_id,
    p_supplier_id,
    p_actor_employee_id
  );

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'supplier-price-publish:' || p_tenant_id::text || ':' ||
        p_supplier_id::text,
      6720240729160000
    )
  );

  SELECT draft.*
  INTO v_draft
  FROM public.supplier_price_lists AS draft
  WHERE draft.id = p_price_list_id
    AND draft.tenant_id = p_tenant_id
    AND draft.supplier_id = p_supplier_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'status', 'not_found',
      'error_code', 'SUPPLIER_PRICE_LIST_NOT_FOUND'
    );
  END IF;

  IF v_draft.tenant_supplier_id IS DISTINCT FROM v_tenant_supplier_id THEN
    RETURN jsonb_build_object(
      'status', 'state_conflict',
      'error_code', 'SUPPLIER_PRICE_LIST_INVALID_ACTION'
    );
  END IF;

  IF v_draft.row_version <> p_expected_version THEN
    RETURN jsonb_build_object(
      'status', 'version_conflict',
      'error_code', 'SUPPLIER_PRICE_LIST_VERSION_CONFLICT',
      'version', v_draft.row_version,
      'current_status', v_draft.lifecycle_status
    );
  END IF;

  IF v_draft.lifecycle_status <> 'draft' THEN
    RETURN jsonb_build_object(
      'status', 'state_conflict',
      'error_code', 'SUPPLIER_PRICE_LIST_INVALID_ACTION',
      'version', v_draft.row_version,
      'current_status', v_draft.lifecycle_status
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.supplier_price_list_items AS draft_item
    WHERE draft_item.supplier_price_list_id = v_draft.id
      AND draft_item.tenant_id = v_draft.tenant_id
      AND draft_item.supplier_id = v_draft.supplier_id
  ) THEN
    RETURN jsonb_build_object(
      'status', 'state_conflict',
      'error_code', 'SUPPLIER_PRICE_LIST_INVALID_ACTION',
      'reason', 'empty_price_list'
    );
  END IF;

  -- Row locks close the publication/status race without using a global
  -- supplier lock that would serialize independent tenant price books.
  PERFORM sku.id
  FROM public.supplier_price_list_items AS draft_item
  JOIN public.supplier_skus AS sku
    ON sku.id = draft_item.supplier_sku_id
    AND sku.supplier_id = draft_item.supplier_id
  JOIN public.supplier_products AS product
    ON product.id = sku.supplier_product_id
    AND product.supplier_id = sku.supplier_id
  WHERE draft_item.supplier_price_list_id = v_draft.id
    AND draft_item.tenant_id = v_draft.tenant_id
    AND draft_item.supplier_id = v_draft.supplier_id
  ORDER BY sku.id, product.id
  FOR SHARE OF sku, product;

  IF EXISTS (
    SELECT 1
    FROM public.supplier_price_list_items AS draft_item
    WHERE draft_item.supplier_price_list_id = v_draft.id
      AND draft_item.tenant_id = v_draft.tenant_id
      AND (
        draft_item.supplier_product_id IS NULL
        OR NOT EXISTS (
          SELECT 1
          FROM public.resolve_supplier_price_sku(
            v_draft.tenant_id,
            v_draft.supplier_id,
            draft_item.supplier_sku_id
          ) AS resolved
          WHERE resolved.supplier_product_id = draft_item.supplier_product_id
            AND resolved.product_status = 'active'
            AND resolved.sku_status = 'active'
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
      AND published_item.tenant_id = draft_item.tenant_id
      AND published_item.supplier_id = draft_item.supplier_id
    JOIN public.supplier_price_lists AS published
      ON published.id = published_item.supplier_price_list_id
      AND published.tenant_id = v_draft.tenant_id
      AND published.supplier_id = v_draft.supplier_id
      AND published.lifecycle_status = 'published'
    WHERE draft_item.supplier_price_list_id = v_draft.id
      AND draft_item.tenant_id = v_draft.tenant_id
      AND published.id <> v_draft.id
      AND published.effective_from <
        COALESCE(v_draft.effective_until, 'infinity'::timestamptz)
      AND COALESCE(
        published.effective_until,
        'infinity'::timestamptz
      ) > v_draft.effective_from
  ) THEN
    RETURN jsonb_build_object(
      'status', 'period_conflict',
      'error_code', 'SUPPLIER_PRICE_PERIOD_CONFLICT'
    );
  END IF;

  v_before := to_jsonb(v_draft);

  UPDATE public.supplier_price_lists AS price_list
  SET
    lifecycle_status = 'published',
    published_at = now(),
    row_version = price_list.row_version + 1,
    acting_tenant_id = p_tenant_id,
    acting_employee_id = p_actor_employee_id,
    operation_source = 'tenant_proxy',
    proxy_reason = btrim(p_proxy_reason),
    updated_by_employee_id = p_actor_employee_id,
    updated_at = now()
  WHERE price_list.id = p_price_list_id
    AND price_list.tenant_id = p_tenant_id
    AND price_list.supplier_id = p_supplier_id
  RETURNING * INTO v_draft;

  v_snapshot := to_jsonb(v_draft);

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
    'supplier_price_list',
    v_draft.id,
    'publish_supplier_price_list',
    v_before || jsonb_build_object('_request', v_request),
    v_snapshot,
    btrim(p_proxy_reason),
    p_actor_user_id,
    p_actor_employee_id,
    p_idempotency_key,
    v_draft.row_version
  );

  RETURN jsonb_build_object(
    'status', 'published',
    'idempotent', false,
    'price_list', v_snapshot,
    'version', v_draft.row_version
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.create_supplier_price_list_version(
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
DECLARE
  v_event public.supplier_command_events%ROWTYPE;
  v_source public.supplier_price_lists%ROWTYPE;
  v_new public.supplier_price_lists%ROWTYPE;
  v_tenant_supplier_id uuid;
  v_request jsonb;
  v_snapshot jsonb;
BEGIN
  IF p_new_price_list_id IS NULL OR p_tenant_id IS NULL
    OR p_supplier_id IS NULL OR p_source_price_list_id IS NULL
    OR p_expected_version IS NULL OR p_expected_version < 1
    OR p_actor_user_id IS NULL OR p_actor_employee_id IS NULL
    OR p_idempotency_key IS NULL OR btrim(p_idempotency_key) = ''
    OR char_length(p_idempotency_key) > 120
    OR p_proxy_reason IS NULL OR btrim(p_proxy_reason) = ''
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'SUPPLIER_PRICE_LIST_INVALID_ACTION';
  END IF;

  v_request := jsonb_build_object(
    'tenant_id', p_tenant_id,
    'supplier_id', p_supplier_id,
    'source_price_list_id', p_source_price_list_id,
    'expected_version', p_expected_version,
    'actor_employee_id', p_actor_employee_id,
    'proxy_reason', p_proxy_reason
  );

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'supplier-command:' || p_actor_user_id::text || ':' ||
        p_idempotency_key,
      0
    )
  );

  SELECT event.*
  INTO v_event
  FROM public.supplier_command_events AS event
  WHERE event.actor_user_id = p_actor_user_id
    AND event.idempotency_key = p_idempotency_key
  FOR UPDATE;

  IF FOUND THEN
    IF v_event.tenant_id IS DISTINCT FROM p_tenant_id
      OR v_event.resource_type <> 'supplier_price_list'
      OR v_event.resource_id <> p_new_price_list_id
      OR v_event.command <> 'create_supplier_price_list_version'
      OR v_event.from_state -> '_request' IS DISTINCT FROM v_request
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'SUPPLIER_IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN jsonb_build_object(
      'status', 'created',
      'idempotent', true,
      'price_list', v_event.to_state,
      'version', v_event.result_version
    );
  END IF;

  v_tenant_supplier_id := public.assert_supplier_price_scope(
    p_tenant_id,
    p_supplier_id,
    p_actor_employee_id
  );

  SELECT source.*
  INTO v_source
  FROM public.supplier_price_lists AS source
  WHERE source.id = p_source_price_list_id
    AND source.tenant_id = p_tenant_id
    AND source.supplier_id = p_supplier_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'status', 'not_found',
      'error_code', 'SUPPLIER_PRICE_LIST_NOT_FOUND'
    );
  END IF;

  IF v_source.tenant_supplier_id IS DISTINCT FROM v_tenant_supplier_id THEN
    RETURN jsonb_build_object(
      'status', 'state_conflict',
      'error_code', 'SUPPLIER_PRICE_LIST_INVALID_ACTION'
    );
  END IF;

  IF v_source.row_version <> p_expected_version THEN
    RETURN jsonb_build_object(
      'status', 'version_conflict',
      'error_code', 'SUPPLIER_PRICE_LIST_VERSION_CONFLICT',
      'version', v_source.row_version,
      'current_status', v_source.lifecycle_status
    );
  END IF;

  IF v_source.lifecycle_status NOT IN ('published', 'retired') THEN
    RETURN jsonb_build_object(
      'status', 'state_conflict',
      'error_code', 'SUPPLIER_PRICE_LIST_INVALID_ACTION'
    );
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'supplier-price-series:' || p_tenant_id::text || ':' ||
        p_supplier_id::text || ':' || lower(btrim(v_source.price_list_code)),
      6720240729160000
    )
  );

  IF EXISTS (
    SELECT 1
    FROM public.supplier_price_lists AS draft
    WHERE draft.tenant_id = p_tenant_id
      AND draft.supplier_id = p_supplier_id
      AND upper(btrim(draft.price_list_code)) =
        upper(btrim(v_source.price_list_code))
      AND draft.lifecycle_status = 'draft'
  ) THEN
    RETURN jsonb_build_object(
      'status', 'state_conflict',
      'error_code', 'SUPPLIER_PRICE_LIST_INVALID_ACTION',
      'reason', 'draft_already_exists'
    );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.supplier_price_list_items AS source_item
    WHERE source_item.supplier_price_list_id = v_source.id
      AND source_item.tenant_id = v_source.tenant_id
      AND (
        source_item.supplier_product_id IS NULL
        OR NOT EXISTS (
          SELECT 1
          FROM public.resolve_supplier_price_sku(
            v_source.tenant_id,
            v_source.supplier_id,
            source_item.supplier_sku_id
          ) AS resolved
          WHERE resolved.supplier_product_id = source_item.supplier_product_id
        )
      )
  ) THEN
    RETURN jsonb_build_object(
      'status', 'state_conflict',
      'error_code', 'SUPPLIER_PRICE_LIST_INVALID_ACTION',
      'reason', 'legacy_price_item_unresolved'
    );
  END IF;

  BEGIN
    INSERT INTO public.supplier_price_lists (
      id,
      tenant_id,
      tenant_supplier_id,
      supplier_id,
      price_list_code,
      version_number,
      scope_type,
      name,
      currency,
      lifecycle_status,
      effective_from,
      effective_until,
      supersedes_price_list_id,
      row_version,
      acting_tenant_id,
      acting_employee_id,
      operation_source,
      proxy_reason,
      created_by_employee_id,
      updated_by_employee_id
    ) VALUES (
      p_new_price_list_id,
      p_tenant_id,
      v_tenant_supplier_id,
      p_supplier_id,
      v_source.price_list_code,
      v_source.version_number + 1,
      v_source.scope_type,
      v_source.name,
      v_source.currency,
      'draft',
      v_source.effective_from,
      v_source.effective_until,
      v_source.id,
      1,
      p_tenant_id,
      p_actor_employee_id,
      'tenant_proxy',
      btrim(p_proxy_reason),
      p_actor_employee_id,
      p_actor_employee_id
    )
    RETURNING * INTO v_new;
  EXCEPTION
    WHEN unique_violation THEN
      RETURN jsonb_build_object(
        'status', 'state_conflict',
        'error_code', 'SUPPLIER_PRICE_LIST_INVALID_ACTION'
      );
  END;

  INSERT INTO public.supplier_price_list_items (
    id,
    tenant_id,
    supplier_id,
    supplier_price_list_id,
    supplier_product_id,
    supplier_sku_id,
    minimum_quantity,
    maximum_quantity,
    purchase_unit_id,
    base_unit_id,
    base_unit_conversion,
    unit_price,
    tax_rate,
    tax_inclusive,
    acting_tenant_id,
    acting_employee_id,
    operation_source,
    proxy_reason,
    created_by_employee_id,
    updated_by_employee_id
  )
  SELECT
    gen_random_uuid(),
    v_source.tenant_id,
    source_item.supplier_id,
    v_new.id,
    source_item.supplier_product_id,
    source_item.supplier_sku_id,
    source_item.minimum_quantity,
    source_item.maximum_quantity,
    source_item.purchase_unit_id,
    source_item.base_unit_id,
    source_item.base_unit_conversion,
    source_item.unit_price,
    source_item.tax_rate,
    source_item.tax_inclusive,
    p_tenant_id,
    p_actor_employee_id,
    'tenant_proxy',
    btrim(p_proxy_reason),
    p_actor_employee_id,
    p_actor_employee_id
  FROM public.supplier_price_list_items AS source_item
  WHERE source_item.supplier_price_list_id = v_source.id
    AND source_item.tenant_id = v_source.tenant_id
    AND source_item.supplier_id = v_source.supplier_id;

  v_snapshot := to_jsonb(v_new);

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
    'supplier_price_list',
    v_new.id,
    'create_supplier_price_list_version',
    to_jsonb(v_source) || jsonb_build_object('_request', v_request),
    v_snapshot,
    btrim(p_proxy_reason),
    p_actor_user_id,
    p_actor_employee_id,
    p_idempotency_key,
    v_new.row_version
  );

  RETURN jsonb_build_object(
    'status', 'created',
    'idempotent', false,
    'price_list', v_snapshot,
    'version', v_new.row_version
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.retire_supplier_price_list(
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
DECLARE
  v_event public.supplier_command_events%ROWTYPE;
  v_price_list public.supplier_price_lists%ROWTYPE;
  v_tenant_supplier_id uuid;
  v_before jsonb;
  v_request jsonb;
  v_snapshot jsonb;
BEGIN
  IF p_price_list_id IS NULL OR p_tenant_id IS NULL
    OR p_supplier_id IS NULL
    OR p_expected_version IS NULL OR p_expected_version < 1
    OR p_actor_user_id IS NULL OR p_actor_employee_id IS NULL
    OR p_idempotency_key IS NULL OR btrim(p_idempotency_key) = ''
    OR char_length(p_idempotency_key) > 120
    OR p_proxy_reason IS NULL OR btrim(p_proxy_reason) = ''
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'SUPPLIER_PRICE_LIST_INVALID_ACTION';
  END IF;

  v_request := jsonb_build_object(
    'tenant_id', p_tenant_id,
    'supplier_id', p_supplier_id,
    'price_list_id', p_price_list_id,
    'expected_version', p_expected_version,
    'actor_employee_id', p_actor_employee_id,
    'proxy_reason', p_proxy_reason
  );

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'supplier-command:' || p_actor_user_id::text || ':' ||
        p_idempotency_key,
      0
    )
  );

  SELECT event.*
  INTO v_event
  FROM public.supplier_command_events AS event
  WHERE event.actor_user_id = p_actor_user_id
    AND event.idempotency_key = p_idempotency_key
  FOR UPDATE;

  IF FOUND THEN
    IF v_event.tenant_id IS DISTINCT FROM p_tenant_id
      OR v_event.resource_type <> 'supplier_price_list'
      OR v_event.resource_id <> p_price_list_id
      OR v_event.command <> 'retire_supplier_price_list'
      OR v_event.from_state -> '_request' IS DISTINCT FROM v_request
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'SUPPLIER_IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN jsonb_build_object(
      'status', 'retired',
      'idempotent', true,
      'price_list', v_event.to_state,
      'version', v_event.result_version
    );
  END IF;

  v_tenant_supplier_id := public.assert_supplier_price_scope(
    p_tenant_id,
    p_supplier_id,
    p_actor_employee_id
  );

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'supplier-price-publish:' || p_tenant_id::text || ':' ||
        p_supplier_id::text,
      6720240729160000
    )
  );

  SELECT price_list.*
  INTO v_price_list
  FROM public.supplier_price_lists AS price_list
  WHERE price_list.id = p_price_list_id
    AND price_list.tenant_id = p_tenant_id
    AND price_list.supplier_id = p_supplier_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'status', 'not_found',
      'error_code', 'SUPPLIER_PRICE_LIST_NOT_FOUND'
    );
  END IF;

  IF v_price_list.tenant_supplier_id IS DISTINCT FROM v_tenant_supplier_id THEN
    RETURN jsonb_build_object(
      'status', 'state_conflict',
      'error_code', 'SUPPLIER_PRICE_LIST_INVALID_ACTION'
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

  IF v_price_list.lifecycle_status <> 'published' THEN
    RETURN jsonb_build_object(
      'status', 'state_conflict',
      'error_code', 'SUPPLIER_PRICE_LIST_INVALID_ACTION',
      'version', v_price_list.row_version,
      'current_status', v_price_list.lifecycle_status
    );
  END IF;

  v_before := to_jsonb(v_price_list);

  UPDATE public.supplier_price_lists AS price_list
  SET
    lifecycle_status = 'retired',
    row_version = price_list.row_version + 1,
    acting_tenant_id = p_tenant_id,
    acting_employee_id = p_actor_employee_id,
    operation_source = 'tenant_proxy',
    proxy_reason = btrim(p_proxy_reason),
    updated_by_employee_id = p_actor_employee_id,
    updated_at = now()
  WHERE price_list.id = p_price_list_id
    AND price_list.tenant_id = p_tenant_id
    AND price_list.supplier_id = p_supplier_id
  RETURNING * INTO v_price_list;

  v_snapshot := to_jsonb(v_price_list);

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
    'supplier_price_list',
    v_price_list.id,
    'retire_supplier_price_list',
    v_before || jsonb_build_object('_request', v_request),
    v_snapshot,
    btrim(p_proxy_reason),
    p_actor_user_id,
    p_actor_employee_id,
    p_idempotency_key,
    v_price_list.row_version
  );

  RETURN jsonb_build_object(
    'status', 'retired',
    'idempotent', false,
    'price_list', v_snapshot,
    'version', v_price_list.row_version
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_supplier_price_list_item(
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
DECLARE
  v_event public.supplier_command_events%ROWTYPE;
  v_price_list public.supplier_price_lists%ROWTYPE;
  v_item public.supplier_price_list_items%ROWTYPE;
  v_tenant_supplier_id uuid;
  v_supplier_product_id uuid;
  v_purchase_unit_id uuid;
  v_base_unit_id uuid;
  v_base_unit_conversion numeric(18, 8);
  v_before_item jsonb := NULL;
  v_before_list jsonb;
  v_request jsonb;
  v_item_snapshot jsonb;
  v_to_state jsonb;
BEGIN
  IF p_item_id IS NULL OR p_price_list_id IS NULL
    OR p_tenant_id IS NULL OR p_supplier_id IS NULL OR p_sku_id IS NULL
    OR p_unit_price IS NULL OR p_unit_price < 0
    OR p_tax_rate IS NULL OR p_tax_rate < 0 OR p_tax_rate > 1
    OR p_tax_inclusive IS NULL
    OR p_expected_version IS NULL OR p_expected_version < 1
    OR p_actor_user_id IS NULL OR p_actor_employee_id IS NULL
    OR p_idempotency_key IS NULL OR btrim(p_idempotency_key) = ''
    OR char_length(p_idempotency_key) > 120
    OR p_proxy_reason IS NULL OR btrim(p_proxy_reason) = ''
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'SUPPLIER_PRICE_LIST_INVALID_ACTION';
  END IF;

  v_request := jsonb_build_object(
    'tenant_id', p_tenant_id,
    'supplier_id', p_supplier_id,
    'price_list_id', p_price_list_id,
    'item_id', p_item_id,
    'sku_id', p_sku_id,
    'unit_price', p_unit_price::text,
    'tax_rate', p_tax_rate::text,
    'tax_inclusive', p_tax_inclusive,
    'expected_version', p_expected_version,
    'actor_employee_id', p_actor_employee_id,
    'proxy_reason', p_proxy_reason
  );

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'supplier-command:' || p_actor_user_id::text || ':' ||
        p_idempotency_key,
      0
    )
  );

  SELECT event.*
  INTO v_event
  FROM public.supplier_command_events AS event
  WHERE event.actor_user_id = p_actor_user_id
    AND event.idempotency_key = p_idempotency_key
  FOR UPDATE;

  IF FOUND THEN
    IF v_event.tenant_id IS DISTINCT FROM p_tenant_id
      OR v_event.resource_type <> 'supplier_price_list'
      OR v_event.resource_id <> p_price_list_id
      OR v_event.command <>
        'upsert_supplier_price_list_item:' || p_item_id::text
      OR v_event.from_state -> '_request' IS DISTINCT FROM v_request
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'SUPPLIER_IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN jsonb_build_object(
      'status', 'updated',
      'idempotent', true,
      'price_list', v_event.to_state -> 'price_list',
      'item', v_event.to_state -> 'item',
      'version', v_event.result_version
    );
  END IF;

  v_tenant_supplier_id := public.assert_supplier_price_scope(
    p_tenant_id,
    p_supplier_id,
    p_actor_employee_id
  );

  SELECT price_list.*
  INTO v_price_list
  FROM public.supplier_price_lists AS price_list
  WHERE price_list.id = p_price_list_id
    AND price_list.tenant_id = p_tenant_id
    AND price_list.supplier_id = p_supplier_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'status', 'not_found',
      'error_code', 'SUPPLIER_PRICE_LIST_NOT_FOUND'
    );
  END IF;

  IF v_price_list.tenant_supplier_id IS DISTINCT FROM v_tenant_supplier_id THEN
    RETURN jsonb_build_object(
      'status', 'state_conflict',
      'error_code', 'SUPPLIER_PRICE_LIST_INVALID_ACTION'
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

  IF v_price_list.lifecycle_status <> 'draft' THEN
    RETURN jsonb_build_object(
      'status', 'state_conflict',
      'error_code', 'SUPPLIER_PRICE_LIST_INVALID_ACTION'
    );
  END IF;

  SELECT
    resolved.supplier_product_id,
    resolved.purchase_unit_id,
    resolved.base_unit_id,
    resolved.base_unit_conversion
  INTO
    v_supplier_product_id,
    v_purchase_unit_id,
    v_base_unit_id,
    v_base_unit_conversion
  FROM public.resolve_supplier_price_sku(
    p_tenant_id,
    p_supplier_id,
    p_sku_id
  ) AS resolved;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'status', 'not_found',
      'error_code', 'SUPPLIER_SKU_NOT_FOUND'
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

  IF FOUND THEN
    v_before_item := to_jsonb(v_item);
  END IF;
  v_before_list := to_jsonb(v_price_list);

  BEGIN
    IF v_before_item IS NULL THEN
      INSERT INTO public.supplier_price_list_items (
        id,
        tenant_id,
        supplier_id,
        supplier_price_list_id,
        supplier_product_id,
        supplier_sku_id,
        minimum_quantity,
        maximum_quantity,
        purchase_unit_id,
        base_unit_id,
        base_unit_conversion,
        unit_price,
        tax_rate,
        tax_inclusive,
        acting_tenant_id,
        acting_employee_id,
        operation_source,
        proxy_reason,
        created_by_employee_id,
        updated_by_employee_id
      ) VALUES (
        p_item_id,
        p_tenant_id,
        p_supplier_id,
        p_price_list_id,
        v_supplier_product_id,
        p_sku_id,
        1,
        NULL,
        v_purchase_unit_id,
        v_base_unit_id,
        v_base_unit_conversion,
        p_unit_price::numeric(14, 2),
        p_tax_rate::numeric(7, 6),
        p_tax_inclusive,
        p_tenant_id,
        p_actor_employee_id,
        'tenant_proxy',
        btrim(p_proxy_reason),
        p_actor_employee_id,
        p_actor_employee_id
      )
      RETURNING * INTO v_item;
    ELSE
      UPDATE public.supplier_price_list_items AS item
      SET
        supplier_product_id = v_supplier_product_id,
        supplier_sku_id = p_sku_id,
        unit_price = p_unit_price::numeric(14, 2),
        tax_rate = p_tax_rate::numeric(7, 6),
        tax_inclusive = p_tax_inclusive,
        acting_tenant_id = p_tenant_id,
        acting_employee_id = p_actor_employee_id,
        operation_source = 'tenant_proxy',
        proxy_reason = btrim(p_proxy_reason),
        updated_by_employee_id = p_actor_employee_id,
        updated_at = now()
      WHERE item.id = p_item_id
        AND item.supplier_price_list_id = p_price_list_id
        AND item.tenant_id = p_tenant_id
        AND item.supplier_id = p_supplier_id
      RETURNING * INTO v_item;
    END IF;
  EXCEPTION
    WHEN unique_violation THEN
      RETURN jsonb_build_object(
        'status', 'state_conflict',
        'error_code', 'SUPPLIER_PRICE_LIST_INVALID_ACTION',
        'reason', 'duplicate_sku_or_item'
      );
  END;

  UPDATE public.supplier_price_lists AS price_list
  SET
    row_version = price_list.row_version + 1,
    acting_tenant_id = p_tenant_id,
    acting_employee_id = p_actor_employee_id,
    operation_source = 'tenant_proxy',
    proxy_reason = btrim(p_proxy_reason),
    updated_by_employee_id = p_actor_employee_id,
    updated_at = now()
  WHERE price_list.id = p_price_list_id
    AND price_list.tenant_id = p_tenant_id
    AND price_list.supplier_id = p_supplier_id
  RETURNING * INTO v_price_list;

  v_item_snapshot := to_jsonb(v_item) || jsonb_build_object(
    'minimum_quantity', v_item.minimum_quantity::text,
    'maximum_quantity',
      CASE
        WHEN v_item.maximum_quantity IS NULL THEN NULL
        ELSE to_jsonb(v_item.maximum_quantity::text)
      END,
    'base_unit_conversion', v_item.base_unit_conversion::text,
    'unit_price', v_item.unit_price::text,
    'tax_rate', v_item.tax_rate::text
  );
  v_to_state := jsonb_build_object(
    'price_list', to_jsonb(v_price_list),
    'item', v_item_snapshot
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
    'supplier_price_list',
    p_price_list_id,
    'upsert_supplier_price_list_item:' || p_item_id::text,
    jsonb_build_object(
      '_request', v_request,
      'price_list', v_before_list,
      'item', v_before_item
    ),
    v_to_state,
    btrim(p_proxy_reason),
    p_actor_user_id,
    p_actor_employee_id,
    p_idempotency_key,
    v_price_list.row_version
  );

  RETURN jsonb_build_object(
    'status', 'updated',
    'idempotent', false,
    'price_list', to_jsonb(v_price_list),
    'item', v_item_snapshot,
    'version', v_price_list.row_version
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_supplier_price_list_item(
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
DECLARE
  v_event public.supplier_command_events%ROWTYPE;
  v_price_list public.supplier_price_lists%ROWTYPE;
  v_item public.supplier_price_list_items%ROWTYPE;
  v_tenant_supplier_id uuid;
  v_before_list jsonb;
  v_request jsonb;
BEGIN
  IF p_item_id IS NULL OR p_price_list_id IS NULL
    OR p_tenant_id IS NULL OR p_supplier_id IS NULL
    OR p_expected_version IS NULL OR p_expected_version < 1
    OR p_actor_user_id IS NULL OR p_actor_employee_id IS NULL
    OR p_idempotency_key IS NULL OR btrim(p_idempotency_key) = ''
    OR char_length(p_idempotency_key) > 120
    OR p_proxy_reason IS NULL OR btrim(p_proxy_reason) = ''
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'SUPPLIER_PRICE_LIST_INVALID_ACTION';
  END IF;

  v_request := jsonb_build_object(
    'tenant_id', p_tenant_id,
    'supplier_id', p_supplier_id,
    'price_list_id', p_price_list_id,
    'item_id', p_item_id,
    'expected_version', p_expected_version,
    'actor_employee_id', p_actor_employee_id,
    'proxy_reason', p_proxy_reason
  );

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'supplier-command:' || p_actor_user_id::text || ':' ||
        p_idempotency_key,
      0
    )
  );

  SELECT event.*
  INTO v_event
  FROM public.supplier_command_events AS event
  WHERE event.actor_user_id = p_actor_user_id
    AND event.idempotency_key = p_idempotency_key
  FOR UPDATE;

  IF FOUND THEN
    IF v_event.tenant_id IS DISTINCT FROM p_tenant_id
      OR v_event.resource_type <> 'supplier_price_list'
      OR v_event.resource_id <> p_price_list_id
      OR v_event.command <>
        'delete_supplier_price_list_item:' || p_item_id::text
      OR v_event.from_state -> '_request' IS DISTINCT FROM v_request
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'SUPPLIER_IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN jsonb_build_object(
      'status', 'deleted',
      'idempotent', true,
      'price_list', v_event.to_state -> 'price_list',
      'version', v_event.result_version
    );
  END IF;

  v_tenant_supplier_id := public.assert_supplier_price_scope(
    p_tenant_id,
    p_supplier_id,
    p_actor_employee_id
  );

  SELECT price_list.*
  INTO v_price_list
  FROM public.supplier_price_lists AS price_list
  WHERE price_list.id = p_price_list_id
    AND price_list.tenant_id = p_tenant_id
    AND price_list.supplier_id = p_supplier_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'status', 'not_found',
      'error_code', 'SUPPLIER_PRICE_LIST_NOT_FOUND'
    );
  END IF;

  IF v_price_list.tenant_supplier_id IS DISTINCT FROM v_tenant_supplier_id THEN
    RETURN jsonb_build_object(
      'status', 'state_conflict',
      'error_code', 'SUPPLIER_PRICE_LIST_INVALID_ACTION'
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

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'status', 'not_found',
      'error_code', 'SUPPLIER_PRICE_ITEM_NOT_FOUND'
    );
  END IF;

  v_before_list := to_jsonb(v_price_list);

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
    operation_source = 'tenant_proxy',
    proxy_reason = btrim(p_proxy_reason),
    updated_by_employee_id = p_actor_employee_id,
    updated_at = now()
  WHERE price_list.id = p_price_list_id
    AND price_list.tenant_id = p_tenant_id
    AND price_list.supplier_id = p_supplier_id
  RETURNING * INTO v_price_list;

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
    'supplier_price_list',
    p_price_list_id,
    'delete_supplier_price_list_item:' || p_item_id::text,
    jsonb_build_object(
      '_request', v_request,
      'price_list', v_before_list,
      'item', to_jsonb(v_item)
    ),
    jsonb_build_object('price_list', to_jsonb(v_price_list)),
    btrim(p_proxy_reason),
    p_actor_user_id,
    p_actor_employee_id,
    p_idempotency_key,
    v_price_list.row_version
  );

  RETURN jsonb_build_object(
    'status', 'deleted',
    'idempotent', false,
    'price_list', to_jsonb(v_price_list),
    'version', v_price_list.row_version
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_supplier_price_list(
  uuid, uuid, uuid, text, text, text, timestamptz, timestamptz, uuid,
  uuid, text, text
)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_supplier_price_list(
  uuid, uuid, uuid, text, text, text, timestamptz, timestamptz, uuid,
  uuid, text, text
)
TO service_role;

REVOKE ALL ON FUNCTION public.publish_supplier_price_list(
  uuid, uuid, uuid, integer, uuid, uuid, text, text
)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.publish_supplier_price_list(
  uuid, uuid, uuid, integer, uuid, uuid, text, text
)
TO service_role;

REVOKE ALL ON FUNCTION public.create_supplier_price_list_version(
  uuid, uuid, uuid, uuid, integer, uuid, uuid, text, text
)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_supplier_price_list_version(
  uuid, uuid, uuid, uuid, integer, uuid, uuid, text, text
)
TO service_role;

REVOKE ALL ON FUNCTION public.retire_supplier_price_list(
  uuid, uuid, uuid, integer, uuid, uuid, text, text
)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.retire_supplier_price_list(
  uuid, uuid, uuid, integer, uuid, uuid, text, text
)
TO service_role;

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

REVOKE ALL ON FUNCTION public.delete_supplier_price_list_item(
  uuid, uuid, uuid, uuid, integer, uuid, uuid, text, text
)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_supplier_price_list_item(
  uuid, uuid, uuid, uuid, integer, uuid, uuid, text, text
)
TO service_role;

-- Unsafe pre-v2 implementations remain inaccessible after the public
-- functions above stop delegating to them.
REVOKE ALL ON FUNCTION public.publish_supplier_price_list_pre_v2_unsafe(
  uuid, uuid, uuid, integer, uuid, uuid, text, text
)
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.create_supplier_price_list_version_pre_v2_unsafe(
  uuid, uuid, uuid, uuid, integer, uuid, uuid, text, text
)
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.retire_supplier_price_list_pre_v2_unsafe(
  uuid, uuid, uuid, integer, uuid, uuid, text, text
)
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.upsert_supplier_price_list_item_pre_v2_unsafe(
  uuid, uuid, uuid, uuid, uuid, numeric, numeric, boolean,
  integer, uuid, uuid, text, text
)
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.delete_supplier_price_list_item_pre_v2_unsafe(
  uuid, uuid, uuid, uuid, integer, uuid, uuid, text, text
)
FROM PUBLIC, anon, authenticated, service_role;

ALTER TABLE public.supplier_price_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_price_lists FORCE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_price_list_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_price_list_items FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.supplier_price_lists
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.supplier_price_list_items
FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE public.supplier_price_lists TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE public.supplier_price_list_items TO service_role;

COMMIT;
