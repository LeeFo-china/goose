INSERT INTO public.permissions (code, module, resource, action, description, status)
VALUES
  ('customer.phone.view', 'customer', 'customer_phone', 'view', '查看客户完整手机号', 'active'),
  ('customer.phone.call', 'customer', 'customer_phone', 'call', '拨打客户手机号', 'active'),
  ('customer.phone.copy', 'customer', 'customer_phone', 'copy', '复制客户手机号', 'active')
ON CONFLICT (code) DO UPDATE SET
  module = EXCLUDED.module,
  resource = EXCLUDED.resource,
  action = EXCLUDED.action,
  description = EXCLUDED.description,
  status = EXCLUDED.status;

INSERT INTO public.role_permissions (role_id, permission_id, access_scope)
SELECT r.id, p.id, 'all'
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.code = 'system_admin'
  AND p.code IN (
    'customer.phone.view',
    'customer.phone.call',
    'customer.phone.copy'
  )
ON CONFLICT (role_id, permission_id) DO UPDATE SET
  access_scope = EXCLUDED.access_scope;

INSERT INTO public.role_permissions (role_id, permission_id, access_scope)
SELECT r.id, p.id, 'self'
FROM public.roles r
JOIN public.permissions p
  ON p.code = 'customer.phone.call'
WHERE r.code = 'employee_base'
ON CONFLICT (role_id, permission_id) DO UPDATE SET
  access_scope = EXCLUDED.access_scope;

INSERT INTO public.role_permissions (role_id, permission_id, access_scope)
SELECT r.id, p.id, 'department'
FROM public.roles r
JOIN public.permissions p
  ON p.code IN (
    'customer.phone.view',
    'customer.phone.call'
  )
WHERE r.code IN ('design_manage', 'seller_manage')
ON CONFLICT (role_id, permission_id) DO UPDATE SET
  access_scope = EXCLUDED.access_scope;

CREATE TABLE IF NOT EXISTS public.customer_phone_access_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  employee_id uuid NULL REFERENCES public.employees(id) ON DELETE SET NULL,
  auth_user_id uuid NULL,
  action text NOT NULL,
  scene text NULL,
  reason text NULL,
  phone_masked text NULL,
  permission_code text NULL,
  permission_scope text NULL,
  ip_address text NULL,
  user_agent text NULL,
  openid text NULL,
  request_id text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.customer_phone_access_logs
DROP CONSTRAINT IF EXISTS customer_phone_access_logs_action_check;

ALTER TABLE public.customer_phone_access_logs
ADD CONSTRAINT customer_phone_access_logs_action_check
CHECK (action IN ('reveal', 'call', 'copy'));

CREATE INDEX IF NOT EXISTS idx_customer_phone_access_logs_customer_id
ON public.customer_phone_access_logs(customer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_customer_phone_access_logs_employee_id
ON public.customer_phone_access_logs(employee_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_customer_phone_access_logs_action
ON public.customer_phone_access_logs(action, created_at DESC);

COMMENT ON TABLE public.customer_phone_access_logs IS '客户手机号敏感访问审计日志';
COMMENT ON COLUMN public.customer_phone_access_logs.action IS '敏感动作: reveal/call/copy';
COMMENT ON COLUMN public.customer_phone_access_logs.phone_masked IS '脱敏手机号，不存储完整手机号';
