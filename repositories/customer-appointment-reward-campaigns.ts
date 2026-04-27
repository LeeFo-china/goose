import { Errors } from "@/errors/error-factory";
import { SupabaseDB } from "@/utils/supabase";

export type CustomerAppointmentRewardCampaignRow = {
  id: string;
  campaign_id: string;
  campaign_type: "appointment_reward";
  customer_id: string;
  project_id: string;
  appointment_name: string | null;
  appointment_phone: string | null;
  appointment_time: string | null;
  status: "active" | "achieved" | "reward_claimed" | "closed";
  reward_claim_status: "unclaimed" | "pending" | "claimed" | "expired";
  reward_claim_code: string | null;
  reward_claim_voucher_token: string | null;
  achieved_at: string | null;
  reward_claimed_at: string | null;
  reward_claimed_by_employee_id: string | null;
  reward_claim_channel: string | null;
  closed_at: string | null;
  closed_reason: string | null;
  created_at: string;
  updated_at: string;
};

export type EmployeeAppointmentRewardInstanceListRow = {
  instance_id: string;
  campaign_id: string;
  campaign_type: "appointment_reward";
  customer_id: string;
  customer_name: string | null;
  project_id: string;
  project_name: string | null;
  appointment_name: string | null;
  appointment_phone: string | null;
  appointment_time: string | null;
  status: CustomerAppointmentRewardCampaignRow["status"];
  reward_claim_status: CustomerAppointmentRewardCampaignRow["reward_claim_status"];
  reward_claim_code: string | null;
  reward_claim_voucher_token: string | null;
  achieved_at: string | null;
  reward_claimed_at: string | null;
  created_at: string;
  updated_at: string;
};

