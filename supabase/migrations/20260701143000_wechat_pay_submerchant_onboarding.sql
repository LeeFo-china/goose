-- Phase 9: WeChat Pay payment principal and service-provider sub-merchant onboarding state.

ALTER TABLE public.tenant_payment_configs
ADD COLUMN IF NOT EXISTS principal_type text NOT NULL DEFAULT 'tenant',
ADD COLUMN IF NOT EXISTS applyment_business_code text NULL,
ADD COLUMN IF NOT EXISTS applyment_id text NULL,
ADD COLUMN IF NOT EXISTS applyment_state text NOT NULL DEFAULT 'not_started',
ADD COLUMN IF NOT EXISTS applyment_state_message text NULL,
ADD COLUMN IF NOT EXISTS appid_binding_state text NOT NULL DEFAULT 'not_required',
ADD COLUMN IF NOT EXISTS appid_binding_message text NULL,
ADD COLUMN IF NOT EXISTS opened_at timestamptz NULL,
ADD COLUMN IF NOT EXISTS suspended_at timestamptz NULL;

ALTER TABLE public.tenant_payment_configs
DROP CONSTRAINT IF EXISTS tenant_payment_configs_principal_type_check,
DROP CONSTRAINT IF EXISTS tenant_payment_configs_applyment_state_check,
DROP CONSTRAINT IF EXISTS tenant_payment_configs_appid_binding_state_check,
DROP CONSTRAINT IF EXISTS tenant_payment_configs_applyment_business_code_not_blank,
DROP CONSTRAINT IF EXISTS tenant_payment_configs_applyment_id_not_blank;

ALTER TABLE public.tenant_payment_configs
ADD CONSTRAINT tenant_payment_configs_principal_type_check
CHECK (principal_type IN ('platform', 'tenant')),
ADD CONSTRAINT tenant_payment_configs_applyment_state_check
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
ADD CONSTRAINT tenant_payment_configs_appid_binding_state_check
CHECK (
  appid_binding_state IN (
    'not_required',
    'not_bound',
    'pending_confirm',
    'bound',
    'rejected'
  )
),
ADD CONSTRAINT tenant_payment_configs_applyment_business_code_not_blank
CHECK (
  applyment_business_code IS NULL OR btrim(applyment_business_code) <> ''
),
ADD CONSTRAINT tenant_payment_configs_applyment_id_not_blank
CHECK (
  applyment_id IS NULL OR btrim(applyment_id) <> ''
);

CREATE UNIQUE INDEX IF NOT EXISTS tenant_payment_configs_sub_merchant_unique_idx
ON public.tenant_payment_configs(provider, sub_merchant_id)
WHERE sub_merchant_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS tenant_payment_configs_applyment_business_code_unique_idx
ON public.tenant_payment_configs(provider, applyment_business_code)
WHERE applyment_business_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS tenant_payment_configs_applyment_state_idx
ON public.tenant_payment_configs(provider, applyment_state);

CREATE INDEX IF NOT EXISTS tenant_payment_configs_appid_binding_state_idx
ON public.tenant_payment_configs(provider, appid_binding_state);

COMMENT ON COLUMN public.tenant_payment_configs.principal_type
  IS '收款主体类型：platform 表示平台主体，tenant 表示租户主体。';
COMMENT ON COLUMN public.tenant_payment_configs.applyment_business_code
  IS '服务商特约商户进件业务申请编号，由平台生成或录入。';
COMMENT ON COLUMN public.tenant_payment_configs.applyment_id
  IS '微信支付特约商户进件申请单号。';
COMMENT ON COLUMN public.tenant_payment_configs.applyment_state
  IS '特约商户进件状态：not_started/draft/submitted/reviewing/rejected/account_verifying/signing/opened/suspended/closed。';
COMMENT ON COLUMN public.tenant_payment_configs.applyment_state_message
  IS '特约商户进件状态补充说明或驳回原因，禁止写入敏感证件明文。';
COMMENT ON COLUMN public.tenant_payment_configs.appid_binding_state
  IS '平台小程序 AppID 与特约商户号绑定状态：not_required/not_bound/pending_confirm/bound/rejected。';
COMMENT ON COLUMN public.tenant_payment_configs.appid_binding_message
  IS 'AppID 绑定状态补充说明。';
COMMENT ON COLUMN public.tenant_payment_configs.opened_at
  IS '特约商户开通时间。';
COMMENT ON COLUMN public.tenant_payment_configs.suspended_at
  IS '特约商户或支付配置暂停时间。';
