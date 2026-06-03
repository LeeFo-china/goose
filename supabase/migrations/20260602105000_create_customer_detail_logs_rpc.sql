CREATE OR REPLACE FUNCTION public.list_customer_project_detail_logs(
  p_tenant_id uuid,
  p_customer_id uuid,
  p_project_id uuid,
  p_page_size integer DEFAULT 10
)
RETURNS TABLE (
  id uuid,
  project_id uuid,
  employee_id uuid,
  employee_name text,
  employee_avatar text,
  stage_code text,
  node_name text,
  content text,
  images jsonb,
  created_at timestamptz,
  comment_count bigint,
  rating_count bigint,
  rating_sum numeric,
  my_rating numeric
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
  ),
  log_page AS (
    SELECT
      project_log.id,
      project_log.project_id,
      project_log.employee_id,
      project_log.stage_code,
      project_log.node_name,
      project_log.content,
      project_log.images,
      project_log.created_at,
      project_log.tenant_id
    FROM public.project_logs AS project_log
    JOIN project_scope ON project_scope.id = project_log.project_id
    WHERE project_log.tenant_id = p_tenant_id
    ORDER BY project_log.created_at DESC
    LIMIT GREATEST(p_page_size, 1)
  )
  SELECT
    log_page.id,
    log_page.project_id,
    log_page.employee_id,
    employee.name AS employee_name,
    employee.avatar AS employee_avatar,
    log_page.stage_code,
    log_page.node_name,
    log_page.content,
    CASE
      WHEN log_page.images IS NULL THEN '[]'::jsonb
      WHEN jsonb_typeof(log_page.images::jsonb) = 'array' THEN log_page.images::jsonb
      ELSE '[]'::jsonb
    END AS images,
    log_page.created_at,
    COALESCE(comment_stats.comment_count, 0)::bigint AS comment_count,
    COALESCE(comment_stats.rating_count, 0)::bigint AS rating_count,
    COALESCE(comment_stats.rating_sum, 0)::numeric AS rating_sum,
    comment_stats.my_rating
  FROM log_page
  LEFT JOIN public.employees AS employee
    ON employee.id = log_page.employee_id
    AND employee.tenant_id = log_page.tenant_id
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*) AS comment_count,
      COUNT(project_log_comments.rating) AS rating_count,
      SUM(project_log_comments.rating) AS rating_sum,
      MAX(project_log_comments.rating) FILTER (
        WHERE project_log_comments.author_type = 'customer'
          AND project_log_comments.author_id = p_customer_id
      ) AS my_rating
    FROM public.project_log_comments AS project_log_comments
    WHERE project_log_comments.tenant_id = log_page.tenant_id
      AND project_log_comments.log_id = log_page.id
      AND project_log_comments.deleted_at IS NULL
  ) AS comment_stats ON true
  ORDER BY log_page.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.list_customer_project_detail_logs(uuid, uuid, uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_customer_project_detail_logs(uuid, uuid, uuid, integer) TO service_role;
