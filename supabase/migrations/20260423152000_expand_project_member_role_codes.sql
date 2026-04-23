ALTER TABLE public.project_members
DROP CONSTRAINT IF EXISTS project_members_role_code_check;

ALTER TABLE public.project_members
ADD CONSTRAINT project_members_role_code_check
CHECK (
  role_code IN (
    'customer_owner',
    'designer',
    'supervisor',
    'construction_manager',
    'budget_manager',
    'material_manager',
    'site_manager',
    'sales_followup'
  )
);
