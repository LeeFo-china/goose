-- Rollback: use a forward migration to revoke the reconciliation RPCs, wait
-- for active leases to expire, disable the worker, then drop the due index and
-- audit columns. Keep confirmed payment and delivery audit facts permanently.

BEGIN;

ALTER TABLE public.tenant_virtual_addon_orders
  ADD COLUMN reconcile_next_at timestamptz NULL DEFAULT now(),
  ADD COLUMN reconcile_last_checked_at timestamptz NULL,
  ADD COLUMN reconcile_last_provider_status integer NULL,
  ADD COLUMN reconcile_last_error_code text NULL,
  ADD COLUMN provider_delivery_status text NOT NULL DEFAULT 'not_required',
  ADD COLUMN provider_delivery_attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN provider_delivery_last_error_code text NULL,
  ADD COLUMN provider_delivery_last_error text NULL,
  ADD COLUMN provider_delivery_notified_at timestamptz NULL,
  ADD COLUMN provider_delivery_request_id text NULL,
  ADD CONSTRAINT tenant_virtual_addon_orders_reconcile_provider_status_check
    CHECK (
      reconcile_last_provider_status IS NULL
      OR reconcile_last_provider_status IN (0, 1, 6)
    ),
  ADD CONSTRAINT tenant_virtual_addon_orders_reconcile_error_code_check
    CHECK (
      reconcile_last_error_code IS NULL
      OR (
        btrim(reconcile_last_error_code) <> ''
        AND char_length(reconcile_last_error_code) <= 100
      )
    ),
  ADD CONSTRAINT tenant_virtual_addon_orders_delivery_status_check
    CHECK (
      provider_delivery_status IN (
        'not_required', 'pending', 'succeeded', 'failed'
      )
    ),
  ADD CONSTRAINT tenant_virtual_addon_orders_delivery_attempt_check
    CHECK (
      provider_delivery_attempt_count >= 0
      AND (
        provider_delivery_status = 'not_required'
        OR provider_delivery_attempt_count > 0
      )
    ),
  ADD CONSTRAINT tenant_virtual_addon_orders_delivery_error_code_check
    CHECK (
      provider_delivery_last_error_code IS NULL
      OR (
        btrim(provider_delivery_last_error_code) <> ''
        AND char_length(provider_delivery_last_error_code) <= 100
      )
    ),
  ADD CONSTRAINT tenant_virtual_addon_orders_delivery_error_check
    CHECK (
      provider_delivery_last_error IS NULL
      OR (
        btrim(provider_delivery_last_error) <> ''
        AND char_length(provider_delivery_last_error) <= 500
      )
    ),
  ADD CONSTRAINT tenant_virtual_addon_orders_delivery_request_check
    CHECK (
      provider_delivery_request_id IS NULL
      OR (
        btrim(provider_delivery_request_id) <> ''
        AND char_length(provider_delivery_request_id) <= 128
      )
    ),
  ADD CONSTRAINT tenant_virtual_addon_orders_delivery_audit_check
    CHECK (
      (
        provider_delivery_status = 'not_required'
        AND provider_delivery_attempt_count = 0
        AND provider_delivery_request_id IS NULL
        AND provider_delivery_notified_at IS NULL
        AND provider_delivery_last_error_code IS NULL
        AND provider_delivery_last_error IS NULL
      )
      OR (
        provider_delivery_status = 'pending'
        AND provider_delivery_attempt_count > 0
        AND provider_delivery_request_id IS NOT NULL
        AND provider_delivery_notified_at IS NULL
        AND provider_delivery_last_error_code IS NULL
        AND provider_delivery_last_error IS NULL
      )
      OR (
        provider_delivery_status = 'succeeded'
        AND provider_delivery_attempt_count > 0
        AND provider_delivery_request_id IS NOT NULL
        AND provider_delivery_notified_at IS NOT NULL
        AND provider_delivery_last_error_code IS NULL
        AND provider_delivery_last_error IS NULL
      )
      OR (
        provider_delivery_status = 'failed'
        AND provider_delivery_attempt_count > 0
        AND provider_delivery_request_id IS NOT NULL
        AND provider_delivery_notified_at IS NULL
        AND provider_delivery_last_error_code IS NOT NULL
        AND provider_delivery_last_error IS NOT NULL
      )
    );

