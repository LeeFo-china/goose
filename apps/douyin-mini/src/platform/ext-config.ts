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
  return deploymentKey && deploymentKey.length <= 128
    ? { deployment_key: deploymentKey }
    : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
