import {
  accessPolicyService,
  getPriorityLabel,
  taskCenterRepository,
  type AuthContext,
  type TaskCenterTodoItem,
} from "./shared";
import { workflowTaskRepository } from "@/repositories/workflow-tasks";

export async function buildExpenseRequestTodos(authContext: AuthContext) {
  if (
    !authContext.employeeId ||
    !accessPolicyService.hasPermission(authContext, "expense_request.read")
  ) {
    return [] as TaskCenterTodoItem[];
  }

  const tenantId = accessPolicyService.assertTenantContext(authContext);
  const tasks = await workflowTaskRepository.listAccessibleTasks({
    tenantId,
    employeeId: authContext.employeeId,
    roleCodes: authContext.roleCodes,
    permissionCodes: authContext.permissions.map((item) => item.code),
    subjectType: "expense_request",
    status: "pending",
    page: 1,
    pageSize: 100,
  });
  const expenseRequestIds = tasks.list
    .map((task) => task.instance?.subject_id)
    .filter((id): id is string => Boolean(id));
  const rows = await taskCenterRepository.listExpenseRequestsByIds({
    tenantId,
    expenseRequestIds,
  });
  const expenseById = new Map(rows.map((row) => [row.id, row]));

  const todos: TaskCenterTodoItem[] = [];

  for (const task of tasks.list) {
    const subjectId = task.instance?.subject_id;
    if (!subjectId) continue;

    const item = expenseById.get(subjectId);
    const projectName = item?.project?.name?.trim();
    const employeeName = item?.employee?.name?.trim();
    const subtitle = projectName || employeeName || item?.request_no || "费用申请";
    const action = resolveWorkflowTaskAction(task.node_key);

    todos.push({
      id: `workflow_task:${task.id}`,
      type: "expense_request",
      title: action.title,
      subtitle,
      status: "pending",
      status_label: "待处理",
      priority: action.priority,
      priority_label: getPriorityLabel(action.priority),
      due_at: task.due_at || item?.updated_at || task.updated_at,
      created_at: task.created_at,
      action_label: action.actionLabel,
      target_url: `/packageEmployees/pages/expenseDetail/index?id=${subjectId}`,
      target_type: "expense_request",
      target_id: subjectId,
      metadata: {
        workflow_task_id: task.id,
        workflow_instance_id: task.instance_id,
        workflow_node_key: task.node_key,
      },
    });
  }

  return todos;
}

function resolveWorkflowTaskAction(nodeKey: string): {
  title: string;
  actionLabel: string;
  priority: "high" | "medium";
} {
  if (nodeKey === "payment") {
    return {
      title: "费用申请待登记打款",
      actionLabel: "去打款",
      priority: "high",
    };
  }

  if (nodeKey === "finance_review") {
    return {
      title: "费用申请待财务审批",
      actionLabel: "去审批",
      priority: "high",
    };
  }

  if (nodeKey === "manager_review") {
    return {
      title: "费用申请待主管审批",
      actionLabel: "去审批",
      priority: "high",
    };
  }

  return {
    title: "费用流程待处理",
    actionLabel: "去处理",
    priority: "medium",
  };
}
