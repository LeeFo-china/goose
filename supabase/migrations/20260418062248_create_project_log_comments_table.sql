CREATE TABLE IF NOT EXISTS public.project_log_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  log_id uuid NOT NULL REFERENCES public.project_logs(id) ON DELETE CASCADE,
  parent_id uuid NULL REFERENCES public.project_log_comments(id) ON DELETE SET NULL,
  author_type text NOT NULL CHECK (author_type IN ('employee', 'customer')),
  author_id uuid NOT NULL,
  content text NOT NULL,
  rating integer NULL CHECK (rating IS NULL OR (rating >= 1 AND rating <= 5)),
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone NULL,
  deleted_at timestamp with time zone NULL,
  CONSTRAINT project_log_comments_reply_rating_null CHECK (
    parent_id IS NULL OR rating IS NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_project_log_comments_log_id_created_at
ON public.project_log_comments(log_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_project_log_comments_parent_id
ON public.project_log_comments(parent_id);

COMMENT ON TABLE public.project_log_comments IS '项目施工日志评论表';
COMMENT ON COLUMN public.project_log_comments.parent_id IS '父评论 ID，根评论为 null';
COMMENT ON COLUMN public.project_log_comments.author_type IS '评论作者身份：employee/customer';
COMMENT ON COLUMN public.project_log_comments.rating IS '客户对日志的评分，回复评论必须为 null';
