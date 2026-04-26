ALTER TABLE public.project_log_comments
ADD COLUMN IF NOT EXISTS images text[] NOT NULL DEFAULT '{}'::text[];

COMMENT ON COLUMN public.project_log_comments.images IS '评论图片公网 URL 列表，最多 9 张';
