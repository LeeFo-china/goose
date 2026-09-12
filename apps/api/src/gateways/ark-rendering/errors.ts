import { AppError } from "@/errors/app-error";
import { Errors } from "@/errors/error-factory";

export type ArkGatewayOutcome = "invalid_configuration" | "invalid_input" | "rejected" | "submission_unknown" | "result_unavailable";

export interface ArkUpstreamDiagnostics {
  upstreamCode?: string;
  upstreamParam?: string;
  upstreamReason?: string;
}

const ERROR_DEFINITIONS = {
  invalid_configuration: [500, "效果图服务配置无效", "ARK_INVALID_CONFIGURATION"],
  invalid_input: [400, "效果图服务请求参数无效", "ARK_INVALID_INPUT"],
  rejected: [502, "效果图服务拒绝了请求", "ARK_UPSTREAM_REJECTED"],
  submission_unknown: [502, "效果图服务处理结果暂时无法确认，请勿自动重复提交", "ARK_SUBMISSION_UNKNOWN"],
  result_unavailable: [502, "效果图结果下载失败", "ARK_RESULT_DOWNLOAD_FAILED"],
} as const;

export function arkGatewayError(
  outcome: ArkGatewayOutcome,
  upstreamStatus?: number,
  diagnostics: ArkUpstreamDiagnostics = {},
): AppError {
  const [status, message, code] = ERROR_DEFINITIONS[outcome];
  return Errors.business(status, message, code, {
    outcome,
    ...(upstreamStatus === undefined ? {} : { upstreamStatus }),
    ...diagnostics,
  });
}

export function getArkGatewayOutcome(error: unknown): ArkGatewayOutcome | undefined {
  if (!(error instanceof AppError)) return undefined;
  for (const outcome of Object.keys(ERROR_DEFINITIONS) as ArkGatewayOutcome[]) {
    if (ERROR_DEFINITIONS[outcome][2] === error.code) return outcome;
  }
  return undefined;
}
