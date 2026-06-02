import {
  accessPolicyService,
  getPriorityLabel,
  isExpenseVisible,
  taskCenterRepository,
  type AuthContext,
  type TaskCenterTodoItem,
} from "./shared";

export async function buildExpenseRequestTodos(authContext: AuthContext) {
  if (
    !authContext.employeeId ||
    !accessPolicyService.hasPermission(authContext, "expense_request.read")
  ) {
    return [] as TaskCenterTodoItem[];
  }

  const tenantId = accessPolicyService.assertTenantId(authContext);
  const visibility = await accessPolicyService.getVisibleExpenseFilters(
    authContext,
    "expense_request.read",
  );
  const rows = await taskCenterRepository.listExpenseRequestTodos(tenantId);
  const canSubmit = accessPolicyService.hasPermission(
    authContext,
    "expense_request.submit",
  );
  const canApproveManager = accessPolicyService.hasPermission(
    authContext,
    "expense_request.approve_manager",
  );
  const canApproveFinance = accessPolicyService.hasPermission(
    authContext,
    "expense_request.approve_finance",
  );
  const canPay = accessPolicyService.hasPermission(
    authContext,
    "expense_request.pay",
  );

  return rows
    .filter((item) => isExpenseVisible(visibility, item))
    .flatMap((item) => {
      const projectName = item.project?.name?.trim();
      const employeeName = item.employee?.name?.trim();
      const subtitle = projectName || employeeName || item.request_no || "费用申请";

      if (
        canSubmit &&
        item.employee_id === authContext.employeeId &&
        ["draft", "rejected"].includes(item.status)
      ) {
        return [{
          id: `expense_request:${item.id}:submit`,
          type: "expense_request" as const,
          title: item.status === "rejected" ? "费用申请待重新提交" : "费用申请待提交",
          subtitle,
          status: "pending" as const,
          status_label: "待处理" as const,
          priority: "medium" as const,
          priority_label: getPriorityLabel("medium"),
          due_at: item.rejected_at || item.updated_at || item.created_at,
          created_at: item.created_at,
          action_label: "去提交",
          target_url: `/packageEmployees/pages/expenseDetail/index?id=${item.id}`,
          target_type: "expense_request" as const,
          target_id: item.id,
        }];
      }

      if (
        canApproveManager &&
        item.status === "pending" &&
        item.current_step === "manager_review"
      ) {
        return [{
          id: `expense_request:${item.id}:manager_review`,
          type: "expense_request" as const,
          title: "费用申请待主管审批",
          subtitle,
          status: "pending" as const,
          status_label: "待处理" as const,
          priority: "high" as const,
          priority_label: getPriorityLabel("high"),
          due_at: item.updated_at || item.created_at,
          created_at: item.created_at,
          action_label: "去审批",
          target_url: `/packageEmployees/pages/expenseDetail/index?id=${item.id}`,
          target_type: "expense_request" as const,
          target_id: item.id,
        }];
      }

      if (canApproveFinance && item.status === "pending" && item.current_step === "finance_review") {
        return [{
          id: `expense_request:${item.id}:finance_review`,
          type: "expense_request" as const,
          title: "费用申请待财务审批",
          subtitle,
          status: "pending" as const,
          status_label: "待处理" as const,
          priority: "high" as const,
          priority_label: getPriorityLabel("high"),
          due_at: item.updated_at || item.created_at,
          created_at: item.created_at,
          action_label: "去审批",
          target_url: `/packageEmployees/pages/expenseDetail/index?id=${item.id}`,
          target_type: "expense_request" as const,
          target_id: item.id,
        }];
      }

      if (canPay && item.status === "approved" && item.current_step === "payment") {
        return [{
          id: `expense_request:${item.id}:payment`,
          type: "expense_request" as const,
          title: "费用申请待登记打款",
          subtitle,
          status: "pending" as const,
          status_label: "待处理" as const,
          priority: "high" as const,
          priority_label: getPriorityLabel("high"),
          due_at: item.updated_at || item.created_at,
          created_at: item.created_at,
          action_label: "去打款",
          target_url: `/packageEmployees/pages/expenseDetail/index?id=${item.id}`,
          target_type: "expense_request" as const,
          target_id: item.id,
        }];
      }

      return [] as TaskCenterTodoItem[];
    });
}
