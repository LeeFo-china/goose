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
  }) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("customer_log_share_campaigns")
      .update({
        assist_count: input.assist_count,
        assist_uv: input.assist_uv,
        status: input.status,
        achieved_at: input.achieved_at,
      })
      .eq("id", input.id)
      .select("*")
      .single();

    if (error || !data) {
      throw Errors.dbError("更新分享活动统计失败", error);
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
      .eq("campaign_id", campaignId);

    if (error) {
      throw Errors.dbError("统计助力人数失败", error);
    }

    return count || 0;
  }
}

export const customerProjectLogShareCampaignRepository =
  new CustomerProjectLogShareCampaignRepository();
