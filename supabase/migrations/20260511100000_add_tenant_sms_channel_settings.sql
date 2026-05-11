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
    ('SMS_CHANNEL_MODE', 'sms', '租户短信通道模式', '租户短信通道模式：platform 继承平台，tenant_aliyun 使用租户自有阿里云，tenant_tencent 使用租户自有腾讯云。', 'string', 'platform', false, 'active'),
    ('TENCENT_SMS_SECRET_ID', 'sms', '腾讯云短信 SecretId', '腾讯云短信 SecretId，加密存储。', 'string', NULL, true, 'active'),
    ('TENCENT_SMS_SECRET_KEY', 'sms', '腾讯云短信 SecretKey', '腾讯云短信 SecretKey，加密存储。', 'string', NULL, true, 'active'),
    ('TENCENT_SMS_REGION', 'sms', '腾讯云短信区域', '腾讯云短信 API 区域。', 'string', 'ap-guangzhou', false, 'active'),
    ('TENCENT_SMS_ENDPOINT', 'sms', '腾讯云短信 Endpoint', '腾讯云短信 API 域名。', 'string', 'sms.tencentcloudapi.com', false, 'active'),
    ('TENCENT_SMS_SDK_APP_ID', 'sms', '腾讯云短信 SdkAppId', '腾讯云短信应用 SdkAppId。', 'string', NULL, false, 'active'),
    ('TENCENT_SMS_SIGN_NAME', 'sms', '腾讯云短信签名', '腾讯云短信签名名称。', 'string', NULL, false, 'active'),
    ('TENCENT_SMS_TEMPLATE_ID_BIND_CUSTOMER', 'sms', '腾讯云客户绑定模板', '客户绑定手机号验证码模板 ID。', 'string', NULL, false, 'active'),
    ('TENCENT_SMS_TEMPLATE_ID_BIND_EMPLOYEE', 'sms', '腾讯云员工绑定模板', '员工绑定手机号验证码模板 ID。', 'string', NULL, false, 'active'),
    ('TENCENT_SMS_TEMPLATE_ID_ADMIN_LOGIN', 'sms', '腾讯云后台登录模板', '后台管理员登录验证码模板 ID；为空时回退员工绑定模板。', 'string', NULL, false, 'active'),
    ('TENCENT_SMS_TEMPLATE_ID_PROJECT_ACCEPTANCE', 'sms', '腾讯云项目验收通知模板', '领导复核通过后发送给客户的项目验收通知模板 ID。', 'string', NULL, false, 'active')
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
    ('SMS_PROVIDER', 'sms', '短信服务商', '平台短信服务商。mock 为模拟发送，disabled 为禁用，aliyun 为阿里云短信，tencent 为腾讯云短信。', 'string', false, 'active'),
    ('SMS_CHANNEL_MODE', 'sms', '租户短信通道模式', '租户短信通道模式：platform 继承平台，tenant_aliyun 使用租户自有阿里云，tenant_tencent 使用租户自有腾讯云。', 'string', false, 'active'),
    ('TENCENT_SMS_SECRET_ID', 'sms', '腾讯云短信 SecretId', '腾讯云短信 SecretId，加密存储。', 'string', true, 'active'),
    ('TENCENT_SMS_SECRET_KEY', 'sms', '腾讯云短信 SecretKey', '腾讯云短信 SecretKey，加密存储。', 'string', true, 'active'),
    ('TENCENT_SMS_REGION', 'sms', '腾讯云短信区域', '腾讯云短信 API 区域。', 'string', false, 'active'),
    ('TENCENT_SMS_ENDPOINT', 'sms', '腾讯云短信 Endpoint', '腾讯云短信 API 域名。', 'string', false, 'active'),
    ('TENCENT_SMS_SDK_APP_ID', 'sms', '腾讯云短信 SdkAppId', '腾讯云短信应用 SdkAppId。', 'string', false, 'active'),
    ('TENCENT_SMS_SIGN_NAME', 'sms', '腾讯云短信签名', '腾讯云短信签名名称。', 'string', false, 'active'),
    ('TENCENT_SMS_TEMPLATE_ID_BIND_CUSTOMER', 'sms', '腾讯云客户绑定模板', '客户绑定手机号验证码模板 ID。', 'string', false, 'active'),
    ('TENCENT_SMS_TEMPLATE_ID_BIND_EMPLOYEE', 'sms', '腾讯云员工绑定模板', '员工绑定手机号验证码模板 ID。', 'string', false, 'active'),
    ('TENCENT_SMS_TEMPLATE_ID_ADMIN_LOGIN', 'sms', '腾讯云后台登录模板', '后台管理员登录验证码模板 ID；为空时回退员工绑定模板。', 'string', false, 'active'),
    ('TENCENT_SMS_TEMPLATE_ID_PROJECT_ACCEPTANCE', 'sms', '腾讯云项目验收通知模板', '领导复核通过后发送给客户的项目验收通知模板 ID。', 'string', false, 'active')
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
