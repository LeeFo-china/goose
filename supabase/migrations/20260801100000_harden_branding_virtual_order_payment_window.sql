-- Rollback: use a forward migration to disable virtual purchases, wait for all
-- issued pending orders to be reconciled, revoke the payment-request RPCs and
-- triggers, then remove the claim columns and constraints. Historical orders
-- that were issued, closed, or fulfilled must never be reopened or deleted.

BEGIN;

ALTER TABLE public.tenant_virtual_addon_orders
  ADD COLUMN payment_request_claim_token uuid NULL,
  ADD COLUMN payment_request_claimed_at timestamptz NULL,
  ADD COLUMN payment_request_claim_expires_at timestamptz NULL,
  ADD COLUMN payment_request_issued_at timestamptz NULL,
  ADD COLUMN payment_request_attempt_revision integer NOT NULL DEFAULT 0,
  ADD CONSTRAINT tenant_virtual_addon_orders_payment_request_claim_check
    CHECK (
      (
        payment_request_claim_token IS NULL
        AND payment_request_claimed_at IS NULL
        AND payment_request_claim_expires_at IS NULL
      )
      OR (
        payment_request_claim_token IS NOT NULL
        AND payment_request_claimed_at IS NOT NULL
        AND payment_request_claim_expires_at IS NOT NULL
        AND payment_request_claim_expires_at > payment_request_claimed_at
      )
    ),
  ADD CONSTRAINT tenant_virtual_addon_orders_payment_request_attempt_check
    CHECK (
      payment_request_attempt_revision >= 0
      AND (
        (payment_request_issued_at IS NULL AND payment_request_attempt_revision = 0)
        OR (
          payment_request_issued_at IS NOT NULL
          AND payment_request_attempt_revision > 0
        )
      )
    );

CREATE INDEX tenant_virtual_addon_orders_payment_request_claim_idx
ON public.tenant_virtual_addon_orders(
  payment_request_claim_expires_at ASC,
  id ASC
)
WHERE payment_request_claim_token IS NOT NULL;

CREATE OR REPLACE FUNCTION public.branding_create_virtual_addon_order(
  p_tenant_id uuid,
  p_idempotency_key uuid,
  p_virtual_product_id uuid,
  p_requested_platform text,
  p_payer_openid text,
  p_created_by uuid
)
RETURNS public.tenant_virtual_addon_orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_product public.platform_addon_products%ROWTYPE;
  v_virtual_product public.platform_virtual_payment_products%ROWTYPE;
  v_order public.tenant_virtual_addon_orders%ROWTYPE;
  v_now timestamptz := clock_timestamp();
  v_order_no text;
  v_out_trade_no text;
