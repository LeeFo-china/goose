import type { WorkflowTaskActionMetadata } from
  "@/services/workflow-task-action-metadata";

export function buildSupplierPurchaseBatchActions(
  nodeKey: string,
): WorkflowTaskActionMetadata[] {
  if (nodeKey !== "purchase_review" && nodeKey !== "finance_review") {
    return [];
  }

  return [
    buildAction("approve", "审批通过", false),
    buildAction("reject", "驳回修改", true),
  ];
}

function buildAction(
  key: "approve" | "reject",
  label: string,
  requiresReason: boolean,
): WorkflowTaskActionMetadata {
  return {
    key,
    label,
    business_domain: "supplier_purchase_batch",
    business_action: key,
    requires_reason: requiresReason,
    output_fields: [],
  };
}
