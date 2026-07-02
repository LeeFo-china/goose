-- Platform WeChat Pay tenant credit recharge primitives.
-- This migration keeps tenant credit recharge separate from project payment workflow.

ALTER TABLE public.tenant_credit_orders
  ADD COLUMN IF NOT EXISTS payment_config_id uuid NULL REFERENCES public.tenant_payment_configs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS out_trade_no text NULL,
  ADD COLUMN IF NOT EXISTS prepay_id text NULL,
  ADD COLUMN IF NOT EXISTS transaction_id text NULL,
  ADD COLUMN IF NOT EXISTS paid_amount_fen integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS closed_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS latest_notification_id uuid NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tenant_credit_orders_out_trade_no_not_blank'
      AND conrelid = 'public.tenant_credit_orders'::regclass
  ) THEN
    ALTER TABLE public.tenant_credit_orders
      ADD CONSTRAINT tenant_credit_orders_out_trade_no_not_blank
      CHECK (out_trade_no IS NULL OR btrim(out_trade_no) <> '');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tenant_credit_orders_transaction_id_not_blank'
      AND conrelid = 'public.tenant_credit_orders'::regclass
  ) THEN
    ALTER TABLE public.tenant_credit_orders
      ADD CONSTRAINT tenant_credit_orders_transaction_id_not_blank
      CHECK (transaction_id IS NULL OR btrim(transaction_id) <> '');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tenant_credit_orders_paid_amount_fen_check'
      AND conrelid = 'public.tenant_credit_orders'::regclass
  ) THEN
    ALTER TABLE public.tenant_credit_orders
      ADD CONSTRAINT tenant_credit_orders_paid_amount_fen_check
      CHECK (paid_amount_fen >= 0);
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS tenant_credit_orders_out_trade_unique_idx
ON public.tenant_credit_orders(out_trade_no)
WHERE out_trade_no IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS tenant_credit_orders_wechat_transaction_unique_idx
ON public.tenant_credit_orders(transaction_id)
WHERE transaction_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS tenant_credit_orders_wechat_status_created_idx
ON public.tenant_credit_orders(channel, status, created_at DESC)
WHERE channel = 'wechat_pay';

CREATE TABLE IF NOT EXISTS public.tenant_credit_wechat_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  credit_order_id uuid NULL REFERENCES public.tenant_credit_orders(id) ON DELETE SET NULL,
  notify_id text NOT NULL,
  event_type text NOT NULL,
  resource_type text NULL,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  signature_valid boolean NOT NULL DEFAULT false,
  processed boolean NOT NULL DEFAULT false,
  processed_at timestamptz NULL,
  error_message text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_credit_wechat_notifications_notify_id_not_blank
    CHECK (btrim(notify_id) <> ''),
  CONSTRAINT tenant_credit_wechat_notifications_event_type_not_blank
    CHECK (btrim(event_type) <> ''),
  CONSTRAINT tenant_credit_wechat_notifications_raw_payload_object
    CHECK (jsonb_typeof(raw_payload) = 'object')
);

CREATE UNIQUE INDEX IF NOT EXISTS tenant_credit_wechat_notifications_notify_unique_idx
ON public.tenant_credit_wechat_notifications(notify_id);

