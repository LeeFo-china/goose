import type { WorkflowEdgeCondition } from "@/components/workflows/workflow-types";

export type WorkflowEdgeConditionOptionKey =
  | "always"
  | "payment_success"
  | "payment_failed"
  | "approval_approved"
  | "approval_rejected";

export type WorkflowEdgeConditionOption = {
  value: WorkflowEdgeConditionOptionKey;
  label: string;
  edgeLabel: string | null;
  condition: WorkflowEdgeCondition;
};

export const WORKFLOW_EDGE_CONDITION_OPTIONS = [
  {
    value: "always",
    label: "默认",
    edgeLabel: null,
    condition: { operator: "always" },
  },
  {
    value: "payment_success",
    label: "收款成功",
    edgeLabel: "收款成功",
    condition: { operator: "eq", field: "payment_status", value: "success" },
  },
  {
    value: "payment_failed",
    label: "收款失败",
    edgeLabel: "收款失败",
    condition: { operator: "eq", field: "payment_status", value: "failed" },
  },
  {
    value: "approval_approved",
    label: "审批通过",
    edgeLabel: "审批通过",
    condition: { operator: "eq", field: "approval_result", value: "approved" },
  },
  {
    value: "approval_rejected",
    label: "审批拒绝",
    edgeLabel: "审批拒绝",
    condition: { operator: "eq", field: "approval_result", value: "rejected" },
  },
] as const satisfies ReadonlyArray<WorkflowEdgeConditionOption>;

export function getWorkflowEdgeConditionOption(
  condition: WorkflowEdgeCondition,
) {
  return WORKFLOW_EDGE_CONDITION_OPTIONS.find((option) =>
    option.condition.operator === condition.operator &&
    ("field" in option.condition ? option.condition.field : null) === (condition.field ?? null) &&
    ("value" in option.condition ? option.condition.value : null) === (condition.value ?? null)
  ) ?? WORKFLOW_EDGE_CONDITION_OPTIONS[0];
}

export function getWorkflowEdgeConditionSignature(
  condition: WorkflowEdgeCondition,
) {
  return `${condition.operator}:${condition.field ?? ""}:${String(condition.value ?? "")}`;
}
