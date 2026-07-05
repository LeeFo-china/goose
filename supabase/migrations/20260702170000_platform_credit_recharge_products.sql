-- Platform-configured tenant credit recharge products.

INSERT INTO public.permissions (code, name, module, resource, action, description, status)
VALUES
  (
    'billing.recharge.create',
    '发起积分充值',
    'billing',
    'recharge',
    'create',
    '发起租户积分微信支付充值',
    'active'
  ),
  (
    'billing.recharge.read',
    '查看积分充值订单',
    'billing',
    'recharge',
    'read',
    '查看本租户积分充值订单和状态',
    'active'
  ),
  (
    'platform.billing.recharge_product.manage',
    '管理积分充值套餐',
    'platform',
    'billing_recharge_product',
    'manage',
    '管理平台租户积分充值套餐',
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
  ON permissions.code IN ('platform.billing.recharge_product.manage')
WHERE roles.code = 'platform_admin'
ON CONFLICT (role_id, permission_id) DO UPDATE SET
  access_scope = EXCLUDED.access_scope;

INSERT INTO public.role_permissions (role_id, permission_id, access_scope)
SELECT roles.id, permissions.id, 'all'
FROM public.roles
JOIN public.permissions
  ON permissions.code IN (
    'billing.recharge.create',
    'billing.recharge.read'
  )
WHERE roles.code = 'system_admin'
ON CONFLICT (role_id, permission_id) DO UPDATE SET
  access_scope = EXCLUDED.access_scope;

CREATE TABLE IF NOT EXISTS public.platform_credit_recharge_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  title text NOT NULL,
  amount_fen integer NOT NULL,
  credits bigint NOT NULL,
  bonus_credits bigint NOT NULL DEFAULT 0,
  enabled boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 100,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by_employee_id uuid NULL REFERENCES public.employees(id) ON DELETE SET NULL,
  updated_by_employee_id uuid NULL REFERENCES public.employees(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_credit_recharge_products_code_not_blank
    CHECK (btrim(code) <> ''),
  CONSTRAINT platform_credit_recharge_products_title_not_blank
    CHECK (btrim(title) <> ''),
  CONSTRAINT platform_credit_recharge_products_amount_check
    CHECK (amount_fen > 0),
  CONSTRAINT platform_credit_recharge_products_credits_check
    CHECK (credits > 0 AND bonus_credits >= 0),
  CONSTRAINT platform_credit_recharge_products_metadata_object_check
    CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE UNIQUE INDEX IF NOT EXISTS platform_credit_recharge_products_code_unique_idx
ON public.platform_credit_recharge_products(code);

CREATE INDEX IF NOT EXISTS platform_credit_recharge_products_enabled_sort_idx
ON public.platform_credit_recharge_products(enabled, sort_order, created_at DESC);

DROP TRIGGER IF EXISTS tr_platform_credit_recharge_products_updated_at
ON public.platform_credit_recharge_products;

CREATE TRIGGER tr_platform_credit_recharge_products_updated_at
  BEFORE UPDATE ON public.platform_credit_recharge_products
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.platform_credit_recharge_products
IS '平台配置的租户积分充值套餐。';
