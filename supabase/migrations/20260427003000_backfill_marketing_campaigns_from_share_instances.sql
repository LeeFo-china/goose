WITH orphan_instances AS (
  SELECT
    gen_random_uuid() AS new_campaign_id,
    c.id AS instance_id,
    c.project_id,
    c.created_at,
    c.valid_until,
    c.reward_title,
    c.reward_remark,
    c.reward_claim_instruction,
    c.reward_claim_channel,
    c.target_assist_count,
    c.status,
    p.name AS project_name
  FROM public.customer_log_share_campaigns c
  LEFT JOIN public.projects p ON p.id = c.project_id
  WHERE c.campaign_id IS NULL
    AND c.campaign_type = 'share_assist'
),
inserted_campaigns AS (
  INSERT INTO public.marketing_campaigns (
    id,
    campaign_type,
    name,
    status,
    enabled,
    target_scope_type,
    valid_from,
    valid_until,
    auto_close_on_expire,
    reward_title,
    reward_remark,
    reward_claim_instruction,
    reward_claim_channel,
    config_payload
  )
  SELECT
    oi.new_campaign_id,
    'share_assist',
    CONCAT(COALESCE(NULLIF(oi.project_name, ''), '项目'), ' 好友助力活动'),
    CASE
      WHEN oi.status = 'closed' THEN 'closed'
      ELSE 'active'
    END,
    true,
    'project_list',
    oi.created_at,
    oi.valid_until,
    true,
    oi.reward_title,
    oi.reward_remark,
    oi.reward_claim_instruction,
    oi.reward_claim_channel,
    jsonb_build_object(
      'target_assist_count', oi.target_assist_count,
      'allow_create_when_existing_active', false,
      'default_display_title', NULL,
      'default_display_subtitle', NULL
    )
  FROM orphan_instances oi
),
inserted_scopes AS (
  INSERT INTO public.marketing_campaign_project_scopes (
    campaign_id,
    scope_mode,
    project_id
  )
  SELECT
    oi.new_campaign_id,
    'include',
    oi.project_id
  FROM orphan_instances oi
)
UPDATE public.customer_log_share_campaigns c
SET campaign_id = oi.new_campaign_id
FROM orphan_instances oi
WHERE c.id = oi.instance_id;
