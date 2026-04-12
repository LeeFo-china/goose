ALTER TABLE public.projects
ADD COLUMN IF NOT EXISTS style_tags jsonb NOT NULL DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS visibility_status varchar(20) NOT NULL DEFAULT 'inherit';

ALTER TABLE public.projects
DROP CONSTRAINT IF EXISTS projects_visibility_status_check;

ALTER TABLE public.projects
ADD CONSTRAINT projects_visibility_status_check
CHECK (visibility_status IN ('inherit', 'public', 'hidden'));

COMMENT ON COLUMN public.projects.style_tags IS '项目装修风格标签，使用 jsonb 数组存储，便于后续标签化检索与展示';
COMMENT ON COLUMN public.projects.visibility_status IS '前端展示可见性：inherit=跟随业务状态，public=强制显示，hidden=强制隐藏';

CREATE INDEX IF NOT EXISTS idx_projects_style_tags_gin
ON public.projects
USING gin (style_tags);

CREATE INDEX IF NOT EXISTS idx_projects_visibility_status
ON public.projects (visibility_status);
