import { PROJECT_CONSTRUCTION_COMPLETION_STAGE_CODE } from "@gooes/domain";

type WorkflowNodeLike = {
  node_key?: unknown;
  business_kind?: unknown;
  config?: unknown;
};

export const FINAL_ACCEPTANCE_REPORT_CONFIG = {
  stage_type: "final_acceptance",
  final_acceptance_report_enabled: true,
} as const;

export const FINAL_ACCEPTANCE_STAGE_CODE =
  PROJECT_CONSTRUCTION_COMPLETION_STAGE_CODE;

export function isFinalAcceptanceWorkflowNode(
  node: WorkflowNodeLike | null | undefined,
) {
  const config = asRecord(node?.config);
  return node?.business_kind === "final_acceptance" ||
    node?.node_key === "final_acceptance" ||
    config?.stage_type === "final_acceptance";
}

export function isFinalAcceptanceReportWorkflowNode(
  node: WorkflowNodeLike | null | undefined,
) {
  const config = asRecord(node?.config);
  return isFinalAcceptanceWorkflowNode(node) &&
    config?.final_acceptance_report_enabled === true;
}

export function getWorkflowNodeConfig(value: unknown) {
  return asRecord(value) ?? {};
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}
