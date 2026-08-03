-- Extend platform payment pending-order guards to platform service orders.
-- Rollback: create a forward migration restoring the previous guard function
-- body if platform service orders are decommissioned.

BEGIN;

CREATE INDEX IF NOT EXISTS tenant_service_orders_pending_payment_config_idx
ON public.tenant_service_orders(payment_config_id)
WHERE payment_status = 'pending';

CREATE OR REPLACE FUNCTION public.guard_pending_recharge_payment_config()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF ROW(
    OLD.provider,
    OLD.profile_code,
    OLD.principal_type,
    OLD.merchant_mode,
    OLD.merchant_id,
    OLD.sub_merchant_id,
    OLD.app_id,
    OLD.sub_app_id,
    OLD.serial_no,
    OLD.encrypted_config_ref,
    OLD.secret_bundle_revision,
    OLD.notify_url,
    OLD.enabled_channels,
    OLD.status,
    OLD.validation_status,
    OLD.last_validated_at
  ) IS DISTINCT FROM ROW(
    NEW.provider,
    NEW.profile_code,
    NEW.principal_type,
    NEW.merchant_mode,
    NEW.merchant_id,
    NEW.sub_merchant_id,
    NEW.app_id,
    NEW.sub_app_id,
    NEW.serial_no,
    NEW.encrypted_config_ref,
    NEW.secret_bundle_revision,
    NEW.notify_url,
    NEW.enabled_channels,
    NEW.status,
    NEW.validation_status,
    NEW.last_validated_at
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM public.tenant_credit_orders AS orders
      WHERE orders.payment_config_id = OLD.id
        AND orders.channel = 'wechat_pay'
        AND orders.status = 'pending'
    ) OR EXISTS (
      SELECT 1
      FROM public.tenant_payment_configs AS tenant_config
      JOIN public.wechat_payment_orders AS project_order
        ON project_order.payment_config_id = tenant_config.id
      WHERE tenant_config.platform_payment_config_id = OLD.id
        AND project_order.status = 'pending'
    ) OR EXISTS (
      SELECT 1
      FROM public.tenant_addon_orders AS addon_order
      WHERE addon_order.payment_config_id = OLD.id
        AND addon_order.channel = 'wechat_pay'
        AND addon_order.status = 'pending'
    ) OR EXISTS (
      SELECT 1
      FROM public.tenant_service_orders AS service_order
      WHERE service_order.payment_config_id = OLD.id
        AND service_order.payment_status = 'pending'
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'PLATFORM_PAYMENT_CONFIG_PENDING_ORDERS';
    END IF;

    NEW.recharge_guard_version := OLD.recharge_guard_version + 1;
  ELSE
    NEW.recharge_guard_version := OLD.recharge_guard_version;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_pending_recharge_payment_secret()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_config_id uuid;
BEGIN
  IF OLD.value_text IS DISTINCT FROM NEW.value_text
    AND NEW.tenant_id IS NULL
  THEN
    SELECT config.id
    INTO v_config_id
    FROM public.platform_payment_configs AS config
    WHERE config.provider = 'wechat_pay'
      AND config.encrypted_config_ref = ANY (ARRAY[
        NEW.key,
        'secret://' || NEW.key,
        'setting://' || NEW.key
      ])
    LIMIT 1;

    IF v_config_id IS NOT NULL AND (
      EXISTS (
        SELECT 1
        FROM public.tenant_credit_orders AS recharge_order
        WHERE recharge_order.payment_config_id = v_config_id
          AND recharge_order.channel = 'wechat_pay'
          AND recharge_order.status = 'pending'
      ) OR EXISTS (
        SELECT 1
        FROM public.tenant_payment_configs AS tenant_config
        JOIN public.wechat_payment_orders AS project_order
          ON project_order.payment_config_id = tenant_config.id
        WHERE tenant_config.platform_payment_config_id = v_config_id
          AND project_order.status = 'pending'
      ) OR EXISTS (
        SELECT 1
        FROM public.tenant_addon_orders AS addon_order
        WHERE addon_order.payment_config_id = v_config_id
          AND addon_order.channel = 'wechat_pay'
          AND addon_order.status = 'pending'
      ) OR EXISTS (
        SELECT 1
        FROM public.tenant_service_orders AS service_order
        WHERE service_order.payment_config_id = v_config_id
          AND service_order.payment_status = 'pending'
      )
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'PLATFORM_PAYMENT_CONFIG_PENDING_ORDERS';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.guard_pending_recharge_payment_config()
IS '阻止待支付平台普通支付订单引用的商户身份、凭据、渠道或校验状态被原地修改。';

COMMENT ON FUNCTION public.guard_pending_recharge_payment_secret()
IS '阻止待支付平台普通支付订单引用的平台密钥配置值被原地修改。';

COMMIT;
