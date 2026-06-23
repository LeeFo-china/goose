-- Project receivable summary RPC for finance phase 2.

CREATE OR REPLACE FUNCTION public.get_project_receivable_summary(
  p_tenant_id uuid,
  p_project_id uuid,
  p_today date DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  contract_amount numeric,
  receivable_amount numeric,
  paid_amount numeric,
  remaining_amount numeric,
  overdue_amount numeric,
  overdue_count bigint
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    COALESCE(projects.signed_amount, 0)::numeric(12, 2) AS contract_amount,
    COALESCE(
      SUM(plans.amount) FILTER (WHERE plans.status <> 'canceled'),
      0
    )::numeric(12, 2) AS receivable_amount,
    COALESCE(
      SUM(LEAST(plans.paid_amount, plans.amount))
        FILTER (WHERE plans.status <> 'canceled'),
      0
    )::numeric(12, 2) AS paid_amount,
    COALESCE(
      SUM(GREATEST(plans.amount - plans.paid_amount, 0))
        FILTER (WHERE plans.status <> 'canceled'),
      0
    )::numeric(12, 2) AS remaining_amount,
    COALESCE(
      SUM(GREATEST(plans.amount - plans.paid_amount, 0))
        FILTER (
          WHERE plans.status NOT IN ('paid', 'canceled')
            AND plans.due_date < p_today
        ),
      0
    )::numeric(12, 2) AS overdue_amount,
    COUNT(plans.id)
      FILTER (
        WHERE plans.status NOT IN ('paid', 'canceled')
          AND plans.due_date < p_today
          AND GREATEST(plans.amount - plans.paid_amount, 0) > 0
      ) AS overdue_count
  FROM public.projects
  LEFT JOIN public.project_receivable_plans plans
    ON plans.project_id = projects.id
   AND plans.tenant_id = projects.tenant_id
  WHERE projects.id = p_project_id
    AND projects.tenant_id = p_tenant_id
  GROUP BY projects.signed_amount;
$$;
