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

export function buildAiShadowEvents(this: any, row: BillingAiShadowRow, rules: BillingPricingRuleRow[]) {
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

export function estimateAiRowCredits(this: any, row: BillingAiUsageStatsRow, rules: BillingPricingRuleRow[]) {
    const tenantId = row.tenant_id;
    if (!tenantId) return 0;

    const inputCredits = this.estimateMetricCredits({
      tenantId,
      metricCode: "ai_input_text_token",
      sceneCode: row.scene_code,
      provider: row.provider_code,
      model: row.model_code,
      units: toNumber(row.prompt_tokens) / 1000,
      rules,
    });
    const outputCredits = this.estimateMetricCredits({
      tenantId,
      metricCode: "ai_output_text_token",
      sceneCode: row.scene_code,
      provider: row.provider_code,
      model: row.model_code,
      units: toNumber(row.completion_tokens) / 1000,
      rules,
    });
    const cachedCredits = this.estimateMetricCredits({
      tenantId,
      metricCode: "ai_cached_input_token",
      sceneCode: row.scene_code,
      provider: row.provider_code,
      model: row.model_code,
      units: toNumber(row.cached_input_tokens) / 1000,
      rules,
    });

    return inputCredits + outputCredits + cachedCredits;
  }

export function countMissingAiPricingRules(this: any, row: BillingAiUsageStatsRow, rules: BillingPricingRuleRow[]) {
    const tenantId = row.tenant_id;
    if (!tenantId) return 0;

    const checks = [
      { metricCode: "ai_input_text_token", units: toNumber(row.prompt_tokens) / 1000 },
      { metricCode: "ai_output_text_token", units: toNumber(row.completion_tokens) / 1000 },
      { metricCode: "ai_cached_input_token", units: toNumber(row.cached_input_tokens) / 1000 },
    ];

    return checks.reduce((count, check) => {
      if (check.units <= 0) return count;
      const rule = this.resolvePricingRule(rules, {
        tenantId,
        metricCode: check.metricCode,
        sceneCode: row.scene_code,
        provider: row.provider_code,
        model: row.model_code,
      });
      return rule ? count : count + 1;
    }, 0);
  }

export function estimateMetricCredits(this: any, input: {
    tenantId: string;
    metricCode: string;
    sceneCode?: string | null;
    provider?: string | null;
    model?: string | null;
    units: number;
    rules: BillingPricingRuleRow[];
  }) {
    if (input.units <= 0) return 0;
    const rule = this.resolvePricingRule(input.rules, {
      tenantId: input.tenantId,
      metricCode: input.metricCode,
      sceneCode: input.sceneCode,
      provider: input.provider,
      model: input.model,
    });
    if (!rule) return 0;
    return ceilCredits(input.units, rule.unit_credits, rule.min_charge_credits);
  }

export function buildSmsShadowEvent(this: any, row: BillingSmsShadowRow, rules: BillingPricingRuleRow[]) {
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

export function buildSocialVideoShadowEvent(this: any, row: BillingSocialVideoShadowRow, rules: BillingPricingRuleRow[]) {
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

export function buildEstimatedEvent(this: any, input: {
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

export function buildFailedEvent(this: any, input: {
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

export function resolvePricingRule(this: any, 
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

export function pricingRuleScore(this: any, rule: BillingPricingRuleRow) {
    return (rule.tenant_id ? 100 : 0)
      + (rule.model ? 16 : 0)
      + (rule.provider ? 8 : 0)
      + (rule.scene_code ? 4 : 0);
  }

export function snapshotPricingRule(this: any, rule: BillingPricingRuleRow) {
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
