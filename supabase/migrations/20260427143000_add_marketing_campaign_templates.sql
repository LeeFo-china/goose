CREATE TABLE IF NOT EXISTS public.marketing_campaign_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_type text NOT NULL,
  name text NOT NULL,
  description text NULL,
  status text NOT NULL DEFAULT 'draft',
  enabled boolean NOT NULL DEFAULT true,
  is_builtin boolean NOT NULL DEFAULT false,
  default_target_scope_type text NOT NULL DEFAULT 'all_projects',
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

CREATE INDEX IF NOT EXISTS idx_marketing_campaign_templates_type_status
ON public.marketing_campaign_templates(campaign_type, status, enabled);

ALTER TABLE public.marketing_campaigns
  ADD COLUMN IF NOT EXISTS template_id uuid NULL REFERENCES public.marketing_campaign_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS template_snapshot jsonb NULL;

CREATE INDEX IF NOT EXISTS idx_marketing_campaigns_template_id
ON public.marketing_campaigns(template_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'marketing_campaign_templates_status_check'
  ) THEN
    ALTER TABLE public.marketing_campaign_templates
      ADD CONSTRAINT marketing_campaign_templates_status_check
      CHECK (status IN ('draft', 'active', 'disabled'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'marketing_campaign_templates_campaign_type_check'
  ) THEN
    ALTER TABLE public.marketing_campaign_templates
      ADD CONSTRAINT marketing_campaign_templates_campaign_type_check
      CHECK (campaign_type IN ('share_assist'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'marketing_campaign_templates_scope_type_check'
  ) THEN
    ALTER TABLE public.marketing_campaign_templates
      ADD CONSTRAINT marketing_campaign_templates_scope_type_check
      CHECK (default_target_scope_type IN ('all_projects', 'project_list'));
  END IF;
END $$;

COMMENT ON TABLE public.marketing_campaign_templates IS '营销中心活动模板表';
COMMENT ON COLUMN public.marketing_campaign_templates.campaign_type IS '模板对应活动类型';
COMMENT ON COLUMN public.marketing_campaign_templates.default_target_scope_type IS '模板默认活动范围类型';
COMMENT ON COLUMN public.marketing_campaign_templates.config_payload IS '模板默认活动配置 JSON';
COMMENT ON COLUMN public.marketing_campaigns.template_id IS '活动来源模板ID';
COMMENT ON COLUMN public.marketing_campaigns.template_snapshot IS '活动创建时固化的模板快照';
