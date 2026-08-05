import {
  Errors,
  ErrorCodes,
  billingRepository,
  accessPolicyService,
  assertPlatformBillingPermission,
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

const PLATFORM_BILLING_READ_PERMISSION = 'platform.billing.read';
const PLATFORM_BILLING_MANAGE_PERMISSION = 'platform.billing.manage';

export async function listPricingRules(this: any, query: BillingPricingRuleQuery, authContext: AuthContext) {
    assertPlatformBillingPermission(authContext, PLATFORM_BILLING_READ_PERMISSION);
    return billingRepository.listPricingRules(query);
  }

export async function createPricingRule(this: any, input: BillingPricingRuleCreateInput, authContext: AuthContext) {
    assertPlatformBillingPermission(authContext, PLATFORM_BILLING_MANAGE_PERMISSION);
    this.assertPricingRuleTenant(input);
    const result = await billingRepository.createPricingRule(input);

    await this.recordPricingAudit("platform_billing_pricing_update", result, authContext);
    return result;
  }

export async function updatePricingRule(this: any, id: string, input: BillingPricingRuleUpdateInput, authContext: AuthContext) {
    assertPlatformBillingPermission(authContext, PLATFORM_BILLING_MANAGE_PERMISSION);
    this.assertPricingRuleTenant(input);
    const result = await billingRepository.updatePricingRule(id, input);

    await this.recordPricingAudit("platform_billing_pricing_update", result, authContext);
    return result;
  }

export function assertPricingRuleTenant(this: any, input: Partial<BillingPricingRuleRow>) {
    if (input.scope === "tenant_override" && !input.tenant_id) {
      throw Errors.business(400, "租户定制价必须选择租户", "BILLING_PRICING_TENANT_REQUIRED");
    }
  }

export async function recordPricingAudit(this: any, 
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
