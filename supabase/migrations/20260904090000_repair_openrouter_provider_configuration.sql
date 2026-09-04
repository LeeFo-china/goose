-- Rollback: use a reviewed forward migration to restore provider metadata.
-- Do not move the secret back into ai_providers after this forward migration.

BEGIN;

INSERT INTO public.system_settings (
  key,
  group_code,
  name,
  description,
  value_type,
  value_text,
  is_secret,
  status,
  tenant_id
)
SELECT
  'OPENROUTER_API_KEY',
  'ai',
  'OpenRouter 接口密钥',
  'OpenRouter 模型目录同步和模型调用使用的接口密钥，加密存储。',
  'string',
  (
    SELECT provider.api_key_setting_key
    FROM public.ai_providers AS provider
    WHERE provider.code = 'openrouter'
      AND provider.api_key_setting_key ~* '^(sk-|sk_|bearer )'
    LIMIT 1
  ),
  true,
  'active',
  NULL
WHERE NOT EXISTS (
  SELECT 1
  FROM public.system_settings AS setting
  WHERE setting.key = 'OPENROUTER_API_KEY'
    AND setting.tenant_id IS NULL
);

UPDATE public.system_settings AS setting
SET
  group_code = 'ai',
  name = 'OpenRouter 接口密钥',
  description = 'OpenRouter 模型目录同步和模型调用使用的接口密钥，加密存储。',
  value_type = 'string',
  is_secret = true,
  status = 'active'
WHERE setting.key = 'OPENROUTER_API_KEY'
  AND setting.tenant_id IS NULL;

UPDATE public.system_settings AS setting
SET value_text = (
  SELECT provider.api_key_setting_key
  FROM public.ai_providers AS provider
  WHERE provider.code = 'openrouter'
    AND provider.api_key_setting_key ~* '^(sk-|sk_|bearer )'
  LIMIT 1
)
WHERE setting.key = 'OPENROUTER_API_KEY'
  AND setting.tenant_id IS NULL
  AND (setting.value_text IS NULL OR btrim(setting.value_text) = '')
  AND EXISTS (
    SELECT 1
    FROM public.ai_providers AS provider
    WHERE provider.code = 'openrouter'
      AND provider.api_key_setting_key ~* '^(sk-|sk_|bearer )'
  );

INSERT INTO public.ai_providers (
  code,
  name,
  provider_type,
  endpoint_url,
  api_key_setting_key,
  status,
  sort_order
)
VALUES (
  'openrouter',
  'OpenRouter',
  'openrouter',
  'https://openrouter.ai/api/v1/chat/completions',
  'OPENROUTER_API_KEY',
  'active',
  0
)
ON CONFLICT (code) DO UPDATE
SET
  name = 'OpenRouter',
  provider_type = 'openrouter',
  endpoint_url = 'https://openrouter.ai/api/v1/chat/completions',
  api_key_setting_key = 'OPENROUTER_API_KEY',
  version = ai_providers.version + 1;

COMMIT;
