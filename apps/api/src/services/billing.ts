import { Errors } from "@/errors/error-factory";
import {
  billingRepository,
  type BillingAccountBalance,
  type BillingAiShadowRow,
  type BillingEventCreateInput,
  type BillingLedgerRow,
  type BillingPricingRuleRow,
  type BillingSmsShadowRow,
  type BillingSocialVideoShadowRow,
  type BillingTenantLite,
} from "@/repositories/billing";
import type {
  BillingDateRangeQuery,
  BillingEventQuery,
  BillingLedgerQuery,
  BillingManualRechargeInput,
  BillingPricingRuleCreateInput,
  BillingPricingRuleQuery,
  BillingPricingRuleUpdateInput,
  BillingShadowRunInput,
  BillingTenantListQuery,
} from "@/schema/billing";
import type { PlatformAuditLogAction } from "@/schema/platform-audit-logs";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";
import { platformAuditLogService } from "@/services/platform-audit-logs";

const LOW_BALANCE_THRESHOLD = Number(process.env.BILLING_LOW_BALANCE_CREDITS || 5000);

const BILLING_EVENT_SOURCE = {
  ai: "ai_call_log",
  sms: "sms_send_log",
  socialVideo: "social_video_transcription",
} as const;

type ShadowBillingContext = {
  rules: BillingPricingRuleRow[];
  limit: number;
  startDate?: string;
  endDate?: string;
};

function emptyAccount(tenantId: string): BillingAccountBalance {
  return {
    id: "",
    tenant_id: tenantId,
    balance_credits: 0,
    frozen_credits: 0,
    available_credits: 0,
    total_recharged_credits: 0,
    total_consumed_credits: 0,
    status: "active",
    last_activity_at: null,
    updated_at: null,
  };
}

function sumCredits(rows: BillingLedgerRow[], direction: BillingLedgerRow["direction"]) {
  return rows
    .filter((item) => item.direction === direction)
    .reduce((total, item) => total + Number(item.change_credits || 0), 0);
}

function groupByMetric(rows: Array<{ metric_code: string | null; credits: number }>) {
  const metrics = new Map<string, number>();
  for (const row of rows) {
    const key = row.metric_code || "unknown";
    metrics.set(key, (metrics.get(key) || 0) + Number(row.credits || 0));
  }

  return Array.from(metrics.entries()).map(([metric_code, credits]) => ({
    metric_code,
    credits,
  }));
}

function enrichLedger(rows: BillingLedgerRow[], tenants: BillingTenantLite[]) {
  const tenantMap = new Map(tenants.map((tenant) => [tenant.id, tenant]));
  return rows.map((item) => ({
    ...item,
    tenant: tenantMap.get(item.tenant_id) || null,
  }));
}

function ceilCredits(units: number, unitCredits: number, minChargeCredits = 0) {
  if (units <= 0 || unitCredits <= 0) return 0;
  return Math.max(Math.ceil(units * unitCredits), minChargeCredits);
}

function toNumber(value: number | null | undefined) {
  return Number(value || 0);
}

class BillingService {
  async getTenantAccount(authContext: AuthContext) {
    const tenantId = accessPolicyService.assertTenantContext(authContext);
    return billingRepository.ensureAccount(tenantId);
  }

  async getTenantSummary(query: BillingDateRangeQuery, authContext: AuthContext) {
    const tenantId = accessPolicyService.assertTenantContext(authContext);
    const account = await billingRepository.ensureAccount(tenantId);
    const ledger = await billingRepository.listLedger({
      page: 1,
      pageSize: 100,
      tenantId,
      start_date: query.start_date,
      end_date: query.end_date,
    });
    const events = await billingRepository.listBillingEvents({
      page: 1,
      pageSize: 1000,
      tenantId,
      startDate: query.start_date,
      endDate: query.end_date,
      statuses: ["charged", "estimated"],
    });

    return {
      account,
      period: {
        start_date: query.start_date || null,
        end_date: query.end_date || null,
      },
      totals: {
        recharged_credits: sumCredits(ledger.list, "in"),
        consumed_credits: sumCredits(ledger.list, "out"),
        frozen_credits: account.frozen_credits,
        available_credits: account.available_credits,
      },
      metrics: groupByMetric(events.list),
    };
  }

  async listTenantLedger(query: BillingLedgerQuery, authContext: AuthContext) {
    const tenantId = accessPolicyService.assertTenantContext(authContext);
    return billingRepository.listLedger({
      ...query,
      tenantId,
    });
  }

