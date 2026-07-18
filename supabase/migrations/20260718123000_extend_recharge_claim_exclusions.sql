DROP FUNCTION IF EXISTS public.billing_claim_expired_recharge_orders(
  timestamptz,
  integer,
  integer
);

CREATE OR REPLACE FUNCTION public.billing_claim_expired_recharge_orders(
  p_now timestamptz,
  p_limit integer,
  p_lease_seconds integer,
  p_excluded_ids uuid[] DEFAULT ARRAY[]::uuid[]
)
RETURNS SETOF public.tenant_credit_orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_now IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'BILLING_RECHARGE_CLAIM_NOW_REQUIRED';
  END IF;

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
      AND orders.payment_expires_at <= p_now
      AND NOT (
        orders.id = ANY(coalesce(p_excluded_ids, ARRAY[]::uuid[]))
      )
      AND (
        orders.close_claim_expires_at IS NULL
        OR orders.close_claim_expires_at <= p_now
      )
    ORDER BY orders.payment_expires_at ASC, orders.id ASC
    LIMIT least(greatest(coalesce(p_limit, 100), 1), 100)
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.tenant_credit_orders AS orders
  SET
    close_claim_token = gen_random_uuid(),
    close_claim_expires_at = p_now + make_interval(
      secs => least(greatest(coalesce(p_lease_seconds, 60), 10), 600)
    ),
    close_attempt_count = orders.close_attempt_count + 1,
    close_last_error = NULL
  FROM candidates
  WHERE orders.id = candidates.id
  RETURNING orders.*;
END;
$$;

REVOKE ALL ON FUNCTION public.billing_claim_expired_recharge_orders(
  timestamptz,
  integer,
  integer,
  uuid[]
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.billing_claim_expired_recharge_orders(
  timestamptz,
  integer,
  integer,
  uuid[]
) FROM anon;
REVOKE ALL ON FUNCTION public.billing_claim_expired_recharge_orders(
  timestamptz,
  integer,
  integer,
  uuid[]
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.billing_claim_expired_recharge_orders(
  timestamptz,
  integer,
  integer,
  uuid[]
) TO service_role;

COMMENT ON FUNCTION public.billing_claim_expired_recharge_orders(
  timestamptz,
  integer,
  integer,
  uuid[]
) IS '领取到期的微信充值订单，并排除同一轮已处理的订单。';