CREATE INDEX IF NOT EXISTS tenant_credit_wechat_notifications_tenant_created_idx
ON public.tenant_credit_wechat_notifications(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS tenant_credit_wechat_notifications_order_created_idx
ON public.tenant_credit_wechat_notifications(credit_order_id, created_at DESC)
WHERE credit_order_id IS NOT NULL;

DROP TRIGGER IF EXISTS tr_tenant_credit_wechat_notifications_updated_at
ON public.tenant_credit_wechat_notifications;

CREATE TRIGGER tr_tenant_credit_wechat_notifications_updated_at
  BEFORE UPDATE ON public.tenant_credit_wechat_notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.billing_confirm_wechat_recharge(
  p_order_id uuid,
  p_transaction_id text,
  p_paid_amount_fen integer,
  p_paid_at timestamptz,
  p_notification_id uuid,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.tenant_credit_orders%ROWTYPE;
  v_account public.tenant_credit_accounts%ROWTYPE;
  v_account_balance public.tenant_credit_account_balances%ROWTYPE;
  v_ledger public.tenant_credit_ledger%ROWTYPE;
  v_total_credits bigint;
BEGIN
  IF p_transaction_id IS NULL OR btrim(p_transaction_id) = '' THEN
    RAISE EXCEPTION 'BILLING_RECHARGE_TRANSACTION_ID_REQUIRED';
  END IF;

  SELECT *
  INTO v_order
  FROM public.tenant_credit_orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'BILLING_RECHARGE_ORDER_NOT_FOUND';
  END IF;

  IF v_order.channel <> 'wechat_pay' THEN
    RAISE EXCEPTION 'BILLING_RECHARGE_ORDER_CHANNEL_INVALID';
  END IF;

  IF v_order.status = 'paid' THEN
    SELECT *
    INTO v_account_balance
    FROM public.tenant_credit_account_balances
    WHERE tenant_id = v_order.tenant_id;

    SELECT *
    INTO v_ledger
    FROM public.tenant_credit_ledger
    WHERE tenant_id = v_order.tenant_id
      AND source_type = 'tenant_credit_order'
      AND source_id = v_order.id::text
      AND event_type = 'wechat_recharge'
    LIMIT 1;

    RETURN jsonb_build_object(
      'order', to_jsonb(v_order),
      'account', to_jsonb(v_account_balance),
      'ledger', to_jsonb(v_ledger),
      'idempotent', true
    );
  END IF;

  IF v_order.status <> 'pending' THEN
    RAISE EXCEPTION 'BILLING_RECHARGE_ORDER_STATUS_INVALID';
  END IF;

  IF p_paid_amount_fen <> v_order.amount_fen THEN
    RAISE EXCEPTION 'BILLING_RECHARGE_AMOUNT_MISMATCH';
  END IF;

  v_total_credits := v_order.credits + coalesce(v_order.bonus_credits, 0);

  INSERT INTO public.tenant_credit_accounts (tenant_id, last_activity_at)
  VALUES (v_order.tenant_id, now())
  ON CONFLICT (tenant_id) DO NOTHING;

  SELECT *
  INTO v_account
  FROM public.tenant_credit_accounts
  WHERE tenant_id = v_order.tenant_id
  FOR UPDATE;

  IF v_account.status <> 'active' THEN
    RAISE EXCEPTION 'TENANT_BILLING_DISABLED';
  END IF;

  UPDATE public.tenant_credit_orders
  SET
    status = 'paid',
    paid_at = coalesce(p_paid_at, now()),
    paid_amount_fen = p_paid_amount_fen,
    transaction_id = p_transaction_id,
    latest_notification_id = p_notification_id,
    metadata = coalesce(metadata, '{}'::jsonb) || coalesce(p_metadata, '{}'::jsonb)
  WHERE id = v_order.id
  RETURNING * INTO v_order;

  UPDATE public.tenant_credit_accounts
  SET
    balance_credits = balance_credits + v_total_credits,
    total_recharged_credits = total_recharged_credits + v_order.credits,
    total_granted_credits = total_granted_credits + coalesce(v_order.bonus_credits, 0),
    last_recharged_at = coalesce(p_paid_at, now()),
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
    source_type,
    source_id,
    source_no,
    remark,
    operator_user_id
  )
  VALUES (
    v_order.tenant_id,
    v_account.id,
    'in',
    v_total_credits,
    v_account.balance_credits,
    v_account.frozen_credits,
    'wechat_recharge',
    'tenant_credit_order',
    v_order.id::text,
    v_order.order_no,
    '微信支付积分充值',
    v_order.created_by
  )
  RETURNING * INTO v_ledger;

  SELECT *
  INTO v_account_balance
  FROM public.tenant_credit_account_balances
  WHERE id = v_account.id;

  RETURN jsonb_build_object(
    'order', to_jsonb(v_order),
    'account', to_jsonb(v_account_balance),
    'ledger', to_jsonb(v_ledger),
    'idempotent', false
  );
END;
$$;

COMMENT ON COLUMN public.tenant_credit_orders.payment_config_id
IS '平台微信支付配置引用，用于积分充值预下单。';

COMMENT ON COLUMN public.tenant_credit_orders.out_trade_no
IS '微信支付商户订单号，积分充值订单建议复用 order_no。';

COMMENT ON COLUMN public.tenant_credit_orders.prepay_id
IS '微信支付 JSAPI 预支付 ID。';

COMMENT ON COLUMN public.tenant_credit_orders.transaction_id
IS '微信支付订单号。';

COMMENT ON COLUMN public.tenant_credit_orders.paid_amount_fen
IS '微信回调确认的实付金额，单位分。';

COMMENT ON TABLE public.tenant_credit_wechat_notifications
IS '租户积分微信支付充值回调记录。';

COMMENT ON FUNCTION public.billing_confirm_wechat_recharge(
  uuid,
  text,
  integer,
  timestamptz,
  uuid,
  jsonb
) IS '确认微信支付积分充值并幂等写入租户积分账户和积分流水。';
