ALTER TABLE public.expense_request_approvals
ADD COLUMN IF NOT EXISTS approval_round integer NOT NULL DEFAULT 1;

COMMENT ON COLUMN public.expense_request_approvals.approval_round IS
  '审批轮次；驳回后重新提交递增，用于同轮次审批动作幂等';

UPDATE public.expense_request_approvals
SET approval_round = 1
WHERE approval_round IS NULL;

WITH ranked AS (
  SELECT
    ctid,
    row_number() OVER (
      PARTITION BY
        tenant_id,
        expense_request_id,
        approval_round,
        step,
        action,
        approver_id
      ORDER BY created_at ASC, id ASC
    ) AS rn
  FROM public.expense_request_approvals
)
DELETE FROM public.expense_request_approvals approvals
USING ranked
WHERE approvals.ctid = ranked.ctid
  AND ranked.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS expense_request_approvals_action_idempotency_unique
ON public.expense_request_approvals(
  tenant_id,
  expense_request_id,
  approval_round,
  step,
  action,
  approver_id
);

CREATE UNIQUE INDEX IF NOT EXISTS expense_request_settlements_request_unique
ON public.expense_request_settlements(expense_request_id);