  async getTenantFeatureEstimates(authContext: AuthContext) {
    accessPolicyService.assertTenantContext(authContext);
    const rules = await billingRepository.listPricingRules({
      page: 1,
      pageSize: 100,
      scope: "platform_default",
      enabled: true,
    });

    const findRule = (metricCode: string) =>
      rules.list.find((item) => item.metric_code === metricCode);
    const sms = findRule("sms_domestic_success");
    const video = findRule("social_video_transcription_minute");
    const aiInput = findRule("ai_input_text_token");
    const aiOutput = findRule("ai_output_text_token");

    return {
      sms: {
        metric_code: "sms_domestic_success",
        unit: sms?.unit || "message",
        unit_credits: sms?.unit_credits || 50,
        min_charge_credits: sms?.min_charge_credits || 50,
      },
      social_video: {
        metric_code: "social_video_transcription_minute",
        unit: video?.unit || "minute",
        unit_credits: video?.unit_credits || 60,
        min_charge_credits: video?.min_charge_credits || 60,
      },
      ai: {
        input_token_1k_credits: aiInput?.unit_credits || 10,
        output_token_1k_credits: aiOutput?.unit_credits || 50,
        min_charge_credits: Math.max(aiInput?.min_charge_credits || 0, aiOutput?.min_charge_credits || 0),
      },
    };
  }

  async getPlatformSummary(authContext: AuthContext) {
    this.assertPlatformAdmin(authContext);
    const [tenantCount, accounts] = await Promise.all([
      billingRepository.countTenants(),
      billingRepository.listAllAccounts(),
    ]);

    const totalBalance = accounts.reduce((total, item) => total + Number(item.balance_credits || 0), 0);
    const totalFrozen = accounts.reduce((total, item) => total + Number(item.frozen_credits || 0), 0);
    const totalConsumed = accounts.reduce((total, item) => total + Number(item.total_consumed_credits || 0), 0);
    const lowBalanceCount = accounts.filter((item) => Number(item.available_credits || 0) < LOW_BALANCE_THRESHOLD).length;

    return {
      tenant_count: tenantCount,
      active_account_count: accounts.filter((item) => item.status === "active").length,
      total_balance_credits: totalBalance,
      total_frozen_credits: totalFrozen,
      total_available_credits: totalBalance - totalFrozen,
      total_consumed_credits: totalConsumed,
      low_balance_count: lowBalanceCount,
      low_balance_threshold: LOW_BALANCE_THRESHOLD,
    };
  }

  async listPlatformTenants(query: BillingTenantListQuery, authContext: AuthContext) {
    this.assertPlatformAdmin(authContext);
    const tenants = await billingRepository.listTenantCandidates(query);
    const accounts = await billingRepository.listAccountsByTenantIds(
      tenants.list.map((tenant) => tenant.id),
    );
    const accountMap = new Map(accounts.map((account) => [account.tenant_id, account]));

    let list = tenants.list.map((tenant) => {
      const account = accountMap.get(tenant.id) || emptyAccount(tenant.id);
      return {
        ...tenant,
        billing_account: account,
        low_balance: account.available_credits < LOW_BALANCE_THRESHOLD,
      };
    });

    if (query.status) {
      list = list.filter((item) => item.billing_account.status === query.status);
    }

    if (query.low_balance_only) {
      list = list.filter((item) => item.low_balance);
    }

    return {
      ...tenants,
      list,
      low_balance_threshold: LOW_BALANCE_THRESHOLD,
    };
  }

  async manualRecharge(
    tenantId: string,
    input: BillingManualRechargeInput,
    authContext: AuthContext,
  ) {
    this.assertPlatformAdmin(authContext);
    const result = await billingRepository.manualRecharge(
      tenantId,
      input,
      authContext.authUserId,
    );

    await platformAuditLogService.recordBestEffort({
      action: "platform_billing_recharge",
      status: "success",
      actorUserId: authContext.authUserId,
      actorEmployeeId: authContext.employeeId,
      targetTenantId: tenantId,
      resourceType: "tenant_credit_order",
      resourceId: String(result.order.id || ""),
      summary: "人工充值租户积分",
      metadata: {
        amount_fen: input.amount_fen,
        credits: input.credits,
        bonus_credits: input.bonus_credits || 0,
        idempotency_key: input.idempotency_key || null,
      },
    });

    return result;
  }

