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

export async function assertSmsChargeAvailable(this: any, input: {
    tenantId?: string | null;
    smsCount?: number;
    purpose?: string | null;
    provider?: string | null;
    templateCode?: string | null;
  }) {
    if (!input.tenantId) return null;

    const preview = await this.buildSmsBillingEventInput({
      tenantId: input.tenantId,
      sourceId: "sms_preflight",
      smsCount: input.smsCount ?? 1,
      purpose: input.purpose || "sms",
      provider: input.provider || "unknown",
      templateCode: input.templateCode || null,
      rawUsage: { preflight: true },
    });

    if (preview.status === "failed") {
      throw Errors.business(
        500,
        preview.failure_message || "短信计费价格规则缺失",
        ErrorCodes.TENANT_PRICING_RULE_MISSING,
        { metric_code: preview.metric_code },
      );
    }

    const account = await billingRepository.ensureAccount(input.tenantId);
    if (Number(account.available_credits || 0) < preview.credits) {
      throw Errors.business(
        402,
        "租户积分余额不足，无法发送计费短信",
        ErrorCodes.TENANT_CREDITS_INSUFFICIENT,
        {
          required_credits: preview.credits,
          available_credits: account.available_credits,
        },
      );
    }

    return {
      required_credits: preview.credits,
      available_credits: account.available_credits,
    };
  }

export async function recordSmsBilling(this: any, input: {
    log: SmsSendLogRecord;
    chargeEnabled: boolean;
  }) {
    const log = input.log;
    if (!log.tenant_id || log.status !== "success") {
      return null;
    }

    const eventInput = await this.buildSmsBillingEventInput({
      tenantId: log.tenant_id,
      sourceId: log.id,
      smsCount: log.sms_count,
      purpose: log.purpose,
      provider: log.provider,
      templateCode: log.template_code,
      rawUsage: { log },
    });
    const event = await billingRepository.createBillingEvent(eventInput)
      || await billingRepository.findBillingEventBySource({
        metricCode: eventInput.metric_code,
        sourceType: eventInput.source_type,
        sourceId: eventInput.source_id,
        sourceSubId: eventInput.source_sub_id,
      });

    if (!event) {
      throw Errors.business(409, "短信计费事件创建失败", "TENANT_BILLING_EVENT_DUPLICATED");
    }

    if (!input.chargeEnabled || event.status === "failed") {
      return {
        event,
        settled: false,
      };
    }

    const settled = await billingRepository.settleBillingEvent(event.id);
    if (settled.event.status === "failed") {
      if (settled.event.failure_code === "TENANT_CREDITS_INSUFFICIENT") {
        throw Errors.business(
          402,
          "租户积分余额不足，短信扣费失败",
          ErrorCodes.TENANT_CREDITS_INSUFFICIENT,
          settled.event,
        );
      }

      throw Errors.business(
        500,
        settled.event.failure_message || "短信扣费失败",
        settled.event.failure_code || "TENANT_SMS_BILLING_FAILED",
        settled.event,
      );
    }

    return {
      event: settled.event,
      ledger: settled.ledger,
      settled: true,
    };
  }

export async function assertSocialVideoChargeAvailable(this: any, input: {
    tenantId?: string | null;
    minChargeCredits?: number;
  }) {
    if (!input.tenantId) return null;

    const requiredCredits = input.minChargeCredits || await this.getSocialVideoMinChargeCredits(input.tenantId);
    const account = await billingRepository.ensureAccount(input.tenantId);
    if (Number(account.available_credits || 0) < requiredCredits) {
      throw Errors.business(
        402,
        "租户积分余额不足，无法创建视频转文本任务",
        ErrorCodes.TENANT_CREDITS_INSUFFICIENT,
        {
          required_credits: requiredCredits,
          available_credits: account.available_credits,
        },
      );
    }

    return {
      required_credits: requiredCredits,
      available_credits: account.available_credits,
    };
  }

export async function freezeSocialVideoTask(this: any, input: {
    taskId: string;
    tenantId: string;
    correlationId: string;
    credits?: number;
  }) {
    const credits = input.credits || await this.getSocialVideoMinChargeCredits(input.tenantId);
    await billingRepository.freezeCredits({
      tenantId: input.tenantId,
      credits,
      eventType: "social_video_transcription_freeze",
      sourceType: BILLING_EVENT_SOURCE.socialVideo,
      sourceId: input.taskId,
      correlationId: input.correlationId,
      remark: "视频转文本任务预冻结",
    });

    return credits;
  }

