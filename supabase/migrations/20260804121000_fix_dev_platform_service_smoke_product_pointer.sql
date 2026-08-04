-- Repair the dev-only payment smoke product published-version pointer.
--
-- The seed migration can create/update the product and version in one CTE,
-- but an ON CONFLICT UPDATE followed by another UPDATE of the same product row
-- in the same statement does not reliably set published_version_id.

WITH dev_guard AS (
  SELECT EXISTS (
    SELECT 1
    FROM public.system_settings AS setting
    WHERE setting.key = 'WECHAT_MINIPROGRAM_ENV_VERSION'
      AND setting.is_secret = false
      AND setting.status = 'active'
      AND pg_catalog.btrim(COALESCE(setting.value_text, '')) = 'develop'
  ) AS is_development
)
UPDATE public.platform_service_products AS product
SET published_version_id = version.id
FROM public.platform_service_product_versions AS version,
  dev_guard
WHERE dev_guard.is_development
  AND product.code = 'platform_service_smoke_1fen'
  AND version.product_id = product.id
  AND version.version = 1
  AND product.published_version_id IS DISTINCT FROM version.id;
