-- Abort safely if an existing database violates the historical closed_at invariant.
DO $$
DECLARE
  v_invalid_count bigint;
BEGIN
  SELECT count(*)
  INTO v_invalid_count
  FROM public.tenant_service_orders
  WHERE (payment_status = 'closed' AND closed_at IS NULL)
    OR (payment_status <> 'closed' AND closed_at IS NOT NULL);

  IF v_invalid_count > 0 THEN
    RAISE EXCEPTION
      'platform service historical closed_at invariant violated: % rows',
      v_invalid_count;
  END IF;
END;
$$;

-- SERVICE_ORDER_CANCEL_CLAIM_LEASE_MINUTES = 15
ALTER TABLE public.tenant_service_orders
  ADD COLUMN cancel_idempotency_key uuid NULL,
  ADD COLUMN cancel_claim_expires_at timestamptz NULL,
  ADD COLUMN close_reason text NULL,
  ADD COLUMN closed_by_employee_id uuid NULL;

ALTER TABLE public.tenant_service_orders
  ADD CONSTRAINT tenant_service_orders_close_reason_check
    CHECK (
      close_reason IS NULL
      OR close_reason IN ('user_changed_product', 'user_cancelled')
    ),
  ADD CONSTRAINT tenant_service_orders_closed_by_employee_tenant_fkey
    FOREIGN KEY (closed_by_employee_id, tenant_id)
    REFERENCES public.employees(id, tenant_id)
    ON DELETE RESTRICT,
  ADD CONSTRAINT tenant_service_orders_closed_fields_check
    CHECK (
      (payment_status = 'pending'
        AND closed_at IS NULL
        AND (
          (close_reason IS NULL
            AND closed_by_employee_id IS NULL
            AND cancel_idempotency_key IS NULL
            AND cancel_claim_expires_at IS NULL)
          OR
          (close_reason IS NOT NULL
            AND closed_by_employee_id IS NOT NULL
            AND cancel_idempotency_key IS NOT NULL
            AND cancel_claim_expires_at IS NOT NULL)
        ))
      OR
      (payment_status = 'closed'
        AND closed_at IS NOT NULL
        AND (
          (close_reason IS NULL
            AND closed_by_employee_id IS NULL
            AND cancel_idempotency_key IS NULL
            AND cancel_claim_expires_at IS NULL)
          OR
          (close_reason IS NOT NULL
            AND closed_by_employee_id IS NOT NULL
            AND cancel_idempotency_key IS NOT NULL
            AND cancel_claim_expires_at IS NOT NULL)
        ))
      OR
      (payment_status NOT IN ('pending', 'closed')
        AND closed_at IS NULL
        AND close_reason IS NULL
        AND closed_by_employee_id IS NULL
        AND cancel_idempotency_key IS NULL
        AND cancel_claim_expires_at IS NULL)
    );

CREATE UNIQUE INDEX tenant_service_orders_cancel_idempotency_key_unique
  ON public.tenant_service_orders (tenant_id, cancel_idempotency_key)
  WHERE cancel_idempotency_key IS NOT NULL;

CREATE OR REPLACE FUNCTION public.platform_service_clear_cancel_claim_on_payment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.payment_status = 'pending'
    AND NEW.payment_status NOT IN ('pending', 'closed')
  THEN
    NEW.cancel_idempotency_key := NULL;
    NEW.cancel_claim_expires_at := NULL;
    NEW.close_reason := NULL;
    NEW.closed_by_employee_id := NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER tr_tenant_service_orders_clear_cancel_claim
BEFORE UPDATE OF payment_status ON public.tenant_service_orders
FOR EACH ROW
EXECUTE FUNCTION public.platform_service_clear_cancel_claim_on_payment();

REVOKE ALL ON FUNCTION public.platform_service_clear_cancel_claim_on_payment()
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_service_clear_cancel_claim_on_payment()
  FROM anon;
REVOKE ALL ON FUNCTION public.platform_service_clear_cancel_claim_on_payment()
  FROM authenticated;

