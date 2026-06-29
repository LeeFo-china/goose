-- Phase 7.4: reversible manual receivable allocation audit fields.

ALTER TABLE public.project_receivable_allocations
  ADD COLUMN IF NOT EXISTS reversed_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS reversed_by uuid NULL
    REFERENCES public.employees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reverse_reason text NULL;

CREATE INDEX IF NOT EXISTS project_receivable_allocations_active_plan_idx
ON public.project_receivable_allocations(receivable_plan_id, allocated_at DESC)
WHERE reversed_at IS NULL;

CREATE INDEX IF NOT EXISTS project_receivable_allocations_active_payment_idx
ON public.project_receivable_allocations(payment_id, allocated_at DESC)
WHERE reversed_at IS NULL;

CREATE INDEX IF NOT EXISTS project_receivable_allocations_project_active_idx
ON public.project_receivable_allocations(tenant_id, project_id, allocated_at DESC)
WHERE reversed_at IS NULL;

ALTER TABLE public.project_receivable_events
DROP CONSTRAINT IF EXISTS project_receivable_events_event_type_check;

ALTER TABLE public.project_receivable_events
ADD CONSTRAINT project_receivable_events_event_type_check
CHECK (
  event_type IN (
    'manual_created',
    'adjusted',
    'canceled',
    'follow_up',
    'allocate_payment',
    'adjust_allocation',
    'reverse_allocation'
  )
);
