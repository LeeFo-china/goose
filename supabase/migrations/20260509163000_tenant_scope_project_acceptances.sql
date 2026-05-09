ALTER TABLE public.project_acceptances
ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

ALTER TABLE public.project_acceptance_items
ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

ALTER TABLE public.project_acceptance_actions
ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

ALTER TABLE public.project_acceptance_open_tickets
ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

WITH default_tenant AS (
  SELECT id FROM public.tenants WHERE slug = 'gooes_default'
)
UPDATE public.project_acceptances AS acceptances
SET tenant_id = COALESCE(projects.tenant_id, (SELECT id FROM default_tenant))
FROM public.projects AS projects
WHERE acceptances.project_id = projects.id
  AND acceptances.tenant_id IS NULL;

WITH default_tenant AS (
  SELECT id FROM public.tenants WHERE slug = 'gooes_default'
)
UPDATE public.project_acceptances
SET tenant_id = (SELECT id FROM default_tenant)
WHERE tenant_id IS NULL;

UPDATE public.project_acceptance_items AS items
SET tenant_id = acceptances.tenant_id
FROM public.project_acceptances AS acceptances
WHERE items.acceptance_id = acceptances.id
  AND items.tenant_id IS NULL;

UPDATE public.project_acceptance_actions AS actions
SET tenant_id = acceptances.tenant_id
FROM public.project_acceptances AS acceptances
WHERE actions.acceptance_id = acceptances.id
  AND actions.tenant_id IS NULL;

UPDATE public.project_acceptance_open_tickets AS tickets
SET tenant_id = acceptances.tenant_id
FROM public.project_acceptances AS acceptances
WHERE tickets.acceptance_id = acceptances.id
  AND tickets.tenant_id IS NULL;

CREATE INDEX IF NOT EXISTS project_acceptances_tenant_project_created_at_idx
ON public.project_acceptances(tenant_id, project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS project_acceptances_tenant_status_idx
ON public.project_acceptances(tenant_id, status);

CREATE INDEX IF NOT EXISTS project_acceptances_tenant_reviewer_idx
ON public.project_acceptances(tenant_id, reviewer_id)
WHERE reviewer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS project_acceptances_tenant_customer_idx
ON public.project_acceptances(tenant_id, customer_id)
WHERE customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS project_acceptance_items_tenant_acceptance_idx
ON public.project_acceptance_items(tenant_id, acceptance_id);

CREATE INDEX IF NOT EXISTS project_acceptance_actions_tenant_acceptance_idx
ON public.project_acceptance_actions(tenant_id, acceptance_id);

CREATE INDEX IF NOT EXISTS project_acceptance_open_tickets_tenant_acceptance_idx
ON public.project_acceptance_open_tickets(tenant_id, acceptance_id, status, expire_at DESC);

CREATE INDEX IF NOT EXISTS project_acceptance_open_tickets_tenant_ticket_idx
ON public.project_acceptance_open_tickets(tenant_id, ticket);

COMMENT ON COLUMN public.project_acceptances.tenant_id IS '项目工序验收单所属租户';
COMMENT ON COLUMN public.project_acceptance_items.tenant_id IS '项目工序验收项所属租户';
COMMENT ON COLUMN public.project_acceptance_actions.tenant_id IS '项目工序验收操作记录所属租户';
COMMENT ON COLUMN public.project_acceptance_open_tickets.tenant_id IS '项目工序验收短信访问票据所属租户';
