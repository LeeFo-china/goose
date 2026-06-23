-- Backfill procedure assignment completion for stages whose acceptance has
-- already been customer-confirmed. This repairs historical workflow runtime
-- advances that closed the procedure node through acceptance confirmation
-- without updating project_procedure_assignments.

WITH latest_confirmed_acceptances AS (
  SELECT DISTINCT ON (tenant_id, project_id, stage_code)
    tenant_id,
    project_id,
    stage_code,
    customer_confirmed_at,
    updated_at
  FROM public.project_acceptances
  WHERE status = 'customer_confirmed'
    AND stage_code IS NOT NULL
  ORDER BY
    tenant_id,
    project_id,
    stage_code,
    customer_confirmed_at DESC NULLS LAST,
    updated_at DESC
)
UPDATE public.project_procedure_assignments AS assignment
SET
  status = 'completed',
  completed_at = COALESCE(
    latest.customer_confirmed_at,
    latest.updated_at,
    NOW()
  ),
  updated_at = NOW()
FROM latest_confirmed_acceptances AS latest
WHERE assignment.tenant_id = latest.tenant_id
  AND assignment.project_id = latest.project_id
  AND assignment.stage_code = latest.stage_code
  AND assignment.status IN ('planned', 'in_progress')
  AND assignment.completed_at IS NULL;
