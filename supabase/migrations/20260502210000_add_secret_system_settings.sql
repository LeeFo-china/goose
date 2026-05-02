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
VALUES
  ('ALIBABA_CLOUD_ACCESS_KEY_ID', 'sms', '阿里云 AccessKey ID', '阿里云短信 AccessKey ID，加密存储。', 'string', NULL, true, 'active'),
  ('ALIBABA_CLOUD_ACCESS_KEY_SECRET', 'sms', '阿里云 AccessKey Secret', '阿里云短信 AccessKey Secret，加密存储。', 'string', NULL, true, 'active'),
  ('AI_API_KEY', 'ai', 'AI API Key', 'OpenAI/OpenRouter 兼容接口 API Key，加密存储。', 'string', NULL, true, 'active'),
  ('DEEPSEEK_API_KEY', 'ai', 'DeepSeek API Key', 'DeepSeek API Key，加密存储。', 'string', NULL, true, 'active'),
  ('EZVIZ_APP_KEY', 'ezviz', '萤石 App Key', '萤石开放平台 App Key，加密存储。', 'string', NULL, true, 'active'),
  ('EZVIZ_APP_SECRET', 'ezviz', '萤石 App Secret', '萤石开放平台 App Secret，加密存储。', 'string', NULL, true, 'active'),
  ('WECHAT_APPID', 'wechat', '微信小程序 AppID', '微信小程序 AppID，加密存储。', 'string', NULL, true, 'active'),
  ('WECHAT_SECRET', 'wechat', '微信小程序 Secret', '微信小程序 Secret，加密存储。', 'string', NULL, true, 'active'),
  ('SMTP_USER', 'notify', 'SMTP 用户名', 'SMTP 登录用户名，加密存储。', 'string', NULL, true, 'active'),
  ('SMTP_PASS', 'notify', 'SMTP 密码/授权码', 'SMTP 登录密码或授权码，加密存储。', 'string', NULL, true, 'active')
ON CONFLICT (key) DO UPDATE SET
  group_code = EXCLUDED.group_code,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  value_type = EXCLUDED.value_type,
  is_secret = EXCLUDED.is_secret,
  status = EXCLUDED.status;
