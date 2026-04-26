CREATE TABLE IF NOT EXISTS public.marketing_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_type text NOT NULL,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  enabled boolean NOT NULL DEFAULT false,
  target_scope_type text NOT NULL DEFAULT 'all_projects',
  valid_from timestamptz NULL,
  valid_until timestamptz NULL,
  auto_close_on_expire boolean NOT NULL DEFAULT true,
  reward_title text NULL,
  reward_remark text NULL,
  reward_claim_instruction text NULL,
  reward_claim_channel text NULL,
  config_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by_employee_id uuid NULL REFERENCES public.employees(id) ON DELETE SET NULL,
  updated_by_employee_id uuid NULL REFERENCES public.employees(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.marketing_campaign_project_scopes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.marketing_campaigns(id) ON DELETE CASCADE,
  scope_mode text NOT NULL,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_marketing_campaigns_type_status
ON public.marketing_campaigns(campaign_type, status, enabled);

CREATE INDEX IF NOT EXISTS idx_marketing_campaign_project_scopes_campaign_id
ON public.marketing_campaign_project_scopes(campaign_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_marketing_campaign_project_scopes_unique
ON public.marketing_campaign_project_scopes(campaign_id, scope_mode, project_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'marketing_campaigns_status_check'
  ) THEN
    ALTER TABLE public.marketing_campaigns
      ADD CONSTRAINT marketing_campaigns_status_check
      CHECK (status IN ('draft', 'active', 'paused', 'closed'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'marketing_campaigns_target_scope_type_check'
  ) THEN
    ALTER TABLE public.marketing_campaigns
      ADD CONSTRAINT marketing_campaigns_target_scope_type_check
      CHECK (target_scope_type IN ('all_projects', 'project_list'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'marketing_campaign_project_scopes_scope_mode_check'
  ) THEN
    ALTER TABLE public.marketing_campaign_project_scopes
      ADD CONSTRAINT marketing_campaign_project_scopes_scope_mode_check
      CHECK (scope_mode IN ('include', 'exclude'));
  END IF;
END $$;

ALTER TABLE public.customer_log_share_campaigns
  ADD COLUMN IF NOT EXISTS campaign_id uuid NULL REFERENCES public.marketing_campaigns(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS campaign_type text NOT NULL DEFAULT 'share_assist';

CREATE INDEX IF NOT EXISTS idx_customer_log_share_campaigns_campaign_id
ON public.customer_log_share_campaigns(campaign_id);

COMMENT ON TABLE public.marketing_campaigns IS '营销中心活动主表';
COMMENT ON TABLE public.marketing_campaign_project_scopes IS '营销活动项目范围表';
COMMENT ON COLUMN public.marketing_campaigns.campaign_type IS '活动类型，当前首个类型为 share_assist';
COMMENT ON COLUMN public.marketing_campaigns.target_scope_type IS '活动参与范围类型: all_projects/project_list';
COMMENT ON COLUMN public.marketing_campaigns.config_payload IS '活动类型专属配置 JSON';
COMMENT ON COLUMN public.marketing_campaign_project_scopes.scope_mode IS '项目范围模式: include/exclude';
COMMENT ON COLUMN public.customer_log_share_campaigns.campaign_id IS '所属营销活动主表ID';
COMMENT ON COLUMN public.customer_log_share_campaigns.campaign_type IS '实例所属营销活动类型快照';
