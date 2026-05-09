ALTER TABLE public.project_logs
ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

ALTER TABLE public.project_log_comments
ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

WITH default_tenant AS (
  SELECT id FROM public.tenants WHERE slug = 'gooes_default'
)
UPDATE public.project_logs AS logs
SET tenant_id = COALESCE(projects.tenant_id, (SELECT id FROM default_tenant))
FROM public.projects AS projects
WHERE logs.project_id = projects.id
  AND logs.tenant_id IS NULL;

WITH default_tenant AS (
  SELECT id FROM public.tenants WHERE slug = 'gooes_default'
)
UPDATE public.project_logs
SET tenant_id = (SELECT id FROM default_tenant)
WHERE tenant_id IS NULL;

UPDATE public.project_log_comments AS comments
SET tenant_id = logs.tenant_id
FROM public.project_logs AS logs
WHERE comments.log_id = logs.id
  AND comments.tenant_id IS NULL;

CREATE INDEX IF NOT EXISTS project_logs_tenant_project_created_at_idx
ON public.project_logs(tenant_id, project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS project_logs_tenant_employee_created_at_idx
ON public.project_logs(tenant_id, employee_id, created_at DESC);

CREATE INDEX IF NOT EXISTS project_logs_tenant_stage_created_at_idx
ON public.project_logs(tenant_id, stage_code, created_at DESC);

CREATE INDEX IF NOT EXISTS project_log_comments_tenant_log_created_at_idx
ON public.project_log_comments(tenant_id, log_id, created_at ASC);

CREATE INDEX IF NOT EXISTS project_log_comments_tenant_author_idx
ON public.project_log_comments(tenant_id, author_type, author_id);

COMMENT ON COLUMN public.project_logs.tenant_id IS '施工日志所属租户';
COMMENT ON COLUMN public.project_log_comments.tenant_id IS '施工日志评论所属租户';

DROP FUNCTION IF EXISTS public.get_customer_project_recent_log_summaries(uuid, uuid[], integer);

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
      project_logs.images,
      project_logs.tenant_id
    FROM public.project_logs AS project_logs
    WHERE project_logs.project_id = projects.id
      AND project_logs.tenant_id = projects.tenant_id
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
      AND project_log_comments.tenant_id = logs.tenant_id
      AND project_log_comments.deleted_at IS NULL
  ) AS comment_stats ON true
  WHERE projects.customer_id = p_customer_id
    AND projects.id = ANY(p_project_ids)
  ORDER BY projects.id, logs.created_at DESC;
$$;

COMMENT ON FUNCTION public.get_customer_project_recent_log_summaries(uuid, uuid[], integer)
IS '按项目批量返回客户首页最近施工日志摘要，限制日志与评论同租户，避免首页按项目 N+1 拉取完整日志';
