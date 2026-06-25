import {
  ExpenseApprovalActionConfig,
  type ExpenseApprovalAction,
} from "@gooes/domain";
import type { WorkflowTaskActionMetadata } from "@/services/workflow-task-action-metadata";

export function buildExpenseActions(
  nodeKey: string,
): WorkflowTaskActionMetadata[] {
  if (nodeKey === "manager_review" || nodeKey === "finance_review") {
    return [
      buildExpenseAction("approve", false, [
        { name: "comment", label: "审批意见", type: "string", required: false },
      ]),
      buildExpenseAction("reject", true, [
        { name: "comment", label: "审批意见", type: "string", required: false },
      ]),
    ];
  }

  if (nodeKey === "payment") {
    return [
      buildExpenseAction("pay", false, [
        { name: "payee_name", label: "收款人", type: "string", required: true },
        { name: "payee_bank", label: "收款银行", type: "string", required: false },
        { name: "payee_account", label: "收款账号", type: "string", required: false },
        { name: "method", label: "打款方式", type: "settlement_method", required: true },
        { name: "paid_amount", label: "打款金额", type: "number", required: true },
        { name: "paid_at", label: "打款时间", type: "datetime", required: false },
        { name: "evidence_images", label: "打款凭证", type: "image_list", required: true },
        { name: "remark", label: "支付备注", type: "string", required: false },
      ]),
    ];
  }

  return [];
}

function buildExpenseAction(
  action: ExpenseApprovalAction,
  requiresReason: boolean,
  outputFields: WorkflowTaskActionMetadata["output_fields"],
): WorkflowTaskActionMetadata {
  return {
    key: action,
    label: ExpenseApprovalActionConfig[action].label,
    business_domain: "expense_request",
    business_action: action,
    requires_reason: requiresReason,
    output_fields: outputFields,
  };
}
