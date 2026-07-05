-- Platform payment configuration for platform-owned WeChat Pay recharge.

INSERT INTO public.permissions (code, name, module, resource, action, description, status)
VALUES
  (
    'platform.payment.config.read',
    '查看平台支付配置',
    'platform',
    'payment_config',
    'read',
    '查看平台独立支付商户配置脱敏信息',
    'active'
  ),
  (
    'platform.payment.config.manage',
    '管理平台支付配置',
    'platform',
    'payment_config',
    'manage',
    '管理平台独立支付商户配置和启停状态',
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
    'platform.payment.config.read',
    'platform.payment.config.manage'
  )
WHERE roles.code = 'platform_admin'
ON CONFLICT (role_id, permission_id) DO UPDATE SET
  access_scope = EXCLUDED.access_scope;

CREATE TABLE IF NOT EXISTS public.platform_payment_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL DEFAULT 'wechat_pay',
  principal_type text NOT NULL DEFAULT 'platform',
  merchant_mode text NOT NULL DEFAULT 'direct_merchant',
  merchant_name text NULL,
  merchant_id text NULL,
  app_id text NULL,
  encrypted_config_ref text NULL,
  serial_no text NULL,
  notify_url text NULL,
  enabled_channels text[] NOT NULL DEFAULT ARRAY['tenant_recharge'],
  status text NOT NULL DEFAULT 'pending',
  validation_status text NOT NULL DEFAULT 'unchecked',
  last_validated_at timestamptz NULL,
  risk_switches jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by_employee_id uuid NULL REFERENCES public.employees(id) ON DELETE SET NULL,
  updated_by_employee_id uuid NULL REFERENCES public.employees(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_payment_configs_provider_check
    CHECK (provider IN ('wechat_pay')),
  CONSTRAINT platform_payment_configs_principal_type_check
    CHECK (principal_type = 'platform'),
  CONSTRAINT platform_payment_configs_merchant_mode_check
    CHECK (merchant_mode = 'direct_merchant'),
  CONSTRAINT platform_payment_configs_status_check
    CHECK (status IN ('pending', 'active', 'disabled', 'suspended')),
  CONSTRAINT platform_payment_configs_validation_status_check
    CHECK (validation_status IN ('unchecked', 'valid', 'invalid')),
  CONSTRAINT platform_payment_configs_risk_switches_object_check
    CHECK (jsonb_typeof(risk_switches) = 'object')
);

CREATE UNIQUE INDEX IF NOT EXISTS platform_payment_configs_provider_unique_idx
ON public.platform_payment_configs(provider);

CREATE INDEX IF NOT EXISTS platform_payment_configs_status_idx
ON public.platform_payment_configs(provider, status);

DROP TRIGGER IF EXISTS tr_platform_payment_configs_updated_at
ON public.platform_payment_configs;

CREATE TRIGGER tr_platform_payment_configs_updated_at
  BEFORE UPDATE ON public.platform_payment_configs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.platform_payment_configs
IS '平台独立支付商户配置，用于平台积分充值等平台自有收款场景。';

COMMENT ON COLUMN public.platform_payment_configs.encrypted_config_ref
IS '微信支付密钥包引用，不保存密钥明文。';

COMMENT ON COLUMN public.platform_payment_configs.enabled_channels
IS '平台支付配置启用的业务通道，tenant_recharge 表示租户积分充值。';
