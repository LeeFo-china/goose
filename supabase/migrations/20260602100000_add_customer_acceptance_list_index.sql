CREATE INDEX IF NOT EXISTS project_acceptances_tenant_customer_project_created_idx
ON public.project_acceptances(tenant_id, customer_id, project_id, created_at DESC);
