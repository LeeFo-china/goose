-- Phase 8: finance reports and monthly closing periods.

INSERT INTO public.permissions (code, name, module, resource, action, description, status)
VALUES
  (
    'finance.reports.read',
    '查看财务报表',
    'finance',
    'reports',
    'read',
    '查看月度经营总览、项目经营排行和财务报表',
    'active'
  ),
  (
    'finance.reports.export',
    '导出财务报表',
    'finance',
    'reports',
    'export',
    '导出财务报表数据',
    'active'
  ),
  (
    'finance.closing.read',
    '查看月度结账',
    'finance',
    'closing',
    'read',
    '查看月度结账期间和结账快照',
    'active'
  ),
  (
    'finance.closing.manage',
    '管理月度结账',
    'finance',
    'closing',
    'manage',
    '生成、确认和反结账月度结账快照',
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
  ON permissions.code IN (
    'finance.reports.read',
    'finance.reports.export',
    'finance.closing.read',
    'finance.closing.manage'
  )
WHERE roles.code IN ('system_admin', 'finance_base')
ON CONFLICT (role_id, permission_id) DO UPDATE SET
  access_scope = EXCLUDED.access_scope;

CREATE TABLE IF NOT EXISTS public.finance_closing_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  period_month text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  closed_at timestamptz NULL,
  closed_by_employee_id uuid NULL REFERENCES public.employees(id) ON DELETE SET NULL,
  reopened_at timestamptz NULL,
  reopened_by_employee_id uuid NULL REFERENCES public.employees(id) ON DELETE SET NULL,
  reopen_reason text NULL,
  snapshot_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT finance_closing_periods_period_month_check
    CHECK (period_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  CONSTRAINT finance_closing_periods_status_check
    CHECK (status IN ('draft', 'closed', 'reopened')),
  CONSTRAINT finance_closing_periods_snapshot_object_check
    CHECK (jsonb_typeof(snapshot_json) = 'object'),
  CONSTRAINT finance_closing_periods_reopen_reason_length_check
    CHECK (reopen_reason IS NULL OR length(trim(reopen_reason)) BETWEEN 1 AND 500),
  CONSTRAINT finance_closing_periods_notes_length_check
    CHECK (notes IS NULL OR length(trim(notes)) <= 500)
);

CREATE UNIQUE INDEX IF NOT EXISTS finance_closing_periods_tenant_month_uidx
ON public.finance_closing_periods(tenant_id, period_month);

CREATE INDEX IF NOT EXISTS finance_closing_periods_tenant_status_month_idx
ON public.finance_closing_periods(tenant_id, status, period_month DESC);

CREATE INDEX IF NOT EXISTS finance_closing_periods_tenant_updated_idx
ON public.finance_closing_periods(tenant_id, updated_at DESC);

DROP TRIGGER IF EXISTS tr_finance_closing_periods_updated_at
ON public.finance_closing_periods;

CREATE TRIGGER tr_finance_closing_periods_updated_at
  BEFORE UPDATE ON public.finance_closing_periods
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.finance_closing_periods IS '财务月度结账期间与快照';
COMMENT ON COLUMN public.finance_closing_periods.period_month IS '结账月份，格式 YYYY-MM';
COMMENT ON COLUMN public.finance_closing_periods.snapshot_json IS '结账时固化的财务报表快照，不回写业务事实';
COMMENT ON COLUMN public.finance_closing_periods.reopen_reason IS '最近一次反结账原因';
