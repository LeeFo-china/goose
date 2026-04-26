ALTER TABLE public.customer_log_share_campaigns
  ADD COLUMN IF NOT EXISTS reward_claim_voucher_token text NULL,
  ADD COLUMN IF NOT EXISTS reward_claim_voucher_expires_at timestamptz NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'customer_log_share_campaigns_reward_claim_voucher_token_key'
  ) THEN
    ALTER TABLE public.customer_log_share_campaigns
      ADD CONSTRAINT customer_log_share_campaigns_reward_claim_voucher_token_key
      UNIQUE (reward_claim_voucher_token);
  END IF;
END $$;

COMMENT ON COLUMN public.customer_log_share_campaigns.reward_claim_voucher_token IS '领取凭证 token';
COMMENT ON COLUMN public.customer_log_share_campaigns.reward_claim_voucher_expires_at IS '领取凭证过期时间';
