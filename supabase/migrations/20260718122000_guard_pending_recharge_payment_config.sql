-- Keep pending WeChat recharge orders reconcilable while allowing operational
-- status/channel changes that do not alter merchant identity or credentials.

CREATE INDEX IF NOT EXISTS tenant_credit_orders_pending_wechat_payment_config_idx
ON public.tenant_credit_orders(payment_config_id)
WHERE channel = 'wechat_pay'
  AND status = 'pending';

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
  ) AND EXISTS (
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
  sub_app_id, serial_no, encrypted_config_ref
ON public.platform_payment_configs
FOR EACH ROW
EXECUTE FUNCTION public.guard_pending_recharge_payment_config();

CREATE OR REPLACE FUNCTION public.guard_pending_recharge_payment_secret()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.value_text IS DISTINCT FROM NEW.value_text
    AND NEW.tenant_id IS NULL
    AND EXISTS (
      SELECT 1
      FROM public.platform_payment_configs AS config
      JOIN public.tenant_credit_orders AS orders
        ON orders.payment_config_id = config.id
      WHERE config.provider = 'wechat_pay'
        AND config.encrypted_config_ref = ANY (ARRAY[
          NEW.key,
          'secret://' || NEW.key,
          'setting://' || NEW.key
        ])
        AND orders.channel = 'wechat_pay'
        AND orders.status = 'pending'
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'PLATFORM_PAYMENT_CONFIG_PENDING_RECHARGE_ORDERS';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_pending_recharge_payment_secret()
FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_pending_recharge_payment_secret()
FROM anon;
REVOKE ALL ON FUNCTION public.guard_pending_recharge_payment_secret()
FROM authenticated;

DROP TRIGGER IF EXISTS tr_guard_pending_recharge_payment_secret
ON public.system_settings;

CREATE TRIGGER tr_guard_pending_recharge_payment_secret
BEFORE UPDATE OF value_text
ON public.system_settings
FOR EACH ROW
EXECUTE FUNCTION public.guard_pending_recharge_payment_secret();

COMMENT ON FUNCTION public.guard_pending_recharge_payment_config()
IS '阻止待支付微信充值订单引用的商户身份或凭据配置被原地修改；状态和渠道等非关键字段仍可调整。';

COMMENT ON FUNCTION public.guard_pending_recharge_payment_secret()
IS '阻止待支付微信充值订单引用的平台密钥配置值被原地修改。';
