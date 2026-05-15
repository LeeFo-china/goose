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
  'PLATFORM_COS_UPLOAD_USE_ACCELERATE',
  'storage',
  'COS 上传使用全球加速',
  '开启后直传上传 URL 和后端兜底中转上传都使用腾讯云 COS 全球加速域名。需先在腾讯云 COS bucket 启用全球加速并配置 CORS。',
  'boolean',
  'false',
  false,
  'active'
WHERE NOT EXISTS (
  SELECT 1
  FROM public.system_settings existing
  WHERE existing.tenant_id IS NULL
    AND existing.key = 'PLATFORM_COS_UPLOAD_USE_ACCELERATE'
);

UPDATE public.system_settings
SET
  group_code = 'storage',
  name = 'COS 上传使用全球加速',
  description = '开启后直传上传 URL 和后端兜底中转上传都使用腾讯云 COS 全球加速域名。需先在腾讯云 COS bucket 启用全球加速并配置 CORS。',
  value_type = 'boolean',
  is_secret = false,
  status = 'active',
  updated_at = now()
WHERE tenant_id IS NULL
  AND key = 'PLATFORM_COS_UPLOAD_USE_ACCELERATE';
