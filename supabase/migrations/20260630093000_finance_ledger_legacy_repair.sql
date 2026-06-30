ALTER TABLE public.finance_ledger_entries
ADD COLUMN IF NOT EXISTS payment_linked_at timestamptz NULL,
ADD COLUMN IF NOT EXISTS payment_linked_by uuid NULL REFERENCES public.employees(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS payment_link_reason text NULL,
ADD COLUMN IF NOT EXISTS payment_link_previous_payment_id uuid NULL,
ADD COLUMN IF NOT EXISTS legacy_payment_ledger_marked_at timestamptz NULL,
ADD COLUMN IF NOT EXISTS legacy_payment_ledger_marked_by uuid NULL REFERENCES public.employees(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS legacy_payment_ledger_reason text NULL;

CREATE INDEX IF NOT EXISTS finance_ledger_entries_unlinked_project_payment_idx
ON public.finance_ledger_entries (tenant_id, project_id, occurred_at DESC)
WHERE direction = 'in'
  AND entry_type = 'project_payment'
  AND payment_id IS NULL
  AND legacy_payment_ledger_marked_at IS NULL;

COMMENT ON COLUMN public.finance_ledger_entries.payment_linked_at IS '项目收款台账人工关联收款时间';
COMMENT ON COLUMN public.finance_ledger_entries.payment_linked_by IS '项目收款台账人工关联收款操作人';
COMMENT ON COLUMN public.finance_ledger_entries.payment_link_reason IS '项目收款台账人工关联收款原因';
COMMENT ON COLUMN public.finance_ledger_entries.payment_link_previous_payment_id IS '项目收款台账人工关联前的旧收款 ID';
COMMENT ON COLUMN public.finance_ledger_entries.legacy_payment_ledger_marked_at IS '项目收款台账标记为历史流水的时间';
COMMENT ON COLUMN public.finance_ledger_entries.legacy_payment_ledger_marked_by IS '项目收款台账标记为历史流水的操作人';
COMMENT ON COLUMN public.finance_ledger_entries.legacy_payment_ledger_reason IS '项目收款台账标记为历史流水的原因';

