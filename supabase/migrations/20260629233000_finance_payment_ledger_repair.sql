CREATE INDEX IF NOT EXISTS finance_ledger_entries_tenant_payment_project_payment_idx
ON public.finance_ledger_entries (tenant_id, payment_id, occurred_at DESC)
WHERE payment_id IS NOT NULL AND entry_type = 'project_payment';

