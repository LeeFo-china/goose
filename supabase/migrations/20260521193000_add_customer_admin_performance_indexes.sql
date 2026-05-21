CREATE INDEX IF NOT EXISTS customer_follow_ups_customer_created_at_idx
ON public.customer_follow_ups(customer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS properties_tenant_customer_created_at_idx
ON public.properties(tenant_id, customer_id, created_at DESC);
