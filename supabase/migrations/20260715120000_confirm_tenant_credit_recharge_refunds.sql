-- Confirm WeChat tenant credit recharge refunds from callbacks.
-- This is the only path that moves credits for a successful recharge refund.

CREATE UNIQUE INDEX IF NOT EXISTS tenant_credit_refund_requests_out_refund_no_unique_idx
ON public.tenant_credit_refund_requests(out_refund_no)
WHERE out_refund_no IS NOT NULL;

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
SET search_path = public
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
    WHEN p_metadata IS NULL THEN '{}'::jsonb
    WHEN jsonb_typeof(p_metadata) = 'object' THEN p_metadata
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

  IF v_request.out_refund_no IS NULL OR v_request.out_refund_no <> p_out_refund_no THEN
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
    metadata = coalesce(metadata, '{}'::jsonb) || v_metadata
  WHERE id = v_request.id
  RETURNING * INTO v_request;

  UPDATE public.tenant_credit_orders
  SET
    status = 'refunded',
    refund_status = 'refunded',
    refunded_at = v_refunded_at,
    refund_amount_fen = p_refund_amount_fen,
    latest_notification_id = p_notification_id,
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

COMMENT ON FUNCTION public.billing_confirm_wechat_recharge_refund(
  uuid,
  text,
  text,
  integer,
  timestamptz,
  uuid,
  jsonb
) IS '确认微信支付积分充值退款并幂等写入租户积分反向流水。';
