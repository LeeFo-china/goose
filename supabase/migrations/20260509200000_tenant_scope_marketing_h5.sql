ALTER TABLE public.marketing_campaigns
ADD COLUMN IF NOT EXISTS tenant_id uuid NULL REFERENCES public.tenants(id);

ALTER TABLE public.marketing_campaign_project_scopes
ADD COLUMN IF NOT EXISTS tenant_id uuid NULL REFERENCES public.tenants(id);

ALTER TABLE public.marketing_pages
ADD COLUMN IF NOT EXISTS tenant_id uuid NULL REFERENCES public.tenants(id);

ALTER TABLE public.marketing_page_versions
ADD COLUMN IF NOT EXISTS tenant_id uuid NULL REFERENCES public.tenants(id);

ALTER TABLE public.marketing_assets
ADD COLUMN IF NOT EXISTS tenant_id uuid NULL REFERENCES public.tenants(id);

ALTER TABLE public.marketing_leads
ADD COLUMN IF NOT EXISTS tenant_id uuid NULL REFERENCES public.tenants(id);

ALTER TABLE public.marketing_events
ADD COLUMN IF NOT EXISTS tenant_id uuid NULL REFERENCES public.tenants(id);

WITH default_tenant AS (
  SELECT id
  FROM public.tenants
  WHERE slug = 'gooes_default'
  LIMIT 1
)
UPDATE public.marketing_campaigns
SET tenant_id = (SELECT id FROM default_tenant)
WHERE tenant_id IS NULL;

UPDATE public.marketing_campaign_project_scopes scopes
SET tenant_id = campaigns.tenant_id
FROM public.marketing_campaigns campaigns
WHERE scopes.campaign_id = campaigns.id
  AND scopes.tenant_id IS NULL;

WITH default_tenant AS (
  SELECT id
  FROM public.tenants
  WHERE slug = 'gooes_default'
  LIMIT 1
)
UPDATE public.marketing_campaign_project_scopes
SET tenant_id = (SELECT id FROM default_tenant)
WHERE tenant_id IS NULL;

WITH default_tenant AS (
  SELECT id
  FROM public.tenants
  WHERE slug = 'gooes_default'
  LIMIT 1
)
UPDATE public.marketing_pages
SET tenant_id = (SELECT id FROM default_tenant)
WHERE tenant_id IS NULL;

UPDATE public.marketing_page_versions versions
SET tenant_id = pages.tenant_id
FROM public.marketing_pages pages
WHERE versions.page_id = pages.id
  AND versions.tenant_id IS NULL;

WITH default_tenant AS (
  SELECT id
  FROM public.tenants
  WHERE slug = 'gooes_default'
  LIMIT 1
)
UPDATE public.marketing_page_versions
SET tenant_id = (SELECT id FROM default_tenant)
WHERE tenant_id IS NULL;

UPDATE public.marketing_leads leads
SET tenant_id = pages.tenant_id
FROM public.marketing_pages pages
WHERE leads.page_id = pages.id
  AND leads.tenant_id IS NULL;

WITH default_tenant AS (
  SELECT id
  FROM public.tenants
  WHERE slug = 'gooes_default'
  LIMIT 1
)
UPDATE public.marketing_leads
SET tenant_id = (SELECT id FROM default_tenant)
WHERE tenant_id IS NULL;

UPDATE public.marketing_events events
SET tenant_id = pages.tenant_id
FROM public.marketing_pages pages
WHERE events.page_id = pages.id
  AND events.tenant_id IS NULL;

WITH default_tenant AS (
  SELECT id
  FROM public.tenants
  WHERE slug = 'gooes_default'
  LIMIT 1
)
UPDATE public.marketing_events
SET tenant_id = (SELECT id FROM default_tenant)
WHERE tenant_id IS NULL;

WITH default_tenant AS (
  SELECT id
  FROM public.tenants
  WHERE slug = 'gooes_default'
  LIMIT 1
)
UPDATE public.marketing_assets
SET tenant_id = (SELECT id FROM default_tenant)
WHERE tenant_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_marketing_campaigns_tenant_type_status
ON public.marketing_campaigns(tenant_id, campaign_type, status, enabled);

CREATE INDEX IF NOT EXISTS idx_marketing_campaigns_tenant_updated_at
ON public.marketing_campaigns(tenant_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_marketing_campaign_project_scopes_tenant_campaign
ON public.marketing_campaign_project_scopes(tenant_id, campaign_id);

CREATE INDEX IF NOT EXISTS idx_marketing_campaign_project_scopes_tenant_project
ON public.marketing_campaign_project_scopes(tenant_id, project_id);

CREATE INDEX IF NOT EXISTS idx_marketing_pages_tenant_status_updated
ON public.marketing_pages(tenant_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_marketing_pages_tenant_public_display
ON public.marketing_pages(tenant_id, status, display_scene, sort_order, published_at DESC);

CREATE INDEX IF NOT EXISTS idx_marketing_page_versions_tenant_page
ON public.marketing_page_versions(tenant_id, page_id);

CREATE INDEX IF NOT EXISTS idx_marketing_assets_tenant_created_at
ON public.marketing_assets(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_marketing_leads_tenant_created_at
ON public.marketing_leads(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_marketing_leads_tenant_status_created
ON public.marketing_leads(tenant_id, lead_status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_marketing_leads_tenant_page_phone_created_at
ON public.marketing_leads(tenant_id, page_id, phone, created_at DESC)
WHERE phone IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_marketing_leads_tenant_customer
ON public.marketing_leads(tenant_id, customer_id)
WHERE customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_marketing_events_tenant_page_created_at
ON public.marketing_events(tenant_id, page_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_marketing_events_tenant_event_created_at
ON public.marketing_events(tenant_id, event_name, created_at DESC);

COMMENT ON COLUMN public.marketing_campaigns.tenant_id IS '营销活动所属租户';
COMMENT ON COLUMN public.marketing_campaign_project_scopes.tenant_id IS '营销活动项目范围所属租户，从活动继承';
COMMENT ON COLUMN public.marketing_pages.tenant_id IS 'H5 营销页所属租户';
COMMENT ON COLUMN public.marketing_page_versions.tenant_id IS 'H5 营销页版本所属租户，从页面继承';
COMMENT ON COLUMN public.marketing_assets.tenant_id IS 'H5 营销素材所属租户';
COMMENT ON COLUMN public.marketing_leads.tenant_id IS 'H5 营销线索所属租户，从页面继承';
COMMENT ON COLUMN public.marketing_events.tenant_id IS 'H5 营销埋点所属租户，从页面继承';
