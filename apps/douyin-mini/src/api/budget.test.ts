import { describe, expect, test } from "bun:test";

import type {
  DouyinBudgetEstimateRequest,
  DouyinBudgetEstimateResult,
  DouyinBudgetPublicConfig,
} from "../models";
import { ApiClient, type TransportInput } from "./request";
import {
  createBudgetEstimate,
  fetchBudgetAiAnalysis,
  fetchBudgetConfig,
} from "./budget";

const ESTIMATE_ID = "22222222-2222-4222-8222-222222222222";

function clientWith(handler: (input: TransportInput) => unknown): ApiClient {
  return new ApiClient(
    { send: async (input) => handler(input) },
    {
      getAccessToken: async () => "test-token",
      refreshAfterUnauthorized: async () => "refreshed-token",
    },
  );
}

const config: DouyinBudgetPublicConfig = {
  property_conditions: [
    { value: "rough", label: "毛坯" },
    { value: "old_house", label: "旧房翻新" },
  ],
  decoration_tiers: [
    { value: "economy", label: "经济" },
    { value: "comfortable", label: "舒适" },
    { value: "quality", label: "品质" },
  ],
  decoration_scopes: [
    { value: "whole_house", label: "全屋" },
    { value: "partial", label: "局部" },
  ],
  options: [{
    code: "custom_cabinet",
    label: "定制柜体",
    applicable_property_conditions: ["rough", "old_house"],
    applicable_decoration_tiers: ["comfortable", "quality"],
    applicable_decoration_scopes: ["whole_house"],
  }],
  pricing_version: "1",
  effective_from: "2026-08-20T00:00:00.123Z",
  effective_to: null,
  disclaimer: "初步估算，不构成最终报价",
};

const estimate: DouyinBudgetEstimateResult = {
  id: ESTIMATE_ID,
  estimate_no: "DYYS-20260820-000001",
  minimum_total: 110_000,
  maximum_total: 140_000,
  categories: [{
    category_code: "base",
    label: "基础施工",
    minimum_amount: 110_000,
    maximum_amount: 140_000,
  }],
  calculation_basis: ["110㎡、舒适档、毛坯房、全屋装修"],
  included_items: ["基础施工"],
  excluded_items: ["家电", "软装"],
  pricing_version: "1",
  pricing_effective_from: "2026-08-20T00:00:00Z",
  pricing_effective_to: null,
  disclaimer: "初步估算，不构成最终报价",
  ai_status: "pending",
};

const request: DouyinBudgetEstimateRequest = {
  area: 110,
  property_condition: "rough",
  decoration_tier: "comfortable",
  decoration_scope: "whole_house",
  option_codes: ["custom_cabinet"],
  demand: "需要收纳",
};

describe("Douyin budget API client", () => {
  test("fetches and strictly parses the public budget config", async () => {
    const calls: TransportInput[] = [];
    const client = clientWith((input) => {
      calls.push(input);
      return config;
    });

    await expect(fetchBudgetConfig(client)).resolves.toEqual(config);
    expect(calls).toEqual([{
      path: "/douyin-mini/budget-config",
      method: "GET",
      token: "test-token",
    }]);

    for (const invalid of [
      { ...config, internal_cost: 1 },
      { ...config, effective_to: "2026-08-19T00:00:00Z" },
      { ...config, property_conditions: [...config.property_conditions].reverse() },
      {
        ...config,
        property_conditions: [{ value: " rough ", label: "毛坯" }, config.property_conditions[1]],
      },
      { ...config, options: [{ ...config.options[0], code: "unknown" }] },
      { ...config, options: [{ ...config.options[0], applicable_decoration_tiers: [] }] },
    ]) {
      await expect(fetchBudgetConfig(clientWith(() => invalid)))
        .rejects.toMatchObject({ code: "INVALID_API_RESPONSE" });
    }
  });

  test("posts only the estimate request and rejects malformed results", async () => {
    const calls: TransportInput[] = [];
    const client = clientWith((input) => {
      calls.push(input);
      return estimate;
    });

    await expect(createBudgetEstimate(client, request)).resolves.toEqual(estimate);
    expect(calls).toEqual([{
      path: "/douyin-mini/budget-estimates",
      method: "POST",
      data: request,
      token: "test-token",
    }]);

    for (const invalid of [
      { ...estimate, tenant_id: ESTIMATE_ID },
      { ...estimate, estimate_no: ESTIMATE_ID },
      { ...estimate, minimum_total: 150_000 },
      {
        ...estimate,
        categories: [{ ...estimate.categories[0], minimum_amount: 150_000 }],
      },
      { ...estimate, categories: [estimate.categories[0], estimate.categories[0]] },
      { ...estimate, ai_status: " pending " },
    ]) {
      await expect(createBudgetEstimate(clientWith(() => invalid), request))
        .rejects.toMatchObject({ code: "INVALID_API_RESPONSE" });
    }
  });

  test("strictly couples AI states with analysis and sends explicit retry", async () => {
    const calls: TransportInput[] = [];
    const analysis = {
      summary: "本结果基于规则初算，仅用于理解预算构成，不构成正式报价。",
      allocation_advice: ["建议优先确认基础施工与隐蔽工程范围。"],
      risk_factors: ["现场墙体与水电现状可能影响施工方案。"],
      onsite_questions: ["量房时请确认墙体与空间结构现状。"],
    };
    const client = clientWith((input) => {
      calls.push(input);
      return {
        estimate: { ...estimate, ai_status: "succeeded" },
        ai_analysis: analysis,
      };
    });

    await expect(fetchBudgetAiAnalysis(client, ESTIMATE_ID, true)).resolves.toEqual({
      estimate: { ...estimate, ai_status: "succeeded" },
      ai_analysis: analysis,
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      path: `/douyin-mini/budget-estimates/${ESTIMATE_ID}/ai-analysis`,
      method: "POST",
      data: { retry: true },
      token: "test-token",
    });
    expect(calls[0]!.timeoutMs).toBeGreaterThan(0);
    expect(calls[0]!.timeoutMs).toBeLessThanOrEqual(35_000);

    for (const invalid of [
      { estimate, ai_analysis: analysis },
      { estimate: { ...estimate, ai_status: "succeeded" }, ai_analysis: null },
      { estimate: { ...estimate, ai_status: "failed" }, ai_analysis: analysis },
      {
        estimate: { ...estimate, ai_status: "succeeded" },
        ai_analysis: { ...analysis, amount: 120_000 },
      },
      {
        estimate: { ...estimate, ai_status: "succeeded" },
        ai_analysis: analysis,
        internal_claim: true,
      },
    ]) {
      await expect(fetchBudgetAiAnalysis(clientWith(() => invalid), ESTIMATE_ID))
        .rejects.toMatchObject({ code: "INVALID_API_RESPONSE" });
    }
  });

  test("rejects invalid estimate IDs before sending AI requests", async () => {
    const calls: TransportInput[] = [];
    await expect(fetchBudgetAiAnalysis(clientWith((input) => calls.push(input)), "bad-id"))
      .rejects.toMatchObject({ code: "INVALID_BUDGET_ESTIMATE_ID" });
    expect(calls).toHaveLength(0);
  });
});
