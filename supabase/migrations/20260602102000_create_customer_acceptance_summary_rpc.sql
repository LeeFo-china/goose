CREATE OR REPLACE FUNCTION public.list_customer_project_acceptance_summaries(
  p_tenant_id uuid,
  p_customer_id uuid,
  p_project_id uuid,
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 20,
  p_status text DEFAULT NULL,
  p_stage_code text DEFAULT NULL
)
RETURNS TABLE (
  project_valid boolean,
  id uuid,
  tenant_id uuid,
  project_id uuid,
  acceptance_type text,
  stage_code text,
  template_id uuid,
  template_version integer,
  template_snapshot jsonb,
  title text,
  status text,
  initiator_id uuid,
  reviewer_id uuid,
  customer_id uuid,
  summary text,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  customer_confirmed_at timestamptz,
  completed_at timestamptz,
  rejected_at timestamptz,
  reject_reason text,
  reject_source text,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH project_scope AS (
    SELECT project.id
    FROM public.projects AS project
    WHERE project.id = p_project_id
      AND project.tenant_id = p_tenant_id
      AND project.customer_id = p_customer_id
    LIMIT 1
  )
  SELECT
    true AS project_valid,
    acceptance.id,
    acceptance.tenant_id,
    acceptance.project_id,
    acceptance.acceptance_type,
    acceptance.stage_code,
    acceptance.template_id,
    acceptance.template_version,
    acceptance.template_snapshot,
    acceptance.title,
    acceptance.status,
    acceptance.initiator_id,
    acceptance.reviewer_id,
    acceptance.customer_id,
    acceptance.summary,
    acceptance.submitted_at,
    acceptance.reviewed_at,
    acceptance.customer_confirmed_at,
    acceptance.completed_at,
    acceptance.rejected_at,
    acceptance.reject_reason,
    acceptance.reject_source,
    acceptance.created_at,
    acceptance.updated_at
  FROM project_scope
  LEFT JOIN LATERAL (
    SELECT row.*
    FROM public.project_acceptances AS row
    WHERE row.tenant_id = p_tenant_id
      AND row.customer_id = p_customer_id
      AND row.project_id = p_project_id
      AND (p_status IS NULL OR row.status = p_status)
      AND (p_stage_code IS NULL OR row.stage_code = p_stage_code)
    ORDER BY row.created_at DESC
    OFFSET GREATEST(p_page - 1, 0) * GREATEST(p_page_size, 1)
    LIMIT GREATEST(p_page_size, 1)
  ) AS acceptance ON true;
$$;

GRANT EXECUTE ON FUNCTION public.list_customer_project_acceptance_summaries(uuid, uuid, uuid, integer, integer, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_customer_project_acceptance_summaries(uuid, uuid, uuid, integer, integer, text, text) TO service_role;
