import type { WorkflowNodeRow } from "@/repositories/workflows";

export function findPaymentCollectionIssues(nodes: WorkflowNodeRow[]) {
  return nodes
    .filter((node) => node.business_kind === "payment_collection")
    .flatMap((node) => {
      const issues: string[] = [];
      const financeReviewerId = node.config.finance_reviewer_employee_id;
      if (typeof financeReviewerId !== "string" || !financeReviewerId.trim()) {
        issues.push(`收款节点 ${node.node_key} 必须选择财务审核人`);
      }
      return issues;
    });
}
