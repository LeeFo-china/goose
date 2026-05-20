CREATE INDEX IF NOT EXISTS projects_tenant_customer_created_at_idx
ON public.projects(tenant_id, customer_id, created_at DESC)
WHERE customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS customers_tenant_id_idx
ON public.customers(tenant_id, id)
WHERE tenant_id IS NOT NULL;
