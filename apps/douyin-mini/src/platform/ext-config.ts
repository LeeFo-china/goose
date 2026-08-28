import type { DeploymentConfig } from "../models";

export function readDeploymentConfig(): DeploymentConfig {
  const raw = tt.getExtConfigSync();
  const nested = isRecord(raw.extConfig)
    ? raw.extConfig
    : isRecord(raw.ext)
      ? raw.ext
      : raw;
  const deploymentKey = typeof nested.deployment_key === "string"
    ? nested.deployment_key.trim()
    : "";
  const deploymentEnvironment = nested.deployment_environment === "development"
    || nested.deployment_environment === "production"
    ? nested.deployment_environment
    : undefined;
  return {
    ...(deploymentKey && deploymentKey.length <= 128
      ? { deployment_key: deploymentKey }
      : {}),
    ...(deploymentEnvironment
      ? { deployment_environment: deploymentEnvironment }
      : {}),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
