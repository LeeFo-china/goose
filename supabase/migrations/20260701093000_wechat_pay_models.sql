-- Phase 9 Task 1: WeChat Pay configuration extensions, order records,
-- notifications, and first-batch permissions.

INSERT INTO public.permissions (code, name, module, resource, action, description, status)
VALUES
  (
    'wechat_pay.config.read',
    '查看微信支付配置',
    'wechat_pay',
    'config',
    'read',
    '查看租户微信支付配置脱敏信息',
    'active'
  ),
  (
    'wechat_pay.config.manage',
    '管理微信支付配置',
    'wechat_pay',
    'config',
    'manage',
    '管理租户微信支付商户配置和启停状态',
    'active'
  ),
  (
    'wechat_pay.order.read',
    '查看微信支付订单',
    'wechat_pay',
    'order',
    'read',
    '查看微信支付订单和支付状态',
    'active'
  ),
  (
    'wechat_pay.notify.read',
    '查看微信支付回调',
    'wechat_pay',
    'notify',
    'read',
    '查看微信支付回调接收和处理记录',
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
    'wechat_pay.config.read',
    'wechat_pay.config.manage',
    'wechat_pay.order.read',
    'wechat_pay.notify.read'
  )
WHERE roles.code = 'system_admin'
ON CONFLICT (role_id, permission_id) DO UPDATE SET
  access_scope = EXCLUDED.access_scope;

INSERT INTO public.role_permissions (role_id, permission_id, access_scope)
SELECT roles.id, permissions.id, 'all'
FROM public.roles
JOIN public.permissions
  ON permissions.code IN (
    'wechat_pay.order.read',
    'wechat_pay.notify.read'
  )
WHERE roles.code = 'finance_base'
ON CONFLICT (role_id, permission_id) DO UPDATE SET
  access_scope = EXCLUDED.access_scope;

