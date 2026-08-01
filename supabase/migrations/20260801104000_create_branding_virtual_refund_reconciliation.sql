-- Bounded lease-based reconciliation for submitted refunds and compensation.
-- Finalization shares the order advisory -> order -> refund lock order.

CREATE OR REPLACE FUNCTION public.branding_claim_virtual_refund_reconciliation_batch(
  p_limit integer DEFAULT 20,
  p_lease_seconds integer DEFAULT 120
)
RETURNS TABLE (
  refund_id uuid, order_id uuid, claim_token uuid, claim_expires_at timestamptz,
  attempt_count integer,
  refund_status text, compensation_status text, platform_mode text, out_trade_no text,
  payer_openid text, environment text, secret_revision integer,
  amount_fen integer, provider_order_no text
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role'
    OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100
    OR p_lease_seconds IS NULL OR p_lease_seconds NOT BETWEEN 30 AND 600 THEN
    RAISE EXCEPTION 'BRANDING_VIRTUAL_REFUND_RECONCILIATION_INPUT_INVALID' USING ERRCODE = 'P0001';
  END IF;
  RETURN QUERY
  WITH candidates AS (
    SELECT refunds.id
    FROM public.tenant_virtual_addon_refunds AS refunds
    WHERE (
      refunds.status IN ('submitted', 'external_required')
      OR (refunds.status = 'succeeded' AND refunds.compensation_status <> 'succeeded')
    )
      AND (refunds.reconcile_next_at IS NULL OR refunds.reconcile_next_at <= clock_timestamp())
      AND (refunds.reconcile_claim_expires_at IS NULL
        OR refunds.reconcile_claim_expires_at <= clock_timestamp())
    ORDER BY refunds.reconcile_next_at NULLS FIRST, refunds.created_at, refunds.id
    LIMIT p_limit FOR UPDATE SKIP LOCKED
  ), claimed AS (
    UPDATE public.tenant_virtual_addon_refunds AS refunds
    SET reconcile_claim_token = gen_random_uuid(),
        reconcile_claim_expires_at = clock_timestamp() + make_interval(secs => p_lease_seconds),
        reconcile_attempt_count = refunds.reconcile_attempt_count + 1,
        reconcile_next_at = NULL, version = refunds.version + 1
    FROM candidates WHERE refunds.id = candidates.id
    RETURNING refunds.*
  )
  SELECT claimed.id, claimed.order_id, claimed.reconcile_claim_token,
    claimed.reconcile_claim_expires_at,
    claimed.reconcile_attempt_count, claimed.status, claimed.compensation_status,
    claimed.platform_mode,
    orders.out_trade_no, orders.payer_openid, orders.environment,
    orders.secret_revision, claimed.amount_fen, orders.provider_order_no
  FROM claimed JOIN public.tenant_virtual_addon_orders AS orders
    ON orders.id = claimed.order_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.branding_finalize_virtual_refund_reconciliation(
  p_refund_id uuid,
  p_claim_token uuid,
  p_official_status integer,
  p_refund_fee_fen integer,
  p_left_fee_fen integer
)
RETURNS public.tenant_virtual_addon_refunds
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_order_id uuid;
  v_refund public.tenant_virtual_addon_refunds%ROWTYPE;
  v_status text;
  v_previous_status text;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role'
    OR p_refund_id IS NULL OR p_claim_token IS NULL
    OR p_official_status IS NULL OR p_official_status NOT IN (5, 7, 8)
    OR p_refund_fee_fen IS NULL OR p_refund_fee_fen < 0
    OR p_left_fee_fen IS NULL OR p_left_fee_fen < 0 THEN
    RAISE EXCEPTION 'BRANDING_VIRTUAL_REFUND_RECONCILIATION_INPUT_INVALID' USING ERRCODE = 'P0001';
  END IF;
  SELECT refunds.order_id INTO v_order_id
  FROM public.tenant_virtual_addon_refunds AS refunds
  WHERE refunds.id = p_refund_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BRANDING_VIRTUAL_REFUND_RECONCILIATION_CLAIM_LOST' USING ERRCODE = 'P0001';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_order_id::text, 0));
  PERFORM 1 FROM public.tenant_virtual_addon_orders AS orders
  WHERE orders.id = v_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BRANDING_VIRTUAL_REFUND_ORDER_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO v_refund FROM public.tenant_virtual_addon_refunds
  WHERE id = p_refund_id FOR UPDATE;
  IF NOT FOUND OR v_refund.status NOT IN ('submitted', 'external_required')
    OR v_refund.reconcile_claim_token IS DISTINCT FROM p_claim_token
    OR v_refund.reconcile_claim_expires_at IS NULL
    OR v_refund.reconcile_claim_expires_at <= clock_timestamp() THEN
    RAISE EXCEPTION 'BRANDING_VIRTUAL_REFUND_RECONCILIATION_CLAIM_LOST' USING ERRCODE = 'P0001';
  END IF;
  IF (v_refund.platform_mode = 'merchant_initiated' AND (
        v_refund.status <> 'submitted' OR p_official_status NOT IN (5, 7)
      )) OR (v_refund.platform_mode = 'apple_external' AND (
        v_refund.status <> 'external_required' OR p_official_status NOT IN (7, 8)
      )) OR (p_official_status IN (5, 8) AND (
        p_refund_fee_fen <> v_refund.amount_fen OR p_left_fee_fen <> 0
      )) OR (p_official_status = 7 AND (
        p_refund_fee_fen NOT BETWEEN 0 AND v_refund.amount_fen
        OR p_left_fee_fen <> v_refund.amount_fen
      )) THEN
    RAISE EXCEPTION 'BRANDING_VIRTUAL_REFUND_RECONCILIATION_FACT_CONFLICT' USING ERRCODE = 'P0001';
  END IF;
  v_previous_status := v_refund.status;
  v_status := CASE WHEN p_official_status IN (5, 8) THEN 'succeeded' ELSE 'failed' END;
  UPDATE public.tenant_virtual_addon_refunds
  SET status = v_status,
      succeeded_at = CASE WHEN v_status = 'succeeded' THEN clock_timestamp() END,
      failed_at = CASE WHEN v_status = 'failed' THEN clock_timestamp() END,
      last_error_code = CASE WHEN v_status = 'failed' THEN 'WECHAT_VIRTUAL_REFUND_FAILED' END,
      last_error_summary = CASE WHEN v_status = 'failed' THEN '微信查询确认退款失败' END,
      reconcile_claim_token = CASE WHEN v_status = 'failed' THEN NULL
        ELSE reconcile_claim_token END,
      reconcile_claim_expires_at = CASE WHEN v_status = 'failed' THEN NULL
        ELSE reconcile_claim_expires_at END,
      reconcile_next_at = NULL, version = version + 1
  WHERE id = p_refund_id RETURNING * INTO v_refund;
  UPDATE public.tenant_virtual_addon_orders
  SET refund_status = v_status, updated_at = clock_timestamp()
  WHERE id = v_refund.order_id AND refund_status = v_previous_status;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BRANDING_VIRTUAL_REFUND_ORDER_STATE_CONFLICT' USING ERRCODE = 'P0001';
  END IF;
  RETURN v_refund;
END;
$$;

CREATE OR REPLACE FUNCTION public.branding_reschedule_virtual_refund_reconciliation(
  p_refund_id uuid, p_claim_token uuid, p_next_at timestamptz,
  p_error_code text, p_error_summary text
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role'
    OR p_refund_id IS NULL OR p_claim_token IS NULL OR p_next_at IS NULL
    OR p_error_code IS NULL OR p_error_summary IS NULL
    OR char_length(p_error_code) NOT BETWEEN 1 AND 100
    OR char_length(p_error_summary) NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'BRANDING_VIRTUAL_REFUND_RECONCILIATION_INPUT_INVALID' USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.tenant_virtual_addon_refunds
  SET reconcile_claim_token = NULL, reconcile_claim_expires_at = NULL,
      reconcile_next_at = p_next_at, compensation_status = CASE
        WHEN status = 'succeeded' AND compensation_status <> 'succeeded' THEN 'failed'
        ELSE compensation_status END,
      compensation_last_error = CASE WHEN status = 'succeeded'
        THEN left(p_error_summary, 500) ELSE compensation_last_error END,
      last_error_code = CASE
        WHEN p_error_code = 'WECHAT_VIRTUAL_REFUND_PENDING' THEN NULL
        WHEN status IN ('submitted', 'external_required') THEN p_error_code
        ELSE last_error_code END,
      last_error_summary = CASE
        WHEN p_error_code = 'WECHAT_VIRTUAL_REFUND_PENDING' THEN NULL
        WHEN status IN ('submitted', 'external_required') THEN p_error_summary
        ELSE last_error_summary END,
      version = version + 1
  WHERE id = p_refund_id
    AND reconcile_claim_token IS NOT DISTINCT FROM p_claim_token
    AND reconcile_claim_expires_at > clock_timestamp();
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.branding_mark_virtual_refund_reconciliation_conflict(
  p_refund_id uuid, p_claim_token uuid, p_error_code text
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role'
    OR p_refund_id IS NULL OR p_claim_token IS NULL OR p_error_code IS NULL
    OR char_length(p_error_code) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'BRANDING_VIRTUAL_REFUND_RECONCILIATION_INPUT_INVALID' USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.tenant_virtual_addon_refunds
  SET reconcile_claim_token = NULL, reconcile_claim_expires_at = NULL,
      reconcile_next_at = 'infinity'::timestamptz,
      last_error_code = p_error_code,
      last_error_summary = '微信退款终态与可信支付渠道冲突，需人工处理',
      version = version + 1
  WHERE id = p_refund_id
    AND reconcile_claim_token IS NOT DISTINCT FROM p_claim_token
    AND reconcile_claim_expires_at > clock_timestamp();
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.branding_claim_virtual_refund_reconciliation_batch(integer, integer)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.branding_claim_virtual_refund_reconciliation_batch(integer, integer)
TO service_role;
REVOKE ALL ON FUNCTION public.branding_finalize_virtual_refund_reconciliation(uuid, uuid, integer, integer, integer)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.branding_finalize_virtual_refund_reconciliation(uuid, uuid, integer, integer, integer)
TO service_role;
REVOKE ALL ON FUNCTION public.branding_reschedule_virtual_refund_reconciliation(uuid, uuid, timestamptz, text, text)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.branding_reschedule_virtual_refund_reconciliation(uuid, uuid, timestamptz, text, text)
TO service_role;
REVOKE ALL ON FUNCTION public.branding_mark_virtual_refund_reconciliation_conflict(uuid, uuid, text)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.branding_mark_virtual_refund_reconciliation_conflict(uuid, uuid, text)
TO service_role;