CREATE INDEX tenant_virtual_addon_orders_reconciliation_due_idx
ON public.tenant_virtual_addon_orders(
  reconcile_next_at ASC,
  payment_expires_at ASC,
  id ASC
)
WHERE reconcile_next_at IS NOT NULL
  AND (
    (
      payment_status = 'pending'
      AND payment_request_issued_at IS NOT NULL
    )
    OR (
      payment_status = 'succeeded'
      AND fulfillment_status = 'grant_failed'
    )
    OR (
      payment_status = 'succeeded'
      AND fulfillment_status = 'granted'
      AND provider_delivery_status IN ('pending', 'failed')
    )
  );

CREATE OR REPLACE FUNCTION public.branding_claim_virtual_payment_reconciliation_batch(
  p_limit integer,
  p_lease_seconds integer
)
RETURNS TABLE(
  id uuid,
  tenant_id uuid,
  order_no text,
  out_trade_no text,
  idempotency_key uuid,
  product_id uuid,
  product_code text,
  entitlement_code text,
  product_name text,
  amount_fen integer,
  term_years integer,
  purchase_notes text,
  refund_policy text,
  environment text,
  offer_id text,
  provider_product_id text,
  requested_platform text,
  settlement_channel text,
  payer_openid text,
  provider_order_no text,
  transaction_id text,
  payment_status text,
  fulfillment_status text,
  refund_status text,
  paid_amount_fen integer,
  paid_at timestamptz,
  entitlement_event_id uuid,
  config_version integer,
  secret_revision integer,
  payment_expires_at timestamptz,
  failure_code text,
  failure_message text,
  payment_request_claim_token uuid,
  payment_request_claimed_at timestamptz,
  payment_request_claim_expires_at timestamptz,
  payment_request_issued_at timestamptz,
  payment_request_attempt_revision integer,
  created_by uuid,
  created_at timestamptz,
  updated_at timestamptz,
  reconcile_claim_token uuid,
  reconcile_claim_expires_at timestamptz,
  reconcile_attempt_count integer,
  reconcile_last_error_code text,
  reconcile_last_error text,
  reconcile_next_at timestamptz,
  reconcile_last_checked_at timestamptz,
  reconcile_last_provider_status integer,
  provider_delivery_status text,
  provider_delivery_attempt_count integer,
  provider_delivery_last_error_code text,
  provider_delivery_last_error text,
  provider_delivery_notified_at timestamptz,
  provider_delivery_request_id text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100);
  v_lease_seconds integer := LEAST(
    GREATEST(COALESCE(p_lease_seconds, 120), 30),
    600
  );
