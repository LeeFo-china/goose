import { Errors } from "@/errors/error-factory";
import { SupabaseDB } from "@/utils/supabase";

export type MarketingCampaignStatus = "draft" | "active" | "paused" | "closed";
export type MarketingCampaignTargetScopeType = "all_projects" | "project_list";
export type MarketingCampaignProjectScopeMode = "include" | "exclude";
export type MarketingCampaignType = "share_assist" | "appointment_reward";

export type MarketingCampaignRow = {
  id: string;
  tenant_id: string | null;
  campaign_type: MarketingCampaignType;
  name: string;
  status: MarketingCampaignStatus;
  enabled: boolean;
  target_scope_type: MarketingCampaignTargetScopeType;
  valid_from: string | null;
  valid_until: string | null;
  auto_close_on_expire: boolean;
  reward_title: string | null;
  reward_remark: string | null;
  reward_claim_instruction: string | null;
  reward_claim_channel: string | null;
  template_id: string | null;
  template_snapshot: Record<string, unknown> | null;
  config_payload: Record<string, unknown> | null;
  created_by_employee_id: string | null;
  updated_by_employee_id: string | null;
  created_at: string;
  updated_at: string;
};

export type MarketingCampaignProjectScopeRow = {
  id: string;
  tenant_id: string | null;
  campaign_id: string;
  scope_mode: MarketingCampaignProjectScopeMode;
  project_id: string;
  created_at: string;
};

