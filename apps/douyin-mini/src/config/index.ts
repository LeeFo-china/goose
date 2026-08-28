import { ApiRequestError } from "../api/request";

const DEVELOPMENT_API_BASE_URL = "https://api-dev.goodcms.cn";
const PRODUCTION_API_BASE_URL = "https://api.goodcms.cn";

export const API_TIMEOUT_MS = 10_000;

export function resolveApiBaseUrl(
  envType: string,
  deploymentEnvironment?: string,
): string {
  if (envType === "development") return DEVELOPMENT_API_BASE_URL;
  if (envType === "preview") {
    if (deploymentEnvironment === "development") return DEVELOPMENT_API_BASE_URL;
    if (deploymentEnvironment === "production") return PRODUCTION_API_BASE_URL;
    throw invalidApiConfig();
  }
  if (envType === "production") {
    if (deploymentEnvironment === "development") throw invalidApiConfig();
    if (deploymentEnvironment === undefined || deploymentEnvironment === "production") {
      return PRODUCTION_API_BASE_URL;
    }
  }
  throw invalidApiConfig();
}

function invalidApiConfig(): ApiRequestError {
  return new ApiRequestError(
    0,
    "INVALID_API_CONFIG",
    "不支持的抖音小程序运行环境",
  );
}
