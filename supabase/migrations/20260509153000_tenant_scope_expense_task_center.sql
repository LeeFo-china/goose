ALTER TABLE public.expense_requests
ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

ALTER TABLE public.expense_request_items
ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

ALTER TABLE public.expense_request_approvals
ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

ALTER TABLE public.expense_request_approval_chains
ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

ALTER TABLE public.expense_request_settlements
ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

ALTER TABLE public.expense_request_categories
ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

WITH default_tenant AS (
  SELECT id FROM public.tenants WHERE slug = 'gooes_default'
)
UPDATE public.expense_requests
SET tenant_id = COALESCE(
  (SELECT employees.tenant_id FROM public.employees WHERE employees.id = expense_requests.employee_id),
  (SELECT projects.tenant_id FROM public.projects WHERE projects.id = expense_requests.project_id),
  (SELECT id FROM default_tenant)
)
WHERE tenant_id IS NULL;

WITH default_tenant AS (
  SELECT id FROM public.tenants WHERE slug = 'gooes_default'
)
UPDATE public.expense_requests
SET tenant_id = (SELECT id FROM default_tenant)
WHERE tenant_id IS NULL;

UPDATE public.expense_request_items AS items
SET tenant_id = requests.tenant_id
FROM public.expense_requests AS requests
WHERE items.expense_request_id = requests.id
  AND items.tenant_id IS NULL;

UPDATE public.expense_request_approvals AS approvals
SET tenant_id = requests.tenant_id
FROM public.expense_requests AS requests
WHERE approvals.expense_request_id = requests.id
  AND approvals.tenant_id IS NULL;

UPDATE public.expense_request_approval_chains AS chains
SET tenant_id = requests.tenant_id
FROM public.expense_requests AS requests
WHERE chains.expense_request_id = requests.id
  AND chains.tenant_id IS NULL;

UPDATE public.expense_request_settlements AS settlements
SET tenant_id = requests.tenant_id
FROM public.expense_requests AS requests
WHERE settlements.expense_request_id = requests.id
  AND settlements.tenant_id IS NULL;

WITH default_tenant AS (
  SELECT id FROM public.tenants WHERE slug = 'gooes_default'
)
UPDATE public.expense_request_categories
SET tenant_id = (SELECT id FROM default_tenant)
WHERE tenant_id IS NULL;

DROP INDEX IF EXISTS public.idx_expense_request_categories_code;
DROP INDEX IF EXISTS public.idx_expense_request_categories_name;

CREATE UNIQUE INDEX IF NOT EXISTS expense_request_categories_tenant_code_unique
ON public.expense_request_categories(tenant_id, code);

CREATE UNIQUE INDEX IF NOT EXISTS expense_request_categories_tenant_name_unique
ON public.expense_request_categories(tenant_id, name);

CREATE INDEX IF NOT EXISTS expense_requests_tenant_created_at_idx
ON public.expense_requests(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS expense_requests_tenant_status_idx
ON public.expense_requests(tenant_id, status);

CREATE INDEX IF NOT EXISTS expense_requests_tenant_employee_idx
ON public.expense_requests(tenant_id, employee_id);

CREATE INDEX IF NOT EXISTS expense_requests_tenant_project_idx
ON public.expense_requests(tenant_id, project_id);

CREATE INDEX IF NOT EXISTS expense_requests_tenant_assignee_idx
ON public.expense_requests(tenant_id, assignee_id)
WHERE assignee_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS expense_request_items_tenant_request_idx
ON public.expense_request_items(tenant_id, expense_request_id);

CREATE INDEX IF NOT EXISTS expense_request_approvals_tenant_request_idx
ON public.expense_request_approvals(tenant_id, expense_request_id);

CREATE INDEX IF NOT EXISTS expense_request_approval_chains_tenant_assignee_status_idx
ON public.expense_request_approval_chains(tenant_id, assignee_id, status);

CREATE INDEX IF NOT EXISTS expense_request_settlements_tenant_paid_at_idx
ON public.expense_request_settlements(tenant_id, paid_at DESC);

CREATE INDEX IF NOT EXISTS expense_request_categories_tenant_status_sort_idx
ON public.expense_request_categories(tenant_id, status, sort);

COMMENT ON COLUMN public.expense_requests.tenant_id IS '费用申请所属租户';
COMMENT ON COLUMN public.expense_request_items.tenant_id IS '费用明细所属租户';
COMMENT ON COLUMN public.expense_request_approvals.tenant_id IS '费用审批记录所属租户';
COMMENT ON COLUMN public.expense_request_approval_chains.tenant_id IS '费用审批链所属租户';
COMMENT ON COLUMN public.expense_request_settlements.tenant_id IS '费用打款记录所属租户';
COMMENT ON COLUMN public.expense_request_categories.tenant_id IS '费用分类所属租户';