BEGIN
  IF p_tenant_id IS NULL
     OR p_idempotency_key IS NULL
     OR p_virtual_product_id IS NULL
     OR p_created_by IS NULL
     OR p_requested_platform IS NULL
     OR p_requested_platform NOT IN (
       'android', 'harmony', 'windows', 'ios', 'unknown'
     )
     OR p_payer_openid IS NULL
     OR btrim(p_payer_openid) = ''
     OR char_length(p_payer_openid) > 128
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'BRANDING_VIRTUAL_ORDER_INPUT_INVALID';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_tenant_id::text || ':custom_support_branding', 20260728)
  );
  PERFORM pg_advisory_xact_lock(
    hashtextextended('branding_virtual_payment_config', 20260801)
  );

  IF EXISTS (
    SELECT 1 FROM public.tenant_entitlements AS entitlement
    WHERE entitlement.tenant_id = p_tenant_id
      AND entitlement.entitlement_code = 'custom_support_branding'
      AND entitlement.status = 'suspended'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'BRANDING_ENTITLEMENT_SUSPENDED';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.tenant_entitlements AS entitlement
    WHERE entitlement.tenant_id = p_tenant_id
      AND entitlement.entitlement_code = 'custom_support_branding'
      AND entitlement.status = 'revoked'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'BRANDING_ENTITLEMENT_REVOKED';
  END IF;

  SELECT product.* INTO v_product
  FROM public.platform_addon_products AS product
  WHERE product.code = 'custom_support_branding_annual'
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'BRANDING_VIRTUAL_PRODUCT_NOT_FOUND';
  END IF;

  SELECT mapping.* INTO v_virtual_product
  FROM public.platform_virtual_payment_products AS mapping
  WHERE mapping.id = p_virtual_product_id
    AND mapping.addon_product_id = v_product.id
    AND mapping.provider = 'wechat_virtual'
    AND mapping.environment = 'production'
  FOR SHARE;

  IF v_product.purchase_mode <> 'wechat_virtual' THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'BRANDING_VIRTUAL_PURCHASE_MODE_UNAVAILABLE';
  END IF;
  IF v_product.enabled = false OR v_product.amount_fen IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'BRANDING_VIRTUAL_PRODUCT_DISABLED';
  END IF;
  IF NOT FOUND
     OR v_virtual_product.status <> 'active'
     OR v_virtual_product.validation_status <> 'valid'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'BRANDING_VIRTUAL_PRODUCT_MAPPING_UNAVAILABLE';
  END IF;
  IF v_virtual_product.expected_amount_fen IS DISTINCT FROM v_product.amount_fen THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'BRANDING_VIRTUAL_PRODUCT_AMOUNT_MISMATCH';
  END IF;
  IF v_product.amount_fen < 100 THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'BRANDING_VIRTUAL_PRODUCT_AMOUNT_TOO_LOW';
  END IF;

  UPDATE public.tenant_virtual_addon_orders AS orders
  SET payment_status = 'closed',
      failure_code = 'BRANDING_VIRTUAL_ORDER_EXPIRED',
      failure_message = '虚拟支付订单支付时间已结束',
      payment_request_claim_token = NULL,
      payment_request_claimed_at = NULL,
      payment_request_claim_expires_at = NULL
  WHERE orders.tenant_id = p_tenant_id
    AND orders.product_code = v_product.code
    AND orders.payment_status = 'pending'
    AND orders.payment_expires_at <= v_now
    AND orders.payment_request_issued_at IS NULL
    AND (
      orders.payment_request_claim_token IS NULL
      OR orders.payment_request_claim_expires_at <= v_now
    );

  SELECT orders.* INTO v_order
  FROM public.tenant_virtual_addon_orders AS orders
  WHERE orders.tenant_id = p_tenant_id
    AND orders.idempotency_key = p_idempotency_key
  FOR UPDATE;
  IF FOUND THEN
    IF v_order.payer_openid IS DISTINCT FROM p_payer_openid THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001', MESSAGE = 'BRANDING_VIRTUAL_ORDER_PAYER_MISMATCH';
    END IF;
    IF v_order.created_by IS DISTINCT FROM p_created_by THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001', MESSAGE = 'BRANDING_VIRTUAL_ORDER_ACTOR_MISMATCH';
    END IF;
    RETURN v_order;
  END IF;

  SELECT orders.* INTO v_order
  FROM public.tenant_virtual_addon_orders AS orders
  WHERE orders.tenant_id = p_tenant_id
    AND orders.product_code = v_product.code
    AND orders.payment_status = 'pending'
  FOR UPDATE;
  IF FOUND THEN
    IF v_order.payer_openid IS DISTINCT FROM p_payer_openid THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001', MESSAGE = 'BRANDING_VIRTUAL_ORDER_PAYER_MISMATCH';
    END IF;
    IF v_order.created_by IS DISTINCT FROM p_created_by THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001', MESSAGE = 'BRANDING_VIRTUAL_ORDER_ACTOR_MISMATCH';
    END IF;
    RETURN v_order;
  END IF;

  v_order_no := 'BVO-' || to_char(v_now, 'YYYYMMDDHH24MISSMS') || '-' ||
    upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
  v_out_trade_no := 'BV' || to_char(v_now, 'YYYYMMDDHH24MISS') ||
    upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16));

  INSERT INTO public.tenant_virtual_addon_orders (
    tenant_id, order_no, out_trade_no, idempotency_key, product_id,
    product_code, entitlement_code, product_name, amount_fen, term_years,
    purchase_notes, refund_policy, environment, offer_id,
    provider_product_id, requested_platform, payer_openid, payment_status,
    fulfillment_status, refund_status, config_version, secret_revision,
    payment_expires_at, created_by, created_at, updated_at
  ) VALUES (
    p_tenant_id, v_order_no, v_out_trade_no, p_idempotency_key, v_product.id,
    v_product.code, v_product.entitlement_code, v_product.name,
    v_product.amount_fen, v_product.term_years, v_product.purchase_notes,
    v_product.refund_policy, v_virtual_product.environment,
    v_virtual_product.offer_id, v_virtual_product.provider_product_id,
    p_requested_platform, p_payer_openid, 'pending', 'pending', 'none',
    v_virtual_product.version, v_virtual_product.secret_revision,
    v_now + interval '5 minutes', p_created_by, v_now, v_now
  )
  ON CONFLICT DO NOTHING
  RETURNING tenant_virtual_addon_orders.* INTO v_order;
  IF FOUND THEN RETURN v_order; END IF;

  SELECT orders.* INTO v_order
  FROM public.tenant_virtual_addon_orders AS orders
  WHERE orders.tenant_id = p_tenant_id
    AND (
      orders.idempotency_key = p_idempotency_key
      OR (
        orders.product_code = v_product.code
        AND orders.payment_status = 'pending'
      )
    )
  ORDER BY (orders.idempotency_key = p_idempotency_key) DESC,
           orders.created_at DESC, orders.id DESC
  LIMIT 1
  FOR UPDATE;
  IF FOUND THEN
    IF v_order.payer_openid IS DISTINCT FROM p_payer_openid THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001', MESSAGE = 'BRANDING_VIRTUAL_ORDER_PAYER_MISMATCH';
    END IF;
    IF v_order.created_by IS DISTINCT FROM p_created_by THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001', MESSAGE = 'BRANDING_VIRTUAL_ORDER_ACTOR_MISMATCH';
    END IF;
    RETURN v_order;
  END IF;

  RAISE EXCEPTION USING
    ERRCODE = 'P0001', MESSAGE = 'BRANDING_VIRTUAL_ORDER_CONFLICT';
