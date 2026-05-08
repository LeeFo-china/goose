CREATE TABLE IF NOT EXISTS public.project_acceptance_open_tickets (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  ticket text NOT NULL UNIQUE,
  acceptance_id uuid NOT NULL REFERENCES public.project_acceptances(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  phone text NOT NULL,
  scene text DEFAULT 'project_acceptance_customer_review'::text NOT NULL,
  status text DEFAULT 'active'::text NOT NULL,
  link_type text NULL,
  link_url text NULL,
  send_status text NULL,
  send_error text NULL,
  sent_at timestamptz NULL,
  expire_at timestamptz NOT NULL,
  used_at timestamptz NULL,
  last_verified_at timestamptz NULL,
  verify_count integer DEFAULT 0 NOT NULL,
  created_by uuid NULL REFERENCES public.employees(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT project_acceptance_open_tickets_ticket_not_blank CHECK (btrim(ticket) <> ''),
  CONSTRAINT project_acceptance_open_tickets_phone_not_blank CHECK (btrim(phone) <> ''),
  CONSTRAINT project_acceptance_open_tickets_scene_check CHECK (
    scene = 'project_acceptance_customer_review'
  ),
  CONSTRAINT project_acceptance_open_tickets_status_check CHECK (
    status = ANY (ARRAY['active'::text, 'used'::text, 'expired'::text, 'revoked'::text])
  )
);

CREATE INDEX IF NOT EXISTS project_acceptance_open_tickets_acceptance_idx
ON public.project_acceptance_open_tickets(acceptance_id, status, expire_at DESC);

CREATE INDEX IF NOT EXISTS project_acceptance_open_tickets_project_idx
ON public.project_acceptance_open_tickets(project_id);

CREATE INDEX IF NOT EXISTS project_acceptance_open_tickets_customer_idx
ON public.project_acceptance_open_tickets(customer_id);

CREATE INDEX IF NOT EXISTS project_acceptance_open_tickets_expire_idx
ON public.project_acceptance_open_tickets(expire_at);

DROP TRIGGER IF EXISTS tr_project_acceptance_open_tickets_updated_at
ON public.project_acceptance_open_tickets;
CREATE TRIGGER tr_project_acceptance_open_tickets_updated_at
  BEFORE UPDATE ON public.project_acceptance_open_tickets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE public.project_acceptance_open_tickets IS '项目工序验收短信拉起小程序短期访问票据';

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
  (
    'ALIYUN_SMS_TEMPLATE_CODE_PROJECT_ACCEPTANCE',
    'sms',
    '项目验收通知短信模板',
    '领导复核通过后发送给客户的项目验收通知模板 Code。模板变量建议包含 stageName、link、expireHours。',
    'string',
    NULL,
    false,
    'active'
  ),
  (
    'PROJECT_ACCEPTANCE_SMS_EXPIRE_HOURS',
    'sms',
    '项目验收短信链接有效期',
    '项目验收短信 ticket 有效期，单位小时。',
    'number',
    '72',
    false,
    'active'
  ),
  (
    'PROJECT_ACCEPTANCE_SMS_LINK_TYPE',
    'sms',
    '项目验收短信链接类型',
    '支持 scheme 或 url_link；url_link 依赖微信小程序 AppID/Secret。',
    'string',
    'scheme',
    false,
    'active'
  ),
  (
    'WECHAT_PROJECT_ACCEPTANCE_PAGE',
    'wechat',
    '微信项目验收详情页路径',
    '短信拉起小程序后进入的客户项目验收详情页路径。',
    'string',
    'packageCustomerPortal/pages/customer-project-acceptance/index',
    false,
    'active'
  ),
  (
    'WECHAT_MINIPROGRAM_ENV_VERSION',
    'wechat',
    '微信小程序版本环境',
    'release 为正式版，trial 为体验版，develop 为开发版。',
    'string',
    'release',
    false,
    'active'
  )
ON CONFLICT (key) DO UPDATE SET
  group_code = EXCLUDED.group_code,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  value_type = EXCLUDED.value_type,
  is_secret = EXCLUDED.is_secret,
  status = EXCLUDED.status;
