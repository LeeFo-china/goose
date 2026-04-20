CREATE INDEX IF NOT EXISTS idx_employees_user_id
ON public.employees(user_id)
WHERE user_id IS NOT NULL;
