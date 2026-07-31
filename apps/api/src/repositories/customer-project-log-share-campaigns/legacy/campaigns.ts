import { Errors, SupabaseDB } from "./shared";
import type { CustomerProjectLogShareCampaignRow } from "./shared";

export async function create(this: any, input: {
  campaign_id: string | null;
  campaign_type: string;
  share_token: string;
  customer_id: string;
  project_id: string;
  log_id: string;
  config_id: string | null;
  channel: string | null;
  target_assist_count: number;
  reward_title: string | null;
  reward_remark: string | null;
  reward_claim_instruction: string | null;
  reward_claim_channel: string | null;
  valid_until: string | null;
  poster_generated_at: string | null;
}) {
  const { data, error } = await SupabaseDB.getAdminClient()
    .from("customer_log_share_campaigns")
    .insert({
      campaign_id: input.campaign_id,
      campaign_type: input.campaign_type,
      share_token: input.share_token,
      customer_id: input.customer_id,
      project_id: input.project_id,
      log_id: input.log_id,
      config_id: input.config_id,
      status: "active",
      channel: input.channel,
      target_assist_count: input.target_assist_count,
      assist_count: 0,
      assist_uv: 0,
      reward_title: input.reward_title,
      reward_remark: input.reward_remark,
      reward_claim_status: "unclaimed",
      reward_claim_instruction: input.reward_claim_instruction,
      reward_claim_channel: input.reward_claim_channel,
      valid_until: input.valid_until,
      poster_generated_at: input.poster_generated_at,
    })
    .select("*")
    .single();

  if (error || !data) {
    throw Errors.dbError("创建分享活动失败", error);
  }

  return data as CustomerProjectLogShareCampaignRow;
}

export async function updateMetrics(this: any, input: {
  id: string;
  assist_count: number;
  assist_uv: number;
  status: CustomerProjectLogShareCampaignRow["status"];
  achieved_at: string | null;
  latest_assisted_at?: string | null;
  reward_claim_status?: CustomerProjectLogShareCampaignRow["reward_claim_status"];
  reward_claim_code?: string | null;
  reward_claim_instruction?: string | null;
  reward_claim_channel?: string | null;
}) {
  const { data, error } = await SupabaseDB.getAdminClient()
    .from("customer_log_share_campaigns")
    .update({
      assist_count: input.assist_count,
      assist_uv: input.assist_uv,
      status: input.status,
      achieved_at: input.achieved_at,
      latest_assisted_at: input.latest_assisted_at,
      reward_claim_status: input.reward_claim_status,
      reward_claim_code: input.reward_claim_code,
      reward_claim_instruction: input.reward_claim_instruction,
      reward_claim_channel: input.reward_claim_channel,
    })
    .eq("id", input.id)
    .select("*")
    .single();

  if (error || !data) {
    throw Errors.dbError("更新分享活动统计失败", error);
  }

  return data as CustomerProjectLogShareCampaignRow;
}

export async function updateRewardMetadata(this: any, input: {
  id: string;
  reward_claim_status?: CustomerProjectLogShareCampaignRow["reward_claim_status"];
  reward_claim_code?: string | null;
  reward_claim_instruction?: string | null;
  reward_claim_channel?: string | null;
  reward_claim_requested_at?: string | null;
  reward_claimed_at?: string | null;
  reward_claimed_by_employee_id?: string | null;
  reward_claim_voucher_token?: string | null;
  reward_claim_voucher_expires_at?: string | null;
  status?: CustomerProjectLogShareCampaignRow["status"];
  closed_reason?: string | null;
}) {
  const { data, error } = await SupabaseDB.getAdminClient()
    .from("customer_log_share_campaigns")
    .update({
      reward_claim_status: input.reward_claim_status,
      reward_claim_code: input.reward_claim_code,
      reward_claim_instruction: input.reward_claim_instruction,
      reward_claim_channel: input.reward_claim_channel,
      reward_claim_requested_at: input.reward_claim_requested_at,
      reward_claimed_at: input.reward_claimed_at,
      reward_claimed_by_employee_id: input.reward_claimed_by_employee_id,
      reward_claim_voucher_token: input.reward_claim_voucher_token,
      reward_claim_voucher_expires_at: input.reward_claim_voucher_expires_at,
      status: input.status,
      closed_reason: input.closed_reason,
    })
    .eq("id", input.id)
    .select("*")
    .single();

  if (error || !data) {
    throw Errors.dbError("更新分享活动领奖信息失败", error);
  }

  return data as CustomerProjectLogShareCampaignRow;
}

export async function claimRewardByVoucherIfUnclaimed(this: any, input: {
  id: string;
  voucherToken: string;
  employeeId: string;
  channel: string;
  claimedAt: string;
}) {
  const { data, error } = await SupabaseDB.getAdminClient()
    .from("customer_log_share_campaigns")
    .update({
      status: "reward_claimed",
      reward_claim_status: "claimed",
      reward_claim_channel: input.channel,
      reward_claimed_at: input.claimedAt,
      reward_claimed_by_employee_id: input.employeeId,
    })
    .eq("id", input.id)
    .eq("reward_claim_voucher_token", input.voucherToken)
    .neq("reward_claim_status", "claimed")
    .neq("status", "reward_claimed")
    .select("*")
    .maybeSingle();

  if (error) {
    throw Errors.dbError("核销分享活动领取凭证失败", error);
  }

  return (data || null) as CustomerProjectLogShareCampaignRow | null;
}

export async function touchPosterSavedAt(this: any, id: string) {
  const { data, error } = await SupabaseDB.getAdminClient()
    .from("customer_log_share_campaigns")
    .update({
      poster_saved_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error || !data) {
    throw Errors.dbError("更新分享海报保存时间失败", error);
  }

  return data as CustomerProjectLogShareCampaignRow;
}

export async function touchLatestOpenedAt(this: any, id: string, latestOpenedAt: string) {
  const { data, error } = await SupabaseDB.getAdminClient()
    .from("customer_log_share_campaigns")
    .update({
      latest_opened_at: latestOpenedAt,
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error || !data) {
    throw Errors.dbError("更新最近打开时间失败", error);
  }

  return data as CustomerProjectLogShareCampaignRow;
}

export async function updateStatus(this: any, input: {
  id: string;
  status: CustomerProjectLogShareCampaignRow["status"];
  closed_reason: string | null;
}) {
  const { data, error } = await SupabaseDB.getAdminClient()
    .from("customer_log_share_campaigns")
    .update({
      status: input.status,
      closed_reason: input.closed_reason,
    })
    .eq("id", input.id)
    .select("*")
    .single();

  if (error || !data) {
    throw Errors.dbError("更新助力活动状态失败", error);
  }

  return data as CustomerProjectLogShareCampaignRow;
}
