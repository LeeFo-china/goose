DROP INDEX IF EXISTS public.employees_phone_unique;
DROP INDEX IF EXISTS public.customers_phone_unique;

CREATE UNIQUE INDEX IF NOT EXISTS employees_tenant_phone_unique
ON public.employees(tenant_id, phone)
WHERE tenant_id IS NOT NULL AND phone IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS customers_tenant_phone_unique
ON public.customers(tenant_id, phone)
WHERE tenant_id IS NOT NULL AND phone IS NOT NULL;

DROP INDEX IF EXISTS public.customers_user_id_unique;

CREATE UNIQUE INDEX IF NOT EXISTS customers_tenant_user_id_unique
ON public.customers(tenant_id, user_id)
WHERE tenant_id IS NOT NULL AND user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS projects_tenant_customer_id_idx
ON public.projects(tenant_id, customer_id)
WHERE customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS projects_tenant_property_id_idx
ON public.projects(tenant_id, property_id)
WHERE property_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS customers_tenant_owner_id_idx
ON public.customers(tenant_id, owner_id)
WHERE owner_id IS NOT NULL;

COMMENT ON INDEX public.employees_tenant_phone_unique IS '员工手机号租户内唯一';
COMMENT ON INDEX public.customers_tenant_phone_unique IS '客户手机号租户内唯一';
COMMENT ON INDEX public.customers_tenant_user_id_unique IS '客户登录身份租户内唯一，支持同一客户归属多家公司';
