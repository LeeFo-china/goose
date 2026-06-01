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

export async function getPlatformAiUsageStats(this: any, query: BillingAiUsageStatsQuery, authContext: AuthContext) {
    this.assertPlatformAdmin(authContext);
    const filterTenantIds = query.tenant_keyword
      ? await billingRepository.listTenantIdsByKeyword(query.tenant_keyword)
      : undefined;
    const [rows, rules] = await Promise.all([
      billingRepository.listAiUsageStatsRows({
        tenantId: query.tenant_id,
        tenantIds: filterTenantIds,
        sceneCode: query.scene_code,
        providerCode: query.provider_code,
        modelCode: query.model_code,
        startDate: query.start_date,
        endDate: query.end_date,
        limit: query.limit,
      }),
      billingRepository.listPricingRules({
        page: 1,
        pageSize: 500,
        enabled: true,
      }),
    ]);

    const groups = new Map<string, BillingAiUsageStatsRow[]>();
    for (const row of rows) {
      const key = [
        row.scene_code || "",
        row.provider_code || "",
        row.model_code || "",
      ].join("::");
      groups.set(key, [...(groups.get(key) || []), row]);
    }

    const list = Array.from(groups.values()).map((items) => {
      const first = items[0]!;
      const tokenValues: number[] = [];
      const creditValues: number[] = [];
      let missingUsageCount = 0;
      let missingPricingRuleCount = 0;
      let cachedInputTokenCalls = 0;
      let reasoningTokenCalls = 0;

      for (const row of items) {
        const promptTokens = toNumber(row.prompt_tokens);
        const completionTokens = toNumber(row.completion_tokens);
        const cachedInputTokens = toNumber(row.cached_input_tokens);
        const reasoningTokens = toNumber(row.reasoning_tokens);
        const totalTokens = toNumber(row.total_tokens) || promptTokens + completionTokens;
        const hasUsage = promptTokens > 0 || completionTokens > 0 || cachedInputTokens > 0;
        if (!hasUsage) {
          missingUsageCount += 1;
          continue;
        }

        tokenValues.push(totalTokens + cachedInputTokens);
        missingPricingRuleCount += this.countMissingAiPricingRules(row, rules.list);
        creditValues.push(this.estimateAiRowCredits(row, rules.list));
        if (cachedInputTokens > 0) cachedInputTokenCalls += 1;
        if (reasoningTokens > 0) reasoningTokenCalls += 1;
      }

      const p95Credits = percentileDisc(creditValues, 0.95);
      const sampleGap = Math.max(0, query.min_sample_count - tokenValues.length);
      const blockingReasons: string[] = [];
      if (sampleGap > 0) blockingReasons.push("sample_insufficient");
      if (missingUsageCount > 0) blockingReasons.push("usage_missing");
      if (missingPricingRuleCount > 0) blockingReasons.push("pricing_rule_missing");
      if (p95Credits <= 0 && missingPricingRuleCount === 0) blockingReasons.push("credit_p95_zero");

      return {
        scene_code: first.scene_code,
        provider_code: first.provider_code,
        model_code: first.model_code,
        model_name: first.model_name,
        total_logs: items.length,
        billable_sample_count: tokenValues.length,
        sample_gap: sampleGap,
        missing_usage_count: missingUsageCount,
        missing_pricing_rule_count: missingPricingRuleCount,
        pricing_rule_matched: tokenValues.length > 0 && missingPricingRuleCount === 0,
        cached_input_token_call_count: cachedInputTokenCalls,
        reasoning_token_call_count: reasoningTokenCalls,
        token_percentiles: {
          p50: percentileDisc(tokenValues, 0.5),
          p90: percentileDisc(tokenValues, 0.9),
          p95: percentileDisc(tokenValues, 0.95),
          p99: percentileDisc(tokenValues, 0.99),
        },
        credit_percentiles: {
          p50: percentileDisc(creditValues, 0.5),
          p90: percentileDisc(creditValues, 0.9),
          p95: p95Credits,
          p99: percentileDisc(creditValues, 0.99),
        },
        suggested_min_charge_credits: Math.ceil(p95Credits * query.safety_factor),
        blocking_reasons: blockingReasons,
        ready_for_phase6: blockingReasons.length === 0,
      };
    }).sort((a, b) => {
      if (a.ready_for_phase6 !== b.ready_for_phase6) {
        return a.ready_for_phase6 ? -1 : 1;
      }
      return b.billable_sample_count - a.billable_sample_count;
    });

    return {
      range: {
        start_date: query.start_date || null,
        end_date: query.end_date || null,
      },
      controls: {
        limit: query.limit,
        min_sample_count: query.min_sample_count,
        safety_factor: query.safety_factor,
      },
      totals: {
        groups: list.length,
        logs: rows.length,
        billable_samples: list.reduce((sum, item) => sum + item.billable_sample_count, 0),
        missing_usage: list.reduce((sum, item) => sum + item.missing_usage_count, 0),
        ready_groups: list.filter((item) => item.ready_for_phase6).length,
        watch_groups: list.filter((item) => item.blocking_reasons.includes("sample_insufficient")).length,
        pricing_rule_missing_groups: list.filter((item) => item.blocking_reasons.includes("pricing_rule_missing")).length,
        usage_missing_groups: list.filter((item) => item.blocking_reasons.includes("usage_missing")).length,
      },
      list,
    };
  }

