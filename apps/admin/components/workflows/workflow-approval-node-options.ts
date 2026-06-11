import type { WorkflowNode } from "@/components/workflows/workflow-types";

export type WorkflowApprovalKind = "expense_approval" | "workflow_approval";

export const WORKFLOW_APPROVAL_KIND_OPTIONS = [
  {
    value: "expense_approval",
    label: "费用审批",
    nodeKeyBase: "expense_approval",
    description: "费用、报销或付款审批节点。",
  },
  {
    value: "workflow_approval",
    label: "流程审批",
    nodeKeyBase: "workflow_approval",
    description: "通用流程推进前的人工审批节点。",
  },
] as const satisfies ReadonlyArray<{
  value: WorkflowApprovalKind;
  label: string;
  nodeKeyBase: string;
  description: string;
}>;

export function getWorkflowApprovalKindOption(kind: WorkflowApprovalKind) {
  return WORKFLOW_APPROVAL_KIND_OPTIONS.find((option) =>
    option.value === kind
  ) ?? null;
}

export function getWorkflowApprovalKind(node: WorkflowNode): WorkflowApprovalKind {
  const approvalType = "approval_type" in node.config
    ? node.config.approval_type
    : null;
  if (approvalType === "workflow_approval") {
    return approvalType;
  }
  return "expense_approval";
}

export function getWorkflowApprovalSpecificLabel(node: WorkflowNode) {
  return getWorkflowApprovalKindOption(getWorkflowApprovalKind(node))?.label ||
    node.title ||
    "审批";
}
