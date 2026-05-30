CREATE INDEX IF NOT EXISTS projects_tenant_id_id_idx
ON public.projects(tenant_id, id);

CREATE INDEX IF NOT EXISTS project_logs_tenant_project_stage_created_at_idx
ON public.project_logs(tenant_id, project_id, stage_code, created_at DESC);

CREATE INDEX IF NOT EXISTS project_log_comments_tenant_log_active_idx
ON public.project_log_comments(tenant_id, log_id)
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS project_acceptances_tenant_project_stage_created_at_idx
ON public.project_acceptances(tenant_id, project_id, stage_code, created_at DESC)
WHERE status <> 'cancelled';

COMMENT ON INDEX public.projects_tenant_id_id_idx IS
  'Speeds employee project detail bootstrap lookup by tenant and project id.';

COMMENT ON INDEX public.project_logs_tenant_project_stage_created_at_idx IS
  'Speeds employee project bootstrap construction stage log summaries.';

COMMENT ON INDEX public.project_log_comments_tenant_log_active_idx IS
  'Speeds employee project bootstrap log comment counts.';

COMMENT ON INDEX public.project_acceptances_tenant_project_stage_created_at_idx IS
  'Speeds employee project bootstrap construction acceptance summaries.';
