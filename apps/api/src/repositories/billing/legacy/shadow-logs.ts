import { Errors } from "./shared";
import type {
  BillingAiRoutingFilterOptionRow,
  BillingAiShadowRow,
  BillingAiUsageFilterOptionRow,
  BillingAiUsageStatsRow,
  BillingSmsShadowRow,
  BillingSocialVideoShadowRow,
} from "./shared";

export async function listAiShadowRows(this: any, input: {
  limit: number;
  startDate?: string;
  endDate?: string;
}) {
  let request = this.from("ai_call_logs")
    .select(`
      id,
      tenant_id,
      scene_code,
      provider_code,
      model_code,
      model_name,
      status,
      prompt_tokens,
      completion_tokens,
      total_tokens,
      cached_input_tokens,
      reasoning_tokens,
      raw_usage,
      billable,
      source,
      created_at
    `)
    .not("tenant_id", "is", null)
    .eq("status", "success")
    .eq("billable", true)
    .order("created_at", { ascending: true })
    .limit(input.limit);

  if (input.startDate) request = request.gte("created_at", input.startDate);
  if (input.endDate) request = request.lte("created_at", input.endDate);

  const { data, error } = await request;
  if (error) {
    throw Errors.dbError("扫描 AI 影子计费日志失败", error);
  }

  return (data || []) as BillingAiShadowRow[];
}

export async function listAiUsageStatsRows(this: any, input: {
  tenantId?: string;
  tenantIds?: string[];
  sceneCode?: string;
  providerCode?: string;
  modelCode?: string;
  startDate?: string;
  endDate?: string;
  limit: number;
}) {
  if (input.tenantIds && input.tenantIds.length === 0) {
    return [] as BillingAiUsageStatsRow[];
  }

  let request = this.from("ai_call_logs")
    .select(`
      id,
      tenant_id,
      scene_code,
      provider_code,
      model_code,
      model_name,
      status,
      prompt_tokens,
      completion_tokens,
      total_tokens,
      cached_input_tokens,
      reasoning_tokens,
      raw_usage,
      billable,
      source,
      created_at
    `)
    .not("tenant_id", "is", null)
    .eq("status", "success")
    .eq("billable", true)
    .order("created_at", { ascending: false })
    .limit(input.limit);

  if (input.tenantId) request = request.eq("tenant_id", input.tenantId);
  if (input.tenantIds?.length) request = request.in("tenant_id", input.tenantIds);
  if (input.sceneCode) request = request.eq("scene_code", input.sceneCode);
  if (input.providerCode) request = request.eq("provider_code", input.providerCode);
  if (input.modelCode) request = request.eq("model_code", input.modelCode);
  if (input.startDate) request = request.gte("created_at", input.startDate);
  if (input.endDate) request = request.lte("created_at", input.endDate);

  const { data, error } = await request;
  if (error) {
    throw Errors.dbError("分析 AI 试算用量失败", error);
  }

  return (data || []) as BillingAiUsageStatsRow[];
}

export async function listAiUsageFilterOptionRows(this: any, input: { limit: number }) {
  const { data, error } = await this.from("ai_call_logs")
    .select(`
      tenant_id,
      scene_code,
      provider_code,
      model_code,
      model_name
    `)
    .not("tenant_id", "is", null)
    .eq("status", "success")
    .eq("billable", true)
    .order("created_at", { ascending: false })
    .limit(input.limit);

  if (error) {
    throw Errors.dbError("查询 AI 试算筛选选项失败", error);
  }

  return (data || []) as BillingAiUsageFilterOptionRow[];
}

export async function listAiRoutingFilterOptionRows(this: any, ) {
  const { data, error } = await this.from("ai_scene_routes")
    .select(`
      scene_code,
      name,
      status,
      primary_model:ai_models!ai_scene_routes_primary_model_id_fkey(
        code,
        name,
        model_name,
        provider:ai_providers!ai_models_provider_id_fkey(code,name)
      ),
      fallback_model:ai_models!ai_scene_routes_fallback_model_id_fkey(
        code,
        name,
        model_name,
        provider:ai_providers!ai_models_provider_id_fkey(code,name)
      )
    `)
    .eq("status", "active")
    .order("scene_code", { ascending: true });

  if (error) {
    throw Errors.dbError("查询 AI 场景筛选选项失败", error);
  }

  return (data || []) as BillingAiRoutingFilterOptionRow[];
}

export async function listSmsShadowRows(this: any, input: {
  limit: number;
  startDate?: string;
  endDate?: string;
}) {
  let request = this.from("sms_send_logs")
    .select(`
      id,
      tenant_id,
      provider,
      channel_mode,
      purpose,
      template_code,
      status,
      request_id,
      sms_count,
      metadata,
      created_at
    `)
    .not("tenant_id", "is", null)
    .eq("status", "success")
    .order("created_at", { ascending: true })
    .limit(input.limit);

  if (input.startDate) request = request.gte("created_at", input.startDate);
  if (input.endDate) request = request.lte("created_at", input.endDate);

  const { data, error } = await request;
  if (error) {
    throw Errors.dbError("扫描短信影子计费日志失败", error);
  }

  return (data || []) as BillingSmsShadowRow[];
}

export async function listSocialVideoShadowRows(this: any, input: {
  limit: number;
  startDate?: string;
  endDate?: string;
}) {
  let request = this.from("social_video_transcriptions")
    .select(`
      id,
      tenant_id,
      platform,
      status,
      provider,
      audio_duration_seconds,
      billable,
      billing_duration_seconds,
      billing_minutes,
      billing_source,
      created_at,
      completed_at
    `)
    .not("tenant_id", "is", null)
    .eq("status", "completed")
    .eq("billable", true)
    .order("created_at", { ascending: true })
    .limit(input.limit);

  if (input.startDate) request = request.gte("created_at", input.startDate);
  if (input.endDate) request = request.lte("created_at", input.endDate);

  const { data, error } = await request;
  if (error) {
    throw Errors.dbError("扫描短视频影子计费日志失败", error);
  }

  return (data || []) as BillingSocialVideoShadowRow[];
}
