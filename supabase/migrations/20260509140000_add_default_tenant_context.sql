CREATE TABLE IF NOT EXISTS public.tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'active',
  contact_name text,
  contact_phone text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenants_slug_not_blank CHECK (btrim(slug) <> ''),
  CONSTRAINT tenants_status_check CHECK (status IN ('active', 'suspended', 'archived'))
);

DROP TRIGGER IF EXISTS tr_tenants_updated_at ON public.tenants;
CREATE TRIGGER tr_tenants_updated_at
  BEFORE UPDATE ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

INSERT INTO public.tenants (
  slug,
  name,
  status
)
VALUES (
  'gooes_default',
  '默认装修公司',
  'active'
)
ON CONFLICT (slug) DO UPDATE
SET
  name = EXCLUDED.name,
  status = EXCLUDED.status,
  updated_at = now();

ALTER TABLE public.employees
ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

ALTER TABLE public.customers
ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

ALTER TABLE public.projects
ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

ALTER TABLE public.properties
ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

WITH default_tenant AS (
  SELECT id FROM public.tenants WHERE slug = 'gooes_default'
)
UPDATE public.employees
SET tenant_id = (SELECT id FROM default_tenant)
WHERE tenant_id IS NULL;

WITH default_tenant AS (
  SELECT id FROM public.tenants WHERE slug = 'gooes_default'
)
UPDATE public.customers
SET tenant_id = (SELECT id FROM default_tenant)
WHERE tenant_id IS NULL;

WITH default_tenant AS (
  SELECT id FROM public.tenants WHERE slug = 'gooes_default'
)
UPDATE public.projects
SET tenant_id = (SELECT id FROM default_tenant)
WHERE tenant_id IS NULL;

WITH default_tenant AS (
  SELECT id FROM public.tenants WHERE slug = 'gooes_default'
)
UPDATE public.properties
SET tenant_id = (SELECT id FROM default_tenant)
WHERE tenant_id IS NULL;

CREATE INDEX IF NOT EXISTS tenants_status_idx
ON public.tenants(status);

CREATE INDEX IF NOT EXISTS employees_tenant_created_at_idx
ON public.employees(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS employees_tenant_status_idx
ON public.employees(tenant_id, status);

CREATE INDEX IF NOT EXISTS employees_tenant_phone_idx
ON public.employees(tenant_id, phone);

CREATE INDEX IF NOT EXISTS customers_tenant_created_at_idx
ON public.customers(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS customers_tenant_status_idx
ON public.customers(tenant_id, status);

CREATE INDEX IF NOT EXISTS customers_tenant_phone_idx
ON public.customers(tenant_id, phone);

CREATE INDEX IF NOT EXISTS projects_tenant_created_at_idx
ON public.projects(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS projects_tenant_status_idx
ON public.projects(tenant_id, status);

CREATE INDEX IF NOT EXISTS properties_tenant_created_at_idx
ON public.properties(tenant_id, created_at DESC);

COMMENT ON TABLE public.tenants IS '租户表，装修公司 SaaS 隔离的主体';
COMMENT ON COLUMN public.tenants.slug IS '租户稳定标识，生产默认租户由 DEFAULT_TENANT_SLUG 指向';
COMMENT ON COLUMN public.tenants.status IS '租户状态：active/suspended/archived';
COMMENT ON COLUMN public.employees.tenant_id IS '员工所属租户';
COMMENT ON COLUMN public.customers.tenant_id IS '客户所属租户';
COMMENT ON COLUMN public.projects.tenant_id IS '项目所属租户';
COMMENT ON COLUMN public.properties.tenant_id IS '房产所属租户';
