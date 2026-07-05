-- Extend platform WeChat Pay configuration from one row per provider to named profiles.

ALTER TABLE public.platform_payment_configs
  ADD COLUMN IF NOT EXISTS profile_code text NULL,
  ADD COLUMN IF NOT EXISTS sub_merchant_id text NULL,
  ADD COLUMN IF NOT EXISTS sub_app_id text NULL;

UPDATE public.platform_payment_configs
SET profile_code = 'platform_direct_recharge'
WHERE profile_code IS NULL;

ALTER TABLE public.platform_payment_configs
  ALTER COLUMN profile_code SET DEFAULT 'platform_direct_recharge',
  ALTER COLUMN profile_code SET NOT NULL;

ALTER TABLE public.platform_payment_configs
  DROP CONSTRAINT IF EXISTS platform_payment_configs_profile_code_check,
  ADD CONSTRAINT platform_payment_configs_profile_code_check
    CHECK (profile_code IN ('platform_direct_recharge', 'tenant_service_provider'));

ALTER TABLE public.platform_payment_configs
  DROP CONSTRAINT IF EXISTS platform_payment_configs_merchant_mode_check,
  ADD CONSTRAINT platform_payment_configs_merchant_mode_check
    CHECK (merchant_mode IN ('direct_merchant', 'service_provider_sub_merchant'));

DROP INDEX IF EXISTS public.platform_payment_configs_provider_unique_idx;

CREATE UNIQUE INDEX IF NOT EXISTS platform_payment_configs_provider_profile_unique_idx
ON public.platform_payment_configs(provider, profile_code);

CREATE INDEX IF NOT EXISTS platform_payment_configs_profile_status_idx
ON public.platform_payment_configs(provider, profile_code, status);

INSERT INTO public.system_settings (
  key,
  group_code,
  name,
  description,
  value_type,
  value_text,
  is_secret,
  status
)
SELECT
  'PLATFORM_WECHAT_PAY_SERVICE_PROVIDER_SECRET_BUNDLE',
  'payment',
  '平台微信支付服务商密钥包',
  '平台服务商微信支付 APIv3 使用的私钥、APIv3 Key 和微信支付公钥配置，按 JSON 加密存储。',
  'json',
  NULL,
  true,
  'active'
WHERE NOT EXISTS (
  SELECT 1
  FROM public.system_settings existing
  WHERE existing.tenant_id IS NULL
    AND existing.key = 'PLATFORM_WECHAT_PAY_SERVICE_PROVIDER_SECRET_BUNDLE'
);

UPDATE public.system_settings
SET
  group_code = 'payment',
  name = '平台微信支付服务商密钥包',
  description = '平台服务商微信支付 APIv3 使用的私钥、APIv3 Key 和微信支付公钥配置，按 JSON 加密存储。',
  value_type = 'json',
  is_secret = true,
  status = 'active',
  updated_at = now()
WHERE tenant_id IS NULL
  AND key = 'PLATFORM_WECHAT_PAY_SERVICE_PROVIDER_SECRET_BUNDLE';

COMMENT ON COLUMN public.platform_payment_configs.profile_code
IS '平台微信支付配置 profile。platform_direct_recharge 用于平台自有充值收款，tenant_service_provider 用于服务商代租户收款能力。';

COMMENT ON COLUMN public.platform_payment_configs.sub_merchant_id
IS '服务商模式下的子商户号。平台服务商 profile 一般不预填，租户开通后写入租户支付配置。';

COMMENT ON COLUMN public.platform_payment_configs.sub_app_id
IS '服务商模式下的子商户 AppID。使用服务商小程序发起支付时可为空。';