END;
$$;

CREATE OR REPLACE FUNCTION public.assert_branding_virtual_payment_order_current(
  p_product public.platform_addon_products,
  p_mapping public.platform_virtual_payment_products,
  p_order public.tenant_virtual_addon_orders
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_product.id IS NULL OR p_product.purchase_mode <> 'wechat_virtual'
     OR p_product.enabled = false OR p_product.amount_fen IS NULL
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'BRANDING_VIRTUAL_ORDER_CONFIG_CHANGED';
  END IF;
  IF p_mapping.id IS NULL OR p_mapping.status <> 'active'
     OR p_mapping.validation_status <> 'valid'
     OR p_mapping.environment <> 'production'
     OR p_mapping.provider <> 'wechat_virtual'
     OR p_mapping.addon_product_id IS DISTINCT FROM p_product.id
     OR p_mapping.expected_amount_fen IS DISTINCT FROM p_product.amount_fen
     OR p_order.product_id IS DISTINCT FROM p_product.id
     OR p_order.environment IS DISTINCT FROM p_mapping.environment
     OR p_order.amount_fen IS DISTINCT FROM p_product.amount_fen
     OR p_order.offer_id IS DISTINCT FROM p_mapping.offer_id
     OR p_order.provider_product_id IS DISTINCT FROM p_mapping.provider_product_id
     OR p_order.config_version IS DISTINCT FROM p_mapping.version
     OR p_order.secret_revision IS DISTINCT FROM p_mapping.secret_revision
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'BRANDING_VIRTUAL_ORDER_CONFIG_CHANGED';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_branding_virtual_payment_order_current(
  public.platform_addon_products,
  public.platform_virtual_payment_products,
  public.tenant_virtual_addon_orders
) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.branding_claim_virtual_addon_payment_request(
  p_tenant_id uuid,
  p_order_id uuid,
  p_payer_openid text,
  p_created_by uuid
)
RETURNS public.tenant_virtual_addon_orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_product public.platform_addon_products%ROWTYPE;
  v_mapping public.platform_virtual_payment_products%ROWTYPE;
  v_order public.tenant_virtual_addon_orders%ROWTYPE;
  v_now timestamptz := clock_timestamp();
BEGIN
  IF p_tenant_id IS NULL OR p_order_id IS NULL OR p_created_by IS NULL
     OR p_payer_openid IS NULL OR btrim(p_payer_openid) = ''
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'BRANDING_VIRTUAL_ORDER_INPUT_INVALID';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_tenant_id::text || ':custom_support_branding', 20260728)
  );
  PERFORM pg_advisory_xact_lock(
    hashtextextended('branding_virtual_payment_config', 20260801)
  );

  IF EXISTS (
    SELECT 1 FROM public.tenant_entitlements AS entitlement
    WHERE entitlement.tenant_id = p_tenant_id
      AND entitlement.entitlement_code = 'custom_support_branding'
      AND entitlement.status = 'suspended'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'BRANDING_ENTITLEMENT_SUSPENDED';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.tenant_entitlements AS entitlement
    WHERE entitlement.tenant_id = p_tenant_id
      AND entitlement.entitlement_code = 'custom_support_branding'
      AND entitlement.status = 'revoked'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'BRANDING_ENTITLEMENT_REVOKED';
  END IF;

  SELECT product.* INTO v_product
  FROM public.platform_addon_products AS product
  WHERE product.code = 'custom_support_branding_annual'
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'BRANDING_VIRTUAL_PRODUCT_NOT_FOUND';
  END IF;

  SELECT mapping.* INTO v_mapping
  FROM public.platform_virtual_payment_products AS mapping
  WHERE mapping.addon_product_id = v_product.id
    AND mapping.provider = 'wechat_virtual'
    AND mapping.environment = 'production'
  FOR SHARE;

  SELECT orders.* INTO v_order
  FROM public.tenant_virtual_addon_orders AS orders
  WHERE orders.tenant_id = p_tenant_id AND orders.id = p_order_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'BRANDING_VIRTUAL_ORDER_NOT_FOUND';
  END IF;
  PERFORM public.assert_branding_virtual_payment_order_current(
    v_product, v_mapping, v_order
  );
  IF v_order.payer_openid IS DISTINCT FROM p_payer_openid THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'BRANDING_VIRTUAL_ORDER_PAYER_MISMATCH';
  END IF;
  IF v_order.created_by IS DISTINCT FROM p_created_by THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'BRANDING_VIRTUAL_ORDER_ACTOR_MISMATCH';
  END IF;
  IF v_order.payment_status <> 'pending' THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'BRANDING_VIRTUAL_ORDER_NOT_PENDING';
  END IF;
  IF v_order.payment_request_claim_token IS NOT NULL
     AND v_order.payment_request_claim_expires_at > v_now
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'BRANDING_VIRTUAL_PAYMENT_REQUEST_IN_PROGRESS';
  END IF;
  IF v_order.payment_request_issued_at IS NOT NULL
     AND v_order.payment_expires_at <= v_now
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'BRANDING_VIRTUAL_PAYMENT_RECONCILIATION_REQUIRED';
  END IF;
  IF v_order.payment_request_issued_at IS NULL
     AND v_order.payment_expires_at <= v_now
  THEN
    UPDATE public.tenant_virtual_addon_orders
    SET payment_status = 'closed',
        failure_code = 'BRANDING_VIRTUAL_ORDER_EXPIRED',
        failure_message = '虚拟支付订单支付时间已结束',
        payment_request_claim_token = NULL,
        payment_request_claimed_at = NULL,
        payment_request_claim_expires_at = NULL
    WHERE id = v_order.id
    RETURNING * INTO v_order;
    RETURN v_order;
  END IF;

  UPDATE public.tenant_virtual_addon_orders
  SET payment_request_claim_token = gen_random_uuid(),
      payment_request_claimed_at = v_now,
      payment_request_claim_expires_at = v_now + interval '30 seconds'
  WHERE id = v_order.id
  RETURNING * INTO v_order;
  RETURN v_order;
END;
$$;

CREATE OR REPLACE FUNCTION public.branding_finalize_virtual_addon_payment_request(
  p_tenant_id uuid,
  p_order_id uuid,
  p_payer_openid text,
  p_created_by uuid,
  p_claim_token uuid
)
RETURNS public.tenant_virtual_addon_orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_product public.platform_addon_products%ROWTYPE;
  v_mapping public.platform_virtual_payment_products%ROWTYPE;
  v_order public.tenant_virtual_addon_orders%ROWTYPE;
  v_now timestamptz := clock_timestamp();
BEGIN
  IF p_tenant_id IS NULL OR p_order_id IS NULL OR p_created_by IS NULL
     OR p_claim_token IS NULL OR p_payer_openid IS NULL
     OR btrim(p_payer_openid) = ''
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'BRANDING_VIRTUAL_ORDER_INPUT_INVALID';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_tenant_id::text || ':custom_support_branding', 20260728)
  );
  PERFORM pg_advisory_xact_lock(
    hashtextextended('branding_virtual_payment_config', 20260801)
  );

  IF EXISTS (
    SELECT 1 FROM public.tenant_entitlements AS entitlement
    WHERE entitlement.tenant_id = p_tenant_id
      AND entitlement.entitlement_code = 'custom_support_branding'
      AND entitlement.status = 'suspended'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'BRANDING_ENTITLEMENT_SUSPENDED';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.tenant_entitlements AS entitlement
    WHERE entitlement.tenant_id = p_tenant_id
      AND entitlement.entitlement_code = 'custom_support_branding'
      AND entitlement.status = 'revoked'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'BRANDING_ENTITLEMENT_REVOKED';
  END IF;

  SELECT product.* INTO v_product
  FROM public.platform_addon_products AS product
  WHERE product.code = 'custom_support_branding_annual'
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'BRANDING_VIRTUAL_PRODUCT_NOT_FOUND';
  END IF;

  SELECT mapping.* INTO v_mapping
  FROM public.platform_virtual_payment_products AS mapping
  WHERE mapping.addon_product_id = v_product.id
    AND mapping.provider = 'wechat_virtual'
    AND mapping.environment = 'production'
  FOR SHARE;

  SELECT orders.* INTO v_order
  FROM public.tenant_virtual_addon_orders AS orders
  WHERE orders.tenant_id = p_tenant_id AND orders.id = p_order_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'BRANDING_VIRTUAL_ORDER_NOT_FOUND';
  END IF;
  PERFORM public.assert_branding_virtual_payment_order_current(
    v_product, v_mapping, v_order
  );
  IF v_order.payer_openid IS DISTINCT FROM p_payer_openid THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'BRANDING_VIRTUAL_ORDER_PAYER_MISMATCH';
  END IF;
  IF v_order.created_by IS DISTINCT FROM p_created_by THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'BRANDING_VIRTUAL_ORDER_ACTOR_MISMATCH';
  END IF;
  IF v_order.payment_status <> 'pending' THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'BRANDING_VIRTUAL_ORDER_NOT_PENDING';
  END IF;
  IF v_order.payment_request_claim_token IS DISTINCT FROM p_claim_token
     OR v_order.payment_request_claim_expires_at <= v_now
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'BRANDING_VIRTUAL_PAYMENT_REQUEST_CLAIM_INVALID';
  END IF;
  IF v_order.payment_request_issued_at IS NOT NULL
     AND v_order.payment_expires_at <= v_now
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'BRANDING_VIRTUAL_PAYMENT_RECONCILIATION_REQUIRED';
  END IF;
  IF v_order.payment_request_issued_at IS NULL
     AND v_order.payment_expires_at <= v_now
  THEN
    UPDATE public.tenant_virtual_addon_orders
    SET payment_status = 'closed',
        failure_code = 'BRANDING_VIRTUAL_ORDER_EXPIRED',
        failure_message = '虚拟支付订单支付时间已结束',
        payment_request_claim_token = NULL,
        payment_request_claimed_at = NULL,
        payment_request_claim_expires_at = NULL
    WHERE id = v_order.id
    RETURNING * INTO v_order;
    RETURN v_order;
  END IF;

  UPDATE public.tenant_virtual_addon_orders
  SET payment_request_issued_at = coalesce(payment_request_issued_at, v_now),
      payment_request_attempt_revision = payment_request_attempt_revision + 1,
      payment_request_claim_token = NULL,
      payment_request_claimed_at = NULL,
      payment_request_claim_expires_at = NULL
  WHERE id = v_order.id
  RETURNING * INTO v_order;
  RETURN v_order;
END;
$$;

CREATE OR REPLACE FUNCTION public.branding_release_virtual_addon_payment_request_claim(
  p_tenant_id uuid,
  p_order_id uuid,
  p_payer_openid text,
  p_created_by uuid,
  p_claim_token uuid
)
RETURNS public.tenant_virtual_addon_orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_product public.platform_addon_products%ROWTYPE;
  v_mapping public.platform_virtual_payment_products%ROWTYPE;
  v_order public.tenant_virtual_addon_orders%ROWTYPE;
  v_entitlement_status text;
BEGIN
  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_tenant_id::text || ':custom_support_branding', 20260728)
  );
  PERFORM pg_advisory_xact_lock(
    hashtextextended('branding_virtual_payment_config', 20260801)
  );
  SELECT product.* INTO v_product
  FROM public.platform_addon_products AS product
  WHERE product.code = 'custom_support_branding_annual'
  FOR SHARE;
  SELECT mapping.* INTO v_mapping
  FROM public.platform_virtual_payment_products AS mapping
  WHERE mapping.addon_product_id = v_product.id
    AND mapping.provider = 'wechat_virtual'
    AND mapping.environment = 'production'
  FOR SHARE;
  SELECT orders.* INTO v_order
  FROM public.tenant_virtual_addon_orders AS orders
  WHERE orders.tenant_id = p_tenant_id AND orders.id = p_order_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'BRANDING_VIRTUAL_ORDER_NOT_FOUND';
  END IF;
  IF v_order.payer_openid IS DISTINCT FROM p_payer_openid THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'BRANDING_VIRTUAL_ORDER_PAYER_MISMATCH';
  END IF;
  IF v_order.created_by IS DISTINCT FROM p_created_by THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'BRANDING_VIRTUAL_ORDER_ACTOR_MISMATCH';
  END IF;
  IF v_order.payment_request_claim_token IS NULL THEN RETURN v_order; END IF;
  IF v_order.payment_request_claim_token IS DISTINCT FROM p_claim_token THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'BRANDING_VIRTUAL_PAYMENT_REQUEST_CLAIM_INVALID';
  END IF;

  SELECT entitlement.status INTO v_entitlement_status
  FROM public.tenant_entitlements AS entitlement
  WHERE entitlement.tenant_id = p_tenant_id
    AND entitlement.entitlement_code = 'custom_support_branding';

  UPDATE public.tenant_virtual_addon_orders
  SET payment_request_claim_token = NULL,
      payment_request_claimed_at = NULL,
      payment_request_claim_expires_at = NULL,
      payment_status = CASE
        WHEN payment_request_issued_at IS NULL
          AND v_entitlement_status IN ('suspended', 'revoked')
          THEN 'closed'
        ELSE payment_status
      END,
      failure_code = CASE
        WHEN payment_request_issued_at IS NULL AND v_entitlement_status = 'suspended'
          THEN 'BRANDING_ENTITLEMENT_SUSPENDED'
        WHEN payment_request_issued_at IS NULL AND v_entitlement_status = 'revoked'
          THEN 'BRANDING_ENTITLEMENT_REVOKED'
        ELSE failure_code
      END,
      failure_message = CASE
        WHEN payment_request_issued_at IS NULL AND v_entitlement_status = 'suspended'
          THEN '品牌权益已暂停'
        WHEN payment_request_issued_at IS NULL AND v_entitlement_status = 'revoked'
          THEN '品牌权益已撤销'
        ELSE failure_message
      END
  WHERE id = v_order.id
  RETURNING * INTO v_order;
  RETURN v_order;
