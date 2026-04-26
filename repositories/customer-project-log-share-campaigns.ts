import { Errors } from "@/errors/error-factory";
import { SupabaseDB } from "@/utils/supabase";

export type CustomerProjectLogShareCampaignRow = {
  id: string;
  share_token: string;
  customer_id: string;
  project_id: string;
  log_id: string;
  status: "active" | "achieved" | "reward_claimed" | "closed";
  channel: string | null;
  target_assist_count: number;
  assist_count: number;
  assist_uv: number;
  reward_claim_status: "unclaimed" | "pending" | "claimed" | "expired";
  reward_claim_code: string | null;
  reward_claim_instruction: string | null;
  reward_claim_channel: string | null;
  reward_claim_requested_at: string | null;
  reward_claimed_by_employee_id: string | null;
  closed_reason: string | null;
  latest_opened_at: string | null;
  latest_assisted_at: string | null;
  poster_generated_at: string | null;
  poster_saved_at: string | null;
  achieved_at: string | null;
  reward_claimed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CustomerProjectLogShareAssistRow = {
  id: string;
  campaign_id: string;
  share_token: string;
  helper_auth_user_id: string | null;
  helper_openid: string | null;
  helper_device_id: string | null;
  helper_ip: string | null;
  source: string;
  helper_name: string | null;
  helper_avatar: string | null;
  is_valid: boolean;
  invalid_reason: string | null;
  risk_level: string;
  created_at: string;
};

class CustomerProjectLogShareCampaignRepository {
  async findActiveByOwner(input: {
    customer_id: string;
    project_id: string;
    log_id: string;
  }) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("customer_log_share_campaigns")
      .select("*")
      .eq("customer_id", input.customer_id)
      .eq("project_id", input.project_id)
      .eq("log_id", input.log_id)
      .eq("status", "active")
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询分享活动失败", error);
    }

    return (data || null) as CustomerProjectLogShareCampaignRow | null;
  }

  async findByShareToken(shareToken: string) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("customer_log_share_campaigns")
      .select("*")
      .eq("share_token", shareToken)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询分享活动失败", error);
    }

    return (data || null) as CustomerProjectLogShareCampaignRow | null;
  }

  async findById(id: string) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("customer_log_share_campaigns")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询分享活动失败", error);
    }

    return (data || null) as CustomerProjectLogShareCampaignRow | null;
  }

  async listByProject(input: {
    customer_id: string;
    project_id: string;
    limit?: number;
  }) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("customer_log_share_campaigns")
      .select("*")
      .eq("customer_id", input.customer_id)
      .eq("project_id", input.project_id)
      .order("created_at", { ascending: false })
      .limit(input.limit ?? 20);

    if (error) {
      throw Errors.dbError("查询项目分享活动失败", error);
    }

    return (data || []) as CustomerProjectLogShareCampaignRow[];
  }

  async create(input: {
    share_token: string;
    customer_id: string;
    project_id: string;
    log_id: string;
    channel: string | null;
    target_assist_count: number;
    poster_generated_at: string | null;
  }) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("customer_log_share_campaigns")
      .insert({
        share_token: input.share_token,
        customer_id: input.customer_id,
        project_id: input.project_id,
        log_id: input.log_id,
        status: "active",
        channel: input.channel,
        target_assist_count: input.target_assist_count,
        assist_count: 0,
        assist_uv: 0,
        reward_claim_status: "unclaimed",
        poster_generated_at: input.poster_generated_at,
      })
      .select("*")
      .single();

    if (error || !data) {
      throw Errors.dbError("创建分享活动失败", error);
    }

    return data as CustomerProjectLogShareCampaignRow;
  }

  async updateMetrics(input: {
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

  async updateRewardMetadata(input: {
    id: string;
    reward_claim_status?: CustomerProjectLogShareCampaignRow["reward_claim_status"];
    reward_claim_code?: string | null;
    reward_claim_instruction?: string | null;
    reward_claim_channel?: string | null;
    reward_claim_requested_at?: string | null;
    reward_claimed_at?: string | null;
    reward_claimed_by_employee_id?: string | null;
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

  async touchPosterSavedAt(id: string) {
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

  async touchLatestOpenedAt(id: string, latestOpenedAt: string) {
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

  async createOpen(input: {
    campaign_id: string;
    share_token: string;
    visitor_auth_user_id: string | null;
    visitor_openid: string | null;
    visitor_device_id: string | null;
    visitor_ip: string | null;
    source: string;
  }) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("customer_log_share_opens")
      .insert({
        campaign_id: input.campaign_id,
        share_token: input.share_token,
        visitor_auth_user_id: input.visitor_auth_user_id,
        visitor_openid: input.visitor_openid,
        visitor_device_id: input.visitor_device_id,
        visitor_ip: input.visitor_ip,
        source: input.source,
      })
      .select("id")
      .single();

    if (error || !data) {
      throw Errors.dbError("记录分享打开失败", error);
    }

    return data;
  }

  async findAssist(input: {
    campaign_id: string;
    helper_auth_user_id: string | null;
    helper_openid: string | null;
  }) {
    let query = SupabaseDB.getAdminClient()
      .from("customer_log_share_assists")
      .select("*")
      .eq("campaign_id", input.campaign_id)
      .eq("is_valid", true)
      .limit(1);

    if (input.helper_auth_user_id) {
      query = query.eq("helper_auth_user_id", input.helper_auth_user_id);
    } else if (input.helper_openid) {
      query = query.is("helper_auth_user_id", null).eq("helper_openid", input.helper_openid);
    } else {
      return null;
    }

    const { data, error } = await query.maybeSingle();
    if (error) {
      throw Errors.dbError("查询助力记录失败", error);
    }

    return (data || null) as CustomerProjectLogShareAssistRow | null;
  }

  async createAssist(input: {
    campaign_id: string;
    share_token: string;
    helper_auth_user_id: string | null;
    helper_openid: string | null;
    helper_device_id: string | null;
    helper_ip: string | null;
    source: string;
    helper_name: string | null;
    helper_avatar: string | null;
    is_valid?: boolean;
    invalid_reason?: string | null;
    risk_level?: string;
  }) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("customer_log_share_assists")
      .insert({
        campaign_id: input.campaign_id,
        share_token: input.share_token,
        helper_auth_user_id: input.helper_auth_user_id,
        helper_openid: input.helper_openid,
        helper_device_id: input.helper_device_id,
        helper_ip: input.helper_ip,
        source: input.source,
        helper_name: input.helper_name,
        helper_avatar: input.helper_avatar,
        is_valid: input.is_valid ?? true,
        invalid_reason: input.invalid_reason ?? null,
        risk_level: input.risk_level ?? "normal",
      })
      .select("*")
      .single();

    if (error || !data) {
      throw Errors.dbError("创建助力记录失败", error);
    }

    return data as CustomerProjectLogShareAssistRow;
  }

  async countAssists(campaignId: string) {
    const { count, error } = await SupabaseDB.getAdminClient()
      .from("customer_log_share_assists")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", campaignId)
      .eq("is_valid", true);

    if (error) {
      throw Errors.dbError("统计助力人数失败", error);
    }

    return count || 0;
  }

  async listValidAssists(input: {
    campaign_id: string;
    limit?: number;
    from?: number;
    to?: number;
  }) {
    let query = SupabaseDB.getAdminClient()
      .from("customer_log_share_assists")
      .select("*", { count: "exact" })
      .eq("campaign_id", input.campaign_id)
      .eq("is_valid", true)
      .order("created_at", { ascending: false });

    if (typeof input.from === "number" && typeof input.to === "number") {
      query = query.range(input.from, input.to);
    } else {
      query = query.limit(input.limit ?? 20);
    }

    const { data, error, count } = await query;
    if (error) {
      throw Errors.dbError("查询助力好友失败", error);
    }

    return {
      list: (data || []) as CustomerProjectLogShareAssistRow[],
      count: count || 0,
    };
  }
}

export const customerProjectLogShareCampaignRepository =
  new CustomerProjectLogShareCampaignRepository();
