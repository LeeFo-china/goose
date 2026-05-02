import { Errors } from "@/errors/error-factory";
import { SupabaseDB } from "@/utils/supabase";
import type {
  MarketingCampaignTargetScopeType,
  MarketingCampaignType,
} from "@/repositories/marketing-campaigns";

export type MarketingCampaignTemplateStatus = "draft" | "active" | "disabled";

export type MarketingCampaignTemplateRow = {
  id: string;
  campaign_type: MarketingCampaignType;
  name: string;
  description: string | null;
  status: MarketingCampaignTemplateStatus;
  enabled: boolean;
  is_builtin: boolean;
  default_target_scope_type: MarketingCampaignTargetScopeType;
  reward_title: string | null;
  reward_remark: string | null;
  reward_claim_instruction: string | null;
  reward_claim_channel: string | null;
  config_payload: Record<string, unknown> | null;
  created_by_employee_id: string | null;
  updated_by_employee_id: string | null;
  created_at: string;
  updated_at: string;
};

class MarketingCampaignTemplateRepository {
  async list(input: {
    campaignType?: MarketingCampaignType;
    status?: MarketingCampaignTemplateStatus;
    keyword?: string;
    page: number;
    pageSize: number;
  }) {
    let query = SupabaseDB.getAdminClient()
      .from("marketing_campaign_templates")
      .select("*", { count: "exact" })
      .order("updated_at", { ascending: false });

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
      throw Errors.dbError("查询营销模板列表失败", error);
    }

    return {
      list: (data || []) as MarketingCampaignTemplateRow[],
      total: count || 0,
    };
  }

  async findById(id: string) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("marketing_campaign_templates")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询营销模板失败", error);
    }

    return (data || null) as MarketingCampaignTemplateRow | null;
  }

  async create(input: {
    campaign_type: MarketingCampaignType;
    name: string;
    description: string | null;
    status: MarketingCampaignTemplateStatus;
    enabled: boolean;
    is_builtin: boolean;
    default_target_scope_type: MarketingCampaignTargetScopeType;
    reward_title: string | null;
    reward_remark: string | null;
    reward_claim_instruction: string | null;
    reward_claim_channel: string | null;
    config_payload: Record<string, unknown>;
    created_by_employee_id: string | null;
    updated_by_employee_id: string | null;
  }) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("marketing_campaign_templates")
      .insert(input)
      .select("*")
      .single();

    if (error || !data) {
      throw Errors.dbError("创建营销模板失败", error);
    }

    return data as MarketingCampaignTemplateRow;
  }

  async update(input: {
    id: string;
    campaign_type: MarketingCampaignType;
    name: string;
    description: string | null;
    status: MarketingCampaignTemplateStatus;
    enabled: boolean;
    is_builtin: boolean;
    default_target_scope_type: MarketingCampaignTargetScopeType;
    reward_title: string | null;
    reward_remark: string | null;
    reward_claim_instruction: string | null;
    reward_claim_channel: string | null;
    config_payload: Record<string, unknown>;
    updated_by_employee_id: string | null;
  }) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("marketing_campaign_templates")
      .update({
        campaign_type: input.campaign_type,
        name: input.name,
        description: input.description,
        status: input.status,
        enabled: input.enabled,
        is_builtin: input.is_builtin,
        default_target_scope_type: input.default_target_scope_type,
        reward_title: input.reward_title,
        reward_remark: input.reward_remark,
        reward_claim_instruction: input.reward_claim_instruction,
        reward_claim_channel: input.reward_claim_channel,
        config_payload: input.config_payload,
        updated_by_employee_id: input.updated_by_employee_id,
      })
      .eq("id", input.id)
      .select("*")
      .single();

    if (error || !data) {
      throw Errors.dbError("更新营销模板失败", error);
    }

    return data as MarketingCampaignTemplateRow;
  }

  async updateStatus(id: string, status: MarketingCampaignTemplateStatus, updatedByEmployeeId: string | null) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("marketing_campaign_templates")
      .update({
        status,
        enabled: status === "disabled" ? false : true,
        updated_by_employee_id: updatedByEmployeeId,
      })
      .eq("id", id)
      .select("*")
      .single();

    if (error || !data) {
      throw Errors.dbError("更新营销模板状态失败", error);
    }

    return data as MarketingCampaignTemplateRow;
  }
}

export const marketingCampaignTemplateRepository = new MarketingCampaignTemplateRepository();
