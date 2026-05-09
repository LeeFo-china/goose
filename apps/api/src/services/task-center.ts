import type { AuthContext } from "@/services/authorization";
import { accessPolicyService } from "@/services/access-policy";
import { taskCenterRepository } from "@/repositories/task-center";
import type {
  TaskCenterTodoListQuery,
  TaskCenterTodoType,
} from "@/schema/task-center";

type TaskPriority = "high" | "medium";

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
  target_type: "customer" | "project" | "expense_request";
  target_id: string;
};

function encodeQueryValue(value: string) {
  return encodeURIComponent(value);
}

function formatProjectSubtitle(input: {
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

function getPriorityLabel(priority: TaskPriority) {
  return priority === "high" ? "高优先级" : "中优先级";
}

class TaskCenterService {
  private isExpenseVisible(
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

  private sortTodos(list: TaskCenterTodoItem[]) {
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

  private async buildCustomerFollowUpTodos(authContext: AuthContext) {
    if (
      !authContext.employeeId ||
      !accessPolicyService.hasPermission(authContext, "customer.update")
    ) {
      return [] as TaskCenterTodoItem[];
    }

    const tenantId = accessPolicyService.assertTenantId(authContext);
    const customerIds = await taskCenterRepository.listOwnedCustomerIds(
      authContext.employeeId,
      tenantId,
    );
    const followUps = await taskCenterRepository.listCustomerFollowUpsByCustomerIds(
      customerIds,
    );
    const latestByCustomer = new Map<string, (typeof followUps)[number]>();

    for (const item of followUps) {
      if (!item.customer_id || latestByCustomer.has(item.customer_id)) {
        continue;
      }

      latestByCustomer.set(item.customer_id, item);
    }

    const now = Date.now();
    return Array.from(latestByCustomer.values())
      .filter((item) => item.customer?.id && item.next_follow_at)
      .filter((item) => new Date(item.next_follow_at as string).getTime() <= now)
      .map((item) => ({
        id: `customer_followup:${item.customer!.id}`,
        type: "customer_followup" as const,
        title: "客户待跟进",
        subtitle: item.customer?.name || item.customer?.phone || "未命名客户",
        status: "pending" as const,
        status_label: "待处理" as const,
        priority: "high" as const,
        priority_label: getPriorityLabel("high"),
        due_at: item.next_follow_at,
        created_at: item.created_at,
        action_label: "去跟进",
        target_url: `/packageCustomers/pages/followUpEdit/index?customerId=${item.customer!.id}`,
        target_type: "customer" as const,
        target_id: item.customer!.id,
      }));
  }

  private async buildProjectLogTodos(authContext: AuthContext) {
    if (
      !authContext.employeeId ||
      !accessPolicyService.hasPermission(authContext, "project_log.create")
    ) {
      return [] as TaskCenterTodoItem[];
    }

    const tenantId = accessPolicyService.assertTenantId(authContext);
    const projects = await taskCenterRepository.listOwnedActiveProjects(
      authContext.employeeId,
      tenantId,
    );
    const projectIds = projects.map((item) => item.id);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const logs = await taskCenterRepository.listTodayProjectLogs(
      authContext.employeeId,
      projectIds,
      todayStart.toISOString(),
    );
    const loggedProjectIds = new Set(logs.map((item) => item.project_id));
    const dueAt = new Date();
    dueAt.setHours(23, 59, 59, 999);

    return projects
      .filter((item) => !loggedProjectIds.has(item.id))
      .map((item) => {
        const projectName = item.name || "项目";
        return {
          id: `project_log:${item.id}`,
          type: "project_log" as const,
          title: "补写施工日志",
          subtitle: formatProjectSubtitle({
            name: item.name,
            address: item.address,
            community: item.property?.community || null,
            building_info: item.property?.building_info || null,
          }),
          status: "pending" as const,
          status_label: "待处理" as const,
          priority: "high" as const,
          priority_label: getPriorityLabel("high"),
          due_at: dueAt.toISOString(),
          created_at: item.created_at,
          action_label: "去填写",
          target_url: `/packageProjects/pages/logEdit/index?projectId=${item.id}&projectName=${encodeQueryValue(projectName)}`,
          target_type: "project" as const,
          target_id: item.id,
        };
      });
  }

  private async buildExpenseRequestTodos(authContext: AuthContext) {
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
      .filter((item) => this.isExpenseVisible(visibility, item))
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

        if (
          canApproveFinance &&
          item.status === "pending" &&
          item.current_step === "finance_review"
        ) {
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

        if (
          canPay &&
          item.status === "approved" &&
          item.current_step === "payment"
        ) {
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

  private async buildTodos(authContext: AuthContext) {
    const [customerFollowUps, projectLogs, expenseRequests] = await Promise.all([
      this.buildCustomerFollowUpTodos(authContext),
      this.buildProjectLogTodos(authContext),
      this.buildExpenseRequestTodos(authContext),
    ]);

    return this.sortTodos([
      ...customerFollowUps,
      ...projectLogs,
      ...expenseRequests,
    ]);
  }

  async listTodos(authContext: AuthContext, query: TaskCenterTodoListQuery) {
    let list = await this.buildTodos(authContext);

    if (query.type) {
      list = list.filter((item) => item.type === query.type);
    }

    if (query.status) {
      list = list.filter((item) => item.status === query.status);
    }

    const total = list.length;
    const highPriorityTotal = list.filter((item) => item.priority === "high").length;
    const from = (query.page - 1) * query.pageSize;
    const to = from + query.pageSize;

    return {
      list: list.slice(from, to),
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: total ? Math.ceil(total / query.pageSize) : 0,
      },
      summary: {
        total,
        high_priority: highPriorityTotal,
      },
    };
  }

  async getSummary(authContext: AuthContext) {
    const list = await this.buildTodos(authContext);
    return {
      total: list.length,
      high_priority: list.filter((item) => item.priority === "high").length,
    };
  }
}

export const taskCenterService = new TaskCenterService();