class CustomerAppointmentRewardCampaignRepository {
  async findById(id: string) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("customer_appointment_reward_campaigns")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询预约奖励实例失败", error);
    }

    return (data || null) as CustomerAppointmentRewardCampaignRow | null;
  }

  async findByVoucherToken(voucherToken: string) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("customer_appointment_reward_campaigns")
      .select("*")
      .eq("reward_claim_voucher_token", voucherToken)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询预约奖励领取凭证失败", error);
    }

    return (data || null) as CustomerAppointmentRewardCampaignRow | null;
  }

  async findByCampaignCustomerProject(input: {
    campaign_id: string;
    customer_id: string;
    project_id: string;
  }) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("customer_appointment_reward_campaigns")
      .select("*")
      .eq("campaign_id", input.campaign_id)
      .eq("customer_id", input.customer_id)
      .eq("project_id", input.project_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询预约奖励实例失败", error);
    }

    return (data || null) as CustomerAppointmentRewardCampaignRow | null;
  }

  async create(input: {
    campaign_id: string;
    customer_id: string;
    project_id: string;
  }) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("customer_appointment_reward_campaigns")
      .insert({
        campaign_id: input.campaign_id,
        campaign_type: "appointment_reward",
        customer_id: input.customer_id,
        project_id: input.project_id,
        status: "active",
        reward_claim_status: "unclaimed",
      })
      .select("*")
      .single();

    if (error || !data) {
      throw Errors.dbError("创建预约奖励实例失败", error);
    }

    return data as CustomerAppointmentRewardCampaignRow;
  }

  async update(input: {
    id: string;
    appointment_name?: string | null;
    appointment_phone?: string | null;
    appointment_time?: string | null;
    status?: CustomerAppointmentRewardCampaignRow["status"];
    reward_claim_status?: CustomerAppointmentRewardCampaignRow["reward_claim_status"];
    reward_claim_code?: string | null;
    reward_claim_voucher_token?: string | null;
    achieved_at?: string | null;
    reward_claimed_at?: string | null;
    reward_claimed_by_employee_id?: string | null;
    reward_claim_channel?: string | null;
    closed_at?: string | null;
    closed_reason?: string | null;
  }) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("customer_appointment_reward_campaigns")
      .update({
        appointment_name: input.appointment_name,
        appointment_phone: input.appointment_phone,
        appointment_time: input.appointment_time,
        status: input.status,
        reward_claim_status: input.reward_claim_status,
        reward_claim_code: input.reward_claim_code,
        reward_claim_voucher_token: input.reward_claim_voucher_token,
        achieved_at: input.achieved_at,
        reward_claimed_at: input.reward_claimed_at,
        reward_claimed_by_employee_id: input.reward_claimed_by_employee_id,
        reward_claim_channel: input.reward_claim_channel,
        closed_at: input.closed_at,
        closed_reason: input.closed_reason,
      })
      .eq("id", input.id)
      .select("*")
      .single();

    if (error || !data) {
      throw Errors.dbError("更新预约奖励实例失败", error);
    }

    return data as CustomerAppointmentRewardCampaignRow;
  }

  async countByMarketingCampaignStatus(campaignId: string) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("customer_appointment_reward_campaigns")
      .select("status")
      .eq("campaign_id", campaignId);

    if (error) {
      throw Errors.dbError("统计预约奖励实例失败", error);
    }

    const summary = {
      instance_count: 0,
      active_instance_count: 0,
      achieved_instance_count: 0,
      reward_claimed_count: 0,
      closed_instance_count: 0,
    };

    for (const item of (data || []) as Array<{ status: CustomerAppointmentRewardCampaignRow["status"] }>) {
      summary.instance_count += 1;
      if (item.status === "active") summary.active_instance_count += 1;
      if (item.status === "achieved") summary.achieved_instance_count += 1;
      if (item.status === "reward_claimed") summary.reward_claimed_count += 1;
      if (item.status === "closed") summary.closed_instance_count += 1;
    }

    return summary;
  }

  async listForEmployee(input: {
    campaignId: string;
    projectIds: string[] | null;
    status?: CustomerAppointmentRewardCampaignRow["status"];
    rewardClaimStatus?: CustomerAppointmentRewardCampaignRow["reward_claim_status"];
    keyword?: string;
    dateFrom?: string;
    dateTo?: string;
    page: number;
    pageSize: number;
  }) {
    let query = SupabaseDB.getAdminClient()
      .from("customer_appointment_reward_campaigns")
      .select(`
        id,
        campaign_id,
        campaign_type,
        customer_id,
        project_id,
        appointment_name,
        appointment_phone,
        appointment_time,
        status,
        reward_claim_status,
        reward_claim_code,
        reward_claim_voucher_token,
        achieved_at,
        reward_claimed_at,
        created_at,
        updated_at,
        customer:customers(name),
        project:projects(name)
      `, { count: "exact" })
      .eq("campaign_id", input.campaignId)
      .order("created_at", { ascending: false });

    if (input.projectIds !== null) {
      if (!input.projectIds.length) {
        return { list: [] as EmployeeAppointmentRewardInstanceListRow[], total: 0 };
      }
      query = query.in("project_id", input.projectIds);
    }
    if (input.status) query = query.eq("status", input.status);
    if (input.rewardClaimStatus) query = query.eq("reward_claim_status", input.rewardClaimStatus);
    if (input.dateFrom) query = query.gte("created_at", input.dateFrom);
    if (input.dateTo) query = query.lte("created_at", input.dateTo);
    if (input.keyword) {
      query = query.or([
        `appointment_name.ilike.%${input.keyword}%`,
        `appointment_phone.ilike.%${input.keyword}%`,
        `reward_claim_code.ilike.%${input.keyword}%`,
      ].join(","));
    }

    const from = (input.page - 1) * input.pageSize;
    const to = from + input.pageSize - 1;
    const { data, error, count } = await query.range(from, to);

    if (error) {
      throw Errors.dbError("查询预约奖励实例列表失败", error);
    }

    const list = ((data || []) as Array<Record<string, unknown>>).map((item) => {
      const customer = Array.isArray(item.customer) ? item.customer[0] : item.customer;
      const project = Array.isArray(item.project) ? item.project[0] : item.project;
      return {
        instance_id: String(item.id),
        campaign_id: String(item.campaign_id),
        campaign_type: "appointment_reward" as const,
        customer_id: String(item.customer_id),
        customer_name: customer && typeof customer === "object" && typeof customer.name === "string" ? customer.name : null,
        project_id: String(item.project_id),
        project_name: project && typeof project === "object" && typeof project.name === "string" ? project.name : null,
        appointment_name: typeof item.appointment_name === "string" ? item.appointment_name : null,
        appointment_phone: typeof item.appointment_phone === "string" ? item.appointment_phone : null,
        appointment_time: typeof item.appointment_time === "string" ? item.appointment_time : null,
        status: item.status as CustomerAppointmentRewardCampaignRow["status"],
        reward_claim_status: item.reward_claim_status as CustomerAppointmentRewardCampaignRow["reward_claim_status"],
        reward_claim_code: typeof item.reward_claim_code === "string" ? item.reward_claim_code : null,
        reward_claim_voucher_token: typeof item.reward_claim_voucher_token === "string"
          ? item.reward_claim_voucher_token
          : null,
        achieved_at: typeof item.achieved_at === "string" ? item.achieved_at : null,
        reward_claimed_at: typeof item.reward_claimed_at === "string" ? item.reward_claimed_at : null,
        created_at: String(item.created_at),
        updated_at: String(item.updated_at),
      };
    });

    return {
      list,
      total: count || 0,
    };
  }
}

export const customerAppointmentRewardCampaignRepository = new CustomerAppointmentRewardCampaignRepository();
