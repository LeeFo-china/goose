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
      'share_assist'::text,
      '好友助力标准模板'::text,
      '适合常规裂变，默认 10 人助力解锁到店礼'::text,
      'active'::text,
      true,
      true,
      'all_projects'::text,
      '10人助力解锁专属到店礼'::text,
      '凭分享图到店可领取'::text,
      '邀请满10位好友助力后，到店出示领奖码领取礼品'::text,
      'store'::text,
      '{
        "target_assist_count": 10,
        "allow_create_when_existing_active": false,
        "default_display_title": "邀请好友帮我助力",
        "default_display_subtitle": "助力达标即可领取礼品"
      }'::jsonb
    ),
    (
      'share_assist'::text,
      '快速助力模板'::text,
      '适合短周期活动，默认 5 人助力快速达标'::text,
      'active'::text,
      true,
      true,
      'all_projects'::text,
      '5人助力解锁快速到店礼'::text,
      '适合短期拉新，达标后可快速领取'::text,
      '邀请满5位好友助力后，到店出示领奖码领取礼品'::text,
      'store'::text,
      '{
        "target_assist_count": 5,
        "allow_create_when_existing_active": false,
        "default_display_title": "帮我点一下，快速解锁到店礼",
        "default_display_subtitle": "只差几位好友助力，马上就能达标"
      }'::jsonb
    ),
    (
      'share_assist'::text,
      '节日到店礼模板'::text,
      '适合节假日促签到店，默认 8 人助力领取节日礼'::text,
      'active'::text,
      true,
      true,
      'all_projects'::text,
      '节日助力解锁到店礼'::text,
      '节假日期间到店可领取专属礼品'::text,
      '邀请满8位好友助力后，到店出示领奖码领取节日礼品'::text,
      'store'::text,
      '{
        "target_assist_count": 8,
        "allow_create_when_existing_active": false,
        "default_display_title": "节日福利，帮我助力解锁到店礼",
        "default_display_subtitle": "好友助力达标后，到店领取节日专属礼品"
      }'::jsonb
    ),
    (
      'share_assist'::text,
      '高门槛高价值模板'::text,
      '适合重点项目和高价值礼品，默认 20 人助力达标'::text,
      'active'::text,
      true,
      true,
      'all_projects'::text,
      '20人助力解锁高价值到店礼'::text,
      '高门槛高价值礼品，适合重点活动和强裂变场景'::text,
      '邀请满20位好友助力后，到店出示领奖码领取高价值礼品'::text,
      'store'::text,
      '{
        "target_assist_count": 20,
        "allow_create_when_existing_active": false,
        "default_display_title": "帮我冲一下，解锁高价值到店礼",
        "default_display_subtitle": "助力人数越高，活动价值越强"
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
