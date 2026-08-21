import { describe, expect, test } from "bun:test";

import type {
  DouyinBudgetAiExplanationResponse,
  DouyinBudgetEstimateResult,
  DouyinBudgetPublicConfig,
} from "../../models";
import {
  beginAiRequest,
  beginBudgetCalculation,
  beginConfigLoad,
  createBudgetPageState,
  applyBudgetFormMutation,
  failAiRequest,
  failBudgetCalculation,
  resolveAiRequest,
  resolveBudgetCalculation,
  resolveConfigLoad,
  resolveConfigLoadResult,
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
