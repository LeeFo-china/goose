-- Trial rollout remains closed by default. A database explicitly marked as the
-- WeChat mini-program develop environment starts enabled for dev integration;
-- every other environment, including production, starts closed. Operators can
-- later change either switch through the existing system-settings control plane.
WITH rollout AS MATERIALIZED (
  SELECT EXISTS (
    SELECT 1
    FROM public.system_settings setting
    WHERE setting.tenant_id IS NULL
      AND setting.key = 'WECHAT_MINIPROGRAM_ENV_VERSION'
      AND setting.status = 'active'
      AND lower(btrim(setting.value_text)) = 'develop'
  ) AS is_develop
), incoming(key, name, description, value_text) AS (
  SELECT
    'PLATFORM_SERVICE_TRIAL_APPLICATION_ENABLED',
    '技术服务试用自主申请开关',
    '控制租户员工是否可以提交新的技术服务试用申请。',
    CASE WHEN rollout.is_develop THEN 'true' ELSE 'false' END
  FROM rollout
  UNION ALL
  SELECT
    'PLATFORM_SERVICE_TRIAL_ACCESS_ENABLED',
    '技术服务试用访问放行开关',
    '控制统一租户服务门禁是否接受有效试用和宽限期事实。',
    CASE WHEN rollout.is_develop THEN 'true' ELSE 'false' END
  FROM rollout
)
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
  incoming.key,
  'platform_service_trial',
  incoming.name,
  incoming.description,
  'boolean',
  incoming.value_text,
  false,
  'active'
FROM incoming
WHERE NOT EXISTS (
  SELECT 1
  FROM public.system_settings existing
  WHERE existing.tenant_id IS NULL
    AND existing.key = incoming.key
);
