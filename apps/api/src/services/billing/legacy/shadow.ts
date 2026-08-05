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

const PLATFORM_BILLING_MANAGE_PERMISSION = 'platform.billing.manage';

export function emptyShadowSourceResult(this: any) {
    return {
      scanned: 0,
      created: 0,
      skipped: 0,
      failed: 0,
      estimated_credits: 0,
    };
  }

export async function runShadowBilling(this: any, input: BillingShadowRunInput, authContext: AuthContext) {
    assertPlatformBillingPermission(authContext, PLATFORM_BILLING_MANAGE_PERMISSION);
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

export async function shadowBillAi(this: any, context: ShadowBillingContext) {
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

export async function shadowBillSms(this: any, context: ShadowBillingContext) {
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

export async function shadowBillSocialVideo(this: any, context: ShadowBillingContext) {
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
