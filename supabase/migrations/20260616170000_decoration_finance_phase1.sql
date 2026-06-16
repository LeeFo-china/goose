-- Decoration finance phase 1: permissions, payment idempotency fields, ledger, tenant payment config shell.

INSERT INTO public.permissions (code, name, module, resource, action, description, status)
VALUES
  ('finance.view', '查看财务模块', 'finance', 'finance', 'view', '查看装修公司经营财务模块', 'active'),
  ('finance.payment.create', '登记项目收款', 'finance', 'payment', 'create', '登记项目收款记录', 'active'),
  ('finance.payment.confirm', '确认项目收款', 'finance', 'payment', 'confirm', '确认项目收款并推进收款节点', 'active'),
  ('finance.expense.review', '财务审核费用', 'finance', 'expense', 'review', '财务审核费用申请', 'active'),
  ('finance.expense.pay', '登记费用打款', 'finance', 'expense', 'pay', '登记费用打款和凭证', 'active'),
  ('finance.ledger.view', '查看财务台账', 'finance', 'ledger', 'view', '查看收付款台账', 'active'),
  ('finance.dashboard.view', '查看财务看板', 'finance', 'dashboard', 'view', '查看财务经营看板', 'active')
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name,
    module = EXCLUDED.module,
    resource = EXCLUDED.resource,
    action = EXCLUDED.action,
    description = EXCLUDED.description,
    status = 'active';

