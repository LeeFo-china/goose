CREATE OR REPLACE FUNCTION public.get_customer_project_construction_stage_bootstrap(
  p_tenant_id uuid,
  p_customer_id uuid,
  p_project_id uuid
)
RETURNS TABLE (
  project jsonb,
  acceptance_rows jsonb,
  log_rows jsonb,
  latest_log_rows jsonb
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH project_scope AS (
    SELECT project.id, project.tenant_id, project.name, project.customer_id, project.status
    FROM public.projects AS project
    WHERE project.id = p_project_id
      AND project.tenant_id = p_tenant_id
      AND project.customer_id = p_customer_id
    LIMIT 1
  ),
  acceptance_data AS (
    SELECT COALESCE(jsonb_agg(to_jsonb(acceptance) ORDER BY acceptance.created_at DESC), '[]'::jsonb) AS rows
    FROM public.project_acceptances AS acceptance
    JOIN project_scope ON project_scope.id = acceptance.project_id
    WHERE acceptance.tenant_id = p_tenant_id
  ),
  log_stage_data AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('stage_code', stage.stage_code)), '[]'::jsonb) AS rows
    FROM (
      SELECT DISTINCT project_log.stage_code
      FROM public.project_logs AS project_log
      JOIN project_scope ON project_scope.id = project_log.project_id
      WHERE project_log.tenant_id = p_tenant_id
    ) AS stage
  ),
  latest_log_data AS (
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'id', latest.id,
        'stage_code', latest.stage_code,
        'node_name', latest.node_name,
        'content', latest.content,
        'created_at', latest.created_at
      )
      ORDER BY latest.created_at DESC
    ), '[]'::jsonb) AS rows
    FROM (
      SELECT DISTINCT ON (project_log.stage_code)
        project_log.id,
        project_log.stage_code,
        project_log.node_name,
        project_log.content,
        project_log.created_at
      FROM public.project_logs AS project_log
      JOIN project_scope ON project_scope.id = project_log.project_id
      WHERE project_log.tenant_id = p_tenant_id
        AND project_log.stage_code IS NOT NULL
      ORDER BY project_log.stage_code, project_log.created_at DESC
    ) AS latest
  )
  SELECT
    to_jsonb(project_scope) AS project,
    acceptance_data.rows AS acceptance_rows,
    log_stage_data.rows AS log_rows,
    latest_log_data.rows AS latest_log_rows
  FROM project_scope
  CROSS JOIN acceptance_data
  CROSS JOIN log_stage_data
  CROSS JOIN latest_log_data;
$$;

GRANT EXECUTE ON FUNCTION public.get_customer_project_construction_stage_bootstrap(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_customer_project_construction_stage_bootstrap(uuid, uuid, uuid) TO service_role;