BEGIN
  RETURN QUERY
  WITH candidates AS (
    SELECT orders.id
    FROM public.tenant_virtual_addon_orders AS orders
    WHERE orders.reconcile_next_at IS NOT NULL
      AND orders.reconcile_next_at <= v_now
      AND (
        orders.reconcile_claim_token IS NULL
        OR orders.reconcile_claim_expires_at <= v_now
      )
      AND (
        (
          orders.payment_status = 'pending'
          AND orders.payment_expires_at <= v_now
          AND orders.payment_request_issued_at IS NOT NULL
        )
        OR (
          orders.payment_status = 'succeeded'
          AND orders.fulfillment_status = 'grant_failed'
        )
        OR (
          orders.payment_status = 'succeeded'
          AND orders.fulfillment_status = 'granted'
          AND orders.provider_delivery_status IN ('pending', 'failed')
        )
      )
    ORDER BY
      orders.reconcile_next_at ASC,
      orders.payment_expires_at ASC,
      orders.id ASC
    LIMIT v_limit
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.tenant_virtual_addon_orders AS orders
  SET reconcile_claim_token = gen_random_uuid(),
      reconcile_claim_expires_at = v_now
        + make_interval(secs => v_lease_seconds),
      reconcile_attempt_count = orders.reconcile_attempt_count + 1,
      reconcile_last_error_code = NULL,
      reconcile_last_error = NULL
  FROM candidates
  WHERE orders.id = candidates.id
  RETURNING
    orders.id,
    orders.tenant_id,
    orders.order_no,
    orders.out_trade_no,
    orders.idempotency_key,
    orders.product_id,
    orders.product_code,
    orders.entitlement_code,
    orders.product_name,
    orders.amount_fen,
    orders.term_years,
    orders.purchase_notes,
    orders.refund_policy,
    orders.environment,
    orders.offer_id,
    orders.provider_product_id,
    orders.requested_platform,
    orders.settlement_channel,
    orders.payer_openid,
    orders.provider_order_no,
    orders.transaction_id,
    orders.payment_status,
    orders.fulfillment_status,
    orders.refund_status,
    orders.paid_amount_fen,
    orders.paid_at,
    orders.entitlement_event_id,
    orders.config_version,
    orders.secret_revision,
    orders.payment_expires_at,
    orders.failure_code,
    orders.failure_message,
    orders.payment_request_claim_token,
    orders.payment_request_claimed_at,
    orders.payment_request_claim_expires_at,
    orders.payment_request_issued_at,
    orders.payment_request_attempt_revision,
    orders.created_by,
    orders.created_at,
    orders.updated_at,
    orders.reconcile_claim_token,
    orders.reconcile_claim_expires_at,
    orders.reconcile_attempt_count,
    orders.reconcile_last_error_code,
    orders.reconcile_last_error,
    orders.reconcile_next_at,
    orders.reconcile_last_checked_at,
    orders.reconcile_last_provider_status,
    orders.provider_delivery_status,
    orders.provider_delivery_attempt_count,
    orders.provider_delivery_last_error_code,
    orders.provider_delivery_last_error,
    orders.provider_delivery_notified_at,
    orders.provider_delivery_request_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.branding_reschedule_virtual_payment_reconciliation(
  p_order_id uuid,
  p_claim_token uuid,
  p_next_at timestamptz,
  p_error_code text,
  p_error_summary text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_order public.tenant_virtual_addon_orders%ROWTYPE;
  v_now timestamptz := clock_timestamp();
BEGIN
  IF p_order_id IS NULL OR p_claim_token IS NULL
     OR p_next_at IS NULL OR p_next_at <= v_now
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'BRANDING_VIRTUAL_RECONCILIATION_INPUT_INVALID';
  END IF;

  SELECT orders.* INTO v_order
  FROM public.tenant_virtual_addon_orders AS orders
  WHERE orders.id = p_order_id
    AND orders.reconcile_claim_token = p_claim_token
    AND orders.reconcile_claim_expires_at > v_now
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'BRANDING_VIRTUAL_RECONCILIATION_CLAIM_INVALID';
  END IF;
  IF NOT (
    (
      v_order.payment_status = 'pending'
      AND v_order.payment_expires_at <= v_now
      AND v_order.payment_request_issued_at IS NOT NULL
    )
    OR (
      v_order.payment_status = 'succeeded'
      AND v_order.fulfillment_status = 'grant_failed'
    )
    OR (
      v_order.payment_status = 'succeeded'
      AND v_order.fulfillment_status = 'granted'
      AND v_order.provider_delivery_status IN ('pending', 'failed')
    )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'BRANDING_VIRTUAL_RECONCILIATION_STATE_INVALID';
  END IF;

  UPDATE public.tenant_virtual_addon_orders AS orders
  SET reconcile_next_at = p_next_at,
      reconcile_last_checked_at = v_now,
      reconcile_last_error_code = left(
        nullif(btrim(p_error_code), ''),
        100
      ),
      reconcile_last_error = left(
        nullif(btrim(p_error_summary), ''),
        500
      ),
      reconcile_claim_token = NULL,
      reconcile_claim_expires_at = NULL
  WHERE orders.id = p_order_id
    AND orders.reconcile_claim_token = p_claim_token;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'BRANDING_VIRTUAL_RECONCILIATION_CLAIM_INVALID';
  END IF;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.branding_close_unpaid_virtual_payment_reconciliation(
  p_order_id uuid,
  p_claim_token uuid,
  p_official_status integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_order public.tenant_virtual_addon_orders%ROWTYPE;
  v_now timestamptz := clock_timestamp();
BEGIN
  IF p_order_id IS NULL OR p_claim_token IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'BRANDING_VIRTUAL_RECONCILIATION_INPUT_INVALID';
  END IF;
  IF p_official_status IS NULL OR p_official_status NOT IN (0, 1, 6) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'BRANDING_VIRTUAL_RECONCILIATION_OFFICIAL_STATUS_INVALID';
  END IF;

  SELECT orders.* INTO v_order
  FROM public.tenant_virtual_addon_orders AS orders
  WHERE orders.id = p_order_id
    AND orders.reconcile_claim_token = p_claim_token
    AND orders.reconcile_claim_expires_at > v_now
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'BRANDING_VIRTUAL_RECONCILIATION_CLAIM_INVALID';
  END IF;
  IF v_order.payment_status <> 'pending'
     OR v_order.payment_request_issued_at IS NULL
     OR v_order.payment_expires_at > v_now
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'BRANDING_VIRTUAL_RECONCILIATION_STATE_INVALID';
  END IF;

  UPDATE public.tenant_virtual_addon_orders AS orders
  SET payment_status = 'closed',
      failure_code = 'BRANDING_VIRTUAL_ORDER_EXPIRED',
      failure_message = '虚拟支付订单支付时间已结束，官方查询未发现成功付款',
      reconcile_next_at = NULL,
      reconcile_last_checked_at = v_now,
      reconcile_last_provider_status = p_official_status,
      reconcile_last_error_code = NULL,
      reconcile_last_error = NULL,
      reconcile_claim_token = NULL,
      reconcile_claim_expires_at = NULL
  WHERE orders.id = p_order_id
    AND orders.reconcile_claim_token = p_claim_token;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'BRANDING_VIRTUAL_RECONCILIATION_CLAIM_INVALID';
  END IF;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.branding_complete_virtual_payment_reconciliation(
  p_order_id uuid,
  p_claim_token uuid,
  p_environment text,
  p_openid text,
  p_out_trade_no text,
  p_provider_product_id text,
  p_quantity integer,
  p_currency text,
  p_orig_price_fen integer,
  p_actual_price_fen integer,
  p_provider_order_no text,
  p_transaction_id text,
  p_paid_at timestamptz,
  p_attach text,
  p_delivery_request_id text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_tenant_id uuid;
  v_order public.tenant_virtual_addon_orders%ROWTYPE;
  v_result jsonb;
  v_now timestamptz := clock_timestamp();
  v_requires_delivery boolean;
BEGIN
  IF p_order_id IS NULL OR p_claim_token IS NULL
     OR p_provider_order_no IS NULL OR btrim(p_provider_order_no) = ''
     OR char_length(p_provider_order_no) > 128
     OR p_transaction_id IS NULL OR btrim(p_transaction_id) = ''
     OR char_length(p_transaction_id) > 128
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'BRANDING_VIRTUAL_RECONCILIATION_INPUT_INVALID';
  END IF;

  SELECT orders.tenant_id INTO v_tenant_id
  FROM public.tenant_virtual_addon_orders AS orders
  WHERE orders.id = p_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'BRANDING_VIRTUAL_RECONCILIATION_CLAIM_INVALID';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(v_tenant_id::text || ':custom_support_branding', 20260728)
  );
  PERFORM pg_advisory_xact_lock(
    hashtextextended('wechat_virtual_tx:' || p_transaction_id, 20260801)
  );
  PERFORM pg_advisory_xact_lock(
    hashtextextended('wechat_virtual_order:' || p_provider_order_no, 20260801)
  );

  SELECT orders.* INTO v_order
  FROM public.tenant_virtual_addon_orders AS orders
  WHERE orders.id = p_order_id
    AND orders.reconcile_claim_token = p_claim_token
    AND orders.reconcile_claim_expires_at > v_now
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'BRANDING_VIRTUAL_RECONCILIATION_CLAIM_INVALID';
  END IF;
  IF NOT (
    (
      v_order.payment_status = 'pending'
      AND v_order.payment_request_issued_at IS NOT NULL
      AND v_order.payment_expires_at <= v_now
    )
    OR (
      v_order.payment_status = 'succeeded'
      AND v_order.fulfillment_status = 'grant_failed'
    )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'BRANDING_VIRTUAL_RECONCILIATION_STATE_INVALID';
  END IF;
  v_requires_delivery := v_order.payment_status = 'pending';
  IF v_requires_delivery
     AND (
       p_delivery_request_id IS NULL
       OR btrim(p_delivery_request_id) = ''
       OR char_length(p_delivery_request_id) > 128
     )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'BRANDING_VIRTUAL_RECONCILIATION_INPUT_INVALID';
  END IF;

  v_result := public.branding_confirm_virtual_addon_purchase(
    p_order_id,
    NULL,
    'reconciliation',
    true,
    'query_order',
    NULL,
    NULL,
    NULL,
    NULL,
    true,
    p_environment,
    p_openid,
    p_out_trade_no,
    p_provider_product_id,
    p_quantity,
    p_currency,
    p_orig_price_fen,
    p_actual_price_fen,
    p_provider_order_no,
    p_transaction_id,
    p_paid_at,
    p_attach
  );

  IF v_result->>'fulfilled' IS DISTINCT FROM 'true' THEN
    UPDATE public.tenant_virtual_addon_orders AS orders
    SET reconcile_next_at = v_now + interval '5 minutes',
        reconcile_last_checked_at = v_now,
        reconcile_last_provider_status = 1,
        reconcile_last_error_code = left(
          nullif(btrim(v_result->>'failure_code'), ''),
          100
        ),
        reconcile_last_error = '支付已确认，权益发放等待重试',
        reconcile_claim_token = NULL,
        reconcile_claim_expires_at = NULL
    WHERE orders.id = p_order_id
      AND orders.reconcile_claim_token = p_claim_token;
  ELSIF v_requires_delivery THEN
    UPDATE public.tenant_virtual_addon_orders AS orders
    SET reconcile_next_at = v_now,
        reconcile_last_checked_at = v_now,
        reconcile_last_provider_status = 1,
        reconcile_last_error_code = NULL,
        reconcile_last_error = NULL,
        provider_delivery_status = 'pending',
        provider_delivery_attempt_count =
          orders.provider_delivery_attempt_count + 1,
        provider_delivery_request_id = p_delivery_request_id,
        provider_delivery_notified_at = NULL,
        provider_delivery_last_error_code = NULL,
        provider_delivery_last_error = NULL
    WHERE orders.id = p_order_id
      AND orders.reconcile_claim_token = p_claim_token;
  ELSE
    UPDATE public.tenant_virtual_addon_orders AS orders
    SET reconcile_next_at = NULL,
        reconcile_last_checked_at = v_now,
        reconcile_last_provider_status = 1,
        reconcile_last_error_code = NULL,
        reconcile_last_error = NULL,
        reconcile_claim_token = NULL,
        reconcile_claim_expires_at = NULL
    WHERE orders.id = p_order_id
      AND orders.reconcile_claim_token = p_claim_token;
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'BRANDING_VIRTUAL_RECONCILIATION_CLAIM_INVALID';
  END IF;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.branding_mark_virtual_payment_delivery(
  p_order_id uuid,
  p_claim_token uuid,
  p_delivery_status text,
  p_request_id text,
  p_error_code text,
  p_error_summary text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_order public.tenant_virtual_addon_orders%ROWTYPE;
  v_now timestamptz := clock_timestamp();
BEGIN
  IF p_order_id IS NULL OR p_claim_token IS NULL
     OR p_delivery_status IS NULL
     OR p_delivery_status NOT IN ('pending', 'succeeded', 'failed')
     OR p_request_id IS NULL OR btrim(p_request_id) = ''
     OR char_length(p_request_id) > 128
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'BRANDING_VIRTUAL_DELIVERY_REQUEST_INVALID';
  END IF;

  SELECT orders.* INTO v_order
  FROM public.tenant_virtual_addon_orders AS orders
  WHERE orders.id = p_order_id
    AND orders.reconcile_claim_token = p_claim_token
    AND orders.reconcile_claim_expires_at > v_now
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'BRANDING_VIRTUAL_RECONCILIATION_CLAIM_INVALID';
  END IF;
  IF v_order.payment_status <> 'succeeded'
     OR v_order.fulfillment_status <> 'granted'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'BRANDING_VIRTUAL_DELIVERY_STATE_INVALID';
  END IF;

  IF p_delivery_status = 'pending' THEN
    IF v_order.provider_delivery_status = 'pending'
       AND v_order.provider_delivery_request_id = p_request_id
    THEN
      RETURN true;
    END IF;
    IF v_order.provider_delivery_status <> 'failed' THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001', MESSAGE = 'BRANDING_VIRTUAL_DELIVERY_STATE_INVALID';
    END IF;
    UPDATE public.tenant_virtual_addon_orders AS orders
    SET provider_delivery_status = 'pending',
        provider_delivery_attempt_count =
          orders.provider_delivery_attempt_count + 1,
        provider_delivery_request_id = p_request_id,
        provider_delivery_notified_at = NULL,
        provider_delivery_last_error_code = NULL,
        provider_delivery_last_error = NULL,
        reconcile_next_at = v_now,
        reconcile_last_checked_at = v_now,
        reconcile_last_error_code = NULL,
        reconcile_last_error = NULL
    WHERE orders.id = p_order_id
      AND orders.reconcile_claim_token = p_claim_token;
  ELSIF p_delivery_status = 'succeeded' THEN
    IF v_order.provider_delivery_status <> 'pending'
       OR v_order.provider_delivery_request_id IS DISTINCT FROM p_request_id
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001', MESSAGE = 'BRANDING_VIRTUAL_DELIVERY_STATE_INVALID';
    END IF;
    UPDATE public.tenant_virtual_addon_orders AS orders
    SET provider_delivery_status = 'succeeded',
        provider_delivery_notified_at = v_now,
        provider_delivery_last_error_code = NULL,
        provider_delivery_last_error = NULL,
        reconcile_next_at = NULL,
        reconcile_last_checked_at = v_now,
        reconcile_last_error_code = NULL,
        reconcile_last_error = NULL,
        reconcile_claim_token = NULL,
        reconcile_claim_expires_at = NULL
    WHERE orders.id = p_order_id
      AND orders.reconcile_claim_token = p_claim_token;
  ELSE
    IF v_order.provider_delivery_status <> 'pending'
       OR v_order.provider_delivery_request_id IS DISTINCT FROM p_request_id
       OR nullif(btrim(p_error_code), '') IS NULL
       OR nullif(btrim(p_error_summary), '') IS NULL
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001', MESSAGE = 'BRANDING_VIRTUAL_DELIVERY_STATE_INVALID';
    END IF;
    UPDATE public.tenant_virtual_addon_orders AS orders
    SET provider_delivery_status = 'failed',
        provider_delivery_notified_at = NULL,
        provider_delivery_last_error_code = left(
          nullif(btrim(p_error_code), ''),
          100
        ),
        provider_delivery_last_error = left(
          nullif(btrim(p_error_summary), ''),
          500
        ),
        reconcile_next_at = v_now + interval '5 minutes',
        reconcile_last_checked_at = v_now,
        reconcile_last_error_code = left(
          nullif(btrim(p_error_code), ''),
          100
        ),
        reconcile_last_error = left(
          nullif(btrim(p_error_summary), ''),
          500
        ),
        reconcile_claim_token = NULL,
        reconcile_claim_expires_at = NULL
    WHERE orders.id = p_order_id
      AND orders.reconcile_claim_token = p_claim_token;
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'BRANDING_VIRTUAL_RECONCILIATION_CLAIM_INVALID';
  END IF;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.branding_claim_virtual_payment_reconciliation_batch(
  integer, integer
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.branding_claim_virtual_payment_reconciliation_batch(
  integer, integer
) TO service_role;

REVOKE ALL ON FUNCTION public.branding_reschedule_virtual_payment_reconciliation(
  uuid, uuid, timestamptz, text, text
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.branding_reschedule_virtual_payment_reconciliation(
  uuid, uuid, timestamptz, text, text
) TO service_role;

REVOKE ALL ON FUNCTION public.branding_close_unpaid_virtual_payment_reconciliation(
  uuid, uuid, integer
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.branding_close_unpaid_virtual_payment_reconciliation(
  uuid, uuid, integer
) TO service_role;

REVOKE ALL ON FUNCTION public.branding_complete_virtual_payment_reconciliation(
  uuid, uuid, text, text, text, text, integer, text, integer, integer,
  text, text, timestamptz, text, text
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.branding_complete_virtual_payment_reconciliation(
  uuid, uuid, text, text, text, text, integer, text, integer, integer,
  text, text, timestamptz, text, text
) TO service_role;

REVOKE ALL ON FUNCTION public.branding_mark_virtual_payment_delivery(
  uuid, uuid, text, text, text, text
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.branding_mark_virtual_payment_delivery(
  uuid, uuid, text, text, text, text
) TO service_role;

COMMENT ON FUNCTION public.branding_claim_virtual_payment_reconciliation_batch(
  integer, integer
) IS 'Claims a bounded due batch with per-order leases and deterministic ordering.';
COMMENT ON FUNCTION public.branding_complete_virtual_payment_reconciliation(
  uuid, uuid, text, text, text, text, integer, text, integer, integer,
  text, text, timestamptz, text, text
) IS 'Confirms official payment facts under an exact reconciliation lease and reuses idempotent entitlement fulfillment.';
COMMENT ON COLUMN public.tenant_virtual_addon_orders.provider_delivery_status
IS 'Sanitized provider delivery-notification state for query-discovered successful orders.';

COMMIT;
