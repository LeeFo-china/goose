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
  'PLATFORM_FILE_ACCESS_POLICY',
  'storage',
  '平台文件访问策略',
  '按业务场景控制文件访问模式和签名 URL 有效期。access_mode 支持 public/signed，signed_url_ttl_seconds 单位秒。',
  'json',
  '{
    "default": {
      "access_mode": "signed",
      "signed_url_ttl_seconds": 1800
    },
    "scenes": {
      "project_log": {
        "access_mode": "signed",
        "signed_url_ttl_seconds": 1800
      },
      "project_log_comment": {
        "access_mode": "signed",
        "signed_url_ttl_seconds": 1800
      },
      "project_acceptance": {
        "access_mode": "signed",
        "signed_url_ttl_seconds": 1800
      },
      "customer_follow_up_comment": {
        "access_mode": "signed",
        "signed_url_ttl_seconds": 1800
      },
      "customer_douyin_screenshot": {
        "access_mode": "signed",
        "signed_url_ttl_seconds": 1800
      },
      "expense_request": {
        "access_mode": "signed",
        "signed_url_ttl_seconds": 600
      },
      "expense_request_settlement": {
        "access_mode": "signed",
        "signed_url_ttl_seconds": 600
      },
      "referral_payment": {
        "access_mode": "signed",
        "signed_url_ttl_seconds": 600
      },
      "employee_avatar": {
        "access_mode": "signed",
        "signed_url_ttl_seconds": 21600
      },
      "customer_avatar": {
        "access_mode": "signed",
        "signed_url_ttl_seconds": 21600
      },
      "h5_marketing_page": {
        "access_mode": "public",
        "signed_url_ttl_seconds": 0
      },
      "panorama_tiles": {
        "access_mode": "public",
        "signed_url_ttl_seconds": 0
      }
    }
  }',
  false,
  'active'
WHERE NOT EXISTS (
  SELECT 1
  FROM public.system_settings existing
  WHERE existing.tenant_id IS NULL
    AND existing.key = 'PLATFORM_FILE_ACCESS_POLICY'
);

UPDATE public.system_settings
SET
  group_code = 'storage',
  name = '平台文件访问策略',
  description = '按业务场景控制文件访问模式和签名 URL 有效期。access_mode 支持 public/signed，signed_url_ttl_seconds 单位秒。',
  value_type = 'json',
  is_secret = false,
  status = 'active',
  updated_at = now()
WHERE tenant_id IS NULL
  AND key = 'PLATFORM_FILE_ACCESS_POLICY';
