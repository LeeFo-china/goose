-- Rollback: use a forward migration to revoke the reconciliation RPCs, wait
-- for active leases to expire, disable the worker, then drop the due index,
-- scheduling trigger, and audit columns. Retain confirmed payment facts.

BEGIN;

ALTER TABLE public.tenant_virtual_addon_orders
  ADD COLUMN reconcile_next_at timestamptz NULL,
  ADD COLUMN reconcile_last_checked_at timestamptz NULL,
  ADD COLUMN reconcile_last_provider_status integer NULL,
  ADD COLUMN reconcile_last_error_code text NULL,
  ADD COLUMN reconcile_query_provider_order_no text NULL,
  ADD COLUMN reconcile_query_transaction_id text NULL,
  ADD COLUMN reconcile_query_paid_amount_fen integer NULL,
  ADD COLUMN reconcile_query_paid_at timestamptz NULL,
  ADD COLUMN provider_delivery_status text NOT NULL DEFAULT 'not_required',
  ADD COLUMN provider_delivery_attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN provider_delivery_attempt_key uuid NULL,
  ADD COLUMN provider_delivery_last_error_code text NULL,
  ADD COLUMN provider_delivery_last_error text NULL,
  ADD COLUMN provider_delivery_provided_at timestamptz NULL,
  ADD COLUMN provider_delivery_request_id text NULL,
  ADD CONSTRAINT tenant_virtual_addon_orders_reconcile_provider_status_check
    CHECK (
      reconcile_last_provider_status IS NULL
      OR reconcile_last_provider_status BETWEEN 0 AND 10
    ),
  ADD CONSTRAINT tenant_virtual_addon_orders_reconcile_error_code_check
    CHECK (
      reconcile_last_error_code IS NULL
      OR (
        btrim(reconcile_last_error_code) <> ''
        AND char_length(reconcile_last_error_code) <= 100
      )
    ),
  ADD CONSTRAINT tenant_virtual_addon_orders_reconcile_query_audit_check
    CHECK (
      (
        reconcile_query_provider_order_no IS NULL
        AND reconcile_query_transaction_id IS NULL
        AND reconcile_query_paid_amount_fen IS NULL
        AND reconcile_query_paid_at IS NULL
        AND (
          reconcile_last_provider_status IS NULL
          OR reconcile_last_provider_status NOT IN (2, 3, 4)
        )
      )
      OR (
        reconcile_last_provider_status IN (2, 3, 4)
        AND reconcile_query_provider_order_no IS NOT NULL
        AND btrim(reconcile_query_provider_order_no) <> ''
        AND char_length(reconcile_query_provider_order_no) <= 128
        AND reconcile_query_transaction_id IS NOT NULL
        AND btrim(reconcile_query_transaction_id) <> ''
        AND char_length(reconcile_query_transaction_id) <= 128
        AND reconcile_query_paid_amount_fen IS NOT NULL
        AND reconcile_query_paid_amount_fen >= 100
        AND reconcile_query_paid_at IS NOT NULL
      )
    ),
  ADD CONSTRAINT tenant_virtual_addon_orders_delivery_status_check
    CHECK (
      provider_delivery_status IN (
        'not_required', 'pending', 'succeeded', 'failed'
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
        AND provider_delivery_attempt_key IS NULL
        AND provider_delivery_request_id IS NULL
        AND provider_delivery_provided_at IS NULL
        AND provider_delivery_last_error_code IS NULL
        AND provider_delivery_last_error IS NULL
      )
      OR (
        provider_delivery_status = 'pending'
        AND provider_delivery_attempt_key IS NOT NULL
        AND provider_delivery_request_id IS NULL
        AND provider_delivery_attempt_count > 0
        AND provider_delivery_provided_at IS NULL
        AND provider_delivery_last_error_code IS NULL
        AND provider_delivery_last_error IS NULL
      )
      OR (
        provider_delivery_status = 'succeeded'
        AND provider_delivery_attempt_count >= 0
        AND provider_delivery_provided_at IS NOT NULL
        AND provider_delivery_last_error_code IS NULL
        AND provider_delivery_last_error IS NULL
      )
      OR (
        provider_delivery_status = 'failed'
        AND provider_delivery_attempt_count > 0
        AND provider_delivery_attempt_key IS NOT NULL
        AND provider_delivery_provided_at IS NULL
        AND provider_delivery_last_error_code IS NOT NULL
        AND provider_delivery_last_error IS NOT NULL
      )
    );

