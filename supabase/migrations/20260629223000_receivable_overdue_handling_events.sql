-- Phase 7.4 Task 1: explicit receivable overdue operation audit event types.

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
    'adjust_due_date',
    'cancel_receivable',
    'allocate_payment',
    'adjust_allocation',
    'reverse_allocation'
  )
);
