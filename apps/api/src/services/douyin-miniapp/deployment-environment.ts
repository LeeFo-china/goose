import { Errors } from "@/errors/error-factory";

export type DouyinDeploymentEnvironment = "development" | "production";

export function resolveDouyinDeploymentEnvironment(
  raw: string | undefined,
): DouyinDeploymentEnvironment {
  const normalized = raw?.trim().toLowerCase();
  if (normalized === "development" || normalized === "production") {
    return normalized;
  }
  throw Errors.business(
    503,
    "抖音小程序部署环境配置无效",
    "DOUYIN_DEPLOYMENT_ENVIRONMENT_INVALID",
  );
}
