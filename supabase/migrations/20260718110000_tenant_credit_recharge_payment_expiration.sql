-- Add payment expiration and close-worker leasing for WeChat Pay recharge orders.

ALTER TABLE public.tenant_credit_orders
  ADD COLUMN IF NOT EXISTS payment_expires_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS close_claim_token uuid NULL,
  ADD COLUMN IF NOT EXISTS close_claim_expires_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS close_attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS close_last_error text NULL;

UPDATE public.tenant_credit_orders
SET payment_expires_at = created_at + interval '5 minutes'
WHERE channel = 'wechat_pay'
  AND status = 'pending'
  AND payment_expires_at IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tenant_credit_orders_payment_expires_at_check'
      AND conrelid = 'public.tenant_credit_orders'::regclass
  ) THEN
    ALTER TABLE public.tenant_credit_orders
      ADD CONSTRAINT tenant_credit_orders_payment_expires_at_check
      CHECK (
        payment_expires_at IS NULL
        OR payment_expires_at >= created_at + interval '1 minute'
      );
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS tenant_credit_orders_pending_expiry_idx
ON public.tenant_credit_orders(payment_expires_at ASC, id)
WHERE channel = 'wechat_pay'
  AND status = 'pending';

CREATE OR REPLACE FUNCTION public.clear_tenant_credit_order_close_claim()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status <> 'pending' THEN
    NEW.close_claim_token := NULL;
    NEW.close_claim_expires_at := NULL;
    NEW.close_last_error := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_tenant_credit_orders_clear_close_claim
ON public.tenant_credit_orders;

CREATE TRIGGER tr_tenant_credit_orders_clear_close_claim
  BEFORE UPDATE OF status ON public.tenant_credit_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.clear_tenant_credit_order_close_claim();

CREATE OR REPLACE FUNCTION public.billing_claim_expired_recharge_orders(
  p_now timestamptz,
  p_limit integer,
  p_lease_seconds integer
)
RETURNS SETOF public.tenant_credit_orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit integer;
  v_lease_seconds integer;
BEGIN
  IF p_now IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'BILLING_RECHARGE_CLAIM_NOW_REQUIRED';
  END IF;

  v_limit := LEAST(GREATEST(COALESCE(p_limit, 100), 1), 100);
  v_lease_seconds := LEAST(GREATEST(COALESCE(p_lease_seconds, 60), 10), 600);

  RETURN QUERY
  WITH claimable_orders AS (
    SELECT id
    FROM public.tenant_credit_orders
    WHERE channel = 'wechat_pay'
      AND status = 'pending'
      AND payment_expires_at IS NOT NULL
      AND payment_expires_at <= p_now
      AND (
        close_claim_expires_at IS NULL OR close_claim_expires_at <= p_now
      )
    ORDER BY payment_expires_at ASC, id
    LIMIT v_limit
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.tenant_credit_orders AS target
  SET
    close_claim_token = gen_random_uuid(),
    close_claim_expires_at = p_now + make_interval(secs => v_lease_seconds),
    close_attempt_count = target.close_attempt_count + 1,
    close_last_error = NULL
  FROM claimable_orders
  WHERE target.id = claimable_orders.id
  RETURNING target.*;
END;
$$;

REVOKE ALL ON FUNCTION public.billing_claim_expired_recharge_orders(
  timestamptz,
  integer,
  integer
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.billing_claim_expired_recharge_orders(
  timestamptz,
  integer,
  integer
) TO service_role;

COMMENT ON COLUMN public.tenant_credit_orders.payment_expires_at
IS '微信支付充值订单的支付截止时间，过期后可由关单 worker 处理。';

COMMENT ON COLUMN public.tenant_credit_orders.close_claim_token
IS '关单 worker 的当前领取令牌，用于标识一次处理租约。';

COMMENT ON COLUMN public.tenant_credit_orders.close_claim_expires_at
IS '关单 worker 领取租约的到期时间，过期后允许其他 worker 重新领取。';

COMMENT ON COLUMN public.tenant_credit_orders.close_attempt_count
IS '关单 worker 累计领取次数。';

COMMENT ON COLUMN public.tenant_credit_orders.close_last_error
IS '最近一次关单失败原因，重新领取或订单离开 pending 时清空。';

COMMENT ON FUNCTION public.clear_tenant_credit_order_close_claim()
IS '订单离开 pending 状态时清理关单领取信息和最近错误。';

COMMENT ON FUNCTION public.billing_claim_expired_recharge_orders(
  timestamptz,
  integer,
  integer
) IS '按支付截止时间领取过期的微信充值订单，并为关单 worker 创建有界租约。';
