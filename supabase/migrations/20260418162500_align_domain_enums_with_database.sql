ALTER TABLE public.customers
ALTER COLUMN status SET DEFAULT 'potential';

ALTER TABLE public.customers
DROP CONSTRAINT IF EXISTS customers_status_check,
DROP CONSTRAINT IF EXISTS customers_source_check;

ALTER TABLE public.customers
ADD CONSTRAINT customers_status_check
CHECK (
  status IS NULL OR status = ANY (
    ARRAY[
      'potential'::text,
      'following'::text,
      'arrived'::text,
      'ordered'::text,
      'contracted'::text,
      'dormant'::text,
      'invalid'::text
    ]
  )
),
ADD CONSTRAINT customers_source_check
CHECK (
  source IS NULL OR source = ANY (
    ARRAY[
      'douyin'::text,
      'referral'::text,
      'walk_in'::text,
      'telemarketing'::text,
      'platform'::text
    ]
  )
);

ALTER TABLE public.employees
ALTER COLUMN status SET DEFAULT 'active';

ALTER TABLE public.employees
DROP CONSTRAINT IF EXISTS employees_status_check,
DROP CONSTRAINT IF EXISTS employees_role_check;

ALTER TABLE public.employees
ADD CONSTRAINT employees_status_check
CHECK (
  status IS NULL OR status = ANY (
    ARRAY[
      'pending'::text,
      'active'::text,
      'suspended'::text,
      'leaved'::text
    ]
  )
),
ADD CONSTRAINT employees_role_check
CHECK (
  role IS NULL OR role = ANY (
    ARRAY[
      'admin'::text,
      'employee'::text,
      'finance'::text
    ]
  )
);

ALTER TABLE public.projects
DROP CONSTRAINT IF EXISTS projects_status_check;

ALTER TABLE public.projects
ADD CONSTRAINT projects_status_check
CHECK (
  status IS NULL OR status = ANY (
    ARRAY[
      'lead'::text,
      'measure'::text,
      'negotiating'::text,
      'signed'::text,
      'designing'::text,
      'constructing'::text,
      'on_hold'::text,
      'acceptance'::text,
      'completed'::text,
      'after_sale'::text,
      'invalid'::text
    ]
  )
);

ALTER TABLE public.payments
ALTER COLUMN status SET DEFAULT 'pending',
ALTER COLUMN type SET DEFAULT 'deposit';

ALTER TABLE public.payments
DROP CONSTRAINT IF EXISTS payments_status_check,
DROP CONSTRAINT IF EXISTS payments_type_check;

ALTER TABLE public.payments
ADD CONSTRAINT payments_status_check
CHECK (
  status IS NULL OR status = ANY (
    ARRAY[
      'pending'::text,
      'confirmed'::text,
      'rejected'::text,
      'refunded'::text
    ]
  )
),
ADD CONSTRAINT payments_type_check
CHECK (
  type IS NULL OR type = ANY (
    ARRAY[
      'deposit'::text,
      'stage_1'::text,
      'stage_2'::text,
      'stage_3'::text,
      'add_on'::text,
      'refund'::text
    ]
  )
);

ALTER TABLE public.posts
ALTER COLUMN salary_type SET DEFAULT 'fixed',
ALTER COLUMN status SET DEFAULT 1;

ALTER TABLE public.posts
DROP CONSTRAINT IF EXISTS posts_salary_type_check,
DROP CONSTRAINT IF EXISTS posts_status_check,
DROP CONSTRAINT IF EXISTS posts_code_check;

ALTER TABLE public.posts
ADD CONSTRAINT posts_salary_type_check
CHECK (
  salary_type IS NULL OR salary_type = ANY (
    ARRAY[
      'fixed'::text,
      'commission'::text,
      'hourly'::text,
      'performance'::text
    ]
  )
),
ADD CONSTRAINT posts_status_check
CHECK (
  status IS NULL OR status = ANY (ARRAY[0, 1])
),
ADD CONSTRAINT posts_code_check
CHECK (
  code IS NULL OR code = ANY (
    ARRAY[
      'MARKETING_DIRECTOR'::text,
      'SALES_CONSULTANT'::text,
      'DESIGN_DIRECTOR'::text,
      'INTERIOR_DESIGNER'::text,
      'PROJECT_MANAGER'::text,
      'CONSTRUCTION_SUPER'::text,
      'FINANCE_ACCOUNTANT'::text,
      'PROCURE_OFFICER'::text
    ]
  )
);

ALTER TABLE public.expense_requests
DROP CONSTRAINT IF EXISTS expense_requests_status_check,
DROP CONSTRAINT IF EXISTS expense_requests_mode_check;

ALTER TABLE public.expense_requests
ADD CONSTRAINT expense_requests_status_check
CHECK (
  status = ANY (
    ARRAY[
      'draft'::text,
      'pending'::text,
      'approved'::text,
      'rejected'::text,
      'paid'::text,
      'cancelled'::text
    ]
  )
),
ADD CONSTRAINT expense_requests_mode_check
CHECK (
  mode = ANY (
    ARRAY[
      'reimbursement'::text,
      'advance'::text,
      'direct'::text,
      'petty_cash'::text
    ]
  )
);

ALTER TABLE public.sms_verification_codes
ALTER COLUMN status SET DEFAULT 'pending';

ALTER TABLE public.sms_verification_codes
DROP CONSTRAINT IF EXISTS sms_verification_codes_scene_check,
DROP CONSTRAINT IF EXISTS sms_verification_codes_status_check;

ALTER TABLE public.sms_verification_codes
ADD CONSTRAINT sms_verification_codes_scene_check
CHECK (
  scene = ANY (
    ARRAY[
      'bind_customer'::text,
      'bind_employee'::text
    ]
  )
),
ADD CONSTRAINT sms_verification_codes_status_check
CHECK (
  status = ANY (
    ARRAY[
      'pending'::text,
      'verified'::text,
      'expired'::text
    ]
  )
);

ALTER TABLE public.project_log_comments
DROP CONSTRAINT IF EXISTS project_log_comments_author_type_check;

ALTER TABLE public.project_log_comments
ADD CONSTRAINT project_log_comments_author_type_check
CHECK (
  author_type = ANY (
    ARRAY[
      'employee'::text,
      'customer'::text
    ]
  )
);