  async listPlatformLedger(query: BillingLedgerQuery, authContext: AuthContext) {
    this.assertPlatformAdmin(authContext);
    const result = await billingRepository.listLedger(query);
    const tenantIds = Array.from(new Set(result.list.map((item) => item.tenant_id)));
    const tenants = await billingRepository.listTenantsByIds(tenantIds);

    return {
      ...result,
      list: enrichLedger(result.list, tenants),
    };
  }

  async listPlatformBillingEvents(query: BillingEventQuery, authContext: AuthContext) {
    this.assertPlatformAdmin(authContext);
    const result = await billingRepository.listBillingEvents(query);
    const tenantIds = Array.from(new Set(result.list.map((item) => item.tenant_id)));
    const tenants = await billingRepository.listTenantsByIds(tenantIds);
    const tenantMap = new Map(tenants.map((tenant) => [tenant.id, tenant]));

    return {
      ...result,
      list: result.list.map((item) => ({
        ...item,
        tenant: tenantMap.get(item.tenant_id) || null,
      })),
    };
  }

  async runShadowBilling(input: BillingShadowRunInput, authContext: AuthContext) {
    this.assertPlatformAdmin(authContext);
    const enabledSources = new Set(input.sources?.length ? input.sources : ["ai", "sms", "social_video"]);
    const rules = await billingRepository.listPricingRules({
      page: 1,
      pageSize: 500,
      enabled: true,
    });
    const context = {
      rules: rules.list,
      limit: input.limit,
      startDate: input.start_date,
      endDate: input.end_date,
    };

    const summary = {
      ai: enabledSources.has("ai") ? await this.shadowBillAi(context) : this.emptyShadowSourceResult(),
      sms: enabledSources.has("sms") ? await this.shadowBillSms(context) : this.emptyShadowSourceResult(),
      social_video: enabledSources.has("social_video") ? await this.shadowBillSocialVideo(context) : this.emptyShadowSourceResult(),
    };

    return {
      mode: "shadow",
      charged: false,
      range: {
        start_date: input.start_date || null,
        end_date: input.end_date || null,
      },
      summary,
      totals: Object.values(summary).reduce((total, item) => ({
        scanned: total.scanned + item.scanned,
        created: total.created + item.created,
        skipped: total.skipped + item.skipped,
        failed: total.failed + item.failed,
        estimated_credits: total.estimated_credits + item.estimated_credits,
      }), {
        scanned: 0,
        created: 0,
        skipped: 0,
        failed: 0,
        estimated_credits: 0,
      }),
    };
  }

  private emptyShadowSourceResult() {
    return {
      scanned: 0,
      created: 0,
      skipped: 0,
      failed: 0,
      estimated_credits: 0,
    };
  }

  private async shadowBillAi(context: ShadowBillingContext) {
    const rows = await billingRepository.listAiShadowRows(context);
    const existing = await billingRepository.listExistingBillingEventKeys({
      sourceType: BILLING_EVENT_SOURCE.ai,
      sourceIds: rows.map((item) => item.id),
    });
    const result = this.emptyShadowSourceResult();
    result.scanned = rows.length;

    for (const row of rows) {
      const events = this.buildAiShadowEvents(row, context.rules);
      if (!events.length) result.skipped += 1;

      for (const event of events) {
        const key = billingRepository.buildEventKey(event);
        if (existing.has(key)) {
          result.skipped += 1;
          continue;
        }

        const created = await billingRepository.createBillingEvent(event);
        if (!created) {
          result.skipped += 1;
          continue;
        }

        existing.add(key);
        result.created += 1;
        if (created.status === "failed") result.failed += 1;
        result.estimated_credits += created.status === "estimated" ? Number(created.credits || 0) : 0;
      }
    }

    return result;
  }

  private async shadowBillSms(context: ShadowBillingContext) {
    const rows = await billingRepository.listSmsShadowRows(context);
    const existing = await billingRepository.listExistingBillingEventKeys({
      sourceType: BILLING_EVENT_SOURCE.sms,
      sourceIds: rows.map((item) => item.id),
    });
    const result = this.emptyShadowSourceResult();
    result.scanned = rows.length;

    for (const row of rows) {
      const event = this.buildSmsShadowEvent(row, context.rules);
      const key = billingRepository.buildEventKey(event);
      if (existing.has(key)) {
        result.skipped += 1;
        continue;
      }

      const created = await billingRepository.createBillingEvent(event);
      if (!created) {
        result.skipped += 1;
        continue;
      }

      existing.add(key);
      result.created += 1;
      if (created.status === "failed") result.failed += 1;
      result.estimated_credits += created.status === "estimated" ? Number(created.credits || 0) : 0;
    }

    return result;
  }