ALTER TABLE public.payments
ADD COLUMN IF NOT EXISTS workflow_task_id uuid NULL REFERENCES public.workflow_tasks(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS source_type text NULL,
ADD COLUMN IF NOT EXISTS source_id uuid NULL,
ADD COLUMN IF NOT EXISTS remark text NULL,
ADD COLUMN IF NOT EXISTS payment_channel text NOT NULL DEFAULT 'manual',
ADD COLUMN IF NOT EXISTS provider text NULL,
ADD COLUMN IF NOT EXISTS provider_transaction_id text NULL,
ADD COLUMN IF NOT EXISTS out_trade_no text NULL;

CREATE UNIQUE INDEX IF NOT EXISTS payments_workflow_task_unique_idx
ON public.payments(workflow_task_id)
WHERE workflow_task_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS payments_provider_transaction_unique_idx
ON public.payments(provider, provider_transaction_id)
WHERE provider IS NOT NULL AND provider_transaction_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS payments_out_trade_no_unique_idx
ON public.payments(out_trade_no)
WHERE out_trade_no IS NOT NULL;

CREATE INDEX IF NOT EXISTS payments_source_idx
ON public.payments(source_type, source_id)
WHERE source_type IS NOT NULL AND source_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS payments_pay_date_idx
ON public.payments(pay_date DESC);

CREATE TABLE IF NOT EXISTS public.finance_ledger_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  project_id uuid NULL REFERENCES public.projects(id) ON DELETE SET NULL,
  direction text NOT NULL,
  entry_type text NOT NULL,
  amount numeric(12, 2) NOT NULL,
  currency text NOT NULL DEFAULT 'CNY',
  occurred_at timestamptz NOT NULL DEFAULT now(),
  source_type text NOT NULL,
  source_id uuid NOT NULL,
  workflow_task_id uuid NULL REFERENCES public.workflow_tasks(id) ON DELETE SET NULL,
  payment_id uuid NULL REFERENCES public.payments(id) ON DELETE SET NULL,
  expense_request_id uuid NULL REFERENCES public.expense_requests(id) ON DELETE SET NULL,
  expense_settlement_id uuid NULL REFERENCES public.expense_request_settlements(id) ON DELETE SET NULL,
  handled_by uuid NULL REFERENCES public.employees(id) ON DELETE SET NULL,
  summary text NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT finance_ledger_entries_direction_check CHECK (direction IN ('in', 'out')),
  CONSTRAINT finance_ledger_entries_entry_type_check CHECK (entry_type IN ('project_payment', 'expense_settlement', 'refund', 'adjustment')),
  CONSTRAINT finance_ledger_entries_amount_check CHECK (amount > 0),
  CONSTRAINT finance_ledger_entries_metadata_object_check CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE UNIQUE INDEX IF NOT EXISTS finance_ledger_entries_source_unique_idx
ON public.finance_ledger_entries(tenant_id, source_type, source_id, entry_type);

CREATE INDEX IF NOT EXISTS finance_ledger_entries_tenant_occurred_idx
ON public.finance_ledger_entries(tenant_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS finance_ledger_entries_project_occurred_idx
ON public.finance_ledger_entries(project_id, occurred_at DESC)
WHERE project_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS finance_ledger_entries_tenant_type_occurred_idx
ON public.finance_ledger_entries(tenant_id, entry_type, occurred_at DESC);

CREATE INDEX IF NOT EXISTS finance_ledger_entries_workflow_task_idx
ON public.finance_ledger_entries(workflow_task_id)
WHERE workflow_task_id IS NOT NULL;

DROP TRIGGER IF EXISTS tr_finance_ledger_entries_updated_at
ON public.finance_ledger_entries;

CREATE TRIGGER tr_finance_ledger_entries_updated_at
  BEFORE UPDATE ON public.finance_ledger_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.tenant_payment_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  provider text NOT NULL,
  merchant_mode text NOT NULL,
  merchant_id text NULL,
  sub_merchant_id text NULL,
  app_id text NULL,
  sub_app_id text NULL,
  status text NOT NULL DEFAULT 'disabled',
  enabled_channels jsonb NOT NULL DEFAULT '[]'::jsonb,
  settlement_account_summary text NULL,
  encrypted_config_ref text NULL,
  risk_switches jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  enabled_at timestamptz NULL,
  disabled_at timestamptz NULL,
  CONSTRAINT tenant_payment_configs_provider_check CHECK (provider IN ('wechat_pay')),
  CONSTRAINT tenant_payment_configs_merchant_mode_check CHECK (merchant_mode IN ('service_provider_sub_merchant', 'direct_merchant')),
  CONSTRAINT tenant_payment_configs_status_check CHECK (status IN ('disabled', 'pending', 'active', 'suspended')),
  CONSTRAINT tenant_payment_configs_channels_array_check CHECK (jsonb_typeof(enabled_channels) = 'array'),
  CONSTRAINT tenant_payment_configs_risk_switches_object_check CHECK (jsonb_typeof(risk_switches) = 'object')
);

CREATE UNIQUE INDEX IF NOT EXISTS tenant_payment_configs_provider_unique_idx
ON public.tenant_payment_configs(tenant_id, provider);

CREATE INDEX IF NOT EXISTS tenant_payment_configs_status_idx
ON public.tenant_payment_configs(status);

DROP TRIGGER IF EXISTS tr_tenant_payment_configs_updated_at
ON public.tenant_payment_configs;

CREATE TRIGGER tr_tenant_payment_configs_updated_at
  BEFORE UPDATE ON public.tenant_payment_configs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.finance_ledger_entries (
  tenant_id,
  project_id,
  direction,
  entry_type,
  amount,
  occurred_at,
  source_type,
  source_id,
  workflow_task_id,
  payment_id,
  handled_by,
  summary,
  metadata
)
SELECT
  projects.tenant_id,
  payments.project_id,
  'in',
  'project_payment',
  payments.amount,
  COALESCE(payments.pay_date, payments.created_at, now()),
  'payment',
  payments.id,
  payments.workflow_task_id,
  payments.id,
  payments.handled_by,
  '项目收款入账',
  jsonb_build_object(
    'payment_type', payments.type,
    'payment_status', payments.status,
    'backfilled', true
  )
FROM public.payments
JOIN public.projects ON projects.id = payments.project_id
WHERE payments.status = 'confirmed'
  AND payments.amount IS NOT NULL
  AND payments.amount > 0
  AND projects.tenant_id IS NOT NULL
ON CONFLICT (tenant_id, source_type, source_id, entry_type) DO NOTHING;

INSERT INTO public.finance_ledger_entries (
  tenant_id,
  project_id,
  direction,
  entry_type,
  amount,
  occurred_at,
  source_type,
  source_id,
  expense_request_id,
  expense_settlement_id,
  handled_by,
  summary,
  metadata
)
SELECT
  settlements.tenant_id,
  requests.project_id,
  'out',
  'expense_settlement',
  settlements.paid_amount,
  COALESCE(settlements.paid_at, settlements.created_at, now()),
  'expense_settlement',
  settlements.id,
  settlements.expense_request_id,
  settlements.id,
  settlements.paid_by,
  '费用打款',
  jsonb_build_object(
    'expense_request_id', settlements.expense_request_id,
    'backfilled', true
  )
FROM public.expense_request_settlements settlements
JOIN public.expense_requests requests ON requests.id = settlements.expense_request_id
WHERE settlements.tenant_id IS NOT NULL
  AND settlements.paid_amount IS NOT NULL
  AND settlements.paid_amount > 0
ON CONFLICT (tenant_id, source_type, source_id, entry_type) DO NOTHING;
