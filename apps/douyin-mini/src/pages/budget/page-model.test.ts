import { describe, expect, test } from "bun:test";

import type {
  DouyinBudgetAiExplanationResponse,
  DouyinBudgetEstimateResult,
  DouyinBudgetPublicConfig,
} from "../../models";
import {
  BudgetPageLifecycleCoordinator,
  beginAiRequest,
  beginBudgetCalculation,
  beginConfigLoad,
  buildBudgetResultView,
  buildBudgetPageView,
  createBudgetPageState,
  applyBudgetFormMutation,
  failAiRequest,
  failBudgetCalculation,
  calculateBudgetResultScrollTop,
  invalidateBudgetPageRequests,
  resolveAiRequest,
  resolveAiRequestResult,
  resolveBudgetCalculation,
  resolveBudgetCalculationResult,
  resolveConfigLoad,
  resolveConfigLoadResult,
  shouldPreserveBudgetResultOnReturn,
  shouldResumeBudgetAiOnReturn,
} from "./page-model";

const config = { pricing_version: "1" } as DouyinBudgetPublicConfig;
const estimate = {
  id: "22222222-2222-4222-8222-222222222222",
  estimate_no: "DYYS-20260820-000001",
  minimum_total: 100_000,
  maximum_total: 140_000,
  ai_status: "pending",
} as DouyinBudgetEstimateResult;

