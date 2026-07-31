-- Rollback: use a forward migration to restore the previous order-creation
-- function and remove the secret-rotation trigger only after all open virtual
-- payment windows have ended. Historical closed orders must remain unchanged;
-- never reopen orders closed by this migration's expiry handling.

BEGIN;

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
  v_now timestamptz;
  v_order_no text;
  v_out_trade_no text;
BEGIN
  IF p_tenant_id IS NULL
     OR p_idempotency_key IS NULL
     OR p_virtual_product_id IS NULL
     OR p_created_by IS NULL
     OR p_requested_platform IS NULL
     OR p_requested_platform NOT IN (
       'android',
       'harmony',
       'windows',
       'ios',
       'unknown'
     )
     OR p_payer_openid IS NULL
     OR btrim(p_payer_openid) = ''
     OR char_length(p_payer_openid) > 128
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'BRANDING_VIRTUAL_ORDER_INPUT_INVALID';
  END IF;

  SELECT addon_product.*
  INTO v_product
  FROM public.platform_addon_products AS addon_product
  WHERE addon_product.code = 'custom_support_branding_annual'
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'BRANDING_VIRTUAL_PRODUCT_NOT_FOUND';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      p_tenant_id::text || ':' || v_product.code,
      20260731
    )
  );

  v_now := clock_timestamp();

  UPDATE public.tenant_virtual_addon_orders AS orders
  SET
    payment_status = 'closed',
    failure_code = 'BRANDING_VIRTUAL_ORDER_EXPIRED',
    failure_message = '虚拟支付订单支付时间已结束'
  WHERE orders.tenant_id = p_tenant_id
    AND orders.product_code = v_product.code
    AND orders.payment_status = 'pending'
    AND orders.payment_expires_at <= v_now;

  SELECT orders.*
  INTO v_order
  FROM public.tenant_virtual_addon_orders AS orders
  WHERE orders.tenant_id = p_tenant_id
    AND orders.idempotency_key = p_idempotency_key
  FOR UPDATE;

  IF FOUND THEN
    IF v_order.payer_openid IS DISTINCT FROM p_payer_openid THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'BRANDING_VIRTUAL_ORDER_PAYER_MISMATCH';
    END IF;

    IF v_order.created_by IS DISTINCT FROM p_created_by THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'BRANDING_VIRTUAL_ORDER_ACTOR_MISMATCH';
    END IF;

    RETURN v_order;
  END IF;

  SELECT orders.*
  INTO v_order
  FROM public.tenant_virtual_addon_orders AS orders
  WHERE orders.tenant_id = p_tenant_id
    AND orders.product_code = v_product.code
    AND orders.payment_status = 'pending'
    AND orders.payment_expires_at > v_now
  FOR UPDATE;

  IF FOUND THEN
    IF v_order.payer_openid IS DISTINCT FROM p_payer_openid THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'BRANDING_VIRTUAL_ORDER_PAYER_MISMATCH';
    END IF;

    IF v_order.created_by IS DISTINCT FROM p_created_by THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'BRANDING_VIRTUAL_ORDER_ACTOR_MISMATCH';
    END IF;

    RETURN v_order;
  END IF;

  IF v_product.purchase_mode <> 'wechat_virtual' THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'BRANDING_VIRTUAL_PURCHASE_MODE_UNAVAILABLE';
  END IF;

  IF v_product.enabled = false OR v_product.amount_fen IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'BRANDING_VIRTUAL_PRODUCT_DISABLED';
  END IF;

  SELECT virtual_product.*
  INTO v_virtual_product
  FROM public.platform_virtual_payment_products AS virtual_product
  WHERE virtual_product.id = p_virtual_product_id
    AND virtual_product.addon_product_id = v_product.id
    AND virtual_product.provider = 'wechat_virtual'
    AND virtual_product.environment = 'production'
    AND virtual_product.status = 'active'
    AND virtual_product.validation_status = 'valid'
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'BRANDING_VIRTUAL_PRODUCT_MAPPING_UNAVAILABLE';
  END IF;

  IF v_virtual_product.expected_amount_fen IS DISTINCT FROM v_product.amount_fen
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'BRANDING_VIRTUAL_PRODUCT_AMOUNT_MISMATCH';
  END IF;

  IF v_product.amount_fen < 100 THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'BRANDING_VIRTUAL_PRODUCT_AMOUNT_TOO_LOW';
  END IF;

  v_order_no :=
    'BVO-' || to_char(v_now, 'YYYYMMDDHH24MISSMS') || '-' ||
    upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
  v_out_trade_no :=
    'BV' || to_char(v_now, 'YYYYMMDDHH24MISS') ||
    upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16));

  INSERT INTO public.tenant_virtual_addon_orders (
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
    environment,
    offer_id,
    provider_product_id,
    requested_platform,
    payer_openid,
    payment_status,
    fulfillment_status,
    refund_status,
    config_version,
    secret_revision,
    payment_expires_at,
    created_by,
    created_at,
    updated_at
  )
  VALUES (
    p_tenant_id,
    v_order_no,
    v_out_trade_no,
    p_idempotency_key,
    v_product.id,
    v_product.code,
    v_product.entitlement_code,
    v_product.name,
    v_product.amount_fen,
    v_product.term_years,
    v_product.purchase_notes,
    v_product.refund_policy,
    v_virtual_product.environment,
    v_virtual_product.offer_id,
    v_virtual_product.provider_product_id,
    p_requested_platform,
    p_payer_openid,
    'pending',
    'pending',
    'none',
    v_virtual_product.version,
    v_virtual_product.secret_revision,
    v_now + interval '5 minutes',
    p_created_by,
    v_now,
    v_now
  )
  ON CONFLICT DO NOTHING
  RETURNING tenant_virtual_addon_orders.* INTO v_order;

  IF FOUND THEN
    RETURN v_order;
  END IF;

  SELECT orders.*
  INTO v_order
  FROM public.tenant_virtual_addon_orders AS orders
  WHERE orders.tenant_id = p_tenant_id
    AND (
      orders.idempotency_key = p_idempotency_key
      OR (
        orders.product_code = v_product.code
        AND orders.payment_status = 'pending'
        AND orders.payment_expires_at > v_now
      )
    )
  ORDER BY
    (orders.idempotency_key = p_idempotency_key) DESC,
    orders.created_at DESC,
    orders.id DESC
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    IF v_order.payer_openid IS DISTINCT FROM p_payer_openid THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'BRANDING_VIRTUAL_ORDER_PAYER_MISMATCH';
    END IF;

    IF v_order.created_by IS DISTINCT FROM p_created_by THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'BRANDING_VIRTUAL_ORDER_ACTOR_MISMATCH';
    END IF;

    RETURN v_order;
  END IF;

  RAISE EXCEPTION USING
    ERRCODE = 'P0001',
    MESSAGE = 'BRANDING_VIRTUAL_ORDER_CONFLICT';
