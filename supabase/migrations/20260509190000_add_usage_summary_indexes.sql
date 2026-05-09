CREATE INDEX IF NOT EXISTS idx_social_video_scripts_tenant_status_created
ON public.social_video_scripts(tenant_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_social_video_scripts_tenant_created
ON public.social_video_scripts(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_call_logs_tenant_created
ON public.ai_call_logs(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_call_logs_tenant_status_created
ON public.ai_call_logs(tenant_id, status, created_at DESC);
