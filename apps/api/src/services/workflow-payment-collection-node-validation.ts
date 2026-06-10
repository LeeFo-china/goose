import type { WorkflowNodeRow } from "@/repositories/workflows";

export function findPaymentCollectionIssues(nodes: WorkflowNodeRow[]) {
  return nodes
    .filter((node) => node.business_kind === "payment_collection")
    .flatMap((node) => {
      const issues: string[] = [];
      const requirementMode = node.config.requirement_mode ?? "any_confirmed";
      if (
        requirementMode !== "any_confirmed" &&
        requirementMode !== "signed_amount_percentage"
      ) {
        issues.push(`收款节点 ${node.node_key} 必须选择有效的收款放行规则`);
      }
      const requiredPercentage = node.config.required_percentage;
      if (
        requirementMode === "signed_amount_percentage" &&
        (
          typeof requiredPercentage !== "number" ||
          !Number.isFinite(requiredPercentage) ||
          requiredPercentage <= 0 ||
          requiredPercentage > 100
        )
      ) {
        issues.push(`收款节点 ${node.node_key} 的签约金额比例必须大于 0 且不超过 100`);
      }
      const financeReviewerId = node.config.finance_reviewer_employee_id;
      if (typeof financeReviewerId !== "string" || !financeReviewerId.trim()) {
        issues.push(`收款节点 ${node.node_key} 必须选择财务审核人`);
      }
      return issues;
    });
}
