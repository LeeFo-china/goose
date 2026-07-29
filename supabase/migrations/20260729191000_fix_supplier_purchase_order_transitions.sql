-- Preserve exact draft/submitted/cancelled transition semantics after the
-- purchase-order hardening migration.
--
-- Rollback strategy: keep this guard in place and preserve submitted facts.
-- If commands must be withdrawn, revoke API/UI access in a forward migration.

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

  IF NEW.status NOT IN ('draft', 'submitted', 'cancelled')
    OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
    OR NEW.project_id IS DISTINCT FROM OLD.project_id
    OR NEW.tenant_supplier_id IS DISTINCT FROM OLD.tenant_supplier_id
    OR NEW.supplier_id IS DISTINCT FROM OLD.supplier_id
    OR NEW.order_no IS DISTINCT FROM OLD.order_no
    OR NEW.currency IS DISTINCT FROM OLD.currency
    OR NEW.version <> OLD.version + 1
    OR NEW.updated_by_employee_id IS NULL
    OR NEW.updated_at < OLD.updated_at
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_PURCHASE_ORDER_STATE_CONFLICT';
  END IF;

  IF NEW.status = 'draft' AND (
    NEW.submitted_by_employee_id IS NOT NULL
    OR NEW.submitted_at IS NOT NULL
    OR NEW.cancelled_by_employee_id IS NOT NULL
    OR NEW.cancelled_at IS NOT NULL
    OR NEW.cancel_reason IS NOT NULL
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_PURCHASE_ORDER_STATE_CONFLICT';
  END IF;

  IF NEW.status IN ('submitted', 'cancelled') AND (
    NEW.expected_delivery_date IS DISTINCT FROM OLD.expected_delivery_date
    OR NEW.remark IS DISTINCT FROM OLD.remark
    OR NEW.priced_at IS DISTINCT FROM OLD.priced_at
    OR NEW.subtotal_amount IS DISTINCT FROM OLD.subtotal_amount
    OR NEW.tax_amount IS DISTINCT FROM OLD.tax_amount
    OR NEW.total_amount IS DISTINCT FROM OLD.total_amount
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_PURCHASE_ORDER_STATE_CONFLICT';
  END IF;

  IF NEW.status = 'submitted' AND (
    NEW.submitted_by_employee_id IS NULL
    OR NEW.submitted_at IS NULL
    OR NEW.cancelled_by_employee_id IS NOT NULL
    OR NEW.cancelled_at IS NOT NULL
    OR NEW.cancel_reason IS NOT NULL
    OR NEW.updated_by_employee_id IS DISTINCT FROM
      NEW.submitted_by_employee_id
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_PURCHASE_ORDER_STATE_CONFLICT';
  END IF;

  IF NEW.status = 'cancelled' AND (
    NEW.submitted_by_employee_id IS DISTINCT FROM
      OLD.submitted_by_employee_id
    OR NEW.submitted_at IS DISTINCT FROM OLD.submitted_at
    OR NEW.cancelled_by_employee_id IS NULL
    OR NEW.cancelled_at IS NULL
    OR NEW.cancel_reason IS NULL
    OR btrim(NEW.cancel_reason) = ''
    OR char_length(btrim(NEW.cancel_reason)) > 500
    OR NEW.updated_by_employee_id IS DISTINCT FROM
      NEW.cancelled_by_employee_id
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

CREATE OR REPLACE FUNCTION public.save_supplier_purchase_order_draft(
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
  IF p_order_id IS NULL
    OR p_tenant_id IS NULL
    OR p_project_id IS NULL
    OR p_tenant_supplier_id IS NULL
    OR p_expected_version IS NULL
    OR p_expected_version < 0
    OR p_actor_user_id IS NULL
    OR p_actor_employee_id IS NULL
    OR p_idempotency_key IS NULL
    OR btrim(p_idempotency_key) = ''
    OR char_length(p_idempotency_key) > 120
    OR p_items IS NULL
    OR jsonb_typeof(p_items) <> 'array'
    OR NOT jsonb_array_length(p_items) BETWEEN 1 AND 100
    OR (p_remark IS NOT NULL AND btrim(p_remark) = '')
  THEN
    RETURN jsonb_build_object(
      'status', 'validation_error',
      'error_code', 'SUPPLIER_PURCHASE_ORDER_VALIDATION_ERROR'
    );
  END IF;

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
