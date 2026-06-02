import { Errors, SupabaseDB } from "./shared";
import type { CustomerProjectLogShareCampaignRow, EmployeeShareCampaignListRow } from "./shared";

export async function listForEmployee(this: any, input: {
  campaignId?: string;
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
      campaign_id,
      campaign_type,
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
  if (input.campaignId) {
    query = query.eq("campaign_id", input.campaignId);
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
      instance_id: String(item.id),
      campaign_id: typeof item.campaign_id === "string" ? item.campaign_id : null,
      campaign_type: typeof item.campaign_type === "string" ? item.campaign_type : "share_assist",
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
