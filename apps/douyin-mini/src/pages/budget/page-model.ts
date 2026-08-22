import { ApiRequestError } from "../../api/request";
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

export type BudgetPageResolution = {
  state: BudgetPageState;
  accepted: boolean;
};

export type BudgetResultView = {
  displayMinimum: string;
  displayMaximum: string;
  displayRange: string;
  categoryRows: Array<DouyinBudgetEstimateResult["categories"][number] & { range: string }>;
  resultPricingVersion: string;
  resultEffectivePeriod: string;
};

const RESULT_SCROLL_OFFSET_PX = 24;

type BudgetPageLifecyclePhase = "new" | "visible" | "hidden" | "unloaded";

export class BudgetPageLifecycleCoordinator {
  private phase: BudgetPageLifecyclePhase = "new";

  onLoad(): boolean {
    if (this.phase !== "new") return false;
    this.phase = "visible";
    return true;
  }

  onShow(): boolean {
    if (this.phase !== "hidden") return false;
    this.phase = "visible";
    return true;
  }

  onHide(): boolean {
    if (this.phase !== "visible") return false;
    this.phase = "hidden";
    return true;
  }

  onUnload(): boolean {
    if (this.phase === "unloaded") return false;
    this.phase = "unloaded";
    return true;
  }

  isActive(): boolean {
    return this.phase === "visible";
  }
}

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

export function shouldPreserveBudgetResultOnReturn(
  current: BudgetPageState,
  estimateId: string | null,
): boolean {
  return estimateId !== null
    && current.status === "result"
    && current.estimate?.id === estimateId;
}

export function shouldResumeBudgetAiOnReturn(
  current: BudgetPageState,
  estimateId: string | null,
): boolean {
  return shouldPreserveBudgetResultOnReturn(current, estimateId)
    && current.estimate?.ai_status === "pending";
}

export function buildBudgetResultView(
  estimate: DouyinBudgetEstimateResult | null,
): BudgetResultView {
  if (!estimate) {
    return {
      displayMinimum: "",
      displayMaximum: "",
      displayRange: "",
      categoryRows: [],
      resultPricingVersion: "",
      resultEffectivePeriod: "",
    };
  }
  const effectiveFrom = formatLocalDateTime(estimate.pricing_effective_from);
  const effectiveTo = estimate.pricing_effective_to
    ? formatLocalDateTime(estimate.pricing_effective_to)
    : null;
  return {
    displayMinimum: formatMoney(estimate.minimum_total),
    displayMaximum: formatMoney(estimate.maximum_total),
    displayRange: formatRange(estimate.minimum_total, estimate.maximum_total),
    categoryRows: estimate.categories.map((category) => ({
      ...category,
      range: formatRange(category.minimum_amount, category.maximum_amount),
    })),
    resultPricingVersion: estimate.pricing_version,
    resultEffectivePeriod: `生效时间 ${effectiveFrom}${effectiveTo ? `；有效至 ${effectiveTo}` : "；长期有效"}`,
  };
}

export function calculateBudgetResultScrollTop(input: {
  rectTop: number;
  scrollTop: number;
}): number {
  return Math.max(0, Math.round(input.scrollTop + input.rectTop - RESULT_SCROLL_OFFSET_PX));
}

export function readBudgetResultScrollTop(results: unknown): number | null {
  if (!Array.isArray(results)) return null;
  const rectTop = readNumberProperty(results[0], "top");
  const scrollTop = readNumberProperty(results[1], "scrollTop");
  return rectTop === null || scrollTop === null
    ? null
    : calculateBudgetResultScrollTop({ rectTop, scrollTop });
}

function readNumberProperty(value: unknown, key: string): number | null {
  if (typeof value !== "object" || value === null || !(key in value)) return null;
  const result = (value as Record<string, unknown>)[key];
  return typeof result === "number" && Number.isFinite(result) ? result : null;
}

export function buildBudgetPageView(current: BudgetPageState) {
  return {
    status: current.status,
    config: current.config,
    pageError: current.pageError,
    estimate: current.estimate,
    ...buildBudgetResultView(current.estimate),
    aiAnalysis: current.aiAnalysis,
    aiError: current.aiError,
    aiRetryMode: current.aiRetryMode,
  };
}

export function describeBudgetUnavailable(error: unknown) {
  return error instanceof ApiRequestError && error.code === "DOUYIN_BUDGET_NOT_CONFIGURED"
    ? { title: "预算初算暂未开放", description: "装修公司尚未配置可用报价，请稍后再试。" }
    : { title: "预算初算暂时无法加载", description: readBudgetError(error, "请检查网络后重试。") };
}

export function readBudgetError(error: unknown, fallback: string): string {
  return error instanceof ApiRequestError && error.message.trim() ? error.message : fallback;
}

export function formatRange(minimum: number, maximum: number): string {
  return `${formatMoney(minimum)} - ${formatMoney(maximum)}`;
}

function formatMoney(amount: number): string {
  return `¥${String(amount).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
}

function formatLocalDateTime(value: string): string {
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
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

export function invalidateBudgetPageRequests(current: BudgetPageState): BudgetPageState {
  return {
    ...current,
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
  return resolveBudgetCalculationResult(current, sequence, estimate).state;
}

export function resolveBudgetCalculationResult(
  current: BudgetPageState,
  sequence: number,
  estimate: DouyinBudgetEstimateResult,
): BudgetPageResolution {
  if (sequence !== current.calculationSequence) return { state: current, accepted: false };
  return {
    accepted: true,
    state: { ...current, status: "result", estimate, aiAnalysis: null },
  };
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
  return resolveAiRequestResult(current, sequence, estimateId, response).state;
}

export function resolveAiRequestResult(
  current: BudgetPageState,
  sequence: number,
  estimateId: string,
  response: DouyinBudgetAiExplanationResponse,
): BudgetPageResolution {
  if (sequence !== current.aiSequence || current.estimate?.id !== estimateId
    || response.estimate.id !== estimateId) return { state: current, accepted: false };
  return {
    accepted: true,
    state: {
      ...current,
      estimate: { ...current.estimate, ai_status: response.estimate.ai_status },
      aiAnalysis: response.ai_analysis,
      aiError: response.estimate.ai_status === "failed" ? "AI 建议暂时无法生成" : "",
      aiRetryMode: response.estimate.ai_status === "failed" ? "retry" : "none",
    },
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
