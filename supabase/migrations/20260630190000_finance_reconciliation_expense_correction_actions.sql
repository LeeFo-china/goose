ALTER TABLE public.finance_reconciliation_exception_actions
  DROP CONSTRAINT IF EXISTS finance_reconciliation_exception_actions_action_check;

ALTER TABLE public.finance_reconciliation_exception_actions
  ADD CONSTRAINT finance_reconciliation_exception_actions_action_check
  CHECK (action IN (
    'acknowledge',
    'ignore',
    'resolve',
    'reopen',
    'generate_expense_ledger',
    'update_expense_ledger_category',
    'record_expense_amount_mismatch_review'
  ));
