CREATE TABLE IF NOT EXISTS public.roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.roles
DROP CONSTRAINT IF EXISTS roles_status_check;

ALTER TABLE public.roles
ADD CONSTRAINT roles_status_check
CHECK (
  status = ANY (
    ARRAY[
      'active'::text,
      'inactive'::text
    ]
  )
);

CREATE TABLE IF NOT EXISTS public.permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  module text NOT NULL,
  resource text NOT NULL,
  action text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.permissions
DROP CONSTRAINT IF EXISTS permissions_status_check;

ALTER TABLE public.permissions
ADD CONSTRAINT permissions_status_check
CHECK (
  status = ANY (
    ARRAY[
      'active'::text,
      'inactive'::text
    ]
  )
);

CREATE TABLE IF NOT EXISTS public.role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id uuid NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
  access_scope text NOT NULL DEFAULT 'self',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(role_id, permission_id)
);

ALTER TABLE public.role_permissions
DROP CONSTRAINT IF EXISTS role_permissions_access_scope_check;

ALTER TABLE public.role_permissions
ADD CONSTRAINT role_permissions_access_scope_check
CHECK (
  access_scope = ANY (
    ARRAY[
      'self'::text,
      'department'::text,
      'assigned'::text,
      'all'::text
    ]
  )
);

CREATE TABLE IF NOT EXISTS public.employee_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(employee_id, role_id)
);

CREATE TABLE IF NOT EXISTS public.employee_permission_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
  effect text NOT NULL,
  access_scope text,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(employee_id, permission_id)
);

ALTER TABLE public.employee_permission_overrides
DROP CONSTRAINT IF EXISTS employee_permission_overrides_effect_check,
DROP CONSTRAINT IF EXISTS employee_permission_overrides_access_scope_check;

ALTER TABLE public.employee_permission_overrides
ADD CONSTRAINT employee_permission_overrides_effect_check
CHECK (
  effect = ANY (
    ARRAY[
      'allow'::text,
      'deny'::text
    ]
  )
),
ADD CONSTRAINT employee_permission_overrides_access_scope_check
CHECK (
  access_scope IS NULL OR access_scope = ANY (
    ARRAY[
      'self'::text,
      'department'::text,
      'assigned'::text,
      'all'::text
    ]
  )
);

CREATE INDEX IF NOT EXISTS idx_roles_status
ON public.roles(status);

CREATE INDEX IF NOT EXISTS idx_permissions_module
ON public.permissions(module);

CREATE INDEX IF NOT EXISTS idx_permissions_status
ON public.permissions(status);

CREATE INDEX IF NOT EXISTS idx_role_permissions_role_id
ON public.role_permissions(role_id);

CREATE INDEX IF NOT EXISTS idx_role_permissions_permission_id
ON public.role_permissions(permission_id);

CREATE INDEX IF NOT EXISTS idx_employee_roles_employee_id
ON public.employee_roles(employee_id);

CREATE INDEX IF NOT EXISTS idx_employee_roles_role_id
ON public.employee_roles(role_id);

CREATE INDEX IF NOT EXISTS idx_employee_permission_overrides_employee_id
ON public.employee_permission_overrides(employee_id);

CREATE INDEX IF NOT EXISTS idx_employee_permission_overrides_permission_id
ON public.employee_permission_overrides(permission_id);

DROP TRIGGER IF EXISTS tr_roles_updated_at ON public.roles;

CREATE TRIGGER tr_roles_updated_at
  BEFORE UPDATE ON public.roles
  FOR EACH ROW
  EXECUTE PROCEDURE update_updated_at_column();

DROP TRIGGER IF EXISTS tr_permissions_updated_at ON public.permissions;

CREATE TRIGGER tr_permissions_updated_at
  BEFORE UPDATE ON public.permissions
  FOR EACH ROW
  EXECUTE PROCEDURE update_updated_at_column();

DROP TRIGGER IF EXISTS tr_employee_permission_overrides_updated_at ON public.employee_permission_overrides;

CREATE TRIGGER tr_employee_permission_overrides_updated_at
  BEFORE UPDATE ON public.employee_permission_overrides
  FOR EACH ROW
  EXECUTE PROCEDURE update_updated_at_column();

COMMENT ON TABLE public.roles IS '业务角色模板';
COMMENT ON TABLE public.permissions IS '系统权限点';
COMMENT ON TABLE public.role_permissions IS '角色模板与权限映射';
COMMENT ON TABLE public.employee_roles IS '员工与角色模板映射';
COMMENT ON TABLE public.employee_permission_overrides IS '员工级权限覆盖';

COMMENT ON COLUMN public.role_permissions.access_scope IS '角色模板在该权限上的数据范围';
COMMENT ON COLUMN public.employee_permission_overrides.effect IS '覆盖效果：allow/deny';
COMMENT ON COLUMN public.employee_permission_overrides.access_scope IS '员工级放行时的数据范围';