END;
$$;

REVOKE ALL ON FUNCTION public.branding_create_virtual_addon_order(
  uuid, uuid, uuid, text, text, uuid
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.branding_create_virtual_addon_order(
  uuid, uuid, uuid, text, text, uuid
) TO service_role;

CREATE OR REPLACE FUNCTION public.guard_branding_virtual_payment_secret_rotation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_environment text;
BEGIN
  IF OLD.tenant_id IS NOT NULL THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.key = 'WECHAT_VIRTUAL_PAYMENT_SANDBOX_SECRET_BUNDLE' THEN
    v_environment := 'sandbox';
  ELSIF OLD.key = 'WECHAT_VIRTUAL_PAYMENT_PRODUCTION_SECRET_BUNDLE' THEN
    v_environment := 'production';
  ELSE
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.value_text IS NOT DISTINCT FROM NEW.value_text
     AND OLD.status IS NOT DISTINCT FROM NEW.status
  THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.tenant_virtual_addon_orders AS orders
    WHERE orders.environment = v_environment
      AND orders.payment_status = 'pending'
      AND orders.payment_expires_at > clock_timestamp()
    LIMIT 1
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'BRANDING_VIRTUAL_PAYMENT_SECRET_ROTATION_PENDING_ORDERS';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL
ON FUNCTION public.guard_branding_virtual_payment_secret_rotation()
FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS tr_system_settings_branding_virtual_secret_rotation
ON public.system_settings;
CREATE TRIGGER tr_system_settings_branding_virtual_secret_rotation
BEFORE UPDATE OF value_text, status OR DELETE
ON public.system_settings
FOR EACH ROW
EXECUTE FUNCTION public.guard_branding_virtual_payment_secret_rotation();

COMMENT ON FUNCTION public.branding_create_virtual_addon_order(
  uuid, uuid, uuid, text, text, uuid
)
IS 'Atomically closes expired pending facts, preserves same-key truth, and creates or reuses one open branding virtual-payment order.';
COMMENT ON FUNCTION public.guard_branding_virtual_payment_secret_rotation()
IS 'Prevents an environment AppKey from changing while an order can still be signed with its snapshotted revision.';

COMMIT;
