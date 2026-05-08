ALTER TABLE public.projects
ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

UPDATE public.projects
SET updated_at = COALESCE(created_at::timestamptz, now())
WHERE updated_at IS NULL;

DROP TRIGGER IF EXISTS tr_projects_updated_at ON public.projects;
CREATE TRIGGER tr_projects_updated_at
  BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS projects_updated_at_idx
ON public.projects(updated_at DESC);

COMMENT ON COLUMN public.projects.updated_at IS '项目记录更新时间';