export async function getPlatformAiUsageFilterOptions(this: any, authContext: AuthContext) {
    this.assertPlatformAdmin(authContext);
    const [rows, routes] = await Promise.all([
      billingRepository.listAiUsageFilterOptionRows({ limit: 10000 }),
      billingRepository.listAiRoutingFilterOptionRows(),
    ]);
    const tenantIds = Array.from(new Set(rows.map((row) => row.tenant_id).filter(Boolean))) as string[];
    const tenants = await billingRepository.listTenantsByIds(tenantIds);
    const tenantMap = new Map(tenants.map((tenant) => [tenant.id, tenant]));
    const sceneMap = new Map<string, { code: string; name: string | null }>();
    const providerMap = new Map<string, { code: string; name: string | null }>();
    const modelMap = new Map<string, { code: string; name: string | null; provider_code: string | null }>();

    for (const route of routes) {
      if (route.scene_code) {
        sceneMap.set(route.scene_code, {
          code: route.scene_code,
          name: route.name,
        });
      }

      for (const model of [route.primary_model, route.fallback_model]) {
        if (!model) continue;
        if (model.provider?.code && !providerMap.has(model.provider.code)) {
          providerMap.set(model.provider.code, {
            code: model.provider.code,
            name: model.provider.name,
          });
        }
        if (model.code && !modelMap.has(model.code)) {
          modelMap.set(model.code, {
            code: model.code,
            name: model.name || model.model_name,
            provider_code: model.provider?.code || null,
          });
        }
      }
    }

    for (const row of rows) {
      if (row.scene_code && !sceneMap.has(row.scene_code)) {
        sceneMap.set(row.scene_code, {
          code: row.scene_code,
          name: null,
        });
      }
      if (row.provider_code && !providerMap.has(row.provider_code)) {
        providerMap.set(row.provider_code, {
          code: row.provider_code,
          name: null,
        });
      }
      if (row.model_code && !modelMap.has(row.model_code)) {
        modelMap.set(row.model_code, {
          code: row.model_code,
          name: row.model_name,
          provider_code: row.provider_code,
        });
      }
    }

    return {
      tenants: tenantIds
        .map((tenantId) => {
          const tenant = tenantMap.get(tenantId);
          return {
            id: tenantId,
            name: tenant?.name || tenant?.slug || tenantId,
            slug: tenant?.slug || null,
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name, "zh-CN")),
      scene_codes: sortStrings(sceneMap.keys()),
      scene_options: Array.from(sceneMap.values()).sort((a, b) => a.code.localeCompare(b.code, "zh-CN")),
      provider_codes: sortStrings(providerMap.keys()),
      provider_options: Array.from(providerMap.values()).sort((a, b) => a.code.localeCompare(b.code, "zh-CN")),
      models: Array.from(modelMap.values()).sort((a, b) => a.code.localeCompare(b.code, "zh-CN")),
    };
  }
