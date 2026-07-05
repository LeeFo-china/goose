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
  'PLATFORM_WECHAT_PAY_SECRET_BUNDLE',
  'payment',
  '平台微信支付密钥包',
  '平台独立微信支付 JSAPI 使用的私钥、APIv3 Key 和微信支付公钥配置，按 JSON 加密存储。',
  'json',
  NULL,
  true,
  'active'
WHERE NOT EXISTS (
  SELECT 1
  FROM public.system_settings existing
  WHERE existing.tenant_id IS NULL
    AND existing.key = 'PLATFORM_WECHAT_PAY_SECRET_BUNDLE'
);

UPDATE public.system_settings
SET
  group_code = 'payment',
  name = '平台微信支付密钥包',
  description = '平台独立微信支付 JSAPI 使用的私钥、APIv3 Key 和微信支付公钥配置，按 JSON 加密存储。',
  value_type = 'json',
  is_secret = true,
  status = 'active',
  updated_at = now()
WHERE tenant_id IS NULL
  AND key = 'PLATFORM_WECHAT_PAY_SECRET_BUNDLE';
