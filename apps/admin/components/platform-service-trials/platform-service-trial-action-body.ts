import type {
  PlatformServiceTrialAssigneeCandidate,
  PlatformServiceTrialCapability,
  PlatformServiceTrialType,
} from "./platform-service-trial-types";
import { formatTrialAssigneeCandidate } from "./platform-service-trial-assignee-options";

export type PlatformServiceTrialDialogKind =
  | "approve"
  | "reject"
  | "extend"
  | "revoke"
  | "assign";

type ActionBodyInput = {
  kind: PlatformServiceTrialDialogKind;
  trial: { version: number };
  reason: string;
  assigneeEmployeeId: string | null;
  trialType: PlatformServiceTrialType;
  startsAt: string;
  trialDays: string;
  graceDays: string;
  extensionDays: string;
  scope: PlatformServiceTrialCapability[];
  idempotencyKey: string;
};

export function buildPlatformServiceTrialActionBody(input: ActionBodyInput) {
  const common = {
    expected_version: input.trial.version,
    idempotency_key: input.idempotencyKey,
  };
  if (input.kind === "assign") {
    return { ...common, assignee_employee_id: input.assigneeEmployeeId };
  }
  if (input.kind === "extend") {
    return { ...common, extension_days: Number(input.extensionDays), reason: input.reason };
  }
  if (input.kind === "revoke") return { ...common, reason: input.reason };
  if (input.kind === "reject") {
    return { ...common, decision: "rejected", reason: input.reason };
  }
  return {
    ...common,
    decision: "approved",
    reason: input.reason,
    trial_type: input.trialType,
    starts_at: input.startsAt ? new Date(input.startsAt).toISOString() : undefined,
    trial_days: Number(input.trialDays),
    grace_days: Number(input.graceDays),
    scope: { version: 1, capabilities: input.scope },
    assignee_employee_id: input.assigneeEmployeeId,
  };
}

export function describePlatformServiceTrialAssigneeChange(
  currentCandidate: PlatformServiceTrialAssigneeCandidate | null,
  nextCandidate: PlatformServiceTrialAssigneeCandidate | null,
): { current: string; next: string } {
  const current = currentCandidate
    ? formatTrialAssigneeCandidate(currentCandidate)
    : "未分配";
  if (!nextCandidate) {
    return { current, next: currentCandidate ? "将取消当前分配" : "保持未分配" };
  }
  return { current, next: formatTrialAssigneeCandidate(nextCandidate) };
}
