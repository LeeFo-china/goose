ALTER TABLE public.finance_reconciliation_exception_actions
  DROP CONSTRAINT IF EXISTS finance_reconciliation_exception_actions_code_check;

ALTER TABLE public.finance_reconciliation_exception_actions
  ADD CONSTRAINT finance_reconciliation_exception_actions_code_check
  CHECK (exception_code IN (
    'receivable_overdue',
    'payment_without_ledger',
    'ledger_without_payment',
    'payment_unallocated',
    'allocation_amount_mismatch',
    'receivable_paid_amount_mismatch',
    'expense_paid_without_ledger',
    'expense_paid_amount_mismatch',
    'expense_ledger_without_category'
  ));

ALTER TABLE public.finance_reconciliation_exception_actions
  DROP CONSTRAINT IF EXISTS finance_reconciliation_exception_actions_subject_type_check;

ALTER TABLE public.finance_reconciliation_exception_actions
  ADD CONSTRAINT finance_reconciliation_exception_actions_subject_type_check
  CHECK (subject_type IN (
    'receivable',
    'payment',
    'ledger',
    'expense_settlement'
  ));
