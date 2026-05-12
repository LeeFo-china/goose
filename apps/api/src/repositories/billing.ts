import { Errors } from "@/errors/error-factory";
import { randomUUID } from "node:crypto";
import type {
  BillingLedgerQuery,
  BillingEventQuery,
  BillingManualRechargeInput,
  BillingPricingRuleCreateInput,
  BillingPricingRuleQuery,
  BillingPricingRuleUpdateInput,
  BillingTenantListQuery,
} from "@/schema/billing";
import { SupabaseDB } from "@/utils/supabase";

export type BillingAccountBalance = {
  id: string;
  tenant_id: string;
  balance_credits: number;
  frozen_credits: number;
  available_credits: number;
  total_recharged_credits: number;
  total_consumed_credits: number;
  status: string;
  last_activity_at: string | null;
  updated_at: string | null;
};

export type BillingTenantLite = {
  id: string;
  name: string | null;
  slug: string | null;
  status: string | null;
  created_at?: string | null;
};

export type BillingLedgerRow = {
  id: string;
  tenant_id: string;
  account_id: string | null;
  direction: "in" | "out" | "freeze" | "unfreeze";
  change_credits: number;
  balance_after: number;
  frozen_after: number;
  event_type: string;
  metric_code: string | null;
  correlation_id: string | null;
  source_type: string | null;
  source_id: string | null;
  order_no: string | null;
  remark: string | null;
  operator_user_id: string | null;
  created_at: string | null;
};

export type BillingPricingRuleRow = {
  id: string;
  scope: "platform_default" | "tenant_override";
  rule_group_id: string | null;
  tenant_id: string | null;
  metric_code: string;
  scene_code: string | null;
  provider: string | null;
  model: string | null;
  unit: string;
  unit_credits: number;
  min_charge_credits: number;
  priority: number;
  version: number;
  enabled: boolean;
  effective_at: string | null;
  expires_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string | null;
  updated_at: string | null;
};

type BillingPricingRuleDbRow = {
  id: string;
  scope?: "platform_default" | "tenant_override" | null;
  rule_group_id?: string | null;
  tenant_id: string | null;
  metric_code: string;
  scene_code: string | null;
  provider?: string | null;
  provider_code?: string | null;
  model?: string | null;
  model_code?: string | null;
  unit?: string | null;
  unit_name?: string | null;
  unit_credits?: number | string | null;
  unit_price_credits?: number | string | null;
  min_charge_credits: number | string;
  priority: number;
  version: number;
  enabled: boolean;
  effective_at: string | null;
  expires_at: string | null;
  metadata?: Record<string, unknown> | null;
  created_at: string | null;
  updated_at: string | null;
};

export type BillingEventRow = {
  id: string;
  tenant_id: string;
  metric_code: string;
  scene_code: string | null;
  provider: string | null;
  model: string | null;
  source_type: string;
  source_id: string;
  source_sub_id: string | null;
  billable_units: number;
  unit_name: string;
  unit_price_credits: number;
  credits: number;
  status: string;
  pricing_snapshot?: Record<string, unknown>;
  raw_usage?: unknown;
  failure_code: string | null;
  failure_message: string | null;
  settled_at: string | null;
  created_at: string | null;
};

export type BillingEventCreateInput = {
  tenant_id: string;
  metric_code: string;
  scene_code?: string | null;
  provider?: string | null;
  model?: string | null;
  source_type: string;
  source_id: string;
  source_sub_id?: string | null;
  billable_units: number;
  unit_name: string;
  unit_price_credits: number;
  credits: number;
  status: "estimated" | "failed";
  pricing_rule_id?: string | null;
  pricing_snapshot?: Record<string, unknown>;
  raw_usage?: Record<string, unknown>;
  failure_code?: string | null;
  failure_message?: string | null;
};

