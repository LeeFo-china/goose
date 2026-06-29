-- Finance phase 7.1: auditable reconciliation exception closure actions.

INSERT INTO public.permissions (code, name, module, resource, action, description, status)
VALUES (
  'finance.reconciliation.manage',
  '处理对账异常',
  'finance',
  'reconciliation',
  'manage',
  '标记对账异常已知悉、忽略、已解决或重新打开',
  'active'
)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  module = EXCLUDED.module,
  resource = EXCLUDED.resource,
  action = EXCLUDED.action,
  description = EXCLUDED.description,
  status = EXCLUDED.status;

INSERT INTO public.role_permissions (role_id, permission_id, access_scope)
SELECT roles.id, permissions.id, 'all'
FROM public.roles
JOIN public.permissions
  ON permissions.code = 'finance.reconciliation.manage'
WHERE roles.code IN ('system_admin', 'finance_base')
ON CONFLICT (role_id, permission_id) DO UPDATE SET
  access_scope = EXCLUDED.access_scope;

CREATE TABLE IF NOT EXISTS public.finance_reconciliation_exception_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  exception_fingerprint text NOT NULL,
  exception_code text NOT NULL,
  subject_type text NOT NULL,
  subject_id uuid NULL,
  project_id uuid NULL REFERENCES public.projects(id) ON DELETE SET NULL,
  action text NOT NULL,
  remark text NOT NULL,
  actor_employee_id uuid NULL REFERENCES public.employees(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT finance_reconciliation_exception_actions_code_check
    CHECK (exception_code IN (
      'receivable_overdue',
      'payment_without_ledger',
      'ledger_without_payment',
      'payment_unallocated',
      'allocation_amount_mismatch',
      'receivable_paid_amount_mismatch'
    )),
  CONSTRAINT finance_reconciliation_exception_actions_subject_type_check
    CHECK (subject_type IN ('receivable', 'payment', 'ledger')),
  CONSTRAINT finance_reconciliation_exception_actions_action_check
    CHECK (action IN ('acknowledge', 'ignore', 'resolve', 'reopen')),
  CONSTRAINT finance_reconciliation_exception_actions_fingerprint_not_blank
    CHECK (btrim(exception_fingerprint) <> ''),
  CONSTRAINT finance_reconciliation_exception_actions_remark_not_blank
    CHECK (btrim(remark) <> '')
);

CREATE INDEX IF NOT EXISTS finance_reconciliation_actions_tenant_fingerprint_created_idx
ON public.finance_reconciliation_exception_actions(
  tenant_id,
  exception_fingerprint,
  created_at DESC
);

CREATE INDEX IF NOT EXISTS finance_reconciliation_actions_tenant_action_created_idx
ON public.finance_reconciliation_exception_actions(tenant_id, action, created_at DESC);

CREATE INDEX IF NOT EXISTS finance_reconciliation_actions_tenant_actor_created_idx
ON public.finance_reconciliation_exception_actions(
  tenant_id,
  actor_employee_id,
  created_at DESC
)
WHERE actor_employee_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS finance_reconciliation_actions_project_created_idx
ON public.finance_reconciliation_exception_actions(project_id, created_at DESC)
WHERE project_id IS NOT NULL;

COMMENT ON TABLE public.finance_reconciliation_exception_actions IS
  'Append-only audit actions for computed finance reconciliation exceptions.';
COMMENT ON COLUMN public.finance_reconciliation_exception_actions.exception_fingerprint IS
  'Stable computed exception key: exception_code:subject_id.';

CREATE OR REPLACE FUNCTION public.list_latest_finance_reconciliation_exception_actions(
  p_tenant_id uuid,
  p_fingerprints text[]
)
RETURNS TABLE (
  id uuid,
  tenant_id uuid,
  exception_fingerprint text,
  exception_code text,
  subject_type text,
  subject_id uuid,
  project_id uuid,
  action text,
  remark text,
  actor_employee_id uuid,
  actor_employee_name text,
  created_at timestamptz
)
LANGUAGE sql
STABLE
AS $$
  SELECT DISTINCT ON (action_row.exception_fingerprint)
    action_row.id,
    action_row.tenant_id,
    action_row.exception_fingerprint,
    action_row.exception_code,
    action_row.subject_type,
    action_row.subject_id,
    action_row.project_id,
    action_row.action,
    action_row.remark,
    action_row.actor_employee_id,
    actor.name AS actor_employee_name,
    action_row.created_at
  FROM public.finance_reconciliation_exception_actions AS action_row
  LEFT JOIN public.employees AS actor
    ON actor.id = action_row.actor_employee_id
  WHERE action_row.tenant_id = p_tenant_id
    AND action_row.exception_fingerprint = ANY(p_fingerprints)
  ORDER BY
    action_row.exception_fingerprint,
    action_row.created_at DESC,
    action_row.id DESC;
$$;

COMMENT ON FUNCTION public.list_latest_finance_reconciliation_exception_actions(uuid, text[]) IS
  'Returns the latest reconciliation exception action for each requested fingerprint.';
