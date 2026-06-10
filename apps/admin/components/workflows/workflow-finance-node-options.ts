import { PaymentTypeConfig, type WorkflowBusinessKind } from "@gooes/domain";
import type { WorkflowNode } from "@/components/workflows/workflow-types";

export type WorkflowFinanceKind = Extract<
  WorkflowBusinessKind,
  "payment_collection" | "settlement"
>;

export const WORKFLOW_FINANCE_KIND_OPTIONS = [
  {
    value: "payment_collection",
    label: "收款",
    nodeKeyBase: "payment_deposit",
    description: "检查项目收款已入账后再放行后续流程。",
  },
  {
    value: "settlement",
    label: "结算",
    nodeKeyBase: "settlement",
    description: "项目结算或尾款确认节点。",
  },
] as const satisfies ReadonlyArray<{
  value: WorkflowFinanceKind;
  label: string;
  nodeKeyBase: string;
  description: string;
}>;

export function getWorkflowFinanceKindOption(
  financeKind: WorkflowBusinessKind | null | undefined,
) {
  return WORKFLOW_FINANCE_KIND_OPTIONS.find((option) =>
    option.value === financeKind
  ) ?? null;
}

export function getWorkflowFinanceKind(node: WorkflowNode): WorkflowFinanceKind {
  const financeType = "finance_type" in node.config
    ? node.config.finance_type
    : null;
  if (financeType === "payment_collection" || financeType === "settlement") {
    return financeType;
  }
  if (
    node.business_kind === "payment_collection" ||
    node.business_kind === "settlement"
  ) {
    return node.business_kind;
  }
  return "settlement";
}

export function getWorkflowFinanceSpecificLabel(node: WorkflowNode) {
  if (getWorkflowFinanceKind(node) !== "payment_collection") {
    return "结算";
  }

  const paymentType = "payment_type" in node.config
    ? node.config.payment_type
    : null;
  if (
    typeof paymentType === "string" &&
    paymentType in PaymentTypeConfig
  ) {
    return PaymentTypeConfig[paymentType as keyof typeof PaymentTypeConfig].label;
  }

  return node.title === "收款节点" ? "未选择收款类型" : node.title;
}
