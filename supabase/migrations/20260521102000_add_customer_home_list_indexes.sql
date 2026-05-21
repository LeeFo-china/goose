CREATE INDEX IF NOT EXISTS customers_tenant_owner_created_at_idx
ON public.customers(tenant_id, owner_id, created_at DESC)
WHERE tenant_id IS NOT NULL AND owner_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS customers_tenant_owner_status_created_at_idx
ON public.customers(tenant_id, owner_id, status, created_at DESC)
WHERE tenant_id IS NOT NULL AND owner_id IS NOT NULL;
