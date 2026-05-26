ALTER TABLE public.projects
  DROP COLUMN IF EXISTS designer_id,
  DROP COLUMN IF EXISTS supervisor_id;
