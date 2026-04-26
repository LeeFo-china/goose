ALTER TABLE public.customer_log_share_campaigns
  ADD COLUMN IF NOT EXISTS reward_claim_status text NOT NULL DEFAULT 'unclaimed',
  ADD COLUMN IF NOT EXISTS reward_claim_code text NULL,
  ADD COLUMN IF NOT EXISTS reward_claim_instruction text NULL,
  ADD COLUMN IF NOT EXISTS reward_claim_channel text NULL,
  ADD COLUMN IF NOT EXISTS reward_claim_requested_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS reward_claimed_by_employee_id uuid NULL REFERENCES public.employees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS closed_reason text NULL,
  ADD COLUMN IF NOT EXISTS latest_opened_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS latest_assisted_at timestamptz NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'customer_log_share_campaigns_reward_claim_status_check'
  ) THEN
    ALTER TABLE public.customer_log_share_campaigns
      ADD CONSTRAINT customer_log_share_campaigns_reward_claim_status_check
      CHECK (reward_claim_status IN ('unclaimed', 'pending', 'claimed', 'expired'));
  END IF;
END $$;

UPDATE public.customer_log_share_campaigns
SET reward_claim_status = CASE
  WHEN status = 'reward_claimed' THEN 'claimed'
  WHEN status = 'closed' THEN 'expired'
  ELSE 'unclaimed'
END
WHERE reward_claim_status IS NULL
   OR reward_claim_status NOT IN ('unclaimed', 'pending', 'claimed', 'expired');

UPDATE public.customer_log_share_campaigns
SET latest_opened_at = opens.max_created_at
FROM (
  SELECT campaign_id, MAX(created_at) AS max_created_at
  FROM public.customer_log_share_opens
  GROUP BY campaign_id
) AS opens
WHERE public.customer_log_share_campaigns.id = opens.campaign_id
  AND public.customer_log_share_campaigns.latest_opened_at IS NULL;

UPDATE public.customer_log_share_campaigns
SET latest_assisted_at = assists.max_created_at
FROM (
  SELECT campaign_id, MAX(created_at) AS max_created_at
  FROM public.customer_log_share_assists
  GROUP BY campaign_id
) AS assists
WHERE public.customer_log_share_campaigns.id = assists.campaign_id
  AND public.customer_log_share_campaigns.latest_assisted_at IS NULL;

ALTER TABLE public.customer_log_share_assists
  ADD COLUMN IF NOT EXISTS helper_name text NULL,
  ADD COLUMN IF NOT EXISTS helper_avatar text NULL,
  ADD COLUMN IF NOT EXISTS is_valid boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS invalid_reason text NULL,
  ADD COLUMN IF NOT EXISTS risk_level text NOT NULL DEFAULT 'normal';

COMMENT ON COLUMN public.customer_log_share_campaigns.reward_claim_status IS '领奖状态: unclaimed/pending/claimed/expired';
COMMENT ON COLUMN public.customer_log_share_campaigns.reward_claim_code IS '领奖码';
COMMENT ON COLUMN public.customer_log_share_campaigns.reward_claim_instruction IS '领奖说明';
COMMENT ON COLUMN public.customer_log_share_campaigns.reward_claim_channel IS '领奖渠道';
COMMENT ON COLUMN public.customer_log_share_campaigns.reward_claim_requested_at IS '领奖请求时间';
COMMENT ON COLUMN public.customer_log_share_campaigns.reward_claimed_by_employee_id IS '确认领奖的员工ID';
COMMENT ON COLUMN public.customer_log_share_campaigns.closed_reason IS '关闭原因';
COMMENT ON COLUMN public.customer_log_share_campaigns.latest_opened_at IS '最近打开时间';
COMMENT ON COLUMN public.customer_log_share_campaigns.latest_assisted_at IS '最近助力时间';
COMMENT ON COLUMN public.customer_log_share_assists.helper_name IS '助力好友昵称快照';
COMMENT ON COLUMN public.customer_log_share_assists.helper_avatar IS '助力好友头像快照';
COMMENT ON COLUMN public.customer_log_share_assists.is_valid IS '是否有效助力';
COMMENT ON COLUMN public.customer_log_share_assists.invalid_reason IS '无效原因';
COMMENT ON COLUMN public.customer_log_share_assists.risk_level IS '风控等级';
