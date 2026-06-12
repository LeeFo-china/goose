-- Phase 6 destructive cleanup for legacy state-machine objects.
--
-- Preconditions:
-- 1. Workflow runtime backfill has been applied and accepted for the target tenant(s).
-- 2. `bun --cwd apps/api run workflow:cleanup-readiness` reports ready=true.
-- 3. Mini-program and admin clients use workflow subjects/tasks instead of legacy
--    status action, transition-log, approval-chain, and current-step surfaces.
--
-- Rollback:
-- Recreate the dropped tables/columns/functions from their original migrations:
-- - 20260405091426_create_expense_request_table_new.sql
-- - 20260419132000_upgrade_expense_requests_workflow.sql
-- - 20260429224218_add_expense_request_approval_chains.sql
-- - 20260509153000_tenant_scope_expense_task_center.sql
-- - 20260521133000_create_project_status_transition_logs.sql
-- - 20260521143000_create_customer_status_transition_logs.sql
-- - 20260531192000_cast_schedule_construction_start_date.sql
-- Then restore data from the latest pre-cleanup backup. Do not rollback by
-- recreating empty objects in production; that would lose historical state.

DROP FUNCTION IF EXISTS public.schedule_project_construction_transition(
  uuid,
  uuid,
  text,
  text,
  text,
  uuid,
  uuid,
  uuid,
  text,
  jsonb
);

DROP INDEX IF EXISTS public.idx_expense_requests_current_step;

DROP INDEX IF EXISTS public.customer_status_transition_logs_customer_created_idx;
DROP INDEX IF EXISTS public.customer_status_transition_logs_tenant_created_idx;
DROP INDEX IF EXISTS public.customer_status_transition_logs_action_idx;

DROP INDEX IF EXISTS public.project_status_transition_logs_project_created_idx;
DROP INDEX IF EXISTS public.project_status_transition_logs_tenant_created_idx;
DROP INDEX IF EXISTS public.project_status_transition_logs_action_idx;

DROP INDEX IF EXISTS public.idx_expense_request_approval_chains_request_id;
DROP INDEX IF EXISTS public.idx_expense_request_approval_chains_assignee_status;
DROP INDEX IF EXISTS public.idx_expense_request_approval_chains_step_status;
DROP INDEX IF EXISTS public.expense_request_approval_chains_tenant_assignee_status_idx;

DROP TABLE IF EXISTS public.customer_status_transition_logs;
DROP TABLE IF EXISTS public.project_status_transition_logs;
DROP TABLE IF EXISTS public.expense_request_approval_chains;

DROP POLICY IF EXISTS "Approvers view pending" ON public.expense_requests;

ALTER TABLE public.expense_requests
  DROP CONSTRAINT IF EXISTS expense_requests_current_step_check,
  DROP COLUMN IF EXISTS current_step,
  DROP COLUMN IF EXISTS current_step_role;