export type BillingAiShadowRow = {
  id: string;
  tenant_id: string | null;
  scene_code: string;
  provider_code: string | null;
  model_code: string | null;
  model_name: string | null;
  status: "success" | "failure";
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
  cached_input_tokens: number | null;
  reasoning_tokens: number | null;
  raw_usage: unknown;
  billable: boolean | null;
  source: string | null;
  created_at: string | null;
};

export type BillingSmsShadowRow = {
  id: string;
  tenant_id: string | null;
  provider: string;
  channel_mode: string | null;
  purpose: string;
  template_code: string | null;
  status: string;
  request_id: string | null;
  sms_count: number;
  metadata: unknown;
  created_at: string | null;
};

export type BillingSocialVideoShadowRow = {
  id: string;
  tenant_id: string | null;
  platform: string;
  status: string;
  provider: string | null;
  audio_duration_seconds: number | null;
  billable: boolean | null;
  billing_duration_seconds: number | null;
  billing_minutes: number | null;
  billing_source: string | null;
  created_at: string | null;
  completed_at: string | null;
};

class BillingRepository {
  private client = SupabaseDB.getAdminClient();

  private from(table: string) {
    return (this.client as unknown as {
      from: (table: string) => any;
    }).from(table);
  }

  private rpc(name: string, params: Record<string, unknown>) {
    return (this.client as unknown as {
      rpc: (name: string, params: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
    }).rpc(name, params);
  }

  private mapPricingRule(row: BillingPricingRuleDbRow): BillingPricingRuleRow {
    return {
      id: row.id,
      scope: row.scope || (row.tenant_id ? "tenant_override" : "platform_default"),
      rule_group_id: row.rule_group_id || null,
      tenant_id: row.tenant_id,
      metric_code: row.metric_code,
      scene_code: row.scene_code,
      provider: row.provider ?? row.provider_code ?? null,
      model: row.model ?? row.model_code ?? null,
      unit: row.unit ?? row.unit_name ?? "event",
      unit_credits: Number(row.unit_credits ?? row.unit_price_credits ?? 0),
      min_charge_credits: Number(row.min_charge_credits || 0),
      priority: row.priority,
      version: row.version,
      enabled: row.enabled,
      effective_at: row.effective_at,
      expires_at: row.expires_at,
      metadata: row.metadata || {},
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  async ensureAccount(tenantId: string) {
    const { data, error } = await this.rpc("billing_ensure_account", {
      p_tenant_id: tenantId,
    });

    if (error) {
      throw Errors.dbError("初始化租户积分账户失败", error);
    }

    return data as BillingAccountBalance;
  }

  async getAccountByTenantId(tenantId: string) {
    const { data, error } = await this.from("tenant_credit_account_balances")
      .select("*")
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询租户积分账户失败", error);
    }

    return data as BillingAccountBalance | null;
  }

  async listAccountsByTenantIds(tenantIds: string[]) {
    if (!tenantIds.length) return [] as BillingAccountBalance[];

    const { data, error } = await this.from("tenant_credit_account_balances")
      .select("*")
      .in("tenant_id", tenantIds);

    if (error) {
      throw Errors.dbError("查询租户积分账户失败", error);
    }

    return (data || []) as BillingAccountBalance[];
  }

  async listTenantCandidates(query: BillingTenantListQuery) {
    const from = (query.page - 1) * query.pageSize;
    const to = from + query.pageSize - 1;

    let request = this.from("tenants")
      .select("id, name, slug, status, created_at", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, to);

    if (query.keyword) {
      const escaped = query.keyword.replaceAll(",", "\\,");
      request = request.or(`name.ilike.%${escaped}%,slug.ilike.%${escaped}%`);
    }

    const { data, count, error } = await request;
    if (error) {
      throw Errors.dbError("查询计费租户列表失败", error);
    }

    return {
      list: (data || []) as BillingTenantLite[],
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total: count || 0,
        totalPages: count ? Math.ceil(count / query.pageSize) : 0,
      },
    };
  }

  async listTenantsByIds(tenantIds: string[]) {
    if (!tenantIds.length) return [] as BillingTenantLite[];

    const { data, error } = await this.from("tenants")
      .select("id, name, slug, status")
      .in("id", tenantIds);

    if (error) {
      throw Errors.dbError("查询租户信息失败", error);
    }

    return (data || []) as BillingTenantLite[];
  }

  async countTenants() {
    const { count, error } = await this.from("tenants")
      .select("id", { count: "exact", head: true });

    if (error) {
      throw Errors.dbError("统计租户数量失败", error);
    }

    return count || 0;
  }

  async listAllAccounts() {
    const { data, error } = await this.from("tenant_credit_account_balances")
      .select("*");

    if (error) {
      throw Errors.dbError("查询平台积分账户汇总失败", error);
    }

    return (data || []) as BillingAccountBalance[];
  }

  async manualRecharge(
    tenantId: string,
    input: BillingManualRechargeInput,
    operatorUserId: string | null,
  ) {
    const { data, error } = await this.rpc("billing_manual_recharge", {
      p_tenant_id: tenantId,
      p_amount_fen: input.amount_fen,
      p_credits: input.credits,
      p_bonus_credits: input.bonus_credits || 0,
      p_operator_user_id: operatorUserId,
      p_remark: input.remark || null,
      p_metadata: {},
      p_idempotency_key: input.idempotency_key || null,
    });

    if (error) {
      throw Errors.dbError("人工充值失败", error);
    }

    return data as {
      order: Record<string, unknown>;
      account: BillingAccountBalance;
      ledger: BillingLedgerRow;
      idempotent: boolean;
    };
  }

  async listLedger(query: BillingLedgerQuery & { tenantId?: string }) {
    const from = (query.page - 1) * query.pageSize;
    const to = from + query.pageSize - 1;

    let request = this.from("tenant_credit_ledger")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, to);

    const tenantId = query.tenantId || query.tenant_id;
    if (tenantId) request = request.eq("tenant_id", tenantId);
    if (query.direction) request = request.eq("direction", query.direction);
    if (query.event_type) request = request.eq("event_type", query.event_type);
    if (query.start_date) request = request.gte("created_at", query.start_date);
    if (query.end_date) request = request.lte("created_at", query.end_date);
    if (query.keyword) {
      const escaped = query.keyword.replaceAll(",", "\\,");
      request = request.or(`event_type.ilike.%${escaped}%,order_no.ilike.%${escaped}%,remark.ilike.%${escaped}%`);
    }

    const { data, count, error } = await request;
    if (error) {
      throw Errors.dbError("查询积分流水失败", error);
    }

    return {
      list: (data || []) as BillingLedgerRow[],
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total: count || 0,
        totalPages: count ? Math.ceil(count / query.pageSize) : 0,
      },
    };
  }

  async listBillingEvents(input: BillingEventQuery & {
    tenantId?: string;
    startDate?: string;
    endDate?: string;
    statuses?: string[];
    pageSize?: number;
  }) {
    const page = input.page || 1;
    const pageSize = input.pageSize || 1000;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let request = this.from("tenant_billing_events")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, to);

    if (input.tenantId || input.tenant_id) request = request.eq("tenant_id", input.tenantId || input.tenant_id);
    if (input.metric_code) request = request.eq("metric_code", input.metric_code);
    if (input.source_type) request = request.eq("source_type", input.source_type);
    if (input.status) request = request.eq("status", input.status);
    if (input.statuses?.length) request = request.in("status", input.statuses);
    if (input.startDate || input.start_date) request = request.gte("created_at", input.startDate || input.start_date);
    if (input.endDate || input.end_date) request = request.lte("created_at", input.endDate || input.end_date);

    const { data, error, count } = await request;
    if (error) {
      throw Errors.dbError("查询计费事件失败", error);
    }

    return {
      list: (data || []) as BillingEventRow[],
      pagination: {
        page,
        pageSize,
        total: count || 0,
        totalPages: count ? Math.ceil(count / pageSize) : 0,
      },
    };
  }

  async listExistingBillingEventKeys(input: {
    sourceType: string;
    sourceIds: string[];
  }) {
    if (!input.sourceIds.length) return new Set<string>();

    const { data, error } = await this.from("tenant_billing_events")
      .select("metric_code, source_type, source_id, source_sub_id")
      .eq("source_type", input.sourceType)
      .in("source_id", input.sourceIds);

    if (error) {
      throw Errors.dbError("查询已生成计费事件失败", error);
    }

    return new Set((data || []).map((item: {
      metric_code: string;
      source_type: string;
      source_id: string;
      source_sub_id: string | null;
    }) => this.buildEventKey(item)));
  }

  async listAiShadowRows(input: {
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

  async listSmsShadowRows(input: {
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

  async listSocialVideoShadowRows(input: {
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

  buildEventKey(input: {
    metric_code: string;
    source_type: string;
    source_id: string;
    source_sub_id?: string | null;
  }) {
    return `${input.metric_code}:${input.source_type}:${input.source_id}:${input.source_sub_id || ""}`;
  }

  async createBillingEvent(input: BillingEventCreateInput) {
    const { data, error } = await this.from("tenant_billing_events")
      .insert({
        tenant_id: input.tenant_id,
        metric_code: input.metric_code,
        scene_code: input.scene_code || null,
        provider: input.provider || null,
        model: input.model || null,
        source_type: input.source_type,
        source_id: input.source_id,
        source_sub_id: input.source_sub_id || null,
        billable_units: input.billable_units,
        unit_name: input.unit_name,
        unit_price_credits: input.unit_price_credits,
        credits: input.credits,
        status: input.status,
        pricing_rule_id: input.pricing_rule_id || null,
        pricing_snapshot: input.pricing_snapshot || {},
        raw_usage: input.raw_usage || {},
        failure_code: input.failure_code || null,
        failure_message: input.failure_message || null,
      })
      .select("*")
      .single();

    if (error) {
      const code = (error as { code?: string }).code;
      if (code === "23505") {
        return null;
      }

      throw Errors.dbError("创建影子计费事件失败", error);
    }

    return data as BillingEventRow;
  }

  async findBillingEventBySource(input: {
    metricCode: string;
    sourceType: string;
    sourceId: string;
    sourceSubId?: string | null;
  }) {
    let request = this.from("tenant_billing_events")
      .select("*")
      .eq("metric_code", input.metricCode)
      .eq("source_type", input.sourceType)
      .eq("source_id", input.sourceId);

    if (input.sourceSubId) {
      request = request.eq("source_sub_id", input.sourceSubId);
    } else {
      request = request.is("source_sub_id", null);
    }

    const { data, error } = await request.maybeSingle();
    if (error) {
      throw Errors.dbError("查询计费事件失败", error);
    }

    return (data || null) as BillingEventRow | null;
  }

  async settleBillingEvent(eventId: string, operatorUserId?: string | null) {
    const { data, error } = await this.rpc("billing_settle_event", {
      p_billing_event_id: eventId,
      p_correlation_id: randomUUID(),
      p_operator_user_id: operatorUserId || null,
    });

    if (error) {
      throw Errors.dbError("结算计费事件失败", error);
    }

    return data as {
      event: BillingEventRow;
      account: BillingAccountBalance;
      ledger: BillingLedgerRow | null;
      idempotent?: boolean;
    };
  }

  async freezeCredits(input: {
    tenantId: string;
    credits: number;
    eventType: string;
    sourceType: string;
    sourceId: string;
    correlationId: string;
    remark?: string | null;
  }) {
    const { data, error } = await this.rpc("billing_freeze_credits", {
      p_tenant_id: input.tenantId,
      p_change_credits: input.credits,
      p_event_type: input.eventType,
      p_source_type: input.sourceType,
      p_source_id: input.sourceId,
      p_correlation_id: input.correlationId,
      p_remark: input.remark || null,
    });

    if (error) {
      throw Errors.dbError("冻结租户积分失败", error);
    }

    return data as {
      account: BillingAccountBalance;
      ledger: BillingLedgerRow | null;
      idempotent?: boolean;
    };
  }

  async unfreezeCredits(input: {
    tenantId: string;
    credits: number;
    eventType: string;
    sourceType: string;
    sourceId: string;
    correlationId: string;
    remark?: string | null;
  }) {
    const { data, error } = await this.rpc("billing_unfreeze_credits", {
      p_tenant_id: input.tenantId,
      p_change_credits: input.credits,
      p_event_type: input.eventType,
      p_source_type: input.sourceType,
      p_source_id: input.sourceId,
      p_correlation_id: input.correlationId,
      p_remark: input.remark || null,
    });

    if (error) {
      throw Errors.dbError("释放租户冻结积分失败", error);
    }

    return data as {
      account: BillingAccountBalance;
      ledger: BillingLedgerRow | null;
      idempotent?: boolean;
    };
  }

  async listPricingRules(query: BillingPricingRuleQuery) {
    const from = (query.page - 1) * query.pageSize;
    const to = from + query.pageSize - 1;

    let request = this.from("tenant_pricing_rules")
      .select("*", { count: "exact" })
      .order("priority", { ascending: true })
      .order("created_at", { ascending: false })
      .range(from, to);

    if (query.tenant_id) request = request.eq("tenant_id", query.tenant_id);
    if (query.scope === "tenant_override") request = request.not("tenant_id", "is", null);
    if (query.scope === "platform_default") request = request.is("tenant_id", null);
    if (query.metric_code) request = request.eq("metric_code", query.metric_code);
    if (typeof query.enabled === "boolean") request = request.eq("enabled", query.enabled);

    const { data, count, error } = await request;
    if (error) {
      throw Errors.dbError("查询价格规则失败", error);
    }

    return {
      list: ((data || []) as BillingPricingRuleDbRow[]).map((item) => this.mapPricingRule(item)),
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total: count || 0,
        totalPages: count ? Math.ceil(count / query.pageSize) : 0,
      },
    };
  }

  async createPricingRule(input: BillingPricingRuleCreateInput) {
    const { data, error } = await this.from("tenant_pricing_rules")
      .insert({
        tenant_id: input.scope === "tenant_override" ? input.tenant_id : null,
        metric_code: input.metric_code,
        scene_code: input.scene_code || null,
        provider_code: input.provider || null,
        model_code: input.model || null,
        unit_name: input.unit,
        unit_price_credits: input.unit_credits,
        min_charge_credits: input.min_charge_credits,
        priority: input.priority,
        version: input.version,
        enabled: input.enabled,
        effective_at: input.effective_at || new Date().toISOString(),
        expires_at: input.expires_at || null,
      })
      .select("*")
      .single();

    if (error) {
      throw Errors.dbError("创建价格规则失败", error);
    }

    return this.mapPricingRule(data as BillingPricingRuleDbRow);
  }

  async updatePricingRule(id: string, input: BillingPricingRuleUpdateInput) {
    const patch = {
      tenant_id: input.scope === undefined
        ? undefined
        : input.scope === "tenant_override" ? input.tenant_id : null,
      metric_code: input.metric_code,
      scene_code: input.scene_code === undefined ? undefined : input.scene_code || null,
      provider_code: input.provider === undefined ? undefined : input.provider || null,
      model_code: input.model === undefined ? undefined : input.model || null,
      unit_name: input.unit,
      unit_price_credits: input.unit_credits,
      min_charge_credits: input.min_charge_credits,
      priority: input.priority,
      version: input.version,
      enabled: input.enabled,
      effective_at: input.effective_at,
      expires_at: input.expires_at === undefined ? undefined : input.expires_at || null,
    };

    const { data, error } = await this.from("tenant_pricing_rules")
      .update(patch)
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      throw Errors.dbError("更新价格规则失败", error);
    }

    return this.mapPricingRule(data as BillingPricingRuleDbRow);
  }
}

export const billingRepository = new BillingRepository();
