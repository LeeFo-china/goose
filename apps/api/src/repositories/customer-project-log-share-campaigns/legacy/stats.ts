import { Errors, SupabaseDB } from "./shared";
import type { CustomerProjectLogShareCampaignRow } from "./shared";

export async function countByProjectStatus(this: any, projectId: string) {
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

export async function countByMarketingCampaignStatus(this: any, campaignId: string) {
  const { data, error } = await SupabaseDB.getAdminClient()
    .from("customer_log_share_campaigns")
    .select("status")
    .eq("campaign_id", campaignId);

  if (error) {
    throw Errors.dbError("统计营销活动实例数量失败", error);
  }

  const list = (data || []) as Array<{ status: CustomerProjectLogShareCampaignRow["status"] }>;
  return {
    instance_count: list.length,
    active_instance_count: list.filter((item) => item.status === "active").length,
    achieved_instance_count: list.filter((item) => item.status === "achieved").length,
    reward_claimed_count: list.filter((item) => item.status === "reward_claimed").length,
    closed_instance_count: list.filter((item) => item.status === "closed").length,
  };
}

export async function getStatsSummary(this: any, input: {
  campaignId?: string;
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
  if (input.campaignId) {
    query = query.eq("campaign_id", input.campaignId);
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
