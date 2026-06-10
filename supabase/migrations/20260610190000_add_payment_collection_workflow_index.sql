-- Support workflow payment collection gate checks by project, payment type, and status.
CREATE INDEX IF NOT EXISTS idx_payments_project_type_status
ON public.payments(project_id, type, status);