class MarketingCampaignRepository {
  async list(input: {
    tenantId?: string | null;
    campaignType?: MarketingCampaignType;
    status?: MarketingCampaignStatus;
    keyword?: string;
    page: number;
    pageSize: number;
  }) {
    let query = SupabaseDB.getAdminClient()
      .from("marketing_campaigns")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false });

    if (input.tenantId) {
      query = query.eq("tenant_id", input.tenantId);
    }
    if (input.campaignType) {
      query = query.eq("campaign_type", input.campaignType);
    }
    if (input.status) {
      query = query.eq("status", input.status);
    }
    if (input.keyword) {
      query = query.ilike("name", `%${input.keyword}%`);
    }

    const from = (input.page - 1) * input.pageSize;
    const to = from + input.pageSize - 1;
    const { data, error, count } = await query.range(from, to);
    if (error) {
      throw Errors.dbError("查询营销活动列表失败", error);
    }

    return {
      list: (data || []) as MarketingCampaignRow[],
      total: count || 0,
    };
  }

  async findById(id: string, tenantId?: string | null) {
    let query = SupabaseDB.getAdminClient()
      .from("marketing_campaigns")
      .select("*")
      .eq("id", id);

    if (tenantId) {
      query = query.eq("tenant_id", tenantId);
    }

    const { data, error } = await query.maybeSingle();

    if (error) {
      throw Errors.dbError("查询营销活动失败", error);
    }

    return (data || null) as MarketingCampaignRow | null;
  }

  async listActiveByType(campaignType: MarketingCampaignType, tenantId?: string | null) {
    let query = SupabaseDB.getAdminClient()
      .from("marketing_campaigns")
      .select("*")
      .eq("campaign_type", campaignType)
      .eq("enabled", true)
      .eq("status", "active");

    if (tenantId) {
      query = query.eq("tenant_id", tenantId);
    }

    const { data, error } = await query.order("updated_at", { ascending: false });

    if (error) {
      throw Errors.dbError("查询生效营销活动失败", error);
    }

    return (data || []) as MarketingCampaignRow[];
  }

  async create(input: {
    tenant_id: string | null;
    campaign_type: MarketingCampaignType;
    name: string;
    enabled: boolean;
    status: MarketingCampaignStatus;
    target_scope_type: MarketingCampaignTargetScopeType;
    valid_from: string | null;
    valid_until: string | null;
    auto_close_on_expire: boolean;
    reward_title: string | null;
    reward_remark: string | null;
    reward_claim_instruction: string | null;
    reward_claim_channel: string | null;
    template_id: string | null;
    template_snapshot: Record<string, unknown> | null;
    config_payload: Record<string, unknown>;
    created_by_employee_id: string | null;
    updated_by_employee_id: string | null;
  }) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("marketing_campaigns")
      .insert(input)
      .select("*")
      .single();
    if (error || !data) {
      throw Errors.dbError("创建营销活动失败", error);
    }
    return data as MarketingCampaignRow;
  }

  async update(input: {
    id: string;
    tenant_id?: string | null;
    campaign_type: MarketingCampaignType;
    name: string;
    enabled: boolean;
    status: MarketingCampaignStatus;
    target_scope_type: MarketingCampaignTargetScopeType;
    valid_from: string | null;
    valid_until: string | null;
    auto_close_on_expire: boolean;
    reward_title: string | null;
    reward_remark: string | null;
    reward_claim_instruction: string | null;
    reward_claim_channel: string | null;
    template_id: string | null;
    template_snapshot: Record<string, unknown> | null;
    config_payload: Record<string, unknown>;
    updated_by_employee_id: string | null;
  }) {
    let query = SupabaseDB.getAdminClient()
      .from("marketing_campaigns")
      .update({
        campaign_type: input.campaign_type,
        name: input.name,
        enabled: input.enabled,
        status: input.status,
        target_scope_type: input.target_scope_type,
        valid_from: input.valid_from,
        valid_until: input.valid_until,
        auto_close_on_expire: input.auto_close_on_expire,
        reward_title: input.reward_title,
        reward_remark: input.reward_remark,
        reward_claim_instruction: input.reward_claim_instruction,
        reward_claim_channel: input.reward_claim_channel,
        template_id: input.template_id,
        template_snapshot: input.template_snapshot,
        config_payload: input.config_payload,
        updated_by_employee_id: input.updated_by_employee_id,
      })
      .eq("id", input.id);
    if (input.tenant_id) {
      query = query.eq("tenant_id", input.tenant_id);
    }
    const { data, error } = await query
      .select("*")
      .single();
    if (error || !data) {
      throw Errors.dbError("更新营销活动失败", error);
    }
    return data as MarketingCampaignRow;
  }

  async updateStatus(
    id: string,
    status: MarketingCampaignStatus,
    updatedByEmployeeId: string | null,
    tenantId?: string | null,
  ) {
    let query = SupabaseDB.getAdminClient()
      .from("marketing_campaigns")
      .update({
        status,
        updated_by_employee_id: updatedByEmployeeId,
      })
      .eq("id", id);
    if (tenantId) {
      query = query.eq("tenant_id", tenantId);
    }
    const { data, error } = await query
      .select("*")
      .single();
    if (error || !data) {
      throw Errors.dbError("更新营销活动状态失败", error);
    }
    return data as MarketingCampaignRow;
  }

  async replaceScopes(
    campaignId: string,
    tenantId: string | null,
    scopes: Array<{ scope_mode: MarketingCampaignProjectScopeMode; project_id: string }>,
  ) {
    const admin = SupabaseDB.getAdminClient();
    let deleteRequest = admin
      .from("marketing_campaign_project_scopes")
      .delete()
      .eq("campaign_id", campaignId);
    if (tenantId) {
      deleteRequest = deleteRequest.eq("tenant_id", tenantId);
    }

    const { error: deleteError } = await deleteRequest;
    if (deleteError) {
      throw Errors.dbError("清空营销活动范围失败", deleteError);
    }

    if (!scopes.length) {
      return [] as MarketingCampaignProjectScopeRow[];
    }

    const { data, error } = await admin
      .from("marketing_campaign_project_scopes")
      .insert(
        scopes.map((item) => ({
          tenant_id: tenantId,
          campaign_id: campaignId,
          scope_mode: item.scope_mode,
          project_id: item.project_id,
        })),
      )
      .select("*");

    if (error) {
      throw Errors.dbError("保存营销活动范围失败", error);
    }

    return (data || []) as MarketingCampaignProjectScopeRow[];
  }

  async listScopesByCampaignIds(campaignIds: string[], tenantId?: string | null) {
    if (!campaignIds.length) {
      return [] as MarketingCampaignProjectScopeRow[];
    }

    let query = SupabaseDB.getAdminClient()
      .from("marketing_campaign_project_scopes")
      .select("*")
      .in("campaign_id", campaignIds);
    if (tenantId) {
      query = query.eq("tenant_id", tenantId);
    }
    const { data, error } = await query;
    if (error) {
      throw Errors.dbError("查询营销活动范围失败", error);
    }
    return (data || []) as MarketingCampaignProjectScopeRow[];
  }

  async listScopesByCampaignId(campaignId: string, tenantId?: string | null) {
    let query = SupabaseDB.getAdminClient()
      .from("marketing_campaign_project_scopes")
      .select("*")
      .eq("campaign_id", campaignId);
    if (tenantId) {
      query = query.eq("tenant_id", tenantId);
    }
    const { data, error } = await query;
    if (error) {
      throw Errors.dbError("查询营销活动范围失败", error);
    }
    return (data || []) as MarketingCampaignProjectScopeRow[];
  }
}

export const marketingCampaignRepository = new MarketingCampaignRepository();
