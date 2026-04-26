import { Errors } from "@/errors/error-factory";
import { SupabaseDB } from "@/utils/supabase";

export type CustomerProjectLogShareCampaignRow = {
  id: string;
  share_token: string;
  customer_id: string;
  project_id: string;
  log_id: string;
  config_id: string | null;
  status: "active" | "achieved" | "reward_claimed" | "closed";
  channel: string | null;
  target_assist_count: number;
  assist_count: number;
  assist_uv: number;
  reward_title: string | null;
  reward_remark: string | null;
  reward_claim_status: "unclaimed" | "pending" | "claimed" | "expired";
  reward_claim_code: string | null;
  reward_claim_instruction: string | null;
  reward_claim_channel: string | null;
  reward_claim_requested_at: string | null;
  reward_claimed_by_employee_id: string | null;
  reward_claim_voucher_token: string | null;
  reward_claim_voucher_expires_at: string | null;
  valid_until: string | null;
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

export type EmployeeShareCampaignListRow = {
  campaign_id: string;
  project_id: string;
  project_name: string | null;
  customer_id: string;
  customer_name: string | null;
  log_id: string;
  log_title: string | null;
  status: CustomerProjectLogShareCampaignRow["status"];
  reward_claim_status: CustomerProjectLogShareCampaignRow["reward_claim_status"];
  assist_count: number;
  target_assist_count: number;
  reward_title: string | null;
  reward_remark: string | null;
  share_token: string;
  started_at: string;
  valid_until: string | null;
  last_assisted_at: string | null;
  reward_claim_code: string | null;
  reward_claim_instruction: string | null;
  reward_claim_channel: string | null;
  reward_claimed_at: string | null;
  reward_claim_voucher_token: string | null;
  reward_claim_voucher_expires_at: string | null;
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

  async findByVoucherToken(voucherToken: string) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("customer_log_share_campaigns")
      .select("*")
      .eq("reward_claim_voucher_token", voucherToken)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询领取凭证失败", error);
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

  async countByProjectStatus(projectId: string) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("customer_log_share_campaigns")
      .select("status")
      .eq("project_id", projectId);

    if (error) {
      throw Errors.dbError("统计项目助力活动数量失败", error);
    }

    const list = (data || []) as Array<{ status: CustomerProjectLogShareCampaignRow["status"] }>;
    return {
      active_campaign_count: list.filter((item) => item.status === "active").length,
      achieved_campaign_count: list.filter((item) => item.status === "achieved").length,
      reward_claimed_count: list.filter((item) => item.status === "reward_claimed").length,
    };
  }

  async findActiveByProject(projectId: string) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("customer_log_share_campaigns")
      .select("*")
      .eq("project_id", projectId)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询项目进行中助力活动失败", error);
    }

    return (data || null) as CustomerProjectLogShareCampaignRow | null;
  }

  async listForEmployee(input: {
    projectIds?: string[] | null;
    projectId?: string;
    customerId?: string;
    status?: CustomerProjectLogShareCampaignRow["status"];
    rewardClaimStatus?: CustomerProjectLogShareCampaignRow["reward_claim_status"];
    keyword?: string;
    dateFrom?: string;
    dateTo?: string;
    page: number;
    pageSize: number;
  }) {
    let query = SupabaseDB.getAdminClient()
      .from("customer_log_share_campaigns")
      .select(`
        id,
        project_id,
        customer_id,
        log_id,
        status,
        reward_claim_status,
        assist_count,
        target_assist_count,
        reward_title,
        reward_remark,
        share_token,
        created_at,
        valid_until,
        latest_assisted_at,
        reward_claim_code,
        reward_claim_instruction,
        reward_claim_channel,
        reward_claimed_at,
        reward_claim_voucher_token,
        reward_claim_voucher_expires_at,
        project:projects!customer_log_share_campaigns_project_id_fkey(
          name
        ),
        customer:customers!customer_log_share_campaigns_customer_id_fkey(
          name
        ),
        log:project_logs!customer_log_share_campaigns_log_id_fkey(
          node_name
        )
      `, { count: "exact" })
      .order("created_at", { ascending: false });

    if (input.projectIds && input.projectIds.length === 0) {
      return { list: [] as EmployeeShareCampaignListRow[], total: 0 };
    }

    if (input.projectIds) {
      query = query.in("project_id", input.projectIds);
    }
    if (input.projectId) {
      query = query.eq("project_id", input.projectId);
    }
    if (input.customerId) {
      query = query.eq("customer_id", input.customerId);
    }
    if (input.status) {
      query = query.eq("status", input.status);
    }
    if (input.rewardClaimStatus) {
      query = query.eq("reward_claim_status", input.rewardClaimStatus);
    }
    if (input.dateFrom) {
      query = query.gte("created_at", input.dateFrom);
    }
    if (input.dateTo) {
      query = query.lte("created_at", input.dateTo);
    }
    if (input.keyword) {
      const keyword = `%${input.keyword}%`;
      query = query.or([
        `share_token.ilike.${keyword}`,
        `reward_claim_code.ilike.${keyword}`,
        `reward_title.ilike.${keyword}`,
      ].join(","));
    }

    const from = (input.page - 1) * input.pageSize;
    const to = from + input.pageSize - 1;
    const { data, error, count } = await query.range(from, to);

    if (error) {
      throw Errors.dbError("查询助力活动管理列表失败", error);
    }

    const list = ((data || []) as Array<Record<string, unknown>>).map((item) => {
      const project = Array.isArray(item.project) ? item.project[0] : item.project;
      const customer = Array.isArray(item.customer) ? item.customer[0] : item.customer;
      const log = Array.isArray(item.log) ? item.log[0] : item.log;

      return {
        campaign_id: String(item.id),
        project_id: String(item.project_id),
        project_name: project && typeof project === "object" && "name" in project
          ? (project.name as string | null)
          : null,
        customer_id: String(item.customer_id),
        customer_name: customer && typeof customer === "object" && "name" in customer
          ? (customer.name as string | null)
          : null,
        log_id: String(item.log_id),
        log_title: log && typeof log === "object" && "node_name" in log
          ? (log.node_name as string | null)
          : null,
        status: item.status as CustomerProjectLogShareCampaignRow["status"],
        reward_claim_status: item.reward_claim_status as CustomerProjectLogShareCampaignRow["reward_claim_status"],
        assist_count: Number(item.assist_count || 0),
        target_assist_count: Number(item.target_assist_count || 0),
        reward_title: typeof item.reward_title === "string" ? item.reward_title : null,
        reward_remark: typeof item.reward_remark === "string" ? item.reward_remark : null,
        share_token: String(item.share_token),
        started_at: String(item.created_at),
        valid_until: typeof item.valid_until === "string" ? item.valid_until : null,
        last_assisted_at: typeof item.latest_assisted_at === "string" ? item.latest_assisted_at : null,
        reward_claim_code: typeof item.reward_claim_code === "string" ? item.reward_claim_code : null,
        reward_claim_instruction: typeof item.reward_claim_instruction === "string"
          ? item.reward_claim_instruction
          : null,
        reward_claim_channel: typeof item.reward_claim_channel === "string"
          ? item.reward_claim_channel
          : null,
        reward_claimed_at: typeof item.reward_claimed_at === "string" ? item.reward_claimed_at : null,
        reward_claim_voucher_token: typeof item.reward_claim_voucher_token === "string"
          ? item.reward_claim_voucher_token
          : null,
        reward_claim_voucher_expires_at: typeof item.reward_claim_voucher_expires_at === "string"
          ? item.reward_claim_voucher_expires_at
          : null,
      };
    });

    return { list, total: count || 0 };
  }

  async updateStatus(input: {
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

  async getStatsSummary(input: {
    projectIds?: string[] | null;
    projectId?: string;
    dateFrom?: string;
    dateTo?: string;
  }) {
    let query = SupabaseDB.getAdminClient()
      .from("customer_log_share_campaigns")
      .select("status, assist_count");

    if (input.projectIds && input.projectIds.length === 0) {
      return {
        campaign_count: 0,
        active_count: 0,
        achieved_count: 0,
        reward_claimed_count: 0,
        total_assist_count: 0,
      };
    }
    if (input.projectIds) {
      query = query.in("project_id", input.projectIds);
    }
    if (input.projectId) {
      query = query.eq("project_id", input.projectId);
    }
    if (input.dateFrom) {
      query = query.gte("created_at", input.dateFrom);
    }
    if (input.dateTo) {
      query = query.lte("created_at", input.dateTo);
    }

    const { data, error } = await query;
    if (error) {
      throw Errors.dbError("查询助力活动统计失败", error);
    }

    const list = (data || []) as Array<{
      status: CustomerProjectLogShareCampaignRow["status"];
      assist_count: number | null;
    }>;

    return {
      campaign_count: list.length,
      active_count: list.filter((item) => item.status === "active").length,
      achieved_count: list.filter((item) => item.status === "achieved").length,
      reward_claimed_count: list.filter((item) => item.status === "reward_claimed").length,
      total_assist_count: list.reduce((sum, item) => sum + Number(item.assist_count || 0), 0),
    };
  }
}

export const customerProjectLogShareCampaignRepository =
  new CustomerProjectLogShareCampaignRepository();
