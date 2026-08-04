-- Seed a dev-only payment smoke product for real WeChat Pay validation.
--
-- Rollback: in development, archive product code platform_service_smoke_1fen
-- after any smoke orders are reconciled. Do not remove historical orders.

WITH dev_guard AS (
  SELECT EXISTS (
    SELECT 1
    FROM public.system_settings AS setting
    WHERE setting.key = 'WECHAT_MINIPROGRAM_ENV_VERSION'
      AND setting.is_secret = false
      AND setting.status = 'active'
      AND pg_catalog.btrim(COALESCE(setting.value_text, '')) = 'develop'
  ) AS is_development
),
seed_products AS (
  INSERT INTO public.platform_service_products (
    code,
    title,
    term_years,
    list_amount_fen,
    amount_fen,
    service_scope,
    terms_version,
    terms_content,
    status,
    version,
    sort_order
  )
  SELECT
    'platform_service_smoke_1fen',
    '平台技术服务支付 Smoke（开发专用）',
    1,
    1,
    1,
    '["开发环境真实微信支付链路验证","支付成功后验证回调确认","支付成功后验证实施工单幂等创建"]'::jsonb,
    1,
    '仅用于开发环境平台技术服务真实支付 smoke 验证，金额 0.01 元，不代表正式服务报价。',
    'enabled',
    1,
    1
  FROM dev_guard
  WHERE is_development
  ON CONFLICT (code) DO UPDATE SET
    title = EXCLUDED.title,
    term_years = EXCLUDED.term_years,
    list_amount_fen = EXCLUDED.list_amount_fen,
    amount_fen = EXCLUDED.amount_fen,
    service_scope = EXCLUDED.service_scope,
    terms_version = EXCLUDED.terms_version,
    terms_content = EXCLUDED.terms_content,
    status = EXCLUDED.status,
    sort_order = EXCLUDED.sort_order
  RETURNING *
),
seed_versions AS (
  INSERT INTO public.platform_service_product_versions (
    product_id,
    version,
    title,
    term_years,
    list_amount_fen,
    amount_fen,
    service_scope,
    terms_version,
    terms_content,
    published_by_employee_id
  )
  SELECT
    product.id,
    1,
    product.title,
    product.term_years,
    product.list_amount_fen,
    product.amount_fen,
    product.service_scope,
    product.terms_version,
    product.terms_content,
    NULL
  FROM seed_products AS product
  ON CONFLICT (product_id, version) DO UPDATE SET
    title = EXCLUDED.title,
    term_years = EXCLUDED.term_years,
    list_amount_fen = EXCLUDED.list_amount_fen,
    amount_fen = EXCLUDED.amount_fen,
    service_scope = EXCLUDED.service_scope,
    terms_version = EXCLUDED.terms_version,
    terms_content = EXCLUDED.terms_content
  RETURNING *
)
UPDATE public.platform_service_products AS product
SET published_version_id = version.id
FROM seed_versions AS version
WHERE product.id = version.product_id;

-- dev-only payment smoke product: platform_service_smoke_1fen, amount_fen <= 100,
-- guarded by WECHAT_MINIPROGRAM_ENV_VERSION=develop.
