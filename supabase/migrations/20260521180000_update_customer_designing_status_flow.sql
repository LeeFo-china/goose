ALTER TABLE public.customer_status_transition_logs
DROP CONSTRAINT IF EXISTS customer_status_transition_logs_action_check,
DROP CONSTRAINT IF EXISTS customer_status_transition_logs_from_status_check,
DROP CONSTRAINT IF EXISTS customer_status_transition_logs_to_status_check;

ALTER TABLE public.customer_status_transition_logs
ADD CONSTRAINT customer_status_transition_logs_action_check
CHECK (
  action IN (
    'start_following',
    'mark_arrived',
    'start_design',
    'place_order',
    'sign_contract',
    'mark_dormant',
    'reactivate',
    'mark_invalid'
  )
),
ADD CONSTRAINT customer_status_transition_logs_from_status_check
CHECK (
  from_status IS NULL OR from_status IN (
    'potential',
    'following',
    'arrived',
    'designing',
    'ordered',
    'contracted',
    'dormant',
    'invalid'
  )
),
ADD CONSTRAINT customer_status_transition_logs_to_status_check
CHECK (
  to_status IN (
    'potential',
    'following',
    'arrived',
    'designing',
    'ordered',
    'contracted',
    'dormant',
    'invalid'
  )
);
