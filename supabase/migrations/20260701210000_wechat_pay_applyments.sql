-- Phase 9 Task 1: Tenant WeChat Pay applyment workflow and permissions.

INSERT INTO public.permissions (code, name, module, resource, action, description, status)
VALUES
  (
    'wechat_pay.applyment.read',
    '查看微信支付开通申请',
    'wechat_pay',
    'applyment',
    'read',
    '查看本租户微信支付开通申请和进件进度',
    'active'
  ),
  (
    'wechat_pay.applyment.submit',
    '提交微信支付开通申请',
    'wechat_pay',
    'applyment',
    'submit',
    '创建、编辑和提交本租户微信支付开通申请',
    'active'
  ),
  (
    'platform.wechat_pay.applyment.read',
    '平台查看微信支付进件申请',
    'platform_wechat_pay',
    'applyment',
    'read',
    '平台查看租户微信支付开通申请列表和详情',
    'active'
  ),
  (
    'platform.wechat_pay.applyment.review',
    '平台审核微信支付进件申请',
    'platform_wechat_pay',
    'applyment',
    'review',
    '平台审核通过或驳回租户微信支付开通申请',
    'active'
  ),
  (
    'platform.wechat_pay.applyment.manage',
    '平台管理微信支付进件进度',
    'platform_wechat_pay',
    'applyment',
    'manage',
    '平台回填微信支付进件状态、子商户号和 AppID 绑定状态',
    'active'
  ),
  (
    'platform.wechat_pay.config.activate',
    '激活租户微信支付配置',
    'platform_wechat_pay',
    'config',
    'activate',
    '平台在进件完成后激活租户微信支付收款配置',
    'active'
  )
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  module = EXCLUDED.module,
  resource = EXCLUDED.resource,
  action = EXCLUDED.action,
  description = EXCLUDED.description,
  status = EXCLUDED.status;

INSERT INTO public.role_permissions (role_id, permission_id, access_scope)
SELECT roles.id, permissions.id, 'all'
FROM public.roles
JOIN public.permissions
  ON permissions.code IN (
    'wechat_pay.applyment.read',
    'wechat_pay.applyment.submit'
  )
WHERE roles.code = 'system_admin'
ON CONFLICT (role_id, permission_id) DO UPDATE SET
  access_scope = EXCLUDED.access_scope;

INSERT INTO public.role_permissions (role_id, permission_id, access_scope)
SELECT roles.id, permissions.id, 'all'
FROM public.roles
JOIN public.permissions
  ON permissions.code IN (
    'platform.wechat_pay.applyment.read',
    'platform.wechat_pay.applyment.review',
    'platform.wechat_pay.applyment.manage',
    'platform.wechat_pay.config.activate'
  )
WHERE roles.code = 'platform_admin'
  AND roles.tenant_id IS NULL
ON CONFLICT (role_id, permission_id) DO UPDATE SET
  access_scope = EXCLUDED.access_scope;

CREATE TABLE IF NOT EXISTS public.tenant_wechat_pay_applyments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  application_no text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  merchant_short_name text NOT NULL,
  license_name text NULL,
  license_code text NULL,
  legal_representative_name text NULL,
  super_admin_name text NULL,
  super_admin_phone_masked text NULL,
  super_admin_email text NULL,
  settlement_account_name text NULL,
  settlement_bank_name text NULL,
  settlement_account_summary text NULL,
  business_scene_description text NULL,
  contact_address text NULL,
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  remark text NULL,
  applyment_business_code text NULL,
  applyment_id text NULL,
  applyment_state text NOT NULL DEFAULT 'draft',
  applyment_state_message text NULL,
  sub_mchid text NULL,
  sub_appid text NULL,
  appid_binding_state text NOT NULL DEFAULT 'not_bound',
  appid_binding_message text NULL,
  payment_config_id uuid NULL REFERENCES public.tenant_payment_configs(id) ON DELETE SET NULL,
  submitted_at timestamptz NULL,
  approved_at timestamptz NULL,
  opened_at timestamptz NULL,
  activated_at timestamptz NULL,
  rejected_at timestamptz NULL,
  rejected_reason text NULL,
  created_by_employee_id uuid NULL REFERENCES public.employees(id) ON DELETE SET NULL,
  updated_by_employee_id uuid NULL REFERENCES public.employees(id) ON DELETE SET NULL,
  reviewed_by_employee_id uuid NULL REFERENCES public.employees(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_wechat_pay_applyments_application_no_not_blank
    CHECK (btrim(application_no) <> ''),
  CONSTRAINT tenant_wechat_pay_applyments_merchant_short_name_not_blank
    CHECK (btrim(merchant_short_name) <> ''),
  CONSTRAINT tenant_wechat_pay_applyments_status_check
    CHECK (
      status IN (
        'draft',
        'submitted',
        'rejected',
        'approved',
        'applying',
        'reviewing',
        'account_verifying',
        'signing',
        'opened',
        'bound',
        'active',
        'suspended',
        'closed'
      )
    ),
  CONSTRAINT tenant_wechat_pay_applyments_applyment_state_check
    CHECK (
      applyment_state IN (
        'not_started',
        'draft',
        'submitted',
        'reviewing',
        'rejected',
        'account_verifying',
        'signing',
        'opened',
        'suspended',
        'closed'
      )
    ),
  CONSTRAINT tenant_wechat_pay_applyments_appid_binding_state_check
    CHECK (
      appid_binding_state IN (
        'not_required',
        'not_bound',
        'pending_confirm',
        'bound',
        'rejected'
      )
    ),
  CONSTRAINT tenant_wechat_pay_applyments_attachments_array_check
    CHECK (jsonb_typeof(attachments) = 'array'),
  CONSTRAINT tenant_wechat_pay_applyments_applyment_business_code_not_blank
    CHECK (applyment_business_code IS NULL OR btrim(applyment_business_code) <> ''),
  CONSTRAINT tenant_wechat_pay_applyments_applyment_id_not_blank
    CHECK (applyment_id IS NULL OR btrim(applyment_id) <> ''),
  CONSTRAINT tenant_wechat_pay_applyments_sub_mchid_not_blank
    CHECK (sub_mchid IS NULL OR btrim(sub_mchid) <> ''),
  CONSTRAINT tenant_wechat_pay_applyments_sub_appid_not_blank
    CHECK (sub_appid IS NULL OR btrim(sub_appid) <> '')
);

