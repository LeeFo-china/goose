ALTER TABLE public.project_logs
ADD COLUMN IF NOT EXISTS stage_code text;

ALTER TABLE public.project_logs
ALTER COLUMN node_name DROP NOT NULL;

ALTER TABLE public.project_logs
DROP CONSTRAINT IF EXISTS project_logs_stage_code_check;

ALTER TABLE public.project_logs
ADD CONSTRAINT project_logs_stage_code_check
CHECK (
  stage_code IS NULL OR stage_code IN (
    'measure',
    'demolition',
    'plumbing_electrical',
    'tiling',
    'woodwork',
    'painting',
    'installation',
    'completion'
  )
);

COMMENT ON COLUMN public.project_logs.stage_code IS '施工日志标准阶段枚举';
COMMENT ON COLUMN public.project_logs.node_name IS '施工节点补充描述，可为空';

CREATE INDEX IF NOT EXISTS idx_project_logs_stage_code
ON public.project_logs(stage_code);

DROP FUNCTION IF EXISTS public.get_project_log_calendar(uuid, text);

CREATE OR REPLACE FUNCTION public.get_project_log_calendar(
  project_uuid uuid,
  timezone_name text DEFAULT 'Asia/Shanghai'
)
RETURNS TABLE (
  date text,
  count bigint,
  stage_code text,
  node_name text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH ranked AS (
    SELECT
      (created_at AT TIME ZONE timezone_name)::date AS biz_date,
      stage_code,
      node_name,
      created_at,
      id,
      row_number() OVER (
        PARTITION BY (created_at AT TIME ZONE timezone_name)::date
        ORDER BY created_at DESC, id DESC
      ) AS rn
    FROM public.project_logs
    WHERE project_id = project_uuid
  )
  SELECT
    biz_date::text AS date,
    count(*) AS count,
    max(CASE WHEN rn = 1 THEN stage_code END) AS stage_code,
    max(CASE WHEN rn = 1 THEN node_name END) AS node_name
  FROM ranked
  GROUP BY biz_date
  ORDER BY biz_date ASC;
$$;

REVOKE ALL ON FUNCTION public.get_project_log_calendar(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_project_log_calendar(uuid, text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_project_log_calendar(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_project_log_calendar(uuid, text) TO service_role;
