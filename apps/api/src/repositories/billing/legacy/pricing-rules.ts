import { Errors } from "./shared";
import type {
  BillingPricingRuleCreateInput,
  BillingPricingRuleDbRow,
  BillingPricingRuleQuery,
  BillingPricingRuleUpdateInput,
} from "./shared";

export async function listPricingRules(this: any, query: BillingPricingRuleQuery) {
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

export async function createPricingRule(this: any, input: BillingPricingRuleCreateInput) {
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

export async function updatePricingRule(this: any, id: string, input: BillingPricingRuleUpdateInput) {
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
