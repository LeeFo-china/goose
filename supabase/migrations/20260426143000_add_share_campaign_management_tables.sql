CREATE TABLE IF NOT EXISTS public.project_share_campaign_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  config_status text NOT NULL DEFAULT 'draft',
  enabled boolean NOT NULL DEFAULT false,
  template_id uuid NULL,
  config_mode text NOT NULL DEFAULT 'custom',
  target_assist_count integer NOT NULL DEFAULT 10,
  reward_title text NULL,
  reward_remark text NULL,
  reward_claim_instruction text NULL,
  reward_claim_channel text NULL,
  valid_from timestamptz NULL,
  valid_until timestamptz NULL,
  auto_close_on_expire boolean NOT NULL DEFAULT true,
  allow_create_when_existing_active boolean NOT NULL DEFAULT false,
  default_display_title text NULL,
  default_display_subtitle text NULL,
  created_by_employee_id uuid NULL REFERENCES public.employees(id) ON DELETE SET NULL,
  updated_by_employee_id uuid NULL REFERENCES public.employees(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'project_share_campaign_configs_config_status_check'
  ) THEN
    ALTER TABLE public.project_share_campaign_configs
      ADD CONSTRAINT project_share_campaign_configs_config_status_check
      CHECK (config_status IN ('draft', 'active', 'paused', 'closed'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'project_share_campaign_configs_config_mode_check'
  ) THEN
    ALTER TABLE public.project_share_campaign_configs
      ADD CONSTRAINT project_share_campaign_configs_config_mode_check
      CHECK (config_mode IN ('inherit', 'custom'));
  END IF;
END $$;

ALTER TABLE public.customer_log_share_campaigns
  ADD COLUMN IF NOT EXISTS config_id uuid NULL REFERENCES public.project_share_campaign_configs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reward_title text NULL,
  ADD COLUMN IF NOT EXISTS reward_remark text NULL,
  ADD COLUMN IF NOT EXISTS valid_until timestamptz NULL;

UPDATE public.customer_log_share_campaigns
SET reward_title = CONCAT(target_assist_count, '人助力解锁专属到店礼')
WHERE reward_title IS NULL;

UPDATE public.customer_log_share_campaigns
SET reward_remark = '凭分享图到店可领取'
WHERE reward_remark IS NULL;

COMMENT ON TABLE public.project_share_campaign_configs IS '项目级好友助力活动配置';
COMMENT ON COLUMN public.project_share_campaign_configs.config_status IS '配置状态: draft/active/paused/closed';
COMMENT ON COLUMN public.project_share_campaign_configs.config_mode IS '配置模式: inherit/custom';
COMMENT ON COLUMN public.customer_log_share_campaigns.config_id IS '活动生成时命中的项目配置ID';
COMMENT ON COLUMN public.customer_log_share_campaigns.reward_title IS '活动奖励标题快照';
COMMENT ON COLUMN public.customer_log_share_campaigns.reward_remark IS '活动奖励补充说明快照';
COMMENT ON COLUMN public.customer_log_share_campaigns.valid_until IS '活动有效截止时间';
