CREATE TABLE IF NOT EXISTS public.expense_request_approval_chains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_request_id uuid NOT NULL REFERENCES public.expense_requests(id) ON DELETE CASCADE,
  step text NOT NULL,
  step_name text NOT NULL,
  sort_order integer NOT NULL,
  assignee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
  assignee_name_snapshot text NULL,
  required_permission text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  acted_by uuid NULL REFERENCES public.employees(id) ON DELETE SET NULL,
  acted_at timestamptz NULL,
  comment text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NULL,
  UNIQUE(expense_request_id, step),
  UNIQUE(expense_request_id, sort_order)
);

ALTER TABLE public.expense_request_approval_chains
DROP CONSTRAINT IF EXISTS expense_request_approval_chains_step_check,
DROP CONSTRAINT IF EXISTS expense_request_approval_chains_status_check;

ALTER TABLE public.expense_request_approval_chains
ADD CONSTRAINT expense_request_approval_chains_step_check
CHECK (step IN ('manager_review', 'finance_review', 'payment')),
ADD CONSTRAINT expense_request_approval_chains_status_check
CHECK (status IN ('pending', 'current', 'approved', 'rejected', 'skipped', 'cancelled'));

CREATE INDEX IF NOT EXISTS idx_expense_request_approval_chains_request_id
ON public.expense_request_approval_chains(expense_request_id);

CREATE INDEX IF NOT EXISTS idx_expense_request_approval_chains_assignee_status
ON public.expense_request_approval_chains(assignee_id, status);

CREATE INDEX IF NOT EXISTS idx_expense_request_approval_chains_step_status
ON public.expense_request_approval_chains(step, status);

COMMENT ON TABLE public.expense_request_approval_chains IS '费用申请计划审批链';
COMMENT ON COLUMN public.expense_request_approval_chains.status IS '节点状态: pending/current/approved/rejected/skipped/cancelled';