  private async shadowBillSocialVideo(context: ShadowBillingContext) {
    const rows = await billingRepository.listSocialVideoShadowRows(context);
    const existing = await billingRepository.listExistingBillingEventKeys({
      sourceType: BILLING_EVENT_SOURCE.socialVideo,
      sourceIds: rows.map((item) => item.id),
    });
    const result = this.emptyShadowSourceResult();
    result.scanned = rows.length;

    for (const row of rows) {
      const event = this.buildSocialVideoShadowEvent(row, context.rules);
      const key = billingRepository.buildEventKey(event);
      if (existing.has(key)) {
        result.skipped += 1;
        continue;
      }

      const created = await billingRepository.createBillingEvent(event);
      if (!created) {
        result.skipped += 1;
        continue;
      }

      existing.add(key);
      result.created += 1;
      if (created.status === "failed") result.failed += 1;
      result.estimated_credits += created.status === "estimated" ? Number(created.credits || 0) : 0;
    }

    return result;
  }

  private buildAiShadowEvents(row: BillingAiShadowRow, rules: BillingPricingRuleRow[]) {
    if (!row.tenant_id) return [];

    const promptTokens = toNumber(row.prompt_tokens);
    const completionTokens = toNumber(row.completion_tokens);
    const cachedTokens = toNumber(row.cached_input_tokens);
    if (promptTokens <= 0 && completionTokens <= 0 && cachedTokens <= 0) {
      return [this.buildFailedEvent({
        tenantId: row.tenant_id,
        metricCode: "ai_usage_missing_tokens",
        sourceType: BILLING_EVENT_SOURCE.ai,
        sourceId: row.id,
        sourceSubId: "missing_usage",
        sceneCode: row.scene_code,
        provider: row.provider_code,
        model: row.model_code,
        failureCode: "AI_USAGE_MISSING_TOKENS",
        failureMessage: "AI 调用成功但缺少 token usage，无法试算扣费",
        rawUsage: { row },
      })];
    }

    const output: BillingEventCreateInput[] = [];
    if (promptTokens > 0) {
      output.push(this.buildEstimatedEvent({
        tenantId: row.tenant_id,
        metricCode: "ai_input_text_token",
        sourceType: BILLING_EVENT_SOURCE.ai,
        sourceId: row.id,
        sourceSubId: "input",
        sceneCode: row.scene_code,
        provider: row.provider_code,
        model: row.model_code,
        units: promptTokens / 1000,
        rawUsage: { row, token_type: "input", tokens: promptTokens },
        rules,
      }));
    }

    if (completionTokens > 0) {
      output.push(this.buildEstimatedEvent({
        tenantId: row.tenant_id,
        metricCode: "ai_output_text_token",
        sourceType: BILLING_EVENT_SOURCE.ai,
        sourceId: row.id,
        sourceSubId: "output",
        sceneCode: row.scene_code,
        provider: row.provider_code,
        model: row.model_code,
        units: completionTokens / 1000,
        rawUsage: { row, token_type: "output", tokens: completionTokens },
        rules,
      }));
    }

    if (cachedTokens > 0) {
      output.push(this.buildEstimatedEvent({
        tenantId: row.tenant_id,
        metricCode: "ai_cached_input_token",
        sourceType: BILLING_EVENT_SOURCE.ai,
        sourceId: row.id,
        sourceSubId: "cached_input",
        sceneCode: row.scene_code,
        provider: row.provider_code,
        model: row.model_code,
        units: cachedTokens / 1000,
        rawUsage: { row, token_type: "cached_input", tokens: cachedTokens },
        rules,
      }));
    }

    return output;
  }

  private buildSmsShadowEvent(row: BillingSmsShadowRow, rules: BillingPricingRuleRow[]) {
    return this.buildEstimatedEvent({
      tenantId: row.tenant_id || "",
      metricCode: "sms_domestic_success",
      sourceType: BILLING_EVENT_SOURCE.sms,
      sourceId: row.id,
      sourceSubId: null,
      sceneCode: row.purpose,
      provider: row.provider,
      model: row.template_code,
      units: Math.max(1, toNumber(row.sms_count)),
      rawUsage: { row },
      rules,
    });
  }

