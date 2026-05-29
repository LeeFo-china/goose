ALTER TABLE public.project_acceptance_actions
DROP CONSTRAINT IF EXISTS project_acceptance_actions_action_check;

ALTER TABLE public.project_acceptance_actions
ADD CONSTRAINT project_acceptance_actions_action_check
CHECK (
  action IN (
    'create',
    'update',
    'submit',
    'leader_approve',
    'leader_reject',
    'customer_confirm',
    'customer_dispute',
    'employee_rectify',
    'cancel'
  )
);
