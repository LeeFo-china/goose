UPDATE public.customers
SET status = 'designing'
WHERE status IN ('ordered', 'contracted');

UPDATE public.customer_status_transition_logs
SET
  action = CASE
    WHEN action IN ('place_order', 'sign_contract') THEN 'start_design'
    ELSE action
  END,
  from_status = CASE
    WHEN from_status IN ('ordered', 'contracted') THEN 'designing'
    ELSE from_status
  END,
  to_status = CASE
    WHEN to_status IN ('ordered', 'contracted') THEN 'designing'
    ELSE to_status
  END
WHERE
  action IN ('place_order', 'sign_contract')
  OR from_status IN ('ordered', 'contracted')
  OR to_status IN ('ordered', 'contracted');

ALTER TABLE public.customers
DROP CONSTRAINT IF EXISTS customers_status_check;

ALTER TABLE public.customers
ADD CONSTRAINT customers_status_check
CHECK (
  status IS NULL OR status = ANY (
    ARRAY[
      'potential'::text,
      'following'::text,
      'arrived'::text,
      'designing'::text,
      'dormant'::text,
      'invalid'::text
    ]
  )
);

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
    'dormant',
    'invalid'
  )
);

UPDATE public.projects
SET status = CASE
  WHEN status IN ('lead', 'measure', 'negotiating') THEN 'designing'
  WHEN status IN ('completed', 'after_sale') THEN 'acceptance'
  ELSE status
END
WHERE status IN ('lead', 'measure', 'negotiating', 'completed', 'after_sale');

ALTER TABLE public.project_status_transition_logs
DROP CONSTRAINT IF EXISTS project_status_transition_logs_action_check,
DROP CONSTRAINT IF EXISTS project_status_transition_logs_from_status_check,
DROP CONSTRAINT IF EXISTS project_status_transition_logs_to_status_check;

UPDATE public.project_status_transition_logs
SET
  action = CASE
    WHEN action IN ('start_measure', 'start_negotiation', 'start_design') THEN 'confirm_proposal'
    WHEN action IN ('complete_project', 'start_after_sale') THEN 'start_acceptance'
    ELSE action
  END,
  from_status = CASE
    WHEN from_status IN ('lead', 'measure', 'negotiating') THEN 'designing'
    WHEN from_status IN ('completed', 'after_sale') THEN 'acceptance'
    ELSE from_status
  END,
  to_status = CASE
    WHEN to_status IN ('lead', 'measure', 'negotiating') THEN 'designing'
    WHEN to_status IN ('completed', 'after_sale') THEN 'acceptance'
    ELSE to_status
  END,
  metadata = CASE
    WHEN metadata ? 'paused_from_status' THEN
      jsonb_set(
        metadata,
        '{paused_from_status}',
        to_jsonb(
          CASE metadata->>'paused_from_status'
            WHEN 'lead' THEN 'designing'
            WHEN 'measure' THEN 'designing'
            WHEN 'negotiating' THEN 'designing'
            WHEN 'completed' THEN 'acceptance'
            WHEN 'after_sale' THEN 'acceptance'
            ELSE metadata->>'paused_from_status'
          END
        )
      )
    ELSE metadata
  END
WHERE
  action IN ('start_measure', 'start_negotiation', 'start_design', 'complete_project', 'start_after_sale')
  OR from_status IN ('lead', 'measure', 'negotiating', 'completed', 'after_sale')
  OR to_status IN ('lead', 'measure', 'negotiating', 'completed', 'after_sale')
  OR metadata->>'paused_from_status' IN ('lead', 'measure', 'negotiating', 'completed', 'after_sale');

ALTER TABLE public.projects
ALTER COLUMN status SET DEFAULT 'designing';

ALTER TABLE public.projects
DROP CONSTRAINT IF EXISTS projects_status_check;

ALTER TABLE public.projects
ADD CONSTRAINT projects_status_check
CHECK (
  status IS NULL OR status = ANY (
    ARRAY[
      'designing'::text,
      'proposal_confirmed'::text,
      'signed'::text,
      'design_finalized'::text,
      'pending_start'::text,
      'started'::text,
      'constructing'::text,
      'on_hold'::text,
      'acceptance'::text,
      'invalid'::text
    ]
  )
);

ALTER TABLE public.project_status_transition_logs
ADD CONSTRAINT project_status_transition_logs_action_check
CHECK (
  action IN (
    'confirm_proposal',
    'sign_contract',
    'finalize_design',
    'schedule_construction',
    'start_project',
    'start_construction',
    'pause_project',
    'resume_project',
    'start_acceptance',
    'mark_invalid'
  )
),
ADD CONSTRAINT project_status_transition_logs_from_status_check
CHECK (
  from_status IS NULL OR from_status IN (
    'designing',
    'proposal_confirmed',
    'signed',
    'design_finalized',
    'pending_start',
    'started',
    'constructing',
    'on_hold',
    'acceptance',
    'invalid'
  )
),
ADD CONSTRAINT project_status_transition_logs_to_status_check
CHECK (
  to_status IN (
    'designing',
    'proposal_confirmed',
    'signed',
    'design_finalized',
    'pending_start',
    'started',
    'constructing',
    'on_hold',
    'acceptance',
    'invalid'
  )
);