CREATE FUNCTION public.schedule_tenant_virtual_addon_order_reconciliation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.payment_status = 'pending'
     AND NEW.payment_request_issued_at IS NOT NULL
  THEN
    IF TG_OP = 'INSERT'
       OR OLD.payment_status IS DISTINCT FROM NEW.payment_status
       OR OLD.payment_request_issued_at IS DISTINCT FROM NEW.payment_request_issued_at
       OR OLD.payment_expires_at IS DISTINCT FROM NEW.payment_expires_at
    THEN
      NEW.reconcile_next_at := NEW.payment_expires_at;
    END IF;
  ELSIF NEW.payment_status = 'succeeded'
        AND NEW.fulfillment_status = 'grant_failed'
  THEN
    IF TG_OP = 'INSERT'
       OR OLD.payment_status IS DISTINCT FROM NEW.payment_status
       OR OLD.fulfillment_status IS DISTINCT FROM NEW.fulfillment_status
    THEN
      NEW.reconcile_next_at := clock_timestamp();
    ELSE
      NEW.reconcile_next_at := COALESCE(
        NEW.reconcile_next_at,
        clock_timestamp()
      );
    END IF;
  ELSIF NEW.payment_status = 'succeeded'
        AND NEW.fulfillment_status = 'granted'
        AND NEW.provider_delivery_status IN ('pending', 'failed')
  THEN
    NEW.reconcile_next_at := COALESCE(
      NEW.reconcile_next_at,
      clock_timestamp()
    );
  ELSIF NEW.payment_status = 'succeeded'
        AND NEW.fulfillment_status = 'granted'
        AND NEW.provider_delivery_status = 'not_required'
        AND NEW.reconcile_claim_token IS NOT NULL
  THEN
    NEW.reconcile_next_at := COALESCE(
      NEW.reconcile_next_at,
      clock_timestamp()
    );
  ELSE
    NEW.reconcile_next_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER schedule_tenant_virtual_addon_order_reconciliation
BEFORE INSERT OR UPDATE OF
  payment_status,
  fulfillment_status,
  payment_request_issued_at,
  payment_expires_at,
  provider_delivery_status
ON public.tenant_virtual_addon_orders
FOR EACH ROW
EXECUTE FUNCTION public.schedule_tenant_virtual_addon_order_reconciliation();

UPDATE public.tenant_virtual_addon_orders
SET reconcile_next_at = payment_expires_at
WHERE payment_status = 'pending'
  AND payment_request_issued_at IS NOT NULL;

UPDATE public.tenant_virtual_addon_orders
SET reconcile_next_at = clock_timestamp()
WHERE payment_status = 'succeeded'
  AND fulfillment_status = 'grant_failed';

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
    OR (
      payment_status = 'succeeded'
      AND fulfillment_status = 'granted'
      AND provider_delivery_status = 'not_required'
      AND reconcile_claim_token IS NOT NULL
    )
  );

