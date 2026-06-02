import { Errors, SupabaseDB } from "./shared";
import type { CustomerProjectLogShareCampaignRow } from "./shared";

export async function findActiveByOwner(this: any, input: {
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

export async function findByShareToken(this: any, shareToken: string) {
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

export async function findById(this: any, id: string) {
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

export async function findByVoucherToken(this: any, voucherToken: string) {
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

export async function listByProject(this: any, input: {
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

export async function findActiveByProject(this: any, projectId: string) {
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
