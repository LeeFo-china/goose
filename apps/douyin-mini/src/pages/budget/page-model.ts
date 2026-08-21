import type {
  DouyinBudgetAiAnalysis,
  DouyinBudgetAiExplanationResponse,
  DouyinBudgetEstimateResult,
  DouyinBudgetPublicConfig,
} from "../../models";

export type BudgetPageStatus =
  | "loading_config"
  | "ready"
  | "calculating"
  | "result"
  | "unavailable";

export type BudgetPageState = {
  status: BudgetPageStatus;
  config: DouyinBudgetPublicConfig | null;
  estimate: DouyinBudgetEstimateResult | null;
  aiAnalysis: DouyinBudgetAiAnalysis | null;
  aiError: string;
  aiRetryMode: "none" | "refresh" | "retry";
  pageError: string;
  configSequence: number;
  calculationSequence: number;
  aiSequence: number;
};

export function createBudgetPageState(): BudgetPageState {
  return {
    status: "loading_config",
    config: null,
    estimate: null,
    aiAnalysis: null,
    aiError: "",
    aiRetryMode: "none",
    pageError: "",
    configSequence: 1,
    calculationSequence: 0,
    aiSequence: 0,
  };
}

export function beginConfigLoad(current: BudgetPageState): BudgetPageState {
  return {
    ...current,
    status: "loading_config",
    pageError: "",
    configSequence: current.configSequence + 1,
    calculationSequence: current.calculationSequence + 1,
    aiSequence: current.aiSequence + 1,
  };
}

export function resolveConfigLoad(
  current: BudgetPageState,
  sequence: number,
  config: DouyinBudgetPublicConfig,
): BudgetPageState {
  return resolveConfigLoadResult(current, sequence, config).state;
}

export function resolveConfigLoadResult(
  current: BudgetPageState,
  sequence: number,
  config: DouyinBudgetPublicConfig,
): { state: BudgetPageState; accepted: boolean } {
  if (sequence !== current.configSequence) return { state: current, accepted: false };
  return {
    accepted: true,
    state: {
      ...current,
      status: "ready",
      config,
      estimate: null,
      aiAnalysis: null,
      aiError: "",
      aiRetryMode: "none",
    },
  };
}

export function failConfigLoad(
  current: BudgetPageState,
  sequence: number,
  message: string,
): BudgetPageState {
  return sequence === current.configSequence
    ? { ...current, status: "unavailable", pageError: message }
    : current;
}

export function beginBudgetCalculation(current: BudgetPageState) {
  const sequence = current.calculationSequence + 1;
  return {
    sequence,
    state: {
      ...current,
      status: "calculating" as const,
      estimate: null,
      aiAnalysis: null,
      aiError: "",
      aiRetryMode: "none" as const,
      pageError: "",
      calculationSequence: sequence,
      aiSequence: current.aiSequence + 1,
    },
  };
}

export function applyBudgetFormMutation(current: BudgetPageState): BudgetPageState {
  return {
    ...current,
    status: current.config ? "ready" : "loading_config",
    estimate: null,
    aiAnalysis: null,
    aiError: "",
    aiRetryMode: "none",
    pageError: "",
    calculationSequence: current.calculationSequence + 1,
    aiSequence: current.aiSequence + 1,
  };
}

export function resolveBudgetCalculation(
  current: BudgetPageState,
  sequence: number,
  estimate: DouyinBudgetEstimateResult,
): BudgetPageState {
  return sequence === current.calculationSequence
    ? { ...current, status: "result", estimate, aiAnalysis: null }
    : current;
}

export function failBudgetCalculation(
  current: BudgetPageState,
  sequence: number,
  message: string,
): BudgetPageState {
  return sequence === current.calculationSequence
    ? { ...current, status: "ready", pageError: message }
    : current;
}

export function beginAiRequest(current: BudgetPageState) {
  const sequence = current.aiSequence + 1;
  return {
    sequence,
    state: {
      ...current,
      aiSequence: sequence,
      aiAnalysis: null,
      aiError: "",
      aiRetryMode: "none" as const,
      estimate: current.estimate
        ? { ...current.estimate, ai_status: "pending" as const }
        : null,
    },
  };
}

export function resolveAiRequest(
  current: BudgetPageState,
  sequence: number,
  estimateId: string,
  response: DouyinBudgetAiExplanationResponse,
): BudgetPageState {
  if (sequence !== current.aiSequence || current.estimate?.id !== estimateId
    || response.estimate.id !== estimateId) return current;
  return {
    ...current,
    estimate: { ...current.estimate, ai_status: response.estimate.ai_status },
    aiAnalysis: response.ai_analysis,
    aiError: response.estimate.ai_status === "failed" ? "AI 建议暂时无法生成" : "",
    aiRetryMode: response.estimate.ai_status === "failed" ? "retry" : "none",
  };
}

export function markAiRequestUncertain(
  current: BudgetPageState,
  sequence: number,
  estimateId: string,
  message: string,
): BudgetPageState {
  if (sequence !== current.aiSequence || current.estimate?.id !== estimateId) return current;
  return {
    ...current,
    estimate: { ...current.estimate, ai_status: "pending" },
    aiAnalysis: null,
    aiError: message,
    aiRetryMode: "none",
  };
}

export function failAiRequest(
  current: BudgetPageState,
  sequence: number,
  estimateId: string,
  message: string,
): BudgetPageState {
  if (sequence !== current.aiSequence || current.estimate?.id !== estimateId) return current;
  return {
    ...current,
    estimate: { ...current.estimate, ai_status: "failed" },
    aiAnalysis: null,
    aiError: message,
    aiRetryMode: "refresh",
  };
}
