import { ApiRequestError } from "../api/request";

const API_BASE_URL_BY_ENV = {
  development: "https://api-dev.goodcms.cn",
  preview: "https://api-dev.goodcms.cn",
  production: "https://api.goodcms.cn",
} as const;

export const API_TIMEOUT_MS = 10_000;

export function resolveApiBaseUrl(envType: string): string {
  if (Object.prototype.hasOwnProperty.call(API_BASE_URL_BY_ENV, envType)) {
    return API_BASE_URL_BY_ENV[envType as keyof typeof API_BASE_URL_BY_ENV];
  }
  throw new ApiRequestError(
    0,
    "INVALID_API_CONFIG",
    "不支持的抖音小程序运行环境",
  );
}