describe("budget page request state", () => {
  test("loads once on first lifecycle and refreshes only after a hidden page is shown", () => {
    const lifecycle = new BudgetPageLifecycleCoordinator();
    expect(lifecycle.onLoad()).toBe(true);
    expect(lifecycle.onShow()).toBe(false);
    expect(lifecycle.isActive()).toBe(true);
    expect(lifecycle.onHide()).toBe(true);
    expect(lifecycle.isActive()).toBe(false);
    expect(lifecycle.onShow()).toBe(true);
    expect(lifecycle.onShow()).toBe(false);
    expect(lifecycle.onUnload()).toBe(true);
    expect(lifecycle.isActive()).toBe(false);
    expect(lifecycle.onShow()).toBe(false);
  });

  test("a hidden page refreshes to the authoritative current pricing version on show", () => {
    const lifecycle = new BudgetPageLifecycleCoordinator();
    expect(lifecycle.onLoad()).toBe(true);
    const first = resolveConfigLoad(createBudgetPageState(), 1, config);
    expect(lifecycle.onHide()).toBe(true);
    const hidden = invalidateBudgetPageRequests(first);
    expect(lifecycle.onShow()).toBe(true);
    const refresh = beginConfigLoad(hidden);
    const current = resolveConfigLoadResult(
      refresh,
      refresh.configSequence,
      { ...config, pricing_version: "2" },
    );

    expect(current.accepted).toBe(true);
    expect(current.state).toMatchObject({
      status: "ready",
      config: { pricing_version: "2" },
      estimate: null,
    });
  });

  test("preserves only the matching immutable result for one success-page return", () => {
    const result = {
      ...createBudgetPageState(),
      status: "result" as const,
      config,
      estimate,
    };

    expect(shouldPreserveBudgetResultOnReturn(result, estimate.id)).toBe(true);
    expect(shouldPreserveBudgetResultOnReturn(
      result,
      "33333333-3333-4333-8333-333333333333",
    )).toBe(false);
    expect(shouldPreserveBudgetResultOnReturn(result, null)).toBe(false);
    expect(shouldPreserveBudgetResultOnReturn({ ...result, estimate: null }, estimate.id))
      .toBe(false);
    expect(shouldResumeBudgetAiOnReturn(result, estimate.id)).toBe(true);
    expect(shouldResumeBudgetAiOnReturn({
      ...result,
      estimate: { ...estimate, ai_status: "succeeded" },
    }, estimate.id)).toBe(false);
    expect(shouldResumeBudgetAiOnReturn(result,
      "33333333-3333-4333-8333-333333333333")).toBe(false);
  });

  test("resumes a matching pending AI runner only once per hidden transition", () => {
    const lifecycle = new BudgetPageLifecycleCoordinator();
    const result = {
      ...createBudgetPageState(),
      status: "result" as const,
      config,
      estimate,
    };
    let starts = 0;
    lifecycle.onLoad();
    lifecycle.onHide();
    if (lifecycle.onShow() && shouldResumeBudgetAiOnReturn(result, estimate.id)) starts += 1;
    if (lifecycle.onShow() && shouldResumeBudgetAiOnReturn(result, estimate.id)) starts += 1;

    expect(starts).toBe(1);
  });

  test("hide and unload invalidate config, estimate and AI request authorities", () => {
    const current = resolveConfigLoad(createBudgetPageState(), 1, config);
    const invalidated = invalidateBudgetPageRequests(current);
    expect(invalidated.configSequence).toBe(current.configSequence + 1);
    expect(invalidated.calculationSequence).toBe(current.calculationSequence + 1);
    expect(invalidated.aiSequence).toBe(current.aiSequence + 1);
  });

  test("ignores an older config load after pull-down refresh starts", () => {
    const first = beginConfigLoad(createBudgetPageState());
    const refresh = beginConfigLoad(first);
    expect(resolveConfigLoad(refresh, first.configSequence, config)).toBe(refresh);
    expect(resolveConfigLoad(refresh, refresh.configSequence, config).status).toBe("ready");
  });

  test("reports config acceptance so stale responses cannot update visible data", () => {
    const first = beginConfigLoad(createBudgetPageState());
    const second = beginConfigLoad(first);
    const newConfig = { ...config, pricing_version: "2" };
    const accepted = resolveConfigLoadResult(second, second.configSequence, newConfig);
    const stale = resolveConfigLoadResult(accepted.state, first.configSequence, config);
    expect(accepted).toMatchObject({ accepted: true });
    expect(stale.accepted).toBe(false);
    expect(stale.state.config).toBe(newConfig);
    expect(stale.state.config?.pricing_version).toBe("2");
  });

  test("uses only the required page states", () => {
    const loading = createBudgetPageState();
    expect(loading.status).toBe("loading_config");
    const ready = resolveConfigLoad(loading, loading.configSequence, config);
    expect(ready.status).toBe("ready");
    expect(beginBudgetCalculation(ready).state.status).toBe("calculating");
    expect(resolveBudgetCalculation(
      beginBudgetCalculation(ready).state,
      1,
      estimate,
    ).status).toBe("result");
  });

  test("ignores an old estimate after a newer calculation begins", () => {
    const ready = resolveConfigLoad(createBudgetPageState(), 1, config);
    const first = beginBudgetCalculation(ready);
    const second = beginBudgetCalculation(first.state);
    expect(resolveBudgetCalculation(second.state, first.sequence, estimate))
      .toBe(second.state);
    expect(failBudgetCalculation(second.state, first.sequence, "旧错误"))
      .toBe(second.state);
  });

  test("a late estimate after hide is rejected and cannot start AI", () => {
    const ready = resolveConfigLoad(createBudgetPageState(), 1, config);
    const calculation = beginBudgetCalculation(ready);
    const hidden = invalidateBudgetPageRequests(calculation.state);
    const resolution = resolveBudgetCalculationResult(hidden, calculation.sequence, estimate);
    let aiCalls = 0;
    if (resolution.accepted) aiCalls += 1;

    expect(resolution.accepted).toBe(false);
    expect(resolution.state).toBe(hidden);
    expect(aiCalls).toBe(0);
  });

  test("a late AI response after hide is rejected without a view update", () => {
    const ready = resolveConfigLoad(createBudgetPageState(), 1, config);
    const calculation = beginBudgetCalculation(ready);
    const result = resolveBudgetCalculation(calculation.state, calculation.sequence, estimate);
    const ai = beginAiRequest(result);
    const hidden = invalidateBudgetPageRequests(ai.state);
    const resolution = resolveAiRequestResult(
      hidden,
      ai.sequence,
      estimate.id,
      { estimate: { ...estimate, ai_status: "failed" }, ai_analysis: null },
    );

    expect(resolution.accepted).toBe(false);
    expect(resolution.state).toBe(hidden);
  });

  test("shows deterministic result before AI and updates only AI fields", () => {
    const ready = resolveConfigLoad(createBudgetPageState(), 1, config);
    const calculation = beginBudgetCalculation(ready);
    const resultState = resolveBudgetCalculation(
      calculation.state,
      calculation.sequence,
      estimate,
    );
    const ai = beginAiRequest(resultState);
    const response: DouyinBudgetAiExplanationResponse = {
      estimate: { ...estimate, ai_status: "succeeded" },
      ai_analysis: {
        summary: "规则初算说明",
        allocation_advice: ["先确认基础施工范围"],
        risk_factors: ["现场情况可能影响方案"],
        onsite_questions: ["确认墙体现状"],
      },
    };
    const resolved = resolveAiRequest(ai.state, ai.sequence, estimate.id, response);

    expect(resultState.status).toBe("result");
    expect(ai.state.estimate).toMatchObject({ id: estimate.id, ai_status: "pending" });
    expect(resolved.estimate).toMatchObject({ id: estimate.id, ai_status: "succeeded" });
    expect(resolved.aiAnalysis).toEqual(response.ai_analysis);
  });

  test("projects the immutable estimate pricing version and local validity period", () => {
    const from = "2026-08-20T00:00:00Z";
    const to = "2026-12-31T15:59:59Z";
    const view = buildBudgetResultView({
      ...estimate,
      categories: [],
      pricing_version: "7",
      pricing_effective_from: from,
      pricing_effective_to: to,
    } as DouyinBudgetEstimateResult);

    expect(view.resultPricingVersion).toBe("7");
    expect(view.resultEffectivePeriod).toBe(
      `生效时间 ${new Date(from).toLocaleString("zh-CN", { hour12: false })}；有效至 ${new Date(to).toLocaleString("zh-CN", { hour12: false })}`,
    );
    const stateView = buildBudgetPageView({
      ...createBudgetPageState(),
      status: "result",
      estimate: {
        ...estimate,
        categories: [],
        pricing_version: "7",
        pricing_effective_from: from,
        pricing_effective_to: to,
      } as DouyinBudgetEstimateResult,
    });
    expect(stateView).toMatchObject({ status: "result", resultPricingVersion: "7" });
  });

  test("calculates a result scroll target from node position and viewport offset", () => {
    expect(calculateBudgetResultScrollTop({ rectTop: 260, scrollTop: 120 }))
      .toBe(356);
    expect(calculateBudgetResultScrollTop({ rectTop: -30, scrollTop: 20 }))
      .toBe(0);
  });

  test("ignores stale AI and preserves the estimate when AI fails", () => {
    const ready = resolveConfigLoad(createBudgetPageState(), 1, config);
    const calculation = beginBudgetCalculation(ready);
    const result = resolveBudgetCalculation(
      calculation.state,
      calculation.sequence,
      estimate,
    );
    const firstAi = beginAiRequest(result);
    const retry = beginAiRequest(firstAi.state);
    const stale = resolveAiRequest(
      retry.state,
      firstAi.sequence,
      estimate.id,
      { estimate: { ...estimate, ai_status: "failed" }, ai_analysis: null },
    );
    expect(stale).toBe(retry.state);

    const failed = failAiRequest(retry.state, retry.sequence, estimate.id, "AI 暂时不可用");
    expect(failed.status).toBe("result");
    expect(failed.estimate).toEqual({ ...estimate, ai_status: "failed" });
    expect(failed.aiError).toBe("AI 暂时不可用");
    expect(failed.aiRetryMode).toBe("refresh");

    const providerFailed = resolveAiRequest(
      retry.state,
      retry.sequence,
      estimate.id,
      { estimate: { ...estimate, ai_status: "failed" }, ai_analysis: null },
    );
    expect(providerFailed.aiRetryMode).toBe("retry");
  });

  test("invalidates result and AI authority after any request-bearing form edit", () => {
    const ready = resolveConfigLoad(createBudgetPageState(), 1, config);
    const calculation = beginBudgetCalculation(ready);
    const result = resolveBudgetCalculation(
      calculation.state,
      calculation.sequence,
      estimate,
    );
    const ai = beginAiRequest(result);
    const edited = applyBudgetFormMutation(ai.state);

    expect(edited).toMatchObject({
      status: "ready",
      estimate: null,
      aiAnalysis: null,
      aiError: "",
    });
    expect(edited.aiSequence).toBeGreaterThan(ai.sequence);
    expect(resolveAiRequest(
      edited,
      ai.sequence,
      estimate.id,
      { estimate: { ...estimate, ai_status: "succeeded" }, ai_analysis: {
        summary: "旧建议",
        allocation_advice: [],
        risk_factors: [],
        onsite_questions: [],
      } },
    )).toBe(edited);
  });
});
