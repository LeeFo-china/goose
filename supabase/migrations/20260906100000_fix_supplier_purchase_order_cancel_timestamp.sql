-- Rollback: create a follow-up migration that restores the prior
-- cancel_supplier_purchase_order_fulfillment_v1 definition if needed. The
-- change is limited to using the command timestamp for updated_at so the
-- submitted-order guard remains monotonic inside long transactions.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

CREATE OR REPLACE FUNCTION public.cancel_supplier_purchase_order_fulfillment_v1(
  p_order_id uuid,
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
SET search_path TO 'pg_catalog', 'public', 'private'
AS $$
DECLARE
  v_event public.supplier_command_events%ROWTYPE;
  v_order public.supplier_purchase_orders%ROWTYPE;
  v_fulfillment public.supplier_purchase_order_fulfillments%ROWTYPE;
  v_before jsonb;
  v_request jsonb;
  v_cancelled_at timestamptz := clock_timestamp();
  v_has_fulfillment boolean := false;
  v_has_shipment boolean := false;
BEGIN
  IF p_order_id IS NULL
    OR p_tenant_id IS NULL
    OR p_expected_version IS NULL
    OR p_expected_version <= 0
    OR p_reason IS NULL
    OR btrim(p_reason) = ''
    OR char_length(btrim(p_reason)) > 500
    OR p_actor_user_id IS NULL
    OR p_actor_employee_id IS NULL
    OR p_idempotency_key IS NULL
    OR btrim(p_idempotency_key) = ''
    OR char_length(p_idempotency_key) > 120
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

  v_request := jsonb_build_object(
    'tenant_id', p_tenant_id,
    'order_id', p_order_id,
    'expected_version', p_expected_version,
    'reason', btrim(p_reason),
    'actor_employee_id', p_actor_employee_id
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
    AND event.idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF v_event.tenant_id IS DISTINCT FROM p_tenant_id
      OR v_event.resource_type <> 'supplier_purchase_order'
      OR v_event.resource_id <> p_order_id
      OR v_event.command <> 'cancel_supplier_purchase_order'
      OR v_event.from_state -> '_request' IS DISTINCT FROM v_request
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'SUPPLIER_IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN jsonb_build_object(
      'status', 'cancelled',
      'idempotent', true,
      'purchase_order', v_event.to_state,
      'version', v_event.result_version
    );
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'supplier-purchase-order-id:' || p_order_id::text,
      6720240730100000
    )
  );

  SELECT purchase_order.*
  INTO v_order
  FROM public.supplier_purchase_orders AS purchase_order
  WHERE purchase_order.id = p_order_id
    AND purchase_order.tenant_id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'status', 'not_found',
      'error_code', 'SUPPLIER_PURCHASE_ORDER_NOT_FOUND'
    );
  END IF;
  IF v_order.status NOT IN ('draft', 'submitted') THEN
    RETURN jsonb_build_object(
      'status', 'state_conflict',
      'error_code', 'SUPPLIER_PURCHASE_ORDER_STATE_CONFLICT'
    );
  END IF;
  IF v_order.version <> p_expected_version THEN
    RETURN jsonb_build_object(
      'status', 'version_conflict',
      'error_code', 'SUPPLIER_PURCHASE_ORDER_VERSION_CONFLICT',
      'version', v_order.version
    );
  END IF;

  SELECT fulfillment.*
  INTO v_fulfillment
  FROM public.supplier_purchase_order_fulfillments AS fulfillment
  WHERE fulfillment.supplier_purchase_order_id = p_order_id
    AND fulfillment.tenant_id = p_tenant_id
  ORDER BY fulfillment.id
  FOR UPDATE;
  v_has_fulfillment := FOUND;

  IF v_has_fulfillment THEN
    PERFORM item_fulfillment.id
    FROM public.supplier_purchase_order_item_fulfillments
      AS item_fulfillment
    WHERE item_fulfillment.supplier_purchase_order_fulfillment_id =
        v_fulfillment.id
      AND item_fulfillment.tenant_id = p_tenant_id
      AND item_fulfillment.supplier_purchase_order_id = p_order_id
    ORDER BY item_fulfillment.id
    FOR UPDATE;

    SELECT EXISTS (
      SELECT 1
      FROM public.supplier_purchase_order_shipments AS shipment
      WHERE shipment.supplier_purchase_order_fulfillment_id =
          v_fulfillment.id
        AND shipment.tenant_id = p_tenant_id
        AND shipment.supplier_purchase_order_id = p_order_id
    )
    INTO v_has_shipment;
    IF v_has_shipment THEN
      RETURN jsonb_build_object(
        'status', 'state_conflict',
        'error_code',
          'SUPPLIER_PURCHASE_ORDER_FULFILLMENT_STARTED'
      );
    END IF;
  END IF;

  PERFORM project.id
  FROM public.projects AS project
  WHERE project.id = v_order.project_id
    AND project.tenant_id = p_tenant_id
  FOR SHARE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'status', 'project_invalid',
      'error_code', 'SUPPLIER_PURCHASE_ORDER_PROJECT_INVALID'
    );
  END IF;

  v_before := public.supplier_purchase_order_snapshot(v_order);

  IF v_has_fulfillment THEN
    PERFORM pg_catalog.set_config(
      'private.supplier_purchase_fulfillment_command',
      'cancel',
      true
    );
    UPDATE public.supplier_purchase_order_fulfillments AS fulfillment
    SET status = 'cancelled',
        cancelled_at = v_cancelled_at,
        cancelled_by_user_id = p_actor_user_id,
        cancelled_by_employee_id = p_actor_employee_id,
        cancel_reason = btrim(p_reason),
        version = fulfillment.version + 1,
        updated_by_employee_id = p_actor_employee_id,
        updated_at = v_cancelled_at
    WHERE fulfillment.id = v_fulfillment.id
    RETURNING fulfillment.* INTO v_fulfillment;
  END IF;

  UPDATE public.supplier_purchase_orders AS purchase_order
  SET status = 'cancelled',
      submitted_by_employee_id =
        purchase_order.submitted_by_employee_id,
      submitted_at = purchase_order.submitted_at,
      cancelled_by_employee_id = p_actor_employee_id,
      cancelled_at = v_cancelled_at,
      cancel_reason = btrim(p_reason),
      version = purchase_order.version + 1,
      updated_by_employee_id = p_actor_employee_id,
      updated_at = v_cancelled_at
  WHERE purchase_order.id = p_order_id
  RETURNING * INTO v_order;

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
  )
  VALUES (
    p_tenant_id,
    'supplier_purchase_order',
    p_order_id,
    'cancel_supplier_purchase_order',
    v_before || jsonb_build_object('_request', v_request),
    public.supplier_purchase_order_snapshot(v_order),
    btrim(p_reason),
    p_actor_user_id,
    p_actor_employee_id,
    p_idempotency_key,
    v_order.version
  );

  RETURN jsonb_build_object(
    'status', 'cancelled',
    'idempotent', false,
    'purchase_order', public.supplier_purchase_order_snapshot(v_order),
    'version', v_order.version
  );
END;
$$;

COMMIT;
