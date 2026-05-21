CREATE TABLE IF NOT EXISTS public.customer_status_transition_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  from_status text,
  to_status text NOT NULL,
  action text NOT NULL,
  operator_employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  operator_auth_user_id uuid,
  reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.customer_status_transition_logs
DROP CONSTRAINT IF EXISTS customer_status_transition_logs_action_check,
DROP CONSTRAINT IF EXISTS customer_status_transition_logs_from_status_check,
DROP CONSTRAINT IF EXISTS customer_status_transition_logs_to_status_check;

ALTER TABLE public.customer_status_transition_logs
ADD CONSTRAINT customer_status_transition_logs_action_check
CHECK (
  action IN (
    'start_following',
    'mark_arrived',
    'place_order',
    'sign_contract',
    'mark_dormant',
    'reactivate',
    'mark_invalid'
  )
),
ADD CONSTRAINT customer_status_transition_logs_from_status_check
CHECK (
  from_status IS NULL OR from_status IN (
    'potential',
    'following',
    'arrived',
    'ordered',
    'contracted',
    'dormant',
    'invalid'
  )
),
ADD CONSTRAINT customer_status_transition_logs_to_status_check
CHECK (
  to_status IN (
    'potential',
    'following',
    'arrived',
    'ordered',
    'contracted',
    'dormant',
    'invalid'
  )
);

CREATE INDEX IF NOT EXISTS customer_status_transition_logs_customer_created_idx
ON public.customer_status_transition_logs(customer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS customer_status_transition_logs_tenant_created_idx
ON public.customer_status_transition_logs(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS customer_status_transition_logs_action_idx
ON public.customer_status_transition_logs(action);

COMMENT ON TABLE public.customer_status_transition_logs IS '客户状态机流转日志';
COMMENT ON COLUMN public.customer_status_transition_logs.action IS '客户状态动作';
COMMENT ON COLUMN public.customer_status_transition_logs.metadata IS '状态动作上下文';
