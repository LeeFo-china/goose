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
    ('CUSTOMER_SERVICE_ENABLED', 'customer_service', '客服入口开关', '控制微信小程序客户侧是否展示客服入口并允许提交客服问题。', 'boolean', 'false', false, 'active'),
    ('CUSTOMER_SERVICE_PHONE', 'customer_service', '客服电话', '客户侧一键拨打的客服电话，按租户配置。', 'string', NULL, false, 'active'),
    ('CUSTOMER_SERVICE_WORKING_HOURS', 'customer_service', '客服工作时间', '客户侧展示的客服工作时间文案。', 'string', NULL, false, 'active'),
    ('CUSTOMER_SERVICE_NOTICE', 'customer_service', '客服提示文案', '客户侧客服入口展示的说明文案。', 'string', NULL, false, 'active')
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
  status = incoming.status
FROM (
  VALUES
    ('CUSTOMER_SERVICE_ENABLED', 'customer_service', '客服入口开关', '控制微信小程序客户侧是否展示客服入口并允许提交客服问题。', 'boolean', false, 'active'),
    ('CUSTOMER_SERVICE_PHONE', 'customer_service', '客服电话', '客户侧一键拨打的客服电话，按租户配置。', 'string', false, 'active'),
    ('CUSTOMER_SERVICE_WORKING_HOURS', 'customer_service', '客服工作时间', '客户侧展示的客服工作时间文案。', 'string', false, 'active'),
    ('CUSTOMER_SERVICE_NOTICE', 'customer_service', '客服提示文案', '客户侧客服入口展示的说明文案。', 'string', false, 'active')
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