CREATE OR REPLACE FUNCTION public.platform_service_claim_pending_order_cancel(
  p_tenant_id uuid,
  p_order_id uuid,
  p_expected_version integer,
  p_idempotency_key uuid,
  p_reason text,
  p_closed_by_employee_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order public.tenant_service_orders%ROWTYPE;
BEGIN
  IF p_idempotency_key IS NULL
    OR p_expected_version IS NULL
    OR p_expected_version <= 0
    OR p_reason IS NULL
    OR p_reason NOT IN ('user_changed_product', 'user_cancelled')
  THEN
    RETURN jsonb_build_object('error_code', 'VALIDATION_ERROR');
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      p_tenant_id::text || ':' || p_idempotency_key::text,
      0
    )
  );

  IF NOT EXISTS (
    SELECT 1
    FROM public.employees AS employee
    WHERE employee.id = p_closed_by_employee_id
      AND employee.tenant_id = p_tenant_id
      AND employee.status = 'active'
  ) THEN
    RETURN jsonb_build_object('error_code', 'SERVICE_ORDER_ACTOR_INVALID');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.tenant_service_orders AS reused
    WHERE reused.tenant_id = p_tenant_id
      AND reused.cancel_idempotency_key = p_idempotency_key
      AND reused.id <> p_order_id
  ) THEN
    RETURN jsonb_build_object(
      'error_code', 'SERVICE_ORDER_IDEMPOTENCY_CONFLICT'
    );
  END IF;

  SELECT *
  INTO v_order
  FROM public.tenant_service_orders
  WHERE id = p_order_id
    AND tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error_code', 'SERVICE_ORDER_NOT_FOUND');
  END IF;

  IF v_order.payment_status = 'closed' THEN
    RETURN jsonb_build_object(
      'idempotent', true,
      'order', to_jsonb(v_order)
    );
  END IF;

  IF v_order.payment_status = 'paid' THEN
    RETURN jsonb_build_object(
      'error_code', 'SERVICE_ORDER_ALREADY_PAID',
      'order', to_jsonb(v_order)
    );
  END IF;

  IF v_order.payment_status <> 'pending' THEN
    RETURN jsonb_build_object(
      'error_code', 'SERVICE_ORDER_CANCEL_NOT_ALLOWED',
      'order', to_jsonb(v_order)
    );
  END IF;

  IF v_order.version <> p_expected_version THEN
    RETURN jsonb_build_object(
      'error_code', 'SERVICE_ORDER_VERSION_CONFLICT',
      'order', to_jsonb(v_order)
    );
  END IF;

  IF v_order.cancel_idempotency_key IS NOT NULL THEN
    IF v_order.cancel_idempotency_key = p_idempotency_key THEN
      IF v_order.close_reason <> p_reason
        OR v_order.closed_by_employee_id <> p_closed_by_employee_id
      THEN
        RETURN jsonb_build_object(
          'error_code', 'SERVICE_ORDER_IDEMPOTENCY_CONFLICT',
          'order', to_jsonb(v_order)
        );
      END IF;
    ELSIF v_order.cancel_claim_expires_at > clock_timestamp() THEN
      RETURN jsonb_build_object(
        'error_code', 'SERVICE_ORDER_CANCEL_IN_PROGRESS',
        'order', to_jsonb(v_order)
      );
    END IF;

    UPDATE public.tenant_service_orders
    SET cancel_idempotency_key = p_idempotency_key,
        cancel_claim_expires_at = clock_timestamp() + interval '15 minutes',
        close_reason = p_reason,
        closed_by_employee_id = p_closed_by_employee_id
    WHERE id = v_order.id
      AND tenant_id = v_order.tenant_id
      AND payment_status = 'pending'
      AND version = p_expected_version
    RETURNING * INTO v_order;

    RETURN jsonb_build_object(
      'idempotent', false,
      'claimed', true,
      'order', to_jsonb(v_order)
    );
  END IF;

  UPDATE public.tenant_service_orders
  SET cancel_idempotency_key = p_idempotency_key,
      cancel_claim_expires_at = clock_timestamp() + interval '15 minutes',
      close_reason = p_reason,
      closed_by_employee_id = p_closed_by_employee_id
  WHERE id = v_order.id
    AND tenant_id = v_order.tenant_id
    AND payment_status = 'pending'
    AND version = p_expected_version
    AND cancel_idempotency_key IS NULL
  RETURNING * INTO v_order;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'error_code', 'SERVICE_ORDER_CANCEL_IN_PROGRESS'
    );
  END IF;

  RETURN jsonb_build_object(
    'idempotent', false,
    'claimed', true,
    'order', to_jsonb(v_order)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_service_cancel_pending_order(
  p_tenant_id uuid,
  p_order_id uuid,
  p_expected_version integer,
  p_idempotency_key uuid,
  p_require_missing_prepay boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order public.tenant_service_orders%ROWTYPE;
BEGIN
  IF p_idempotency_key IS NULL
    OR p_expected_version IS NULL
    OR p_expected_version <= 0
  THEN
    RETURN jsonb_build_object('error_code', 'VALIDATION_ERROR');
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      p_tenant_id::text || ':' || p_idempotency_key::text,
      0
    )
  );

  SELECT *
  INTO v_order
  FROM public.tenant_service_orders
  WHERE id = p_order_id
    AND tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error_code', 'SERVICE_ORDER_NOT_FOUND');
  END IF;

  IF v_order.payment_status = 'closed' THEN
    RETURN jsonb_build_object(
      'idempotent', true,
      'order', to_jsonb(v_order)
    );
  END IF;

  IF v_order.payment_status = 'paid' THEN
    RETURN jsonb_build_object(
      'error_code', 'SERVICE_ORDER_ALREADY_PAID',
      'order', to_jsonb(v_order)
    );
  END IF;

  IF v_order.payment_status <> 'pending' THEN
    RETURN jsonb_build_object(
      'error_code', 'SERVICE_ORDER_CANCEL_NOT_ALLOWED',
      'order', to_jsonb(v_order)
    );
  END IF;

  IF v_order.version <> p_expected_version THEN
    RETURN jsonb_build_object(
      'error_code', 'SERVICE_ORDER_VERSION_CONFLICT',
      'order', to_jsonb(v_order)
    );
  END IF;

  IF v_order.cancel_idempotency_key IS DISTINCT FROM p_idempotency_key THEN
    RETURN jsonb_build_object(
      'error_code', 'SERVICE_ORDER_CANCEL_IN_PROGRESS',
      'order', to_jsonb(v_order)
    );
  END IF;

  IF p_require_missing_prepay AND v_order.prepay_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'error_code', 'SERVICE_ORDER_CANCEL_PREPAY_CHANGED',
      'order', to_jsonb(v_order)
    );
  END IF;

  UPDATE public.tenant_service_orders
  SET payment_status = 'closed',
      closed_at = clock_timestamp(),
      version = version + 1
  WHERE id = v_order.id
    AND tenant_id = v_order.tenant_id
    AND payment_status = 'pending'
    AND version = p_expected_version
    AND cancel_idempotency_key = p_idempotency_key
    AND (NOT p_require_missing_prepay OR prepay_id IS NULL)
  RETURNING * INTO v_order;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'error_code', 'SERVICE_ORDER_VERSION_CONFLICT'
    );
  END IF;

  RETURN jsonb_build_object(
    'idempotent', false,
    'order', to_jsonb(v_order)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.platform_service_cancel_pending_order(
  uuid, uuid, integer, uuid, boolean
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_service_cancel_pending_order(
  uuid, uuid, integer, uuid, boolean
) FROM anon;
REVOKE ALL ON FUNCTION public.platform_service_cancel_pending_order(
  uuid, uuid, integer, uuid, boolean
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.platform_service_cancel_pending_order(
  uuid, uuid, integer, uuid, boolean
) TO service_role;

COMMENT ON FUNCTION public.platform_service_cancel_pending_order(
  uuid, uuid, integer, uuid, boolean
) IS 'Atomically closes a tenant pending platform service order after WeChat Pay closure has been confirmed.';

REVOKE ALL ON FUNCTION public.platform_service_claim_pending_order_cancel(
  uuid, uuid, integer, uuid, text, uuid
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_service_claim_pending_order_cancel(
  uuid, uuid, integer, uuid, text, uuid
) FROM anon;
REVOKE ALL ON FUNCTION public.platform_service_claim_pending_order_cancel(
  uuid, uuid, integer, uuid, text, uuid
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.platform_service_claim_pending_order_cancel(
  uuid, uuid, integer, uuid, text, uuid
) TO service_role;

COMMENT ON FUNCTION public.platform_service_claim_pending_order_cancel(
  uuid, uuid, integer, uuid, text, uuid
) IS 'Reserves a tenant pending platform service order cancellation before any WeChat Pay side effect.';
