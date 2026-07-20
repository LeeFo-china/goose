-- Bind platform payment validation to the exact opaque secret bundle revision.

ALTER TABLE public.platform_payment_configs
  ADD COLUMN IF NOT EXISTS secret_bundle_revision text NULL;

ALTER TABLE public.platform_payment_configs
  DROP CONSTRAINT IF EXISTS platform_payment_configs_secret_bundle_revision_not_blank;

ALTER TABLE public.platform_payment_configs
  ADD CONSTRAINT platform_payment_configs_secret_bundle_revision_not_blank
    CHECK (secret_bundle_revision IS NULL
      OR btrim(secret_bundle_revision) <> '');

COMMENT ON COLUMN public.platform_payment_configs.secret_bundle_revision
IS 'An opaque revision binding validation to a secret bundle version; never secret material.';

-- Keep secret revision rotation in the same row-lock protocol as recharge
-- order creation. A pending order wins the race by blocking the rotation;
-- a completed rotation wins by advancing the creator CAS version.
CREATE OR REPLACE FUNCTION public.guard_pending_recharge_payment_config()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF ROW(
    OLD.merchant_mode,
    OLD.merchant_id,
    OLD.sub_merchant_id,
    OLD.app_id,
    OLD.sub_app_id,
    OLD.serial_no,
    OLD.encrypted_config_ref,
    OLD.secret_bundle_revision
  ) IS DISTINCT FROM ROW(
    NEW.merchant_mode,
    NEW.merchant_id,
    NEW.sub_merchant_id,
    NEW.app_id,
    NEW.sub_app_id,
    NEW.serial_no,
    NEW.encrypted_config_ref,
    NEW.secret_bundle_revision
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM public.tenant_credit_orders AS orders
      WHERE orders.payment_config_id = OLD.id
        AND orders.channel = 'wechat_pay'
        AND orders.status = 'pending'
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'PLATFORM_PAYMENT_CONFIG_PENDING_RECHARGE_ORDERS';
    END IF;

    NEW.recharge_guard_version := OLD.recharge_guard_version + 1;
  ELSE
    NEW.recharge_guard_version := OLD.recharge_guard_version;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_pending_recharge_payment_config()
FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_pending_recharge_payment_config()
FROM anon;
REVOKE ALL ON FUNCTION public.guard_pending_recharge_payment_config()
FROM authenticated;

DROP TRIGGER IF EXISTS tr_guard_pending_recharge_payment_config
ON public.platform_payment_configs;

CREATE TRIGGER tr_guard_pending_recharge_payment_config
BEFORE UPDATE OF merchant_mode, merchant_id, sub_merchant_id, app_id,
  sub_app_id, serial_no, encrypted_config_ref, secret_bundle_revision
ON public.platform_payment_configs
FOR EACH ROW
EXECUTE FUNCTION public.guard_pending_recharge_payment_config();

CREATE OR REPLACE FUNCTION public.billing_create_pending_wechat_recharge_order(
  p_tenant_id uuid,
  p_order_no text,
  p_out_trade_no text,
  p_idempotency_key text,
  p_package_code text,
  p_credits bigint,
  p_bonus_credits bigint,
  p_amount_fen integer,
  p_created_by uuid,
  p_payment_config_id uuid,
  p_expected_guard_version bigint,
  p_payment_expires_at timestamptz,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS public.tenant_credit_orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_config public.platform_payment_configs%ROWTYPE;
  v_order public.tenant_credit_orders%ROWTYPE;
BEGIN
  SELECT config.*
  INTO v_config
  FROM public.platform_payment_configs AS config
  WHERE config.id = p_payment_config_id
  FOR UPDATE;

  IF NOT FOUND
    OR v_config.recharge_guard_version IS DISTINCT FROM
      p_expected_guard_version
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'BILLING_RECHARGE_PAYMENT_CONFIG_VERSION_CHANGED';
  END IF;

  IF v_config.provider <> 'wechat_pay'
    OR v_config.profile_code <> 'platform_direct_recharge'
    OR v_config.merchant_mode <> 'direct_merchant'
    OR v_config.status <> 'active'
    OR v_config.validation_status <> 'valid'
    OR NOT ('tenant_recharge' = ANY(v_config.enabled_channels))
    OR v_config.merchant_id IS NULL
    OR v_config.app_id IS NULL
    OR v_config.encrypted_config_ref IS NULL
    OR nullif(btrim(v_config.secret_bundle_revision), '') IS NULL
    OR v_config.serial_no IS NULL
    OR v_config.notify_url IS NULL
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'BILLING_RECHARGE_PAYMENT_CONFIG_NOT_READY';
  END IF;

  INSERT INTO public.tenant_credit_orders (
    tenant_id,
    order_no,
    out_trade_no,
    idempotency_key,
    package_code,
    credits,
    bonus_credits,
    amount_fen,
    channel,
    status,
    created_by,
    payment_config_id,
    payment_expires_at,
    metadata
  ) VALUES (
    p_tenant_id,
    p_order_no,
    p_out_trade_no,
    p_idempotency_key,
    p_package_code,
    p_credits,
    p_bonus_credits,
    p_amount_fen,
    'wechat_pay',
    'pending',
    p_created_by,
    p_payment_config_id,
    p_payment_expires_at,
    coalesce(p_metadata, '{}'::jsonb)
  )
  RETURNING * INTO v_order;

  RETURN v_order;
END;
$$;

REVOKE ALL ON FUNCTION public.billing_create_pending_wechat_recharge_order(
  uuid, text, text, text, text, bigint, bigint, integer, uuid, uuid,
  bigint, timestamptz, jsonb
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.billing_create_pending_wechat_recharge_order(
  uuid, text, text, text, text, bigint, bigint, integer, uuid, uuid,
  bigint, timestamptz, jsonb
) FROM anon;
REVOKE ALL ON FUNCTION public.billing_create_pending_wechat_recharge_order(
  uuid, text, text, text, text, bigint, bigint, integer, uuid, uuid,
  bigint, timestamptz, jsonb
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.billing_create_pending_wechat_recharge_order(
  uuid, text, text, text, text, bigint, bigint, integer, uuid, uuid,
  bigint, timestamptz, jsonb
) TO service_role;

COMMENT ON FUNCTION public.guard_pending_recharge_payment_config()
IS 'Serializes recharge creation with merchant identity, secret references, and secret bundle revision rotation.';
