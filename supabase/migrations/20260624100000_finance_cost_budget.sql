-- Decoration finance phase 4: project cost categories and project cost budgets.

INSERT INTO public.permissions (code, name, module, resource, action, description, status)
VALUES
  (
    'finance.budget.view',
    '查看项目预算',
    'finance',
    'budget',
    'view',
    '查看项目预算和利润偏差',
    'active'
  ),
  (
    'finance.budget.manage',
    '管理项目预算',
    'finance',
    'budget',
    'manage',
    '维护项目预算',
    'active'
  ),
  (
    'finance.cost-category.view',
    '查看成本分类',
    'finance',
    'cost-category',
    'view',
    '查看租户成本分类',
    'active'
  ),
  (
    'finance.cost-category.manage',
    '管理成本分类',
    'finance',
    'cost-category',
    'manage',
    '维护租户成本分类',
    'active'
  ),
  (
    'finance.cost-allocation.manage',
    '管理成本归集',
    'finance',
    'cost-allocation',
    'manage',
    '调整费用和台账成本分类',
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
    'finance.budget.view',
    'finance.budget.manage',
    'finance.cost-category.view',
    'finance.cost-category.manage',
    'finance.cost-allocation.manage'
  )
WHERE roles.code IN ('system_admin', 'finance_base')
ON CONFLICT (role_id, permission_id) DO UPDATE SET
  access_scope = EXCLUDED.access_scope;

CREATE TABLE IF NOT EXISTS public.finance_cost_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  sort_order integer NOT NULL DEFAULT 100,
  is_system boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid NULL REFERENCES public.employees(id) ON DELETE SET NULL,
  updated_by uuid NULL REFERENCES public.employees(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT finance_cost_categories_status_check
    CHECK (status IN ('active', 'inactive')),
  CONSTRAINT finance_cost_categories_metadata_object_check
    CHECK (jsonb_typeof(metadata) = 'object'),
  CONSTRAINT finance_cost_categories_code_not_blank_check
    CHECK (length(trim(code)) > 0),
  CONSTRAINT finance_cost_categories_name_not_blank_check
    CHECK (length(trim(name)) > 0),
  CONSTRAINT finance_cost_categories_code_format_check
    CHECK (code ~ '^[a-z0-9][a-z0-9_-]*$')
);

CREATE UNIQUE INDEX IF NOT EXISTS finance_cost_categories_tenant_code_uidx
ON public.finance_cost_categories(tenant_id, code);

CREATE INDEX IF NOT EXISTS finance_cost_categories_tenant_status_sort_idx
ON public.finance_cost_categories(tenant_id, status, sort_order);

DROP TRIGGER IF EXISTS tr_finance_cost_categories_updated_at
ON public.finance_cost_categories;

CREATE TRIGGER tr_finance_cost_categories_updated_at
  BEFORE UPDATE ON public.finance_cost_categories
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.project_cost_budgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  cost_category_id uuid NOT NULL REFERENCES public.finance_cost_categories(id),
  budget_amount numeric(12, 2) NOT NULL DEFAULT 0,
  warning_threshold_percent numeric(6, 2) NOT NULL DEFAULT 100,
  status text NOT NULL DEFAULT 'active',
  remark text NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid NULL REFERENCES public.employees(id) ON DELETE SET NULL,
  updated_by uuid NULL REFERENCES public.employees(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_cost_budgets_amount_check CHECK (budget_amount >= 0),
  CONSTRAINT project_cost_budgets_threshold_check
    CHECK (warning_threshold_percent > 0),
  CONSTRAINT project_cost_budgets_status_check
    CHECK (status IN ('active', 'inactive')),
  CONSTRAINT project_cost_budgets_metadata_object_check
    CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE UNIQUE INDEX IF NOT EXISTS project_cost_budgets_active_category_uidx
ON public.project_cost_budgets(tenant_id, project_id, cost_category_id)
WHERE status = 'active';

CREATE INDEX IF NOT EXISTS project_cost_budgets_project_status_idx
ON public.project_cost_budgets(project_id, status);

CREATE INDEX IF NOT EXISTS project_cost_budgets_tenant_project_idx
ON public.project_cost_budgets(tenant_id, project_id);

DROP TRIGGER IF EXISTS tr_project_cost_budgets_updated_at
ON public.project_cost_budgets;

CREATE TRIGGER tr_project_cost_budgets_updated_at
  BEFORE UPDATE ON public.project_cost_budgets
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.expense_requests
ADD COLUMN IF NOT EXISTS cost_category_id uuid NULL
REFERENCES public.finance_cost_categories(id) ON DELETE SET NULL;

ALTER TABLE public.finance_ledger_entries
ADD COLUMN IF NOT EXISTS cost_category_id uuid NULL
REFERENCES public.finance_cost_categories(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS cost_category_updated_by uuid NULL
REFERENCES public.employees(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS cost_category_updated_at timestamptz NULL;

CREATE INDEX IF NOT EXISTS expense_requests_cost_category_idx
ON public.expense_requests(cost_category_id)
WHERE cost_category_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS finance_ledger_entries_cost_category_idx
ON public.finance_ledger_entries(tenant_id, cost_category_id, occurred_at DESC)
WHERE cost_category_id IS NOT NULL;

INSERT INTO public.finance_cost_categories (
  tenant_id,
  code,
  name,
  sort_order,
  is_system
)
SELECT
  tenants.id,
  defaults.code,
  defaults.name,
  defaults.sort_order,
  true
FROM public.tenants
CROSS JOIN (
  VALUES
    ('labor', '人工', 10),
    ('main_material', '主材', 20),
    ('auxiliary_material', '辅材', 30),
    ('outsourcing', '外包', 40),
    ('design', '设计', 50),
    ('management', '管理费', 60),
    ('after_sales', '售后', 70),
    ('other', '其他', 100)
) AS defaults(code, name, sort_order)
ON CONFLICT (tenant_id, code) DO UPDATE SET
  name = EXCLUDED.name,
  sort_order = EXCLUDED.sort_order,
  is_system = true,
  status = 'active';

COMMENT ON TABLE public.finance_cost_categories IS '租户项目成本分类';
COMMENT ON TABLE public.project_cost_budgets IS '项目成本预算';
COMMENT ON COLUMN public.expense_requests.cost_category_id IS '费用申请成本归集分类';
COMMENT ON COLUMN public.finance_ledger_entries.cost_category_id IS '财务流水成本归集分类';
COMMENT ON COLUMN public.finance_ledger_entries.cost_category_updated_by IS '财务流水成本分类调整人';
COMMENT ON COLUMN public.finance_ledger_entries.cost_category_updated_at IS '财务流水成本分类调整时间';
