-- Harden supplier purchase-order lifecycle, tenant boundaries and option paging.
--
-- Rollback strategy: revoke the new option RPC and hide the Admin/API entry
-- points. Keep these guards and preserve submitted purchase-order facts; use a
-- forward migration for any later behavior change.

DROP TRIGGER IF EXISTS supplier_purchase_orders_prevent_submitted_mutation
ON public.supplier_purchase_orders;

CREATE OR REPLACE FUNCTION public.prevent_submitted_supplier_purchase_order_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'draft'
      OR NEW.version <> 1
      OR NEW.submitted_by_employee_id IS NOT NULL
      OR NEW.submitted_at IS NOT NULL
      OR NEW.cancelled_by_employee_id IS NOT NULL
      OR NEW.cancelled_at IS NOT NULL
      OR NEW.cancel_reason IS NOT NULL
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'SUPPLIER_PURCHASE_ORDER_STATE_CONFLICT';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'draft' THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'SUPPLIER_PURCHASE_ORDER_STATE_CONFLICT';
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.created_by_employee_id IS DISTINCT FROM OLD.created_by_employee_id
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_PURCHASE_ORDER_STATE_CONFLICT';
  END IF;

  IF OLD.status = 'cancelled' THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_PURCHASE_ORDER_STATE_CONFLICT';
  END IF;

  IF OLD.status = 'submitted' THEN
    IF NEW.status <> 'cancelled'
      OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
      OR NEW.project_id IS DISTINCT FROM OLD.project_id
      OR NEW.tenant_supplier_id IS DISTINCT FROM OLD.tenant_supplier_id
      OR NEW.supplier_id IS DISTINCT FROM OLD.supplier_id
      OR NEW.order_no IS DISTINCT FROM OLD.order_no
      OR NEW.currency IS DISTINCT FROM OLD.currency
      OR NEW.expected_delivery_date IS DISTINCT FROM OLD.expected_delivery_date
      OR NEW.remark IS DISTINCT FROM OLD.remark
      OR NEW.priced_at IS DISTINCT FROM OLD.priced_at
      OR NEW.subtotal_amount IS DISTINCT FROM OLD.subtotal_amount
      OR NEW.tax_amount IS DISTINCT FROM OLD.tax_amount
      OR NEW.total_amount IS DISTINCT FROM OLD.total_amount
      OR NEW.submitted_by_employee_id IS DISTINCT FROM
        OLD.submitted_by_employee_id
      OR NEW.submitted_at IS DISTINCT FROM OLD.submitted_at
      OR NEW.cancelled_by_employee_id IS NULL
      OR NEW.cancelled_at IS NULL
      OR NEW.cancel_reason IS NULL
      OR btrim(NEW.cancel_reason) = ''
      OR char_length(btrim(NEW.cancel_reason)) > 500
      OR NEW.version <> OLD.version + 1
      OR NEW.updated_by_employee_id IS DISTINCT FROM
        NEW.cancelled_by_employee_id
      OR NEW.updated_at < OLD.updated_at
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'SUPPLIER_PURCHASE_ORDER_STATE_CONFLICT';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.status NOT IN ('draft', 'submitted')
    OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
    OR NEW.project_id IS DISTINCT FROM OLD.project_id
    OR NEW.tenant_supplier_id IS DISTINCT FROM OLD.tenant_supplier_id
    OR NEW.supplier_id IS DISTINCT FROM OLD.supplier_id
    OR NEW.order_no IS DISTINCT FROM OLD.order_no
    OR NEW.currency IS DISTINCT FROM OLD.currency
    OR NEW.cancelled_by_employee_id IS NOT NULL
    OR NEW.cancelled_at IS NOT NULL
    OR NEW.cancel_reason IS NOT NULL
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_PURCHASE_ORDER_STATE_CONFLICT';
  END IF;

  IF NEW.status = 'draft' AND (
    NEW.submitted_by_employee_id IS NOT NULL
    OR NEW.submitted_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_PURCHASE_ORDER_STATE_CONFLICT';
  END IF;

  IF NEW.status = 'submitted' AND (
    NEW.submitted_by_employee_id IS NULL
    OR NEW.submitted_at IS NULL
    OR NEW.version <> OLD.version + 1
    OR NEW.updated_by_employee_id IS DISTINCT FROM
      NEW.submitted_by_employee_id
    OR NEW.updated_at < OLD.updated_at
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_PURCHASE_ORDER_STATE_CONFLICT';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.prevent_submitted_supplier_purchase_order_mutation()
FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER supplier_purchase_orders_prevent_submitted_mutation
BEFORE INSERT OR UPDATE OR DELETE ON public.supplier_purchase_orders
FOR EACH ROW
EXECUTE FUNCTION public.prevent_submitted_supplier_purchase_order_mutation();

CREATE OR REPLACE FUNCTION public.prevent_supplier_purchase_order_item_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_old_order_status text;
  v_new_order_status text;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    SELECT purchase_order.status
    INTO v_old_order_status
    FROM public.supplier_purchase_orders AS purchase_order
    WHERE purchase_order.id = OLD.supplier_purchase_order_id
    FOR SHARE;

    IF NOT FOUND OR v_old_order_status <> 'draft' THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'SUPPLIER_PURCHASE_ORDER_STATE_CONFLICT';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE'
    AND NEW.supplier_purchase_order_id IS DISTINCT FROM
      OLD.supplier_purchase_order_id
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_PURCHASE_ORDER_STATE_CONFLICT';
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    SELECT purchase_order.status
    INTO v_new_order_status
    FROM public.supplier_purchase_orders AS purchase_order
    WHERE purchase_order.id = NEW.supplier_purchase_order_id
    FOR SHARE;

    IF NOT FOUND OR v_new_order_status <> 'draft' THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'SUPPLIER_PURCHASE_ORDER_STATE_CONFLICT';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.prevent_supplier_purchase_order_item_mutation()
FROM PUBLIC, anon, authenticated, service_role;

ALTER FUNCTION public.save_supplier_purchase_order_draft(
  uuid,
  uuid,
  uuid,
  uuid,
  integer,
  date,
  text,
  jsonb,
  uuid,
  uuid,
  text
) RENAME TO save_supplier_purchase_order_draft_v1;

REVOKE ALL ON FUNCTION public.save_supplier_purchase_order_draft_v1(
  uuid,
  uuid,
  uuid,
  uuid,
  integer,
  date,
  text,
  jsonb,
  uuid,
  uuid,
  text
) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.save_supplier_purchase_order_draft(
  p_order_id uuid,
  p_tenant_id uuid,
  p_project_id uuid,
  p_tenant_supplier_id uuid,
  p_expected_version integer,
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
  v_tenant_order_version integer;
  v_global_order_exists boolean;
BEGIN
  PERFORM public.assert_supplier_purchase_order_actor(
    p_tenant_id,
    p_actor_user_id,
    p_actor_employee_id
  );

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'supplier-purchase-order-id:' || p_order_id::text,
      6720240729190000
    )
  );

  SELECT purchase_order.version
  INTO v_tenant_order_version
  FROM public.supplier_purchase_orders AS purchase_order
  WHERE purchase_order.id = p_order_id
    AND purchase_order.tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.supplier_purchase_orders AS purchase_order
      WHERE purchase_order.id = p_order_id
    )
    INTO v_global_order_exists;

    IF v_global_order_exists THEN
      IF p_expected_version = 0 THEN
        RETURN jsonb_build_object(
          'status', 'state_conflict',
          'error_code', 'SUPPLIER_PURCHASE_ORDER_ID_CONFLICT'
        );
      END IF;
      RETURN jsonb_build_object(
        'status', 'not_found',
        'error_code', 'SUPPLIER_PURCHASE_ORDER_NOT_FOUND'
      );
    END IF;
  END IF;

  BEGIN
    RETURN public.save_supplier_purchase_order_draft_v1(
      p_order_id,
      p_tenant_id,
      p_project_id,
      p_tenant_supplier_id,
      p_expected_version,
      p_expected_delivery_date,
      p_remark,
      p_items,
      p_actor_user_id,
      p_actor_employee_id,
      p_idempotency_key
    );
  EXCEPTION
    WHEN numeric_value_out_of_range THEN
      RETURN jsonb_build_object(
        'status', 'validation_error',
        'error_code', 'SUPPLIER_PURCHASE_ORDER_AMOUNT_LIMIT_EXCEEDED',
        'reason', '采购单行金额或汇总金额超过 numeric(18,2) 上限'
      );
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.save_supplier_purchase_order_draft(
  uuid,
  uuid,
  uuid,
  uuid,
  integer,
  date,
  text,
  jsonb,
  uuid,
  uuid,
  text
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.save_supplier_purchase_order_draft(
  uuid,
  uuid,
  uuid,
  uuid,
  integer,
  date,
  text,
  jsonb,
  uuid,
  uuid,
  text
) TO service_role;

CREATE FUNCTION public.list_supplier_purchase_order_supplier_options(
  p_tenant_id uuid,
  p_checked_at timestamptz,
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
  v_page integer := GREATEST(COALESCE(p_page, 1), 1);
  v_page_size integer := LEAST(GREATEST(p_page_size, 1), 100);
  v_total integer;
  v_items jsonb;
BEGIN
  IF p_tenant_id IS NULL OR p_checked_at IS NULL THEN
    RETURN jsonb_build_object(
      'items', '[]'::jsonb,
      'total', 0,
      'page', v_page,
      'page_size', v_page_size
    );
  END IF;

  WITH eligible_relationships AS MATERIALIZED (
    SELECT eligibility.tenant_supplier_id
    FROM public.get_tenant_supplier_order_eligibility_set(
      p_tenant_id,
      p_checked_at,
      NULL
    ) AS eligibility
    WHERE eligibility.eligible
  ),
  filtered AS MATERIALIZED (
    SELECT
      relationship.id AS tenant_supplier_id,
      relationship.supplier_id,
      relationship.relationship_status,
      relationship.default_currency,
      supplier.code AS supplier_code,
      supplier.name AS supplier_name,
      supplier.legal_name AS supplier_legal_name
    FROM eligible_relationships AS eligible
    JOIN public.tenant_suppliers AS relationship
      ON relationship.id = eligible.tenant_supplier_id
      AND relationship.tenant_id = p_tenant_id
      AND relationship.default_currency = 'CNY'
    JOIN public.suppliers AS supplier
      ON supplier.id = relationship.supplier_id
    WHERE p_keyword IS NULL
      OR btrim(p_keyword) = ''
      OR supplier.name ILIKE '%' || btrim(p_keyword) || '%'
      OR supplier.legal_name ILIKE '%' || btrim(p_keyword) || '%'
      OR supplier.code ILIKE '%' || btrim(p_keyword) || '%'
  )
  SELECT
    (SELECT count(*)::integer FROM filtered),
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'tenant_supplier_id', page.tenant_supplier_id,
            'supplier_id', page.supplier_id,
            'relationship_status', page.relationship_status,
            'default_currency', page.default_currency,
            'supplier', jsonb_build_object(
              'id', page.supplier_id,
              'code', page.supplier_code,
              'name', page.supplier_name,
              'legal_name', page.supplier_legal_name
            )
          )
          ORDER BY page.supplier_name, page.tenant_supplier_id
        )
        FROM (
          SELECT *
          FROM filtered
          ORDER BY supplier_name, tenant_supplier_id
          OFFSET (v_page - 1) * v_page_size
          LIMIT v_page_size
        ) AS page
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

REVOKE ALL ON FUNCTION public.list_supplier_purchase_order_supplier_options(
  uuid,
  timestamptz,
  text,
  integer,
  integer
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.list_supplier_purchase_order_supplier_options(
  uuid,
  timestamptz,
  text,
  integer,
  integer
) TO service_role;