CREATE UNIQUE INDEX IF NOT EXISTS tenant_wechat_pay_applyments_application_no_unique_idx
ON public.tenant_wechat_pay_applyments(application_no);

CREATE INDEX IF NOT EXISTS tenant_wechat_pay_applyments_tenant_status_submitted_idx
ON public.tenant_wechat_pay_applyments(tenant_id, status, submitted_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS tenant_wechat_pay_applyments_status_submitted_idx
ON public.tenant_wechat_pay_applyments(status, submitted_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS tenant_wechat_pay_applyments_tenant_created_idx
ON public.tenant_wechat_pay_applyments(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS tenant_wechat_pay_applyments_applyment_business_code_idx
ON public.tenant_wechat_pay_applyments(applyment_business_code)
WHERE applyment_business_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS tenant_wechat_pay_applyments_sub_mchid_idx
ON public.tenant_wechat_pay_applyments(sub_mchid)
WHERE sub_mchid IS NOT NULL;

DROP TRIGGER IF EXISTS tr_tenant_wechat_pay_applyments_updated_at
ON public.tenant_wechat_pay_applyments;

CREATE TRIGGER tr_tenant_wechat_pay_applyments_updated_at
  BEFORE UPDATE ON public.tenant_wechat_pay_applyments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.tenant_wechat_pay_applyment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  applyment_id uuid NOT NULL REFERENCES public.tenant_wechat_pay_applyments(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  from_status text NULL,
  to_status text NULL,
  message text NULL,
  operator_employee_id uuid NULL REFERENCES public.employees(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_wechat_pay_applyment_events_event_type_not_blank
    CHECK (btrim(event_type) <> ''),
  CONSTRAINT tenant_wechat_pay_applyment_events_metadata_object_check
    CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX IF NOT EXISTS tenant_wechat_pay_applyment_events_applyment_created_idx
ON public.tenant_wechat_pay_applyment_events(applyment_id, created_at DESC);

CREATE INDEX IF NOT EXISTS tenant_wechat_pay_applyment_events_tenant_created_idx
ON public.tenant_wechat_pay_applyment_events(tenant_id, created_at DESC);

COMMENT ON TABLE public.tenant_wechat_pay_applyments
  IS '租户微信支付开通申请，记录平台内审核、人工进件、子商户号和 AppID 绑定状态。';
COMMENT ON TABLE public.tenant_wechat_pay_applyment_events
  IS '租户微信支付开通申请状态变化和平台处理审计事件。';
COMMENT ON COLUMN public.tenant_wechat_pay_applyments.super_admin_phone_masked
  IS '超级管理员手机号脱敏展示值，禁止保存完整手机号。';
COMMENT ON COLUMN public.tenant_wechat_pay_applyments.attachments
  IS '申请附件对象存储引用数组，禁止保存证件或密钥明文。';
COMMENT ON COLUMN public.tenant_wechat_pay_applyments.status
  IS '平台内申请主状态：draft/submitted/rejected/approved/applying/reviewing/account_verifying/signing/opened/bound/active/suspended/closed。';
COMMENT ON COLUMN public.tenant_wechat_pay_applyments.applyment_state
  IS '微信支付进件状态，和系统主状态分离。';
