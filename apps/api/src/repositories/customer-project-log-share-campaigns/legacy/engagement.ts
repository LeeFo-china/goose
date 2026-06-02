import { Errors, SupabaseDB } from "./shared";
import type { CustomerProjectLogShareAssistRow } from "./shared";

export async function createOpen(this: any, input: {
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

export async function findAssist(this: any, input: {
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

export async function createAssist(this: any, input: {
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

export async function countAssists(this: any, campaignId: string) {
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

export async function listValidAssists(this: any, input: {
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
