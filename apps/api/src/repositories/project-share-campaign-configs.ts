import { Errors } from "@/errors/error-factory";
import { SupabaseDB } from "@/utils/supabase";

export type ProjectShareCampaignConfigRow = {
  id: string;
  project_id: string;
  config_status: "draft" | "active" | "paused" | "closed";
  enabled: boolean;
  template_id: string | null;
  config_mode: "inherit" | "custom";
  target_assist_count: number;
  reward_title: string | null;
  reward_remark: string | null;
  reward_claim_instruction: string | null;
  reward_claim_channel: string | null;
  valid_from: string | null;
  valid_until: string | null;
  auto_close_on_expire: boolean;
  allow_create_when_existing_active: boolean;
  default_display_title: string | null;
  default_display_subtitle: string | null;
  created_by_employee_id: string | null;
  updated_by_employee_id: string | null;
  created_at: string;
  updated_at: string;
};

class ProjectShareCampaignConfigRepository {
  async findByProjectId(projectId: string) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("project_share_campaign_configs")
      .select("*")
      .eq("project_id", projectId)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询项目助力活动配置失败", error);
    }

    return (data || null) as ProjectShareCampaignConfigRow | null;
  }

  async upsertByProjectId(input: {
    project_id: string;
    config_status: ProjectShareCampaignConfigRow["config_status"];
    enabled: boolean;
    template_id: string | null;
    config_mode: ProjectShareCampaignConfigRow["config_mode"];
    target_assist_count: number;
    reward_title: string | null;
    reward_remark: string | null;
    reward_claim_instruction: string | null;
    reward_claim_channel: string | null;
    valid_from: string | null;
    valid_until: string | null;
    auto_close_on_expire: boolean;
    allow_create_when_existing_active: boolean;
    default_display_title: string | null;
    default_display_subtitle: string | null;
    employee_id: string | null;
  }) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("project_share_campaign_configs")
      .upsert({
        project_id: input.project_id,
        config_status: input.config_status,
        enabled: input.enabled,
        template_id: input.template_id,
        config_mode: input.config_mode,
        target_assist_count: input.target_assist_count,
        reward_title: input.reward_title,
        reward_remark: input.reward_remark,
        reward_claim_instruction: input.reward_claim_instruction,
        reward_claim_channel: input.reward_claim_channel,
        valid_from: input.valid_from,
        valid_until: input.valid_until,
        auto_close_on_expire: input.auto_close_on_expire,
        allow_create_when_existing_active: input.allow_create_when_existing_active,
        default_display_title: input.default_display_title,
        default_display_subtitle: input.default_display_subtitle,
        created_by_employee_id: input.employee_id,
        updated_by_employee_id: input.employee_id,
      }, {
        onConflict: "project_id",
      })
      .select("*")
      .single();

    if (error || !data) {
      throw Errors.dbError("保存项目助力活动配置失败", error);
    }

    return data as ProjectShareCampaignConfigRow;
  }

  async updateStatusByProjectId(
    projectId: string,
    configStatus: ProjectShareCampaignConfigRow["config_status"],
    employeeId: string | null,
  ) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("project_share_campaign_configs")
      .update({
        config_status: configStatus,
        updated_by_employee_id: employeeId,
      })
      .eq("project_id", projectId)
      .select("*")
      .maybeSingle();

    if (error) {
      throw Errors.dbError("更新项目助力活动配置状态失败", error);
    }

    return (data || null) as ProjectShareCampaignConfigRow | null;
  }
}

export const projectShareCampaignConfigRepository = new ProjectShareCampaignConfigRepository();
