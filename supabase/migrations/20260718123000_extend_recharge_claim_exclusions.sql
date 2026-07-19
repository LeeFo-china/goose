DROP FUNCTION IF EXISTS public.billing_claim_expired_recharge_orders(
  timestamptz,
  integer,
  integer
);
DROP FUNCTION IF EXISTS public.billing_claim_expired_recharge_orders(
  timestamptz,
  integer,
  integer,
  uuid[]
);

CREATE OR REPLACE FUNCTION public.billing_claim_expired_recharge_orders(
  p_limit integer,
  p_lease_seconds integer,
  p_excluded_ids uuid[] DEFAULT ARRAY[]::uuid[]
)
RETURNS SETOF public.tenant_credit_orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
BEGIN
  IF coalesce(cardinality(p_excluded_ids), 0) > 100 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'BILLING_RECHARGE_CLAIM_EXCLUSIONS_TOO_LARGE';
  END IF;

  RETURN QUERY
  WITH candidates AS (
    SELECT orders.id
    FROM public.tenant_credit_orders AS orders
    WHERE orders.channel = 'wechat_pay'
      AND orders.status = 'pending'
      AND orders.payment_expires_at IS NOT NULL
      AND orders.payment_expires_at <= v_now
      AND NOT (
        orders.id = ANY(coalesce(p_excluded_ids, ARRAY[]::uuid[]))
      )
      AND (
        orders.close_claim_expires_at IS NULL
        OR orders.close_claim_expires_at <= v_now
      )
    ORDER BY orders.payment_expires_at ASC, orders.id ASC
    LIMIT least(greatest(coalesce(p_limit, 100), 1), 100)
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.tenant_credit_orders AS orders
  SET
    close_claim_token = gen_random_uuid(),
    close_claim_expires_at = v_now + make_interval(
      secs => least(greatest(coalesce(p_lease_seconds, 60), 10), 600)
    ),
    close_attempt_count = orders.close_attempt_count + 1,
    close_last_error = NULL
  FROM candidates
  WHERE orders.id = candidates.id
  RETURNING orders.*;
END;
$$;

CREATE OR REPLACE FUNCTION public.billing_renew_recharge_close_claim(
  p_order_id uuid,
  p_claim_token uuid,
  p_lease_seconds integer
)
RETURNS public.tenant_credit_orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.tenant_credit_orders%ROWTYPE;
BEGIN
  UPDATE public.tenant_credit_orders AS orders
  SET close_claim_expires_at = clock_timestamp() + make_interval(
    secs => least(greatest(coalesce(p_lease_seconds, 60), 10), 600)
  )
  WHERE orders.id = p_order_id
    AND orders.status = 'pending'
    AND orders.close_claim_token = p_claim_token
  RETURNING orders.* INTO v_order;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN v_order;
END;
$$;

REVOKE ALL ON FUNCTION public.billing_claim_expired_recharge_orders(
  integer,
  integer,
  uuid[]
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.billing_claim_expired_recharge_orders(
  integer,
  integer,
  uuid[]
) FROM anon;
REVOKE ALL ON FUNCTION public.billing_claim_expired_recharge_orders(
  integer,
  integer,
  uuid[]
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.billing_claim_expired_recharge_orders(
  integer,
  integer,
  uuid[]
) TO service_role;

REVOKE ALL ON FUNCTION public.billing_renew_recharge_close_claim(
  uuid,
  uuid,
  integer
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.billing_renew_recharge_close_claim(
  uuid,
  uuid,
  integer
) FROM anon;
REVOKE ALL ON FUNCTION public.billing_renew_recharge_close_claim(
  uuid,
  uuid,
  integer
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.billing_renew_recharge_close_claim(
  uuid,
  uuid,
  integer
) TO service_role;

COMMENT ON FUNCTION public.billing_claim_expired_recharge_orders(
  integer,
  integer,
  uuid[]
) IS '按数据库时钟领取到期的微信充值订单，并排除同一轮已处理的订单。';

COMMENT ON FUNCTION public.billing_renew_recharge_close_claim(
  uuid,
  uuid,
  integer
) IS '按数据库时钟续租匹配 token 的待支付充值关单领取。';
