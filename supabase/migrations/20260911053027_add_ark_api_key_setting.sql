-- Add a secret slot only. Operators enter a fresh key through encrypted settings.
-- Never copy a credential from public provider metadata into this setting.
-- Rollback: disable the rendering feature; retain the setting and audit history.
BEGIN;

INSERT INTO public.system_settings (
  key, group_code, name, description, value_type, value_text,
  is_secret, status, tenant_id
)
SELECT
  'ARK_API_KEY', 'ai', '火山方舟接口密钥',
  '火山方舟图片生成和视觉理解接口密钥，加密存储。供应商密钥配置引用 ARK_API_KEY。',
  'string', NULL, true, 'active', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM public.system_settings
  WHERE key = 'ARK_API_KEY' AND tenant_id IS NULL
);

COMMIT;