  private buildSocialVideoShadowEvent(row: BillingSocialVideoShadowRow, rules: BillingPricingRuleRow[]) {
    const durationSeconds = row.billing_duration_seconds ?? row.audio_duration_seconds;
    const minutes = row.billing_minutes ?? (durationSeconds ? Math.max(1, Math.ceil(Number(durationSeconds) / 60)) : 0);
    if (!row.tenant_id) {
      return this.buildFailedEvent({
        tenantId: "",
        metricCode: "social_video_transcription_minute",
        sourceType: BILLING_EVENT_SOURCE.socialVideo,
        sourceId: row.id,
        sourceSubId: null,
        sceneCode: "douyin_transcription",
        provider: row.provider,
        model: row.billing_source,
        failureCode: "TENANT_ID_MISSING",
        failureMessage: "短视频转写缺少租户归属，无法试算扣费",
        rawUsage: { row },
      });
    }

    if (!minutes) {
      return this.buildFailedEvent({
        tenantId: row.tenant_id,
        metricCode: "social_video_transcription_minute",
        sourceType: BILLING_EVENT_SOURCE.socialVideo,
        sourceId: row.id,
        sourceSubId: null,
        sceneCode: "douyin_transcription",
        provider: row.provider,
        model: row.billing_source,
        failureCode: "SOCIAL_VIDEO_DURATION_MISSING",
        failureMessage: "短视频转写缺少计费时长，无法试算扣费",
        rawUsage: { row },
      });
    }

    return this.buildEstimatedEvent({
      tenantId: row.tenant_id,
      metricCode: "social_video_transcription_minute",
      sourceType: BILLING_EVENT_SOURCE.socialVideo,
      sourceId: row.id,
      sourceSubId: null,
      sceneCode: "douyin_transcription",
      provider: row.provider,
      model: row.billing_source,
      units: minutes,
      rawUsage: { row, billing_minutes: minutes },
      rules,
    });
  }

  private buildEstimatedEvent(input: {
    tenantId: string;
    metricCode: string;
    sourceType: string;
    sourceId: string;
    sourceSubId?: string | null;
    sceneCode?: string | null;
    provider?: string | null;
    model?: string | null;
    units: number;
    rawUsage: Record<string, unknown>;
    rules: BillingPricingRuleRow[];
  }): BillingEventCreateInput {
    const rule = this.resolvePricingRule(input.rules, {
      tenantId: input.tenantId,
      metricCode: input.metricCode,
      sceneCode: input.sceneCode,
      provider: input.provider,
      model: input.model,
    });

    if (!rule) {
      return this.buildFailedEvent({
        tenantId: input.tenantId,
        metricCode: input.metricCode,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        sourceSubId: input.sourceSubId,
        sceneCode: input.sceneCode,
        provider: input.provider,
        model: input.model,
        failureCode: "TENANT_PRICING_RULE_MISSING",
        failureMessage: "未命中计费价格规则",
        rawUsage: input.rawUsage,
      });
    }

    return {
      tenant_id: input.tenantId,
      metric_code: input.metricCode,
      scene_code: input.sceneCode || null,
      provider: input.provider || null,
      model: input.model || null,
      source_type: input.sourceType,
      source_id: input.sourceId,
      source_sub_id: input.sourceSubId || null,
      billable_units: input.units,
      unit_name: rule.unit,
      unit_price_credits: rule.unit_credits,
      credits: ceilCredits(input.units, rule.unit_credits, rule.min_charge_credits),
      status: "estimated",
      pricing_rule_id: rule.id,
      pricing_snapshot: this.snapshotPricingRule(rule),
      raw_usage: input.rawUsage,
    };
  }

  private buildFailedEvent(input: {
    tenantId: string;
    metricCode: string;
    sourceType: string;
    sourceId: string;
    sourceSubId?: string | null;
    sceneCode?: string | null;
    provider?: string | null;
    model?: string | null;
    failureCode: string;
    failureMessage: string;
    rawUsage: Record<string, unknown>;
  }): BillingEventCreateInput {
    return {
      tenant_id: input.tenantId,
      metric_code: input.metricCode,
      scene_code: input.sceneCode || null,
      provider: input.provider || null,
      model: input.model || null,
      source_type: input.sourceType,
      source_id: input.sourceId,
      source_sub_id: input.sourceSubId || null,
      billable_units: 0,
      unit_name: "event",
      unit_price_credits: 0,
      credits: 0,
      status: "failed",
      pricing_snapshot: {},
      raw_usage: input.rawUsage,
      failure_code: input.failureCode,
      failure_message: input.failureMessage,
    };
  }

