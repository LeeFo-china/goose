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
SELECT *
FROM (
  VALUES
    (
      'PLATFORM_STORAGE_PROVIDER',
      'storage',
      '平台存储提供商',
      '平台通用图片和附件上传的存储提供商。supabase_storage 为旧链路，tencent_cos 为腾讯云 COS。',
      'string',
      'supabase_storage',
      false,
      'active'
    ),
    (
      'TENCENT_COS_SECRET_ID',
      'storage',
      '腾讯云 COS SecretId',
      '腾讯云 COS 专用 SecretId，加密存储。与物联网视频、ASR 等腾讯云密钥解耦。',
      'string',
      NULL,
      true,
      'active'
    ),
    (
      'TENCENT_COS_SECRET_KEY',
      'storage',
      '腾讯云 COS SecretKey',
      '腾讯云 COS 专用 SecretKey，加密存储。与物联网视频、ASR 等腾讯云密钥解耦。',
      'string',
      NULL,
      true,
      'active'
    ),
    (
      'PLATFORM_COS_BUCKET',
      'storage',
      '平台 COS Bucket',
      '平台通用图片和附件存储使用的腾讯云 COS bucket 名称，需包含 APPID 后缀。',
      'string',
      NULL,
      false,
      'active'
    ),
    (
      'PLATFORM_COS_REGION',
      'storage',
      '平台 COS 区域',
      '平台 COS bucket 所在区域，例如 ap-guangzhou。',
      'string',
      'ap-guangzhou',
      false,
      'active'
    ),
    (
      'PLATFORM_COS_PUBLIC_BASE_URL',
      'storage',
      '平台 COS/CDN 访问域名',
      '平台文件公网或 CDN 访问域名，例如 https://assets.goodcms.cn。为空时后端返回 COS 签名 URL。',
      'string',
      NULL,
      false,
      'active'
    ),
    (
      'PLATFORM_COS_SIGNED_URL_TTL_SECONDS',
      'storage',
      'COS 签名 URL 有效期',
      '未配置公网/CDN 域名时，后端生成 COS 签名 URL 的有效期，单位秒。',
      'number',
      '900',
      false,
      'active'
    )
) AS incoming(
  key,
  group_code,
  name,
  description,
  value_type,
  value_text,
  is_secret,
  status
)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.system_settings existing
  WHERE existing.tenant_id IS NULL
    AND existing.key = incoming.key
);

UPDATE public.system_settings existing
SET
  group_code = incoming.group_code,
  name = incoming.name,
  description = incoming.description,
  value_type = incoming.value_type,
  is_secret = incoming.is_secret,
  status = incoming.status,
  updated_at = now()
FROM (
  VALUES
    ('PLATFORM_STORAGE_PROVIDER', 'storage', '平台存储提供商', '平台通用图片和附件上传的存储提供商。supabase_storage 为旧链路，tencent_cos 为腾讯云 COS。', 'string', false, 'active'),
    ('TENCENT_COS_SECRET_ID', 'storage', '腾讯云 COS SecretId', '腾讯云 COS 专用 SecretId，加密存储。与物联网视频、ASR 等腾讯云密钥解耦。', 'string', true, 'active'),
    ('TENCENT_COS_SECRET_KEY', 'storage', '腾讯云 COS SecretKey', '腾讯云 COS 专用 SecretKey，加密存储。与物联网视频、ASR 等腾讯云密钥解耦。', 'string', true, 'active'),
    ('PLATFORM_COS_BUCKET', 'storage', '平台 COS Bucket', '平台通用图片和附件存储使用的腾讯云 COS bucket 名称，需包含 APPID 后缀。', 'string', false, 'active'),
    ('PLATFORM_COS_REGION', 'storage', '平台 COS 区域', '平台 COS bucket 所在区域，例如 ap-guangzhou。', 'string', false, 'active'),
    ('PLATFORM_COS_PUBLIC_BASE_URL', 'storage', '平台 COS/CDN 访问域名', '平台文件公网或 CDN 访问域名，例如 https://assets.goodcms.cn。为空时后端返回 COS 签名 URL。', 'string', false, 'active'),
    ('PLATFORM_COS_SIGNED_URL_TTL_SECONDS', 'storage', 'COS 签名 URL 有效期', '未配置公网/CDN 域名时，后端生成 COS 签名 URL 的有效期，单位秒。', 'number', false, 'active')
) AS incoming(
  key,
  group_code,
  name,
  description,
  value_type,
  is_secret,
  status
)
WHERE existing.tenant_id IS NULL
  AND existing.key = incoming.key;
