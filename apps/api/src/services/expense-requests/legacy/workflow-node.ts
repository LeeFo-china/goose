import { Errors } from "@/errors/error-factory";
import { workflowSubjectStateService } from "@/services/workflow-subject-state";

export type ExpenseWorkflowApprovalNodeKey = "manager_review" | "finance_review";
export type ExpenseWorkflowNodeKey = ExpenseWorkflowApprovalNodeKey | "payment";

export type ExpenseWorkflowOperationOptions = {
  workflowNodeKey?: string | null;
};

export function isExpenseWorkflowApprovalNodeKey(
  value: string | null | undefined,
): value is ExpenseWorkflowApprovalNodeKey {
  return value === "manager_review" || value === "finance_review";
}

export function isExpenseWorkflowNodeKey(
  value: string | null | undefined,
): value is ExpenseWorkflowNodeKey {
  return isExpenseWorkflowApprovalNodeKey(value) || value === "payment";
}

export async function resolveExpenseWorkflowNodeKey(input: {
  tenantId: string;
  expenseRequestId: string;
  options?: ExpenseWorkflowOperationOptions;
}): Promise<string | null> {
  const optionNodeKey = input.options?.workflowNodeKey;
  if (typeof optionNodeKey === "string" && optionNodeKey.trim()) {
    return optionNodeKey.trim();
  }

  const state = await workflowSubjectStateService.getSubjectState({
    tenantId: input.tenantId,
    subjectType: "expense_request",
    subjectId: input.expenseRequestId,
  });

  return state?.current_node_key ?? null;
}

export async function resolveExpenseApprovalNodeKey(input: {
  tenantId: string;
  expenseRequestId: string;
  options?: ExpenseWorkflowOperationOptions;
  invalidMessage: string;
}): Promise<ExpenseWorkflowApprovalNodeKey> {
  const nodeKey = await resolveExpenseWorkflowNodeKey(input);
  if (isExpenseWorkflowApprovalNodeKey(nodeKey)) {
    return nodeKey;
  }

  throw Errors.business(
    400,
    input.invalidMessage,
    "EXPENSE_REQUEST_INVALID_TRANSITION",
  );
}