export async function settleSocialVideoTask(this: any, task: SocialVideoTranscriptionRecord) {
    if (!task.tenant_id || !task.billable) {
      return null;
    }

    const eventInput = this.buildSocialVideoShadowEvent(task, (await billingRepository.listPricingRules({
      page: 1,
      pageSize: 100,
      enabled: true,
      metric_code: "social_video_transcription_minute",
    })).list);
    const event = await billingRepository.createBillingEvent(eventInput)
      || await billingRepository.findBillingEventBySource({
        metricCode: eventInput.metric_code,
        sourceType: eventInput.source_type,
        sourceId: eventInput.source_id,
        sourceSubId: eventInput.source_sub_id,
      });

    if (!event) {
      throw Errors.business(409, "视频转文本计费事件创建失败", "TENANT_BILLING_EVENT_DUPLICATED");
    }

    if (task.billing_frozen_credits > 0 && task.billing_correlation_id) {
      await billingRepository.unfreezeCredits({
        tenantId: task.tenant_id,
        credits: task.billing_frozen_credits,
        eventType: "social_video_transcription_unfreeze",
        sourceType: BILLING_EVENT_SOURCE.socialVideo,
        sourceId: task.id,
        correlationId: task.billing_correlation_id,
        remark: "视频转文本任务完成释放冻结",
      });
    }

    if (event.status === "failed") {
      return {
        event,
        settled: false,
        ledger: null,
      };
    }

    const settled = await billingRepository.settleBillingEvent(event.id);
    if (settled.event.status !== "charged") {
      return {
        event: settled.event,
        settled: false,
        ledger: settled.ledger,
      };
    }

    return {
      event: settled.event,
      settled: true,
      ledger: settled.ledger,
    };
  }

export async function releaseSocialVideoTaskFreeze(this: any, task: SocialVideoTranscriptionRecord) {
    if (!task.tenant_id || !task.billing_correlation_id || task.billing_frozen_credits <= 0) {
      return null;
    }

    return billingRepository.unfreezeCredits({
      tenantId: task.tenant_id,
      credits: task.billing_frozen_credits,
      eventType: "social_video_transcription_failed_unfreeze",
      sourceType: BILLING_EVENT_SOURCE.socialVideo,
      sourceId: task.id,
      correlationId: task.billing_correlation_id,
      remark: "视频转文本任务失败释放冻结",
    });
  }

export async function getSocialVideoMinChargeCredits(this: any, tenantId: string) {
    const rules = await billingRepository.listPricingRules({
      page: 1,
      pageSize: 100,
      enabled: true,
      metric_code: "social_video_transcription_minute",
    });
    const rule = this.resolvePricingRule(rules.list, {
      tenantId,
      metricCode: "social_video_transcription_minute",
      sceneCode: "douyin_transcription",
    });

    if (!rule) {
      throw Errors.business(
        500,
        "视频转文本计费价格规则缺失",
        ErrorCodes.TENANT_PRICING_RULE_MISSING,
      );
    }

    return Math.max(rule.min_charge_credits || 0, rule.unit_credits || 0, 60);
  }

export async function buildSmsBillingEventInput(this: any, input: {
    tenantId: string;
    sourceId: string;
    smsCount: number;
    purpose: string;
    provider: string;
    templateCode?: string | null;
    rawUsage: Record<string, unknown>;
  }) {
    const rules = await billingRepository.listPricingRules({
      page: 1,
      pageSize: 100,
      enabled: true,
      metric_code: "sms_domestic_success",
    });

    return this.buildEstimatedEvent({
      tenantId: input.tenantId,
      metricCode: "sms_domestic_success",
      sourceType: BILLING_EVENT_SOURCE.sms,
      sourceId: input.sourceId,
      sourceSubId: null,
      sceneCode: input.purpose,
      provider: input.provider,
      model: input.templateCode || null,
      units: Math.max(1, toNumber(input.smsCount)),
      rawUsage: input.rawUsage,
      rules: rules.list,
    });
  }
