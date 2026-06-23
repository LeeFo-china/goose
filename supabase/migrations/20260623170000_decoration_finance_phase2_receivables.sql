-- Decoration finance phase 2: project receivable plans and allocations.

INSERT INTO public.permissions (code, name, module, resource, action, description, status)
VALUES
  (
    'finance.receivable.view',
    '查看应收计划',
    'finance',
    'receivable',
    'view',
    '查看项目应收计划、欠款和逾期应收',
    'active'
  ),
  (
    'finance.receivable.manage',
    '管理应收计划',
    'finance',
    'receivable',
    'manage',
    '创建、调整和核销项目应收计划',
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
    'finance.receivable.view',
    'finance.receivable.manage'
  )
WHERE roles.code IN ('system_admin', 'finance_base')
ON CONFLICT (role_id, permission_id) DO UPDATE SET
  access_scope = EXCLUDED.access_scope;

CREATE TABLE IF NOT EXISTS public.project_receivable_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  workflow_instance_id uuid NULL REFERENCES public.workflow_instances(id) ON DELETE SET NULL,
  workflow_node_key text NULL,
  source_type text NOT NULL,
  source_id uuid NULL,
  payment_type text NOT NULL,
  title text NOT NULL,
  amount numeric(12, 2) NOT NULL,
  due_date date NOT NULL,
  paid_amount numeric(12, 2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  created_by uuid NULL REFERENCES public.employees(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_receivable_plans_payment_type_check
    CHECK (payment_type IN ('deposit', 'stage_1', 'stage_2', 'stage_3', 'add_on')),
  CONSTRAINT project_receivable_plans_source_type_check
    CHECK (source_type IN ('workflow_node', 'manual', 'migration', 'add_on')),
  CONSTRAINT project_receivable_plans_status_check
    CHECK (status IN ('pending', 'partially_paid', 'paid', 'overdue', 'canceled')),
  CONSTRAINT project_receivable_plans_amount_check CHECK (amount > 0),
  CONSTRAINT project_receivable_plans_paid_amount_check
    CHECK (paid_amount >= 0 AND paid_amount <= amount),
  CONSTRAINT project_receivable_plans_metadata_object_check
    CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE UNIQUE INDEX IF NOT EXISTS project_receivable_plans_source_unique_idx
ON public.project_receivable_plans(tenant_id, source_type, source_id, payment_type)
WHERE source_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS project_receivable_plans_tenant_status_due_idx
ON public.project_receivable_plans(tenant_id, status, due_date);

CREATE INDEX IF NOT EXISTS project_receivable_plans_project_due_idx
ON public.project_receivable_plans(project_id, due_date);

CREATE INDEX IF NOT EXISTS project_receivable_plans_tenant_type_due_idx
ON public.project_receivable_plans(tenant_id, payment_type, due_date);

CREATE INDEX IF NOT EXISTS project_receivable_plans_workflow_instance_idx
ON public.project_receivable_plans(workflow_instance_id)
WHERE workflow_instance_id IS NOT NULL;

DROP TRIGGER IF EXISTS tr_project_receivable_plans_updated_at
ON public.project_receivable_plans;

CREATE TRIGGER tr_project_receivable_plans_updated_at
  BEFORE UPDATE ON public.project_receivable_plans
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.project_receivable_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  receivable_plan_id uuid NOT NULL REFERENCES public.project_receivable_plans(id) ON DELETE CASCADE,
  payment_id uuid NOT NULL REFERENCES public.payments(id) ON DELETE CASCADE,
  amount numeric(12, 2) NOT NULL,
  allocated_by uuid NULL REFERENCES public.employees(id) ON DELETE SET NULL,
  allocated_at timestamptz NOT NULL DEFAULT now(),
  source_type text NOT NULL,
  source_id uuid NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_receivable_allocations_source_type_check
    CHECK (source_type IN ('workflow_task', 'manual', 'wechat_pay_callback')),
  CONSTRAINT project_receivable_allocations_amount_check CHECK (amount > 0),
  CONSTRAINT project_receivable_allocations_metadata_object_check
    CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE UNIQUE INDEX IF NOT EXISTS project_receivable_allocations_source_unique_idx
ON public.project_receivable_allocations(
  tenant_id,
  source_type,
  source_id,
  receivable_plan_id
)
WHERE source_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS project_receivable_allocations_plan_idx
ON public.project_receivable_allocations(receivable_plan_id);

CREATE INDEX IF NOT EXISTS project_receivable_allocations_payment_idx
ON public.project_receivable_allocations(payment_id);

CREATE INDEX IF NOT EXISTS project_receivable_allocations_tenant_allocated_idx
ON public.project_receivable_allocations(tenant_id, allocated_at DESC);

DROP TRIGGER IF EXISTS tr_project_receivable_allocations_updated_at
ON public.project_receivable_allocations;

CREATE TRIGGER tr_project_receivable_allocations_updated_at
  BEFORE UPDATE ON public.project_receivable_allocations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
