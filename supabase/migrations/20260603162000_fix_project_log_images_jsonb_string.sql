UPDATE public.project_logs
SET images = (images #>> '{}')::jsonb
WHERE jsonb_typeof(images) = 'string'
  AND (images #>> '{}') IS NOT NULL
  AND btrim(images #>> '{}') LIKE '[%';