CREATE FUNCTION public.branding_claim_virtual_payment_reconciliation_batch(
  p_limit integer,
  p_lease_seconds integer
)
RETURNS TABLE(
  id uuid,
  tenant_id uuid,
  out_trade_no text,
  environment text,
  offer_id text,
  provider_product_id text,
  payer_openid text,
  amount_fen integer,
  provider_order_no text,
  transaction_id text,
  payment_status text,
  fulfillment_status text,
  paid_amount_fen integer,
  paid_at timestamptz,
  payment_expires_at timestamptz,
  payment_request_issued_at timestamptz,
  entitlement_event_id uuid,
  reconcile_claim_token uuid,
  reconcile_claim_expires_at timestamptz,
  reconcile_attempt_count integer,
  reconcile_last_error_code text,
  reconcile_last_error text,
  reconcile_next_at timestamptz,
  reconcile_last_checked_at timestamptz,
  reconcile_last_provider_status integer,
  reconcile_query_provider_order_no text,
  reconcile_query_transaction_id text,
  reconcile_query_paid_amount_fen integer,
  reconcile_query_paid_at timestamptz,
  provider_delivery_status text,
  provider_delivery_attempt_count integer,
  provider_delivery_attempt_key uuid,
  provider_delivery_last_error_code text,
  provider_delivery_last_error text,
  provider_delivery_provided_at timestamptz,
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
        OR (
          orders.payment_status = 'succeeded'
          AND orders.fulfillment_status = 'granted'
          AND orders.provider_delivery_status = 'not_required'
          AND orders.reconcile_claim_token IS NOT NULL
        )
      )
    ORDER BY orders.reconcile_next_at, orders.payment_expires_at, orders.id
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
    orders.out_trade_no,
    orders.environment,
    orders.offer_id,
    orders.provider_product_id,
    orders.payer_openid,
    orders.amount_fen,
    orders.provider_order_no,
    orders.transaction_id,
    orders.payment_status,
    orders.fulfillment_status,
    orders.paid_amount_fen,
    orders.paid_at,
    orders.payment_expires_at,
    orders.payment_request_issued_at,
    orders.entitlement_event_id,
    orders.reconcile_claim_token,
    orders.reconcile_claim_expires_at,
    orders.reconcile_attempt_count,
    orders.reconcile_last_error_code,
    orders.reconcile_last_error,
    orders.reconcile_next_at,
    orders.reconcile_last_checked_at,
    orders.reconcile_last_provider_status,
    orders.reconcile_query_provider_order_no,
    orders.reconcile_query_transaction_id,
    orders.reconcile_query_paid_amount_fen,
    orders.reconcile_query_paid_at,
    orders.provider_delivery_status,
    orders.provider_delivery_attempt_count,
    orders.provider_delivery_attempt_key,
    orders.provider_delivery_last_error_code,
    orders.provider_delivery_last_error,
    orders.provider_delivery_provided_at,
    orders.provider_delivery_request_id;
END;
$$;

