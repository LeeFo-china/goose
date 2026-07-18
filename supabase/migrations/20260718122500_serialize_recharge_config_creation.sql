-- Serialize pending recharge creation with merchant identity and secret rotation.

ALTER TABLE public.platform_payment_configs
ADD COLUMN IF NOT EXISTS recharge_guard_version bigint NOT NULL DEFAULT 1;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'platform_payment_configs_recharge_guard_version_check'
      AND conrelid = 'public.platform_payment_configs'::regclass
  ) THEN
    ALTER TABLE public.platform_payment_configs
      ADD CONSTRAINT platform_payment_configs_recharge_guard_version_check
      CHECK (recharge_guard_version > 0);
  END IF;
END;
$$;

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
    OLD.encrypted_config_ref
  ) IS DISTINCT FROM ROW(
    NEW.merchant_mode,
    NEW.merchant_id,
    NEW.sub_merchant_id,
    NEW.app_id,
    NEW.sub_app_id,
    NEW.serial_no,
    NEW.encrypted_config_ref
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

CREATE OR REPLACE FUNCTION public.guard_pending_recharge_payment_config_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
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

  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_pending_recharge_payment_config_delete()
FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_pending_recharge_payment_config_delete()
FROM anon;
REVOKE ALL ON FUNCTION public.guard_pending_recharge_payment_config_delete()
FROM authenticated;

DROP TRIGGER IF EXISTS tr_guard_pending_recharge_payment_config_delete
ON public.platform_payment_configs;

CREATE TRIGGER tr_guard_pending_recharge_payment_config_delete
BEFORE DELETE
ON public.platform_payment_configs
FOR EACH ROW
EXECUTE FUNCTION public.guard_pending_recharge_payment_config_delete();

CREATE OR REPLACE FUNCTION public.guard_pending_recharge_payment_secret()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_config_id uuid;
  v_references text[] := ARRAY[]::text[];
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.tenant_id IS NOT NULL THEN
      RETURN OLD;
    END IF;
    v_references := ARRAY[
      OLD.key,
      'secret://' || OLD.key,
      'setting://' || OLD.key
    ];
  ELSE
    IF ROW(OLD.value_text, OLD.key, OLD.tenant_id)
      IS NOT DISTINCT FROM ROW(NEW.value_text, NEW.key, NEW.tenant_id)
    THEN
      RETURN NEW;
    END IF;

    IF OLD.tenant_id IS NULL THEN
      v_references := v_references || ARRAY[
        OLD.key,
        'secret://' || OLD.key,
        'setting://' || OLD.key
      ];
    END IF;
    IF NEW.tenant_id IS NULL THEN
      v_references := v_references || ARRAY[
        NEW.key,
        'secret://' || NEW.key,
        'setting://' || NEW.key
      ];
    END IF;
  END IF;

  FOR v_config_id IN
    SELECT config.id
    FROM public.platform_payment_configs AS config
    WHERE config.provider = 'wechat_pay'
      AND config.encrypted_config_ref = ANY(v_references)
    ORDER BY config.id
    FOR UPDATE OF config
  LOOP
    IF EXISTS (
      SELECT 1
      FROM public.tenant_credit_orders AS orders
      WHERE orders.payment_config_id = v_config_id
        AND orders.channel = 'wechat_pay'
        AND orders.status = 'pending'
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'PLATFORM_PAYMENT_CONFIG_PENDING_RECHARGE_ORDERS';
    END IF;

    UPDATE public.platform_payment_configs AS config
    SET recharge_guard_version = config.recharge_guard_version + 1
    WHERE config.id = v_config_id;
  END LOOP;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_guard_pending_recharge_payment_secret
ON public.system_settings;

CREATE TRIGGER tr_guard_pending_recharge_payment_secret
BEFORE UPDATE OF value_text, key, tenant_id
ON public.system_settings
FOR EACH ROW
EXECUTE FUNCTION public.guard_pending_recharge_payment_secret();

DROP TRIGGER IF EXISTS tr_guard_pending_recharge_payment_secret_delete
ON public.system_settings;

CREATE TRIGGER tr_guard_pending_recharge_payment_secret_delete
BEFORE DELETE
ON public.system_settings
FOR EACH ROW
EXECUTE FUNCTION public.guard_pending_recharge_payment_secret();

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
    OR NOT ('tenant_recharge' = ANY(v_config.enabled_channels))
    OR v_config.merchant_id IS NULL
    OR v_config.app_id IS NULL
    OR v_config.encrypted_config_ref IS NULL
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

COMMENT ON COLUMN public.platform_payment_configs.recharge_guard_version
IS '充值建单与关键配置/平台密钥变更的数据库 CAS 版本。';

COMMENT ON FUNCTION public.billing_create_pending_wechat_recharge_order(
  uuid, text, text, text, text, bigint, bigint, integer, uuid, uuid,
  bigint, timestamptz, jsonb
)
IS '持有支付配置行锁并校验版本后原子创建待支付微信充值订单。';
