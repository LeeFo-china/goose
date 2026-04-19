ALTER TABLE public.projects
ADD COLUMN IF NOT EXISTS signed_amount numeric(12,2);

COMMENT ON COLUMN public.projects.signed_amount IS '项目正式签约金额，用于签约后介绍费计算';

ALTER TABLE public.projects
DROP CONSTRAINT IF EXISTS projects_signed_amount_check;

ALTER TABLE public.projects
ADD CONSTRAINT projects_signed_amount_check
CHECK (signed_amount IS NULL OR signed_amount >= 0);
