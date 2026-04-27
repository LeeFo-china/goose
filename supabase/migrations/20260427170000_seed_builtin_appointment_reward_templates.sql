INSERT INTO public.marketing_campaign_templates (
  campaign_type,
  name,
  description,
  status,
  enabled,
  is_builtin,
  default_target_scope_type,
  reward_title,
  reward_remark,
  reward_claim_instruction,
  reward_claim_channel,
  config_payload
)
SELECT
  payload.campaign_type,
  payload.name,
  payload.description,
  payload.status,
  payload.enabled,
  payload.is_builtin,
  payload.default_target_scope_type,
  payload.reward_title,
  payload.reward_remark,
  payload.reward_claim_instruction,
  payload.reward_claim_channel,
  payload.config_payload
FROM (
  VALUES
    (
      'appointment_reward'::text,
      '预约到店标准模板'::text,
      '适合常规预约活动，提交预约信息即可参与领取礼品'::text,
      'active'::text,
      true,
      true,
      'all_projects'::text,
      '预约到店即可领取礼品'::text,
      '适合日常促签到店活动'::text,
      '提交预约信息并到店后可领取礼品'::text,
      'store'::text,
      '{
        "achievement_mode": "appointment_submit",
        "allow_one_active_per_customer": true,
        "default_display_title": "预约到店可领取专属礼品",
        "default_display_subtitle": "提交预约信息并到店即可参与活动"
      }'::jsonb
    ),
    (
      'appointment_reward'::text,
      '快速预约礼模板'::text,
      '适合短周期活动，提交预约即可快速解锁到店礼'::text,
      'active'::text,
      true,
      true,
      'all_projects'::text,
      '快速预约解锁到店礼'::text,
      '适合短期预约转化场景'::text,
      '提交预约信息后即可参与活动'::text,
      'store'::text,
      '{
        "achievement_mode": "appointment_submit",
        "allow_one_active_per_customer": true,
        "default_display_title": "立即预约，快速领取到店礼",
        "default_display_subtitle": "现在预约，轻松参与本次活动"
      }'::jsonb
    ),
    (
      'appointment_reward'::text,
      '节日预约到店礼模板'::text,
      '适合节日促签到店，需员工确认到店后达成'::text,
      'active'::text,
      true,
      true,
      'all_projects'::text,
      '节日预约到店礼'::text,
      '节假日期间到店可领取专属礼品'::text,
      '提交预约并到店核销后可领取节日礼品'::text,
      'store'::text,
      '{
        "achievement_mode": "store_checkin",
        "allow_one_active_per_customer": true,
        "default_display_title": "节日预约到店可领取专属礼品",
        "default_display_subtitle": "完成预约并到店后即可参与节日活动"
      }'::jsonb
    )
) AS payload(
  campaign_type,
  name,
  description,
  status,
  enabled,
  is_builtin,
  default_target_scope_type,
  reward_title,
  reward_remark,
  reward_claim_instruction,
  reward_claim_channel,
  config_payload
)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.marketing_campaign_templates t
  WHERE t.campaign_type = payload.campaign_type
    AND t.name = payload.name
    AND t.is_builtin = true
);
