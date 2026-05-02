CREATE TABLE IF NOT EXISTS public.system_settings (
  key text PRIMARY KEY,
  group_code text NOT NULL,
  name text NOT NULL,
  description text NULL,
  value_type text DEFAULT 'string'::text NOT NULL,
  value_text text NULL,
  is_secret boolean DEFAULT false NOT NULL,
  status text DEFAULT 'active'::text NOT NULL,
  updated_by_employee_id uuid NULL REFERENCES public.employees(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT system_settings_key_not_blank CHECK (btrim(key) <> ''),
  CONSTRAINT system_settings_group_code_not_blank CHECK (btrim(group_code) <> ''),
  CONSTRAINT system_settings_name_not_blank CHECK (btrim(name) <> ''),
  CONSTRAINT system_settings_value_type_check CHECK (
    value_type = ANY (ARRAY['string'::text, 'number'::text, 'boolean'::text, 'json'::text])
  ),
  CONSTRAINT system_settings_status_check CHECK (
    status = ANY (ARRAY['active'::text, 'inactive'::text])
  )
);

CREATE INDEX IF NOT EXISTS idx_system_settings_group_code
ON public.system_settings USING btree (group_code);

CREATE INDEX IF NOT EXISTS idx_system_settings_status
ON public.system_settings USING btree (status);

DROP TRIGGER IF EXISTS tr_system_settings_updated_at ON public.system_settings;
CREATE TRIGGER tr_system_settings_updated_at
BEFORE UPDATE ON public.system_settings
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.system_setting_change_logs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  setting_key text NOT NULL,
  old_value_text text NULL,
  new_value_text text NULL,
  changed_by_employee_id uuid NULL REFERENCES public.employees(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT system_setting_change_logs_pkey PRIMARY KEY (id),
  CONSTRAINT system_setting_change_logs_setting_key_fkey
    FOREIGN KEY (setting_key) REFERENCES public.system_settings(key) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_system_setting_change_logs_setting_key
ON public.system_setting_change_logs USING btree (setting_key);

CREATE INDEX IF NOT EXISTS idx_system_setting_change_logs_created_at
ON public.system_setting_change_logs USING btree (created_at DESC);

INSERT INTO public.permissions (code, name, module, resource, action, description, status)
VALUES
  ('system.settings.read', '查看系统配置', 'system', 'settings', 'read', '查看非敏感系统配置和配置来源', 'active'),
  ('system.settings.update', '编辑系统配置', 'system', 'settings', 'update', '修改非敏感系统配置', 'active'),
  ('system.settings.test', '测试系统配置', 'system', 'settings', 'test', '测试系统配置连通性', 'active')
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  module = EXCLUDED.module,
  resource = EXCLUDED.resource,
  action = EXCLUDED.action,
  description = EXCLUDED.description,
  status = EXCLUDED.status;

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
  ('SMS_PROVIDER', 'sms', '短信服务商', 'mock 为模拟发送，disabled 为禁用，aliyun 为阿里云短信。', 'string', NULL, false, 'active'),
  ('ALIYUN_SMS_SIGN_NAME', 'sms', '阿里云短信签名', '阿里云短信签名名称。', 'string', NULL, false, 'active'),
  ('ALIYUN_SMS_TEMPLATE_CODE_BIND_CUSTOMER', 'sms', '客户绑定短信模板', '客户绑定手机号验证码模板 Code。', 'string', NULL, false, 'active'),
  ('ALIYUN_SMS_TEMPLATE_CODE_BIND_EMPLOYEE', 'sms', '员工绑定短信模板', '员工绑定手机号验证码模板 Code。', 'string', NULL, false, 'active'),
  ('ALIYUN_SMS_TEMPLATE_CODE_ADMIN_LOGIN', 'sms', '后台登录短信模板', '后台管理员登录验证码模板 Code；为空时回退员工绑定模板。', 'string', NULL, false, 'active'),
  ('EZVIZ_API_BASE_URL', 'ezviz', '萤石开放平台地址', '萤石云开放平台 API 基础地址。', 'string', NULL, false, 'active'),
  ('EZVIZ_TOKEN_REFRESH_AHEAD_MS', 'ezviz', '萤石 Token 提前刷新时间', '访问令牌过期前提前刷新的毫秒数。', 'number', NULL, false, 'active'),
  ('EZPLAYER_PLUGIN_VERSION', 'ezviz', 'EZPlayer 插件版本', '前端播放器使用的 EZPlayer 插件版本。', 'string', NULL, false, 'active'),
  ('AI_CHAT_COMPLETIONS_URL', 'ai', 'AI 对话接口地址', '兼容 Chat Completions 的接口地址。', 'string', NULL, false, 'active'),
  ('AI_MODEL', 'ai', 'AI 模型名称', '默认 AI 模型名称。', 'string', NULL, false, 'active'),
  ('AI_REQUEST_TIMEOUT_MS', 'ai', 'AI 请求超时时间', 'AI 请求超时时间，单位毫秒。', 'number', NULL, false, 'active'),
  ('DECORATION_QA_SYSTEM_PROMPT', 'ai', '装修问答系统提示词', '装修问答功能使用的系统提示词。', 'string', NULL, false, 'active'),
  ('OPENROUTER_HTTP_REFERER', 'ai', 'OpenRouter Referer', 'OpenRouter 请求头 HTTP-Referer。', 'string', NULL, false, 'active'),
  ('OPENROUTER_APP_NAME', 'ai', 'OpenRouter 应用名', 'OpenRouter 请求头 X-Title。', 'string', NULL, false, 'active'),
  ('DEPLOY_NOTIFY_TO', 'notify', '部署通知收件人', '部署通知邮件收件人。', 'string', NULL, false, 'active'),
  ('DEPLOY_NOTIFY_FROM', 'notify', '部署通知发件人', '部署通知邮件发件人。', 'string', NULL, false, 'active'),
  ('SMTP_HOST', 'notify', 'SMTP 主机', 'SMTP 服务器地址。', 'string', NULL, false, 'active'),
  ('SMTP_PORT', 'notify', 'SMTP 端口', 'SMTP 服务器端口。', 'number', NULL, false, 'active'),
  ('SMTP_SECURE', 'notify', 'SMTP SSL', '是否使用 SMTP SSL。', 'boolean', NULL, false, 'active'),
  ('SMTP_FAMILY', 'notify', 'SMTP 网络协议族', 'SMTP 网络协议族，通常为 4 或 6。', 'number', NULL, false, 'active'),
  ('WECHAT_SHARE_CAMPAIGN_PAGE', 'wechat', '微信助力页路径', '微信小程序客户日志助力页路径。', 'string', NULL, false, 'active'),
  ('WECHAT_SHARE_CAMPAIGN_CLAIM_VOUCHER_PAGE', 'wechat', '微信领券页路径', '微信小程序领券页路径。', 'string', NULL, false, 'active'),
  ('CUSTOMER_LOG_SHARE_TARGET_ASSIST_COUNT', 'wechat', '助力目标人数', '客户日志分享活动目标助力人数。', 'number', NULL, false, 'active')
ON CONFLICT (key) DO UPDATE SET
  group_code = EXCLUDED.group_code,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  value_type = EXCLUDED.value_type,
  is_secret = EXCLUDED.is_secret,
  status = EXCLUDED.status;