ALTER TABLE public.tenant_payment_configs
ADD COLUMN IF NOT EXISTS merchant_name text NULL,
ADD COLUMN IF NOT EXISTS serial_no text NULL,
ADD COLUMN IF NOT EXISTS notify_url text NULL,
ADD COLUMN IF NOT EXISTS validation_status text NOT NULL DEFAULT 'unchecked',
ADD COLUMN IF NOT EXISTS last_validated_at timestamptz NULL,
ADD COLUMN IF NOT EXISTS created_by_employee_id uuid NULL REFERENCES public.employees(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS updated_by_employee_id uuid NULL REFERENCES public.employees(id) ON DELETE SET NULL;

ALTER TABLE public.tenant_payment_configs
DROP CONSTRAINT IF EXISTS tenant_payment_configs_validation_status_check;

ALTER TABLE public.tenant_payment_configs
ADD CONSTRAINT tenant_payment_configs_validation_status_check
CHECK (validation_status IN ('unchecked', 'valid', 'invalid'));

CREATE INDEX IF NOT EXISTS tenant_payment_configs_validation_status_idx
ON public.tenant_payment_configs(provider, validation_status);

CREATE TABLE IF NOT EXISTS public.wechat_payment_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  payment_config_id uuid NULL REFERENCES public.tenant_payment_configs(id) ON DELETE SET NULL,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  workflow_instance_id uuid NULL REFERENCES public.workflow_instances(id) ON DELETE SET NULL,
  workflow_task_id uuid NULL REFERENCES public.workflow_tasks(id) ON DELETE SET NULL,
  receivable_plan_id uuid NULL REFERENCES public.project_receivable_plans(id) ON DELETE SET NULL,
  payment_id uuid NULL REFERENCES public.payments(id) ON DELETE SET NULL,
  out_trade_no text NOT NULL,
  transaction_id text NULL,
  amount numeric(12, 2) NOT NULL,
  paid_amount numeric(12, 2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'CNY',
  status text NOT NULL DEFAULT 'pending',
  payer_openid text NULL,
  prepay_id text NULL,
  paid_at timestamptz NULL,
  closed_at timestamptz NULL,
  failed_at timestamptz NULL,
  failure_reason text NULL,
  latest_notification_id uuid NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by_employee_id uuid NULL REFERENCES public.employees(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wechat_payment_orders_out_trade_no_not_blank
    CHECK (btrim(out_trade_no) <> ''),
  CONSTRAINT wechat_payment_orders_transaction_id_not_blank
    CHECK (transaction_id IS NULL OR btrim(transaction_id) <> ''),
  CONSTRAINT wechat_payment_orders_amount_check CHECK (amount > 0),
  CONSTRAINT wechat_payment_orders_paid_amount_check CHECK (paid_amount >= 0),
  CONSTRAINT wechat_payment_orders_currency_check CHECK (currency = 'CNY'),
  CONSTRAINT wechat_payment_orders_status_check
    CHECK (status IN ('pending', 'paid', 'closed', 'refunded', 'failed')),
  CONSTRAINT wechat_payment_orders_metadata_object_check
    CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE UNIQUE INDEX IF NOT EXISTS wechat_payment_orders_tenant_out_trade_unique_idx
ON public.wechat_payment_orders(tenant_id, out_trade_no);

CREATE UNIQUE INDEX IF NOT EXISTS wechat_payment_orders_transaction_unique_idx
ON public.wechat_payment_orders(transaction_id)
WHERE transaction_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS wechat_payment_orders_pending_task_unique_idx
ON public.wechat_payment_orders(tenant_id, workflow_task_id)
WHERE workflow_task_id IS NOT NULL AND status = 'pending';

CREATE INDEX IF NOT EXISTS wechat_payment_orders_tenant_status_created_idx
ON public.wechat_payment_orders(tenant_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS wechat_payment_orders_project_created_idx
ON public.wechat_payment_orders(project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS wechat_payment_orders_receivable_plan_idx
ON public.wechat_payment_orders(receivable_plan_id)
WHERE receivable_plan_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS wechat_payment_orders_payment_idx
ON public.wechat_payment_orders(payment_id)
WHERE payment_id IS NOT NULL;

DROP TRIGGER IF EXISTS tr_wechat_payment_orders_updated_at
ON public.wechat_payment_orders;

CREATE TRIGGER tr_wechat_payment_orders_updated_at
  BEFORE UPDATE ON public.wechat_payment_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.wechat_payment_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  order_id uuid NULL REFERENCES public.wechat_payment_orders(id) ON DELETE SET NULL,
  notify_id text NOT NULL,
  event_type text NOT NULL,
  resource_type text NULL,
  summary text NULL,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  signature_valid boolean NOT NULL DEFAULT false,
  processed boolean NOT NULL DEFAULT false,
  processed_at timestamptz NULL,
  error_message text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wechat_payment_notifications_notify_id_not_blank
    CHECK (btrim(notify_id) <> ''),
  CONSTRAINT wechat_payment_notifications_event_type_not_blank
    CHECK (btrim(event_type) <> ''),
  CONSTRAINT wechat_payment_notifications_raw_payload_object_check
    CHECK (jsonb_typeof(raw_payload) = 'object')
);

CREATE UNIQUE INDEX IF NOT EXISTS wechat_payment_notifications_notify_unique_idx
ON public.wechat_payment_notifications(tenant_id, notify_id);

CREATE INDEX IF NOT EXISTS wechat_payment_notifications_tenant_created_idx
ON public.wechat_payment_notifications(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS wechat_payment_notifications_order_created_idx
ON public.wechat_payment_notifications(order_id, created_at DESC)
WHERE order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS wechat_payment_notifications_processed_idx
ON public.wechat_payment_notifications(tenant_id, processed, created_at DESC);

COMMENT ON COLUMN public.tenant_payment_configs.merchant_name
  IS '微信支付商户展示名称，非密钥字段';
COMMENT ON COLUMN public.tenant_payment_configs.serial_no
  IS '微信支付商户证书序列号，Admin 只展示脱敏信息';
COMMENT ON COLUMN public.tenant_payment_configs.notify_url
  IS '微信支付支付结果回调地址';
COMMENT ON COLUMN public.tenant_payment_configs.validation_status
  IS '微信支付配置校验状态：unchecked/valid/invalid';
COMMENT ON TABLE public.wechat_payment_orders
  IS '微信支付订单，关联项目收款 workflow task、应收计划和 confirmed payment';
COMMENT ON TABLE public.wechat_payment_notifications
  IS '微信支付回调通知接收与幂等处理记录';