CREATE FUNCTION public.branding_reschedule_virtual_payment_reconciliation(
  p_order_id uuid,
  p_claim_token uuid,
  p_next_at timestamptz,
  p_official_status integer,
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
  v_now timestamptz;
BEGIN
  IF p_order_id IS NULL OR p_claim_token IS NULL OR p_next_at IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'BRANDING_VIRTUAL_RECONCILIATION_INPUT_INVALID';
  END IF;
  IF p_official_status IS NOT NULL
     AND p_official_status NOT BETWEEN 0 AND 10
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'BRANDING_VIRTUAL_RECONCILIATION_OFFICIAL_STATUS_INVALID';
  END IF;

  SELECT orders.* INTO v_order
  FROM public.tenant_virtual_addon_orders AS orders
  WHERE orders.id = p_order_id
  FOR UPDATE;
  v_now := clock_timestamp();
  IF NOT FOUND
     OR v_order.reconcile_claim_token IS DISTINCT FROM p_claim_token
     OR v_order.reconcile_claim_expires_at IS NULL
     OR v_order.reconcile_claim_expires_at <= v_now
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'BRANDING_VIRTUAL_RECONCILIATION_CLAIM_INVALID';
  END IF;
  IF p_next_at <= v_now THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'BRANDING_VIRTUAL_RECONCILIATION_INPUT_INVALID';
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
    OR (
      v_order.payment_status = 'succeeded'
      AND v_order.fulfillment_status = 'granted'
      AND v_order.provider_delivery_status = 'not_required'
      AND v_order.reconcile_claim_token IS NOT NULL
    )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'BRANDING_VIRTUAL_RECONCILIATION_STATE_INVALID';
  END IF;

  UPDATE public.tenant_virtual_addon_orders AS orders
  SET reconcile_next_at = p_next_at,
      reconcile_last_checked_at = v_now,
      reconcile_last_provider_status = p_official_status,
      reconcile_last_error_code = left(nullif(btrim(p_error_code), ''), 100),
      reconcile_last_error = left(nullif(btrim(p_error_summary), ''), 500),
      reconcile_query_provider_order_no = CASE
        WHEN p_official_status IN (2, 3, 4)
          AND p_official_status = orders.reconcile_last_provider_status
        THEN orders.reconcile_query_provider_order_no
        ELSE NULL
      END,
      reconcile_query_transaction_id = CASE
        WHEN p_official_status IN (2, 3, 4)
          AND p_official_status = orders.reconcile_last_provider_status
        THEN orders.reconcile_query_transaction_id
        ELSE NULL
      END,
      reconcile_query_paid_amount_fen = CASE
        WHEN p_official_status IN (2, 3, 4)
          AND p_official_status = orders.reconcile_last_provider_status
        THEN orders.reconcile_query_paid_amount_fen
        ELSE NULL
      END,
      reconcile_query_paid_at = CASE
        WHEN p_official_status IN (2, 3, 4)
          AND p_official_status = orders.reconcile_last_provider_status
        THEN orders.reconcile_query_paid_at
        ELSE NULL
      END,
      reconcile_claim_token = NULL,
      reconcile_claim_expires_at = NULL
  WHERE orders.id = p_order_id
    AND orders.reconcile_claim_token = p_claim_token
    AND orders.reconcile_claim_expires_at > clock_timestamp();
  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'BRANDING_VIRTUAL_RECONCILIATION_CLAIM_INVALID';
  END IF;
  RETURN true;
END;
$$;

CREATE FUNCTION public.branding_close_unpaid_virtual_payment_reconciliation(
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
  v_now timestamptz;
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
  FOR UPDATE;
  v_now := clock_timestamp();
  IF NOT FOUND
     OR v_order.reconcile_claim_token IS DISTINCT FROM p_claim_token
     OR v_order.reconcile_claim_expires_at IS NULL
     OR v_order.reconcile_claim_expires_at <= v_now
  THEN
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
      reconcile_query_provider_order_no = NULL,
      reconcile_query_transaction_id = NULL,
      reconcile_query_paid_amount_fen = NULL,
      reconcile_query_paid_at = NULL,
      reconcile_claim_token = NULL,
      reconcile_claim_expires_at = NULL
  WHERE orders.id = p_order_id
    AND orders.reconcile_claim_token = p_claim_token
    AND orders.reconcile_claim_expires_at > clock_timestamp();
  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'BRANDING_VIRTUAL_RECONCILIATION_CLAIM_INVALID';
  END IF;
  RETURN true;
END;
$$;

CREATE FUNCTION public.branding_prepare_successful_query_reconciliation(
  p_order_id uuid,
  p_claim_token uuid,
  p_official_status integer,
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
  p_attach text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_order public.tenant_virtual_addon_orders%ROWTYPE;
  v_now timestamptz;
  v_has_query_audit boolean;
BEGIN
  IF p_order_id IS NULL OR p_claim_token IS NULL
     OR p_official_status IS NULL OR p_official_status NOT IN (2, 3, 4)
     OR p_environment IS NULL
     OR p_openid IS NULL OR btrim(p_openid) = ''
     OR char_length(p_openid) > 128
     OR p_out_trade_no IS NULL OR btrim(p_out_trade_no) = ''
     OR char_length(p_out_trade_no) > 32
     OR p_provider_product_id IS NULL
     OR btrim(p_provider_product_id) = ''
     OR char_length(p_provider_product_id) > 128
     OR p_quantity IS NULL
     OR (p_currency IS NOT NULL AND p_currency <> 'CNY')
     OR p_orig_price_fen IS NULL OR p_actual_price_fen IS NULL
     OR p_provider_order_no IS NULL OR btrim(p_provider_order_no) = ''
     OR char_length(p_provider_order_no) > 128
     OR p_transaction_id IS NULL OR btrim(p_transaction_id) = ''
     OR char_length(p_transaction_id) > 128
     OR p_paid_at IS NULL
     OR p_attach IS NULL OR btrim(p_attach) = ''
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'BRANDING_VIRTUAL_RECONCILIATION_INPUT_INVALID';
  END IF;

  SELECT orders.* INTO v_order
  FROM public.tenant_virtual_addon_orders AS orders
  WHERE orders.id = p_order_id
  FOR UPDATE;
  v_now := clock_timestamp();
  IF NOT FOUND
     OR v_order.reconcile_claim_token IS DISTINCT FROM p_claim_token
     OR v_order.reconcile_claim_expires_at IS NULL
     OR v_order.reconcile_claim_expires_at <= v_now
  THEN
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
  IF v_order.environment IS DISTINCT FROM p_environment
     OR v_order.payer_openid IS DISTINCT FROM p_openid
     OR v_order.out_trade_no IS DISTINCT FROM p_out_trade_no
     OR v_order.provider_product_id IS DISTINCT FROM p_provider_product_id
     OR p_quantity <> 1
     OR p_orig_price_fen <> v_order.amount_fen
     OR p_actual_price_fen <> v_order.amount_fen
     OR p_attach IS DISTINCT FROM v_order.id::text
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'BRANDING_VIRTUAL_RECONCILIATION_FACTS_MISMATCH';
  END IF;

  v_has_query_audit :=
    v_order.reconcile_query_provider_order_no IS NOT NULL
    OR v_order.reconcile_query_transaction_id IS NOT NULL
    OR v_order.reconcile_query_paid_amount_fen IS NOT NULL
    OR v_order.reconcile_query_paid_at IS NOT NULL
    OR v_order.reconcile_last_provider_status IN (2, 3, 4);
  IF v_has_query_audit THEN
    IF v_order.reconcile_last_provider_status IS DISTINCT FROM p_official_status
       OR v_order.reconcile_query_provider_order_no
         IS DISTINCT FROM p_provider_order_no
       OR v_order.reconcile_query_transaction_id
         IS DISTINCT FROM p_transaction_id
       OR v_order.reconcile_query_paid_amount_fen
         IS DISTINCT FROM p_actual_price_fen
       OR v_order.reconcile_query_paid_at IS DISTINCT FROM p_paid_at
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'BRANDING_VIRTUAL_RECONCILIATION_FACTS_MISMATCH';
    END IF;
  END IF;

  UPDATE public.tenant_virtual_addon_orders AS orders
  SET reconcile_last_checked_at = v_now,
      reconcile_last_provider_status = p_official_status,
      reconcile_last_error_code = NULL,
      reconcile_last_error = NULL,
      reconcile_query_provider_order_no = p_provider_order_no,
      reconcile_query_transaction_id = p_transaction_id,
      reconcile_query_paid_amount_fen = p_actual_price_fen,
      reconcile_query_paid_at = p_paid_at,
      reconcile_next_at = COALESCE(orders.reconcile_next_at, v_now)
  WHERE orders.id = p_order_id
    AND orders.reconcile_claim_token = p_claim_token
    AND orders.reconcile_claim_expires_at > clock_timestamp();
  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'BRANDING_VIRTUAL_RECONCILIATION_CLAIM_INVALID';
  END IF;
  RETURN true;
END;
$$;

CREATE FUNCTION public.branding_finalize_virtual_payment_reconciliation(
  p_order_id uuid,
  p_claim_token uuid,
  p_official_status integer,
  p_provider_order_no text,
  p_transaction_id text,
  p_paid_amount_fen integer,
  p_paid_at timestamptz,
  p_delivery_attempt_key uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_order public.tenant_virtual_addon_orders%ROWTYPE;
  v_now timestamptz;
BEGIN
  IF p_order_id IS NULL OR p_claim_token IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'BRANDING_VIRTUAL_RECONCILIATION_INPUT_INVALID';
  END IF;
  IF p_official_status IS NOT NULL
     AND p_official_status NOT IN (2, 3, 4)
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'BRANDING_VIRTUAL_RECONCILIATION_OFFICIAL_STATUS_INVALID';
  END IF;

  SELECT orders.* INTO v_order
  FROM public.tenant_virtual_addon_orders AS orders
  WHERE orders.id = p_order_id
  FOR UPDATE;
  v_now := clock_timestamp();
  IF NOT FOUND
     OR v_order.reconcile_claim_token IS DISTINCT FROM p_claim_token
     OR v_order.reconcile_claim_expires_at IS NULL
     OR v_order.reconcile_claim_expires_at <= v_now
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'BRANDING_VIRTUAL_RECONCILIATION_CLAIM_INVALID';
  END IF;
  IF v_order.payment_status <> 'succeeded'
     OR v_order.fulfillment_status <> 'granted'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'BRANDING_VIRTUAL_RECONCILIATION_STATE_INVALID';
  END IF;

  IF p_official_status IS NULL THEN
    IF p_provider_order_no IS NOT NULL
       OR p_transaction_id IS NOT NULL
       OR p_paid_amount_fen IS NOT NULL
       OR p_paid_at IS NOT NULL
       OR p_delivery_attempt_key IS NOT NULL
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'BRANDING_VIRTUAL_RECONCILIATION_INPUT_INVALID';
    END IF;
    IF v_order.reconcile_last_provider_status IS NOT NULL
       OR v_order.reconcile_query_provider_order_no IS NOT NULL
       OR v_order.reconcile_query_transaction_id IS NOT NULL
       OR v_order.reconcile_query_paid_amount_fen IS NOT NULL
       OR v_order.reconcile_query_paid_at IS NOT NULL
       OR v_order.provider_delivery_status <> 'not_required'
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'BRANDING_VIRTUAL_RECONCILIATION_STATE_INVALID';
    END IF;
    UPDATE public.tenant_virtual_addon_orders AS orders
    SET reconcile_next_at = NULL,
        reconcile_last_checked_at = v_now,
        reconcile_last_error_code = NULL,
        reconcile_last_error = NULL,
        reconcile_claim_token = NULL,
        reconcile_claim_expires_at = NULL
    WHERE orders.id = p_order_id
      AND orders.reconcile_claim_token = p_claim_token
      AND orders.reconcile_claim_expires_at > clock_timestamp();
  ELSE
    IF p_provider_order_no IS NULL OR btrim(p_provider_order_no) = ''
       OR char_length(p_provider_order_no) > 128
       OR p_transaction_id IS NULL OR btrim(p_transaction_id) = ''
       OR char_length(p_transaction_id) > 128
       OR p_paid_amount_fen IS NULL OR p_paid_amount_fen <= 0
       OR p_paid_at IS NULL
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'BRANDING_VIRTUAL_RECONCILIATION_INPUT_INVALID';
    END IF;
    IF (p_official_status = 2 AND p_delivery_attempt_key IS NULL)
       OR (p_official_status IN (3, 4) AND p_delivery_attempt_key IS NOT NULL)
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'BRANDING_VIRTUAL_DELIVERY_REQUEST_INVALID';
    END IF;
    IF v_order.reconcile_last_provider_status
         IS DISTINCT FROM p_official_status
       OR v_order.reconcile_query_provider_order_no
         IS DISTINCT FROM p_provider_order_no
       OR v_order.reconcile_query_transaction_id
         IS DISTINCT FROM p_transaction_id
       OR v_order.reconcile_query_paid_amount_fen
         IS DISTINCT FROM p_paid_amount_fen
       OR v_order.reconcile_query_paid_at IS DISTINCT FROM p_paid_at
       OR v_order.provider_order_no IS DISTINCT FROM p_provider_order_no
       OR v_order.transaction_id IS DISTINCT FROM p_transaction_id
       OR v_order.paid_amount_fen IS DISTINCT FROM p_paid_amount_fen
       OR v_order.paid_at IS DISTINCT FROM p_paid_at
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'BRANDING_VIRTUAL_RECONCILIATION_FACTS_MISMATCH';
    END IF;

    IF p_official_status = 2 THEN
      UPDATE public.tenant_virtual_addon_orders AS orders
      SET provider_delivery_status = 'pending',
          provider_delivery_attempt_count =
            orders.provider_delivery_attempt_count + 1,
          provider_delivery_attempt_key = p_delivery_attempt_key,
          provider_delivery_request_id = NULL,
          provider_delivery_provided_at = NULL,
          provider_delivery_last_error_code = NULL,
          provider_delivery_last_error = NULL,
          reconcile_next_at = v_now,
          reconcile_last_checked_at = v_now,
          reconcile_last_error_code = NULL,
          reconcile_last_error = NULL
      WHERE orders.id = p_order_id
        AND orders.reconcile_claim_token = p_claim_token
        AND orders.reconcile_claim_expires_at > clock_timestamp();
    ELSE
      UPDATE public.tenant_virtual_addon_orders AS orders
      SET provider_delivery_status = 'succeeded',
          provider_delivery_attempt_key = p_delivery_attempt_key,
          provider_delivery_request_id = NULL,
          provider_delivery_provided_at = v_now,
          provider_delivery_last_error_code = NULL,
          provider_delivery_last_error = NULL,
          reconcile_next_at = NULL,
          reconcile_last_checked_at = v_now,
          reconcile_last_error_code = NULL,
          reconcile_last_error = NULL,
          reconcile_claim_token = NULL,
          reconcile_claim_expires_at = NULL
      WHERE orders.id = p_order_id
        AND orders.reconcile_claim_token = p_claim_token
        AND orders.reconcile_claim_expires_at > clock_timestamp();
    END IF;
  END IF;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'BRANDING_VIRTUAL_RECONCILIATION_CLAIM_INVALID';
  END IF;
  RETURN true;
END;
$$;

CREATE FUNCTION public.branding_mark_virtual_payment_delivery(
  p_order_id uuid,
  p_claim_token uuid,
  p_delivery_status text,
  p_attempt_key uuid,
  p_provider_request_id text,
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
  v_now timestamptz;
BEGIN
  IF p_order_id IS NULL OR p_claim_token IS NULL OR p_attempt_key IS NULL
     OR p_delivery_status IS NULL
     OR p_delivery_status NOT IN ('succeeded', 'failed')
     OR (
       p_provider_request_id IS NOT NULL
       AND (
         btrim(p_provider_request_id) = ''
         OR char_length(p_provider_request_id) > 128
       )
     )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'BRANDING_VIRTUAL_DELIVERY_REQUEST_INVALID';
  END IF;
  IF p_delivery_status = 'failed'
     AND (
       nullif(btrim(p_error_code), '') IS NULL
       OR nullif(btrim(p_error_summary), '') IS NULL
     )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'BRANDING_VIRTUAL_DELIVERY_REQUEST_INVALID';
  END IF;

  SELECT orders.* INTO v_order
  FROM public.tenant_virtual_addon_orders AS orders
  WHERE orders.id = p_order_id
  FOR UPDATE;
  v_now := clock_timestamp();
  IF NOT FOUND
     OR v_order.reconcile_claim_token IS DISTINCT FROM p_claim_token
     OR v_order.reconcile_claim_expires_at IS NULL
     OR v_order.reconcile_claim_expires_at <= v_now
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'BRANDING_VIRTUAL_RECONCILIATION_CLAIM_INVALID';
  END IF;
  IF v_order.payment_status <> 'succeeded'
     OR v_order.fulfillment_status <> 'granted'
     OR v_order.provider_delivery_status <> 'pending'
     OR v_order.provider_delivery_attempt_key IS DISTINCT FROM p_attempt_key
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'BRANDING_VIRTUAL_DELIVERY_STATE_INVALID';
  END IF;

  IF p_delivery_status = 'succeeded' THEN
    UPDATE public.tenant_virtual_addon_orders AS orders
    SET provider_delivery_status = 'succeeded',
        provider_delivery_request_id = left(
          nullif(btrim(p_provider_request_id), ''),
          128
        ),
        provider_delivery_provided_at = v_now,
        provider_delivery_last_error_code = NULL,
        provider_delivery_last_error = NULL,
        reconcile_next_at = NULL,
        reconcile_last_checked_at = v_now,
        reconcile_last_error_code = NULL,
        reconcile_last_error = NULL,
        reconcile_claim_token = NULL,
        reconcile_claim_expires_at = NULL
    WHERE orders.id = p_order_id
      AND orders.reconcile_claim_token = p_claim_token
      AND orders.reconcile_claim_expires_at > clock_timestamp();
  ELSE
    UPDATE public.tenant_virtual_addon_orders AS orders
    SET provider_delivery_status = 'failed',
        provider_delivery_request_id = left(
          nullif(btrim(p_provider_request_id), ''),
          128
        ),
        provider_delivery_provided_at = NULL,
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
      AND orders.reconcile_claim_token = p_claim_token
      AND orders.reconcile_claim_expires_at > clock_timestamp();
  END IF;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'BRANDING_VIRTUAL_RECONCILIATION_CLAIM_INVALID';
  END IF;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.schedule_tenant_virtual_addon_order_reconciliation()
FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.branding_claim_virtual_payment_reconciliation_batch(
  integer, integer
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.branding_claim_virtual_payment_reconciliation_batch(
  integer, integer
) TO service_role;

REVOKE ALL ON FUNCTION public.branding_reschedule_virtual_payment_reconciliation(
  uuid, uuid, timestamptz, integer, text, text
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.branding_reschedule_virtual_payment_reconciliation(
  uuid, uuid, timestamptz, integer, text, text
) TO service_role;

REVOKE ALL ON FUNCTION public.branding_close_unpaid_virtual_payment_reconciliation(
  uuid, uuid, integer
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.branding_close_unpaid_virtual_payment_reconciliation(
  uuid, uuid, integer
) TO service_role;

REVOKE ALL ON FUNCTION public.branding_prepare_successful_query_reconciliation(
  uuid, uuid, integer, text, text, text, text, integer, text, integer,
  integer, text, text, timestamptz, text
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.branding_prepare_successful_query_reconciliation(
  uuid, uuid, integer, text, text, text, text, integer, text, integer,
  integer, text, text, timestamptz, text
) TO service_role;

REVOKE ALL ON FUNCTION public.branding_finalize_virtual_payment_reconciliation(
  uuid, uuid, integer, text, text, integer, timestamptz, uuid
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.branding_finalize_virtual_payment_reconciliation(
  uuid, uuid, integer, text, text, integer, timestamptz, uuid
) TO service_role;

REVOKE ALL ON FUNCTION public.branding_mark_virtual_payment_delivery(
  uuid, uuid, text, uuid, text, text, text
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.branding_mark_virtual_payment_delivery(
  uuid, uuid, text, uuid, text, text, text
) TO service_role;

COMMIT;
