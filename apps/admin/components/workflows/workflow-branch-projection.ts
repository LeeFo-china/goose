import {
  getWorkflowEdgeConditionOption,
  WORKFLOW_EDGE_CONDITION_OPTIONS,
  type WorkflowEdgeConditionOption,
  type WorkflowEdgeConditionOptionKey,
} from "@/components/workflows/workflow-edge-conditions";
import type {
  WorkflowEdge,
  WorkflowNode,
} from "@/components/workflows/workflow-types";

export type WorkflowBranchKind = "payment" | "approval";
export type WorkflowBranchOutcomeKey = Exclude<WorkflowEdgeConditionOptionKey, "always">;

export type WorkflowConnectionSource = {
  nodeId: string;
  branchOutcome?: WorkflowBranchOutcomeKey;
};

export type WorkflowBranchOutcome = {
  key: WorkflowBranchOutcomeKey;
  label: string;
  option: WorkflowEdgeConditionOption;
};

const PAYMENT_OUTCOMES: WorkflowBranchOutcomeKey[] = [
  "payment_success",
  "payment_failed",
];

const APPROVAL_OUTCOMES: WorkflowBranchOutcomeKey[] = [
  "approval_approved",
  "approval_rejected",
];

export function getWorkflowBranchSourceKind(
  node: WorkflowNode,
): WorkflowBranchKind | null {
  if (node.business_kind === "payment_collection") return "payment";
  if (
    node.business_kind === "expense_approval" ||
    ("approval_type" in node.config && Boolean(node.config.approval_type))
  ) {
    return "approval";
  }
  return null;
}

export function getDefaultWorkflowBranchOutcome(
  kind: WorkflowBranchKind,
): WorkflowBranchOutcomeKey {
  return kind === "payment" ? "payment_success" : "approval_approved";
}

export function getWorkflowBranchOutcomeOption(
  outcomeKey: WorkflowBranchOutcomeKey,
): WorkflowEdgeConditionOption {
  return WORKFLOW_EDGE_CONDITION_OPTIONS.find((option) =>
    option.value === outcomeKey
  ) ?? WORKFLOW_EDGE_CONDITION_OPTIONS[0];
}

export function getWorkflowBranchOutcomeByEdge(
  edge: WorkflowEdge,
): WorkflowBranchOutcomeKey | null {
  const option = getWorkflowEdgeConditionOption(edge.condition);
  return option.value === "always" ? null : option.value;
}

export function getWorkflowBranchOutcomes(kind: WorkflowBranchKind): WorkflowBranchOutcome[] {
  const outcomeKeys = kind === "payment" ? PAYMENT_OUTCOMES : APPROVAL_OUTCOMES;
  return outcomeKeys.map((key) => ({
    key,
    label: getWorkflowBranchOutcomeOption(key).label
      .replace("收款", "")
      .replace("审批", ""),
    option: getWorkflowBranchOutcomeOption(key),
  }));
}

export function isWorkflowBranchOutcomeForKind(
  kind: WorkflowBranchKind,
  outcome: WorkflowBranchOutcomeKey,
) {
  const outcomes = kind === "payment" ? PAYMENT_OUTCOMES : APPROVAL_OUTCOMES;
  return outcomes.includes(outcome);
}
