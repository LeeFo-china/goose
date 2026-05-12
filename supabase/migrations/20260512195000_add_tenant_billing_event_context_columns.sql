ALTER TABLE public.tenant_billing_events
ADD COLUMN IF NOT EXISTS scene_code text NULL,
ADD COLUMN IF NOT EXISTS provider text NULL,
ADD COLUMN IF NOT EXISTS model text NULL;

CREATE INDEX IF NOT EXISTS tenant_billing_events_scene_created_idx
ON public.tenant_billing_events(scene_code, created_at DESC)
WHERE scene_code IS NOT NULL;
