import {
  accessPolicyService,
  encodeQueryValue,
  formatProjectSubtitle,
  getPriorityLabel,
  taskCenterRepository,
  type AuthContext,
  type TaskCenterTodoItem,
} from "./shared";

export async function buildCustomerFollowUpTodos(authContext: AuthContext) {
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

export async function buildProjectLogTodos(authContext: AuthContext) {
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
    tenantId,
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
