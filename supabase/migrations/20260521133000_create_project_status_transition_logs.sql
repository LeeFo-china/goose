CREATE TABLE IF NOT EXISTS public.project_status_transition_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  from_status text,
  to_status text NOT NULL,
  action text NOT NULL,
  operator_employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  operator_auth_user_id uuid,
  reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.project_status_transition_logs
DROP CONSTRAINT IF EXISTS project_status_transition_logs_action_check,
DROP CONSTRAINT IF EXISTS project_status_transition_logs_from_status_check,
DROP CONSTRAINT IF EXISTS project_status_transition_logs_to_status_check;

ALTER TABLE public.project_status_transition_logs
ADD CONSTRAINT project_status_transition_logs_action_check
CHECK (
  action IN (
    'start_measure',
    'start_negotiation',
    'sign_contract',
    'start_design',
    'start_construction',
    'pause_project',
    'resume_project',
    'start_acceptance',
    'complete_project',
    'start_after_sale',
    'mark_invalid'
  )
),
ADD CONSTRAINT project_status_transition_logs_from_status_check
CHECK (
  from_status IS NULL OR from_status IN (
    'lead',
    'measure',
    'negotiating',
    'signed',
    'designing',
    'constructing',
    'on_hold',
    'acceptance',
    'completed',
    'after_sale',
    'invalid'
  )
),
ADD CONSTRAINT project_status_transition_logs_to_status_check
CHECK (
  to_status IN (
    'lead',
    'measure',
    'negotiating',
    'signed',
    'designing',
    'constructing',
    'on_hold',
    'acceptance',
    'completed',
    'after_sale',
    'invalid'
  )
);

CREATE INDEX IF NOT EXISTS project_status_transition_logs_project_created_idx
ON public.project_status_transition_logs(project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS project_status_transition_logs_tenant_created_idx
ON public.project_status_transition_logs(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS project_status_transition_logs_action_idx
ON public.project_status_transition_logs(action);

COMMENT ON TABLE public.project_status_transition_logs IS '项目状态机流转日志';
COMMENT ON COLUMN public.project_status_transition_logs.action IS '项目状态动作';
COMMENT ON COLUMN public.project_status_transition_logs.metadata IS '状态动作上下文，例如 paused_from_status';

