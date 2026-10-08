import type { PlatformServiceTrialCapability, PlatformServiceTrialScopeV1 } from "@gooes/domain";
import type { PlatformServiceTrialAction, PlatformServiceTrialAvailableActions, PlatformServiceTrialStatus } from "./platform-service-trial-types";

export function getTrialScopeAction(data: {
  trial: { status: PlatformServiceTrialStatus };
  available_actions: PlatformServiceTrialAvailableActions;
} | null): PlatformServiceTrialAction {
  const action = data?.available_actions.update_scope;
  if (!action?.enabled) return action ?? { enabled: false, disabled_reason: "后端未提供范围调整权限" };
  if (!data || !["scheduled", "active", "grace_period"].includes(data.trial.status)) {
    return { enabled: false, disabled_reason: "仅待开始、试用中和只读宽限期可调整范围" };
  }
  return action;
}

export function buildTrialScopeCommand(input: {
  scope: PlatformServiceTrialCapability[];
  version: number;
  reason: string;
  idempotencyKey: string;
}): { scope: PlatformServiceTrialScopeV1; expected_version: number; idempotency_key: string; reason: string } {
  return { scope: { version: 1, capabilities: [...input.scope] }, expected_version: input.version,
    idempotency_key: input.idempotencyKey, reason: input.reason.trim() };
}

export function isTrialScopeConflict(error: unknown): boolean {
  return typeof error === "object" && error !== null && "status" in error && error.status === 409;
}