INSERT INTO public.roles (code, name, description, status)
VALUES
  ('system_admin', '系统管理员', '拥有所有后台管理权限', 'active'),
  ('employee_base', '员工基础角色', '普通员工的默认基础权限模板', 'active'),
  ('finance_base', '财务基础角色', '财务人员的默认基础权限模板', 'active')
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  status = EXCLUDED.status;

INSERT INTO public.permissions (code, module, resource, action, description, status)
VALUES
  ('dashboard.read', 'dashboard', 'dashboard', 'read', '查看工作台', 'active'),
  ('customer.read', 'customer', 'customer', 'read', '查看客户', 'active'),
  ('customer.create', 'customer', 'customer', 'create', '新建客户', 'active'),
  ('customer.update', 'customer', 'customer', 'update', '编辑客户', 'active'),
  ('project.read', 'project', 'project', 'read', '查看项目', 'active'),
  ('project.create', 'project', 'project', 'create', '新建项目', 'active'),
  ('project.update', 'project', 'project', 'update', '编辑项目', 'active'),
  ('project.delete', 'project', 'project', 'delete', '删除项目', 'active'),
  ('employee.read', 'employee', 'employee', 'read', '查看员工', 'active'),
  ('employee.create', 'employee', 'employee', 'create', '新建员工', 'active'),
  ('employee.update', 'employee', 'employee', 'update', '编辑员工', 'active'),
  ('employee.permission_manage', 'employee', 'employee', 'permission_manage', '管理员工权限', 'active'),
  ('expense_request.read', 'expense_request', 'expense_request', 'read', '查看费用申请', 'active'),
  ('expense_request.create', 'expense_request', 'expense_request', 'create', '新建费用申请', 'active'),
  ('expense_request.submit', 'expense_request', 'expense_request', 'submit', '提交费用申请', 'active'),
  ('expense_request.approve_manager', 'expense_request', 'expense_request', 'approve_manager', '主管审批费用申请', 'active'),
  ('expense_request.approve_finance', 'expense_request', 'expense_request', 'approve_finance', '财务审批费用申请', 'active'),
  ('expense_request.pay', 'expense_request', 'expense_request', 'pay', '登记费用打款', 'active'),
  ('project_referral.read', 'project_referral', 'project_referral', 'read', '查看项目介绍费', 'active'),
  ('project_referral.manage', 'project_referral', 'project_referral', 'manage', '管理项目介绍费', 'active')
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
ON CONFLICT (role_id, permission_id) DO UPDATE SET
  access_scope = EXCLUDED.access_scope;

INSERT INTO public.role_permissions (role_id, permission_id, access_scope)
SELECT r.id, p.id,
  CASE p.code
    WHEN 'dashboard.read' THEN 'all'
    WHEN 'customer.read' THEN 'self'
    WHEN 'customer.create' THEN 'all'
    WHEN 'customer.update' THEN 'self'
    WHEN 'project.read' THEN 'self'
    WHEN 'project.create' THEN 'all'
    WHEN 'project.update' THEN 'self'
    WHEN 'expense_request.read' THEN 'self'
    WHEN 'expense_request.create' THEN 'all'
    WHEN 'expense_request.submit' THEN 'self'
    ELSE 'self'
  END
FROM public.roles r
JOIN public.permissions p
  ON p.code = ANY (
    ARRAY[
      'dashboard.read',
      'customer.read',
      'customer.create',
      'customer.update',
      'project.read',
      'project.create',
      'project.update',
      'expense_request.read',
      'expense_request.create',
      'expense_request.submit'
    ]
  )
WHERE r.code = 'employee_base'
ON CONFLICT (role_id, permission_id) DO UPDATE SET
  access_scope = EXCLUDED.access_scope;

INSERT INTO public.role_permissions (role_id, permission_id, access_scope)
SELECT r.id, p.id, 'all'
FROM public.roles r
JOIN public.permissions p
  ON p.code = ANY (
    ARRAY[
      'dashboard.read',
      'expense_request.read',
      'expense_request.approve_finance',
      'expense_request.pay',
      'project_referral.read',
      'project_referral.manage'
    ]
  )
WHERE r.code = 'finance_base'
ON CONFLICT (role_id, permission_id) DO UPDATE SET
  access_scope = EXCLUDED.access_scope;

INSERT INTO public.employee_roles (employee_id, role_id)
SELECT e.id, r.id
FROM public.employees e
JOIN public.roles r
  ON (
    (e.role = 'admin' AND r.code = 'system_admin')
    OR (e.role = 'employee' AND r.code = 'employee_base')
    OR (e.role = 'finance' AND r.code = 'finance_base')
  )
ON CONFLICT (employee_id, role_id) DO NOTHING;
