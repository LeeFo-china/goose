import type { AuthContext } from "@/services/authorization";
import { accessPolicyService } from "@/services/access-policy";
import type { TaskCenterTodoType } from "@/schema/task-center";
export { accessPolicyService };
export type { AuthContext } from "@/services/authorization";
export { taskCenterRepository } from "@/repositories/task-center";
export { PROJECT_ACCEPTANCE_STAGE_LABELS } from "@gooes/domain";
export type { TaskCenterTodoListQuery } from "@/schema/task-center";

export type TaskPriority = "high" | "medium";
export const TASK_CENTER_SUMMARY_CACHE_TTL_MS = 60_000;

export type TaskCenterTodoItem = {
  id: string;
  type: TaskCenterTodoType;
  title: string;
  subtitle: string;
  status: "pending";
  status_label: "待处理";
  priority: TaskPriority;
  priority_label: string;
  due_at: string | null;
  created_at: string | null;
  action_label: string;
  target_url: string;
  target_type:
    | "customer"
    | "project"
    | "expense_request"
    | "project_acceptance"
    | "customer_service_ticket"
    | "billing";
  target_id: string;
  metadata?: Record<string, unknown>;
};

export type TaskCenterSummary = {
  total: number;
  high_priority: number;
  scope: {
    type: "current_employee";
    tenant_id: string | null | undefined;
    employee_id: string | null | undefined;
  };
};

export type TaskCenterCacheContext = {
  summaryCache: Map<string, {
    expiresAt: number;
    value: TaskCenterSummary;
  }>;
  summaryInFlight: Map<string, Promise<TaskCenterSummary>>;
};

export function encodeQueryValue(value: string) {
  return encodeURIComponent(value);
}

export function formatProjectSubtitle(input: {
  name: string | null;
  address: string | null;
  community: string | null;
  building_info: string | null;
}) {
  const parts = [
    input.name,
    input.community,
    input.building_info,
    input.address,
  ].filter((item) => Boolean(item && item.trim()));

  return parts[0] || "项目待写日志";
}

export function getPriorityLabel(priority: TaskPriority) {
  return priority === "high" ? "高优先级" : "中优先级";
}

export function isExpenseVisible(
  visibility: Awaited<ReturnType<typeof accessPolicyService.getVisibleExpenseFilters>>,
  record: { employee_id: string; assignee_id: string | null },
) {
  if (visibility.type === "all") {
    return true;
  }

  if (visibility.type === "none") {
    return false;
  }

  if (visibility.type === "self") {
    return visibility.employeeIds.includes(record.employee_id);
  }

  return (
    visibility.employeeIds.includes(record.employee_id) ||
    (record.assignee_id ? visibility.employeeIds.includes(record.assignee_id) : false)
  );
}

export function sortTodos(list: TaskCenterTodoItem[]) {
  const priorityWeight: Record<TaskPriority, number> = {
    high: 2,
    medium: 1,
  };

  return [...list].sort((a, b) => {
    if (priorityWeight[b.priority] !== priorityWeight[a.priority]) {
      return priorityWeight[b.priority] - priorityWeight[a.priority];
    }

    const dueA = a.due_at ? new Date(a.due_at).getTime() : Number.MAX_SAFE_INTEGER;
    const dueB = b.due_at ? new Date(b.due_at).getTime() : Number.MAX_SAFE_INTEGER;
    if (dueA !== dueB) {
      return dueA - dueB;
    }

    const createdA = a.created_at ? new Date(a.created_at).getTime() : 0;
    const createdB = b.created_at ? new Date(b.created_at).getTime() : 0;
    return createdB - createdA;
  });
}

export function buildSummaryCacheKey(authContext: AuthContext) {
  return [
    authContext.tenantId ?? "",
    authContext.employeeId ?? "",
    [...authContext.roleCodes].sort().join(","),
    authContext.permissions
      .map((item) => `${item.code}:${item.scope}`)
      .sort()
      .join(","),
  ].join(":");
}
