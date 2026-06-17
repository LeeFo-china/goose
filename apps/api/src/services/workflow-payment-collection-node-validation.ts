import type { WorkflowNodeRow } from "@/repositories/workflows";

const PAYMENT_COLLECTION_TYPES = new Set([
  "deposit",
  "stage_1",
  "stage_2",
  "stage_3",
  "add_on",
]);

export function findPaymentCollectionIssues(nodes: WorkflowNodeRow[]) {
  return nodes
    .filter((node) => node.business_kind === "payment_collection")
    .flatMap((node) => {
      const issues: string[] = [];
      if (!isPaymentCollectionType(node.config.payment_type)) {
        issues.push(`收款节点 ${node.node_key} 必须选择合法的收款类型`);
      }
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
      const requiredPermissions = Array.isArray(node.config.required_permissions)
        ? node.config.required_permissions
        : [];
      const hasFinancePermission = requiredPermissions.some((permission) =>
        typeof permission === "string" && permission.startsWith("finance.")
      );
      if (
        (typeof financeReviewerId !== "string" || !financeReviewerId.trim()) &&
        !hasFinancePermission
      ) {
        issues.push(`收款节点 ${node.node_key} 必须选择财务审核人或配置财务确认权限`);
      }
      return issues;
    });
}

function isPaymentCollectionType(value: unknown) {
  return typeof value === "string" && PAYMENT_COLLECTION_TYPES.has(value);
}
