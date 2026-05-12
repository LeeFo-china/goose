import { Errors } from "@/errors/error-factory";
import type {
  BillingLedgerQuery,
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

export type BillingEventRow = {
  id: string;
  tenant_id: string;
  metric_code: string;
  scene_code: string | null;
  credits: number;
  status: string;
  created_at: string | null;
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

  async listBillingEvents(input: {
    tenantId?: string;
    startDate?: string;
    endDate?: string;
    statuses?: string[];
    pageSize?: number;
  }) {
    let request = this.from("tenant_billing_events")
      .select("id, tenant_id, metric_code, scene_code, credits, status, created_at")
      .order("created_at", { ascending: false })
      .limit(input.pageSize || 1000);

    if (input.tenantId) request = request.eq("tenant_id", input.tenantId);
    if (input.statuses?.length) request = request.in("status", input.statuses);
    if (input.startDate) request = request.gte("created_at", input.startDate);
    if (input.endDate) request = request.lte("created_at", input.endDate);

    const { data, error } = await request;
    if (error) {
      throw Errors.dbError("查询计费事件失败", error);
    }

    return (data || []) as BillingEventRow[];
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
    if (query.scope) request = request.eq("scope", query.scope);
    if (query.metric_code) request = request.eq("metric_code", query.metric_code);
    if (typeof query.enabled === "boolean") request = request.eq("enabled", query.enabled);

    const { data, count, error } = await request;
    if (error) {
      throw Errors.dbError("查询价格规则失败", error);
    }

    return {
      list: (data || []) as BillingPricingRuleRow[],
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
        ...input,
        scene_code: input.scene_code || null,
        provider: input.provider || null,
        model: input.model || null,
        tenant_id: input.scope === "tenant_override" ? input.tenant_id : null,
        effective_at: input.effective_at || new Date().toISOString(),
        expires_at: input.expires_at || null,
      })
      .select("*")
      .single();

    if (error) {
      throw Errors.dbError("创建价格规则失败", error);
    }

    return data as BillingPricingRuleRow;
  }

  async updatePricingRule(id: string, input: BillingPricingRuleUpdateInput) {
    const patch = {
      ...input,
      scene_code: input.scene_code === undefined ? undefined : input.scene_code || null,
      provider: input.provider === undefined ? undefined : input.provider || null,
      model: input.model === undefined ? undefined : input.model || null,
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

    return data as BillingPricingRuleRow;
  }
}

export const billingRepository = new BillingRepository();
