ALTER TABLE public.expense_requests
ALTER COLUMN status SET DEFAULT 'draft';

ALTER TABLE public.expense_requests
ALTER COLUMN category DROP NOT NULL,
ALTER COLUMN reason DROP NOT NULL;

ALTER TABLE public.expense_requests
ADD COLUMN IF NOT EXISTS request_no text,
ADD COLUMN IF NOT EXISTS title text,
ADD COLUMN IF NOT EXISTS total_amount numeric(12,2) NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS current_step text NOT NULL DEFAULT 'draft',
ADD COLUMN IF NOT EXISTS submitted_at timestamptz,
ADD COLUMN IF NOT EXISTS approved_at timestamptz,
ADD COLUMN IF NOT EXISTS rejected_at timestamptz,
ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
ADD COLUMN IF NOT EXISTS completed_at timestamptz,
ADD COLUMN IF NOT EXISTS assignee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS rejected_reason text;

ALTER TABLE public.expense_requests
DROP CONSTRAINT IF EXISTS expense_requests_total_amount_check,
DROP CONSTRAINT IF EXISTS expense_requests_current_step_check;

ALTER TABLE public.expense_requests
ADD CONSTRAINT expense_requests_total_amount_check
CHECK (total_amount >= 0),
ADD CONSTRAINT expense_requests_current_step_check
CHECK (
  current_step = ANY (
    ARRAY[
      'draft'::text,
      'manager_review'::text,
      'finance_review'::text,
      'payment'::text,
      'done'::text,
      'cancelled'::text
    ]
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_expense_requests_request_no
ON public.expense_requests(request_no)
WHERE request_no IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_expense_requests_current_step
ON public.expense_requests(current_step);

CREATE INDEX IF NOT EXISTS idx_expense_requests_assignee_id
ON public.expense_requests(assignee_id)
WHERE assignee_id IS NOT NULL;

COMMENT ON COLUMN public.expense_requests.request_no IS '费用申请单号';
COMMENT ON COLUMN public.expense_requests.title IS '费用申请标题';
COMMENT ON COLUMN public.expense_requests.total_amount IS '费用申请总金额，等于明细汇总';
COMMENT ON COLUMN public.expense_requests.current_step IS '当前处理节点';
COMMENT ON COLUMN public.expense_requests.assignee_id IS '当前待处理人';
COMMENT ON COLUMN public.expense_requests.rejected_reason IS '驳回原因';

CREATE TABLE IF NOT EXISTS public.expense_request_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_request_id uuid NOT NULL REFERENCES public.expense_requests(id) ON DELETE CASCADE,
  occurred_at timestamptz,
  category text NOT NULL,
  amount numeric(12,2) NOT NULL CHECK (amount >= 0),
  remark text,
  invoice_no text,
  vendor_name text,
  evidence_images jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_expense_request_items_request_id
ON public.expense_request_items(expense_request_id);

CREATE INDEX IF NOT EXISTS idx_expense_request_items_occurred_at
ON public.expense_request_items(occurred_at DESC);

COMMENT ON TABLE public.expense_request_items IS '费用申请明细';
COMMENT ON COLUMN public.expense_request_items.occurred_at IS '费用发生时间';
COMMENT ON COLUMN public.expense_request_items.invoice_no IS '发票号';
COMMENT ON COLUMN public.expense_request_items.vendor_name IS '收款方或商户名称';
COMMENT ON COLUMN public.expense_request_items.evidence_images IS '明细凭证图片数组';

DROP TRIGGER IF EXISTS tr_expense_request_items_updated_at ON public.expense_request_items;

CREATE TRIGGER tr_expense_request_items_updated_at
  BEFORE UPDATE ON public.expense_request_items
  FOR EACH ROW
  EXECUTE PROCEDURE update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.expense_request_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_request_id uuid NOT NULL REFERENCES public.expense_requests(id) ON DELETE CASCADE,
  step text NOT NULL,
  action text NOT NULL,
  approver_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  comment text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.expense_request_approvals
DROP CONSTRAINT IF EXISTS expense_request_approvals_step_check,
DROP CONSTRAINT IF EXISTS expense_request_approvals_action_check;

ALTER TABLE public.expense_request_approvals
ADD CONSTRAINT expense_request_approvals_step_check
CHECK (
  step = ANY (
    ARRAY[
      'draft'::text,
      'manager_review'::text,
      'finance_review'::text,
      'payment'::text,
      'done'::text,
      'cancelled'::text
    ]
  )
),
ADD CONSTRAINT expense_request_approvals_action_check
CHECK (
  action = ANY (
    ARRAY[
      'submit'::text,
      'approve'::text,
      'reject'::text,
      'cancel'::text,
      'resubmit'::text,
      'pay'::text
    ]
  )
);

CREATE INDEX IF NOT EXISTS idx_expense_request_approvals_request_id
ON public.expense_request_approvals(expense_request_id);

CREATE INDEX IF NOT EXISTS idx_expense_request_approvals_approver_id
ON public.expense_request_approvals(approver_id)
WHERE approver_id IS NOT NULL;

COMMENT ON TABLE public.expense_request_approvals IS '费用申请审批记录';

CREATE TABLE IF NOT EXISTS public.expense_request_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_request_id uuid NOT NULL UNIQUE REFERENCES public.expense_requests(id) ON DELETE CASCADE,
  payee_name text NOT NULL,
  payee_bank text,
  payee_account text,
  method text NOT NULL,
  paid_amount numeric(12,2) NOT NULL CHECK (paid_amount >= 0),
  paid_at timestamptz NOT NULL,
  paid_by uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  evidence_images jsonb NOT NULL DEFAULT '[]'::jsonb,
  remark text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.expense_request_settlements
DROP CONSTRAINT IF EXISTS expense_request_settlements_method_check;

ALTER TABLE public.expense_request_settlements
ADD CONSTRAINT expense_request_settlements_method_check
CHECK (
  method = ANY (
    ARRAY[
      'bank_transfer'::text,
      'wechat'::text,
      'alipay'::text,
      'cash'::text
    ]
  )
);

CREATE INDEX IF NOT EXISTS idx_expense_request_settlements_paid_by
ON public.expense_request_settlements(paid_by)
WHERE paid_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_expense_request_settlements_paid_at
ON public.expense_request_settlements(paid_at DESC);

COMMENT ON TABLE public.expense_request_settlements IS '费用申请打款登记';
COMMENT ON COLUMN public.expense_request_settlements.method IS '结算方式';
COMMENT ON COLUMN public.expense_request_settlements.evidence_images IS '打款凭证图片数组';

DROP TRIGGER IF EXISTS tr_expense_request_settlements_updated_at ON public.expense_request_settlements;

CREATE TRIGGER tr_expense_request_settlements_updated_at
  BEFORE UPDATE ON public.expense_request_settlements
  FOR EACH ROW
  EXECUTE PROCEDURE update_updated_at_column();