END;
$$;

CREATE OR REPLACE FUNCTION public.close_unissued_branding_virtual_orders_on_entitlement_stop()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.entitlement_code = 'custom_support_branding'
     AND NEW.status IN ('suspended', 'revoked')
     AND OLD.status IS DISTINCT FROM NEW.status
  THEN
    PERFORM pg_advisory_xact_lock(
      hashtextextended(
        NEW.tenant_id::text || ':custom_support_branding', 20260728
      )
    );
    UPDATE public.tenant_virtual_addon_orders
    SET payment_status = 'closed',
        failure_code = CASE WHEN NEW.status = 'suspended'
          THEN 'BRANDING_ENTITLEMENT_SUSPENDED'
          ELSE 'BRANDING_ENTITLEMENT_REVOKED' END,
        failure_message = CASE WHEN NEW.status = 'suspended'
          THEN '品牌权益已暂停'
          ELSE '品牌权益已撤销' END,
        payment_request_claim_token = NULL,
        payment_request_claimed_at = NULL,
        payment_request_claim_expires_at = NULL
    WHERE tenant_id = NEW.tenant_id
      AND entitlement_code = NEW.entitlement_code
      AND payment_status = 'pending'
      AND payment_request_issued_at IS NULL
      AND payment_request_claim_token IS NULL;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL
