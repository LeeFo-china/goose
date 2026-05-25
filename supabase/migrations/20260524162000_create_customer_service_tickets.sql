CREATE TABLE IF NOT EXISTS public.customer_service_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  ticket_no text NOT NULL,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  category text NOT NULL DEFAULT 'other',
  title text,
  content text NOT NULL,
  images jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'open',
  priority text NOT NULL DEFAULT 'normal',
  assigned_employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.customer_service_ticket_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  ticket_id uuid NOT NULL REFERENCES public.customer_service_tickets(id) ON DELETE CASCADE,
  action text NOT NULL,
  from_status text,
  to_status text,
  operator_employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  operator_auth_user_id uuid,
  content text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.customer_service_tickets
DROP CONSTRAINT IF EXISTS customer_service_tickets_status_check,
DROP CONSTRAINT IF EXISTS customer_service_tickets_category_check,
DROP CONSTRAINT IF EXISTS customer_service_tickets_priority_check,
DROP CONSTRAINT IF EXISTS customer_service_tickets_content_check,
DROP CONSTRAINT IF EXISTS customer_service_tickets_images_check,
DROP CONSTRAINT IF EXISTS customer_service_tickets_ticket_no_unique;

ALTER TABLE public.customer_service_tickets
ADD CONSTRAINT customer_service_tickets_status_check
CHECK (status IN ('open', 'in_progress', 'resolved', 'closed', 'cancelled')),
ADD CONSTRAINT customer_service_tickets_category_check
CHECK (category IN ('after_sale', 'construction', 'acceptance', 'billing', 'other')),
ADD CONSTRAINT customer_service_tickets_priority_check
CHECK (priority IN ('normal', 'high', 'urgent')),
ADD CONSTRAINT customer_service_tickets_content_check
CHECK (length(trim(content)) > 0 AND length(content) <= 1000),
ADD CONSTRAINT customer_service_tickets_images_check
CHECK (jsonb_typeof(images) = 'array' AND jsonb_array_length(images) <= 9),
ADD CONSTRAINT customer_service_tickets_ticket_no_unique
UNIQUE (tenant_id, ticket_no);

ALTER TABLE public.customer_service_ticket_actions
DROP CONSTRAINT IF EXISTS customer_service_ticket_actions_action_check,
DROP CONSTRAINT IF EXISTS customer_service_ticket_actions_from_status_check,
DROP CONSTRAINT IF EXISTS customer_service_ticket_actions_to_status_check;

ALTER TABLE public.customer_service_ticket_actions
ADD CONSTRAINT customer_service_ticket_actions_action_check
CHECK (action IN ('create', 'assign', 'start', 'resolve', 'close', 'cancel', 'reopen')),
ADD CONSTRAINT customer_service_ticket_actions_from_status_check
CHECK (
  from_status IS NULL OR from_status IN ('open', 'in_progress', 'resolved', 'closed', 'cancelled')
),
ADD CONSTRAINT customer_service_ticket_actions_to_status_check
CHECK (
  to_status IS NULL OR to_status IN ('open', 'in_progress', 'resolved', 'closed', 'cancelled')
);

CREATE INDEX IF NOT EXISTS customer_service_tickets_tenant_created_idx
ON public.customer_service_tickets(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS customer_service_tickets_tenant_status_created_idx
ON public.customer_service_tickets(tenant_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS customer_service_tickets_customer_created_idx
ON public.customer_service_tickets(tenant_id, customer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS customer_service_tickets_assignee_status_idx
ON public.customer_service_tickets(tenant_id, assigned_employee_id, status);

CREATE INDEX IF NOT EXISTS customer_service_ticket_actions_ticket_created_idx
ON public.customer_service_ticket_actions(ticket_id, created_at DESC);

CREATE INDEX IF NOT EXISTS customer_service_ticket_actions_tenant_created_idx
ON public.customer_service_ticket_actions(tenant_id, created_at DESC);

COMMENT ON TABLE public.customer_service_tickets IS '客户客服问题工单';
COMMENT ON TABLE public.customer_service_ticket_actions IS '客户客服问题操作日志';

