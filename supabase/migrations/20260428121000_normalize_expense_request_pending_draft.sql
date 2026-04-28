UPDATE public.expense_requests
SET current_step = 'manager_review'
WHERE status = 'pending'
  AND current_step = 'draft';
