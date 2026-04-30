CREATE INDEX IF NOT EXISTS idx_projects_customer_id_created_at
ON public.projects(customer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_project_logs_project_id_created_at
ON public.project_logs(project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_project_log_comments_log_id_created_at
ON public.project_log_comments(log_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_project_log_comments_parent_id_created_at
ON public.project_log_comments(parent_id, created_at ASC);

CREATE OR REPLACE FUNCTION public.get_customer_project_recent_log_summaries(
  p_customer_id uuid,
  p_project_ids uuid[],
  p_per_project integer DEFAULT 2
)
RETURNS TABLE (
  project_id uuid,
  id uuid,
  stage_code text,
  node_name text,
  created_at timestamptz,
  image_count integer,
  cover_image_path text,
  comment_count bigint,
  rating_count bigint,
  average_rating numeric
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    projects.id AS project_id,
    logs.id,
    logs.stage_code,
    logs.node_name,
    logs.created_at,
    COALESCE(images.image_count, 0)::integer AS image_count,
    images.cover_image_path,
    COALESCE(comment_stats.comment_count, 0)::bigint AS comment_count,
    COALESCE(comment_stats.rating_count, 0)::bigint AS rating_count,
    comment_stats.average_rating
  FROM public.projects AS projects
  CROSS JOIN LATERAL (
    SELECT
      project_logs.id,
      project_logs.stage_code,
      project_logs.node_name,
      project_logs.created_at,
      project_logs.images
    FROM public.project_logs AS project_logs
    WHERE project_logs.project_id = projects.id
    ORDER BY project_logs.created_at DESC
    LIMIT GREATEST(LEAST(COALESCE(p_per_project, 2), 10), 0)
  ) AS logs
  LEFT JOIN LATERAL (
    SELECT
      jsonb_array_length(image_array.images) AS image_count,
      (
        SELECT image_value
        FROM jsonb_array_elements_text(image_array.images) WITH ORDINALITY AS image_items(image_value, image_index)
        ORDER BY image_index ASC
        LIMIT 1
      ) AS cover_image_path
    FROM (
      SELECT CASE
        WHEN logs.images IS NULL THEN '[]'::jsonb
        WHEN jsonb_typeof(logs.images::jsonb) = 'array' THEN logs.images::jsonb
        ELSE '[]'::jsonb
      END AS images
    ) AS image_array
  ) AS images ON true
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*) AS comment_count,
      COUNT(project_log_comments.rating) AS rating_count,
      ROUND(AVG(project_log_comments.rating)::numeric, 1) AS average_rating
    FROM public.project_log_comments AS project_log_comments
    WHERE project_log_comments.log_id = logs.id
      AND project_log_comments.deleted_at IS NULL
  ) AS comment_stats ON true
  WHERE projects.customer_id = p_customer_id
    AND projects.id = ANY(p_project_ids)
  ORDER BY projects.id, logs.created_at DESC;
$$;

COMMENT ON FUNCTION public.get_customer_project_recent_log_summaries(uuid, uuid[], integer)
IS '按项目批量返回客户首页最近施工日志摘要，避免首页按项目 N+1 拉取完整日志';
