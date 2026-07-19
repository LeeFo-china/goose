-- Add bounded leases and atomic state transitions for WeChat refund reconciliation.
-- Rollback: stop the refund worker first; revoke and drop the six new RPCs, restore
-- billing_confirm_wechat_recharge_refund from 20260715120000, and drop the due index.
-- Drop constraints and columns only after proving there are no active reconciliation leases.
-- Never automatically reverse completed refunds or tenant credit ledger entries.
-- Do not automatically revert the historical due-time backfill or safe order-mirror repair;
-- inspect each remaining active refund after the worker has stopped.

BEGIN;

ALTER TABLE public.tenant_credit_refund_requests
  ADD COLUMN IF NOT EXISTS reconcile_next_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS reconcile_attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reconcile_claim_token uuid NULL,
  ADD COLUMN IF NOT EXISTS reconcile_claim_expires_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS reconcile_last_error text NULL,
  ADD COLUMN IF NOT EXISTS reconcile_last_checked_at timestamptz NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conname = 'tenant_credit_refund_reconcile_attempt_count_check'
      AND conrelid = 'public.tenant_credit_refund_requests'::regclass
  ) THEN
    ALTER TABLE public.tenant_credit_refund_requests
      ADD CONSTRAINT tenant_credit_refund_reconcile_attempt_count_check
      CHECK (reconcile_attempt_count >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conname = 'tenant_credit_refund_reconcile_lease_check'
      AND conrelid = 'public.tenant_credit_refund_requests'::regclass
  ) THEN
    ALTER TABLE public.tenant_credit_refund_requests
      ADD CONSTRAINT tenant_credit_refund_reconcile_lease_check
      CHECK (
        (
          reconcile_claim_token IS NULL
          AND reconcile_claim_expires_at IS NULL
        ) OR (
          reconcile_claim_token IS NOT NULL
          AND reconcile_claim_expires_at IS NOT NULL
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conname = 'tenant_credit_refund_reconcile_last_error_check'
      AND conrelid = 'public.tenant_credit_refund_requests'::regclass
  ) THEN
    ALTER TABLE public.tenant_credit_refund_requests
      ADD CONSTRAINT tenant_credit_refund_reconcile_last_error_check
      CHECK (reconcile_last_error IS NULL OR char_length(reconcile_last_error) <= 200);
  END IF;
END;
$$;

UPDATE public.tenant_credit_refund_requests AS request
SET reconcile_next_at = pg_catalog.now()
WHERE request.status = 'refunding'
  AND request.reconcile_next_at IS NULL;

UPDATE public.tenant_credit_orders AS credit_order
SET refund_status = 'refunding'
FROM public.tenant_credit_refund_requests AS request
WHERE request.order_id = credit_order.id
  AND request.tenant_id = credit_order.tenant_id
  AND request.status = 'refunding'
  AND (
    credit_order.refund_status IS NULL
    OR credit_order.refund_status = 'approved'
  );

CREATE INDEX IF NOT EXISTS tenant_credit_refund_reconcile_due_idx
ON public.tenant_credit_refund_requests(reconcile_next_at, id)
WHERE status = 'refunding' AND reconcile_next_at IS NOT NULL;

CREATE OR REPLACE FUNCTION public.billing_begin_wechat_recharge_refund(
  p_refund_request_id uuid,
  p_out_refund_no text,
  p_now timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_request public.tenant_credit_refund_requests%ROWTYPE;
  v_order public.tenant_credit_orders%ROWTYPE;
BEGIN
  IF p_refund_request_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'BILLING_RECHARGE_REFUND_REQUEST_ID_REQUIRED';
  END IF;

  IF p_out_refund_no IS NULL OR btrim(p_out_refund_no) = '' THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'BILLING_RECHARGE_REFUND_OUT_REFUND_NO_REQUIRED';
  END IF;

  IF p_now IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'BILLING_RECHARGE_REFUND_NOW_REQUIRED';
  END IF;

  SELECT *
  INTO v_request
  FROM public.tenant_credit_refund_requests
  WHERE id = p_refund_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'BILLING_RECHARGE_REFUND_REQUEST_NOT_FOUND';
  END IF;

  IF v_request.status NOT IN ('approved', 'failed') THEN
    RETURN NULL;
  END IF;

  IF v_request.out_refund_no IS NOT NULL
    AND v_request.out_refund_no <> p_out_refund_no
  THEN
    RAISE EXCEPTION 'BILLING_RECHARGE_REFUND_OUT_REFUND_NO_MISMATCH';
  END IF;

  SELECT *
  INTO v_order
  FROM public.tenant_credit_orders
  WHERE id = v_request.order_id
    AND tenant_id = v_request.tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'BILLING_RECHARGE_ORDER_NOT_FOUND';
  END IF;

  IF v_order.channel <> 'wechat_pay' THEN
    RAISE EXCEPTION 'BILLING_RECHARGE_ORDER_CHANNEL_INVALID';
  END IF;

  IF v_order.status <> 'paid' THEN
    RAISE EXCEPTION 'BILLING_RECHARGE_ORDER_NOT_PAID';
  END IF;

  IF v_order.transaction_id IS NULL OR btrim(v_order.transaction_id) = '' THEN
    RAISE EXCEPTION 'BILLING_RECHARGE_REFUND_TRANSACTION_ID_REQUIRED';
  END IF;

  IF v_order.out_trade_no IS NULL OR btrim(v_order.out_trade_no) = '' THEN
    RAISE EXCEPTION 'BILLING_RECHARGE_REFUND_OUT_TRADE_NO_REQUIRED';
  END IF;

  UPDATE public.tenant_credit_refund_requests
  SET
    status = 'refunding',
    out_refund_no = coalesce(out_refund_no, p_out_refund_no),
    failure_message = NULL,
    reconcile_next_at = p_now + interval '1 minute',
    reconcile_claim_token = NULL,
    reconcile_claim_expires_at = NULL,
    reconcile_last_error = NULL
  WHERE id = v_request.id
    AND status IN ('approved', 'failed')
  RETURNING * INTO v_request;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  UPDATE public.tenant_credit_orders
  SET refund_status = 'refunding'
  WHERE id = v_order.id
    AND tenant_id = v_order.tenant_id;

  RETURN to_jsonb(v_request);
END;
$$;

CREATE OR REPLACE FUNCTION public.billing_claim_wechat_recharge_refunds(
  p_limit integer,
  p_lease_seconds integer,
  p_claim_token uuid,
  p_now timestamptz
)
RETURNS TABLE(
  id uuid,
  tenant_id uuid,
  order_id uuid,
  reason text,
  requested_amount_fen integer,
  out_refund_no text,
  wechat_refund_id text,
  refund_amount_fen integer,
  reconcile_attempt_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'BILLING_RECHARGE_REFUND_RECONCILE_LIMIT_INVALID';
  END IF;

  IF p_lease_seconds IS NULL OR p_lease_seconds NOT BETWEEN 30 AND 900 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'BILLING_RECHARGE_REFUND_RECONCILE_LEASE_INVALID';
  END IF;

  IF p_claim_token IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'BILLING_RECHARGE_REFUND_RECONCILE_TOKEN_REQUIRED';
  END IF;

  IF p_now IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'BILLING_RECHARGE_REFUND_RECONCILE_NOW_REQUIRED';
  END IF;

  RETURN QUERY
  WITH claimed AS (
    SELECT request.id
    FROM public.tenant_credit_refund_requests AS request
    WHERE request.status = 'refunding'
      AND request.reconcile_next_at IS NOT NULL
      AND (
        (
          request.reconcile_next_at <= p_now
          AND request.reconcile_claim_token IS NULL
        ) OR (
          request.reconcile_claim_token IS NOT NULL
          AND request.reconcile_claim_expires_at <= p_now
        )
      )
    ORDER BY request.reconcile_next_at, request.id
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.tenant_credit_refund_requests AS request
  SET
    reconcile_attempt_count = request.reconcile_attempt_count + 1,
    reconcile_claim_token = p_claim_token,
    reconcile_claim_expires_at = p_now + make_interval(secs => p_lease_seconds)
  FROM claimed
  WHERE request.id = claimed.id
  RETURNING
    request.id,
    request.tenant_id,
    request.order_id,
    request.reason,
    request.requested_amount_fen,
    request.out_refund_no,
    request.wechat_refund_id,
    request.refund_amount_fen,
    request.reconcile_attempt_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.billing_reschedule_wechat_recharge_refund(
  p_refund_request_id uuid,
  p_claim_token uuid,
  p_reconcile_next_at timestamptz,
  p_checked_at timestamptz,
  p_last_error text,
  p_metadata jsonb,
  p_wechat_refund_id text,
  p_refund_amount_fen integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_metadata jsonb;
  v_updated integer;
BEGIN
  IF p_refund_request_id IS NULL OR p_claim_token IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'BILLING_RECHARGE_REFUND_RECONCILE_CLAIM_REQUIRED';
  END IF;

  IF p_reconcile_next_at IS NULL OR p_checked_at IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'BILLING_RECHARGE_REFUND_RECONCILE_SCHEDULE_INVALID';
  END IF;

  IF p_refund_amount_fen IS NOT NULL AND p_refund_amount_fen <= 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'BILLING_RECHARGE_REFUND_AMOUNT_INVALID';
  END IF;

  IF p_wechat_refund_id IS NOT NULL
    AND btrim(p_wechat_refund_id) = ''
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'BILLING_RECHARGE_REFUND_WECHAT_REFUND_ID_INVALID';
  END IF;

  v_metadata := CASE
    WHEN p_metadata IS NOT NULL AND jsonb_typeof(p_metadata) = 'object'
      THEN p_metadata
    ELSE '{}'::jsonb
  END;

  UPDATE public.tenant_credit_refund_requests AS request
  SET
    reconcile_next_at = p_reconcile_next_at,
    reconcile_claim_token = NULL,
    reconcile_claim_expires_at = NULL,
    reconcile_last_error = p_last_error,
    reconcile_last_checked_at = p_checked_at,
    wechat_refund_id = coalesce(p_wechat_refund_id, wechat_refund_id),
    refund_amount_fen = coalesce(p_refund_amount_fen, refund_amount_fen),
    metadata = coalesce(metadata, '{}'::jsonb) || v_metadata
  WHERE request.id = p_refund_request_id
    AND request.status = 'refunding'
    AND request.reconcile_claim_token = p_claim_token;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated = 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.billing_close_wechat_recharge_refund(
  p_refund_request_id uuid,
  p_claim_token uuid,
  p_checked_at timestamptz,
  p_metadata jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_request public.tenant_credit_refund_requests%ROWTYPE;
  v_order public.tenant_credit_orders%ROWTYPE;
  v_metadata jsonb;
BEGIN
  IF p_refund_request_id IS NULL OR p_claim_token IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'BILLING_RECHARGE_REFUND_RECONCILE_CLAIM_REQUIRED';
  END IF;

  IF p_checked_at IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'BILLING_RECHARGE_REFUND_RECONCILE_CHECKED_AT_REQUIRED';
  END IF;

  v_metadata := CASE
    WHEN p_metadata IS NOT NULL AND jsonb_typeof(p_metadata) = 'object'
      THEN p_metadata
    ELSE '{}'::jsonb
  END;

  SELECT request.*
  INTO v_request
  FROM public.tenant_credit_refund_requests AS request
  WHERE request.id = p_refund_request_id
    AND request.status = 'refunding'
    AND request.reconcile_claim_token = p_claim_token
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  SELECT *
  INTO v_order
  FROM public.tenant_credit_orders
  WHERE id = v_request.order_id
    AND tenant_id = v_request.tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'BILLING_RECHARGE_ORDER_NOT_FOUND';
  END IF;

  UPDATE public.tenant_credit_refund_requests AS request
  SET
    status = 'failed',
    failure_message = 'WECHAT_REFUND_CLOSED',
    reconcile_next_at = NULL,
    reconcile_claim_token = NULL,
    reconcile_claim_expires_at = NULL,
    reconcile_last_error = 'WECHAT_REFUND_CLOSED',
    reconcile_last_checked_at = p_checked_at,
    metadata = coalesce(metadata, '{}'::jsonb) || v_metadata
  WHERE request.id = p_refund_request_id
    AND request.status = 'refunding'
    AND request.reconcile_claim_token = p_claim_token;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  UPDATE public.tenant_credit_orders
  SET refund_status = 'failed'
  WHERE id = v_order.id
    AND tenant_id = v_order.tenant_id;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.billing_apply_wechat_recharge_refund_callback_state(
  p_refund_request_id uuid,
  p_out_refund_no text,
  p_status text,
  p_checked_at timestamptz,
  p_metadata jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_request public.tenant_credit_refund_requests%ROWTYPE;
  v_order public.tenant_credit_orders%ROWTYPE;
  v_metadata jsonb;
BEGIN
  IF p_refund_request_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'BILLING_RECHARGE_REFUND_REQUEST_ID_REQUIRED';
  END IF;

  IF p_out_refund_no IS NULL OR btrim(p_out_refund_no) = '' THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'BILLING_RECHARGE_REFUND_OUT_REFUND_NO_REQUIRED';
  END IF;

  IF p_status IS NULL OR p_status NOT IN ('CLOSED', 'ABNORMAL') THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'BILLING_RECHARGE_REFUND_CALLBACK_STATUS_INVALID';
  END IF;

  IF p_checked_at IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'BILLING_RECHARGE_REFUND_RECONCILE_CHECKED_AT_REQUIRED';
  END IF;

  v_metadata := CASE
    WHEN p_metadata IS NOT NULL AND jsonb_typeof(p_metadata) = 'object'
      THEN p_metadata
    ELSE '{}'::jsonb
  END;

  SELECT *
  INTO v_request
  FROM public.tenant_credit_refund_requests
  WHERE id = p_refund_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'BILLING_RECHARGE_REFUND_REQUEST_NOT_FOUND';
  END IF;

  IF v_request.out_refund_no IS NULL
    OR v_request.out_refund_no <> p_out_refund_no
  THEN
    RAISE EXCEPTION 'BILLING_RECHARGE_REFUND_OUT_REFUND_NO_MISMATCH';
  END IF;

  SELECT *
  INTO v_order
  FROM public.tenant_credit_orders
  WHERE id = v_request.order_id
    AND tenant_id = v_request.tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'BILLING_RECHARGE_ORDER_NOT_FOUND';
  END IF;

  IF v_request.status <> 'refunding' THEN
    RETURN false;
  END IF;

  IF p_status = 'CLOSED' THEN
    UPDATE public.tenant_credit_refund_requests AS request
    SET
      status = 'failed',
      failure_message = 'WECHAT_REFUND_CLOSED',
      reconcile_next_at = NULL,
      reconcile_claim_token = NULL,
      reconcile_claim_expires_at = NULL,
      reconcile_last_error = 'WECHAT_REFUND_CLOSED',
      reconcile_last_checked_at = p_checked_at,
      metadata = coalesce(metadata, '{}'::jsonb) || v_metadata
    WHERE request.id = v_request.id
      AND request.status = 'refunding';

    UPDATE public.tenant_credit_orders
    SET refund_status = 'failed'
    WHERE id = v_order.id
      AND tenant_id = v_order.tenant_id;
  ELSE
    UPDATE public.tenant_credit_refund_requests AS request
    SET
      status = 'refunding',
      failure_message = NULL,
      reconcile_next_at = p_checked_at + interval '30 minutes',
      reconcile_claim_token = NULL,
      reconcile_claim_expires_at = NULL,
      reconcile_last_error = 'WECHAT_REFUND_ABNORMAL',
      reconcile_last_checked_at = p_checked_at,
      metadata = coalesce(metadata, '{}'::jsonb) || v_metadata
    WHERE request.id = v_request.id
      AND request.status = 'refunding';

    UPDATE public.tenant_credit_orders
    SET refund_status = 'refunding'
    WHERE id = v_order.id
      AND tenant_id = v_order.tenant_id;
  END IF;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.billing_confirm_wechat_recharge_refund(
  p_refund_request_id uuid,
  p_out_refund_no text,
  p_wechat_refund_id text,
  p_refund_amount_fen integer,
  p_refunded_at timestamptz,
  p_notification_id uuid,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_request public.tenant_credit_refund_requests%ROWTYPE;
  v_order public.tenant_credit_orders%ROWTYPE;
  v_account public.tenant_credit_accounts%ROWTYPE;
  v_account_balance public.tenant_credit_account_balances%ROWTYPE;
  v_ledger public.tenant_credit_ledger%ROWTYPE;
  v_refund_credits bigint;
  v_refunded_at timestamptz;
  v_metadata jsonb;
BEGIN
  IF p_out_refund_no IS NULL OR btrim(p_out_refund_no) = '' THEN
    RAISE EXCEPTION 'BILLING_RECHARGE_REFUND_OUT_REFUND_NO_REQUIRED';
  END IF;

  IF p_refund_amount_fen IS NULL OR p_refund_amount_fen <= 0 THEN
    RAISE EXCEPTION 'BILLING_RECHARGE_REFUND_AMOUNT_INVALID';
  END IF;

  v_metadata := CASE
    WHEN p_metadata IS NOT NULL AND jsonb_typeof(p_metadata) = 'object'
      THEN p_metadata
    ELSE '{}'::jsonb
  END;
  v_refunded_at := coalesce(p_refunded_at, now());

  SELECT *
  INTO v_request
  FROM public.tenant_credit_refund_requests
  WHERE id = p_refund_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'BILLING_RECHARGE_REFUND_REQUEST_NOT_FOUND';
  END IF;

  IF v_request.out_refund_no IS NULL
    OR v_request.out_refund_no <> p_out_refund_no
  THEN
    RAISE EXCEPTION 'BILLING_RECHARGE_REFUND_OUT_REFUND_NO_MISMATCH';
  END IF;

  SELECT *
  INTO v_order
  FROM public.tenant_credit_orders
  WHERE id = v_request.order_id
    AND tenant_id = v_request.tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'BILLING_RECHARGE_ORDER_NOT_FOUND';
  END IF;

  IF v_order.channel <> 'wechat_pay' THEN
    RAISE EXCEPTION 'BILLING_RECHARGE_ORDER_CHANNEL_INVALID';
  END IF;

  IF v_request.status = 'refunded' THEN
    SELECT *
    INTO v_account_balance
    FROM public.tenant_credit_account_balances
    WHERE tenant_id = v_request.tenant_id;

    SELECT *
    INTO v_ledger
    FROM public.tenant_credit_ledger
    WHERE tenant_id = v_request.tenant_id
      AND source_type = 'tenant_credit_refund_request'
      AND source_id = v_request.id::text
      AND event_type = 'wechat_recharge_refund'
    LIMIT 1;

    RETURN jsonb_build_object(
      'request', to_jsonb(v_request),
      'order', to_jsonb(v_order),
      'account', to_jsonb(v_account_balance),
      'ledger', to_jsonb(v_ledger),
      'idempotent', true
    );
  END IF;

  IF v_request.status <> 'refunding' THEN
    RAISE EXCEPTION 'BILLING_RECHARGE_REFUND_REQUEST_STATUS_INVALID';
  END IF;

  IF v_order.status <> 'paid' THEN
    RAISE EXCEPTION 'BILLING_RECHARGE_ORDER_NOT_PAID';
  END IF;

  IF p_refund_amount_fen <> v_request.requested_amount_fen THEN
    RAISE EXCEPTION 'BILLING_RECHARGE_REFUND_AMOUNT_MISMATCH';
  END IF;

  v_refund_credits := v_order.credits + coalesce(v_order.bonus_credits, 0);

  INSERT INTO public.tenant_credit_accounts (tenant_id, last_activity_at)
  VALUES (v_order.tenant_id, now())
  ON CONFLICT (tenant_id) DO NOTHING;

  SELECT *
  INTO v_account
  FROM public.tenant_credit_accounts
  WHERE tenant_id = v_order.tenant_id
  FOR UPDATE;

  SELECT *
  INTO v_account_balance
  FROM public.tenant_credit_account_balances
  WHERE id = v_account.id;

  IF v_account_balance.available_credits < v_refund_credits THEN
    RAISE EXCEPTION 'BILLING_RECHARGE_REFUND_CREDITS_CONSUMED';
  END IF;

  UPDATE public.tenant_credit_accounts
  SET
    balance_credits = balance_credits - v_refund_credits,
    last_activity_at = now()
  WHERE id = v_account.id
  RETURNING * INTO v_account;

  INSERT INTO public.tenant_credit_ledger (
    tenant_id,
    account_id,
    direction,
    change_credits,
    balance_after,
    frozen_after,
    event_type,
    correlation_id,
    source_type,
    source_id,
    source_no,
    remark,
    operator_user_id
  )
  VALUES (
    v_order.tenant_id,
    v_account.id,
    'out',
    v_refund_credits,
    v_account.balance_credits,
    v_account.frozen_credits,
    'wechat_recharge_refund',
    v_order.id,
    'tenant_credit_refund_request',
    v_request.id::text,
    v_request.request_no,
    '微信支付积分充值退款',
    v_request.reviewed_by_employee_id
  )
  RETURNING * INTO v_ledger;

  UPDATE public.tenant_credit_refund_requests
  SET
    status = 'refunded',
    wechat_refund_id = coalesce(p_wechat_refund_id, wechat_refund_id),
    refund_amount_fen = p_refund_amount_fen,
    refunded_at = v_refunded_at,
    failure_message = NULL,
    reconcile_next_at = NULL,
    reconcile_claim_token = NULL,
    reconcile_claim_expires_at = NULL,
    reconcile_last_error = NULL,
    reconcile_last_checked_at = v_refunded_at,
    metadata = coalesce(metadata, '{}'::jsonb) || v_metadata
  WHERE id = v_request.id
  RETURNING * INTO v_request;

  UPDATE public.tenant_credit_orders
  SET
    status = 'refunded',
    refund_status = 'refunded',
    refunded_at = v_refunded_at,
    refund_amount_fen = p_refund_amount_fen,
    latest_notification_id = coalesce(p_notification_id, latest_notification_id),
    metadata = coalesce(metadata, '{}'::jsonb) || v_metadata
  WHERE id = v_order.id
  RETURNING * INTO v_order;

  SELECT *
  INTO v_account_balance
  FROM public.tenant_credit_account_balances
  WHERE id = v_account.id;

  RETURN jsonb_build_object(
    'request', to_jsonb(v_request),
    'order', to_jsonb(v_order),
    'account', to_jsonb(v_account_balance),
    'ledger', to_jsonb(v_ledger),
    'idempotent', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.billing_confirm_claimed_wechat_recharge_refund(
  p_refund_request_id uuid,
  p_claim_token uuid,
  p_out_refund_no text,
  p_wechat_refund_id text,
  p_refund_amount_fen integer,
  p_refunded_at timestamptz,
  p_metadata jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_request public.tenant_credit_refund_requests%ROWTYPE;
  v_result jsonb;
BEGIN
  IF p_refund_request_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'BILLING_RECHARGE_REFUND_REQUEST_ID_REQUIRED';
  END IF;

  IF p_claim_token IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'BILLING_RECHARGE_REFUND_RECONCILE_TOKEN_REQUIRED';
  END IF;

  SELECT request.*
  INTO v_request
  FROM public.tenant_credit_refund_requests AS request
  WHERE request.id = p_refund_request_id
    AND request.status = 'refunding'
    AND request.reconcile_claim_token = p_claim_token
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT public.billing_confirm_wechat_recharge_refund(
    p_refund_request_id,
    p_out_refund_no,
    p_wechat_refund_id,
    p_refund_amount_fen,
    p_refunded_at,
    NULL::uuid,
    p_metadata
  )
  INTO v_result;

  RETURN v_result;
END;
$$;

COMMENT ON COLUMN public.tenant_credit_refund_requests.reconcile_next_at
IS '微信退款下一次可对账时间；为空表示无需继续调度。';

COMMENT ON COLUMN public.tenant_credit_refund_requests.reconcile_attempt_count
IS '微信退款对账领取次数，仅在成功领取租约时递增。';

COMMENT ON COLUMN public.tenant_credit_refund_requests.reconcile_claim_token
IS '当前退款对账租约令牌，与租约到期时间成对存在。';

COMMENT ON COLUMN public.tenant_credit_refund_requests.reconcile_claim_expires_at
IS '当前退款对账租约到期时间。';

COMMENT ON COLUMN public.tenant_credit_refund_requests.reconcile_last_error
IS '最近一次退款对账的稳定错误码或错误摘要。';

COMMENT ON COLUMN public.tenant_credit_refund_requests.reconcile_last_checked_at
IS '最近一次向微信核对退款状态的时间。';

COMMENT ON FUNCTION public.billing_begin_wechat_recharge_refund(
  uuid,
  text,
  timestamptz
) IS '原子锁定退款申请和充值订单，并开始微信退款执行及对账调度。';

COMMENT ON FUNCTION public.billing_claim_wechat_recharge_refunds(
  integer,
  integer,
  uuid,
  timestamptz
) IS '按到期时间有界领取微信退款对账任务并签发令牌租约。';

COMMENT ON FUNCTION public.billing_reschedule_wechat_recharge_refund(
  uuid,
  uuid,
  timestamptz,
  timestamptz,
  text,
  jsonb,
  text,
  integer
) IS '使用当前租约令牌保存微信退款结果并重新安排对账。';

COMMENT ON FUNCTION public.billing_close_wechat_recharge_refund(
  uuid,
  uuid,
  timestamptz,
  jsonb
) IS '使用当前租约令牌原子关闭微信退款申请及订单镜像状态。';

COMMENT ON FUNCTION public.billing_apply_wechat_recharge_refund_callback_state(
  uuid,
  text,
  text,
  timestamptz,
  jsonb
) IS '原子应用微信退款 CLOSED 或 ABNORMAL 回调状态。';

COMMENT ON FUNCTION public.billing_confirm_wechat_recharge_refund(
  uuid,
  text,
  text,
  integer,
  timestamptz,
  uuid,
  jsonb
) IS '确认微信支付积分充值退款，清理对账租约并幂等写入反向流水。';

COMMENT ON FUNCTION public.billing_confirm_claimed_wechat_recharge_refund(
  uuid,
  uuid,
  text,
  text,
  integer,
  timestamptz,
  jsonb
) IS '仅由当前对账租约持有者确认微信退款成功并复用原子积分反冲逻辑。';

REVOKE ALL ON FUNCTION public.billing_begin_wechat_recharge_refund(uuid, text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.billing_begin_wechat_recharge_refund(uuid, text, timestamptz) TO service_role;

REVOKE ALL ON FUNCTION public.billing_claim_wechat_recharge_refunds(integer, integer, uuid, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.billing_claim_wechat_recharge_refunds(integer, integer, uuid, timestamptz) TO service_role;

REVOKE ALL ON FUNCTION public.billing_reschedule_wechat_recharge_refund(uuid, uuid, timestamptz, timestamptz, text, jsonb, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.billing_reschedule_wechat_recharge_refund(uuid, uuid, timestamptz, timestamptz, text, jsonb, text, integer) TO service_role;

REVOKE ALL ON FUNCTION public.billing_close_wechat_recharge_refund(uuid, uuid, timestamptz, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.billing_close_wechat_recharge_refund(uuid, uuid, timestamptz, jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.billing_apply_wechat_recharge_refund_callback_state(uuid, text, text, timestamptz, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.billing_apply_wechat_recharge_refund_callback_state(uuid, text, text, timestamptz, jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.billing_confirm_wechat_recharge_refund(uuid, text, text, integer, timestamptz, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.billing_confirm_wechat_recharge_refund(uuid, text, text, integer, timestamptz, uuid, jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.billing_confirm_claimed_wechat_recharge_refund(uuid, uuid, text, text, integer, timestamptz, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.billing_confirm_claimed_wechat_recharge_refund(uuid, uuid, text, text, integer, timestamptz, jsonb) TO service_role;

COMMIT;
