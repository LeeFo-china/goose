import { Errors } from "@/errors/error-factory";
import {
  billingRepository,
  type BillingAccountBalance,
  type BillingLedgerRow,
  type BillingPricingRuleRow,
  type BillingTenantLite,
} from "@/repositories/billing";
import type {
  BillingDateRangeQuery,
  BillingLedgerQuery,
  BillingManualRechargeInput,
  BillingPricingRuleCreateInput,
  BillingPricingRuleQuery,
  BillingPricingRuleUpdateInput,
  BillingTenantListQuery,
} from "@/schema/billing";
import type { PlatformAuditLogAction } from "@/schema/platform-audit-logs";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";
import { platformAuditLogService } from "@/services/platform-audit-logs";

const LOW_BALANCE_THRESHOLD = Number(process.env.BILLING_LOW_BALANCE_CREDITS || 5000);

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
      metrics: groupByMetric(events),
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
