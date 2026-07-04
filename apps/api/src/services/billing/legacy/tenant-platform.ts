import {
  Errors,
  ErrorCodes,
  billingRepository,
  accessPolicyService,
  platformAuditLogService,
  LOW_BALANCE_THRESHOLD,
  BILLING_EVENT_SOURCE,
  emptyAccount,
  sumCredits,
  groupByMetric,
  enrichLedger,
  sortStrings,
  ceilCredits,
  toNumber,
  percentileDisc,
  type AuthContext,
  type BillingDateRangeQuery,
  type BillingSubscriptionInvoiceQuery,
  type BillingEventQuery,
  type BillingAiUsageStatsQuery,
  type BillingLedgerQuery,
  type BillingManualRechargeInput,
  type BillingPricingRuleCreateInput,
  type BillingPricingRuleQuery,
  type BillingPricingRuleUpdateInput,
  type BillingShadowRunInput,
  type BillingTenantListQuery,
  type PlatformAuditLogAction,
  type SmsSendLogRecord,
  type SocialVideoTranscriptionRecord,
  type BillingAiShadowRow,
  type BillingAiUsageStatsRow,
  type BillingEventCreateInput,
  type BillingPricingRuleRow,
  type BillingSmsShadowRow,
  type BillingSocialVideoShadowRow,
  type ShadowBillingContext,
} from './shared';
import { billingSubscriptionService } from '@/services/billing-subscriptions';

export async function getTenantAccount(this: any, authContext: AuthContext) {
    const tenantId = accessPolicyService.assertTenantContext(authContext);
    return billingRepository.ensureAccount(tenantId);
  }

export async function getTenantSummary(this: any, query: BillingDateRangeQuery, authContext: AuthContext) {
    const tenantId = accessPolicyService.assertTenantContext(authContext);
    const [account, ledger, events, subscriptionLock] = await Promise.all([
      billingRepository.ensureAccount(tenantId),
      billingRepository.listLedger({
        page: 1,
        pageSize: 100,
        tenantId,
        start_date: query.start_date,
        end_date: query.end_date,
      }),
      billingRepository.listBillingEvents({
        page: 1,
        pageSize: 1000,
        tenantId,
        startDate: query.start_date,
        endDate: query.end_date,
        statuses: ["charged", "estimated"],
      }),
      billingSubscriptionService.getTenantLockState(tenantId),
    ]);

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
      subscription_lock: subscriptionLock.locked
        ? {
          locked: true,
          reason: subscriptionLock.reason,
          locked_at: subscriptionLock.locked_at,
          last_invoice_id: subscriptionLock.last_invoice_id,
        }
        : {
          locked: false,
          reason: null,
          locked_at: null,
          last_invoice_id: null,
        },
    };
  }

export async function listTenantLedger(this: any, query: BillingLedgerQuery, authContext: AuthContext) {
    const tenantId = accessPolicyService.assertTenantContext(authContext);
    return billingRepository.listLedger({
      ...query,
      tenantId,
    });
  }

export async function getTenantFeatureEstimates(this: any, authContext: AuthContext) {
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

export async function getTenantSubscription(this: any, authContext: AuthContext) {
    const tenantId = accessPolicyService.assertTenantContext(authContext);
    return billingSubscriptionService.getTenantSubscription(tenantId);
  }

export async function listTenantSubscriptionInvoices(
    this: any,
    query: BillingSubscriptionInvoiceQuery,
    authContext: AuthContext,
  ) {
    const tenantId = accessPolicyService.assertTenantContext(authContext);
    return billingSubscriptionService.listTenantInvoices(tenantId, query);
  }

export async function getTenantSubscriptionInvoice(
    this: any,
    invoiceId: string,
    authContext: AuthContext,
  ) {
    const tenantId = accessPolicyService.assertTenantContext(authContext);
    return billingSubscriptionService.getTenantInvoice(tenantId, invoiceId);
  }

export async function getPlatformSummary(this: any, authContext: AuthContext) {
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

export async function listPlatformTenants(this: any, query: BillingTenantListQuery, authContext: AuthContext) {
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

export async function manualRecharge(this: any, 
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

export async function listPlatformLedger(this: any, query: BillingLedgerQuery, authContext: AuthContext) {
    this.assertPlatformAdmin(authContext);
    const filterTenantIds = query.tenant_keyword
      ? await billingRepository.listTenantIdsByKeyword(query.tenant_keyword)
      : undefined;
    const result = await billingRepository.listLedger({
      ...query,
      tenantIds: filterTenantIds,
    });
    const resultTenantIds = Array.from(new Set(result.list.map((item) => item.tenant_id)));
    const tenants = await billingRepository.listTenantsByIds(resultTenantIds);

    return {
      ...result,
      list: enrichLedger(result.list, tenants),
    };
  }

export async function listPlatformBillingEvents(this: any, query: BillingEventQuery, authContext: AuthContext) {
    this.assertPlatformAdmin(authContext);
    const filterTenantIds = query.tenant_keyword
      ? await billingRepository.listTenantIdsByKeyword(query.tenant_keyword)
      : undefined;
    const result = await billingRepository.listBillingEvents({
      ...query,
      tenantIds: filterTenantIds,
    });
    const resultTenantIds = Array.from(new Set(result.list.map((item) => item.tenant_id)));
    const tenants = await billingRepository.listTenantsByIds(resultTenantIds);
    const tenantMap = new Map(tenants.map((tenant) => [tenant.id, tenant]));

    return {
      ...result,
      list: result.list.map((item) => ({
        ...item,
        tenant: tenantMap.get(item.tenant_id) || null,
      })),
    };
  }
