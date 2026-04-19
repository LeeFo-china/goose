CREATE TABLE IF NOT EXISTS public.project_referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  referrer_id uuid NOT NULL REFERENCES public.external_referrers(id) ON DELETE RESTRICT,
  rate_bps integer NOT NULL,
  base_amount numeric(12,2),
  commission_amount numeric(12,2),
  status text NOT NULL DEFAULT 'pending',
  calculated_at timestamptz,
  recalculated_at timestamptz,
  paid_at timestamptz,
  paid_evidence_images jsonb NOT NULL DEFAULT '[]'::jsonb,
  paid_remark text,
  paid_by uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  remark text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS project_referrals_project_id_unique
ON public.project_referrals(project_id);

CREATE INDEX IF NOT EXISTS idx_project_referrals_referrer_id
ON public.project_referrals(referrer_id);

CREATE INDEX IF NOT EXISTS idx_project_referrals_status
ON public.project_referrals(status);

ALTER TABLE public.project_referrals
DROP CONSTRAINT IF EXISTS project_referrals_rate_bps_check,
DROP CONSTRAINT IF EXISTS project_referrals_status_check,
DROP CONSTRAINT IF EXISTS project_referrals_base_amount_check,
DROP CONSTRAINT IF EXISTS project_referrals_commission_amount_check,
DROP CONSTRAINT IF EXISTS project_referrals_paid_fields_check;

ALTER TABLE public.project_referrals
ADD CONSTRAINT project_referrals_rate_bps_check
CHECK (rate_bps >= 100 AND rate_bps <= 400),
ADD CONSTRAINT project_referrals_status_check
CHECK (
  status = ANY (
    ARRAY[
      'pending'::text,
      'calculated'::text,
      'paid'::text,
      'cancelled'::text
    ]
  )
),
ADD CONSTRAINT project_referrals_base_amount_check
CHECK (base_amount IS NULL OR base_amount >= 0),
ADD CONSTRAINT project_referrals_commission_amount_check
CHECK (commission_amount IS NULL OR commission_amount >= 0),
ADD CONSTRAINT project_referrals_paid_fields_check
CHECK (
  status <> 'paid'
  OR (
    paid_at IS NOT NULL
    AND paid_by IS NOT NULL
  )
);

COMMENT ON TABLE public.project_referrals IS '项目外部介绍费规则与计算结果';
COMMENT ON COLUMN public.project_referrals.rate_bps IS '提成比例，按基点存储，100=1%';
COMMENT ON COLUMN public.project_referrals.base_amount IS '提成计算基数，通常取项目签约金额 signed_amount';
COMMENT ON COLUMN public.project_referrals.commission_amount IS '介绍费金额';
COMMENT ON COLUMN public.project_referrals.status IS '介绍费状态: pending/calculated/paid/cancelled';
COMMENT ON COLUMN public.project_referrals.paid_evidence_images IS '介绍费支付凭证图片数组';
COMMENT ON COLUMN public.project_referrals.paid_remark IS '介绍费支付备注';

DROP TRIGGER IF EXISTS tr_project_referrals_updated_at ON public.project_referrals;

CREATE TRIGGER tr_project_referrals_updated_at
  BEFORE UPDATE ON public.project_referrals
  FOR EACH ROW
  EXECUTE PROCEDURE update_updated_at_column();