  private resolvePricingRule(
    rules: BillingPricingRuleRow[],
    input: {
      tenantId: string;
      metricCode: string;
      sceneCode?: string | null;
      provider?: string | null;
      model?: string | null;
    },
  ) {
    const now = Date.now();
    return rules
      .filter((rule) => {
        if (!rule.enabled || rule.metric_code !== input.metricCode) return false;
        if (rule.tenant_id && rule.tenant_id !== input.tenantId) return false;
        if (rule.scene_code && rule.scene_code !== input.sceneCode) return false;
        if (rule.provider && rule.provider !== input.provider) return false;
        if (rule.model && rule.model !== input.model) return false;
        if (rule.effective_at && new Date(rule.effective_at).getTime() > now) return false;
        if (rule.expires_at && new Date(rule.expires_at).getTime() <= now) return false;
        return true;
      })
      .sort((a, b) => {
        const aScore = this.pricingRuleScore(a);
        const bScore = this.pricingRuleScore(b);
        if (aScore !== bScore) return bScore - aScore;
        return a.priority - b.priority;
      })[0] || null;
  }

  private pricingRuleScore(rule: BillingPricingRuleRow) {
    return (rule.tenant_id ? 100 : 0)
      + (rule.model ? 16 : 0)
      + (rule.provider ? 8 : 0)
      + (rule.scene_code ? 4 : 0);
  }

  private snapshotPricingRule(rule: BillingPricingRuleRow) {
    return {
      id: rule.id,
      scope: rule.scope,
      tenant_id: rule.tenant_id,
      metric_code: rule.metric_code,
      scene_code: rule.scene_code,
      provider: rule.provider,
      model: rule.model,
      unit: rule.unit,
      unit_credits: rule.unit_credits,
      min_charge_credits: rule.min_charge_credits,
      priority: rule.priority,
      version: rule.version,
    };
  }

  async listPricingRules(query: BillingPricingRuleQuery, authContext: AuthContext) {
    this.assertPlatformAdmin(authContext);
    return billingRepository.listPricingRules(query);
  }

  async createPricingRule(input: BillingPricingRuleCreateInput, authContext: AuthContext) {
    this.assertPlatformAdmin(authContext);
    this.assertPricingRuleTenant(input);
    const result = await billingRepository.createPricingRule(input);

    await this.recordPricingAudit("platform_billing_pricing_update", result, authContext);
    return result;
  }

  async updatePricingRule(id: string, input: BillingPricingRuleUpdateInput, authContext: AuthContext) {
    this.assertPlatformAdmin(authContext);
    this.assertPricingRuleTenant(input);
    const result = await billingRepository.updatePricingRule(id, input);

    await this.recordPricingAudit("platform_billing_pricing_update", result, authContext);
    return result;
  }

  private assertPricingRuleTenant(input: Partial<BillingPricingRuleRow>) {
    if (input.scope === "tenant_override" && !input.tenant_id) {
      throw Errors.business(400, "租户定制价必须选择租户", "BILLING_PRICING_TENANT_REQUIRED");
    }
  }

  private async recordPricingAudit(
    action: PlatformAuditLogAction,
    rule: BillingPricingRuleRow,
    authContext: AuthContext,
  ) {
    await platformAuditLogService.recordBestEffort({
      action,
      status: "success",
      actorUserId: authContext.authUserId,
      actorEmployeeId: authContext.employeeId,
      targetTenantId: rule.tenant_id,
      resourceType: "tenant_pricing_rule",
      resourceId: rule.id,
      resourceLabel: rule.metric_code,
      summary: "调整计费价格规则",
      metadata: {
        metric_code: rule.metric_code,
        scope: rule.scope,
        unit: rule.unit,
        unit_credits: rule.unit_credits,
        min_charge_credits: rule.min_charge_credits,
        enabled: rule.enabled,
      },
    });
  }

  private assertPlatformAdmin(authContext: AuthContext) {
    if (!authContext.isPlatformAdmin) {
      throw Errors.forbidden();
    }
  }
}

export const billingService = new BillingService();
