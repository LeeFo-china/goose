ALTER TABLE public.marketing_campaigns
  DROP CONSTRAINT IF EXISTS marketing_campaigns_campaign_type_check;

ALTER TABLE public.marketing_campaign_templates
  DROP CONSTRAINT IF EXISTS marketing_campaign_templates_campaign_type_check;

ALTER TABLE public.marketing_campaigns
  ADD CONSTRAINT marketing_campaigns_campaign_type_check
  CHECK (campaign_type IN ('share_assist', 'appointment_reward'));

ALTER TABLE public.marketing_campaign_templates
  ADD CONSTRAINT marketing_campaign_templates_campaign_type_check
  CHECK (campaign_type IN ('share_assist', 'appointment_reward'));

CREATE TABLE IF NOT EXISTS public.customer_appointment_reward_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.marketing_campaigns(id) ON DELETE CASCADE,
  campaign_type text NOT NULL DEFAULT 'appointment_reward',
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  appointment_name text NULL,
  appointment_phone text NULL,
  appointment_time timestamptz NULL,
  status text NOT NULL DEFAULT 'active',
  reward_claim_status text NOT NULL DEFAULT 'unclaimed',
  reward_claim_code text NULL,
  reward_claim_voucher_token text NULL,
  achieved_at timestamptz NULL,
  reward_claimed_at timestamptz NULL,
  reward_claimed_by_employee_id uuid NULL REFERENCES public.employees(id) ON DELETE SET NULL,
  reward_claim_channel text NULL,
  closed_at timestamptz NULL,
  closed_reason text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_appointment_reward_campaigns_campaign_id
ON public.customer_appointment_reward_campaigns(campaign_id);

CREATE INDEX IF NOT EXISTS idx_customer_appointment_reward_campaigns_customer_project
ON public.customer_appointment_reward_campaigns(customer_id, project_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_appointment_reward_campaigns_reward_claim_voucher_token
ON public.customer_appointment_reward_campaigns(reward_claim_voucher_token)
WHERE reward_claim_voucher_token IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'customer_appointment_reward_campaigns_campaign_type_check'
  ) THEN
    ALTER TABLE public.customer_appointment_reward_campaigns
      ADD CONSTRAINT customer_appointment_reward_campaigns_campaign_type_check
      CHECK (campaign_type = 'appointment_reward');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'customer_appointment_reward_campaigns_status_check'
  ) THEN
    ALTER TABLE public.customer_appointment_reward_campaigns
      ADD CONSTRAINT customer_appointment_reward_campaigns_status_check
      CHECK (status IN ('active', 'achieved', 'reward_claimed', 'closed'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'customer_appointment_reward_campaigns_reward_claim_status_check'
  ) THEN
    ALTER TABLE public.customer_appointment_reward_campaigns
      ADD CONSTRAINT customer_appointment_reward_campaigns_reward_claim_status_check
      CHECK (reward_claim_status IN ('unclaimed', 'pending', 'claimed', 'expired'));
  END IF;
END $$;

COMMENT ON TABLE public.customer_appointment_reward_campaigns IS '营销中心预约奖励活动实例表';
COMMENT ON COLUMN public.customer_appointment_reward_campaigns.campaign_type IS '预约奖励实例类型快照';
