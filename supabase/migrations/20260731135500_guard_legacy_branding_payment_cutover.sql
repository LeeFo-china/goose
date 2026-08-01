-- Prevent ordinary-payment branding orders after the cutover starts and
-- provide bounded service-role primitives for draining legacy pending orders.

CREATE OR REPLACE FUNCTION public.branding_create_addon_order(
  p_tenant_id uuid,
  p_order_no text,
  p_out_trade_no text,
  p_idempotency_key uuid,
  p_product_id uuid,
  p_product_code text,
  p_entitlement_code text,
  p_product_name text,
  p_amount_fen integer,
  p_term_years integer,
  p_purchase_notes text,
  p_refund_policy text,
  p_payer_openid text,
  p_payment_config_id uuid,
  p_expected_guard_version bigint,
  p_payment_mchid text,
  p_payment_appid text,
  p_payment_expires_at timestamptz,
  p_created_by uuid,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS public.tenant_addon_orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order public.tenant_addon_orders%ROWTYPE;
  v_purchase_mode text;
BEGIN
  SELECT product.purchase_mode
  INTO v_purchase_mode
  FROM public.platform_addon_products AS product
  WHERE product.code = p_product_code
  FOR UPDATE;

  IF NOT FOUND OR v_purchase_mode <> 'direct_legacy' THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'BRANDING_ADDON_PAYMENT_CHANNEL_MIGRATED';
  END IF;

  IF p_tenant_id IS NULL
     OR p_entitlement_code IS NULL
     OR p_entitlement_code <> 'custom_support_branding'
     OR p_metadata IS NULL
     OR jsonb_typeof(p_metadata) <> 'object'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'Invalid branding add-on order input',
      DETAIL = 'BRANDING_ADDON_ORDER_INPUT_INVALID';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      p_tenant_id::text || ':' || p_entitlement_code,
      20260728
    )
  );

  IF EXISTS (
    SELECT 1
    FROM public.tenant_entitlements AS entitlement
    WHERE entitlement.tenant_id = p_tenant_id
      AND entitlement.entitlement_code = p_entitlement_code
      AND entitlement.status = 'suspended'
    FOR UPDATE
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'Branding entitlement is suspended',
      DETAIL = 'BRANDING_ENTITLEMENT_SUSPENDED';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.tenant_entitlements AS entitlement
    WHERE entitlement.tenant_id = p_tenant_id
      AND entitlement.entitlement_code = p_entitlement_code
      AND entitlement.status = 'revoked'
    FOR UPDATE
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'Branding entitlement is revoked',
      DETAIL = 'BRANDING_ENTITLEMENT_REVOKED';
  END IF;

  INSERT INTO public.tenant_addon_orders (
    tenant_id,
    order_no,
    out_trade_no,
    idempotency_key,
    product_id,
    product_code,
    entitlement_code,
    product_name,
    amount_fen,
    term_years,
    purchase_notes,
    refund_policy,
    status,
    channel,
    payer_openid,
    payment_config_id,
    expected_guard_version,
    payment_mchid,
    payment_appid,
    payment_expires_at,
    created_by,
    metadata
  )
  VALUES (
    p_tenant_id,
    p_order_no,
    p_out_trade_no,
    p_idempotency_key,
    p_product_id,
    p_product_code,
    p_entitlement_code,
    p_product_name,
    p_amount_fen,
    p_term_years,
    p_purchase_notes,
    p_refund_policy,
    'pending',
    'wechat_pay',
    p_payer_openid,
    p_payment_config_id,
    p_expected_guard_version,
    p_payment_mchid,
    p_payment_appid,
    p_payment_expires_at,
    p_created_by,
    p_metadata
  )
  RETURNING tenant_addon_orders.* INTO v_order;

  RETURN v_order;
END;
$$;

REVOKE ALL ON FUNCTION public.branding_create_addon_order(
  uuid, text, text, uuid, uuid, text, text, text, integer, integer,
  text, text, text, uuid, bigint, text, text, timestamptz, uuid, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.branding_create_addon_order(
  uuid, text, text, uuid, uuid, text, text, text, integer, integer,
  text, text, text, uuid, bigint, text, text, timestamptz, uuid, jsonb
) TO service_role;

CREATE OR REPLACE FUNCTION public.branding_claim_legacy_pending_orders(
  p_limit integer,
  p_lease_seconds integer
)
RETURNS SETOF public.tenant_addon_orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
BEGIN
  RETURN QUERY
  WITH candidates AS (
    SELECT orders.id
    FROM public.tenant_addon_orders AS orders
    WHERE orders.channel = 'wechat_pay'
      AND orders.status = 'pending'
      AND (
        orders.close_claim_expires_at IS NULL
        OR orders.close_claim_expires_at <= v_now
      )
    ORDER BY orders.created_at ASC, orders.id ASC
    LIMIT least(greatest(coalesce(p_limit, 100), 1), 100)
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.tenant_addon_orders AS orders
  SET close_claim_token = gen_random_uuid(),
      close_claim_expires_at = v_now + make_interval(
        secs => least(
          greatest(coalesce(p_lease_seconds, 60), 10),
          600
        )
      ),
      close_attempt_count = orders.close_attempt_count + 1,
      close_last_error = NULL
  FROM candidates
  WHERE orders.id = candidates.id
  RETURNING orders.*;
END;
$$;

CREATE OR REPLACE FUNCTION public.branding_assert_virtual_cutover_ready()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.platform_addon_products AS product
    JOIN public.platform_virtual_payment_products AS mapping
      ON mapping.addon_product_id = product.id
     AND mapping.provider = 'wechat_virtual'
     AND mapping.environment = 'production'
    JOIN public.system_settings AS secret
      ON secret.key = mapping.encrypted_secret_ref
     AND secret.tenant_id IS NULL
    WHERE product.code = 'custom_support_branding_annual'
      AND product.purchase_mode = 'maintenance'
      AND product.enabled = TRUE
      AND product.amount_fen IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.tenant_addon_orders AS orders
        WHERE orders.channel = 'wechat_pay'
          AND orders.status = 'pending'
      )
      AND mapping.status = 'active'
      AND mapping.validation_status = 'valid'
      AND mapping.expected_amount_fen = product.amount_fen
      AND mapping.expected_amount_fen >= 100
      AND mapping.encrypted_secret_ref =
        'WECHAT_VIRTUAL_PAYMENT_PRODUCTION_SECRET_BUNDLE'
      AND mapping.secret_revision > 0
      AND mapping.validated_at IS NOT NULL
      AND secret.is_secret = TRUE
      AND secret.status = 'active'
      AND NULLIF(btrim(secret.value_text), '') IS NOT NULL
      AND mapping.validated_at >= secret.updated_at
  );
$$;

REVOKE ALL ON FUNCTION public.branding_claim_legacy_pending_orders(
  integer,
  integer
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.branding_claim_legacy_pending_orders(
  integer,
  integer
) TO service_role;

REVOKE ALL ON FUNCTION public.branding_assert_virtual_cutover_ready()
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.branding_assert_virtual_cutover_ready()
TO service_role;

COMMENT ON FUNCTION public.branding_claim_legacy_pending_orders(
  integer,
  integer
) IS 'Claims at most 100 legacy ordinary-payment branding orders for controlled virtual-payment cutover reconciliation.';
COMMENT ON FUNCTION public.branding_assert_virtual_cutover_ready()
IS 'Returns true only in maintenance when no legacy pending order remains and the validated production virtual-payment mapping is current.';