ON FUNCTION public.close_unissued_branding_virtual_orders_on_entitlement_stop()
FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS tr_tenant_entitlements_close_unissued_virtual_orders
ON public.tenant_entitlements;
CREATE TRIGGER tr_tenant_entitlements_close_unissued_virtual_orders
AFTER UPDATE OF status ON public.tenant_entitlements
FOR EACH ROW
EXECUTE FUNCTION public.close_unissued_branding_virtual_orders_on_entitlement_stop();

CREATE OR REPLACE FUNCTION public.guard_branding_virtual_payment_secret_rotation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_old_protected boolean;
  v_new_protected boolean;
  v_key text;
  v_environment text;
  v_now timestamptz := clock_timestamp();
  v_effective_changed boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_old_protected := false;
    v_new_protected := NEW.key IN (
      'WECHAT_VIRTUAL_PAYMENT_SANDBOX_SECRET_BUNDLE',
      'WECHAT_VIRTUAL_PAYMENT_PRODUCTION_SECRET_BUNDLE'
    );
    v_effective_changed := true;
  ELSIF TG_OP = 'DELETE' THEN
    v_old_protected := OLD.key IN (
      'WECHAT_VIRTUAL_PAYMENT_SANDBOX_SECRET_BUNDLE',
      'WECHAT_VIRTUAL_PAYMENT_PRODUCTION_SECRET_BUNDLE'
    );
    v_new_protected := false;
    v_effective_changed := true;
  ELSE
    v_old_protected := OLD.key IN (
      'WECHAT_VIRTUAL_PAYMENT_SANDBOX_SECRET_BUNDLE',
      'WECHAT_VIRTUAL_PAYMENT_PRODUCTION_SECRET_BUNDLE'
    );
    v_new_protected := NEW.key IN (
      'WECHAT_VIRTUAL_PAYMENT_SANDBOX_SECRET_BUNDLE',
      'WECHAT_VIRTUAL_PAYMENT_PRODUCTION_SECRET_BUNDLE'
    );
    v_effective_changed := OLD.value_text IS DISTINCT FROM NEW.value_text
      OR OLD.status IS DISTINCT FROM NEW.status;
  END IF;

  IF NOT v_old_protected AND NOT v_new_protected THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND (
    OLD.key IS DISTINCT FROM NEW.key
    OR OLD.tenant_id IS DISTINCT FROM NEW.tenant_id
    OR OLD.is_secret IS DISTINCT FROM NEW.is_secret
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'BRANDING_VIRTUAL_PAYMENT_SECRET_IDENTITY_IMMUTABLE';
  END IF;

  IF TG_OP <> 'DELETE' AND (NEW.tenant_id IS NOT NULL OR NEW.is_secret IS NOT TRUE) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'BRANDING_VIRTUAL_PAYMENT_SECRET_SCOPE_INVALID';
  END IF;
  IF TG_OP = 'DELETE' AND (OLD.tenant_id IS NOT NULL OR OLD.is_secret IS NOT TRUE) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'BRANDING_VIRTUAL_PAYMENT_SECRET_SCOPE_INVALID';
  END IF;

  v_key := CASE WHEN TG_OP = 'DELETE' THEN OLD.key ELSE NEW.key END;
  v_environment := CASE
    WHEN v_key = 'WECHAT_VIRTUAL_PAYMENT_PRODUCTION_SECRET_BUNDLE'
      THEN 'production'
    ELSE 'sandbox'
  END;
  PERFORM pg_advisory_xact_lock(
    hashtextextended('branding_virtual_payment_config', 20260801)
  );

  IF v_effective_changed AND EXISTS (
    SELECT 1
    FROM public.tenant_virtual_addon_orders AS orders
    WHERE orders.environment = v_environment
      AND orders.payment_status = 'pending'
      AND (
        orders.payment_expires_at > v_now
        OR orders.payment_request_claim_expires_at > v_now
        OR orders.payment_request_issued_at IS NOT NULL
      )
    LIMIT 1
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'BRANDING_VIRTUAL_PAYMENT_SECRET_ROTATION_PENDING_ORDERS';
  END IF;

  UPDATE public.platform_virtual_payment_products
  SET status = 'disabled',
      validation_status = 'pending',
      validated_at = NULL,
      version = version + 1
  WHERE environment = v_environment
    AND encrypted_secret_ref = v_key;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL
ON FUNCTION public.guard_branding_virtual_payment_secret_rotation()
FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS tr_system_settings_branding_virtual_secret_rotation
ON public.system_settings;
CREATE TRIGGER tr_system_settings_branding_virtual_secret_rotation
BEFORE INSERT OR UPDATE OR DELETE ON public.system_settings
FOR EACH ROW
EXECUTE FUNCTION public.guard_branding_virtual_payment_secret_rotation();

REVOKE ALL ON FUNCTION public.branding_create_virtual_addon_order(
  uuid, uuid, uuid, text, text, uuid
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.branding_create_virtual_addon_order(
  uuid, uuid, uuid, text, text, uuid
) TO service_role;

REVOKE ALL ON FUNCTION public.branding_claim_virtual_addon_payment_request(
  uuid, uuid, text, uuid
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.branding_claim_virtual_addon_payment_request(
  uuid, uuid, text, uuid
) TO service_role;

REVOKE ALL ON FUNCTION public.branding_finalize_virtual_addon_payment_request(
  uuid, uuid, text, uuid, uuid
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.branding_finalize_virtual_addon_payment_request(
  uuid, uuid, text, uuid, uuid
) TO service_role;

REVOKE ALL ON FUNCTION public.branding_release_virtual_addon_payment_request_claim(
  uuid, uuid, text, uuid, uuid
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.branding_release_virtual_addon_payment_request_claim(
  uuid, uuid, text, uuid, uuid
) TO service_role;

COMMENT ON FUNCTION public.branding_create_virtual_addon_order(
  uuid, uuid, uuid, text, text, uuid
) IS 'Creates one current production virtual order while preserving issued pending facts for reconciliation.';
COMMENT ON FUNCTION public.branding_claim_virtual_addon_payment_request(
  uuid, uuid, text, uuid
) IS 'Claims a 30-second server-side lease after entitlement and configuration revalidation.';
COMMENT ON FUNCTION public.branding_finalize_virtual_addon_payment_request(
  uuid, uuid, text, uuid, uuid
) IS 'Atomically records that a payment request was issued and consumes its claim lease.';
COMMENT ON FUNCTION public.guard_branding_virtual_payment_secret_rotation()
IS 'Guards both virtual-payment secret identities and disables the matching mapping on every allowed secret mutation.';

COMMIT;
