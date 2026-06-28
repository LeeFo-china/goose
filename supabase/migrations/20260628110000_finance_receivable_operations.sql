-- Finance phase 6: receivable operations, follow-up events, and audit trail.

ALTER TABLE public.project_receivable_plans
  ADD COLUMN IF NOT EXISTS owner_employee_id uuid NULL
    REFERENCES public.employees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS latest_follow_up_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS latest_follow_up_note text NULL,
  ADD COLUMN IF NOT EXISTS next_follow_up_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS canceled_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS canceled_by uuid NULL
    REFERENCES public.employees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS canceled_reason text NULL;

CREATE INDEX IF NOT EXISTS project_receivable_plans_tenant_owner_due_idx
ON public.project_receivable_plans(tenant_id, owner_employee_id, due_date)
WHERE owner_employee_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS project_receivable_plans_tenant_follow_up_idx
ON public.project_receivable_plans(tenant_id, next_follow_up_at)
WHERE next_follow_up_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.project_receivable_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  receivable_plan_id uuid NOT NULL
    REFERENCES public.project_receivable_plans(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  title text NOT NULL,
  note text NULL,
  before_snapshot jsonb NULL,
  after_snapshot jsonb NULL,
  next_follow_up_at timestamptz NULL,
  created_by uuid NULL REFERENCES public.employees(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_receivable_events_event_type_check
    CHECK (event_type IN ('manual_created', 'adjusted', 'canceled', 'follow_up')),
  CONSTRAINT project_receivable_events_before_snapshot_object_check
    CHECK (before_snapshot IS NULL OR jsonb_typeof(before_snapshot) = 'object'),
  CONSTRAINT project_receivable_events_after_snapshot_object_check
    CHECK (after_snapshot IS NULL OR jsonb_typeof(after_snapshot) = 'object')
);

CREATE INDEX IF NOT EXISTS project_receivable_events_tenant_created_idx
ON public.project_receivable_events(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS project_receivable_events_plan_created_idx
ON public.project_receivable_events(receivable_plan_id, created_at DESC);

CREATE INDEX IF NOT EXISTS project_receivable_events_project_created_idx
ON public.project_receivable_events(tenant_id, project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS project_receivable_events_tenant_type_created_idx
ON public.project_receivable_events(tenant_id, event_type, created_at DESC);

INSERT INTO public.permissions (code, name, module, resource, action, description, status)
VALUES (
  'finance.receivable.manage',
  '管理应收计划',
  'finance',
  'receivable',
  'manage',
  '创建、调整、取消、跟进和核销项目应收计划',
  'active'
)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  module = EXCLUDED.module,
  resource = EXCLUDED.resource,
  action = EXCLUDED.action,
  description = EXCLUDED.description,
  status = EXCLUDED.status;
